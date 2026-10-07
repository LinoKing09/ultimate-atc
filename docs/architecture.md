# Architecture

Ultimate ATC is a single-page web application written in **TypeScript**, bundled with **Vite**, and tested with **Vitest**. It has no runtime dependencies and no framework: the UI is plain DOM plus one `<canvas>`.

The most important design rule: **the simulation core (`src/core`) knows nothing about the DOM.** It can run in Node.js (the tests do), in a Web Worker, or on a server, which is the planned basis for multiplayer.

## Directory layout

```
ultimate-atc/
├── index.html                 # page shell, loads src/main.ts
├── src/
│   ├── main.ts                # entry point: login dialog -> Simulation -> App
│   ├── style.css              # EuroScope-like dark theme
│   ├── core/                  # simulation (no DOM access)
│   │   ├── geo.ts             # vector maths, local projection, headings, units
│   │   ├── path.ts            # smoothed polylines that aircraft move along
│   │   ├── random.ts          # seeded PRNG
│   │   ├── airport/
│   │   │   ├── types.ts       # serialisable AirportData format
│   │   │   ├── airport.ts     # runtime Airport: local coordinates, taxi graph, lookups
│   │   │   └── routing.ts     # taxi route finding with "via" constraints
│   │   ├── aircraft.ts        # Aircraft state, flight plan, phases
│   │   ├── movement.ts        # path following, speed control, see-and-avoid, collisions
│   │   ├── pilot.ts           # AI pilots: executing instructions, read-backs, own calls
│   │   ├── tower.ts           # AI Tower: approach, landing, line-up, take-off, incursions
│   │   ├── traffic.ts         # traffic generator: departures, arrivals, callsigns, stands
│   │   ├── radio.ts           # single-frequency radio with queued pilot transmissions
│   │   ├── simulation.ts      # the world: owns everything above, fixed-step loop, stats
│   │   └── phraseology/
│   │       ├── commands.ts    # Command types (the parser's output)
│   │       ├── parser.ts      # text -> callsign + commands
│   │       ├── format.ts      # commands -> canonical phraseology text
│   │       └── speech.ts      # telephony callsigns, phonetic spelling for TTS
│   ├── data/
│   │   ├── aircraftTypes.ts   # dimensions and performance per ICAO type
│   │   ├── airlines.ts        # operators, telephony, fleets, destinations
│   │   └── airports/
│   │       ├── builder.ts     # helper to author layouts in a runway-aligned frame
│   │       └── edds.ts        # Stuttgart
│   └── ui/                    # browser client
│       ├── app.ts             # wires sim <-> scope, lists, messages, command line, menus
│       ├── scope.ts           # canvas ground radar: chart, aircraft, tags, input
│       ├── lists.ts           # departure / arrival lists
│       ├── menu.ts            # popup menus
│       ├── dialogs.ts         # connect dialog, help
│       ├── labels.ts          # status codes for tags and lists
│       ├── voice.ts           # text-to-speech and speech recognition
│       ├── settings.ts        # localStorage-backed preferences
│       └── dom.ts             # tiny DOM helper
├── tests/                     # Vitest unit and scenario tests
├── docs/                      # documentation (this folder)
└── .github/workflows/         # CI and GitHub Pages deployment
```

## Data flow

```
             keyboard / mouse / microphone
                         │
                         ▼
┌──────────────────── ui/app.ts ─────────────────────┐
│  command line ─┐       menus ─┐                    │
│                ▼              ▼                     │
│          sim.transmit(text, selectedCallsign)       │──────► scope.render() every frame
└────────────────────────┬───────────────────────────┘        lists.update() 4x per second
                         │
                         ▼
┌──────────────────── core/simulation.ts ────────────┐
│ parser.parseTransmission(text)  ->  Command[]      │
│ pilot.executeTransmission()     ->  state changes  │
│                                     + read-back    │──► Frequency (radio.ts) ──► 'message' events
│ tick(dt): fixed 0.2 s steps                        │                                  │
│   traffic.update()   tower.update()                │                                  ▼
│   updateSeparation() updatePilot() updateMovement()│                      message window, TTS
│   detectCollisions() frequency.update()            │
└────────────────────────────────────────────────────┘
```

1. **Input**: typed text, menu actions and recognised speech all end up as a **text transmission**. Menus build the same phrase you could have typed. There is only one code path, so everything the UI can do is also available on the command line, and the radio log always shows proper phraseology.
2. **Parsing**: `parseTransmission` tokenises the text (normalising spoken numbers and the ICAO alphabet), resolves the callsign, and produces a list of `Command` objects.
3. **Execution**: `executeTransmission` (pilot.ts) logs the controller transmission on the frequency, checks every command against the aircraft's state, changes the state (routes, stops, holds, frequency), and queues one read-back.
4. **Simulation step** (`Simulation.step`, every 0.2 s of simulated time):
   - `TrafficGenerator.update` spawns new aircraft,
   - `TowerAI.update` flies approaches, rolls aircraft out, lines up and launches departures, detects incursions,
   - `updateSeparation` computes how far each aircraft may move before reaching traffic,
   - `updatePilot` handles timers (tug, engine start), give-way, spontaneous calls and reminders,
   - `updateMovement` moves aircraft along their paths and fires `onStopReached`,
   - `detectCollisions`,
   - `Frequency.update` starts the next queued pilot transmission when the frequency is free.
