# Phraseology reference

Ultimate ATC understands controller instructions written or spoken in **ICAO phraseology** (ICAO Doc 4444 / Doc 9432 style, as used on VATSIM). This page lists everything the parser understands, what the pilots read back, and what the pilots say on their own.

The parser lives in [`src/core/phraseology/parser.ts`](../src/core/phraseology/parser.ts). Its behaviour is covered by [`tests/parser.test.ts`](../tests/parser.test.ts).

- [General rules](#general-rules)
- [Callsigns](#callsigns)
- [Instructions](#instructions)
- [Combining instructions](#combining-instructions)
- [Pilot read-backs and replies](#pilot-read-backs-and-replies)
- [Pilot calls](#pilot-calls)
- [Spoken input](#spoken-input)
- [Not supported (yet)](#not-supported-yet)

---

## General rules

- **Case and punctuation don't matter.** `DLH5AB Taxi To Holding Point A, via L2, S.` and `dlh5ab taxi to holding point a via l2 s` are the same.
- **Filler words are ignored:** `roger`, `please`, `thanks`, `good day`, `bye`, `correction`, `the`, `and` ...
- **Words that are not understood** are listed in the preview (`ignored: ...`). If nothing at all is understood, the pilot replies `Say again, <callsign>?` (-2 points).
- **Designators** can be typed (`A`, `L2`, `25`, `118.805`) or spelled in words (`alpha`, `lima two`, `two five`, `one one eight decimal eight zero five`).

## Callsigns

The callsign can be written in any of these ways:

| Form                                        | Example                              |
| ------------------------------------------- | ------------------------------------ |
| ICAO callsign                               | `DLH5AB`, `THY1734`, `DCMGB`         |
| Radiotelephony designator + flight number   | `Lufthansa 5AB`, `Turkish 1734`, `Wizz Air 12AB` |
| Spelled out                                 | `Lufthansa five alpha bravo`         |
| Flight number only, if unique               | `5AB`, `1734`                        |
| At the end of the transmission              | `pushback approved, DLH5AB`          |
| **Omitted**: the selected aircraft is used  | `taxi to stand 14 via N, R`          |

Radiotelephony designators of the simulated operators:

| ICAO | Telephony   | ICAO | Telephony  | ICAO | Telephony |
| ---- | ----------- | ---- | ---------- | ---- | --------- |
| AFR  | Airfrans    | DLH  | Lufthansa  | RYR  | Ryanair   |
| AUA  | Austrian    | EWG  | Eurowings  | SWR  | Swiss     |
| BAW  | Speedbird   | ITY  | Itarrow    | SXS  | Sunexpress |
| CFG  | Condor      | KLC  | City       | THY  | Turkish   |
| CLH  | Hansaline   | KLM  | KLM        | TUI  | Tuijet    |
| PGT  | Sunturk     | VLG  | Vueling    | WZZ  | Wizz Air  |

General aviation aircraft use their registration as callsign, for example `DCMGB`, spoken "Delta Charlie Mike Golf Bravo".

## Instructions

Notation: `[optional]`, `a | b` = alternatives, `X` = taxiway, `HP` = holding point, `RWY` = runway designator, `STAND` = stand number.

### Pushback and start-up

| You say                                                      | Effect                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pushback approved` / `push back approved` / `push approved` | Pushback. The pilot chooses the facing that gives the shortest taxi to the departure runway. |
| `pushback approved facing east` (`face west`, `nose north`)  | Pushback so the nose points in that direction afterwards                                     |
| `pushback approved tail east`                                | Same with the tail direction (tail east = facing west)                                       |
| `push and start approved [facing ...]`                       | Pushback with engine start during the push. The aircraft is ready for taxi sooner.           |
| `start-up approved` / `startup approved`                     | Engine start on the stand. Combine with a later pushback; it shortens the start-up after the push. |
| `cancel pushback` / `pushback cancelled`                     | Before the tug moves: the pushback is cancelled, the aircraft stays on the stand. Already moving: the tug **tows the aircraft back onto the stand**. Either way it calls again in 1-2.5 minutes. |
| `stop pushback` / `stop the push`                            | The push stops immediately (read-back `stopping pushback`)                                   |
| `continue pushback` / `continue push`                        | Resumes a stopped pushback                                                                   |

Notes:

- Facing is matched to the nearest compass direction of the taxilane: at EDDS terminal stands (taxilane M), `east` means towards L2 / H and `west` towards L3.
- A pilot who hasn't called yet and is still boarding replies `negative, we are still boarding, we will call you when ready`.
- Stands without pushback (none at EDDS yet) reply `no pushback required ...`.

### Taxi

```
taxi [to] DESTINATION [via|along X [,] X ...] [hold short of ...] [cross runway RWY]
taxi via X X ... to DESTINATION
taxi via|along X [,] X ..., hold short of TAXIWAY|runway RWY        (incomplete taxi instruction)
```

| Destination                                    | Example                                          |
| ---------------------------------------------- | ------------------------------------------------ |
| Holding point                                  | `taxi to holding point A via L2, S`              |
| Holding point with runway                      | `taxi to holding point D runway 25 via H, S`     |
| Runway (the pilot picks the full-length holding point on the shortest route) | `taxi to runway 25 via N` |
| Runway at an intersection                      | `taxi to runway 25 at D`                         |
| Stand                                          | `taxi to stand 14 via N, R` (also `gate 14`, `parking position 14`) |

**The `via` list** must name the taxiways in the order they are used. The router finds the shortest path that follows exactly these taxiways. Taxiways that controllers usually leave out may be omitted:

- the apron taxilane the aircraft starts on (for example `R` after pushback at the terminal),
- the taxiway the aircraft is currently on,
- the taxilane or taxiway the destination lies on (for example `M` for a terminal stand, `A` for holding point A).

So after a pushback from stand 14 facing east, `taxi to holding point A via L2, S` is accepted and gives the route M -> L2 -> S -> A. Without any `via`, the pilot takes the **shortest route**, avoiding runway crossings where possible. This is convenient, but not proper phraseology.

If the route is impossible, the pilot replies `unable to follow route via S, say again route`. An unknown taxiway gives `confirm taxiway Q, we can't find it`. The live preview in the command line shows these problems **before** you transmit.

**Incomplete taxi instructions** (clearance limit): `taxi via S, hold short of E` or `taxi along R, D, N, hold short of runway 25`. There is no destination; the aircraft taxis along the via taxiways and stops at the hold-short point, which is the clearance limit: about 40 m before the junction with E, or at the runway holding point. The read-back is `Taxi via S, hold short of taxiway E, ...`. Then give the rest of the route with a normal taxi instruction. `continue taxi` at a clearance limit gets `confirm where to taxi`.

**No turning around on the spot**: an airliner (wingspan above 25 m) cannot make a 180 degree turn on a taxiway. If the route you give would need one, for example `taxi to holding point A via N` for an aircraft facing west on N when A is to the east, the pilot replies `unable, we are facing west and cannot turn around here, say again route`. Give a route that continues in the direction the aircraft is facing, or loops around. Smaller aircraft (business jets, CRJ900) can turn around. Exceptions:

- at a runway holding point (there is room to turn), and
- when the aircraft has been **stuck** for over 30 seconds (blocked by other traffic): a route that needs a turn is accepted, the pilot reads it back with `we need a tug to turn around, expect about 7 minutes`, and starts taxiing 5-10 minutes later. Use this to solve a [deadlock](glossary.md) when there is no junction left to turn off (the *Resolve conflict* menu offers it).

**Intersection departures**: ask first, as in real operations:

| You say                                                         | Pilot replies                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `advise able for departure from intersection D` / `are you able intersection D` / `confirm able to depart from D` | `Affirm, able intersection D, ...` or `Negative, we require full length, ...` |

The crew compares the take-off run available from that intersection with what their aircraft needs today (a figure per type, e.g. A320 about 2100 m, A330 about 2800 m, Citation about 1200 m, varied per flight by -10 % / +15 %). An aircraft that is not able replies `unable intersection D, we require full length` when you send it to that holding point anyway. Asking for a holding point that is not an entry to the runway in use gets `confirm intersection X, it is not an entry to runway 25`. The aircraft menu has *Able intersection?* for the intersections of the runway in use.

**Stand assignments**: the crew knows from its stand charts whether its aircraft fits (`unable, stand 22 is too small for us`), but not whether the stand is free - it accepts the instruction and only finds out when it sees the stand. About 150 m before it, it stops and calls: `Stuttgart Ground, Eurowings 7TK, stand 14 is occupied, request another stand` (or `stand 72 is blocked, not enough wingtip clearance to the A332 on stand 71A, request another stand`). An aircraft just pushing back from the stand (or taxiing onto the one next door) is waited for without a call. You can see it before: the preview warns in orange (`-- stand 14 taken by DLH5AB`).

**During pushback or start-up** a taxi instruction is accepted and read back. The aircraft starts taxiing once its engines are running.

### Hold short, hold, continue

| You say                                        | Effect                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `hold short of taxiway D` / `hold short D`     | Stops before the route joins or crosses taxiway D (about 40 m before the centre line)     |
| `hold short of runway 25`                      | Cancels a crossing clearance; the aircraft stops at the runway holding point              |
| `hold position` / `hold` / `stop`              | Stops immediately                                                                          |
| `continue taxi` / `continue`                   | Cancels *hold position*, *give way* and the current or next *hold short of taxiway*       |
| `expedite taxi`                                | Taxis about 5 kt faster                                                                    |

Hold short can be part of the taxi instruction (`taxi to holding point A via L2, S, hold short of taxiway H`) or sent on its own to an aircraft that is already taxiing. `continue taxi` does **not** clear an aircraft across a runway. The pilot then asks `confirm cleared to cross runway 07/25`.

### Runway crossing

| You say                    | Effect                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `cross runway 25`          | Clears the aircraft to cross runway 07/25 at the holding point it is waiting at, or at the next one on its route |
| `taxi ... , cross runway 25` | Crossing clearance as part of the taxi instruction                                         |

Every runway holding position on a route is a **mandatory stop** unless a crossing clearance was given. Aircraft never enter the runway on their own. Read the [simulation model](simulation.md#runway-incursions-and-go-arounds) to see when a crossing counts as an incursion.

### Conditional clearances

```
behind TRAFFIC [description], INSTRUCTION
when clear of TRAFFIC [description], INSTRUCTION
after TRAFFIC [has passed], INSTRUCTION
```

`TRAFFIC` is a callsign in any form (`behind DLH5AB`, `behind Lufthansa 5AB`) or `the` + an aircraft type: `the A320`, `the A321`, `the 737`, `the Boeing`, `the Airbus`, `the Embraer`, `the Dash`, `the ATR`, `the jet`, `the heavy`. The description after the traffic ("passing from left to right", "on M", "coming out of L2") is read back but not interpreted.

```
DLH5AB, behind the A320 passing from left to right, push and start approved, facing east
EWG7TK, when clear of the Boeing, taxi to holding point A via L2, S
```

- The pilot has to **identify the traffic**: a callsign must be on the ground; a type must match a moving (not parked) aircraft within 1500 m, and the nearest one is taken. If not, the reply is `Negative contact with the A320, say again` and nothing is executed.
- Pushbacks, taxi instructions, crossings and *continue* then wait until the traffic **has passed**: it came closest and is now at least 40 m further away again, clear of the wingtips. They also start if the traffic stops more than 300 m away, or after at most 4 minutes.
- The read-back starts with the condition: `Behind the A320 passing from left to right, push and start approved, facing east, Lufthansa 5AB`.

### Give way / follow

| You say                                   | Effect                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `give way to EWG7TK [from the left]`      | The aircraft stops until the named traffic has passed (see conditional clearances), then continues on its own |
| `follow EWG7TK`                           | Currently handled like *give way*: wait until the traffic has passed, then continue      |

Words after the callsign ("from the left", "passing left to right") are ignored. The callsign of the traffic can be in any form listed under [Callsigns](#callsigns).

### Follow-me and tows

| You say | Effect |
| ------- | ------ |
| `follow the follow-me` / `follow follow-me 1` | A follow-me car drives from its base to the aircraft and leads it along its route (ICAO: FOLLOW (description of vehicle)). Without a route of its own (just vacated) the aircraft is led to its allocated stand. |
| `follow the follow-me to stand 14 [via N, L2]` / `taxi to stand 14 via N, follow the follow-me` | The same with a destination |
| `Tug 5, tow approved [to stand 45] [via M, N]` | Approves a tow (ICAO PANS-ATM: TOW APPROVED VIA (routing)). Without a destination the tug tows to the stand it asked for. A tug on a stand that needs a pushback pushes the aircraft off first. |
| `Tug 5, hold position` / `continue` / `hold short of ...` / `cross runway 25` / `give way to ...` | As for aircraft |

Tugs are addressed by their callsign: `Tug 5` (TUG5). They refuse `pushback approved` (`we are a tow, request tow approval`) and hand-offs (`we stay on your frequency until the tow is complete`).

### Vehicles

Vehicles on the manoeuvring area are controlled like aircraft, with one difference in wording: vehicles get **"proceed"**, aircraft get "taxi" (vehicles are never "cleared"). Callsigns: `Follow-me 1` / `Follow-me 2` (FME1, FME2) and `Tug 1` ... `Tug 9` (TUG1 ...).

| You say | Effect | Read-back |
| ------- | ------ | --------- |
| `Follow-me 1, proceed [to DCEEO] [via N, F]` | The follow-me drives to the aircraft it is assigned to (along the taxiways you give, otherwise the shortest way) | `Proceeding to DCEEO via N, F, Follow-me 1` |
| `Follow-me 1, proceed to base [via ...]` / `return to base` / `return to the fire station` | Drives back to its base (job finished, or cancelled) | `Proceeding to base, Follow-me 1` / `Returning to base, Follow-me 1` |
| `Follow-me 1, hold position` | Stops (while leading: the aircraft behind it stops too) | `Holding position, Follow-me 1` |
| `Follow-me 1, continue` | Drives on | `Continuing, Follow-me 1` |
| `Follow-me 1, standby` | Acknowledges the request; the driver waits a little longer before asking again | - |
| `Tug 5, proceed [to stand 45] [via M, N]` | Same as `tow approved` | `Tow approved to stand 45 via M, N, Tug 5` |

Calls from vehicles:

| Situation | Example |
| --------- | ------- |
| Follow-me assigned to an aircraft (after `follow the follow-me`) | `Stuttgart Ground, Follow-me 1, request proceed to DCEEO at taxiway F` |
| Follow-me has brought the aircraft to its stand | `Stuttgart Ground, Follow-me 1, DCEEO is at the stand, request return to base` |
| Tow request | `Stuttgart Ground, Tug 5, request tow Eurowings A320 from stand 14 to stand 45` |

A follow-me only drives onto the taxiways after your `proceed`; the aircraft waits until the car is in front of it. Unanswered vehicles call again like pilots (every 60-90 s, up to five times). When the AI runs Ground (you staff Delivery only), vehicles do not call: their requests are approved automatically.

### Tower

| You say | Effect |
| ------- | ------ |
| `line up and wait [runway 25]` | Departure at (or taxiing to) the holding point lines up and waits. It is not a take-off clearance. |
| `behind landing EWG7TK, line up and wait behind` / `behind the landing A320, line up and wait behind` | Conditional line-up: the departure enters the runway once the landing aircraft has passed. |
| `[wind 250 degrees 8 knots,] [runway 25,] cleared for take-off` | Take-off clearance. From the holding point the aircraft lines up and rolls without stopping. The wind is information only. |
| `hold position, cancel take-off [, I say again, cancel take-off]` / `stop immediately` | Cancels a take-off clearance; during the roll the crew stops below 80 kt (`unable, we are taking off` above). |
| `[wind ...,] [runway 25,] cleared to land` | Landing clearance (required, otherwise the crew goes around at 0.5 NM) |
| `continue approach` (also just `continue` to an aircraft on final) | The landing clearance comes later |
| `maintain 160 knots until 4 miles` / `reduce speed to 150 knots` / `speed 170 knots` | Speed control on final (default until 4 NM, then the crew slows to its approach speed). Below the approach speed: `unable, our minimum speed is 135 knots`; above 210 kt or inside the given distance: unable |
| `reduce to final approach speed` / `resume normal speed` | Cancels the speed restriction |
| `cleared for immediate take-off` / `cleared for take-off, no delay` | Take-off into a tight gap: brisk line-up and roll without waiting |
| `go around [, I say again, go around]` | The arrival goes around |
| `vacate via E` | The exit to take after landing (used if it can still be reached) |
| `contact radar [119.200]` / `contact Langen Radar 119.200` / `contact departure` | Departure to Radar after take-off (`confirm contact Radar, we are not airborne yet` on the ground) |
| `contact ground [118.605]` | Arrival (or crossing aircraft) to Ground once it has vacated |
| `cross runway 25` | Crossing for an aircraft Ground handed over at the runway holding point |

A wrong runway is queried: `confirm runway 07, we are departing runway 25`. A departure with a CTOT that is not due yet answers `negative, our CTOT is 1435, we can depart from 1430`.

### Clearance delivery

| You say | Effect |
| ------- | ------ |
| `cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312` | IFR clearance. Clearance limit: destination name (`Frankfurt`, `Paris Charles de Gaulle`) or ICAO code (`EDDF`). SID: designator, also spelled (`kilo romeo hotel two whiskey`). Optional: `runway 25`, `CTOT 1435`. Altitude: `5000 feet`, `five thousand feet`, `flight level 70`, also after `maintain`. Also `..., KRH2W departure, ...` without `via`. |
| `readback correct` / `read back correct` | Confirms a readback |
| `squawk 2312` / `negative, squawk 2312` | Assigns (or corrects) a squawk code (octal digits 0-7) |
| `CTOT 1435` / `slot 1435` | Tells the crew its calculated take-off time |
| `start-up approved` | Start-up (needs the clearance) |
| `contact ground 118.605` | Hand-off to Ground (needs the clearance) |

`cleared to cross runway 25` is a crossing clearance, not an IFR clearance. A datalink clearance (DCL) is sent from the aircraft menu, not by voice.

### Frequency change

| You say                                                  | Effect                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `contact tower 118.805` / `contact Stuttgart Tower 118.805` | Hand-off to Tower. The pilot reads back and changes frequency. |
| `contact tower`                                          | Same; the pilot fills in the frequency                         |
| `monitor tower 118.805`                                  | Treated like *contact*                                         |
| `frequency change approved`                              | Departures: switch to Tower                                    |

A wrong frequency gets `confirm frequency 118.700 for Tower`. Departures that are still on the stand or pushing back reply `confirm contact Tower, we are not yet taxiing`. Station words understood: `tower`, `ground`, `apron`, `delivery`/`clearance`, `approach`/`radar`/`director`, `departure`, `center`/`centre`.

### Other

| You say          | Effect                                                                         |
| ---------------- | ------------------------------------------------------------------------------ |
| `standby`        | Acknowledges a request; the pilot doesn't call again for 2 minutes            |
| `number 2 [for pushback\|start-up\|taxi\|departure]` | Queue position in busy periods. The pilot reads it back (`Number 2 for pushback`) and waits 60 s + 45 s per position before reminding you. The number is shown in the tag (`#2`) and in the list. |
| `expect pushback\|start-up\|taxi\|departure in 5 minutes` | Expected delay. The pilot waits that long (plus 20 s) before reminding you. |
| `say again`      | The pilot repeats their last transmission                                      |
| `line up ...`, `cleared for take-off`, `cleared to land` (to an aircraft on Ground frequency) | Not Ground's job. The pilot asks `confirm, we are on Ground frequency, contact Tower?` |

## Radio discipline

After an instruction the frequency belongs to the station you addressed: **nobody else calls until it has read back** (at most 6 s after your transmission has ended; then waiting calls may go ahead). If you address a second station before the first one has answered, the frequency is kept for the second one, and the first answers afterwards.

## Combining instructions

Several instructions can be sent in one transmission, in any order:

```
DLH5AB push and start approved facing east
EWG7TK taxi to holding point A via L2, S, hold short of taxiway H
THY1734 hold position, give way to DLH5AB
CFG123 cross runway 25, taxi to stand 105 via W, V
```

The pilot reads back all instructions in one transmission. If one of them can't be executed, that part is answered with the reason (for example `unable ...`), and the others are still executed.

## Pilot read-backs and replies

Read-backs repeat the safety-relevant parts and end with the callsign:

| Instruction                                         | Read-back                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `pushback approved facing east`                     | `Pushback approved, facing east, Lufthansa 5AB`                     |
| `push and start approved`                           | `Push and start approved, Lufthansa 5AB`                            |
| `taxi to runway 25 via L2, S`                       | `Taxi to holding point A runway 25 via L2, S, Lufthansa 5AB` (the chosen holding point is named) |
| `taxi to stand 14 via N, L2, hold short of taxiway H` | `Taxi to stand 14 via N, L2, hold short of taxiway H, Eurowings 7TK` |
| `cross runway 25`                                   | `Cross runway 25, Turkish 1734`                                     |
| `hold position`                                     | `Holding position, Lufthansa 5AB`                                   |
| `continue taxi`                                     | `Continue taxi, Lufthansa 5AB`                                      |
| `give way to EWG7TK`                                | `Give way to Eurowings 7TK, Lufthansa 5AB`                          |
| `contact tower`                                     | `Tower 118.805, goodbye, Lufthansa 5AB`                             |
| `line up and wait runway 25`                        | `Line up and wait runway 25, Lufthansa 5AB`                         |
| `wind 250 degrees 8 knots, runway 25, cleared for take-off` | `Cleared for take-off runway 25, Lufthansa 5AB`             |
| `runway 25, cleared to land`                        | `Cleared to land runway 25, Eurowings 7TK`                          |
| `go around`                                         | `Going around, Eurowings 7TK`                                       |
| `maintain 160 knots until 4 miles`                  | `160 knots until 4 miles, Eurowings 7TK`                            |
| `cleared for immediate take-off`                    | `Cleared for immediate take-off runway 25, Lufthansa 5AB`           |
| `hold position, cancel take-off`                    | `Holding position, take-off cancelled, Lufthansa 5AB`               |
| `contact radar 119.200`                             | `Radar 119.200, goodbye, Lufthansa 5AB`                             |
| `tow approved` (to a tug)                           | `Tow approved to stand 45, Tug 5`                                   |
| `follow the follow-me` (just vacated)               | `Follow the follow-me to stand 14, DCEEO`                           |
| `cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312` | `Cleared to Frankfurt, KRH2W departure, climb 5000 feet, squawk 2312[, CTOT 1435], Lufthansa 5AB` - now and then with a **wrong squawk**: correct it |
| IFR clearance with a missing or wrong part          | `Confirm KRH2E departure, information R says runway 25 in use, ...` / `Confirm clearance limit, our destination is Frankfurt` / `Request squawk` / `Confirm initial climb` |
| `squawk 2312`                                       | `Squawk 2312, Lufthansa 5AB`                                        |
| `readback correct`                                  | *(no read-back)*                                                    |
| `start-up approved` without a clearance             | `Negative, we have no clearance yet, Lufthansa 5AB`                 |
| a route that needs a tug                            | `Taxi to ..., we need a tug to turn around, expect about 7 minutes, Lufthansa 5AB` |
| `expedite taxi`                                     | `Expediting, Lufthansa 5AB`                                         |
| `standby`                                           | *(no read-back)*                                                    |
| `number 2 for pushback`                             | `Number 2 for pushback, Condor 11`                                  |
| `cancel pushback`                                   | `Pushback cancelled, Lufthansa 5AB`                                 |
| `taxi via S, hold short of E`                       | `Taxi via S, hold short of taxiway E, Lufthansa 5AB`                |
| `advise able for departure from intersection D`     | `Affirm, able intersection D, Lufthansa 5AB` / `Negative, we require full length, ...` |
| `behind DLH5AB, taxi to ...`                        | `Behind Lufthansa 5AB, taxi to ..., Eurowings 7TK`                  |

## Pilot calls

Pilots on your frequency call on their own:

| Situation                                               | Example                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Clearance request (Delivery, first contact, 10 min before off-block) | `Stuttgart Delivery, Lufthansa 5AB, A320, stand 14, information E, request clearance to Frankfurt` (DCL crews: no call, `DCL` in the list) |
| Start-up request (Delivery; with A-CDM at the TSAT)     | `Stuttgart Delivery, Lufthansa 5AB, stand 14, ready for start-up, TSAT 1452`            |
| After start-up approval (Delivery)                      | `Stuttgart Delivery, Lufthansa 5AB, start-up approved, request frequency for pushback`  |
| Departure ready (first contact)                         | `Stuttgart Ground, Lufthansa 5AB, stand 14, information E, request pushback` (sometimes `request push and start`) |
| Pushback and start-up complete                          | `Lufthansa 5AB, ready for taxi`                                                        |
| Arrival has vacated the runway (first contact)          | `Stuttgart Ground, Eurowings 7TK, vacated runway 25 via E` (crews unfamiliar with the airport add `, request follow-me to the stand`) |
| (Tower) Departure handed over on the way to the holding point | `Stuttgart Tower, Lufthansa 5AB, approaching holding point A, ready for departure` |
| (Tower) Departure at the holding point (if not called before) | `Stuttgart Tower, Lufthansa 5AB, holding point A, ready for departure` |
| (Tower) Arrival on final (first contact)                 | `Stuttgart Tower, Eurowings 7TK, ILS approach runway 25` (LOC / RNP when the ILS is off); reminder `2 miles final runway 25` |
| (Tower) No landing clearance at 0.5 NM                   | `Eurowings 7TK, going around, no landing clearance received` |
| (Tower) Arrival has vacated                              | `Eurowings 7TK, runway 25 vacated via E` |
| (Tower) Crossing handed over by Ground                   | `Stuttgart Tower, Condor 11, holding short runway 25 at W, request crossing`; afterwards `Condor 11, runway 25 vacated` |
| (Tower) Departure airborne, still on Tower               | `Lufthansa 5AB, passing 2800 feet, request frequency change` |
| Tug ready to tow an aircraft to a remote stand          | `Stuttgart Ground, Tug 5, request tow Eurowings A320 from stand 14 to stand 45` (ICAO: REQUEST TOW (company) (type) FROM (location) TO (location)) |
| Departure at the holding point and still with you       | `Lufthansa 5AB, holding point A, ready for departure`                                 |
| Runway holding point on the route, no crossing clearance | `Turkish 1734, holding short runway 25 at W`                                        |
| Head-on with other traffic for over a minute            | `Lufthansa 5AB, we have opposite traffic ahead, EWG7TK, request instructions`          |
| Stopped for over a minute behind an aircraft that waits for instructions (for example at a vacate point) | `Lufthansa 5AB, we are blocked by Eurowings 7TK, waiting on the taxiway ahead, request instructions` |
| Departure on Tower frequency stuck short of the holding point and far from it | `Stuttgart Ground, Lufthansa 5AB, Tower sent us back to you, we are short of the holding point, request taxi` |
| Held short of a taxiway for over two minutes            | `Lufthansa 5AB, holding short of D, request to continue`                               |
| Tower refused the departure (too little runway left)    | `Stuttgart Ground, Lufthansa 5AB, tower sent us back, not enough runway at K for departure 25, request taxi` |
| Medical emergency, arrival (after vacating)             | `Stuttgart Ground, Eurowings 7TK, PAN PAN, medical emergency on board, vacated runway 25 via E, request expedited taxi to the stand, ambulance requested` |
| Medical emergency, departure (while taxiing)            | `Stuttgart Ground, Lufthansa 5AB, PAN PAN, PAN PAN, PAN PAN, medical emergency on board, request immediate return to the stand, ambulance required` |
| Rejected take-off (after vacating)                      | `Stuttgart Ground, Lufthansa 5AB, we rejected take-off due to a technical problem, vacated runway 25 via D, request taxi back to the stand` (or `..., problem solved, ..., request taxi for another departure`) |

If you don't answer, pilots **call again** after 60-90 seconds, up to five times. Reminders are shorter: `Stuttgart Ground, Lufthansa 5AB, stand 14, request pushback`. `standby` stops the reminders for two minutes.

## Spoken input

Speech recognition (see the [user guide](user-guide.md#9-voice)) produces plain words, which are normalised before parsing:

| Spoken                                       | Becomes   |
| -------------------------------------------- | --------- |
| `zero` ... `nine`, `niner`, `tree`, `fife`, `won`, `ate` | `0` ... `9` |
| `ten` ... `ninety`, `twenty five`            | `10` ... `90`, `25` |
| `to`/`too`, `for` after `runway`, `stand`, `gate`, `number`, `in` | `2`, `4` |
| `alpha` (`alfa`) ... `zulu`, `x-ray`         | `a` ... `z` |
| `two five`                                   | `25` (after `runway`) |
| `lima two`                                   | `L2`      |
| `one one eight decimal eight zero five`, `... point ...` | `118.805` |
| `lufthansa five alpha bravo`                 | `DLH5AB`  |

Frequent misrecognitions are corrected before parsing:

| Heard                                                      | Becomes                 |
| ---------------------------------------------------------- | ----------------------- |
| `push back`, `pushed back`, `push bag`                     | `pushback`              |
| `start up`, `stand by`                                     | `startup`, `standby`    |
| `run way`, `holding points`, `hold in point`, `holding position` | `runway`, `holding point` |
| `gulf`, `eco`, `charley`, `mic`, `fox trot`, `x ray`       | `golf`, `echo`, `charlie`, `mike`, `foxtrot`, `xray` |
| `approve`, `improved`, `phasing`                           | `approved`, `facing`    |
| `euro wings`, `speed bird`, `sun express`, `hansa line`, `luft hansa`, `air france`, `tui jet`, `ryan air`, `wiz air` | the telephony designator |

**Fuzzy callsigns**: a telephony word within 1-2 letters of the correct spelling is accepted ("lufthanza"). If the flight number doesn't match exactly, the aircraft of that operator whose flight number is at most one character off is used. If only one aircraft of that operator is on the frequency, it is used even without a flight number.

**Alternatives**: the client parses up to five recognition alternatives and transmits the one that scores best: recognised callsign, number of understood instructions, valid taxi route, no unknown words.

## Not supported (yet)

- Taxi via a runway (backtrack), `line up runway 25 at D` (intersection line-up by Tower), traffic information and wake turbulence cautions.
- `follow` with real follow-the-leader behaviour.
- Expected-start-up phrases with a time (`expect start-up at 1452`); use `expect start-up in 5 minutes`.
- Clearance amendments in parts (`climb amended ...`) - give the full clearance again.
- Non-English phraseology (German "Rollkontrolle" phrases).
