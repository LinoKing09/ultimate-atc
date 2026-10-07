# Ultimate ATC

**Ultimate ATC** is an air traffic control simulator that runs in your browser. It aims to come as close as possible to [EuroScope](https://www.euroscope.hu/), the radar client used on the [VATSIM](https://vatsim.net/) network. You log in to a controller position at a real airport, and AI pilots respond to your instructions in ICAO phraseology, whether you type them or speak them.

> **Status: early development (v0.1).** One position is playable: **Ground at Stuttgart (EDDS)**. The code is built so that more positions (Delivery, Tower, Approach/Departure, Center) and more airports (EDDF, EGLL, KLAX, KSAN, ...) can be added later. See the [roadmap](docs/roadmap.md).

![Ultimate ATC - EDDS Ground overview](docs/images/screenshot-overview.png)

## Features

- **EuroScope-style ground radar:** a dark scope with runways, taxiways, holding points, stands and buildings. Each aircraft has a symbol at real size and a data tag you can drag. Zoom, pan, and the **departure and arrival lists** work as in EuroScope.
- **Logging in like on VATSIM:** choose the airport, position, active runway and traffic density. You then work as `EDDS_GND` on 118.605 "Stuttgart Ground".
- **ICAO phraseology parser:** type `DLH5AB taxi to holding point G1 via N, G` or `Lufthansa five alpha bravo, push and start approved, facing east`. The callsign can be an ICAO code, a radiotelephony callsign, or left out (the selected aircraft is used). Several instructions can be combined in one transmission.
- **Live preview:** while you type, the command line shows how the instruction was understood. The taxi route is drawn on the scope before you transmit.
- **Right-click menus:** pushback (with facing), taxi to a holding point or stand (with an automatic route), hold position, continue, hold short, cross runway, give way, and contact Tower.
- **AI pilots:**
  - They call for pushback and taxi, report vacating, and read every instruction back.
  - They reply "unable" or "say again" when an instruction is wrong, and call again if you don't answer.
  - They keep visual separation on the ground (they stop behind other traffic) and report when they are stuck.
- **AI Tower:** lines up and launches the departures you hand over, lands arrivals and picks an exit, and sends arrivals around if the runway is blocked.
- **Safety nets:** collisions, runway incursions and go-arounds are detected and counted against your score.
- **Voice (optional):**
  - Pilots can speak their transmissions (text-to-speech, each pilot with their own voice).
  - You can talk to them with push-to-talk speech recognition (Chrome/Edge).
- **Deterministic scenarios:** the same seed always gives the same traffic.

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

1. Press **Connect** with the default settings: EDDS, Ground, runway 25, medium traffic.
2. A departure calls: `Stuttgart Ground, Lufthansa 5AB, stand 10, information E, request pushback`. The row flashes in the departure list and on the scope.
3. Answer with `DLH5AB pushback approved facing east`. You can also press **Tab** to select the caller and type only `push and start approved`, or right-click the aircraft.
4. When it reports `ready for taxi`, send it to the runway: `taxi to holding point G1 via R, N, G`.
5. When it reaches G1, hand it to Tower: `contact tower 118.805`. Tower lines it up and it takes off.
6. Arrivals call after vacating the runway, for example `vacated runway 25 via E`. Taxi them to a stand: `taxi to stand 14 via N, R`. The suggested stand is shown in brackets in the arrival list.

Press **F1** in the app for the in-game reference.

## Documentation

| Document                                     | Contents                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)   | Installation, browsers, building, deployment                                |
| [User guide](docs/user-guide.md)             | Screen layout, scope, lists, tags, menus, keyboard, voice, scoring          |
| [Phraseology reference](docs/phraseology.md) | Every instruction the parser understands, pilot read-backs and calls        |
| [Airport: EDDS Stuttgart](docs/airports/EDDS.md) | Layout, taxiways, holding points, stands, typical routes, frequencies    |
| [Simulation model](docs/simulation.md)       | How AI pilots, AI Tower, traffic generation, separation and incidents work  |
| [Architecture](docs/architecture.md)         | Code structure, data flow, how to add positions and multiplayer             |
| [Airport data format](docs/airport-data.md)  | How airports are described and how to add a new one                         |
| [Roadmap](docs/roadmap.md)                   | What is planned next                                                        |
| [Contributing](docs/contributing.md)         | Development workflow, conventions, tests                                    |
| [Changelog](CHANGELOG.md)                    | Release history                                                             |

## Data accuracy

Runway coordinates, elevation and frequencies for EDDS are real-world values from [OurAirports](https://ourairports.com/) (public domain). The **taxiway network, stand numbers and buildings are a simplified, hand-made approximation**. They follow the general layout of the real airport, but many details differ from the official aerodrome chart. The SIDs in the flight plans are placeholders. **Never use this simulator for real-world navigation or flight planning.** The [EDDS page](docs/airports/EDDS.md) describes exactly what is approximated.

## License

The source code is released under the [MIT License](LICENSE). Airport data derived from OurAirports is public domain.

## Disclaimer

Ultimate ATC is an independent hobby project. It is not affiliated with EuroScope, VATSIM, DFS or any airport or airline. Airline names and callsigns are used only to create realistic radio traffic.
