# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
