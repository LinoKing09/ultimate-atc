# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

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
