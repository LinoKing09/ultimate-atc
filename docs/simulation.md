[Documentation](README.md) › Simulation model

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
- [Ground vehicles](#ground-vehicles)
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
- Simulation time starts at the real current UTC time (or the start time of a scenario code).
- **Take over** start (Connect dialog): before the session begins, the simulator runs every position itself for **20 minutes** (`HANDOVER_S` = 1200 s) of simulated traffic. The clock is set back by those 20 minutes, so it shows the chosen start time when you take over, and scheduled scenario events move 20 minutes later. Then your positions are handed to you: score, statistics, messages, incidents and the A-CDM flow counters are reset, the debriefing counts from the take-over, and every aircraft on your frequencies with a pending request calls again (staggered, the first within about a minute). An **empty airport** start skips this warm-up.
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
| Pushback            | 1.3 m/s (~2.5 kt) backwards along the stand lead-in line, then 45 m (at most 90% of the taxilane segment) along the taxilane. Without a `facing` the crew faces the shortest way to its runway that follows the standard taxi flows (an apron lane used one way, Phuket T1 / T2), else the shortest way at all; a direction that would need a 180 degree turn afterwards (towards the dead end of a taxilane) only if there is no other. A pushback stand at the dead end of a taxilane is pushed back from the node before the dead end (OSM layouts, `buildLayout`). Drive-through stands have no pushback: the aircraft calls `request taxi` and leaves forwards. |
| Engine start        | After the push: 15-35 s with *push and start* or *start-up approved*, otherwise 40-80 s.    |
| Ready for taxi      | The pilot calls `ready for taxi`. A taxi instruction received earlier is executed now.      |
| Holding point       | When stopped at the destination holding point, the aircraft reports `ready for departure` after 8 s if it is still on your frequency. |
| Tower               | After the hand-off, Tower sequences the departure (see [AI Tower](#ai-tower)).              |
| Leaving             | The aircraft stays on the scope until it is **10 NM** from the airport (about the extent of the Stuttgart control zone along the runway axis); then it is removed and counted as `departuresAirborne`. Passing 4000 ft above the airport (or 15 km) still on Tower frequency is a missed hand-off. |

### Arrivals

```
approach --(touchdown)--> landing --(passes exit holding point)--> vacating --(stops behind holding point)--> taxi (on Ground)
taxi --(reaches stand)--> arrived --(150-300 s)--> gone
```

| Step                | Timing / behaviour                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Final approach      | Appears 12 NM from the threshold (initial traffic: 4-6 NM) on a 3° glide path and flies the speed profile below, on **Approach** frequency (Langen Radar); Approach hands it to Tower at 8-10 NM (typical hand-off once established on the ILS; no published value). |
| Touchdown           | 350 m past the landing threshold.                                                           |
| Roll-out            | Brakes at 1.2-2.0 m/s² (every crew differently) to reach the chosen exit at 20-28 kt (rapid exit) or 11-16 kt (normal exit) and keeps that speed on the exit until it is behind the runway holding point (the runway is then free), then slows down at 1 m/s² to 10 kt; one in five passes the first exit it could make and rolls on to the next. |
| Exit choice         | The first exit that can be reached at that deceleration. 85% prefer the north side, 15% the south side. Exits whose vacate point is blocked by a waiting aircraft (within 70 m) or where an aircraft stands at the holding point are skipped. Exits from which the aircraft can taxi on to its stand without turning around come first - without an assigned stand: to one of the 4 nearest free stands that fit (or, with none free, of all stands that fit); if none ahead does, it backtracks to an exit marked for it that does (Sylt D for runway 32: F and the north apron are too narrow for airliners). If no exit can be made at all, the last one is taken, the one towards a stand first. Of the branches of one exit (the same runway node, e.g. Leipzig S4 west or east onto T) it takes the one with the shorter way to the stand. A landing aircraft that waits on the runway for more than **15 s** because an aircraft stopped at the holding point of its exit (for example one waiting to cross there) takes another exit. |
| Vacated             | Stops with its tail at least 5 m behind the runway holding point and, where it can, with its nose **40 m** from the centre line of the taxiways ahead (OSM layouts) - so traffic on the parallel taxiway passes and it can turn either way; switches to Ground and calls `vacated runway 25 via E` after a short delay. |
| Stand               | A suggested stand is allocated when the arrival appears (if one is free). You can use any free stand that is big enough and not blocked by a neighbour. |
| Turn-around         | 150-300 s after parking, the aircraft is removed and the stand becomes free.                |

## Ground movement

Aircraft follow **paths**: polylines through taxi graph nodes whose corners are replaced by smooth curves (fillet radius up to 30 m on taxi routes). The aircraft's position is a distance `s` along the path. Its heading is the path's tangent, reversed during pushback.

**Speed control** (taken every step as the minimum of all limits):

| Limit                    | Value                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| Straight taxi speed      | Aircraft type, 14-18 kt, times the crew's own **taxi pace** (0.85-1.15, drifting ±5 % along the way) (+5 kt after `expedite taxi`) |
| Upcoming turn > 15°      | 14 kt                                                                    |
| Upcoming turn > 35°      | 11 kt                                                                    |
| Upcoming turn > 70°      | 7 kt                                                                     |
| Next stop (holding point, hold short, destination) | Speed that allows stopping at 1.0 m/s² times the taxi pace |
| Traffic ahead            | Speed that allows stopping at 1.2 m/s² before the traffic                |
| Hold position / give way / stopped at a stop | 0                                                    |
| Landing roll-out, line-up | Profile set by the Tower                                                |

Acceleration is 0.6 m/s² times the taxi pace. Braking is up to 2.5 m/s². The taxi pace applies while taxiing only (not to line-up and roll-out) and is derived from the session seed and the callsign without drawing from the simulation's random sequence (`Simulation.variation`).

**Stops** on a taxi route are computed when the route is assigned:

| Stop          | Where                                                                              | Released by                    |
| ------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| `runway`      | Every runway holding position where the route continues **towards** the runway, unless a crossing clearance was given | `cross runway ..`, or a new route with crossing |
| `holdShort`   | At the intermediate holding position of the charts before the junction (nose at the line; OSM `holding_position:type=intermediate`, at most 250 m before it and with no other junction in between), otherwise where the nose is **40 m** from the centre line of the named taxiway - measured from where the route leaves its taxiway, so short unnamed fillets of the junction count as part of it | `continue taxi`                |
| `destination` | End of the route (holding point, stand)                                            | A new taxi instruction         |

**Route finding** is described in [architecture.md](architecture.md#taxi-routing). Routes contain no turns sharper than **150°** along a taxiway or onto an unnamed link. From one named taxiway onto another (e.g. off a rapid exit back against the landing direction, where OpenStreetMap lacks the fillet) up to **175°** is possible: a `via` route takes it at 20 m of extra cost per degree beyond 150°, an automatic route only if there is no other way (20 000 m).

**Lenient via lists**: a `via` list that leaves out connecting taxiways is not refused. If the exact route fails, the crew fills the gaps with other taxiways (3 times the cost, never across a runway): at most **2** added taxiways and **600 m** between the named ones, and after the last named one at most one taxiway on to the destination, however long (`taxi to runway 08L via N, E7`: on along C). The read-back then names the whole route (`taxi to holding point A via M, L2, S`), so you hear what the crew will do. For `taxi to runway`, an entry reached with the route as given comes before one that needs added taxiways. A route that needs the aircraft to turn around where it stands is only used if nothing else works: the router adds 5000 m of cost for it. A node behind the aircraft counts as "turning around" even if it is only a few metres away.

**No 180 degree turns for airliners**: for aircraft with a wingspan above **25 m**, routes that need a turn-around where the aircraft stands are refused (`unable, we are facing west and cannot turn around here`). Exceptions: at a runway holding point, and when the aircraft has been stuck (blocked by traffic or with a `blocked` request) for more than **30 s** at a speed below 0.2 m/s. In that case it waits **300-600 s for a tug** (ordering it, connecting, turning the aircraft) before it starts moving; the read-back says how long (`we need a tug to turn around, expect about 7 minutes`). Aircraft up to 25 m wingspan can always turn around.

**Cancelled pushback**: if the aircraft has already moved, the tug tows it back along the same line onto the stand. It is then parked again and calls 60-150 s later.

**Automatic routes** (no `via` list: pilots' own choice, menu suggestions, pushback direction) also follow the airport's **standard taxi flows** for the runway in use: they never taxi against a flow if there is any other route that doesn't need a 180 degree turn and doesn't cross a runway more often; only then a route against the flow is allowed (at 4 times the distance cost). They avoid runway crossings (3000 m extra cost per crossing). Where the airport names its crossing points (Stuttgart: only between K and Y), crossings elsewhere cost another 20 000 m, so they happen only if there is no other way (e.g. K or Y closed); taxiways reserved for others (Stuttgart Z, military) cost 20 000 m extra too. The lead lines of de-icing pads are only used to enter or leave a pad, with turns of at most 100° onto and off them.

## Pilot see-and-avoid

Pilots don't collide on purpose. Every step, each aircraft that is moving along a path looks ahead along its **own path** by (this includes landing aircraft on their exit)

```
look-ahead = v² / (2 · 1.2 m/s²) + 55 m + own length
```

and checks whether another ground aircraft **ahead of it** (traffic behind or exactly beside it is ignored, because moving on only increases the distance) is (or, if it is moving, will be within 4 s) closer to the path than

```
r = 0.38 · (wingspan A + wingspan B) + 6 m        (two A320s: ~33 m)
r = 0.3 · (wingspan A + wingspan B) + 4 m         (passing an aircraft parked on its stand; two A320s: ~25 m)
```

An aircraft parked on its stand is passed closer: the apron is laid out for it, only wingtip clearance counts.

If so, it plans to stop `max(5 m, (length A + length B)/2 + 12 m - r)` before that point. This keeps in-trail traffic about 15 m nose-to-tail.

**Crossing and merging traffic**: in addition, each aircraft compares its path with the next 150 m of the path of every other aircraft that intends to move (within 600 m). Where the two paths come closer than `r` at an angle of at least 20 degrees, the aircraft that would reach that point **later** (distance / speed, with a minimum speed of 2 m/s) stops `own length / 2 + 10 m` before it, outside the other one's lane. An aircraft that is **already in the other one's lane** (its first conflict point is within 9 m ahead) always goes first and the other waits before entering the lane - stopping inside the other's lane would block it for good (for example nose to nose on a connector like H). Otherwise the decision is kept until the conflict is over, so the two don't take turns braking. Traffic coming from behind in the same direction whose path runs through the aircraft's current position is following it and is never given priority. Each aircraft checks the next **400 m** of the other aircraft's path, so it stops early enough where taxiways meet at a shallow angle (for example arrivals from rapid exit F crossing S). **An aircraft clearing the runway goes first**: from touchdown on, taxiing traffic (not crossing the runway) sees the whole way of a landing or vacating aircraft to its exit stop and waits before entering it, unless it is already in its way or - while the arrival still rolls out on the runway - less than 60 m from the junction (then it moves on and clears it rather than stopping where the arrival turns onto the taxiway); the aircraft clearing the runway never waits for taxiing traffic - an exit whose stop lies on the parallel taxiway (San Diego B9 onto B) is kept free.

**Opposite traffic** (since 0.8): every 2 s each taxiing crew looks **800 m** along its route. If an aircraft stands on that stretch heading towards it (more than 135 degrees difference) and both stand on each other's route, the two are more than **110 m** apart and there is a **junction** (a node where three or more taxiway segments meet) between them that both can still stop short of, both crews stop short of that junction - `max(length / 2, r + 10 m) + 15 m` before it, so it stays free for one of them to turn off there - and call `opposite traffic on taxiway N, EWG7TK, holding short of G, request instructions`. *Resolve conflict* (and the AI Ground) then sends one of them off via the junction; the other waits until the way is clear. A crew whose call is still waiting for a gap on the frequency drops it once the other aircraft has been given its way out.

**Narrow parts without a junction**: where two crews would meet on lanes too close for both wingspans (e.g. Leipzig apron 4, Z4.1 and Z4.2 31 m apart) or on a stretch without a junction between them, and their paths there run in opposite directions, the crew further from the narrow part waits short of it (15 m) without calling, until the other one has passed. The one that goes first must not have the waiting one in its way (then they swap); the waiting one stops early enough not to stand in the other's way (a wide-body next to the lane), and the crossing rule above does not make the one going first wait for it. Checked every 2 s up to 400 m apart (800 m along the routes); not if it can no longer stop in time.

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

**Stand suitability**: a stand can take an aircraft only if its wingspan is within the stand's maximum **and** there is enough wingtip clearance to the aircraft on (or taxiing to, or reserved for) the neighbouring stands: the stand centres must be at least `(span A + span B) / 2 + clearance` apart (and the lead-in line must pass a parked neighbour at least `max(span A, span B) / 2 + clearance` away - fanned lead-in lines, one stand behind another), with a clearance of **4.5 m** between code C aircraft (wingspan below 36 m) and **7.5 m** when one of them is code D or larger (ICAO Annex 14). So a wide-body on a large stand can block the smaller stand next to it. This applies to the automatic stand allocation and the stand menu. Crews accept your instruction to any stand their aircraft fits; **150 m before the stand** they see whether it is usable. If an aircraft stands on it (parked) or a parked neighbour is too close, they stop and call `stand 14 is occupied, request another stand` (request `route`). If the aircraft there is moving (pushing back, starting up, or taxiing onto the neighbouring stand), they hold without a call and continue once it is clear.

**Validation**: pilots check instructions against their state and the airport data. They reply `unable ...` or `confirm ...` instead of doing something impossible: an unknown taxiway or holding point, an impossible route, a stand too small for the aircraft (an occupied stand is only noticed when taxiing in, see *Stand suitability*), a crossing that isn't on the route, a wrong frequency, a hand-off before taxiing. See [phraseology.md](phraseology.md#pilot-read-backs-and-replies).

## Delivery, A-CDM and slots

Source: `src/core/delivery.ts`.

| Item | Value |
| ---- | ----- |
| Clearance request | 10 min before the ready time (TOBT); immediately if the aircraft appears later than that. At session start staggered (see [Traffic generation](#traffic-generation)) |
| DCL equipped | 40 % of the departures with an airline callsign (not German-registered `D-xxxx` aircraft), when DCL is on |
| Initial climb | from the airport data (`initialClimbFt`: EDDS 5000 ft, the altitude of every published SID; Cologne/Bonn 5000 ft; Nuremberg, Memmingen and Leipzig/Halle FL70, Bremen and Sylt 4000 ft); 5000 ft if not set |
| Squawk codes | next free code from the octal blocks 2101-2177, 2201-2277, 2301-2377, 2401-2477 (codes ending in 0 skipped; a simulator range, not the real ORCAM allocation). Special codes 7500, 7600, 7700, 7000, 2000, 1000, 0000 are refused |
| Readback error | 4 % of voice clearances: two digits of the squawk read back swapped. Caught with `squawk <correct code>` (+5); passed with `readback correct` or a hand-off it stays: the crew sets the wrong code (-10) |
| Crew queries | missing or unknown clearance limit, wrong destination, missing or unknown SID, SID of the wrong runway (`information R says runway 25 in use`) or not leading to the first fix of the flight plan, wrong runway, missing initial climb, missing or invalid squawk |
| Start-up | needs the IFR clearance (`negative, we have no clearance yet`) |
| Hand-off to Ground | needs the IFR clearance; counts as *clearance delivered* (+10) |
| CTOT | 12 % of the departures; CTOT = ready time + 10 min taxi time + 5-25 min, rounded to the minute |
| Night curfew | Scenario option: a jet still on the ground when the departure curfew starts is postponed to the morning (on its stand) or asks to taxi back to a stand; -10 if it was ready at least 15 min before the curfew. See [scenarios.md](scenarios.md#start-time-and-night-flying-restrictions) |
| CTOT window | take-off from CTOT - 5 min to CTOT + 10 min. Tower lines a CTOT flight up only when it can be airborne inside the window (others go first). After CTOT + 10 min the flight gets a new CTOT 20-40 min later - 8-15 min if it is ready at the holding point or lined up (a ready message to the Network Manager) - (-10) |

**A-CDM pre-departure sequencer** (every 5 s, when A-CDM is on): every parked departure without start-up approval gets a **TSAT** - not before its ready time, not before CTOT - 10 min (taxi time), rounded up to the minute and at least **90 s** from every other TSAT. A TSAT once issued is kept while it is still valid; flights that missed their TSAT (and new flights) only get a new one after that, in the earliest free slot - a late flight never bumps one that is on time. Start-ups already approved (and aircraft off-block) keep their slot. Crews call for start-up (on Delivery) or pushback (on Ground) 2 minutes before their TSAT. Without A-CDM there is no TSAT: crews call when ready.

## A-SMGCS

Source: `src/core/conflicts.ts`. Each service can be switched off in the [systems window](systems.md).

| Service | Behaviour |
| ------- | --------- |
| Surveillance | Data tags on the scope (off: no tags) |
| RMCA | Checked every step. Alert when a taxiing aircraft (above 0.5 m/s) with a clearance to cross comes within **120 m** of the runway holding position while the runway is occupied or an arrival is less than **60 s** from the threshold. One alert per aircraft and holding point |
| CATC | Every 5 s, the cleared routes (next **900 m**, sampled every 15 m) of the taxiing aircraft are compared; two routes that meet at more than **135 degrees** are a head-on conflict - but only when **both aircraft are rolling** (above about 2 kt, not stopped, holding or told to hold position). An aircraft standing still does not make the other one flash. Only reported if one of the aircraft is on your frequency; a pair is not announced again within 60 s (e.g. after a short stop). The AI Ground still uses every head-on route conflict (also with standing traffic) to resolve conflicts early. The command-line preview and the *Taxi to* menu still warn about a route towards standing traffic too |
| Routing | Route proposals in the menus; *Resolve conflict* options |

**Resolve conflict options**: conflicts are aircraft blocking each other nose to nose, or blocking each other at any angle (for example a pushback into a taxiing aircraft's way), or routed head-on. An aircraft that is still pushing back gets `cancel pushback` first (the tug tows it back onto the stand). Otherwise, for each of the two aircraft (on your frequency), a route to its destination that avoids the other aircraft's next 150 m of route; it is checked to keep clear of the other aircraft's future route (from the second segment on). If its destination cannot be reached that way, another one: a departure gets another entry of its runway it accepts (an intersection with enough take-off run), an arrival one of the 3 nearest free stands that fit (`taxi to stand 12 via L2, M`). Routes across a runway come after the others (marked *crosses runway*). Last come the turn-arounds: `turn around, taxi to ...` - an airliner needs a tug for it (300-600 s), an aircraft up to 25 m turns on the spot. The AI Ground uses the first option that does not cross a runway; a re-route it gave once and that did not help (the conflict is still there) is not given again, and nothing is given to an aircraft whose tug is coming or that was re-routed less than 120 s ago.

## Ground vehicles

Source: `src/core/vehicles.ts`.

**Tugs** are not drawn: at the nose of the aircraft they move (pushback, tow, turnaround of a stuck airliner, 300-600 s) they merge with the aircraft's return on the surface movement radar, as on a real ground radar display.

**Tows**: when the turnaround of an arrival on a stand that needs a pushback (a contact stand) ends, **15 %** of these aircraft are towed to a free remote (drive-through) stand instead of leaving the simulation. A tow is its own entity with the tug's callsign (`TUG1` ... `TUG9`, "Tug 1") on Ground frequency:

| Step | Timing / behaviour |
| ---- | ------------------ |
| Tow request | 10-60 s after the turnaround: `request tow (operator) (type) from stand X to stand Y` (request `tow`, list `TOWS`) |
| Approval | `tow approved [to stand ...] [via ...]`; the destination stand is reserved from the request on |
| Pushback | From a pushback stand the tug first pushes the aircraft back (same pushback as a departure), then repositions in 10-20 s |
| Towing | Along the route at no more than **10 kt**; the tug can turn the aircraft anywhere (no 180 degree restriction). Runway crossings, holds and give-way work as for aircraft |
| On the stand | Counts as a completed tow (+5); the aircraft stays parked for 20-40 min, then it leaves the simulation |

**Follow-me**: two cars (`FOLLOW-ME 1`, `FOLLOW-ME 2`, radio callsigns `Follow-me 1` / `Follow-me 2`) wait at the taxi node next to the fire station, on Ground frequency. After `follow the follow-me` the next free car is assigned and its driver calls `request proceed to DCEEO at taxiway F`. After your `proceed [via ...]` it drives to a point on the aircraft's route ahead of it (at **10 m/s**, about 36 km/h, accelerating at 2.5 m/s², braking at 3 m/s², turning at most 120°/s); the aircraft waits until it is there. It then drives **35 m ahead of the aircraft's nose** (it waits at the meeting point until the aircraft is close and never backs up). The scope interpolates the cars' positions between simulation steps. (`hold position` to the car stops both), turns off when the aircraft is less than that distance plus 25 m from the end of its route (the stand entry) and asks `request return to base`; after `return to base` (or `proceed to base`) it drives back. If no car is free, the aircraft waits for the next one. With the AI running Ground, the cars do not call and drive on their own. Crews ask for a follow-me after vacating: 20 % of business aviation crews (registration callsigns), 3 % of airline crews.

## Switching frequencies off

A frequency switched off in the toolbar is run by the simulator from then on; open requests on it are dropped and the AI answers. The **AI Delivery** clears departures still waiting on Delivery frequency (next free squawk, the SID of the flight plan's fix) and sends them to Ground; new departures start on Ground with their clearance. The **AI Ground** takes over as described below. The **AI Tower** decides again itself (line-up, take-off, landing; no landing clearance needed), hands arrivals that have vacated and aircraft that have crossed to Ground. When both Ground and Tower are run by the simulator, Ground lets an aircraft at a runway holding point cross when the runway is free and the next arrival is more than 90 s away. Switching a frequency on again gives you the position back; aircraft already on it call you again.

## AI Ground

When you don't staff Ground (for example when you work Delivery alone), the AI Ground acts every 5 s, silently on its own frequency: it approves push and start for cleared departures at their ready time when no other aircraft taxis or pushes within 250 m (taxi-out stands: taxi), taxis them to the runway in use after start-up, hands them to Tower on the last 700-1400 m before the holding point (each flight differently), once they are on one of the last two taxiways of their route (runway 07 via M, L2: from L2 on), when nothing is left to coordinate (no runway crossing or hold-short ahead, no conflict, no other taxiing or pushing aircraft within 200 m except departures queuing for the same holding point, and no CTOT window opening later than 2 min from now), otherwise at the holding point, taxis arrivals to their allocated stand - without one, to the nearest free stand that fits and that they can reach without turning around (another one if the crew finds it occupied) - approves tows when nothing taxis within 250 m, keeps a departure on its stand (or, after start-up, for up to 4 minutes) while its way out would meet traffic coming the other way on a taxiway - an aircraft taxiing or vacating along it in the opposite direction, or an arrival less than 4 minutes from the threshold whose exits run against it (on one-way taxi flows this never happens; at Memmingen it keeps N free), with de-icing (scenario option) keeps departures that need it on their stand while every pad is busy, taxis them to the free pad with the shortest route and on to the runway after the de-icing (only while fewer than 3 departures are taxiing to a holding point, so the queue does not fill taxiway N), and resolves conflicts after 40 s with the first *Resolve conflict* option (not while the other aircraft rolls on and is not held up by this one: it is passing, e.g. where two apron lanes meet) - once per conflict: not again while a tug is coming or within 120 s of the last resolution.

## AI Tower

**When you staff Tower** (v0.7), the AI Tower only flies the aircraft (final approach, landing roll and exit, line-up, take-off roll, climb-out) and detects incursions; every clearance is yours:

| Situation | Behaviour |
| --------- | --------- |
| Take-off runway | A departure takes off from the runway in its clearance (its assigned runway), even if the ATIS has changed the runway in use since |
| Request hand-off | The simulator-run position hands the aircraft over 4-10 s after your request (coordination by landline) |
| Coordination (`COORD`) | *No more arrivals*: Approach releases no new arrivals onto the final (checked every 10 s), those already on final continue. *Hold all departures* (only while the simulator runs Ground): the AI Ground approves no pushbacks or taxi-out from stands; aircraft already moving continue. Each costs 2 points per full minute it is on. *Ask departures for the earliest intersection* (only while the simulator runs Ground, free): every 5 s Ground asks each cleared departure on the ground once which intersection with the least take-off run it accepts (`INT D`, `INT FULL` = full length only) |
| Departure on the way to the holding point | Handed over by the AI Ground on the last 700-1400 m before the holding point (on one of the last two taxiways of its route) once there is nothing left to coordinate on the ground (no runway crossing or hold-short ahead, no conflict, no other ground traffic within 200 m except departures queuing for the same holding point), at the latest at the holding point; calls `taxiing to holding point A, ready for departure` (more than 400 m away) or `approaching holding point A, ready for departure`. A departure waiting at the holding point without an open request (e.g. after a take-off refused in a thunderstorm) calls again after 150 s |
| Line-up | Not while another aircraft is on the runway within 400 m of the entry (except one rolling away), or is just lining up onto a point within 400 m (K and Y share one runway point at the 07 end). Departures from different entries may be lined up at the same time (e.g. full length A and intersection B) |
| Speed on final | Without instructions the **profile Approach usually gives**: 170-190 kt on the intercept, from 7-8.5 NM a reduction to **160 kt until 4 NM**, then the final approach speed (Vapp of the type, e.g. A320 about 138 kt) - reached at about 3 NM, 1000 ft above the runway. Reductions at 0.75 kt/s (1 kt/s with gear and landing flaps inside 4.5 NM), increases at 1 kt/s. An instructed speed (Vapp to 210 kt) replaces the profile until its distance (default 4 NM), then the aircraft slows to Vapp; the crew refuses one it could not reduce from in time (Vapp needed by 2.5 NM: `unable 180 knots until 4 miles, we could not be stabilised`). `reduce to final approach speed`: Vapp now; `resume normal speed`: back to the profile |
| Immediate take-off | Line-up at 1.5 times the normal speed, roll 0.5 s after stopping |
| Line-up / take-off clearance | Lines up when the clearance (and any condition, `behind ...`) allows; lined up with a take-off clearance it rolls after 2-5 s - not while another aircraft is landing or taking off, or is on the runway **ahead** of its start point. Aircraft standing behind it (e.g. lined up at A while it departs from intersection B) do not count as runway occupied - also not for the RMCA warning and the take-off menu |
| Departure spacing | At the start of the roll, the required spacing (2 min behind a heavy, 3 from an intersection, 2 min same SID fix, 1 min diverging) is checked; too early counts as a separation loss |
| Climb-out | Asks for a frequency change above 1500 ft above the airport; leaving (4000 ft) on Tower frequency counts as a missed hand-off. The crew reads back the radar frequency you give, or without one the frequency of its SID (Stuttgart southern departures: 119.200) |
| Arrival | First call when Approach hands it over (8-10 NM; or right away if it appears closer), reminder at 2 NM, `one mile final, request landing clearance` at 1 NM; without a landing clearance it goes around only at **0.15 NM** (just before the threshold, incident); with a clearance it goes around at 0.5 NM if the runway is not clear |
| Landing | Takes the exit given with `vacate via` if it can still reach it at normal braking, otherwise the usual one - never one where a departure is holding at the holding point (an exit that is also a departure entry); reports vacated and waits for `contact ground` (calls again every 20 s if the call got lost) |
| Backtrack (departure) | `backtrack runway 24, line up and wait` (or with the take-off clearance): the aircraft enters at its holding point, taxis along the runway towards the runway end at up to 18 kt, slows to 6 kt, turns around on the runway (a 180° turn of 11 m radius, 30 m from the end) and lines up on the centre line 80 m from the end. Only from a holding point at least 120 m from the runway end. At an entry marked for backtracking (Memmingen N for 24) the crew asks for it when the runway ahead is shorter than it needs, and refuses a line-up without it |
| Backtrack (arrival) | At exits marked for backtracking (Memmingen N for 06): when no exit ahead can be made at normal braking, or Tower asks for an exit behind the aircraft (`backtrack, vacate via N`), it brakes to 6 kt, turns around on the runway where it has stopped (at the latest 50 m before the end), taxis back at up to 18 kt and vacates (10 kt on the exit) |
| Runway crossing | The AI Ground hands an aircraft stopped at a runway holding point to Tower; after `cross runway 25` and crossing it reports vacated |
| CTOT | A take-off you clear before CTOT -5 min is flown and counts as a slot violation (-10, like a missed slot); missed slots as usual |

The AI Ground also resolves circles of aircraft waiting for each other (A behind B, B behind C, C behind A): if one of them is pushing back, the pushback is cancelled and the tug pulls it back onto its stand.

**When the AI runs Tower** (you staff Delivery and/or Ground), it owns the runway. Its rules are a simplified model of ICAO PANS-ATM practice; the reasoning and the sources are in [tower-operations.md](tower-operations.md). Each step it:

1. **Flies arrivals** down the final approach and lands them (see above).
2. **Sequences departures**: candidates are aircraft on Tower frequency waiting at a holding point, in the order they reached it. Only one aircraft lines up at a time. The first one may **line up** ("line up and wait") when
   - nobody is inside the runway area, except a departure that is already rolling, or a landing aircraft that is more than 300 m past the departure's entry point ("behind the landing traffic, line up"),
   - its departure separation will be met within 45 s (see below),
   - no arrival with an emergency is within 8 NM,
   - the next arrival is far enough out: its time to the threshold must exceed `35 s (line-up) + max(5 s, remaining departure separation, time until the landing aircraft ahead has vacated) + roll time + 15 s`. The roll time is `Vr / 2.0 m/s² + 12 s`, about 50 s for an A320.
3. **Lines up** the aircraft: it moves onto the runway at 9 kt and stops 50 m along the runway heading. If less than 1500 m of runway would remain (an aircraft sent to a holding point at the wrong end), Tower sends it back to Ground. From an entry marked for backtracking it backtracks to the runway end instead (see above); the line-up time then also counts the backtrack (distance at 14 kt plus 40 s).
4. **Take-off** ("ready for immediate departure"): 3-8 s after lining up, when
   - nobody else is in the runway area, the preceding departure is airborne, and the preceding landing aircraft has vacated,
   - **departure separation** is met, measured from the moment the previous departure became airborne:
     - **2 minutes behind a heavy** (wake turbulence; 3 minutes if this departure starts from an intersection),
     - otherwise **2 minutes** if both use the same departure route (same first SID fix, or both on radar vectors) and **1 minute** if the routes diverge,
   - the next arrival is more than `roll time + 8 s` from the threshold (about 2 NM).

   The aircraft then accelerates at 2.0 m/s². At its rotation speed it becomes airborne, climbs at its climb rate, and accelerates to 200 kt.
5. **Stranded departures**: a departure on Tower frequency that has stopped short of the holding point (a hold-short or a clearance limit, for example after `hold short of taxiway A` instead of `taxi to holding point A`) for **15 s** is handled by Tower: at a hold-short on a route that continues, Tower lets it continue; at a clearance limit, Tower taxis it to the runway in use itself if the holding point is at most **600 m** away without turning around, otherwise it sends the aircraft back to you (`Tower sent us back to you, ... request taxi`). A message in the message window tells you what Tower did. (Only while you are not Tower yourself.)
6. **Crossings for its own traffic**: aircraft already handed to Tower that stop at a runway holding point on their route get a crossing as soon as the runway is free and the next arrival is more than 90 s away. An aircraft that has waited **120 s** to cross a runway (its `crossing` call, on any frequency) gets the next gap: no departure lines up on that runway meanwhile.

The **runway area** used for occupancy checks extends 70 m either side of the centre line (the holding positions are at 95 m) and 60 m beyond each runway end.

**Arrival spacing** (provided by the simulated Approach controller, see [traffic generation](#traffic-generation)): at least the wake turbulence minimum, and wider gaps when departures are waiting, so that one departure fits between two arrivals; on a runway where landing aircraft backtrack at least 10 NM, where departures backtrack at least 8 NM.

## Parallel runways

Airports with parallel runways (`parallelRunways` in the airport data, Leipzig/Halle) use both at the same time, each for take-offs and landings (mixed mode). The ATIS editor offers the parallel runways (`Runways 26R + 26L`, the default for the direction of the wind) and each runway on its own.

| Topic | Rule |
| ----- | ---- |
| Runway of an aircraft | The runway of its apron (Leipzig: apron 1 and 3 the northern runway, the cargo aprons 2, 4, 5 the southern one); aircraft from a given wingspan always the runway named for them (Leipzig: 63 m and more, the southern runway); otherwise the runway nearest to its stand. Departures get it when they appear, with the SID of that runway (at Leipzig the SID letter names the runway) |
| Delivery | The SID of a clearance must belong to a runway in use; it sets the departure's runway (`DRN3S` = 26L) |
| Ground | `taxi to runway 26L` / `taxi to holding point S9` sends a departure to the other runway: it now departs from there, with the SID of that runway to the same exit fix (a message says so) |
| Approach | Puts each arrival on the runway of its stand. If there is no gap on that final but on the other, it uses the other (not for the aircraft bound to one runway by their size). The spacing on each final is the same as with one runway (wake, departure gaps from the departures waiting for *that* runway, approach type of that runway). Between the finals: **dependent parallel approaches** (Leipzig, AIP) keep **1.5 NM** diagonal radar separation to the arrivals on the adjacent final, **staggered** approaches **3 NM**, **independent** approaches none. With centre lines `d` NM apart the required stagger along the final is `sqrt(diagonal² - d²)` (Leipzig: 2.1 km apart, 0.97 NM). Wake turbulence spacing applies on each final only (the simulator assumes parallel runways more than 760 m apart, as at Leipzig) |
| Landing | Vacates on the side of its stand (not back across the runway) when it can reach such an exit |
| AI Tower | Works each runway on its own: one line-up at a time per runway, occupancy, arrivals and departure spacing per runway (departures from parallel runways are independent - AIP: independent parallel departures). A crossing of a runway in use is cleared when nobody is on it or lining up and its next arrival is more than 90 s away (no departure lines up while an aircraft is being cleared to cross, nor for 30 s after the crossing clearance until it has entered the runway); runways not in use can always be crossed |
| You on Tower | Your line-up, take-off and landing clearances name the aircraft's runway (`runway 26L, cleared for take-off`); the take-off menu shows the next arrival to that runway; RMCA warns per runway |
| Runway incursion | Per runway: entering a runway in use while an arrival to that runway is within 2.5 NM or an aircraft is lining up, taking off or landing on it |
| Runway change | Aircraft whose runway stays in use keep it (e.g. from `26R + 26L` to `26L` only the northern ones change) |
| ATIS | `ILS approach runways 26R and 26L, dependent parallel approaches in progress, runways 26R and 26L in use` (independent and dependent parallel approaches are announced, ICAO Doc 4444) |

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
| light to medium | 11         | 10              |
| medium   | 14                | 12              |
| medium to heavy | 18         | 15              |
| heavy    | 22                | 18              |

These are the Stuttgart figures. Smaller airports scale them with their `rateFactor` (see [airport data](airport-data.md#traffic)): Nuremberg 0.6, Bremen 0.4, Memmingen 0.35, Sylt 0.25 (Cologne/Bonn 1, like Stuttgart; Leipzig/Halle 1.1 on two runways). At Memmingen and Sylt (`standReserve` 1) no new departure takes the last free stand and Approach releases an arrival only when a stand is free for it; an arrival that still has none gets one (checked every 20 s) as soon as one becomes free.

- **Initial situation**: about 55% of an hour's departures are already parked at stands, with ready times spread over the first 25 minutes, **denser towards the end** (`30 s + sqrt(u) x 24.5 min`), so the workload builds up gradually. Their first calls are **staggered**: the first after 15 s, each next one at least **90 s** later, in the order of their ready times. On Delivery that is the clearance request (a crew then needs at least 4 minutes until it is ready); on Ground the pushback call. One arrival is on a 4-6 NM final.
- **New departures** appear at exponentially distributed intervals (a Poisson process) with the mean given by the rate.
- **New arrivals** follow the same kind of process. A new arrival is only released onto the final (at 12 NM) when the distance to the previous arrival is at least the **required spacing**, which is the larger of:
  - the **wake turbulence minimum**: 3 NM normally; 4 NM heavy behind heavy, 5 NM medium behind heavy, 6 NM light behind heavy, 5 NM light behind medium (larger values behind an A380, category J),
  - the **runway spacing**: 4 NM when no departures are waiting, **6 NM** when at least one departure is holding or taxiing to a holding point, **8 NM** with four or more. These are the "departure gaps" Approach gives on request,
  - **5 NM** for non-precision approaches (localizer only or RNP, when the ILS glide path or localizer is switched off in the [systems window](systems.md), or the runway has no ILS - Sylt 14; simulator value),
  - **8 NM** while a [thunderstorm](scenarios.md#thunderstorm) is active (the arrival rate is halved too),
  - **10 NM** on a runway where landing aircraft backtrack to their exit, **8 NM** where departures backtrack (Memmingen).
  - the runway's own minimum where the airport sets one (`arrivalSpacingNm`; Sylt **6 NM**, arrivals vacate only at the far end; Bremen **6 NM**, the target spacing of its SOP).
  - The spacing applies **at the threshold**: the faster follower closes in while the leader slows down to its final approach speed (compression), so Approach releases the next arrival only when, flying its speed profile, it would reach the spacing distance no earlier than the leader lands (and not before it is that far behind the leader at 12 NM).
- **Night flying restrictions** (scenario option): no jet departure is generated that would take off after the curfew (ready time + 20 min estimate); within 75 minutes of its end, departures are planned for the morning wave (ready 10-0 minutes before it). Arrivals that would land in the landing curfew (12 NM ≈ 5 minutes) are not generated, except delayed flights (35 % of the normal rate) until delayed landings end. See [scenarios.md](scenarios.md#start-time-and-night-flying-restrictions).
- **Operators, types and destinations** come from the airport's `traffic` data (see [airport data format](airport-data.md#traffic)), weighted by each operator's share. At EDDS this follows the real airline shares (Eurowings about 40 %, SunExpress 8 %, TUIfly 6 %, Pegasus and the Lufthansa group 5 % each, Turkish 5 %, Condor 4 %, British Airways 4 % ...) and the busiest destinations (Palma, Antalya, Istanbul, Pristina, London, Barcelona, Berlin, Hamburg); see [EDDS](airports/EDDS.md#traffic). Airports without traffic data use the global list in [`src/data/airlines.ts`](../src/data/airlines.ts).
- **Callsigns** are unique within a session: alphanumeric (`EWG7TK`), numeric (`THY1734`) or registrations (`DCMGB`), depending on the operator.
- **Flight plans** contain the destination, the SID of the active runway towards the destination (the exit fix whose sector contains the great-circle bearing to the destination, or a SID filed only for that destination - e.g. Stuttgart ETASA for Frankfurt; see the airport pages), cruise level and a squawk. The route starts with the exit fix (`ROTWE DCT LEPA`).
- **Stands**: aircraft up to code D (52 m wingspan) get a random free stand up to 52 m that fits, leaving out the alternative positions (stands overlapping a smaller one, like 71A or 24A at Stuttgart); larger aircraft the smallest free stand that fits. Every stand also needs enough wingtip clearance to its neighbours (see below). Business jets prefer their stands (Stuttgart 60-65), airlines the others. Cargo airlines (`cargo` in `src/data/airlines.ts`: UPS, FedEx, DHL / EAT, AeroLogic, ...) prefer the cargo stands (Cologne/Bonn aprons E, F and W, Leipzig/Halle aprons 2-5) and take other stands only when no cargo stand is free; everybody else uses cargo stands (Stuttgart Apron South) only when nothing else is free.

## Radio model

- There is **one frequency** (yours). A transmission takes `0.8 s + 0.32 s per word`.
- Your transmissions go out immediately and occupy the frequency.
- Pilot transmissions are queued. They start when the frequency is free, plus a 0.6 s gap. **Read-backs** (priority 10) go before **new calls** (priority 0).
- Read-backs start 0.8-2.2 s after your transmission. Spontaneous calls are delayed by 0.3-2.5 s.
- **Radio discipline**: after your instruction the frequency is reserved for the addressed station until its read-back has been transmitted, at most 6 s after your transmission has ended. Other pilots' calls wait. A new instruction to another station moves the reservation to that station.
- Queued transmissions that wait too long are dropped (45 s for calls, 60 s for read-backs). The pilot then repeats the call later.
- When you transmit to a pilot, their queued (not yet spoken) call is cancelled: they listen first.
- A frequency change takes effect when the read-back has been transmitted.

## Weather and ATIS

- **Wind** is drawn at session start: 60% westerly (220-290°), 40% easterly (040-110°), 3-14 kt - Stuttgart's long-term average is about 60 % of the operations to the west (RP Stuttgart noise report).
- **Runway in use** at session start: the first runway of the airport (25 at EDDS), unless it has more than 3 kt tailwind; then the runway with the most headwind. Where it has a parallel runway, both are in use (see [parallel runways](#parallel-runways)).
- **QNH** 1003-1028 hPa at the start; the METAR QNH then drifts (below).
- **METAR** (`core/met.ts`): a routine observation at minute 20 and 50 of every hour (UTC), the last one before the start is current when the session begins. The weather follows from the seed (`sim.variation`, the traffic is not affected): 30 % CAVOK, 30 % few / scattered (2500-5500 ft), 25 % broken (1500-4500 ft, 40 % of them with light rain and 6-9 km visibility), 15 % overcast (600-1600 ft, 3000-6000 m in mist or light rain; snow at 1 degree C or below). The cloud base drifts by up to 300 ft per observation. Temperature: monthly mean of a Central European climate (January 1, July 19 degrees C, `climate` in the airport data overrides it) +-3 per session, plus a daily cycle with its maximum at 1500 local (half range 3-6 degrees C, 70 % under broken, 40 % under overcast cloud); dew point 1-11 degrees below. QNH: the pressure of a session rises or falls - 1 hPa in that direction in 25 % of the observations, back in 5 %. Wind: the observed wind (direction to 10 degrees) - it changes from one observation to the next (below). De-icing scenarios: -3 to +1 degrees C, overcast, light snow or mist. Thunderstorm: a **SPECI** at each phase - approaching `VCTS`, `FEW040CB`, `TEMPO TSRA`; overhead `4000 TSRA SCT015 BKN025CB`, 4 degrees colder, `BECMG NSW`; passed: light rain for 20 minutes.
- **New METAR**: it appears in the message window. If it differs from the ATIS - QNH, wind (30 degrees at 10 kt or more, 5 kt, gusts by 10 kt), visibility (across 5000 m or by 3000 m), present weather or ceiling (by 500 ft) - the message says so and the toolbar shows the ATIS letter in red.
- **Observed wind** (the toolbar): the actual surface wind. It **changes during the session**: for every routine METAR a new wind is drawn from the seed (`sim.variation`, the traffic is not affected) - the direction moves by up to 40 degrees and the speed by up to 5 kt from the last observation, plus a quarter of the way back to the prevailing wind of the session (so it wanders but rarely turns round), at most 30 kt; from 15 kt on, half of the observations have gusts 10-15 kt above the mean. The actual wind turns to the new value during the **15 minutes before the observation** (a degree at a time), so the METAR reports what the toolbar shows. A scenario **wind shift** turns it to the opposite direction (9-15 kt), a **thunderstorm** changes it, and broadcasting an ATIS with another wind sets it as well; the next observation goes on from there. Tutorials keep their wind. The ATIS editor is pre-filled with it (including gusts, `070/18G32`).
- **Runway change hint**: when a METAR shows more than **5 kt tailwind** on the runway in use and another runway is into wind, the message says so (`Tailwind 7 kt on runway 25: consider a runway change to runway 07 (ATIS editor) and re-route the traffic`). Changing the runway is your decision.
- **Thunderstorm** (scenario event): warning 5 min (gusts, 8 NM arrival spacing), overhead 15 min (tailwind gust front 14-20 kt gusting 12-18 kt more, no pushbacks, no take-offs, go-arounds at 1 NM with more than 10 kt tailwind or in windshear with a 40 % chance per arrival; weather go-arounds cost no points), then the wind settles at 6-11 kt from the new direction. Details: [scenarios.md](scenarios.md#thunderstorm).
- **ATIS** in two forms, like a German D-ATIS: text (`ATIS EDDS K 0950 / EXPECT ILS APCH / RWY 25 / A-CDM IN PROGRESS / TRL 70 / 25008KT CAVOK T12 DP06 QNH1018 / TREND NOSIG`) and spoken (`Stuttgart information K, time 0950. Expect ILS approach runway 25, runway in use 25, A-CDM in progress. Transition level 70. Wind 250 degrees 8 knots, CAVOK, temperature 12, dew point 6, QNH 1018. Trend nosig. Information K out.`). Time, visibility, weather, clouds, temperature and trend come from the METAR the ATIS was made from; wind and QNH are the ones you broadcast. Notices after the runway: navigation aids out of service (`ILS RWY 25 U/S`, `GP RWY 25 U/S`), with parallel runways the runway of each apron and of the large aircraft (`A/C ON APRON 1 OR 3 EXPECT DEP AND ARR RWY 26R`), closed taxiways (`TWY E AND S CLSD`), de-icing (`DE-ICING IN PROGRESS ON DE-ICING PADS`), A-CDM (`A-CDM IN PROGRESS` while it is on), datalink clearances switched off (`DCL U/S`), and `CAUTION WINDSHEAR REPORTED ON FINAL` while a thunderstorm is overhead.
- **ATIS letter** starts at random. It only changes when **you** broadcast a new ATIS in the ATIS editor (without a QNH it takes the METAR's).
- **Old ATIS letters**: a crew listens to the ATIS 2-8 minutes (per callsign) before its first call and reports the letter that was current then - after a new ATIS some still report the old one. Tell them the current one: `information K is current, QNH 1018` (read back `Information K, QNH 1018`; a letter that is not broadcast is queried), or broadcast `all stations, information K is now current` (corrects everybody on your frequencies). A crew that leaves your frequencies with an old letter costs 3 points.
- **Runway change** (via the ATIS):
  - Departures that are parked, pushing back or starting up and have no taxi instruction yet get the new runway, and a SID with the same first fix for the new runway - unless their runway stays in use.
  - Arrivals further out than 3.5 NM are moved onto the new final (Approach re-sequences them, at least 6 NM out) - unless their runway stays in use.
  - Arrivals closer in land on the old runway; Tower doesn't line anyone up until they have landed.
  - Taxiing departures keep their clearance.

## Special events

Set with the **Special events** slider in the Connect dialog or the in-game settings: *never*, *very rare*, *rare* (default), *occasional*, *often* multiply the chances below by 0, 0.5, 1, 2 and 4. At the default they are rare:

| Event                          | Chance (at "rare")              | What happens                                                                 |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------------------------- |
| Medical emergency, arrival     | 2% of arrivals                  | Declared on final (system message). Lands with priority: no line-ups while it is within 8 NM. After vacating, the pilot calls `PAN PAN, medical emergency ..., request expedited taxi to the stand`. |
| Medical emergency, departure   | 1% of departures                | 40 s after starting to taxi, the pilot calls `PAN PAN ... request immediate return to the stand`. A stand is suggested; give it a route back (`taxi to stand ...`). |
| Rejected take-off              | 1.5% of take-offs               | The take-off is aborted at 60-110 kt (or below 80 kt on your `stop immediately`). The aircraft brakes at once (3 m/s² planned, 2.5 m/s² hardest braking) down to 25 kt, rolls on to the next usable exit, vacates and calls you. 60% want to return to a stand (technical problem), 40% request taxi for another departure (with new line-up and take-off clearances: the old ones are used up). The runway is blocked meanwhile, so arrivals may have to go around. |

**Scheduled events** from a scenario code happen at fixed minutes, whether random events are on or not: the next arrival declares a medical emergency, the earliest-ready departure on your frequency gets one 40 s after it starts taxiing (retry every 30 s if there is none), the next take-off is rejected, the wind shifts, or a thunderstorm crosses the airport. See [scenarios.md](scenarios.md#scheduled-events).

**Traffic mix** of a scenario: a departure rush multiplies the departure rate by 1.6 and the arrival rate by 0.5, *more departures* by 1.3 and 0.75, and the arrival steps the other way round. With a **share of heavies** of 10, 20, 35 or 50 %, each new flight is a wide-body with that chance (on top of the operators' own fleets) - while a stand that fits it is free; otherwise the flight is a normal one. See [scenarios](scenarios.md#scenario-codes).

A medical emergency counts as handled when the aircraft reaches a stand. Within **6 minutes** of the emergency call, that earns a **+15 point bonus**. Emergency aircraft are shown with `PAN` and a flashing magenta symbol and tag.
