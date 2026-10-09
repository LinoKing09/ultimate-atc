# User guide

This guide explains the controller client screen by screen. It covers the **Delivery**, **Ground** (since v0.6 alone or combined) and **Tower** (since v0.7, on its own) positions at **EDDS**.

- [1. Connecting](#1-connecting)
- [2. Screen layout](#2-screen-layout)
- [3. The scope](#3-the-scope)
- [4. Aircraft tags and colours](#4-aircraft-tags-and-colours)
- [5. Departure and arrival lists](#5-departure-and-arrival-lists)
- [6. Messages and the command line](#6-messages-and-the-command-line)
- [7. Aircraft menu](#7-aircraft-menu)
- [8. Keyboard and mouse reference](#8-keyboard-and-mouse-reference)
- [9. Voice](#9-voice)
- [10. Your job as Ground](#10-your-job-as-ground)
- [11. Your job as Delivery](#11-your-job-as-delivery)
- [12. Your job as Tower](#12-your-job-as-tower)
- [13. Score](#13-score)
- [14. Tips](#14-tips)

---

## 1. Connecting

When the app starts, the **Connect** dialog opens. It works like the connect dialog in EuroScope or a VATSIM login:

| Field             | Meaning                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Airport**       | Airport to control. Only EDDS has data so far; planned airports are listed but disabled.             |
| **Position**      | Controller position: **Delivery**, **Ground** and **Tower** are available; Approach/Departure and Center are planned. A selected position is coloured (Delivery dark blue, Ground green, Tower red). Tower is staffed on its own for now (combined positions with Tower come with 0.8). Click several to staff them together (**combined positions**, for example Delivery + Ground, as one controller does at night): the label below the buttons changes from *Single Position* to a purple **Combined Position**, and the toolbar shows all your stations in their colours with `COMBINED`. Positions you don't staff are run by the simulator. |
| **Callsign**      | Shows the resulting station callsigns, frequencies and radio names, for example `EDDS_DEL 121.915 "Stuttgart Delivery" + EDDS_GND 118.605 "Stuttgart Ground"`. |
| **Traffic**       | `light`, `medium` or `heavy` (see [simulation model](simulation.md#traffic-generation)).          |
| **Special events** | Rare special situations: medical emergencies (arrivals and departures) and rejected take-offs. On by default. See [simulation model](simulation.md#special-events). |
| **Scenario**      | Optional. A **number** is a seed: the same seed with the same settings gives the same traffic. A **scenario code** (for example `EDDS-25-MB0-M10-K7Q2M`) also fixes the runway, traffic mix and scheduled events. **Scenario builder...** creates one from presets or your own choices. Leave it empty for a random session. See [Scenarios and seeds](scenarios.md). |

There is no runway selection: the session starts with a random wind, and the **runway in use is the one with the most headwind** (runway 25 at EDDS unless the tailwind on it is above 3 kt). You change the runway, wind, QNH and ATIS letter during the session in the [ATIS editor](#atis-editor).

The yellow notice shows how accurate the airport data is. Press **Connect** to start. The session begins immediately and the clock runs. Open the [airport briefing](#airport-briefing) (`BRIEFING`) to learn the local procedures.

## 2. Screen layout

![Overview](images/screenshot-overview.png)

```
+--------------------------------------------------------------------------------------+
| ULTIMATE ATC | EDDS_GND 118.605 | RWY 25 | ATIS E | 250/08KT | Q1013 | 14:32:10Z |  |
|   II 1x 2x 4x 8x | TTS ROUTES ROT |            SCORE ... | HELP | DOCS | DISCONNECT       |
+--------------------------------------------------------------------------------------+
| [DEPARTURES list]                                              [ARRIVALS list]       |
|                                                                                      |
|                          ground radar scope                                          |
|                                                                                      |
+--------------------------------------------------------------------------------------+
| message window (radio log)                                                           |
| [DLH5AB] > command line ......................... preview ............ MIC SEND      |
+--------------------------------------------------------------------------------------+
```

### Toolbar

| Element               | Description                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `EDDS_GND 118.605`    | Your station(s) and frequency, in the position colour (several plus `COMBINED` with combined positions). **Click a frequency to switch it off**: the simulator takes the position over (pilots waiting on it are answered by the AI) and it is shown dashed with `OFF`; click again to take it back. At least one frequency stays on. |
| `RWY 25`              | Runway in use. Click to open the [ATIS editor](#atis-editor).                                   |
| `ATIS E`              | Current ATIS letter. Pilots report it on first contact. Click to open the ATIS editor.          |
| `250/08KT`            | Surface wind (magnetic). Shown in red if the tailwind on the runway in use is above 5 kt. Click to edit. |
| `Q1013`               | QNH in hPa. Click to edit.                                                                      |
| `14:32:10Z`           | Simulation time in UTC. The session starts at the current real time.                            |
| `II` / `>`            | Pause / resume. **Space** does the same when the command line is empty.                         |
| `1x 2x 4x 8x`         | Simulation rate. Pilots and Tower run faster too; text-to-speech gets slightly faster.          |
| `TTS`                 | Pilots read their transmissions aloud (text-to-speech).                                         |
| `ROUTES`              | Shows the cleared taxi routes of all aircraft on your frequency. The selected aircraft's route is always shown. |
| `ROT`                 | Rotates the scope: **runway horizontal** like the aerodrome chart (default, runway 07 on the left) or north-up. |
| `BRIEFING`            | Opens the [airport briefing](#airport-briefing).                                               |
| `SYSTEMS`             | Opens the [systems window](#systems-window) (also **F3**). Reads `SYSTEMS (n OFF)` in orange while systems are off. |
| `SETTINGS`            | Opens the [settings menu](#settings) (also **F2**).                                             |
| `SCORE ...`           | Score, departures handed off (`DEP`), arrivals parked (`ARR`) and incidents (`INC`). See [Score](#13-score). |
| `HELP`                | Help window with the tabs *Airport briefing*, *Phraseology* and *Controls* (also **F1**; it opens on the tab you used last). |
| `DOCS`                | Opens this documentation on GitHub.                                                             |
| `DISCONNECT`          | Ends the session and returns to the Connect dialog.                                             |

### ATIS editor

Click `RWY`, `ATIS`, the wind or `Q...` in the toolbar to edit the ATIS:

| Field           | Meaning                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| Information     | The new ATIS letter (pre-set to the next letter)                                           |
| Runway in use   | Runway for departures and arrivals                                                         |
| Wind direction / speed | Surface wind; the dialog shows the head-/tailwind and crosswind for the selected runway. Direction and speed turn red when the tailwind on the selected runway is above 5 kt |
| QNH             | Pressure setting                                                                           |

**Broadcast ATIS** publishes the new information. It appears in the message window, and pilots quote the new letter on first contact. The ATIS does not change on its own.

**Runway change**: departures that are not yet taxiing get the new runway and a matching SID. Arrivals further out than 3.5 NM are re-sequenced onto the new final by Approach; arrivals closer in still land on the old runway. Aircraft that are already taxiing keep their clearance, so re-route them to a holding point of the new runway. If an aircraft ends up at the wrong end, Tower sends it back to you.

### Airport briefing

`BRIEFING` in the toolbar opens the help window on the **Airport briefing** tab. You can open it at any time; it always shows the current state:

- **At a glance**: airport, your position and frequency, elevation, runways, transition altitude.
- **Now**: runway in use, ATIS letter, wind and QNH, the full-length and intersection holding points, the arrival exits and the taxi flows of the runway in use.
- **Local procedures** for your position: your job, standard taxi flows, departures (entries, push directions, typical routes), arrivals (exits, vacating, typical routes), stands, hot spots and pitfalls.
- **Frequencies** of all stations, and the data accuracy notice.

Every airport added in the future comes with its own briefing.

### Settings

`SETTINGS` in the toolbar (or **F2**) opens the settings menu. Changes apply immediately, also in the middle of a session, and are stored in the browser.

| Setting                  | Effect                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Device (phone - laptop slider) | **Mobile** or **PC** layout, see [Mobile mode](#mobile-mode). Touch-only devices start in mobile mode. |
| Interface size           | Size of the text and buttons (80-160 %)                                                    |
| Tag size                 | Size of the aircraft data tags on the scope (80-200 %)                                     |
| Scope orientation        | Runway horizontal (like the chart) or north-up - the same as `ROT`                         |
| Show cleared routes      | The same as `ROUTES`                                                                       |
| Pilot voices (TTS)       | The same as `TTS`                                                                          |
| Voice volume / speed     | Volume and speaking rate of the pilot voices                                               |
| Send voice automatically | Transmit the recognised instruction when you release push-to-talk; off = check and press Enter |
| Recognition accent       | English accent the speech recogniser expects (US, UK, Australia, India, Ireland)           |
| Traffic density          | Light / medium / heavy; applies to traffic generated from now on                           |
| Special events           | Medical emergencies and rejected take-offs                                                 |

**Reset to defaults** restores everything except the airport and position.

### Systems window

`SYSTEMS` (or **F3**) shows the status of the airport's systems - A-SMGCS (surveillance, runway monitoring RMCA, conflicting clearances CATC, routing service), A-CDM, datalink clearances (DCL) and the ILS (localizer, glide path) - with a lamp and an ON/OFF switch each. Switch a system off to train working without it (maintenance, failure). What each system does and what changes when it is off: [Airport and ATC systems](systems.md).

### Mobile mode

Mobile mode is made for touch screens, above all the **iPad** (a phone screen is too small to control comfortably):

- **+ / - / home buttons** on the right of the scope zoom in, out and reset the view.
- **One finger** pans the scope (also when the drag starts on an aircraft), **two fingers** pan and zoom at the same time. The page itself never scrolls, bounces or zooms.
- **Tap once** on an aircraft to select it. **Tap it again** to open its menu; a second tap on a tag item opens that item's function (flight plan, taxi destinations, aircraft menu). A **long press** opens the menu directly. A single tap therefore never sends anything by accident.
- A **quick-action bar** for the selected aircraft: `PUSH` (push and start approved), `TAXI` (taxi destinations), `HOLD`, `RESOLVE` (head-on conflict), `CONT` (continue taxi), `TWR` (contact Tower) and `MENU`, depending on what the aircraft is doing. For tows: `TOW` (tow approved); for a crew that asked for a follow-me: `FLWM`. On Delivery frequency: `CLR` or `DCL` (IFR clearance), `RB OK` (readback correct), `START` (start-up approved), `GND` (contact Ground). **Phrase buttons are picked, not sent**: a tap highlights the button and writes the phrase into the command line, a second tap removes it; **SEND** transmits all picked phrases as one transmission, e.g. `RB OK` + `START` + `GND` gives `readback correct, start-up approved, contact ground 121.900`. Buttons that open a menu (`TAXI`, `CLR`, `RESOLVE`, `MENU`) work as before.
- Larger buttons, menu entries, list rows, symbol hit areas and tags; sub-menus open with a tap. List rows react to the first tap (they are updated in place, never rebuilt under your finger).
- On narrow screens (portrait) the departure and arrival lists start collapsed so the scope has room.
- The command-line preview is hidden; use voice (`MIC`), the menus or a keyboard.

**iPad with a hardware (Bluetooth) keyboard**: just start typing, the first letter already goes into the command line. Tapping the command line does not push the page up any more: the layout shrinks to the area above the keyboard bar. The command line is not a form field, so Safari shows no AutoFill buttons (passwords, cards, contacts) and no form arrows for it. The small bar iPadOS shows at the bottom while a hardware keyboard is connected (language switch, shortcuts) belongs to the system and cannot be removed by a web page; iPadOS can hide the shortcut part under *Settings > General > Keyboard > Shortcuts*.

## 3. The scope

The scope is a ground radar showing the aerodrome chart. By default it is rotated like the official aerodrome chart, with the runway horizontal; **ROT** switches to north-up:

| Element                                | Drawn as                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Runway                                 | Black strip with a dashed centre line, threshold bars and designators          |
| Taxiways and taxilanes                 | Grey bands with a thin yellow centre line                                      |
| Taxiway designators                    | Yellow letters in dark boxes (`N`, `S`, `R`, `D` ...). Long taxiways (N, S, M) repeat their designator about every 600 m when you zoom in |
| Runway holding positions               | Thick yellow bar across the taxiway, labelled with the holding point (`A`, `K`, `W` ...) |
| Stands                                 | Thin yellow lead-in line plus the stand number                                 |
| Aprons                                 | Slightly lighter areas                                                         |
| Buildings                              | Brown areas with names                                                         |
| Scale bar                              | Bottom left                                                                    |

Details appear and disappear depending on zoom: centre lines and stand numbers only show when zoomed in.

**Navigation**

- **Mouse wheel**: zoom around the mouse cursor. On touch screens, pinch with two fingers.
- **Drag** on empty space, with the left or right mouse button: pan.
- **Home**: reset the view to the whole airport.
- **Double-click a list row**, or use *Centre view* in the aircraft menu: centre on an aircraft.

**Routes on the scope**

- The **selected aircraft's** cleared route is a solid cyan line. With `ROUTES` on, the routes of all aircraft taxiing on your frequency are dashed lines.
- Small squares mark where the aircraft will stop: **red** = runway holding point without a crossing clearance, **yellow** = hold short of a taxiway, **cyan/grey** = destination.
- While you type a taxi instruction, the resulting route is previewed as a **green dashed line**.

## 4. Aircraft tags and colours

Every aircraft is drawn as a top-down silhouette at real size (with a minimum size, so it stays visible when zoomed out) and carries a data tag:

```
DLH5AB PAN *    callsign; "PAN" = emergency, "*" = waiting for your answer
A320 A          aircraft type + where it is cleared to (A = holding point, S14 = stand 14, HS F = hold short of F, >14 = suggested stand)
TAXI 15 #2      ground status + ground speed in knots + queue number you gave ("number 2 for ...")
```

Like in EuroScope, **the tag items are clickable**. Hovered items are highlighted:

| Item                          | Left click                                                              |
| ----------------------------- | ----------------------------------------------------------------------- |
| Callsign                      | Flight plan card: **radiotelephony callsign** (e.g. `SPEEDBIRD 947`), type, route, SID, runway, squawk, stand, frequency |
| Aircraft type                 | Same flight plan card                                                   |
| Cleared-to (`A`, `S14`, `---`) | Taxi menu: holding points for departures, stands for arrivals         |
| Status (`TAXI`, `RQST`, ...)  | The full [aircraft menu](#7-aircraft-menu)                              |

**Hovering over the callsign** adds a line with the radiotelephony callsign below it, so you know how to address the aircraft. The selected aircraft's telephony is also shown in front of the command line (`[BAW947 SPEEDBIRD 947]`).

Airborne aircraft (arrivals on final, departures after take-off) show altitude in hundreds of feet and speed, for example `A034 140`, plus a speed vector line.

To keep the apron readable, parked aircraft with no pending request only get a tag when you zoom in or select them. **Drag a tag** with the mouse to move it; *Reset tag position* in the aircraft menu puts it back.

### Extended centrelines

From each runway threshold an extended centreline runs 15 NM outwards with a tick every NM and a longer tick every 5 NM (like the approach path / ILS localizer course lines on a EuroScope map). The runway in use is drawn solid and brighter, the other dashed. With the localizer switched off in the systems window, the line is marked `LOC U/S`. Zoom out to see the arrivals on final.

### Ground status codes

| Code    | Meaning                                                     |
| ------- | ----------------------------------------------------------- |
| `----`  | Parked on the stand, no IFR clearance yet                   |
| `CLRD`  | Parked, IFR clearance received                              |
| `RQST`  | Parked, with a request (clearance, start-up, pushback, taxi) |
| `PUSH`  | Pushback in progress                                        |
| `ST-UP` | Start-up approved, or pushback complete and starting engines |
| `TAXI`  | Taxiing                                                     |
| `HOLD`  | Holding position on your instruction                        |
| `HS-R`  | Holding short of a runway, waiting for a crossing clearance |
| `H/P`   | At the runway holding point (destination)                   |
| `L/U`   | Lined up on the runway (Tower)                              |
| `DEPA`  | Departing (take-off roll and climb)                         |
| `APP`   | On final approach                                           |
| `LAND`  | Landing roll                                                |
| `VAC`   | Vacating the runway                                         |
| `VACD`  | Vacated, waiting for taxi instructions                      |
| `PARK`  | Arrived on the stand                                        |
| `G/A`   | Going around                                                |

### Colours

| Colour                       | Meaning                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| White                        | On your frequency                                               |
| Grey                         | On another frequency (Tower, or a position run by the simulator) |
| Flashing red                 | A-SMGCS CATC: cleared routes meet head-on (see [Resolve conflict](#7-aircraft-menu)) |
| Flashing yellow              | Waiting for your answer (a request is pending)                  |
| Flashing orange              | Waiting for more than a minute                                  |
| Flashing magenta, `PAN`      | Emergency (medical) - give priority                             |
| Red                          | Involved in a collision                                         |
| Cyan circle                  | Selected aircraft                                               |
| Orange box at the nose       | Tug (pushback, tow, turnaround) - only with vehicle tracking on: on the surface radar alone it merges with the aircraft |
| Yellow box `FOLLOW-ME 1`     | Follow-me car (the label needs vehicle tracking in the [systems window](#systems-window)) |

## 5. Departure and arrival lists

The lists work like EuroScope's departure and arrival lists. Aircraft waiting for you are sorted to the top, the longest-waiting first. Drag a list by its title bar; the `_` button collapses it.

**DEPARTURES**

| Column | Content                                                                            |
| ------ | ---------------------------------------------------------------------------------- |
| C/S    | Callsign                                                                           |
| TYPE   | ICAO aircraft type / wake category (L, M, H)                                       |
| STD    | Stand (empty once pushed back)                                                     |
| ADES   | Destination                                                                        |
| SID    | Standard instrument departure from the flight plan, or the one you cleared (placeholder names) |
| RWY    | Departure runway                                                                   |
| IFR    | `CLR` once the crew has its IFR clearance                                          |
| SQ     | Assigned squawk                                                                    |
| TSAT   | Target start-up approval time from the A-CDM sequencer (empty with A-CDM off)      |
| CTOT   | Calculated take-off time (ATFM slot) if the flight has one                         |
| TAXI   | Where the aircraft is cleared to taxi (holding point)                              |
| STS    | Ground status (see above)                                                          |
| FRQ    | Frequency the pilot is on: `DEL`, `GND` or `TWR`                                   |
| REQ    | Pending request and how long the pilot has been waiting                            |

**ARRIVALS**

| Column | Content                                                                            |
| ------ | ---------------------------------------------------------------------------------- |
| C/S, TYPE | as above                                                                        |
| ADEP   | Origin airport                                                                     |
| RWY    | Landing runway                                                                     |
| SEQ    | Position in the arrival sequence on final (1 = next to land)                       |
| LND    | `CLR` once the arrival is cleared to land (Tower)                                   |
| APCH   | Approach procedure while on final: `ILS`, `LOC` (localizer only) or `RNP` - see the [systems window](#systems-window) |
| DIST   | Distance to the threshold while on final; afterwards the exit used                 |
| STD    | Cleared stand, or the **suggested stand in brackets** (from the stand allocation)  |
| STS, FRQ, REQ | as above                                                                    |

Request codes in the `REQ` column:

| Code   | The pilot ...                                               |
| ------ | ----------------------------------------------------------- |
| `PUSH` | requests pushback                                           |
| `TAXI` | is ready for taxi (after pushback, or on a taxi-out stand)  |
| `TXIN` | has vacated the runway and needs taxi instructions          |
| `RDY`  | is at the holding point, ready for departure (hand over to Tower!) |
| `XRWY` | is holding short of a runway on the route, requesting to cross |
| `BLKD` | is stuck in front of opposing traffic and needs instructions |
| `RTE?` | needs further instructions (route problem, long hold short) |
| `CLR`  | requests its IFR clearance by voice (Delivery)              |
| `DCL`  | requests its IFR clearance by datalink - send it from the aircraft menu |
| `STUP` | is ready for start-up (with A-CDM: at its TSAT)             |
| `FREQ` | has start-up and asks for the frequency for pushback (`contact ground`) |
| `FLWM` | has vacated and asks for a follow-me to the stand           |
| `TOW`  | a tug asks to tow an aircraft to another stand              |
| `RDY`  | (Tower) at the holding point, ready for departure           |
| `LDG`  | (Tower) on final, expects the landing clearance             |
| `VACD` | (Tower) has vacated the runway (after landing or a crossing), expects `contact ground` |
| `RDR`  | (Tower) airborne, asks for the frequency change to Radar    |

**VEHICLES** (only shown while vehicles are at work): tows - callsign of the tug (`TUG5`), the towed aircraft and its type, from and to stand, status, frequency, request - and follow-me cars: callsign (`FME1`), the aircraft it works for, status (`ASSG` assigned, `PROC` proceeding to the aircraft, `LEAD` leading, `DONE` waiting to return, `RTB` returning to base, `HOLD`) and request (`PROC` wants to proceed, `RTB` wants to return to base).

Click a row to select the aircraft, double-click to centre the scope on it, right-click for the [aircraft menu](#7-aircraft-menu).

## 6. Messages and the command line

### Sidebar

Right of the message window: large **MIC** (push-to-talk) and **SEND** buttons, **NEXT** (the next aircraft with a pending request, like Tab), **STANDBY** and **SAY AGAIN** (to the selected aircraft, or the pilot who called last).

### Message window

Shows all radio traffic on your frequency plus system messages:

| Colour        | Line                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| Light blue    | Your transmissions (`EDDS_GND`)                                             |
| White         | Pilot transmissions                                                         |
| Grey italic   | System information (for example ATIS changes)                               |
| Red bold      | Incidents (collisions, runway incursions, go-arounds) and warnings (A-SMGCS alerts RMCA and CATC, readback errors not caught, missed CTOTs) |
| Yellow        | Hints for you, not transmitted (for example "DLH5AB is not on your frequency") |

Click a line to select the aircraft it belongs to.

There is **one frequency**: only one station talks at a time. Pilots wait until the frequency is free, and read-backs come before new calls. Your own transmissions go out immediately, so avoid "stepping on" a pilot by answering too fast in a busy situation.

### Command line

Type an instruction and press **Enter** (or click **SEND**). The full grammar is in the [phraseology reference](phraseology.md). In short:

```
[callsign] instruction[, instruction ...]
DLH5AB pushback approved facing east
Lufthansa 5AB, taxi to holding point A via L2, S, hold short of taxiway H
taxi to stand 14 via N R          <- goes to the selected aircraft
```

- The **target** on the left (`[DLH5AB]`) is the selected aircraft. It receives instructions without a callsign.
- The **preview** on the right shows how your text was understood:
  - **green**: understood, and the route (if any) is valid. The route is drawn on the scope.
  - **orange**: understood and valid, but there is a catch: the A-SMGCS (CATC) warns that the route meets other traffic head-on (`-- CATC: head-on with EWG7TK on N`), or the stand is taken (`-- stand 14 taken by DLH5AB`; the crew will accept it and only notice when it gets there). You can still transmit it.
  - **red**: understood, but it won't work, for example `unable to follow route via S`, or the aircraft is not on your frequency.
  - **grey** `? ...`: words that were not understood.
- When you transmit, the message window shows your instruction in clean phraseology. For example, `dlh5ab taxi a via l2 s` becomes `Lufthansa 5AB, taxi to holding point A via L2, S`, unless parts of it were not understood; then your raw text is shown.
- **Up / Down** browse the history of your last 50 transmissions. **Esc** clears the line, or deselects if the line is already empty.
- The **×** button right of the text clears the line (it appears as soon as there is text; in mobile mode the keyboard stays open).
- Typing anywhere on the page focuses the command line.

## 7. Aircraft menu

Right-click an aircraft symbol, its tag, or its list row to open the menu. Items are disabled when they don't make sense in the current state.

| Item                          | Sends                                              | Available when                                |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------- |
| Pushback approved -> facing    | `pushback approved [facing east/west/...]`         | Departure parked on a pushback stand          |
| Push and start approved -> ... | `push and start approved [facing ...]`            | same                                          |
| Start-up approved             | `start-up approved`                                | Parked                                        |
| Taxi to -> holding point       | `taxi to holding point A via ...` (shortest route, following the standard flows) | Departure after pushback, or on a taxi-out stand |
| Taxi to stand -> stand         | `taxi to stand 14 via ...` (assigned stand first, then free stands nearby) | Arrival on the ground, or a departure returning to a stand |
| Stop pushback / Cancel pushback | `stop pushback` / `cancel pushback`              | During pushback                               |
| Able intersection? -> intersection | `advise able for departure from intersection D` | Departure on the ground; the hint shows the answer once given |
| Hold position                 | `hold position`                                    | Taxiing                                       |
| Continue taxi                 | `continue taxi`                                    | Taxiing                                       |
| Hold short of -> taxiway       | `hold short of taxiway D`                          | Taxiways the remaining route joins or crosses |
| Cross runway 25               | `cross runway 25`                                  | A runway holding point is ahead on the route  |
| Give way to -> traffic         | `give way to EWG7TK`                               | Other ground traffic (not parked) within 800 m |
| Resolve conflict with ... -> option | a re-route (`taxi to holding point A via ...`) for one of the two, or `cancel pushback` | Two aircraft block each other (see below) |
| Follow the follow-me          | `follow the follow-me` (to the allocated stand if the aircraft has no route yet) | Aircraft on the ground, not parked |
| Tow approved to stand 45 / Tow approved to stand -> stand | `tow approved` / `tow approved to stand 52` | A tug on a stand (tow request) |
| Contact Tower 118.805         | `contact tower 118.805`                            | Departure taxiing or at the holding point     |
| Number ... for pushback/taxi/departure | `number 2 for pushback`                   | A request is pending                          |
| Standby                       | `standby`                                          | A request is pending                          |
| Say again                     | `say again`                                        | always                                        |
| Centre view                   | -                                                  | always                                        |
| Reset tag position            | -                                                  | always                                        |

**Hovering over a destination** in the *Taxi to* sub-menus draws the proposed route on the scope. The hint on the right shows the `via` list that will be transmitted, and `! head-on EWG7TK` when the A-SMGCS (CATC) sees a conflict. With the routing service off, the menu offers the destinations without a route. Menu actions are transmitted exactly like typed text, so they show up in the message window and get a read-back.

**Resolve conflict**: when two aircraft face each other on a taxiway, the menu (and `RESOLVE` in the mobile quick-action bar) offers the ways out a real Ground controller has: one aircraft turns off via another taxiway while the other waits (each option is checked to keep clear of the other aircraft's route), or - if there is no junction left between them - a **tug** turns one aircraft around. Airliners cannot make a U-turn on a taxiway, so the tug takes 5 to 10 minutes (the pilot tells you the expected time). Hover an option to see its route.

**Follow-me cars** (right-click the car or its row in the VEHICLES list) have their own menu: *Proceed to DCEEO*, *Return to base*, *Hold position*, *Continue*, *Standby* - see the [vehicle phraseology](phraseology.md#vehicles). In mobile mode the quick-action bar shows `PROCEED`, `BASE`, `HOLD`, `CONT`. **Tab** also selects vehicles with a pending request.

**On Tower frequency** (you staff Tower) the menu offers the Tower clearances: *Line up and wait runway 25*, *Behind ... line up and wait* (behind a landing aircraft), *Cleared for take-off* (with the wind; the hint shows whether the runway is occupied, how long the departure spacing still needs, or when the next arrival comes), *Cleared for immediate take-off*, *Speed* (maintain 150-180 kt until 4 NM, reduce to final approach speed), *Cancel take-off* / *Stop immediately*, *Cleared to land*, *Continue approach*, *Continue, expect late landing clearance*, *Go around*, *Vacate via*, *Cross runway 25*, *Contact Ground* and *Contact Langen Radar*. In mobile mode the quick-action bar shows `LUP`, `T/O`, `LAND`, `CONT`, `G/A`, `CROSS`, `GND`, `RDR`, `STOP`, `HOLD`.

**On Delivery frequency** the menu offers instead:

| Item                            | Sends                                                                                  | Available when                         |
| ------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| Send DCL (datalink) -> SID       | Datalink clearance (no voice), squawk shown in the hint                                | The crew requested its clearance by DCL |
| IFR clearance -> SID             | `cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2101[, CTOT 1435]`. The SID of the flight plan's first fix is listed first; the squawk is the next free code | Departure on Delivery frequency (*Amend IFR clearance* once cleared) |
| Readback correct                | `readback correct`                                                                     | Cleared                                |
| Squawk -> ...                    | `negative, squawk 2101` (correct a wrong readback) or a new code                       | Cleared                                |
| Start-up approved               | `start-up approved` (the hint shows the TSAT)                                          | Cleared, still on the stand            |
| CTOT 1435                       | `CTOT 1435`                                                                            | The flight has a CTOT                  |
| Contact Ground 118.605          | `contact ground 118.605`                                                               | Cleared                                |

## 8. Keyboard and mouse reference

| Input                                   | Action                                                         |
| --------------------------------------- | -------------------------------------------------------------- |
| **Enter**                               | Transmit the command line                                      |
| **Esc**                                 | Clear the command line / deselect / close menus                |
| **Tab**                                 | Select the next aircraft with a pending request, longest-waiting first |
| **Up / Down**                           | Command history                                                |
| **Space** (command line empty)          | Pause / resume                                                 |
| **Home**                                | Reset the scope view                                           |
| **F1**                                  | Help                                                           |
| **F2**                                  | Settings                                                       |
| **F3**                                  | Systems window                                                 |
| **Hold the key left of `1`** (`^` / `` ` ``), **Right Ctrl** or **Insert** | Push-to-talk (speech recognition)          |
| Mouse wheel / pinch                     | Zoom                                                           |
| Drag (left or right button)             | Pan; drag a tag to move it                                     |
| Left click                              | Select aircraft (or deselect when clicking empty space); on a tag item: that item's function |
| Right click                             | Aircraft menu                                                  |
| Double click (list)                     | Centre on aircraft                                             |
| Mobile mode: tap / tap again / long press | Select / menu (or tag item) / menu                           |

## 9. Voice

### Pilots speaking (TTS)

Press **TTS** in the toolbar. Every pilot transmission is read aloud with the browser's speech synthesis. Each callsign always gets the same voice, pitch and speaking rate, so you can tell pilots apart. Designators are spelled phonetically: "Lufthansa five Alpha Bravo, taxi to holding point Golf one".

### You speaking (speech recognition)

Hold a push-to-talk key and speak your instruction: the key left of `1` (`^` on German, `` ` `` on US keyboards), **Right Ctrl** or **Insert**. You can also click **MIC** to start and stop. For example: *"Lufthansa five alpha bravo, taxi to holding point golf one via november golf"*. The recognised text appears in the command line while you speak and is transmitted when you release the key.

The goal is to work **by voice only**. Several things help with recognition errors:

- **Alternatives**: the recogniser returns up to five alternatives per phrase. The simulator parses all of them and transmits the one that makes the most sense: known callsign, understood instructions, valid route. If it picks an alternative, the message window shows what it heard (`Heard "..." - using the alternative "..."`).
- **Forgiving callsigns**: telephony designators are matched even when slightly misrecognised ("Lufthanza", "Euro wings", "speed bird"). If the flight number is off by one character, or left out and only one aircraft of that airline is on frequency, the right aircraft is still found.
- **Typical misrecognitions** are corrected: "push back" -> pushback, "gulf" -> golf, "run way" -> runway, "holding position" -> holding point, "twenty five" -> 25, "point" -> decimal in frequencies, "to"/"for" -> 2/4 after "runway", "stand" and "number". See [phraseology.md](phraseology.md#spoken-input).
- **No callsign heard and nothing selected**: the instruction goes to the pilot who called last and is still waiting for an answer.
- **Pilots stop talking** while your push-to-talk key is pressed, so the microphone doesn't hear them.
- Works in Chrome and Edge (Web Speech API). The MIC button is disabled in other browsers.
- If recognition still gets a word wrong, edit the text in the command line and press Enter.

## 10. Your job as Ground

Responsibilities in this simulator:

- **Departures** come to you with their IFR clearance and, with A-CDM, at their TSAT. If you don't staff Delivery, the simulator runs it: the crews already have their clearance and ask you for start-up with the pushback. Departures on drive-through stands (EDDS 40-48, 50-56) don't need a pushback; they call `request taxi` and leave forwards.
  1. Approve **pushback** (and start-up), choosing a facing direction that fits the traffic.
  2. When the pilot is **ready for taxi**, give a **taxi route to a runway holding point**. For runway 25 that is normally `A` (full length); `B`, `C` and `D` are intersection departures. For runway 07 it is `K` (or `Y` from the south), `I`, `H` and `W` are intersections.
  3. **Hand the aircraft over to Tower** (`contact tower 118.805`) when it is at or close to the holding point. Tower then lines it up and clears it for take-off on its own.
- **Arrivals** are landed by Tower. After vacating, they switch to you and call `vacated runway 25 via E`. **Taxi them to a stand.** The suggested stand is shown in brackets; you can give any free stand that is big enough.
- **Runway crossings**: some routes cross the runway, for example from the south apron or for arrivals that vacated to the south. Aircraft stop at the runway holding point and request crossing. Clear them with `cross runway 25` **only when the runway is free**: no arrival on short final, nobody lining up or rolling. Otherwise you cause a runway incursion and possibly a go-around.
- **Keep traffic flowing**: avoid head-on encounters on the same taxiway (the A-SMGCS warns you; see *Resolve conflict* in the [aircraft menu](#7-aircraft-menu)), give way instructions at intersections, and don't push an aircraft onto a taxilane where another one is taxiing. Conditional clearances help here: `behind the A320 passing from left to right, push and start approved facing east`.
- **Busy hours**: give queue positions (`number 2 for pushback`) or expected delays (`expect pushback in 5 minutes`). The pilots then wait without reminding you.
- **Special events**: a crew may declare **PAN PAN (medical emergency)**. Arrivals call after vacating; departures call while taxiing and want to return to a stand. Give them a direct route to a free stand. If they are on the stand within 6 minutes of the call, you get +15 points. After a **rejected take-off**, the aircraft vacates the runway and calls you. It wants to go back to a stand or to taxi for another departure.

## 11. Your job as Delivery

Clearance Delivery (EDDS: `Stuttgart Delivery` 121.915) gives departures their IFR clearance, a squawk and the start-up, then hands them to Ground. If you don't staff Ground, the simulator runs it (pushback, taxi, hand-off to Tower).

1. **Clearance request**: about 10 minutes before off-block (TOBT) the crew calls: `Stuttgart Delivery, Eurowings 51WM, A319, stand 45, information R, request clearance to Berlin`. Crews of datalink-equipped aircraft (about 4 in 10, airline flights only) request it silently: the list shows `DCL` in the REQ column.
2. **IFR clearance**: clearance limit (the destination), SID, initial climb, squawk: `cleared to Berlin via KRH2W departure, climb 5000 feet, squawk 2101`. Pick the SID of the **runway in use** that leads to the **first fix of the flight plan** (the aircraft menu lists it first). If something is missing or wrong, the crew queries it (`confirm KRH2E departure, information R says runway 25 in use`). For a DCL request use *Send DCL* in the aircraft menu: no voice, no readback, the crew answers WILCO.
3. **Readback**: listen to it. About 4 % of crews read back a wrong squawk (two digits swapped). Correct it with `negative, squawk 2101`; otherwise say `readback correct`. A wrong readback that you let pass costs 10 points, a caught one gives 5.
4. **CTOT**: flights with an ATFM slot show it in the CTOT column. Include it in the clearance (`..., CTOT 1435`) or tell the crew separately (`CTOT 1435`). The aircraft must take off between CTOT -5 and +10 minutes; Tower holds it at the holding point until it fits. A missed slot gives a new CTOT 20 to 40 minutes later and -10 points.
5. **Start-up**: with A-CDM the crew calls at its TSAT (`ready for start-up, TSAT 1452`): `start-up approved`. Without A-CDM it calls when ready. Start-up needs the clearance first.
6. **Hand-off**: the crew asks for the frequency for pushback: `contact ground 118.605`.

With **combined positions** (Delivery + Ground) you do both jobs; the aircraft still changes frequency from Delivery to Ground as on a split position.

## 12. Your job as Tower

Stuttgart Tower (118.805) owns runway 07/25. When you staff Tower, Ground and Delivery are run by the simulator, Approach (Langen Radar) brings the arrivals onto final.

1. **Departures** reach the holding point with the AI Ground and call: `Stuttgart Tower, Lufthansa 5AB, holding point A, ready for departure`. Give `line up and wait runway 25` (it lines up and waits) or straight away `wind 250 degrees 8 knots, runway 25, cleared for take-off`. Line up behind landing traffic with `behind landing EWG7TK, line up and wait behind`. A crew with a take-off clearance does not roll while someone is on the runway in front of it.
2. **Spacing**: 2 minutes behind a heavy (3 from an intersection), 2 minutes behind a departure on the same SID fix, 1 minute on diverging SIDs - counted from the previous departure being airborne. Taking off earlier counts as a separation loss (-10). The take-off menu shows how long you still have to wait. CTOT flights may only go from CTOT -5 minutes: the take-off menu warns you, but a crew you clear earlier takes off and it counts as a slot violation (-10).
3. **After take-off** the crew asks for a frequency change: `contact radar 119.200` (+10). If it leaves the control zone (4000 ft above the airport) still on your frequency, it costs 5 points.
4. **Arrivals** call on final: `Stuttgart Tower, Eurowings 7TK, ILS approach runway 25` (or LOC / RNP if the ILS is switched off). Clear them in time: `wind 250 degrees 8 knots, runway 25, cleared to land`. Without a landing clearance the crew goes around at 0.5 NM (an incident, -15); `continue approach` tells it the clearance comes later; `go around` sends it around (-5). `vacate via E` asks for a particular exit.
5. **After landing** the crew reports `runway 25 vacated via E`: `contact ground 118.605` (+10). Until then it waits at the vacate point - and Tower cannot use an exit whose vacate point is occupied. You can also hand it over earlier, right after touchdown (*Contact Ground* in the menu, `GND` in the quick-action bar): it then calls Ground itself once it has vacated.
6. **Runway crossings**: Ground hands aircraft that must cross the runway over at the runway holding point (`holding short runway 25 at W, request crossing`). `cross runway 25` only when nobody is landing or taking off; after crossing the crew reports the runway vacated, then `contact ground`.

The A-SMGCS runway monitoring (RMCA) warns when you give a take-off or landing clearance while the runway is occupied.

## 13. Score

| Event                                                       | Points |
| ----------------------------------------------------------- | -----: |
| Departure handed over to Tower                              |    +10 |
| Arrival parked on a stand                                   |    +10 |
| IFR clearance delivered (departure handed from Delivery to Ground) |    +10 |
| Tow brought to its stand                                    |     +5 |
| Tower: departure handed to Radar after take-off             |    +10 |
| Tower: arrival handed to Ground after vacating              |    +10 |
| Tower: departure left the control zone on your frequency    |     -5 |
| Tower: take-off with too little departure spacing           |    -10 |
| Tower: go-around you instructed                             |     -5 |
| Wrong readback caught and corrected                         |     +5 |
| Wrong readback not caught                                   |    -10 |
| CTOT missed or violated (no take-off inside -5 / +10 minutes) |    -10 |
| Medical emergency on a stand within 6 minutes of the call   |    +15 |
| "Say again" (pilot did not understand)                      |     -2 |
| Slow answer: per 15 s of waiting beyond the first 30 s      |     -1 |
| Go-around caused by an occupied runway (or, as Tower, a missing landing clearance) |    -15 |
| Runway incursion                                            |    -50 |
| Collision                                                   |   -100 |

## 14. Tips

- Use **Tab** to work through requests in order. Then you only need to type the instruction, without the callsign.
- Hover over destinations in the **Taxi to** menu to compare routes before you send one. The suggestions (also those of the quick-action bar in mobile mode) follow the airport's **standard taxi flows** (at EDDS: N eastbound, S westbound), see the [airport page](airports/EDDS.md#standard-taxi-flows) and the airport briefing.
- Plan **pushback direction** with the departure runway in mind. For runway 25 the holding point A is at the east end, so departures from the terminal usually push facing **east** and taxi via L2 or H onto S (the standard flow for 25). If you don't specify, the pilot picks the direction with the shortest taxi.
- Use **`standby`** if you can't answer right away. The pilot then waits two minutes before calling again, instead of reminding you every minute.
- If two aircraft meet **head-on** on a taxiway, neither can pass. Prevent it by holding one at an intersection; the orange CATC warning in the preview tells you before you transmit. If it happens anyway, use *Resolve conflict*: turn one off via a junction, or - last resort - a tug (5 to 10 minutes).
- Run at **2x or 4x** during quiet phases and pause (**Space**) when it gets busy.
