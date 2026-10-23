[Documentation](README.md) › Airport data

# Airport data format

Every airport is described by one `AirportData` object (`src/core/airport/types.ts`). The format is plain, serialisable data (it could be JSON) using **latitude/longitude** coordinates, so it can be produced by hand, by the `RunwayFrameBuilder` helper, or later by importers for real data sources (OpenStreetMap, EuroScope sector files, X-Plane `apt.dat`).

## Top-level fields

| Field                  | Type              | Description                                                              |
| ---------------------- | ----------------- | ------------------------------------------------------------------------ |
| `icao`                 | string            | ICAO code, e.g. `"EDDS"`                                                 |
| `name`, `city`, `country` | string         | Display names                                                            |
| `fir`                  | string            | ICAO code of the flight information region (US: the ARTCC), e.g. `"EDGG"`. Places the airport in the airport menu of the Connect dialog: continent, country and FIR come from `REGIONS` in `src/data/regions.ts` (a country with several FIRs - Germany - gets a FIR column) |
| `arp`                  | `{lat, lon}`      | Airport reference point. Also the origin of the local metric frame.      |
| `elevationFt`          | number            | Airport elevation                                                        |
| `magneticVariation`    | number            | Degrees, east positive (used for wind)                                   |
| `transitionAltitudeFt` | number            | Transition altitude                                                      |
| `dataNotice`           | string            | Accuracy note shown in the Connect dialog                                |
| `runways`              | `RunwayData[]`    | Physical runways                                                         |
| `taxiNodes`            | `TaxiNodeData[]`  | Nodes of the taxi graph                                                  |
| `taxiEdges`            | `TaxiEdgeData[]`  | Edges of the taxi graph                                                  |
| `stands`               | `StandData[]`     | Parking positions                                                        |
| `areas`                | `AreaData[]`      | Apron polygons, paved taxiway areas and helipads (drawn below taxiways)  |
| `buildings`            | `AreaData[]`      | Building polygons (drawn above aprons). `name` is shown on the scope (largest buildings first, a name that would overlap another is left out); `""` = no label |
| `pavement`             | `PavementLineData[]` | Optional paved lines outside the taxi graph, drawn like taxiways but never routed: `points`, `widthM` (default 15), `name`, `closed`. Used for links inside a runway strip that would bypass the holding points, and for closed taxiways that lead nowhere (`closed: true`: drawn with crosses; a named one that is not in the taxi graph is known as a closed taxiway - crews answer `unable, taxiway G closed`) |
| `stations`             | `StationData[]`   | ATC stations (callsign, type, radio name, frequency). Positions the airport lacks are not offered; without GND / DEL the Tower does their work (Sylt) |
| `runwayOps`            | `RunwayOpsData[]` | Per runway end: departure entries and arrival exits                      |
| `sids`                 | `SidData[]`       | SIDs per runway end, used in generated flight plans and clearances (see [SIDs](#sids)) |
| `briefing`             | `BriefingSection[]` | Optional airport briefing shown in the help window (see [Airport briefing](#airport-briefing)) |
| `traffic`              | `AirportTraffic`  | Optional operator mix of the airport (see [Traffic](#traffic))           |
| `initialClimbFt`       | number            | Optional initial climb of the SIDs, used in IFR clearances (default 5000 ft) |
| `systems`              | `SystemId[]`      | Optional: the [systems](systems.md) the airport has (`surveillance`, `rmca`, `catc`, `routing`, `acdm`, `dcl`, `loc`, `gp`). Omitted = all. Missing systems are off and cannot be switched on |
| `timeZone`             | string            | Optional IANA time zone (`"Europe/Berlin"`) for local-time rules and scenario start times. Default UTC |
| `deicingPads`          | `DeicingPadData[]` | Optional de-icing pads: `name` (`"DP1"`), `node` (taxi node of the pad, reached by one-way lead lines of kind `stand` named like the pad; a lead line may have several segments), `maxWingspanM`. Routes turn onto and off a lead line by at most 100°. Used with the scenario option [de-icing](scenarios.md#de-icing); the data check requires every pad to be reachable from a stand and to reach a full-length entry of every runway. EDDS: DP1 65 m, DP2 68.5 m, DP3 / DP4 36 m, entered from N, left onto S |
| `runwayCrossings`      | string[]          | Optional runway nodes where automatic routes cross a runway (elsewhere only if there is no other way, e.g. a closed taxiway). EDDS: `['RWY_K']` - crossings only between K and Y. Your own `via` lists are not restricted |
| `avoidTaxiways`        | string[]          | Optional taxiways automatic routes use only if there is no other way (e.g. reserved for military aircraft). EDDS: `['Z']` |
| `nightRestrictions`    | `NightRestrictions` | Optional night flying restrictions, local minutes after midnight: `jetDepartures: {from, until}`, `landings: {from, until}`, `delayedLandingsUntil`, `source`. EDDS: jets 1380-360, landings 1410-360, delayed until 1440. Applied only in scenarios with night rules (see [scenarios](scenarios.md#start-time-and-night-flying-restrictions)) |
| `parallelRunways`      | `ParallelRunwayData[]` | Optional parallel runways used at the same time, one entry per direction of operation: `ends` (`['26R', '26L']`, the ATIS names the first first), `approaches` (`'dependent'`: 1.5 NM diagonal between the finals, `'staggered'`: 3 NM, `'independent'`: none), `aprons` (apron -> physical runway, e.g. `{ 'Apron 1': '08L/26R' }`; other aprons use the nearest runway), `largeAircraft` (`{ runway, minWingspanM }`: these aircraft always use that runway). Every end needs its own `runwayOps`. When the wind picks one of the ends, all are in use; the ATIS can select each runway alone. See [parallel runways](simulation.md#parallel-runways). EDDP: 26R + 26L and 08L + 08R, dependent |

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
- `toraM` (optional) is the published take-off run available from this end when it is shorter than the runway: the far part does not count for take-offs in this direction (EDDS 25: 3045 m, the 300 m behind the displaced threshold 07). Entries can publish their own TORA (`departureEntries[].toraM`).
- `approaches` (optional) lists the published instrument approaches of this end that airliners may fly: `'ILS'`, `'LOC'` (localizer minima), `'RNP'`. With the ILS switched on arrivals fly the ILS; with the glide path off the localizer approach if `'LOC'` is listed, else RNP; with the localizer off RNP. Without `'ILS'` the ILS switches in the [systems](systems.md) change nothing, the ATIS does not report an ILS outage and the scope labels the extended centre line with the approach (`RNP`). Non-precision approaches get wider spacing from Approach. Omitted = `['ILS', 'LOC', 'RNP']`. EDXW: 14 `['RNP']`, 32 `['ILS', 'RNP']`; EDDS 07 `['ILS', 'RNP']` (the localizer approach is for aircraft up to 5.7 t only).

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
  { from: 'S_1', to: 'S_2', name: 'S', kind: 'taxiway', closed: true },             // optional: closed on the chart
  { from: 'W', to: 'RWY_W', name: 'W', kind: 'runwayStrip', shape: [{lat, lon}] },  // optional: curved edge
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
9. **Permanently closed** parts (crosses on the aerodrome chart, e.g. disused parts of a former military airfield) get `closed: true`: the scope draws them with black crosses, routes never use them, and a `via` naming a taxiway that is closed everywhere fails with `taxiway S closed`. Closed edges need no holding point and must not touch runway nodes (end them at the runway edge). This is different from the scenario option *closed taxiways*, which closes a whole designator for one session.
10. **Widths**: `widthM` is the pavement width (drawing only). Defaults: taxiway 23 m, taxilane 20 m, runway strip 23 m. Set it where the taxiway is narrower or wider (Memmingen P 15 m, R 27 m); `buildLayout()` takes it from the OSM `width` tag or the `widthM` option per taxiway. The scope rounds every chain of edges (radius up to 30 m, the radius taxiing aircraft fly) and adds fillets at junctions and runway entries (`core/airport/pavement.ts`), so a few shape nodes per bend are enough.
11. **Curved edges**: `shape` lists points between `from` and `to`. Aircraft follow them (taxi routes, line-up, exits), the scope draws them; routing and the runway logic still see one edge. Use it for a runway strip whose holding point lies before a turn towards the runway (Memmingen W).
12. Keep the parallel taxiway at least ~90 m from the holding points and stand centres at least ~50 m from taxilane centre lines. The see-and-avoid logic treats aircraft closer than `0.38 · (span A + span B) + 6 m` as being in the way.

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
  defaultPushFacing: 'east', // optional
  use: 'ga',                // optional: 'airline' (default), 'ga' (business jets first), 'cargo' (cargo airlines first, others only when nothing else is free)
}
```

Stand ids are numbers with an optional suffix letter (`14`, `71A`) or a letter followed by digits (`G1`, spoken `stand golf 1`).

**Alternative positions** - a stand whose centre lies within 25 m of a smaller stand, like EDDS 71A over 71 or Nuremberg 40D over 40 - are found automatically. The stand allocation gives aircraft up to code D (52 m) any free stand up to 52 m that is not an alternative position, so wide-body stands and alternative positions stay free; larger aircraft get the smallest stand that fits.

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

- `departureEntries` drive `taxi to runway 25` (full-length entries are preferred) and the *Taxi to* menu. `toraM` (optional) is the published take-off run available from the entry; it decides whether a crew accepts the intersection (default: measured from where the strip meets the runway to the far end, or the runway end's `toraM`).
- `exits[].path` is the node sequence from the runway centre line, through the holding point, to the vacate stop point. Its second node must be the holding point; the Tower uses it to detect "vacated". The last node is where the aircraft stops. Exits whose edges are too narrow for an aircraft (`maxWingspanM`) are not used by it.
- `departureEntries[].backtrack: true`: the entry is used with a **backtrack** - the departure enters the runway there, taxis to the runway end and turns around (airports without a taxiway to the runway end, e.g. Memmingen N for 24). The AI Tower backtracks automatically; crews ask for it.
- `exits[].backtrack: true`: arrivals that cannot make an exit ahead turn around on the runway and backtrack to this exit (Memmingen N for 06).
- `arrivalSpacingNm` (optional): minimum spacing Approach provides between arrivals on this runway, e.g. where arrivals can only vacate at the far end (Sylt: 6 NM).
- `flows` (optional) are the **standard taxi flows** while this runway is in use. `east` / `west` mean towards the higher / lower runway coordinate of the lower-numbered runway end (for 07/25: east = towards the 25 end). Automatic routes avoid taxiing against them.

## SIDs

```ts
{ name: 'ROTWE5B', runway: '25', fix: 'ROTWE', towards: [190, 255], frequency: '119.200' },
{ name: 'ETASA4B', runway: '25', fix: 'ETASA', destinations: ['EDDF', 'EDFE', 'EDFC', 'ETOU'] },
```

- `fix` is the exit fix; the generated flight plan route starts with it (`ROTWE DCT LEPA`), and Delivery checks that the cleared SID leads there.
- `towards` (optional): the range of destination bearings (degrees true from the airport, clockwise from the first to the second value) the SID is planned for. The generator plans each departure via the SID whose sector contains the direction of its destination (positions in `src/data/destinations.ts`), or the nearest sector.
- `destinations` (optional): the SID is planned only for these destinations (a fix restricted to a few airports); it takes precedence over the sectors. An empty list: never planned automatically.
- `frequency` (optional): the radar frequency departures on this SID contact after take-off (EDDS southern departures: 119.200); default the `APP` station.

The data check requires a SID for every destination of the airport's traffic on every runway, and a position for every destination when sectors are used.

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

- `airline` refers to an operator in [`src/data/airlines.ts`](../src/data/airlines.ts) (ICAO code, radiotelephony callsign, callsign style; `cargo: true` for cargo airlines, which park on the `cargo` stands first). Add new operators there.
- `weight` is the operator's share of the movements (any unit; passenger shares are fine). `types` and `destinations` override the operator's defaults; repeat an entry to make it more frequent.
- Without `traffic`, the global operator list is used.
- `rateFactor` (optional) scales the movements per hour of every density step (1 = the Stuttgart figures; Memmingen 0.35, Sylt 0.25).
- `standReserve` (optional, small airports): no new departure is placed on the last free stands (this many), and Approach releases an arrival only when a stand is free for it (Memmingen and Sylt: 1). An arrival that still lands without a stand gets one as soon as one becomes free.

The wind at session start comes from `wind` (optional): `{ primaryShare: 0.65, primary: [200, 280], secondary: [20, 100] }` - with that chance from the primary direction range, otherwise from the secondary one (default: the Stuttgart values 0.6 / 220-290° / 040-110°).

## Data checks

`validateAirport()` (`src/core/airport/validate.ts`) checks an airport for mistakes: duplicate or dangling nodes, stands without nodes, invalid frequencies, runway operations that reference unknown holding points or nodes, flows on unknown taxiways, stands that cannot reach a full-length entry of every runway with an aircraft of their size, exits that lead to no stand, de-icing pads that no stand reaches or that reach no full-length entry, unknown operators or aircraft types in the traffic, types that fit no stand, unknown holding points or stands named in the briefing, runway crossings that are not runway nodes, implausible published TORAs, SIDs for unknown runways or with invalid sectors or frequencies, parallel runways that are not two ends of different runways in the same direction with runway operations (or name unknown aprons), and traffic destinations without a SID or a position. `tests/airports.test.ts` runs it for every airport in `src/data/airports/index.ts`, so a new airport cannot be merged with broken data.

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

`b.nodes`, `b.edges` and the `area(...)` results go straight into the `AirportData`. See `edds.ts` for a complete example; its buildings come from OpenStreetMap (`osm-import.mjs EDDS --buildings-only` writes `edds.buildings.ts`).

## Importing from OpenStreetMap

`scripts/osm-import.mjs` builds the geometry of an airport from [OpenStreetMap](https://www.openstreetmap.org/) (© OpenStreetMap contributors, ODbL 1.0):

```sh
node scripts/osm-import.mjs EDJA --bbox 10.215,47.975,10.265,48.000   # downloads via the OSM API
node scripts/osm-import.mjs EDJA --osm edja.osm                        # or from a saved .osm file
node scripts/osm-import.mjs EDDS --osm map.osm,aerodrome.osm --buildings-only   # only the buildings (merged files)
```

It writes `src/data/airports/<icao>.layout.ts` (do not edit by hand): the taxi graph of every way tagged `aeroway=taxiway`/`taxilane` connected to the runway centre line (`aeroway=runway` with a `ref` like `06/24`), reduced to junctions, ends, holding positions and shape points (Douglas-Peucker, `--simplify` metres, default 2.5); the runway holding positions (`aeroway=holding_position`); stands from `aeroway=parking_position` (the stand point and the lane points where the lead-in lines meet a taxiway; lanes off the graph are snapped onto the nearest taxiway); areas (aprons - ways and multipolygons, not the grass ones (`surface` / `landuse=grass`) -, paved taxiway areas `area:aeroway=taxiway`, helipads); buildings (every `building=*` inside the aerodrome boundary `aeroway=aerodrome` or within `--building-margin` metres - default 40 - of an apron or taxiway, multipolygons such as a terminal included, plus terminals, hangars and towers anywhere in the box; named after their `name` tag, unnamed ones get no label); and taxiways not connected to the runway as `pavement` lines (drawn only). Node ids are readable: `N.3` (third node on N), `N/W` (junction), `RWY.N` (where N meets the runway), `HP.<osm id>` (holding positions), `STAND_<id>`. The raw OSM data is not committed.

`buildLayout(layout, options)` in `src/data/airports/osmLayout.ts` turns it into nodes, edges and stands. The airport file says what OSM does not: which holding positions are runway holding points and their names (`holdingPoints`), which taxiways to keep (`taxiways`), names for unnamed ways (`taxiwayNames`, `"?"` = unnamed; the importer appends the `colour` of a guide line to its ref, e.g. `M BLUE` - a taxiway of its own unless renamed; pilots and the parser know it as "mike blue"), apron taxilanes, wingspan limits and pavement widths per taxiway (`maxWingspanM`, `widthM`; also for unnamed lanes: key `''`; the importer writes OSM `width` tags into the layout), extra nodes and edges (a fifth element `true` marks an added edge permanently closed; `closedEdges` does the same for imported edges), imported edges that are drawn only (`drawOnly`, `"from>to"`: links inside a runway strip, the second fillet of a junction - they become `pavement` lines), dead ends to keep (`keepNodes`: a lane to a GA apron or a hangar), edge keys by area or name (`layoutEdges(layout, { names, inside })`: every imported edge with one of these raw names, or with all its nodes inside one of the polygons - for `drawOnly`, `edgeNames` or `edgeMaxWingspanM` of a whole area; a `drawOnly` edge keeps its name on the scope), and every stand with its size, apron and pushback / taxi-out (`osm: '1'` takes position and lanes from an imported stand whose OSM ref differs from the published designator, e.g. Memmingen P11). It makes every way onto the runway go through a holding point: the shortest way from each named holding point to the runway centre line becomes one `runwayStrip` edge (the nodes in between become its `shape`, so it keeps its curve), other taxiway edges touching the runway are removed, and dead ends are pruned. A pushback stand whose lead-in line meets the dead end of a taxilane is moved to the node before it, so the aircraft is pushed out facing away from the dead end. A way that forks off a strip between its holding point and the runway, crosses the same holding position line (a runway holding position of its own within 60 m of the main one) and joins the taxiways elsewhere (a rapid exit with a fillet to either side of the parallel taxiway, Leipzig S2-S4) is linked to the holding point node: one holding point as on the chart, both ways on behind it; its part inside the strip is drawn as pavement. `built.branches` lists them; `exitVia(built, 'S4', hp, { next: branchNode })` builds the exit along the branch. Without this the branch would be pruned as a dead end. Aprons and buildings are imported within `areaRadiusM` of the taxi graph and of the drawn-only taxiways (an apron at the end of a drawn taxiway belongs to the picture). Holding positions tagged `holding_position:type=intermediate` become intermediate holding positions (`intermediateHold`): `hold short of` a taxiway stops there. `exitVia(built, 'N', holdingPointNode)` builds an exit path (runway node, holding point, the next nodes up to 50 m behind it, along the exit's own taxiway rather than onto an unnamed fillet; `{ ...exitVia(...), backtrack: true }` marks an exit arrivals backtrack to when none ahead leads on to their stand). The airport file passes `built.pavement` on as `pavement` (the `drawOnly` edges and the loose taxiways; `dropLoosePavement: true` leaves the latter out). See `edja.ts` and `edxw.ts`.

Derived layouts are available under the ODbL: credit OpenStreetMap in `dataNotice` and in the airport page.

## Adding an airport - the recipe

The order matters: the facts come first, then the code. Sylt and Nuremberg got their accuracy in rounds (OpenStreetMap first, the AIP check later, the digitising last); doing every step up front gets there in one go.

**1. Source dossier - before any code.** Collect, for reading only (charts and packages are never committed):

- the **AIP** text pages (AD 2): reference point and elevation (2.2), aprons and taxiways with widths and limits (2.8, 2.9), runways with threshold coordinates and elevations (2.12), declared distances **including every intersection take-off** (2.13), frequencies (2.18), local rules, runway use, night rules and hot spots (2.20-2.22);
- the **charts**: aerodrome chart, ground movement and parking / docking charts (every taxiway designator, holding point, hot spot and stand), the approach chart titles (which approaches each runway end has), the SID charts (designators, exit fixes, initial climb);
- the **VATSIM Germany** procedures (knowledge base / SOP: runway use, standard taxi routes, stand allocation, positions and frequencies) and their ground radar map and ATIS profile (reference only);
- an **OpenStreetMap** extract (the OSM API `map` call, in tiles if the area is too large: the importer merges comma-separated files);
- the traffic: operators, types and destinations (airport route network, public timetables).

Write the facts down with their source. Then make the **gap list**: every chart designator, holding point and stand against OpenStreetMap - what is missing, unnamed or different (OSM often lags behind: runways renamed after the magnetic variation changed, new taxiways).

**2. Target list as tests.** Before building the layout, write the tests that the chart demands (see `tests/layouts.test.ts`): every taxiway designator, every holding point name, the stands, the published TORAs and the approaches per runway end. They fail until the layout matches the chart.

**3. Build.** `node scripts/osm-import.mjs <ICAO> --osm <files>`, then the airport file with `buildLayout()` options: holding point names, names for unnamed ways, limits and widths from the AIP, stands with their sizes, `drawOnly` for links inside a runway strip. Paved parts OpenStreetMap does not have are digitised by hand: render the chart on your machine, measure control points (thresholds, ARP, graticule crossings) and the outlines in pixels, and convert them with `node scripts/georef.mjs control.json trace.json` (it reports the residual of every control point; aim for a few metres). Outside Central Europe set `climate.monthlyMeanC` (mean temperature of each month) for the METAR. Register the airport in `AIRPORTS`, set its `fir` (add FIR, country or continent to `REGIONS` in `src/data/regions.ts` if new) and remove it from `PLANNED_AIRPORTS`. The traffic bars of the airport menu follow `traffic.rateFactor`.

**4. Runway operations and procedures.** Entries with their published TORA, exits, SIDs by exit fix, stations and frequencies, the approaches per runway end, wind distribution, night rules, the traffic mix (add missing operators to `src/data/airlines.ts`) and the [briefing](#airport-briefing).

**5. Check visually and against the chart, area by area** - before the airport is called finished:

- **Nothing ends in the grass**: list every dead end of the taxi graph and every loose end of a drawn line (apart from runway nodes and stand lead-ins) and find each one on the chart - an apron, a de-icing pad, a run-up area, a closed taxiway (draw it `closed`), a hangar. Taxiways the import pruned as dead ends come back with `keepNodes`; aprons at drawn-only taxiways are imported automatically.
- **Every apron of the chart** is there: general aviation, maintenance, cargo, military (drawn only if not simulated), with the stands the AIP AD 2.8 publishes - none where the chart has removed them.
- **Every exit and junction** leads on the way the chart shows, both ways where the pavement allows (forks in OpenStreetMap are kept behind one holding point).
- **Never invent designators**: holding points, stands and taxiways carry the names of the chart. Where the chart has none, use the taxiway name and say so in `docs/airports/<ICAO>.md`; never make up suffixes like "EAST".
- Overlay the chart locally if in doubt.

**6. Check in the simulation.** The [data checks](#data-checks) run automatically (`tests/airports.test.ts`, `tests/regions.test.ts`): every stand must reach a full-length entry of every runway. Add an hour of traffic per runway direction with a scripted controller (see `tests/eddn.test.ts`): no collisions, departures and arrivals flow. Run `npm run benchmark` if shared code changed.

**7. Document.** `docs/airports/<ICAO>.md` (sources, layout, holding points, stands, routes, what is approximate), `dataNotice`, the README and the in-app help where airports are listed, and a `CHANGELOG.md` entry.

### Licensing of source data

Only use data you are allowed to redistribute. Public-domain sources (OurAirports) and openly licensed sources (OpenStreetMap, ODbL, which requires attribution) are fine. Official AIP charts and commercial or community sector files (EuroScope packages, ground radar maps) must not be copied. They may be used as a **reference to digitise facts** (designators, topology, approximate positions, published distances) by hand, as done for EDDS (the de-icing pads and stand sizes after the VATSIM Germany ground radar data); cite the source in the airport page and in `dataNotice`, and never commit the files themselves. If you derive a layout from OpenStreetMap, credit "© OpenStreetMap contributors" in the airport's documentation page and in `dataNotice`.
