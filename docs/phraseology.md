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

- **Case and punctuation don't matter.** `DLH5AB Taxi To Holding Point G1, via N, G.` and `dlh5ab taxi to holding point g1 via n g` are the same.
- **Filler words are ignored:** `roger`, `please`, `thanks`, `good day`, `bye`, `correction`, `the`, `and` ...
- **Words that are not understood** are listed in the preview (`ignored: ...`). If nothing at all is understood, the pilot replies `Say again, <callsign>?` (-2 points).
- **Designators** can be typed (`G1`, `25`, `118.805`) or spelled in words (`golf one`, `two five`, `one one eight decimal eight zero five`).

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

Notes:

- Facing is matched to the nearest compass direction of the taxilane: at EDDS terminal stands, `east` means towards taxiway F/G and `west` towards D/R.
- A pilot who hasn't called yet and is still boarding replies `negative, we are still boarding, we will call you when ready`.
- Stands without pushback (none at EDDS yet) reply `no pushback required ...`.

### Taxi

```
taxi [to] DESTINATION [via X [,] X ...] [hold short of ...] [cross runway RWY]
taxi via X X ... to DESTINATION
```

| Destination                                    | Example                                          |
| ---------------------------------------------- | ------------------------------------------------ |
| Holding point                                  | `taxi to holding point G1 via N, G`              |
| Holding point with runway                      | `taxi to holding point F1 runway 25 via R, F`    |
| Runway (the pilot picks the full-length holding point on the shortest route) | `taxi to runway 25 via N` |
| Runway at an intersection                      | `taxi to runway 25 at F1`                        |
| Stand                                          | `taxi to stand 14 via N, R` (also `gate 14`, `parking position 14`) |

**The `via` list** must name the taxiways in the order they are used. The router finds the shortest path that follows exactly these taxiways. Taxiways that controllers usually leave out may be omitted:

- the apron taxilane the aircraft starts on (for example `R` after pushback at the terminal),
- the taxiway the aircraft is currently on,
- the taxilane or taxiway the destination lies on (for example `R` for a terminal stand, `G` for holding point G1).

So after a pushback from stand 10, `taxi to holding point G1 via N` is accepted and gives the route R -> N -> G. Without any `via`, the pilot takes the **shortest route**, avoiding runway crossings where possible. This is convenient, but not proper phraseology.

If the route is impossible, the pilot replies `unable to follow route via S, say again route`. An unknown taxiway gives `confirm taxiway Q, we can't find it`. The live preview in the command line shows these problems **before** you transmit.

**Stand assignments** are checked: `stand 14 is occupied` or `stand 22 is too small for us`.

**During pushback or start-up** a taxi instruction is accepted and read back. The aircraft starts taxiing once its engines are running.

### Hold short, hold, continue

| You say                                        | Effect                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `hold short of taxiway D` / `hold short D`     | Stops before the route joins or crosses taxiway D (about 40 m before the centre line)     |
| `hold short of runway 25`                      | Cancels a crossing clearance; the aircraft stops at the runway holding point              |
| `hold position` / `hold` / `stop`              | Stops immediately                                                                          |
| `continue taxi` / `continue`                   | Cancels *hold position*, *give way* and the current or next *hold short of taxiway*       |
| `expedite taxi`                                | Taxis about 5 kt faster                                                                    |

Hold short can be part of the taxi instruction (`taxi to holding point G1 via N, G, hold short of taxiway F`) or sent on its own to an aircraft that is already taxiing. `continue taxi` does **not** clear an aircraft across a runway. The pilot then asks `confirm cleared to cross runway 07/25`.

### Runway crossing

| You say                    | Effect                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `cross runway 25`          | Clears the aircraft to cross runway 07/25 at the holding point it is waiting at, or at the next one on its route |
| `taxi ... , cross runway 25` | Crossing clearance as part of the taxi instruction                                         |

