# Airport data format

Every airport is described by one `AirportData` object (`src/core/airport/types.ts`). The format is plain, serialisable data (it could be JSON) using **latitude/longitude** coordinates, so it can be produced by hand, by the `RunwayFrameBuilder` helper, or later by importers for real data sources (OpenStreetMap, EuroScope sector files, X-Plane `apt.dat`).

## Top-level fields

| Field                  | Type              | Description                                                              |
| ---------------------- | ----------------- | ------------------------------------------------------------------------ |
| `icao`                 | string            | ICAO code, e.g. `"EDDS"`                                                 |
| `name`, `city`, `country` | string         | Display names                                                            |
| `arp`                  | `{lat, lon}`      | Airport reference point. Also the origin of the local metric frame.      |
| `elevationFt`          | number            | Airport elevation                                                        |
| `magneticVariation`    | number            | Degrees, east positive (used for wind)                                   |
| `transitionAltitudeFt` | number            | Transition altitude                                                      |
| `dataNotice`           | string            | Accuracy note shown in the Connect dialog                                |
| `runways`              | `RunwayData[]`    | Physical runways                                                         |
| `taxiNodes`            | `TaxiNodeData[]`  | Nodes of the taxi graph                                                  |
| `taxiEdges`            | `TaxiEdgeData[]`  | Edges of the taxi graph                                                  |
| `stands`               | `StandData[]`     | Parking positions                                                        |
| `areas`                | `AreaData[]`      | Apron polygons (drawn below taxiways)                                    |
| `buildings`            | `AreaData[]`      | Building polygons (drawn above aprons)                                   |
| `stations`             | `StationData[]`   | ATC stations (callsign, type, radio name, frequency)                     |
| `runwayOps`            | `RunwayOpsData[]` | Per runway end: departure entries and arrival exits                      |
| `sids`                 | `SidData[]`       | Sample SIDs per runway end, used in generated flight plans               |
| `briefing`             | `BriefingSection[]` | Optional airport briefing shown in the help window (see [Airport briefing](#airport-briefing)) |
| `traffic`              | `AirportTraffic`  | Optional operator mix of the airport (see [Traffic](#traffic))           |
| `initialClimbFt`       | number            | Optional initial climb of the SIDs, used in IFR clearances (default 5000 ft) |
| `systems`              | `SystemId[]`      | Optional: the [systems](systems.md) the airport has (`surveillance`, `rmca`, `catc`, `routing`, `acdm`, `dcl`). Omitted = all. Missing systems are off and cannot be switched on |

## Runways

```ts
{
  name: '07/25',
  widthM: 45,
  lengthM: 3345,          // optional: published length, shown in the briefing
  ends: [
    { name: '07', threshold: {lat, lon}, end: {lat, lon}, elevationFt: 1267 },
    { name: '25', threshold: {lat, lon}, end: {lat, lon}, elevationFt: 1181 },
  ],
}
```

- `end` is the physical end of the runway (start of the take-off run from this end).
- `threshold` is the landing threshold. It differs from `end` if the threshold is displaced.
- The runway heading and length are computed from the two `end` positions.

## Taxi graph

```ts
taxiNodes: [
  { id: 'N_G', pos: {lat, lon} },
  { id: 'G',   pos: {lat, lon}, holdingPoint: { name: 'G', runway: '07/25' } },
  { id: 'RWY_G', pos: {lat, lon} },
]
taxiEdges: [
  { from: 'N_F', to: 'N_G', name: 'N', kind: 'taxiway' },
  { from: 'S_G', to: 'G', name: 'G', kind: 'taxiway' },
  { from: 'G', to: 'RWY_G', name: 'G', kind: 'runwayStrip' },
  { from: 'M_52', to: 'STAND_52', name: '52', kind: 'stand', oneWay: true },
  { from: 'M_D2', to: 'M_33', name: 'M', kind: 'taxilane', maxWingspanM: 36 },   // optional: code C only
]
```

Rules:

1. **Node ids** are unique strings. Their names don't matter to the simulation, but readable ids help when debugging.
2. **Edge names** are the designators controllers use (`N`, `G`). Several edges in a chain share the same name. For `stand` edges the name is the stand id.
3. **Kinds**: `taxiway`, `taxilane`, `stand`, `runwayStrip`, `runway`. See [architecture.md](architecture.md#taxi-graph).
4. **Holding points**: put a node with `holdingPoint` on every connector at the runway holding position. Connect it to the runway centre-line node with a `runwayStrip` edge and to the rest of the taxiway with `taxiway` edges.
5. **Runway centre line**: chain the runway nodes (one where each connector meets the runway) with edges of kind `runway`, named after the runway (`07/25`).
6. **One-way edges** (`oneWay: true`) can only be used from `from` to `to`. Use them for one-way taxiways and for **drive-through stands**: a one-way stand edge from the entry lane to the stand and another from the stand to the exit lane (set `pushback: false`).
7. **Turns**: routes never use turns sharper than 150° at a node, so model junctions with realistic angles. A connector that meets a taxiway at a very acute angle can only be used in one direction.
8. **Vacate stop point**: put a node a little behind each holding point on the side away from the runway (EDDS: 45 m). Arrivals stop there after vacating, clear of both the runway and the parallel taxiway.
9. Keep the parallel taxiway at least ~90 m from the holding points and stand centres at least ~50 m from taxilane centre lines. The see-and-avoid logic treats aircraft closer than `0.38 · (span A + span B) + 6 m` as being in the way.

## Stands

```ts
{
  id: '14',
  apron: 'Apron North',
  pos: {lat, lon},          // aircraft reference point when parked
  heading: 344,             // nose heading (true) when parked
  laneNode: 'M_14',         // taxi node where the lead-in line starts
  maxWingspanM: 36,
  pushback: true,           // false = taxi-out stand
  defaultPushFacing: 'east' // optional
}
```

`maxWingspanM` is the largest aircraft the stand itself is rated for. Neighbouring stands are checked automatically: an aircraft only gets a stand if the stand centres leave enough wingtip clearance to the aircraft on the stands next to it (4.5 m between code C aircraft, 7.5 m if one is code D or larger). So stands that can only take a wide-body when the neighbour is empty (like the EDDS wide-body positions 71A and 74A, which overlap 71+72 and 74+75) need no special data.

There must also be a node `STAND_<id>` at `pos`, connected to `laneNode` by an edge `{ name: '<id>', kind: 'stand' }`. A pushback moves the aircraft from the stand to `laneNode`, then 45 m (or 90% of the edge length, whichever is shorter) along a taxilane or taxiway edge leaving `laneNode`. The edge is picked by the requested facing.

## Runway operations

```ts
runwayOps: [
  {
    runway: '25',
    departureEntries: [
      { holdingPoint: 'A', intersection: 'A', fullLength: true },
      { holdingPoint: 'D', intersection: 'D', fullLength: false },
    ],
    exits: [
      { name: 'F', path: ['RWY_F', 'F', 'FG_X', 'F_CLR'], rapid: true },
      { name: 'E', path: ['RWY_E', 'E', 'E_CLR'], rapid: false },
    ],
    flows: [
      { taxiway: 'S', direction: 'east' },
      { taxiway: 'N', direction: 'west' },
    ],
  },
]
```

- `departureEntries` drive `taxi to runway 25` (full-length entries are preferred) and the *Taxi to* menu.
- `exits[].path` is the node sequence from the runway centre line, through the holding point, to the vacate stop point. Its second node must be the holding point; the Tower uses it to detect "vacated". The last node is where the aircraft stops.
- `flows` (optional) are the **standard taxi flows** while this runway is in use. `east` / `west` mean towards the higher / lower runway coordinate of the lower-numbered runway end (for 07/25: east = towards the 25 end). Automatic routes avoid taxiing against them.

## Stations

```ts
{ callsign: 'EDDS_GND', type: 'GND', name: 'Stuttgart Ground', frequency: '118.605' }
```

`type` is one of `DEL`, `GND`, `TWR`, `APP`, `DEP`, `CTR`, `ATIS`. A position can only be selected in the Connect dialog if the airport has a station of that type (and the position is implemented).

## Airport briefing

Every airport should have a `briefing`: what a controller needs to know at that airport. It is shown in the help window under **Airport briefing** (also via `BRIEFING` in the toolbar).

```ts
briefing: [
  {
    title: 'Departures',
    positions: ['GND', 'TWR'],          // optional: only for these positions
    items: ['Full length: holding point A (runway 25).', 'Ask first: `advise able for departure from intersection D`.'],
    table: { head: ['From', 'Typical instruction'], rows: [['Stands 9-19', '`taxi to holding point A via M, L2, S`']] },
  },
]
```

- Text in `backticks` is shown as an instruction.
- Do not repeat facts that are already in the data: the briefing adds **At a glance** (elevation, runways, transition altitude), **Now** (runway in use, ATIS, full-length and intersection holding points, exits and flows of that runway) and **Frequencies** automatically, followed by the `dataNotice`.
- Typical sections: your job at this position, taxi flows, departures (entries, push directions, typical routes), arrivals (exits, vacating, typical routes), stands, hot spots and pitfalls. Keep it consistent with `docs/airports/<ICAO>.md` and with how the simulator really behaves; mark simulator conventions as such.

## Traffic

Which operators fly to the airport and how often:

```ts
traffic: {
  source: 'Airport annual report 2024 (airline shares)',
  operators: [
    { airline: 'EWG', weight: 39.7, types: ['A319', 'A320', 'A20N', 'A21N'], destinations: ['LEPA', 'LEPA', 'BKPR', 'EDDH'] },
    { airline: 'SXS', weight: 8.3, destinations: ['LTAI', 'LTBJ'] },
    { airline: 'DCX', weight: 3 },   // business aviation, registration callsigns
  ],
}
```

- `airline` refers to an operator in [`src/data/airlines.ts`](../src/data/airlines.ts) (ICAO code, radiotelephony callsign, callsign style). Add new operators there.
- `weight` is the operator's share of the movements (any unit; passenger shares are fine). `types` and `destinations` override the operator's defaults; repeat an entry to make it more frequent.
- Without `traffic`, the global operator list is used.

## Data checks

`validateAirport()` (`src/core/airport/validate.ts`) checks an airport for mistakes: duplicate or dangling nodes, stands without nodes, invalid frequencies, runway operations that reference unknown holding points or nodes, flows on unknown taxiways, stands that cannot reach a full-length entry of every runway with an aircraft of their size, exits that lead to no stand, unknown operators or aircraft types in the traffic, types that fit no stand, and unknown holding points or stands named in the briefing. `tests/airports.test.ts` runs it for every airport in `src/data/airports/index.ts`, so a new airport cannot be merged with broken data.

## Authoring with `RunwayFrameBuilder`

Most aerodrome charts are drawn relative to the runway. `src/data/airports/builder.ts` lets you author a layout in a **runway-aligned frame** and converts it to lat/lon:

```ts
const b = new RunwayFrameBuilder(ARP, RWY_07_END, RWY_25_END);
// (along, lateral) in metres: along = distance from RWY_07_END towards RWY_25_END,
// lateral = perpendicular offset, positive = left of that direction
b.node('S_G', 1142, 190);
b.node('G', 1142, 93, { name: 'G', runway: '07/25' });
b.chain('G', 'taxiway', ['S_G', 'G']);
const area = b.area('Apron South', [[-30, -215], [560, -215], [560, -375], [-30, -375]]);
```

`b.nodes`, `b.edges` and the `area(...)` results go straight into the `AirportData`. See `edds.ts` for a complete example.

## Adding an airport - checklist

1. Create `src/data/airports/<icao>.ts` exporting an `AirportData`. Use real runway end coordinates; [OurAirports](https://ourairports.com/data/) (`runways.csv`) is a convenient public-domain source.
   - **Digitising from an aerodrome chart** (how EDDS was made): render the chart at high resolution with a coordinate grid. Measure the runway ends to get the scale, and check it against a known distance (e.g. a displaced threshold). Then read every junction, holding point and stand position into the runway frame (`along`, `lateral`). The EDDS file shows how chart coordinates map to the builder.
2. Register it in `AIRPORTS` in `src/data/airports/index.ts`, and remove it from `PLANNED_AIRPORTS` in `src/ui/dialogs.ts` if it is listed there. The [data checks](#data-checks) then run for it automatically.
3. Add tests (copy the "EDDS data" block in `tests/routing.test.ts`): every stand must reach every departure holding point, and every exit path must exist.
4. Describe the airport's [traffic](#traffic) (operators, shares, destinations); add missing operators to `src/data/airlines.ts`.
5. Write the airport **briefing** (see [Airport briefing](#airport-briefing)).
6. Document the airport in `docs/airports/<ICAO>.md` (layout, holding points, stands, typical routes, accuracy) and link it from the README.
7. Add a `CHANGELOG.md` entry.

### Licensing of source data

Only use data you are allowed to redistribute. Public-domain sources (OurAirports) and openly licensed sources (OpenStreetMap, ODbL, which requires attribution) are fine. Official AIP charts and commercial or community sector files must not be copied. They may be used as a **reference to digitise facts** (designators, topology, approximate positions) by hand, as done for EDDS; cite the chart in the airport page and in `dataNotice`, and never commit the chart files themselves. If you derive a layout from OpenStreetMap, credit "© OpenStreetMap contributors" in the airport's documentation page and in `dataNotice`.