5. **Output**: the UI reads `sim.aircraft` every frame for drawing and listens to the `message`, `incident` and `aircraftRemoved` events.

## Key concepts

### Coordinates

`AirportData` stores **latitude/longitude**, just like real data sources. The runtime `Airport` projects everything into a **local metric frame** (x = east, y = north, metres, origin at the ARP) using an equirectangular projection. The projection is accurate to well under a metre within a few kilometres. Headings are degrees true. See `core/geo.ts`.

### Taxi graph

The taxi network is an undirected graph (`TaxiNode`, `TaxiEdge`) with optional one-way edges. Each edge has a **name** (taxiway designator, or stand id for stand lead-in lines) and a **kind**:

| Kind          | Used for                                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| `taxiway`     | Regular taxiways                                                               |
| `taxilane`    | Apron taxilanes (may be omitted in `via` lists at the start and end of a route) |
| `stand`       | Lead-in line from the taxilane to a stand                                      |
| `runwayStrip` | The part of a connector between the runway holding position and the runway centre line |
| `runway`      | Runway centre line (never used for taxi routing)                               |

Runway holding positions are **nodes** with a `holdingPoint` attribute. Moving from such a node onto a `runwayStrip` edge means entering the runway, which needs a clearance.

### Taxi routing

`findRoute(airport, start, destination, via)` in `core/airport/routing.ts` runs **Dijkstra on the state (node, k)**, where `k` is the number of `via` taxiways joined so far. An edge may be used if

- its name is the current via taxiway `via[k-1]` (stay on it), or the next one `via[k]` (k + 1), or
- it is a "free" edge that controllers usually don't mention: a stand lead-in or taxilane at the start or end of the route, the taxiway the aircraft is currently on (k = 0), or the taxiway the destination lies on (k = len(via)).

The goal state is `(destination, len(via))`. With an empty `via` list, the router returns the overall shortest route and adds a large penalty to runway strips, so it avoids crossing runways whenever possible. Routes can start at a node (a stand) or at an arbitrary position and heading. The start then snaps to the nearest edge, and a start node behind the aircraft costs a 400 m U-turn penalty.

### Paths

A `Path` (`core/path.ts`) is the route's polyline with corners replaced by curves. Aircraft keep a scalar `s` (distance along the path). Markers map node ids to `s`, which is how stops (holding points, hold short) are placed on the path. Pushbacks, line-ups, landing roll-outs and taxi routes all use the same mechanism.

### Phases and requests

`Aircraft.phase` is the state machine described in [simulation.md](simulation.md#aircraft-life-cycle). `Aircraft.request` is what the pilot is currently waiting for. It drives the list's `REQ` column, flashing tags, reminders and waiting-time statistics.

### Radio

`Frequency` (`core/radio.ts`) models a shared channel. Controller transmissions are immediate. Pilot transmissions are queued with a priority, an earliest start and an expiry, and an `onTransmit` callback runs at the moment the pilot actually speaks. This is how a frequency change happens only after the read-back, and how a request "starts" when it is actually heard.

## Extending

### Adding an airport

See [airport-data.md](airport-data.md). In short: create `src/data/airports/<icao>.ts` exporting an `AirportData`, add it to `AIRPORTS` in `src/main.ts`, document it in `docs/airports/<ICAO>.md`, and add a data-consistency test.

### Adding a position (Delivery, Tower, Approach, Center)

The groundwork is in place:

- `SimConfig.position` and `Aircraft.frequency` are `StationType`s. "Is this pilot talking to me?" is `aircraft.frequency === config.position` (`Simulation.isOnMyFrequency`).
- Everything the user doesn't control is AI. Today that is Delivery (implicit), Tower (`TowerAI`) and Approach (arrivals appear on final).

To add the **Tower** position, for example:

1. Add commands (`lineUp`, `takeoff`, `landing clearance`, `cross`, `vacate`) to `phraseology/commands.ts`, the parser and the formatter.
2. Split `TowerAI` into an AI that runs when Tower is not the user's position, and pilot behaviour that waits for explicit clearances when it is.
3. Add a Ground AI that taxis aircraft automatically (using `findRoute` with an empty `via`) when the user is not Ground.
4. Add Tower-specific UI (arrival sequence, runway status), and enable the position in `ui/dialogs.ts`.

Approach and Center positions need a radar scope with airspace data (sectors, fixes, procedures) and vectoring commands. The `Scope` class would get a second render mode, and `AirportData` would get procedure and airspace data, or a separate sector data format, comparable to EuroScope's `.sct` / `.ese` files.

### Multiplayer (VATSIM-like shared sessions)

Because `Simulation` is DOM-free and deterministic for a given seed and input sequence, the planned approach is:

- run `Simulation` on a Node.js server (or one peer as host),
- send controller transmissions (plain text) from clients to the server,
- broadcast aircraft state snapshots and radio messages to all clients,
- give each client its own `position`. `isOnMyFrequency` becomes per-client, and hand-offs move pilots between human controllers.

## Conventions

- TypeScript `strict` mode, no `any`.
- The simulation core must stay DOM-free. Anything browser-specific goes in `src/ui`.
- All user-visible text, code comments and documentation are in **English**.
- Every change updates the documentation and `CHANGELOG.md`. See [contributing.md](contributing.md).
