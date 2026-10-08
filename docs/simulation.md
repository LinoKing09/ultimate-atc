# Simulation model

This page describes how the simulated world behaves: AI pilots, the AI Tower, traffic generation, ground movement, separation, radio and incident detection. All numbers are the values used in the code, so you can predict how traffic will react.

- [Time](#time)
- [Aircraft life cycle](#aircraft-life-cycle)
- [Ground movement](#ground-movement)
- [Pilot see-and-avoid](#pilot-see-and-avoid)
- [AI pilots: communication](#ai-pilots-communication)
- [Delivery, A-CDM and slots](#delivery-a-cdm-and-slots)
- [A-SMGCS](#a-smgcs)
- [AI Ground](#ai-ground)
- [AI Tower](#ai-tower)
- [Runway incursions and go-arounds](#runway-incursions-and-go-arounds)
- [Collisions](#collisions)
- [Traffic generation](#traffic-generation)
- [Radio model](#radio-model)
- [Weather and ATIS](#weather-and-atis)
- [Special events](#special-events)

---

## Time

- The simulation advances in fixed **0.2 s steps**. Rendering is independent of the simulation rate.
- The **simulation rate** (1x / 2x / 4x / 8x) multiplies the real elapsed time. A frame delta is capped at 0.5 s (and a single `tick` at 5 s), so a backgrounded browser tab doesn't cause huge jumps.
- Simulation time starts at the real current UTC time.
- A seeded pseudo-random generator (mulberry32) drives every random decision. **The same seed and settings always give the same scenario**, as long as the controller's inputs are the same. A scenario code adds a fixed runway, traffic mix, more heavies and scheduled events, see [scenarios.md](scenarios.md).

## Aircraft life cycle

### Departures

```
parked: clearance request --(IFR clearance)--> start-up request --(start-up approved)--> frequency request --(contact ground)--> [Ground]
parked --(pushback approved)--> pushback --(push complete)--> startup --(engines running)--> taxi
   |                                                                                         |
   +--(taxi, on a taxi-out stand)----------------------------------------------------------->+
                                                                                              |
taxi --(reaches destination holding point)--> holding --(contact Tower)--> [Tower]: lineup --> takeoff --> climb --> gone
```

| Step                | Timing / behaviour                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Boarding            | A departure appears on a free stand. Its **ready time** (TOBT) is 4-15 min after it appears (initial traffic 0.5-25 min). |
| Delivery            | With Delivery staffed by you, it starts on Delivery frequency without a clearance: see [Delivery, A-CDM and slots](#delivery-a-cdm-and-slots). Otherwise it already has its clearance and starts on Ground. |
| Pushback call       | On Ground: at the ready time, or with A-CDM at **TSAT - 2 min** unless start-up was already approved by Delivery (then at the ready time, at the earliest 20 s after the hand-off). |
| Tug connection      | 6-15 s after the pushback approval, the push starts.                                       |
| Pushback            | 1.3 m/s (~2.5 kt) backwards along the stand lead-in line, then 45 m (at most 90% of the taxilane segment) along the taxilane. Drive-through stands have no pushback: the aircraft calls `request taxi` and leaves forwards. |
| Engine start        | After the push: 15-35 s with *push and start* or *start-up approved*, otherwise 40-80 s.    |
| Ready for taxi      | The pilot calls `ready for taxi`. A taxi instruction received earlier is executed now.      |
| Holding point       | When stopped at the destination holding point, the aircraft reports `ready for departure` after 8 s if it is still on your frequency. |
| Tower               | After the hand-off, Tower sequences the departure (see [AI Tower](#ai-tower)).              |
| Leaving             | The aircraft is removed when it is 4000 ft above the airport or 15 km away. This counts as `departuresAirborne`. |

### Arrivals

```
approach --(touchdown)--> landing --(passes exit holding point)--> vacating --(stops behind holding point)--> taxi (on Ground)
taxi --(reaches stand)--> arrived --(150-300 s)--> gone
```

| Step                | Timing / behaviour                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Final approach      | Appears 9 NM from the threshold (initial traffic: 4-6 NM), at its approach speed on a 3° glide path. |
| Touchdown           | 350 m past the landing threshold.                                                           |
| Roll-out            | Brakes at 1.6 m/s² to reach the chosen exit at 25 kt (rapid exit) or 14 kt (normal exit).   |
| Exit choice         | The first exit that can be reached at that deceleration. 85% prefer the north side, 15% the south side. Exits whose vacate point is blocked by a waiting aircraft (within 70 m) are skipped. |
| Vacated             | Stops between the holding point and the parallel taxiway, switches to Ground, and calls `vacated runway 25 via E` after a short delay. |
| Stand               | A suggested stand is allocated when the arrival appears (if one is free). You can use any free stand that is big enough and not blocked by a neighbour. |
| Turn-around         | 150-300 s after parking, the aircraft is removed and the stand becomes free.                |

## Ground movement

Aircraft follow **paths**: polylines through taxi graph nodes whose corners are replaced by smooth curves (fillet radius up to 30 m on taxi routes). The aircraft's position is a distance `s` along the path. Its heading is the path's tangent, reversed during pushback.

**Speed control** (taken every step as the minimum of all limits):

| Limit                    | Value                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| Straight taxi speed      | Aircraft type, 14-18 kt (+5 kt after `expedite taxi`)                    |
| Upcoming turn > 15°      | 14 kt                                                                    |
| Upcoming turn > 35°      | 11 kt                                                                    |
| Upcoming turn > 70°      | 7 kt                                                                     |
| Next stop (holding point, hold short, destination) | Speed that allows stopping at 1.0 m/s²         |
| Traffic ahead            | Speed that allows stopping at 1.2 m/s² before the traffic                |
| Hold position / give way / stopped at a stop | 0                                                    |
| Landing roll-out, line-up | Profile set by the Tower                                                |

Acceleration is 0.6 m/s². Braking is up to 2.5 m/s².

**Stops** on a taxi route are computed when the route is assigned:

| Stop          | Where                                                                              | Released by                    |
| ------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| `runway`      | Every runway holding position where the route continues **towards** the runway, unless a crossing clearance was given | `cross runway ..`, or a new route with crossing |
| `holdShort`   | ~40 m before the node where the route joins or crosses the named taxiway           | `continue taxi`                |
| `destination` | End of the route (holding point, stand)                                            | A new taxi instruction         |

**Route finding** is described in [architecture.md](architecture.md#taxi-routing). Routes never contain turns sharper than **150°** at a junction (a hairpin from a rapid exit back onto the parallel taxiway, at about 143°, is still possible). A route that needs the aircraft to turn around where it stands is only used if nothing else works: the router adds 5000 m of cost for it. A node behind the aircraft counts as "turning around" even if it is only a few metres away.

**No 180 degree turns for airliners**: for aircraft with a wingspan above **25 m**, routes that need a turn-around where the aircraft stands are refused (`unable, we are facing west and cannot turn around here`). Exceptions: at a runway holding point, and when the aircraft has been stuck (blocked by traffic or with a `blocked` request) for more than **30 s** at a speed below 0.2 m/s. In that case it waits **300-600 s for a tug** (ordering it, connecting, turning the aircraft) before it starts moving; the read-back says how long (`we need a tug to turn around, expect about 7 minutes`). Aircraft up to 25 m wingspan can always turn around.

**Cancelled pushback**: if the aircraft has already moved, the tug tows it back along the same line onto the stand. It is then parked again and calls 60-150 s later.

**Automatic routes** (no `via` list: pilots' own choice, menu suggestions, pushback direction) also follow the airport's **standard taxi flows** for the runway in use: they never taxi against a flow if there is any other route that doesn't need a 180 degree turn; only then a route against the flow is allowed (at 4 times the distance cost). They avoid runway crossings (3000 m extra cost per crossing).

## Pilot see-and-avoid

Pilots don't collide on purpose. Every step, each aircraft that is moving along a path looks ahead along its **own path** by (this includes landing aircraft on their exit)

```
look-ahead = v² / (2 · 1.2 m/s²) + 55 m + own length
```

and checks whether another ground aircraft **ahead of it** (traffic behind or exactly beside it is ignored, because moving on only increases the distance) is (or, if it is moving, will be within 4 s) closer to the path than

```
r = 0.38 · (wingspan A + wingspan B) + 6 m        (two A320s: ~33 m)
```

If so, it plans to stop `max(5 m, (length A + length B)/2 + 12 m - r)` before that point. This keeps in-trail traffic about 15 m nose-to-tail.

**Crossing and merging traffic**: in addition, each aircraft compares its path with the next 150 m of the path of every other aircraft that intends to move (within 600 m). Where the two paths come closer than `r` at an angle of at least 20 degrees, the aircraft that would reach that point **later** (distance / speed, with a minimum speed of 2 m/s) stops `own length / 2 + 10 m` before it, outside the other one's lane. The decision is kept until the conflict is over, so the two don't take turns braking. Traffic coming from behind in the same direction whose path runs through the aircraft's current position is following it and is never given priority. Each aircraft checks the next **400 m** of the other aircraft's path, so it stops early enough where taxiways meet at a shallow angle (for example arrivals from rapid exit F crossing S).

**Mutual conflicts**: if two aircraft each see the other on their path (for example converging at an intersection), the one **closer** to the conflict point continues and the other waits. Nobody drives into an aircraft that actually stands on its path: if only one of them has the other physically in its way, that one waits and the other goes. If both have the other physically in their way, or both are stopped nose to nose, nothing moves. This is a **deadlock**: after 60 s the pilots report `we have opposite traffic ahead, request instructions`, and you have to re-route one of them (after 30 s stuck, airliners accept a route that needs a tug to turn around, see above).

**Waiting aircraft blocking others**: an aircraft that stands still waiting for an instruction (at a clearance limit, a hold-short, a vacate point, or with an open request) and blocks another aircraft for more than 60 s makes the blocked pilot call: `we are blocked by X, waiting on the taxiway ahead, request instructions`. The EDDS vacate points are placed so that an aircraft waiting there does not block the parallel taxiway S.

**Give way and conditional clearances**: an aircraft told to `give way to X`, or given a conditional clearance (`behind X, ...`), waits until X **has passed**. That means X is airborne or gone, or its distance has grown at least 40 m beyond the closest distance so far and is larger than half the combined wingspans plus 40 m. It also continues if X stopped more than 300 m away (after 20 s), or after 4 minutes at the latest.

## AI pilots: communication

Pilots only talk on the frequency they are tuned to. Aircraft with Tower are silent for you.

**Requests** (`request` state, shown in the `REQ` column):

| Request    | Raised when                                                                   | Answered by                              |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| `pushback` | Departure ready on a pushback stand                                           | `pushback approved` / `push and start approved` |
| `taxi`     | Engines running after pushback, or ready on a taxi-out stand                  | Any taxi instruction                     |
| `taxiIn`   | Arrival has vacated                                                           | Taxi instruction to a stand              |
| `handoff`  | Departure at the holding point for 8 s and still on Ground                    | `contact tower`                          |
| `crossing` | Stopped at a runway holding point on the route                                | `cross runway ..`                        |
| `blocked`  | Head-on / mutual deadlock, or behind an aircraft waiting for instructions, for 60 s (cleared automatically once the aircraft moves again) | `hold position`, `give way`, a new route |
| `route`    | Held short of a taxiway for 2 min, a taxi instruction became invalid, or Tower sent the aircraft back | `continue taxi`, a new route |
| `clearance` | On Delivery, 10 min before the ready time (by voice, or silently by DCL)     | IFR clearance (or *Send DCL*)            |
| `startup`  | On Delivery, cleared: at TSAT - 2 min with A-CDM, otherwise at the ready time | `start-up approved`                      |
| `frequency` | On Delivery, start-up approved, 20 s after the last call                     | `contact ground`                         |

**Reminders**: DCL requests are not repeated by voice. If a request isn't answered, the pilot calls again every 60-89 s (a fixed interval per callsign), up to 5 times. These count as an answer for the waiting-time statistics and suppress reminders:

- `standby`: for 120 s,
- `number N for ...`: for 60 s + 45 s per queue position,
- `expect ... in N minutes`: for N minutes + 20 s.

**Answering** a request records the waiting time (time since the first call). Every 15 s of waiting beyond 30 s costs one point.

**Taxiway restrictions**: taxiways and taxilanes can have a maximum wingspan (EDDS: taxilane M east of H, code C). Routes for larger aircraft avoid them.

**Stand suitability**: a stand can take an aircraft only if its wingspan is within the stand's maximum **and** there is enough wingtip clearance to the aircraft on (or taxiing to, or reserved for) the neighbouring stands: the stand centres must be at least `(span A + span B) / 2 + clearance` apart, with a clearance of **4.5 m** between code C aircraft (wingspan below 36 m) and **7.5 m** when one of them is code D or larger (ICAO Annex 14). So a wide-body on a large stand can block the smaller stand next to it. This applies to the automatic stand allocation and the stand menu. Crews accept your instruction to any stand their aircraft fits; **150 m before the stand** they see whether it is usable. If an aircraft stands on it (parked) or a parked neighbour is too close, they stop and call `stand 14 is occupied, request another stand` (request `route`). If the aircraft there is moving (pushing back, starting up, or taxiing onto the neighbouring stand), they hold without a call and continue once it is clear.

**Validation**: pilots check instructions against their state and the airport data. They reply `unable ...` or `confirm ...` instead of doing something impossible: an unknown taxiway or holding point, an impossible route, a stand too small for the aircraft (an occupied stand is only noticed when taxiing in, see *Stand suitability*), a crossing that isn't on the route, a wrong frequency, a hand-off before taxiing. See [phraseology.md](phraseology.md#pilot-read-backs-and-replies).

## Delivery, A-CDM and slots

Source: `src/core/delivery.ts`.

| Item | Value |
| ---- | ----- |
| Clearance request | 10 min before the ready time (TOBT); immediately if the aircraft appears later than that |
| DCL equipped | 40 % of the departures with an airline callsign (not German-registered `D-xxxx` aircraft), when DCL is on |
| Initial climb | from the airport data (`initialClimbFt`, EDDS 5000 ft - a simulator value); 5000 ft if not set |
| Squawk codes | next free code from the octal blocks 2101-2177, 2201-2277, 2301-2377, 2401-2477 (codes ending in 0 skipped; a simulator range, not the real ORCAM allocation). Special codes 7500, 7600, 7700, 7000, 2000, 1000, 0000 are refused |
| Readback error | 4 % of voice clearances: two digits of the squawk read back swapped. Caught with `squawk <correct code>` (+5); passed with `readback correct` or a hand-off it stays: the crew sets the wrong code (-10) |
| Crew queries | missing or unknown clearance limit, wrong destination, missing or unknown SID, SID of the wrong runway (`information R says runway 25 in use`) or not leading to the first fix of the flight plan, wrong runway, missing initial climb, missing or invalid squawk |
| Start-up | needs the IFR clearance (`negative, we have no clearance yet`) |
| Hand-off to Ground | needs the IFR clearance; counts as *clearance delivered* (+10) |
| CTOT | 12 % of the departures; CTOT = ready time + 10 min taxi time + 5-25 min, rounded to the minute |
| CTOT window | take-off from CTOT - 5 min to CTOT + 10 min. Tower lines a CTOT flight up only when it can be airborne inside the window (others go first). After CTOT + 10 min the flight gets a new CTOT 20-40 min later (-10) |

**A-CDM pre-departure sequencer** (every 5 s, when A-CDM is on): every parked departure without start-up approval gets a **TSAT** - not before its ready time, not before CTOT - 10 min (taxi time), rounded up to the minute and at least **90 s** from every other TSAT. A TSAT once issued is kept while it is still valid. Start-ups already approved (and aircraft off-block) keep their slot. Crews call for start-up (on Delivery) or pushback (on Ground) 2 minutes before their TSAT. Without A-CDM there is no TSAT: crews call when ready.

## A-SMGCS

Source: `src/core/conflicts.ts`. Each service can be switched off in the [systems window](systems.md).

| Service | Behaviour |
| ------- | --------- |
| Surveillance | Data tags on the scope (off: no tags) |
| RMCA | Checked every step. Alert when a taxiing aircraft (above 0.5 m/s) with a clearance to cross comes within **120 m** of the runway holding position while the runway is occupied or an arrival is less than **60 s** from the threshold. One alert per aircraft and holding point |
| CATC | Every 5 s, the cleared routes (next **900 m**, sampled every 15 m) of all taxiing aircraft are compared; two routes that meet at more than **135 degrees** are a head-on conflict (only reported if one of the aircraft is on your frequency). The same check runs on the route in the command-line preview and in the *Taxi to* menu |
| Routing | Route proposals in the menus; *Resolve conflict* options |

**Resolve conflict options**: for each of the two aircraft (on your frequency), a route to its destination that avoids the other aircraft's next 150 m of route; it is checked to keep clear of the other aircraft's future route (from the second segment on). If there is no such route, a route with a turn-around (tug, 300-600 s) that stays clear of the other aircraft.

## AI Ground

When you don't staff Ground (for example when you work Delivery alone), the AI Ground acts every 5 s, silently on its own frequency: it approves push and start for cleared departures at their ready time when no other aircraft taxis or pushes within 250 m (taxi-out stands: taxi), taxis them to the runway in use after start-up, hands them to Tower at the holding point, taxis arrivals to their allocated (or the first suitable free) stand, and resolves head-on conflicts after 40 s with the first *Resolve conflict* option.

## AI Tower

Tower owns the runway. Its rules are a simplified model of ICAO PANS-ATM practice; the reasoning and the sources are in [tower-operations.md](tower-operations.md). Each step it:

1. **Flies arrivals** down the final approach and lands them (see above).
2. **Sequences departures**: candidates are aircraft on Tower frequency waiting at a holding point, in the order they reached it. Only one aircraft lines up at a time. The first one may **line up** ("line up and wait") when
   - nobody is inside the runway area, except a departure that is already rolling, or a landing aircraft that is more than 300 m past the departure's entry point ("behind the landing traffic, line up"),
   - its departure separation will be met within 45 s (see below),
   - no arrival with an emergency is within 8 NM,
   - the next arrival is far enough out: its time to the threshold must exceed `35 s (line-up) + max(5 s, remaining departure separation, time until the landing aircraft ahead has vacated) + roll time + 15 s`. The roll time is `Vr / 2.0 m/s² + 12 s`, about 50 s for an A320.
3. **Lines up** the aircraft: it moves onto the runway at 9 kt and stops 50 m along the runway heading. If less than 1500 m of runway would remain (an aircraft sent to a holding point at the wrong end), Tower sends it back to Ground.
4. **Take-off** ("ready for immediate departure"): 3-8 s after lining up, when
   - nobody else is in the runway area, the preceding departure is airborne, and the preceding landing aircraft has vacated,
   - **departure separation** is met, measured from the moment the previous departure became airborne:
     - **2 minutes behind a heavy** (wake turbulence; 3 minutes if this departure starts from an intersection),
     - otherwise **2 minutes** if both use the same departure route (same first SID fix) and **1 minute** if the routes diverge,
   - the next arrival is more than `roll time + 8 s` from the threshold (about 2 NM).

   The aircraft then accelerates at 2.0 m/s². At its rotation speed it becomes airborne, climbs at its climb rate, and accelerates to 200 kt.
5. **Stranded departures**: a departure on Tower frequency that has stopped short of the holding point (a hold-short or a clearance limit, for example after `hold short of taxiway A` instead of `taxi to holding point A`) for **15 s** is handled by Tower: at a hold-short on a route that continues, Tower lets it continue; at a clearance limit, Tower taxis it to the runway in use itself if the holding point is at most **600 m** away without turning around, otherwise it sends the aircraft back to you (`Tower sent us back to you, ... request taxi`). A message in the message window tells you what Tower did. (Only while you are not Tower yourself.)
6. **Crossings for its own traffic**: aircraft already handed to Tower that stop at a runway holding point on their route get a crossing as soon as the runway is free and the next arrival is more than 90 s away.

The **runway area** used for occupancy checks extends 70 m either side of the centre line (the holding positions are at 95 m) and 60 m beyond each runway end.

**Arrival spacing** (provided by the simulated Approach controller, see [traffic generation](#traffic-generation)): at least the wake turbulence minimum, and wider gaps when departures are waiting, so that one departure fits between two arrivals.

## Runway incursions and go-arounds

- **Runway incursion**: a taxiing aircraft (phase `taxi`) enters the runway area while an arrival is within 2.5 NM, or while another aircraft is lining up, taking off or landing. Taxiing aircraft only enter the runway area with a crossing clearance, so every incursion is caused by a crossing clearance given at the wrong moment. **-50 points.**
- **Go-around**: an arrival inside **0.5 NM** goes around if
  - any aircraft is on the ground inside the runway area: lined up, crossing, or a preceding landing aircraft that hasn't vacated yet,
  - except a departure on its take-off roll that is already beyond 1200 m or faster than 100 kt. That departure will be airborne and beyond 2400 m when the arrival crosses the threshold, which is the reduced runway separation rule.

  It climbs away, is removed, and is reported together with the aircraft that blocked the runway. **-15 points.**

## Collisions

Two ground aircraft whose reference points come closer than `0.25 · (wingspan A + wingspan B)`, with at least one of them moving, have collided. Both stop permanently and are drawn red. **-100 points.** With pilot see-and-avoid active, collisions are rare. They mostly happen when a pushback is approved into an aircraft that is already in the way.

## Traffic generation

| Density  | Departures / hour | Arrivals / hour |
| -------- | ----------------: | --------------: |
| light    | 8                 | 7               |
| medium   | 14                | 12              |
| heavy    | 22                | 18              |

- **Initial situation**: about 55% of an hour's departures are already parked at stands, with ready times spread over the first 25 minutes (the first one calls after 5-20 s). One arrival is on a 4-6 NM final.
- **New departures** appear at exponentially distributed intervals (a Poisson process) with the mean given by the rate.
- **New arrivals** follow the same kind of process. A new arrival is only released onto the final (at 9 NM) when the distance to the previous arrival is at least the **required spacing**, which is the larger of:
  - the **wake turbulence minimum**: 3 NM normally; 4 NM heavy behind heavy, 5 NM medium behind heavy, 6 NM light behind heavy, 5 NM light behind medium (larger values behind an A380, category J),
  - the **runway spacing**: 4 NM when no departures are waiting, **6 NM** when at least one departure is holding or taxiing to a holding point, **8 NM** with four or more. These are the "departure gaps" Approach gives on request.
- **Operators, types and destinations** come from the airport's `traffic` data (see [airport data format](airport-data.md#traffic)), weighted by each operator's share. At EDDS this follows the real airline shares (Eurowings about 40 %, SunExpress 8 %, TUIfly 6 %, Pegasus and the Lufthansa group 5 % each, Turkish 5 %, Condor 4 %, British Airways 4 % ...) and the busiest destinations (Palma, Antalya, Istanbul, Pristina, London, Barcelona, Berlin, Hamburg); see [EDDS](airports/EDDS.md#traffic). Airports without traffic data use the global list in [`src/data/airlines.ts`](../src/data/airlines.ts).
- **Callsigns** are unique within a session: alphanumeric (`EWG7TK`), numeric (`THY1734`) or registrations (`DCMGB`), depending on the operator.
- **Flight plans** contain the destination, a SID for the active runway (placeholder names), cruise level and a squawk.
- **Stands**: the smallest free stand that fits the wingspan on Apron North (and, see below, has enough wingtip clearance to its neighbours). Business jets prefer stands 60-65, airlines the others. Apron South (cargo) is only used when Apron North is full.

## Radio model

- There is **one frequency** (yours). A transmission takes `0.8 s + 0.32 s per word`.
- Your transmissions go out immediately and occupy the frequency.
- Pilot transmissions are queued. They start when the frequency is free, plus a 0.6 s gap. **Read-backs** (priority 10) go before **new calls** (priority 0).
- Read-backs start 0.8-2.2 s after your transmission. Spontaneous calls are delayed by 0.3-2.5 s.
- Queued transmissions that wait too long are dropped (45 s for calls, 60 s for read-backs). The pilot then repeats the call later.
- When you transmit to a pilot, their queued (not yet spoken) call is cancelled: they listen first.
- A frequency change takes effect when the read-back has been transmitted.

## Weather and ATIS

- **Wind** is drawn at session start: 70% westerly (220-290°), 30% easterly (040-110°), 3-14 kt.
- **Runway in use** at session start: the first runway of the airport (25 at EDDS), unless it has more than 3 kt tailwind; then the runway with the most headwind.
- **QNH** 1003-1028 hPa.
- **Observed wind** (the toolbar): the actual surface wind. It equals the ATIS wind until a scenario **wind shift** turns it to the opposite direction (9-15 kt); broadcasting an ATIS with a wind sets it as well. The ATIS editor is pre-filled with it.
- **ATIS** starts at a random letter. It only changes when **you** broadcast a new ATIS in the ATIS editor. Pilots quote the current letter on first contact.
- **Runway change** (via the ATIS):
  - Departures that are parked, pushing back or starting up and have no taxi instruction yet get the new runway, and a SID with the same first fix for the new runway.
  - Arrivals further out than 3.5 NM are moved onto the new final (Approach re-sequences them, at least 6 NM out).
  - Arrivals closer in land on the old runway; Tower doesn't line anyone up until they have landed.
  - Taxiing departures keep their clearance.

## Special events

Enabled with **Special events** in the Connect dialog or the in-game settings (default on). All of them are rare:

| Event                          | Chance                          | What happens                                                                 |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------------------------- |
| Medical emergency, arrival     | 2% of arrivals                  | Declared on final (system message). Lands with priority: no line-ups while it is within 8 NM. After vacating, the pilot calls `PAN PAN, medical emergency ..., request expedited taxi to the stand`. |
| Medical emergency, departure   | 1% of departures                | 40 s after starting to taxi, the pilot calls `PAN PAN ... request immediate return to the stand`. A stand is suggested; give it a route back (`taxi to stand ...`). |
| Rejected take-off              | 1.5% of take-offs               | The take-off is aborted at 60-110 kt. The aircraft brakes at 3 m/s², vacates at the next usable exit and calls you. 60% want to return to a stand (technical problem), 40% request taxi for another departure. The runway is blocked meanwhile, so arrivals may have to go around. |

**Scheduled events** from a scenario code happen at fixed minutes, whether random events are on or not: the next arrival declares a medical emergency, the earliest-ready departure on your frequency gets one 40 s after it starts taxiing (retry every 30 s if there is none), the next take-off is rejected, or the wind shifts. See [scenarios.md](scenarios.md#scheduled-events).

**Traffic mix** of a scenario: a departure push multiplies the departure rate by 1.6 and the arrival rate by 0.5, an arrival rush the other way round. With **more heavies**, each new flight is a wide-body with a 35% chance.

A medical emergency counts as handled when the aircraft reaches a stand. Within **6 minutes** of the emergency call, that earns a **+15 point bonus**. Emergency aircraft are shown with `PAN` and a flashing magenta symbol and tag.
