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
│   │   ├── scenario.ts        # scenario codes (format/parse), presets
│   │   ├── airport/
│   │   │   ├── types.ts       # serialisable AirportData format
│   │   │   ├── airport.ts     # runtime Airport: local coordinates, taxi graph, lookups
│   │   │   ├── routing.ts     # taxi route finding with "via" constraints, turn and wingspan limits
│   │   │   └── validate.ts    # airport data checks (run for every airport by the tests)
│   │   ├── aircraft.ts        # Aircraft state, flight plan, phases
│   │   ├── movement.ts        # path following, speed control, see-and-avoid, collisions
│   │   ├── pilot.ts           # AI pilots: executing instructions, read-backs, own calls
│   │   ├── tower.ts           # AI Tower: approach, landing, line-up, take-off, incursions, CTOT windows
│   │   ├── delivery.ts        # Clearance Delivery: IFR clearances, squawks, readback errors, CTOTs, DCL, A-CDM sequencer
│   │   ├── groundAI.ts        # AI Ground (when the user doesn't staff Ground)
│   │   ├── conflicts.ts       # A-SMGCS: CATC head-on checks, Resolve conflict options, RMCA runway alerts
│   │   ├── systems.ts         # airport/ATC systems (A-SMGCS services, A-CDM, DCL, ILS) and their states
│   │   ├── vehicles.ts        # follow-me cars, tug positions, tow creation
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
│   │   ├── destinations.ts    # spoken names of destination airports (clearance limits)
│   │   └── airports/
│   │       ├── index.ts       # AIRPORTS: the airports offered in the Connect dialog
│   │       ├── builder.ts     # helper to author layouts in a runway-aligned frame
│   │       └── edds.ts        # Stuttgart (layout, stands, runway operations, traffic, briefing)
│   └── ui/                    # browser client
│       ├── app.ts             # wires sim <-> scope, lists, messages, command line, menus
│       ├── scope.ts           # canvas ground radar: chart, aircraft, tags, input, rotation (runway-aligned / north-up)
│       ├── lists.ts           # departure / arrival lists
│       ├── menu.ts            # popup menus
│       ├── dialogs.ts         # connect dialog, help window (tabs), ATIS editor
│       ├── briefing.ts        # airport briefing (data facts + the airport's briefing sections)
│       ├── scenarioBuilder.ts # scenario builder dialog (presets, events, code and link)
│       ├── labels.ts          # status codes for tags and lists
│       ├── voice.ts           # text-to-speech and speech recognition
│       ├── settings.ts        # localStorage-backed preferences
│       ├── settingsDialog.ts  # in-game settings menu (device mode, sizes, voice, traffic)
│       ├── systemsDialog.ts   # systems window (status and on/off switches)
│       ├── commandInput.ts    # single-line plain-text command field (no form input, iPad-friendly)
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
   - `detectCollisions`, `updateRunwayAlerts` (A-SMGCS RMCA),
   - `updateVehicles` (follow-me cars),
   - every 5 s: `updateConflictAlerts` (A-SMGCS CATC), `updateSequencer` (A-CDM TSATs), `updateGroundAI`,
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

`findRoute(airport, start, destination, via)` in `core/airport/routing.ts` runs **Dijkstra on the state (node, k, incoming edge)**, where `k` is the number of `via` taxiways joined so far. The incoming edge is part of the state so that **turns sharper than 150°** (hairpins, reversing on a taxiway) can be rejected. An edge may be used if

- its name is the current via taxiway `via[k-1]` (stay on it), or the next one `via[k]` (k + 1), or
- it is a "free" edge that controllers usually don't mention: a stand lead-in or taxilane at the start or end of the route, the taxiway the aircraft is currently on (k = 0), or the taxiway the destination lies on (k = len(via)).

