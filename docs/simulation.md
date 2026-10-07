# Simulation model

This page describes how the simulated world behaves: AI pilots, the AI Tower, traffic generation, ground movement, separation, radio and incident detection. All numbers are the values used in the code, so you can predict how traffic will react.

- [Time](#time)
- [Aircraft life cycle](#aircraft-life-cycle)
- [Ground movement](#ground-movement)
- [Pilot see-and-avoid](#pilot-see-and-avoid)
- [AI pilots: communication](#ai-pilots-communication)
- [AI Tower](#ai-tower)
- [Runway incursions and go-arounds](#runway-incursions-and-go-arounds)
- [Collisions](#collisions)
- [Traffic generation](#traffic-generation)
- [Radio model](#radio-model)
- [Weather and ATIS](#weather-and-atis)

---

## Time

- The simulation advances in fixed **0.2 s steps**. Rendering is independent of the simulation rate.
- The **simulation rate** (1x / 2x / 4x / 8x) multiplies the real elapsed time. A frame delta is capped at 0.5 s (and a single `tick` at 5 s), so a backgrounded browser tab doesn't cause huge jumps.
- Simulation time starts at the real current UTC time.
- A seeded pseudo-random generator (mulberry32) drives every random decision. **The same seed and settings always give the same scenario**, as long as the controller's inputs are the same.

## Aircraft life cycle

### Departures

```
parked --(pushback approved)--> pushback --(push complete)--> startup --(engines running)--> taxi
   |                                                                                         |
   +--(taxi, on a taxi-out stand)----------------------------------------------------------->+
                                                                                              |
taxi --(reaches destination holding point)--> holding --(contact Tower)--> [Tower]: lineup --> takeoff --> climb --> gone
```

| Step                | Timing / behaviour                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Boarding            | A departure appears on a free stand. It calls for pushback when its **ready time** is reached (4-15 min after it appears; initial traffic 0.5-25 min). |
| Tug connection      | 6-15 s after the pushback approval, the push starts.                                       |
| Pushback            | 1.3 m/s (~2.5 kt) backwards along the stand lead-in line, then about 45 m along the taxilane. |
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
| Exit choice         | The first exit that can be reached at that deceleration. 85% prefer the north side, 15% the south side. |
| Vacated             | Stops between the holding point and the parallel taxiway, switches to Ground, and calls `vacated runway 25 via E` after a short delay. |
| Stand               | A suggested stand is allocated when the arrival appears (if one is free). You can use any free stand that is big enough. |
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

**Route finding** is described in [architecture.md](architecture.md#taxi-routing). If an aircraft has to reverse direction to follow a new route (for example after a head-on encounter), it makes a tight U-turn; the router penalises this with 400 m extra cost.

## Pilot see-and-avoid

Pilots don't collide on purpose. Every step, each aircraft that is moving along a path looks ahead along its **own path** by

```
look-ahead = v² / (2 · 1.2 m/s²) + 55 m + own length
```

and checks whether another ground aircraft is (or, if it is moving, will be within 4 s) closer to the path than

```
r = 0.38 · (wingspan A + wingspan B) + 6 m        (two A320s: ~33 m)
```

If so, it plans to stop `max(5 m, (length A + length B)/2 + 12 m - r)` before that point. This keeps in-trail traffic about 15 m nose-to-tail.

**Mutual conflicts**: if two aircraft each see the other on their path (for example converging at an intersection), the one **closer** to the conflict point continues and the other waits. If both are already stopped, for example nose-to-nose on the same taxiway, nothing moves. This is a **deadlock**: after 60 s the pilots report `we have opposite traffic ahead, request instructions`, and you have to re-route one of them.

**Give way**: an aircraft told to `give way to X` stops and waits until X is gone, X is more than 250 m away, or the distance has been increasing for 4 s while being larger than half the combined wingspans plus 40 m. After 4 minutes it continues anyway.

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
| `blocked`  | Head-on / mutual deadlock for 60 s                                            | `hold position`, `give way`, a new route |
| `route`    | Held short of a taxiway for 2 min, a taxi instruction became invalid, or Tower sent the aircraft back | `continue taxi`, a new route |

**Reminders**: if a request isn't answered, the pilot calls again every 60-89 s (a fixed interval per callsign), up to 5 times. `standby` suppresses reminders for 120 s and counts as an answer for the waiting-time statistics.

**Answering** a request records the waiting time (time since the first call). Every 15 s of waiting beyond 30 s costs one point.

**Validation**: pilots check instructions against their state and the airport data. They reply `unable ...` or `confirm ...` instead of doing something impossible: an unknown taxiway or holding point, an impossible route, an occupied or too small stand, a crossing that isn't on the route, a wrong frequency, a hand-off before taxiing. See [phraseology.md](phraseology.md#pilot-read-backs-and-replies).

## AI Tower

Tower owns the active runway. Each step it:

1. **Flies arrivals** down the final approach and lands them (see above).
2. **Sequences departures**: candidates are aircraft on Tower frequency waiting at a holding point, in the order they reached it. The first one may **line up** when
   - nobody is on the runway or inside the runway strip (see below), and no take-off roll or landing roll is in progress,
   - no arrival is within 4.5 NM of the threshold,
   - the previous take-off started at least 75 s ago (120 s after a heavy).
3. **Lines up** the aircraft: it moves onto the runway at 9 kt and stops 50 m along the runway heading. If less than 1500 m of runway would remain (an aircraft sent to a holding point at the wrong end), Tower sends it back to Ground.
4. **Take-off**: after 8-20 s lined up, and once the runway is free, the aircraft accelerates at 2.0 m/s². At its rotation speed it becomes airborne, climbs at its climb rate, and accelerates to 200 kt.
5. **Crossings for its own traffic**: aircraft already handed to Tower that stop at a runway holding point on their route get a crossing as soon as the runway is free and no arrival is within 3 NM.

The **runway area** used for occupancy checks extends 70 m either side of the centre line (the holding positions are at 95 m) and 60 m beyond each runway end.

## Runway incursions and go-arounds

- **Runway incursion**: a taxiing aircraft (phase `taxi`) enters the runway area while an arrival is within 2.5 NM, or while another aircraft is lining up, taking off or landing. Taxiing aircraft only enter the runway area with a crossing clearance, so every incursion is caused by a crossing clearance given at the wrong moment. **-50 points.**
- **Go-around**: an arrival inside 0.9 NM finds the runway area occupied, or within 0.5 NM finds a take-off or landing roll still in progress. It climbs away, is removed, and is reported together with the aircraft that blocked the runway. **-15 points.**

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
- **New arrivals** follow the same kind of process, but at least 150 s apart, and only if no other arrival is still further out than 6 NM.
- **Operators, types and destinations** are taken from [`src/data/airlines.ts`](../src/data/airlines.ts) and weighted by frequency. The mix reflects carriers that typically serve Stuttgart (Eurowings, Lufthansa, Condor, TUI, Turkish, SunExpress, ...) plus some business jets.
- **Callsigns** are unique within a session: alphanumeric (`EWG7TK`), numeric (`THY1734`) or registrations (`DCMGB`), depending on the operator.
- **Flight plans** contain the destination, a SID for the active runway (placeholder names), cruise level and a squawk.
- **Stands**: the smallest free stand that fits the wingspan. Airlines use Apron 1, business jets Apron 3.

## Radio model

- There is **one frequency** (yours). A transmission takes `0.8 s + 0.32 s per word`.
- Your transmissions go out immediately and occupy the frequency.
- Pilot transmissions are queued. They start when the frequency is free, plus a 0.6 s gap. **Read-backs** (priority 10) go before **new calls** (priority 0).
- Read-backs start 0.8-2.2 s after your transmission. Spontaneous calls are delayed by 0.3-2.5 s.
- Queued transmissions that wait too long are dropped (45 s for calls, 60 s for read-backs). The pilot then repeats the call later.
- When you transmit to a pilot, their queued (not yet spoken) call is cancelled: they listen first.
- A frequency change takes effect when the read-back has been transmitted.

## Weather and ATIS

- **Wind** is drawn at session start: within ±30° of the active runway's magnetic heading, 3-14 kt.
- **QNH** 1003-1028 hPa.
- **ATIS** starts at a random letter and advances every 30 minutes (Z wraps to A). Pilots quote the current letter on first contact.
