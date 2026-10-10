# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Combined positions with Tower** (0.8): staff Ground + Tower, Delivery + Tower or all three. Aircraft change frequency as on split positions; after `contact ground` a vacated arrival calls you on Ground for its taxi.
- **Extended runway centrelines** on the scope (as on a EuroScope map): 15 NM from each threshold with NM ticks, the runway in use brighter; marked `LOC U/S` with the localizer off.
- **Tower speed control** on final: `maintain 160 knots until 4 miles`, `reduce speed to 150 knots`, `reduce to final approach speed`; and **immediate take-off**: `cleared for immediate take-off` / `cleared for take-off, no delay`. Both in the Tower menu.
- **All stations** broadcasts: `all stations, information B is now current`, `... runway 25 in use`, `... standby` (holds every open request), `... expect delays` - no read-back. ALL STN in the sidebar (a menu; in mobile mode phrase buttons in the quick-action bar).
- `report position` / `say position` to a follow-me (`On taxiway N, leading DCEEO`) or an aircraft on the ground.
- **Acknowledge CATC alerts**: *Acknowledge CATC alert* in the aircraft menu (`ACK` in the quick-action bar) stops the red flashing of a head-on alert you have checked; a new conflict of the same aircraft alerts again.
- Tower phraseology `continue approach, expect late landing clearance` (also in the Tower menu).
- **Sidebar** next to the message window: a large SEND button on top, MIC, STANDBY and ALL STN.

### Changed

- **Pilots resolve simple conflicts** (0.8): crews who see opposite traffic on their taxiway stop short of the junction between them and ask Ground (`opposite traffic on taxiway N, ... holding short of G, request instructions`), so one can turn off there instead of meeting nose to nose; an aircraft already in the other one's lane goes first, the other waits before entering it (no more stand-offs on connectors like H). The release benchmark rises from 12.8 to 13.3 departures and 5.5 to 6.3 arrivals per hour.
- `continue` to an aircraft on final means `continue approach` (not "continue taxi").
- The AI Ground hands departures to Tower on the way to the holding point (last 600 m) when nothing is left to coordinate on the ground and no CTOT is to be waited for, instead of only once they have stopped there; their first call is `approaching holding point A, ready for departure`.
- A departure does not line up while another aircraft is lined up or on the runway near its entry.
- Tower: *Contact Ground* is offered for an arrival right after touchdown, not only once it has vacated; the crew calls Ground after vacating.
- Tugs are no longer drawn at the nose of aircraft (pushback, tow, turnaround): on the ground radar they merge with the aircraft.
- Follow-me cars move smoothly: they accelerate and brake, turn at a limited rate, wait at the meeting point instead of jumping in front of the aircraft, and are drawn between simulation steps.
- Shorter menus: explanatory hints such as `- not yours`, `into a tight gap` or `as requested` are gone; hints only show live data (distances, times, warnings).
- Mobile mode: the quick-action bar picks phrases instead of sending them at once - tap several (e.g. `RB OK` and `START`) and send them together with **SEND**.

### Added

- **Switch your frequencies off and on**: click a frequency in the toolbar (e.g. `EDDS_DEL 121.915`) to hand that position to the simulator - pilots waiting on it are answered by the AI - and click again to take it back. At least one frequency stays on. New AI Delivery for crews still waiting for their clearance.

### Fixed

- Pilots and vehicles always call the station of the frequency they are on (with combined positions they used to address the primary station, e.g. "Stuttgart Tower" on Ground frequency).
- Speech recognition: after sending or clearing a command the spoken text no longer reappears in the command line (Safari re-sends earlier results; they are now ignored), and SEND switches the microphone off.
- iPad: pilot voices (TTS) were not heard - Safari needs speech to be started from a tap (the first tap now unlocks it), and pausing speech while you transmit left it paused for good; pilot messages now wait and are spoken afterwards.
- iPad: list rows sometimes needed two taps - the lists were rebuilt every 250 ms and a tap during a rebuild was lost. Rows are now updated in place.
- A crew cleared for take-off before its CTOT window no longer refuses and blocks the runway: it takes off, and the early take-off counts as a slot violation (-10). The take-off menu warns `CTOT: not before ...`.
- CATC: aircraft routed head-on now only flash red when at least one of them is on your frequency, not for conflicts between traffic the simulator handles.
- With both Ground and Tower run by the simulator (Delivery only), aircraft that had to cross the runway waited at the runway holding point forever; the AI Ground now lets them cross when the runway is free.

