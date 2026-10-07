# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