Every runway holding position on a route is a **mandatory stop** unless a crossing clearance was given. Aircraft never enter the runway on their own. Read the [simulation model](simulation.md#runway-incursions-and-go-arounds) to see when a crossing counts as an incursion.

### Give way / follow

| You say                                   | Effect                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `give way to EWG7TK [from the left]`      | The aircraft stops until the named traffic has passed (distance increasing and clear), then continues on its own |
| `follow EWG7TK`                           | Currently handled like *give way*: wait until the traffic has passed, then continue      |

Words after the callsign ("from the left", "passing left to right") are ignored. The callsign of the traffic can be in any form listed under [Callsigns](#callsigns).

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
| `say again`      | The pilot repeats their last transmission                                      |
| `line up ...`, `cleared for take-off` | Not Ground's job. The pilot asks `confirm, we are on Ground frequency, contact Tower?` |

## Combining instructions

Several instructions can be sent in one transmission, in any order:

```
DLH5AB push and start approved facing east
EWG7TK taxi to holding point G1 via N, G, hold short of taxiway F
THY1734 hold position, give way to DLH5AB
CFG123 cross runway 25, taxi to stand 14 via D, N, R
```

The pilot reads back all instructions in one transmission. If one of them can't be executed, that part is answered with the reason (for example `unable ...`), and the others are still executed.

## Pilot read-backs and replies

Read-backs repeat the safety-relevant parts and end with the callsign:

| Instruction                                         | Read-back                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `pushback approved facing east`                     | `Pushback approved, facing east, Lufthansa 5AB`                     |
| `push and start approved`                           | `Push and start approved, Lufthansa 5AB`                            |
| `taxi to runway 25 via N`                           | `Taxi to holding point G1 runway 25 via N, Lufthansa 5AB` (the chosen holding point is named) |
| `taxi to stand 14 via N, R, hold short of taxiway D` | `Taxi to stand 14 via N, R, hold short of taxiway D, Eurowings 7TK` |
| `cross runway 25`                                   | `Cross runway 25, Turkish 1734`                                     |
| `hold position`                                     | `Holding position, Lufthansa 5AB`                                   |
| `continue taxi`                                     | `Continue taxi, Lufthansa 5AB`                                      |
| `give way to EWG7TK`                                | `Give way to Eurowings 7TK, Lufthansa 5AB`                          |
| `contact tower`                                     | `Tower 118.805, goodbye, Lufthansa 5AB`                             |
| `expedite taxi`                                     | `Expediting, Lufthansa 5AB`                                         |
| `standby`                                           | *(no read-back)*                                                    |

## Pilot calls

Pilots on your frequency call on their own:

| Situation                                               | Example                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Departure ready (first contact)                         | `Stuttgart Ground, Lufthansa 5AB, stand 10, information E, request pushback` (sometimes `request push and start`) |
| Pushback and start-up complete                          | `Lufthansa 5AB, ready for taxi`                                                        |
| Arrival has vacated the runway (first contact)          | `Stuttgart Ground, Eurowings 7TK, vacated runway 25 via E`                             |
| Departure at the holding point and still with you       | `Lufthansa 5AB, holding point G1, ready for departure`                                 |
| Runway holding point on the route, no crossing clearance | `Turkish 1734, holding short runway 25 at F2`                                        |
| Head-on with other traffic for over a minute            | `Lufthansa 5AB, we have opposite traffic ahead, EWG7TK, request instructions`          |
| Held short of a taxiway for over two minutes            | `Lufthansa 5AB, holding short of D, request to continue`                               |
| Tower refused the departure (too little runway left)    | `Stuttgart Ground, Lufthansa 5AB, tower sent us back, not enough runway at A1 for departure 25, request taxi` |

If you don't answer, pilots **call again** after 60-90 seconds, up to five times. Reminders are shorter: `Stuttgart Ground, Lufthansa 5AB, stand 10, request pushback`. `standby` stops the reminders for two minutes.

## Spoken input

Speech recognition (see the [user guide](user-guide.md#9-voice)) produces plain words, which are normalised before parsing:

| Spoken                                       | Becomes   |
| -------------------------------------------- | --------- |
| `zero` ... `nine`, `niner`, `tree`, `fife`   | `0` ... `9` |
| `alpha` (`alfa`) ... `zulu`, `x-ray`         | `a` ... `z` |
| `two five`                                   | `25` (after `runway`) |
| `golf one`                                   | `G1`      |
| `one one eight decimal eight zero five`      | `118.805` |
| `lufthansa five alpha bravo`                 | `DLH5AB`  |

## Not supported (yet)

- Conditional clearances ("behind the A320 passing left to right, ...") - only the explicit `give way to <callsign>`.
- Taxi via a runway (backtrack) and line-up instructions; these are Tower's job and come with the Tower position.
- `follow` with real follow-the-leader behaviour.
- Clearance delivery phraseology (IFR clearances, squawks) - planned for the Delivery position.
- Non-English phraseology (German "Rollkontrolle" phrases).