## [0.7.0] - 2026-10-09

The Tower position at Stuttgart.

### Added

- **Tower position** (`EDDS_TWR` 118.805, staffed on its own; combined positions with Tower come with 0.8). Ground and Delivery are run by the simulator, Approach brings the arrivals onto final.
  - Departures call `ready for departure` at the holding point: `line up and wait runway 25` (also `behind landing EWG7TK, line up and wait behind`), `wind 250 degrees 8 knots, runway 25, cleared for take-off`, `hold position, cancel take-off` / `stop immediately`. After take-off the crew asks for a frequency change: `contact radar 119.200`.
  - Arrivals call on final (`ILS approach runway 25`): `cleared to land`, `continue approach`, `go around`, `vacate via E`; without a landing clearance they go around at 0.5 NM. After vacating they report it: `contact ground`.
  - Runway crossings: the AI Ground hands crossing aircraft to Tower at the runway holding point.
  - The departure spacing (2 min behind a heavy or on the same SID fix, 1 min diverging) is checked at the start of each take-off roll; RMCA warns about take-off and landing clearances onto an occupied runway. Crews refuse a take-off before CTOT -5 min and do not roll with traffic on the runway.
  - Tower menu (with spacing / runway / next-arrival hints), quick-action bar, `SEQ` and `LND` columns in the arrivals list, request codes `RDY`, `LDG`, `VACD`, `RDR`, a Tower section in the EDDS briefing and the help window.
  - Score: +10 per departure handed to Radar and per arrival handed to Ground, -10 per separation loss, -5 per missed hand-off or instructed go-around.

### Fixed

- The AI Ground could get stuck in a circle of aircraft blocking each other (a pushback onto a taxiway with traffic behind it); it now cancels the pushback in such a circle.
- *Resolve conflict* could offer a detour across the runway (for example to holding point K via Z, R and Y); such options now come last and are marked *crosses runway*, and the AI Ground never uses them.
- A Tower benchmark (20 sessions with a scripted Tower controller) is part of `npm run benchmark`; see [docs/benchmarks.md](docs/benchmarks.md).

## [0.6.2] - 2026-10-09

Radio phraseology for vehicles and radio discipline.

### Added

- **Vehicle phraseology**: follow-me cars are radio stations (`Follow-me 1`, `Follow-me 2`). After `follow the follow-me` the driver asks `request proceed to DCEEO at taxiway F`; you answer `proceed [to DCEEO] [via ...]`. When the job is done it asks `request return to base` (`return to base` / `proceed to base`). `hold position`, `continue` and `standby` work for vehicles; tugs also understand `proceed`. Vehicles get "proceed", aircraft "taxi". Help window (new *Vehicles* table), aircraft-style menu, quick-action bar and Tab selection for vehicles; the list is now called **VEHICLES** and also shows the follow-me cars.
- **Radio discipline**: after your instruction nobody else calls until the addressed station has read back (at most 6 s after your transmission).

### Changed

- Tugs are only shown with vehicle tracking (their ADS-B squitter) switched on: on the surface movement radar alone, a tug at the nose merges with the aircraft's return.
- ATIS editor: the hint "Runway 07 would be into wind" is gone; wind direction and speed turn red when the tailwind on the selected runway is above 5 kt.

## [0.6.1] - 2026-10-09

Ground vehicles (tugs, tows, follow-me), ILS and vehicle tracking in the systems window, a calmer session start, and an A-CDM fix.

### Added

