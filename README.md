# Ultimate ATC

**Ultimate ATC** is an air traffic control simulator that runs in your browser. It aims to come as close as possible to [EuroScope](https://www.euroscope.hu/), the radar client used on the [VATSIM](https://vatsim.net/) network. You log in to a controller position at a real airport, and AI pilots respond to your instructions in ICAO phraseology (FAA phraseology at US airports), whether you type them or speak them.

> **Status: version 1.4.0.** Three positions are playable at **Stuttgart (EDDS)**: **Delivery**, **Ground** and **Tower**, each alone or combined; **Cologne/Bonn (EDDK)**, **Nuremberg (EDDN)**, **Leipzig/Halle (EDDP)**, **Bremen (EDDW)**, **Memmingen (EDJA)**, **Sylt (EDXW)**, **San Diego (KSAN)**, **Phuket (VTSP)**, **Wellington (NZWN)**, **Quito (SEQM)**, **La Paz (SLLP)**, **St. Maarten (TNCM)** and **London Gatwick (EGKK)** follow - Leipzig/Halle with **two parallel runways in use at the same time** and the DHL hub, Cologne/Bonn with three runways and a cargo hub, Memmingen a small airport where departures and arrivals **backtrack** on the runway, Sylt a Tower-only airport with crossing runways, San Diego the first US airport with **FAA phraseology**, US weather and ATIS, Phuket a busy holiday airport in Thailand with one runway, a parallel taxiway and a loop through its apron lanes, Wellington a short runway between two bays with separate SIDs for jets and turboprops, Quito a 4 km runway at 7910 ft in the Andes with flower freighters and radar vectors from runway 18, St. Maarten the landing over Maho Beach with no parallel taxiway and backtracks on the runway, La Paz at 13314 ft with backtracks of almost 3 km, London Gatwick the busiest single runway in the world with up to 55 movements an hour. The code is built so that more positions (Approach/Departure, Center) and more airports (EDDF, EGLL, KLAX, ...) can be added later. See the [roadmap](docs/roadmap.md).

![Ultimate ATC - EDDS Ground overview](docs/images/screenshot-overview.png)

## Features

- **EuroScope ground radar as at VATSIM Germany:** the default **PHX** style reproduces the EuroScope ground radar of VATSIM Germany, which is modelled on the **DFS PHOENIX** tower display: its map colours, aircraft as radar returns with an SSR symbol and history dots, **departure tags blue, arrival tags yellow**, the PHX ground states (`SUG`, `PBG`, `TXG`, `ALU` ...) and the VATSIM Germany tag layout (callsign + runway or stand, type + wake + state, SID + cleared-to). A day palette and the classic look are in the settings. Each aircraft has a symbol at real size and a data tag you can drag. **Tag items are clickable** (callsign: flight plan and radiotelephony callsign such as `SPEEDBIRD 947`; SID: clearance; cleared-to: taxi menu; state: aircraft menu), and the scope can be shown **runway-aligned like the aerodrome chart** (default) or north-up. The **departure and arrival lists** have the VATSIM Germany column order, and their cells open their functions with a click, as in EuroScope.
- **Logging in like on VATSIM:** choose the airport from a menu by continent, country and FIR (Germany: Bremen, Langen, München), with the runways and a traffic level for each airport, then the position(s) and traffic density. You then work as `EDDS_GND` on 118.605 "Stuttgart Ground", `EDDS_DEL` on 121.915 "Stuttgart Delivery", `EDDS_TWR` "Stuttgart Tower", or several at once (**combined positions**; more can be taken over during the session). Positions you don't staff are run by the simulator. Start at an **empty airport** or **take over** from the controller before you, with traffic already taxiing and on approach. **Save** a session and continue it later (also from a file on another device); your **time on position** is counted per session and in total.
- **Tower:** line-up, take-off and landing clearances (`behind landing EWG7TK, line up and wait behind`, `wind 250 degrees 8 knots, runway 25, cleared for take-off`), go-arounds, exits, runway crossings, hand-offs to Radar and Ground, an arrival sequence and departure-spacing hints; arrivals without a landing clearance go around, take-offs with too little spacing count as separation losses.
- **Clearance Delivery:** IFR clearances (`cleared to Frankfurt, ETASA4B departure, flight planned route, climb via SID to altitude 5000 feet, squawk 2312`) with the **real SIDs**, each flight planned via the exit fix towards its destination, with readbacks to check (crews sometimes read back a wrong squawk), start-up at the **A-CDM TSAT**, **CTOT** slots, and **datalink clearances (DCL)** sent from the list.
- **Systems window** (`SYSTEMS` / F3): status of the airport's systems with on/off switches - **A-SMGCS** (surveillance, runway monitoring RMCA, conflicting-clearance alerts CATC, routing service), **A-CDM**, **DCL** and the **ILS** (localizer, glide path). Switch one off to train working without it. See [docs/systems.md](docs/systems.md).
- **Ground vehicles:** tug drivers ask Ground for **tows** to remote stands (`request tow ... from stand 14 to stand 45` - `tow approved via ...`); crews can ask for a **follow-me**, a car that drives out and leads them to the stand. Vehicle tracking (ADS-B squitter) in the systems window decides whether vehicles get a label.
- **Head-on conflicts handled like in reality:** the A-SMGCS warns before you transmit a route that meets other traffic head-on, and *Resolve conflict* offers the way out: turn one aircraft off via a junction, or call a tug (5-10 minutes).
- **ATIS and METAR:** a METAR every half hour (seeded weather: clouds, visibility, temperature, a drifting QNH; SPECI in a thunderstorm). The ATIS editor sets the runway in use, wind, QNH and information letter and previews the ATIS as D-ATIS text and spoken, with its notices. Crews that listened to an older ATIS report its letter until you tell them the current one. A runway change re-plans departures and arrivals.
- **ICAO phraseology parser:** type `DLH5AB taxi to holding point A via L2, S` or `Lufthansa five alpha bravo, push and start approved, facing east`. It also understands:
  - conditional clearances: `behind the A320 passing from left to right, ...`,
  - queue positions: `CFG11, number 2 for pushback`,
  - incomplete taxi instructions: `taxi via N, hold short of F`,
  - intersection departures, asked like in real operations: `advise able for departure from intersection D`,
  - `cancel pushback` (a moving aircraft is towed back to the stand) and more.

  The callsign can be an ICAO code, a radiotelephony callsign, or left out (the selected aircraft is used). Several instructions can be combined in one transmission.
- **Airport briefing** (`BRIEFING` / help window): your job at the position, the runway in use with its entries, exits and taxi flows, typical routes, stands, hot spots and frequencies - for every airport.
- **Settings menu** (`SETTINGS` / F2) with live changes: **mobile or PC layout** (phone-laptop slider), interface and tag size, scope orientation, traffic density and special events.
- **Mobile mode (optimised for the iPad):** + / - zoom buttons, smooth one- and two-finger pan/zoom without page scrolling, tap once to select and again for the menu (or long-press), a quick-action bar with the same buttons for every aircraft of a position (Delivery, Ground, Tower; greyed out what does not apply), whose phrases and menu choices are picked and sent together with SEND, larger touch targets.
- **Live preview:** while you type, the command line shows how the instruction was understood. The taxi route is drawn on the scope before you transmit.
- **Right-click menus:** pushback (with facing), taxi to a holding point or stand (with an automatic route), hold position, continue, hold short, cross runway, give way, and contact Tower.
- **AI pilots:**
  - They call for pushback and taxi, report vacating, and read every instruction back.
  - They reply "unable" or "say again" when an instruction is wrong, and call again if you don't answer.
  - They keep visual separation on the ground (they stop behind other traffic, give way at crossings) and report when they are stuck.
  - Airliners can't turn around on a taxiway: routes that need a 180 degree turn are refused, unless the aircraft is stuck and calls a tug.
- **AI Tower** with a [researched separation model](docs/tower-operations.md): departure, wake turbulence and runway separation, line-up behind landing or departing traffic, and departure gaps between arrivals. It lines up and launches the departures you hand over (and moves on or sends back departures you handed over short of the holding point), lands arrivals and picks an exit, and sends arrivals around if the runway is blocked.
- **Special events** (rare, can be switched off): medical emergencies (PAN PAN) and rejected take-offs.
- **Safety nets:** collisions, runway incursions and go-arounds are detected and counted against your score.
- **Voice (switched off in this version, see the [user guide](docs/user-guide.md#9-voice)):**
  - Pilots can speak their transmissions (text-to-speech, each pilot with their own voice).
  - You can talk to them with push-to-talk speech recognition (Chrome/Edge). It is built for **voice-only operation**: the best of several recognition alternatives is used, callsigns are matched even when slightly misrecognised, typical recognition errors are corrected, and pilots stay quiet while you transmit.
- **Tutorials:** a guided first session for each position (Delivery, Ground, Tower): a fixed traffic situation, a panel that explains each step and shows the instruction, *Show me* puts it into the command line. See [Tutorials](docs/tutorials.md).
- **Training scenarios:** a [scenario builder](docs/scenarios.md) creates shareable scenario codes (and links) for what you want to train: traffic density, departure rush ... arrival rush and the share of heavies on five-step sliders, a fixed runway, a start time with Stuttgart's **night flying restrictions**, **closed taxiways** (construction works), **de-icing** (winter: every departure via the de-icing pads DP1-DP4), and emergencies, rejected take-offs, a wind shift or a **thunderstorm** (gusts, windshear go-arounds, departure stop) at chosen minutes. The same code always gives the same session.

## Quick start

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/linoking09/ultimate-atc.git
cd ultimate-atc
npm install
npm run dev        # open the printed URL (default http://localhost:5173)
```

Other scripts:

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Development server with hot reload                            |
| `npm run build`     | Type-checks and builds the static site into `dist/`           |
| `npm run preview`   | Serves the production build locally                          |
| `npm test`          | Runs the unit and scenario tests (Vitest)                     |
| `npm run typecheck` | TypeScript type check only                                    |

The build is a fully static site. It is deployed to GitHub Pages automatically; see [Getting started](docs/getting-started.md#deploying-to-github-pages).

## Your first minutes as Stuttgart Ground

1. Press **Connect** with the default settings: EDDS, Ground, medium traffic. The runway in use follows the wind (usually 25); click `ATIS` in the toolbar to change it.
2. A departure calls: `Stuttgart Ground, Lufthansa 5AB, stand 14, information E, request pushback`. The row flashes in the departure list and on the scope.
3. Answer with `DLH5AB pushback approved facing east`. You can also press **Tab** to select the caller and type only `push and start approved`, or right-click the aircraft.
4. When it reports `ready for taxi`, send it to the runway: `taxi to holding point A via M, H, N` (runway 25; after a pushback facing east).
5. When it reaches A, hand it to Tower: `contact tower 118.805`. Tower lines it up and it takes off (from A the take-off run available is 3045 m).
6. Arrivals call after vacating the runway, for example `vacated runway 25 via E`. Taxi them to a stand: `taxi to stand 14 via S, H, M`. The suggested stand is shown in brackets in the arrival list.

Press **F1** in the app for the in-game reference.

## Documentation

Start with the **[documentation overview](docs/README.md)**, or jump straight in:

| | |
| --- | --- |
| **Play** | [Getting started](docs/getting-started.md) · [User guide](docs/user-guide.md) · [Tutorials](docs/tutorials.md) · [Phraseology](docs/phraseology.md) · [Scenarios](docs/scenarios.md) · [Glossary](docs/glossary.md) |
| **Airports** | [EDDS](docs/airports/EDDS.md) · [EDDK](docs/airports/EDDK.md) · [EDDN](docs/airports/EDDN.md) · [EDDP](docs/airports/EDDP.md) · [EDDW](docs/airports/EDDW.md) · [EDJA](docs/airports/EDJA.md) · [EDXW](docs/airports/EDXW.md) · [KSAN](docs/airports/KSAN.md) · [VTSP](docs/airports/VTSP.md) · [NZWN](docs/airports/NZWN.md) · [SEQM](docs/airports/SEQM.md) · [TNCM](docs/airports/TNCM.md) · [SLLP](docs/airports/SLLP.md) · [EGKK](docs/airports/EGKK.md) - [all airports](docs/airports/README.md) |
| **How it works** | [Simulation model](docs/simulation.md) · [Systems](docs/systems.md) · [Tower operations](docs/tower-operations.md) |
| **Development** | [Architecture](docs/architecture.md) · [Airport data](docs/airport-data.md) · [Contributing](docs/contributing.md) |
| **Project** | [Roadmap](docs/roadmap.md) · [Benchmarks](docs/benchmarks.md) · [Release report 1.0](docs/release-1.0-report.md) · [Changelog](CHANGELOG.md) |
| **Print** | [Handbook (PDF)](docs/handbook/ultimate-atc-handbook.pdf) - the player documentation as one printable book |

## Benchmarks

![Release benchmark from 0.1 to 1.0: throughput, safety, deadlock calls and computing time](docs/images/benchmarks-1.0.svg)

The same 20 hours of Stuttgart traffic with the same simple automatic controller in every version; details and the Tower benchmark in [docs/benchmarks.md](docs/benchmarks.md).

## Data accuracy

The EDDS layout (taxiways, holding points, stand numbers, aprons) was **digitised by hand from the AIP Germany aerodrome charts** (AD 2 EDDS 2-5 and 2-7) and checked against OpenStreetMap (holding points within 10 m); the building outlines come from OpenStreetMap. The de-icing pads, stand sizes and the published take-off run available from every entry follow the ground radar data of VATSIM Germany (used as a reference only); some areas (GA apron, US airfield) are simplified. Runway end coordinates come from [OurAirports](https://ourairports.com/) (public domain). The SIDs have their real designators and exit fixes; flight plans pick them by the direction of the destination. Frequencies of all airports were checked against the VATSIM Germany station data. The Cologne/Bonn, Nuremberg, Leipzig/Halle, Bremen, Memmingen and Sylt layouts come from [OpenStreetMap](https://www.openstreetmap.org/) (© OpenStreetMap contributors, ODbL; the derived layout files are available under the ODbL), their procedures from the VATSIM Germany SOPs; the parts missing in OSM were digitised by hand from the charts (Memmingen: taxiway R, Apron 4, the closed taxiways; Nuremberg: the general aviation aprons; Sylt: the closed taxiways and the former runway; Cologne/Bonn, Leipzig/Halle and Bremen: the stand positions of the AIP). All seven airports were checked against the DFS AIP (AIRAC 2026OCT01: thresholds, elevations, taxiway widths and limits, declared distances, published approaches); the charts are used as a reference only and are not part of the project. **Never use this simulator for real-world navigation or flight planning.** The airport pages ([EDDS](docs/airports/EDDS.md), [EDDK](docs/airports/EDDK.md), [EDDN](docs/airports/EDDN.md), [EDDP](docs/airports/EDDP.md), [EDDW](docs/airports/EDDW.md), [EDJA](docs/airports/EDJA.md), [EDXW](docs/airports/EDXW.md), [KSAN](docs/airports/KSAN.md), [VTSP](docs/airports/VTSP.md)) describe exactly what is approximated. The San Diego layout comes from OpenStreetMap as well; its facts (runway, displaced thresholds, declared distances, frequencies) were digitised by hand from the FAA Chart Supplement and airport diagram, its procedures follow the VATSIM Los Angeles ARTCC San Diego SOP; the new Terminal 1 gates are placed approximately (not yet mapped in OSM). Phuket's layout comes from OpenStreetMap too; runway, displacement area, declared distances, frequencies, SIDs and the stand positions (the coordinate table of the parking chart) were digitised by hand from the AIP Thailand.

## License

The source code is released under the [MIT License](LICENSE). Airport data derived from OurAirports is public domain.

## Disclaimer

Ultimate ATC is an independent hobby project. It is not affiliated with EuroScope, VATSIM, DFS or any airport or airline. Airline names and callsigns are used only to create realistic radio traffic.