The goal is any state at `(destination, len(via))`. With an empty `via` list, the router returns the overall shortest route and adds a large penalty to runway strips, so it avoids crossing runways whenever possible. Routes can start at a node (a stand) or at an arbitrary position and heading. The start then snaps to the nearest edge; both edge ends are candidates. The first turn is checked against the aircraft's direction of travel, so it can't immediately reverse. A start node *behind* the aircraft means turning around on the spot and costs 5000 m, so it is only used as a last resort.

**Standard taxi flows**: `findRoute(..., { flows })` takes the preferred direction per taxiway (`Airport.flowVectors(runway)`, built from `runwayOps[].flows`). With `strictFlows` edges against a flow are not used at all; the pilot logic tries strict first and falls back to the soft rule (4x the distance) only if the strict route is impossible or needs a 180 degree turn. Routes with a `via` list are not affected.

`resolveClearanceLimit` (pilot.ts) handles incomplete instructions like `taxi via N, hold short of F`. It tries every junction of the last via taxiway with F (or every holding point of the runway) as destination and keeps the shortest valid route.

### Paths

A `Path` (`core/path.ts`) is the route's polyline with corners replaced by curves. Aircraft keep a scalar `s` (distance along the path). Markers map node ids to `s`, which is how stops (holding points, hold short) are placed on the path. Pushbacks, line-ups, landing roll-outs and taxi routes all use the same mechanism.

### Phases and requests

`Aircraft.phase` is the state machine described in [simulation.md](simulation.md#aircraft-life-cycle). `Aircraft.request` is what the pilot is currently waiting for. It drives the list's `REQ` column, flashing tags, reminders and waiting-time statistics.

### Radio

`Frequency` (`core/radio.ts`) models a shared channel. Controller transmissions are immediate. Pilot transmissions are queued with a priority, an earliest start and an expiry, and an `onTransmit` callback runs at the moment the pilot actually speaks. This is how a frequency change happens only after the read-back, and how a request "starts" when it is actually heard.

## Extending

### Adding an airport

See [airport-data.md](airport-data.md). In short: create `src/data/airports/<icao>.ts` exporting an `AirportData`, add it to `AIRPORTS` in `src/data/airports/index.ts` (the data checks in `tests/airports.test.ts` then run for it), describe its traffic and briefing, and document it in `docs/airports/<ICAO>.md`.

### Adding a position (Approach, Center)

The groundwork is in place:

- `SimConfig.position` (the primary position) and `SimConfig.positions` (all positions the user staffs at once, for **combined positions**) are `StationType`s, as is `Aircraft.frequency`. `Simulation.userStations` holds the staffed stations; "is this pilot talking to me?" is `Simulation.isOnMyFrequency(ac)`, "do I run this station?" is `Simulation.userControls(type)`.
- The core never names a station type directly. It asks for the station of a **role**: `Simulation.stationFor('delivery' | 'ground' | 'tower')`. If an airport has no station for a role, the next higher one covers it (delivery -> ground -> tower), like an unstaffed position covered from above. New departures start on `stationFor('delivery')` when the user staffs Delivery (`prepareDeparture` in `delivery.ts`), otherwise on `stationFor('ground')` with their clearance; arrivals start on `stationFor('tower')`, hand-offs go to those stations.
- Everything the user doesn't control is AI: Delivery (clearance given at spawn), Ground (`groundAI.ts`, when the user only staffs Delivery), Tower (`TowerAI`) and Approach (arrivals appear on final). Delivery (v0.6) is the worked example of a position: commands in `phraseology/commands.ts`, parser and formatter; execution in `delivery.ts`; pilot calls in `pilot.ts` (`deliveryCall`); the AI for the next position (`groundAI.ts`); UI in `ui/app.ts` (`deliveryItems`).

The **Tower** position (v0.7) follows the same pattern: commands `lineUp`, `takeoff`, `land`, `continueApproach`, `goAround`, `cancelTakeoff`, `vacate`; `TowerAI` decides itself only when `Simulation.userTower` is false and otherwise only flies the aircraft; pilot calls on Tower frequency in `pilot.ts` (`towerCall`); UI in `ui/app.ts` (`towerItems`).

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