- **Tugs on the scope**: an orange tug at the nose of every aircraft being pushed back or towed, or waiting for a turnaround.
- **Tows**: 15 % of the aircraft on contact stands are towed to a remote stand after their turnaround. The tug driver calls Ground (`Stuttgart Ground, Tug 5, request tow Eurowings A320 from stand 14 to stand 45`, ICAO PANS-ATM wording); you answer `tow approved [to stand ...] [via ...]`. The tug pushes the aircraft off the stand and tows it at up to 10 kt; hold position, give way and runway crossings work as for aircraft. New `TOWS` list, aircraft menu and `TOW` quick-action button; +5 points per tow.
- **Follow-me**: `follow the follow-me [to stand 14]` sends one of two follow-me cars from the fire station; it drives to the aircraft (the aircraft waits), leads it 35 m ahead and turns off at the stand entry. Crews unfamiliar with the airport ask for one after vacating (`request follow-me to the stand`, `FLWM` in the list).
- **Vehicle tracking** (ADS-B squitter) in the systems window: with it, follow-me cars and tows are shown with their callsign; without it they are unlabelled targets.
- **Resolve conflict** also covers aircraft blocking each other at an angle, for example a pushback into a taxiing aircraft's way, and then offers `cancel pushback`.
- **Glossary** ([docs/glossary.md](docs/glossary.md)): deadlock, gridlock, head-on, follow-me, tow, TOBT, TSAT, CTOT, A-SMGCS and other terms.
- **ILS in the systems window**: localizer (LOC) and glide path (GP) of the runway in use. Without the glide path arrivals fly localizer approaches, without the localizer RNP approaches; both are spaced at least 5 NM on final. The ATIS names the approach procedure (`ILS approach runway 25`, `RNP approach runway 25, ILS runway 25 out of service`), and the arrivals list has a new `APCH` column.
- **Position colours** in the Connect dialog (once selected): Delivery dark blue, Ground green (Tower red when it comes). Below the buttons a label reads *Single Position* or, highlighted in purple, **Combined Position**; the toolbar shows your stations in their colours with `COMBINED`.

### Fixed

- **A-CDM TSATs kept sliding later**: a flight that missed its TSAT took the next slot and bumped a flight that was still on time, which bumped the next one, and so on - with a busy apron no crew called for pushback any more. Valid TSATs now stay; late flights get the next free slot after them (as in real A-CDM). The release benchmark went from 10.9 to 12.8 departures per hour.
- The AI Ground (and the resolve logic) re-routed both aircraft of a head-on conflict, so both turned around and met again; each conflict is now resolved once.

### Changed

- **Calmer session start**: the initial departures no longer all call at once. Their first calls (clearance request on Delivery, pushback on Ground) are at least 90 s apart, and their ready times get denser towards the end of the first 25 minutes, so the traffic builds up gradually.

- **Occupied stands are noticed where it is realistic**: crews no longer answer a taxi instruction with "stand 14 is occupied" - they can't know that on the runway exit. They accept it, see the stand when taxiing in, stop about 150 m before it and ask for another stand (`stand 14 is occupied, request another stand`); an aircraft just pushing back from it is waited for. Crews still refuse a stand that is too small for their aircraft (they know that from their stand charts). The command-line preview warns you in orange when the stand you type is taken; the AI Ground re-allocates blocked arrivals.

## [0.6.0] - 2026-10-08

Clearance Delivery at Stuttgart, the systems window and realistic handling of head-on conflicts.

### Added

- **Delivery position at EDDS** (`EDDS_DEL` 121.915): departures call about 10 minutes before off-block for their **IFR clearance** (`cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312`), read it back - now and then with a **wrong squawk** you have to catch (`negative, squawk 2312`, otherwise `readback correct`) - ask for **start-up** and then for the frequency for pushback (`contact ground 118.605`). Crews query missing or wrong parts (wrong runway's SID, SID not matching the flight plan, wrong clearance limit, missing squawk or climb).
- **CTOT slots**: 12 % of the departures have a calculated take-off time (column CTOT, `CTOT 1435` or in the clearance). Take-off must be within -5 / +10 minutes; Tower holds early flights at the holding point; a missed slot gives a new CTOT (-10 points).
- **A-CDM**: a pre-departure sequencer gives every departure a TSAT (from its TOBT, its CTOT and 90 s spacing); crews call for start-up (Delivery) or pushback (Ground) at their TSAT. New list columns IFR, SQ, TSAT, CTOT.
- **Datalink clearances (DCL)**: about 4 in 10 airline crews request their clearance by datalink (`DCL` in the list); send it from the aircraft menu, no voice and no readback.
- **Combined positions** in the Connect dialog: click several positions (Delivery + Ground). Positions you don't staff are run by the simulator; a new **AI Ground** works when you only staff Delivery.
- **Systems window** (`SYSTEMS` / F3, [docs/systems.md](docs/systems.md)): status and on/off switches for **A-SMGCS** (surveillance, runway monitoring and conflict alerting RMCA, conflicting ATC clearances CATC, routing service), **A-CDM** and **DCL**. Switching off simulates maintenance or a failure (no data tags, no alerts, no route proposals, no TSAT, voice-only clearances). New optional `systems` and `initialClimbFt` fields in the airport data format.
- **A-SMGCS alerts**: CATC warns in the preview (orange) and in the *Taxi to* menu before you transmit a route that meets other traffic head-on, and flashes aircraft whose cleared routes meet head-on; RMCA alerts when an aircraft cleared to cross approaches an occupied runway or one with an arrival less than 60 s out.
- **Resolve conflict** (aircraft menu, `RESOLVE` in the mobile quick-action bar): when two aircraft face each other, turn one off via a junction (checked against the other's route) or - if there is no junction left - order a **tug** that takes 5-10 minutes, as in real operations.
- Delivery phraseology in the help window, a Delivery section in the EDDS briefing, the Delivery menu and quick-action bar (`CLR`/`DCL`, `RB OK`, `START`, `GND`).
- Score: +10 per clearance delivered, +5 per wrong readback caught, -10 per wrong readback missed, -10 per missed CTOT.

### Changed

- The tug for a stuck airliner takes **5-10 minutes** (was 100-160 s); the pilot says how long.
- Ground: with A-CDM, departures call for pushback at their TSAT (2 minutes before), not at their ready time.
- Parked departures show `CLRD` (cleared) or `----` (no clearance yet) as ground status.
- **EDDS standard taxi flows: N eastbound, S westbound** for both runway directions (departures from the aprons use N and never cross S, arrivals from the exits use S and never cross N). Briefing, typical routes and documentation updated.
- **Automatic routes follow the taxi flows strictly** (pilots' own routes, the Taxi to menu, the quick-action bar): they only use a taxiway against the flow when there is no other way without turning around. Before, going against the flow was only made more expensive.
- "Tablet mode" is called **mobile mode** again (still optimised for the iPad).

### Fixed

- An automatic route could prefer a 180 degree turn (impossible for airliners) over a short stretch against a flow.

## [0.5.0] - 2026-10-08

Foundations for more positions and airports, real Stuttgart traffic, tablet mode, scenarios and the airport briefing.

### Added

- **Real Stuttgart traffic mix**: operators, fleets and destinations follow the airport's statistics (Eurowings about 40 %, SunExpress, TUIfly, Pegasus, the Lufthansa group, Turkish, Condor, British Airways, KLM, Air France, Austrian, business aviation; Palma, Antalya, Istanbul, Pristina, London, Barcelona, Berlin, Hamburg as the busiest destinations). New `traffic` section in the airport data format; see [EDDS](docs/airports/EDDS.md#traffic).
- **Station roles and combined positions (core)**: the simulation asks for the station of a role (delivery / ground / tower) instead of fixed station types, and the user can staff several stations at once (`SimConfig.positions`). This is the basis for Delivery, Tower and combined positions.
- **Airport data checks** (`validateAirport`): every airport is checked by the tests for broken references, unreachable stands or holding points, unknown operators or aircraft types, and briefing mistakes.
- **Soak test in CI**: every push simulates 20 hours of traffic and fails on any collision.
- **Scenario codes and scenario builder** ([docs/scenarios.md](docs/scenarios.md)): choose what to train - runway, density, traffic mix (balanced / departure push / arrival rush), more heavies, random events and scheduled events (medical emergency arrival/departure, rejected take-off, wind shift at a chosen minute) - from presets or by hand. The code (e.g. `EDDS-25-HD1-M10R20W30-K7Q2M`) goes into the Connect dialog's Scenario field, and a link with `?scenario=...` pre-fills it. The same code always gives the same session.
- Observed surface wind: a scenario wind shift changes the toolbar wind (and the ATIS editor's pre-filled wind) until you broadcast a new ATIS.
- **Airport briefing**: a new tab in the help window (and `BRIEFING` in the toolbar) with the airport's local procedures for your position - your job, standard taxi flows, departures, arrivals, typical routes, stands, hot spots - plus live facts from the data: the runway in use with its holding points, exits and flows, and all frequencies. New optional `briefing` and `lengthM` fields in the airport data format; EDDS has a full briefing.
- **Clear button** (×) in the command line.
- Long taxiways (N, S, M) show their designator repeatedly (about every 600 m) when zoomed in, so you can tell them apart on a close-up of the apron.
- **Release benchmark and soak test** (`npm run benchmark`, `npm run soak`): 20 one-hour sessions on both runways with an automatic controller. [docs/benchmarks.md](docs/benchmarks.md) compares all versions since 0.1 (departures per hour x2.9, collisions 11 → 0, go-arounds 53 → 2) and tracks the simulated traffic hours; major releases get a statistics section there.
- Test files report how many hours of traffic they simulated.
- Roadmap: proposed criteria and path to version 1.0.

### Changed

- Mobile mode is now **tablet mode**, optimised for the iPad.
- Smoother touch navigation: two fingers pan and zoom at the same time, one finger also pans when the drag starts on an aircraft, no jump after a pinch, no hover hit-testing for touch.
- The page itself can no longer scroll, bounce or zoom (only the scope zooms).
- The command line is a plain-text editable field instead of a form `<input>`, so Safari on iPad no longer adds AutoFill buttons and form arrows to the keyboard bar.
- The help window has tabs: *Airport briefing*, *Phraseology*, *Controls*. F1 opens the tab used last.
- The Connect dialog's "Scenario seed" field is now "Scenario" and takes a seed or a scenario code.
- **EDDS stand sizes corrected** from the current ground movement chart and the parking/docking chart: stands 9, 19, 24 and 29 are code C stands (no wide-bodies); new wide-body positions **71A and 74A** overlapping 71+72 and 74+75; taxilane M east of H is code C only (new optional `maxWingspanM` on taxi edges, respected by the routing).
- Ground separation is about 4 times faster than in 0.4.0 (paths of other aircraft are sampled once per step).

### Fixed

- **Wide-bodies no longer park wing-to-wing with their neighbours**: a stand is only used (automatically, in the stand menu or by your instruction) if there is enough wingtip clearance to the aircraft on the neighbouring stands (4.5 m code C, 7.5 m code D and larger). Pilots answer e.g. `stand 72 is blocked, not enough wingtip clearance to the A332 on stand 71A`.
- An aircraft taxiing to a stand now reserves it, so nobody else is sent there.
- Gridlock when an arrival from a shallow-angle exit (F) crossed a parallel taxiway in front of a departure: aircraft now look 400 m along the other's path, oncoming traffic is never treated as "following", and an aircraft that stands in another's way is never driven into.
- iPad: tapping the command line pushed the whole page up; the layout now shrinks to the area above the keyboard bar.
- With a hardware keyboard on iPad, the first typed letter was lost ("taxi" became "axi").

## [0.4.0] - 2026-10-08

Settings, mobile mode and better ground handling.

### Added

- **Settings menu** (`SETTINGS` in the toolbar or F2), applied live and stored in the browser: device layout, interface size, tag size, scope orientation, routes, pilot voices (on/off, volume, speed), automatic voice transmission, recognition accent, traffic density and special events.
- **Mobile mode** (phone-laptop slider in the settings; touch-only devices start in it): + / - / home zoom buttons, first tap selects an aircraft and the second tap (or a long press) opens its menu, quick-action bar for the selected aircraft (PUSH, TAXI, HOLD, CONT, TWR, MENU), larger touch targets and tags, sub-menus open with a tap, lists start collapsed on narrow screens.
- **Intersection departures like in real operations**: `advise able for departure from intersection D` / `are you able intersection D`. The crew compares the take-off run available with what its aircraft type needs (new per-type figure, varied per flight) and answers `affirm, able intersection D` or `negative, we require full length`; a taxi instruction to an intersection that is too short gets `unable intersection D, we require full length`. Aircraft menu: *Able intersection?*.
- **AI Tower handles stranded departures**: a departure handed to Tower that stopped short of the holding point (for example after `hold short of taxiway A` instead of `taxi to holding point A`) is taxied on to the holding point if it is close, or sent back to Ground.
- Pilots blocked for over a minute by an aircraft that waits for instructions call `we are blocked by X, waiting on the taxiway ahead, request instructions`.
- Cancelling a pushback that is already moving tows the aircraft back onto the stand.
- Tug turnaround: an airliner that has been stuck for 30 s accepts a route that needs a 180 degree turn and waits 100-160 s for a tug.

### Changed

- **Airliners (wingspan above 25 m) no longer turn around on the spot**: a route that needs a 180 degree turn (for example `taxi to holding point A via N` while facing west) is answered with `unable, we are facing west and cannot turn around here, say again route`.
- Ground separation: traffic behind an aircraft no longer blocks it, and crossing or merging paths are resolved by a priority rule (the aircraft that would arrive later waits outside the other one's lane; the decision is kept until the conflict is over).
- EDDS: the vacate points behind exits F and G were moved off taxiway S, so an arrival waiting there no longer blocks traffic on S.

### Fixed

- A whole area could lock up when a landed aircraft waited at its vacate point on taxiway S.
- An aircraft pulling out in front of approaching traffic could give way to the traffic behind it, which then ran into it (collision).
- `blocked` requests stayed open (with reminders) after the traffic had moved on.

## [0.3.0] - 2026-10-07

Real EDDS layout.

### Added

- **EDDS digitised from the AIP aerodrome charts** (AD 2 EDDS 2-5 / 2-7, AMDT 10/26):
  - real taxiways: parallels N and S, O, M, L2, L3, rapid exits I/H/F/D/B, connectors K/Y, G, E, C, A, W, south taxiways Z/R/V,
  - real holding point names (A-K, W, Y),
  - real stands: 9-19, 24-36, 40-48 and 50-56 (drive-through), 60-65, 71-75, Apron South 100-107,
  - aprons, terminals and other buildings.
- **Scope rotation** (`ROT` button): runway horizontal like the aerodrome chart (default) or north-up.
- **Standard taxi flows** per runway in use (EDDS 25: S eastbound, N westbound; 07: both westbound). Automatic routes and menu suggestions follow them.
- Drive-through stands: no pushback, the aircraft leaves forwards.

### Changed

- Holding points are named after their taxiway (`holding point A`) instead of the old invented `G1`, `F2` ...
- Business jets prefer stands 60-65; Apron South (cargo) is used when Apron North is full.

### Fixed

- A node a few metres behind the aircraft was treated as "ahead", so a route could silently reverse direction.

## [0.2.0] - 2026-10-07

Feedback round 1.

### Added

- MIT license (`LICENSE`).
- **ATIS editor**: click `RWY`, `ATIS`, wind or QNH in the toolbar to set the runway in use, wind, QNH and the information letter. Runway changes re-plan departures that are not yet taxiing (runway and SID) and re-sequence arrivals further out than 3.5 NM. The ATIS no longer changes on its own.
- **Extended phraseology**:
  - `cancel pushback` / `stop pushback` / `continue pushback`,
  - conditional clearances (`behind the A320 passing from left to right, ...`, `when clear of DLH5AB, ...`),
  - queue positions (`number 2 for pushback`),
  - expected delays (`expect pushback in 5 minutes`),
  - incomplete taxi instructions with a clearance limit (`taxi via N, hold short of F`),
  - `along` as a synonym for `via`.
- **Voice control for voice-only operation**:
  - the best of up to five recognition alternatives is used,
  - fuzzy telephony and flight-number matching,
  - corrections for common misrecognitions, number words ("twenty five") and "point" in frequencies,
  - the pilot who called last is addressed when no callsign was understood and nothing is selected,
  - pilots stop speaking while you transmit,
  - additional push-to-talk keys: Right Ctrl and Insert.
- **EuroScope-like tags**: tag items are clickable (callsign/type: flight plan card with the radiotelephony callsign, cleared-to: taxi menu, status: aircraft menu). Hovering over the callsign shows the telephony (e.g. `SPEEDBIRD 947`), which is also shown in front of the command line.
- **Special events** (Connect dialog, default on): medical emergencies on arrival (2%) and while taxiing out (1%), with a bonus for parking within 6 minutes; rejected take-offs (1.5%).
- Aircraft menu: stop / cancel pushback, `number ... for ...`.
- Research documentation on tower operations and separation minima (`docs/tower-operations.md`).

### Changed

- **AI Tower rewritten**:
  - departure separation (2 min behind heavy, 1 min on diverging / 2 min on the same SID route),
  - line-up behind landing or rolling traffic,
  - immediate departures,
  - take-off when the next arrival is about 2 NM or more away,
  - RRSM-like landing behind a departure,
  - blocked exits are skipped.

  In a two-hour heavy-traffic test the mean wait at the holding point dropped from ~5.5 min to under 2 min, with no go-arounds.
- **Approach spacing**: wake turbulence minima; 4 NM base, 6 NM gaps when departures are waiting, 8 NM with a long queue.
- The runway is no longer chosen in the Connect dialog; it follows the wind (ATIS).
- Taxi routing no longer plans turns sharper than 150° or U-turns. A turn-around on the spot is only used as a last resort.
- Landing aircraft on their exit now keep visual separation like taxiing aircraft.

### Fixed

- Arrivals briefly turned back towards the runway when they got their taxi instruction.
- After a pushback facing west, aircraft wanted to taxi the "wrong way" (requiring a 180° turn) instead of via D, N.

## [0.1.0] - 2026-10-07

First playable version: **Ground position at Stuttgart (EDDS)**.

### Added

- Browser application (TypeScript, Vite) with a EuroScope-style ground radar scope: aerodrome chart, aircraft silhouettes, draggable data tags, zoom and pan, route display.
- Connect dialog to choose airport, position, active runway, traffic density and scenario seed (only EDDS / Ground enabled so far).
- Departure and arrival lists with status, frequency and pending-request timers.
- Message window with a single-frequency radio model, plus a command line with history and live parse and route preview.
- ICAO phraseology parser: pushback (with facing), start-up, taxi with `via` routes to holding points, runways and stands, hold short, cross runway, hold position, continue, give way, expedite, contact/monitor, standby, say again. Accepts ICAO callsigns, telephony callsigns, the selected aircraft, and spoken numbers and letters.
- Right-click aircraft menus that generate proper phraseology, with route preview on hover.
- AI pilots: pushback and taxi requests, read-backs, "unable"/"confirm" replies, reminders, see-and-avoid on the ground, deadlock reports.
- AI Tower: final approach, landing roll-out and exit choice, departure sequencing, line-up and take-off, go-arounds, runway incursion detection.
- Traffic generator with three densities, realistic operators and callsigns, and stand allocation.
- EDDS airport data: real runway coordinates and frequencies, approximate taxiway network, 35 stands, holding points, rapid exits.
- Text-to-speech for pilots and push-to-talk speech recognition for the controller (Web Speech API).
- Score and incident statistics.
- Documentation: README, getting started, user guide, phraseology reference, EDDS airport page, simulation model, architecture, airport data format, roadmap, contributing guide.
- GitHub Actions: CI (type check, tests, build) and GitHub Pages deployment.
