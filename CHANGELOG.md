# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Handbook (PDF)**: `docs/handbook/ultimate-atc-handbook.pdf`, the player documentation as one printable A4 book in the colours and font of the app - cover, contents, getting started, user guide with an annotated screen and screenshots of every dialog, tutorials, phraseology, scenarios, all airports with an overview picture, systems, tower operations, simulation model and glossary. Built with `npm run handbook` (`scripts/handbook.mjs`); the screenshots come from `scripts/handbook-shots.mjs`.
- **Soak test at every airport** (2.0 criterion "no dead ends"): `npm run soak` now runs every airport, every runway direction (parallel runways together) and two staffings (Ground alone; all positions), 3 seeds of one hour each (`SOAK_SEEDS`, `SOAK_AIRPORT`), with a scripted controller (`tests/bot.ts`) that works like a careful but simple controller. It fails on a collision or an aircraft that has not moved for 20 minutes and reports where and why. All 93 sessions pass (also with 6 seeds).
- **Turning around on purpose**: `turn around, taxi to stand 208` - the route starts the other way round (an airliner needs a tug). *Resolve conflict* uses it for its turn-around options.
- **Resolve conflict** offers more ways out: another entry of the runway the departure accepts (an intersection) or another free stand nearby for an arrival, when its own destination cannot be reached; the turn-arounds are always offered as the last resort.
- Data format: `noseStopM` for stands whose position is the nose wheel stop position, `largeAircraftTaxiways` (centre lines smaller aircraft avoid), taxi flows `north` / `south` across the runway.
- **Road to 2.0** in `docs/roadmap.md`: the agreed criteria for the next major version (Approach / Departure, the large airports under heavy traffic, an airport on every continent, changing weather and low visibility, voice on the iPad, the soak test at every airport, quality).
- **Road to 3.0** in `docs/roadmap.md` (proposal): multiplayer with several human controllers on a server, coordination between them, Frankfurt with the Apron position, performance, robust sessions, quality - with a requirements list and open questions.

### Changed

- **Stands and taxi routes after the soak test**: Bremen stands 12-17 and 12A and Cologne/Bonn A25-A35 stand behind their AIP nose wheel stop positions, clear of taxilanes S and L; at Cologne/Bonn aircraft below 36 m keep to the blue and orange guide lines (the centre lines M and N only for short links); at Leipzig/Halle the bridges E7 (northbound) and E8 (southbound) are one-way.
- **Arrivals without a stand** taxi to the nearest free stand they can reach without turning around; the exit is chosen for one of the nearest stands that fit. A landing aircraft whose exit is blocked by an aircraft waiting at its holding point (to cross the runway there) takes another exit instead of waiting on the runway.
- **Taxiing past parked aircraft**: an aircraft parked on its stand is passed with wingtip clearance (`0.3 · (spans) + 4 m` instead of `0.38 · (spans) + 6 m`).
- **Opposite traffic in narrow parts**: the aircraft that goes first never has the waiting one in its way, and the waiting one stops clear of the other's way.
- The AI Ground does not repeat a re-route that did not solve a conflict, and gives nothing to an aircraft whose tug is coming.
- A flight that misses its CTOT while ready at the holding point gets a new slot in 8-15 minutes (otherwise 20-40).
- **Documentation navigation**: the README lists the documentation grouped (Play, Airports, How it works, Development, Project, Print) - one row *Airports* with all ICAO codes instead of one line per airport. New overview pages `docs/README.md` and `docs/airports/README.md` (all airports in one table), and every page starts with a breadcrumb (`Documentation › Airports › EDDK`).

### Fixed

- A departure that rejected its take-off and taxied out again lined up on its own at the holding point (the old line-up clearance was still set) and waited there.
- The "more heavies" scenario option crashed at Sylt (no wide-body operators there).
- An arrival vacating at Sylt runway 32 to the north (L) without a stand got a stand it could only reach by turning around, stopped on the exit and blocked the runway.
- *Resolve conflict* offered `taxi to stand 208 via` (an empty via list) when the route needs no taxiway names.

## [1.4.0] - 2026-10-23

Two runways at the same time and Leipzig/Halle, Cologne/Bonn and Bremen, METAR and a full ATIS, hold short and rapid exits as on the charts, lenient crews.

### Added

- **Parallel runways in use at the same time**: airports with parallel runways (`parallelRunways`) use both for take-offs and landings. Each aircraft gets the runway of its apron (or size, or the nearest one); Approach spaces each final on its own and keeps the diagonal separation between the finals (dependent 1.5 NM, staggered 3 NM, independent none); the AI Tower works each runway on its own (independent parallel departures, line-up, occupancy, crossings and incursions per runway); a SID of the other runway (Delivery) or a holding point of it (Ground) moves a departure there. The ATIS names both runways (`dependent parallel approaches in progress`), the ATIS editor and the scenario builder offer the parallel runways or each one alone, scenario codes write them as `26R.26L`, the toolbar shows `RWY 26R 26L`, the briefing lists entries and exits of each runway.
- **Leipzig/Halle (EDDP)**, München FIR: runways 08L/26R and 08R/26L in parallel, 128 stands at their AIP positions on the aprons 1-5 (the DHL hub on apron 4 after the VATSIM Germany bays), Delivery, Ground and Tower, SIDs with the runway letter (N, S, Q, E), A-CDM and DCL, two thirds cargo (European Air Transport, DHL Air UK, AeroLogic, ASL, Kalitta, Atlas, Polar, MNG, Star Air). Layout from OpenStreetMap, runway data, declared distances, stand positions and parallel runway operations from the DFS AIP (facts only), procedures after VATSIM Germany. See `docs/airports/EDDP.md`.
- Airport menu: the proposed single-runway airports as *Coming soon* - North America: Aspen, Jackson Hole, Key West (United States), St. Maarten; South America: Buenos Aires Aeroparque, La Paz, Porto Alegre, Medellín, Quito; Asia: Nagoya Chubu, Penang, Colombo, Taipei Songshan, Phuket; Australia / Oceania: Gold Coast, Hobart, Queenstown - with their countries and FIRs.
- **Cologne/Bonn (EDDK)**, Langen FIR: runway 13L/31R (3815 m) for all take-offs and landings, 06/24 and 13R/31L drawn and crossed - departures 31R cross runway 24 on A next to the reference point (holding points AN / AS). 138 stands at their AIP positions on the aprons A-F and W, sizes after the VATSIM Germany stand data; Delivery, Ground and Tower; taxi flows (31R: A outbound, E inbound); A-CDM and DCL. Layout from OpenStreetMap; runway data, declared distances, stand positions, taxiway widths and limits from the DFS AIP (AIRAC 2026OCT01, facts only); procedures and SIDs (F / R / B) after the VATSIM Germany SOP. A quarter of the traffic is cargo: UPS, FedEx and DHL / European Air Transport with B747-8, B747-400, B777F, B767, A300 and B757 to Louisville, Memphis, Philadelphia, Bangalore and Guangzhou. See `docs/airports/EDDK.md`.
- **Bremen (EDDW)**, Bremen FIR: runway 08/26 (2040 m), 21 stands at their AIP positions (01-11 pushback, 12-17 taxi in / taxi out, wide-bodies on 12A and 18A), Ground (also clearances) and Tower, holding point F for runway 26 at the CAT II/III position (noise rule), 6 NM arrival spacing, night rules of the AIP. The Beluga take-off runways beyond both thresholds, runway 23 and the Airbus taxiways are drawn. See `docs/airports/EDDW.md`.
- **Coloured guide lines** are taxiways of their own: at Cologne/Bonn M BLUE / M ORANGE and N BLUE / N ORANGE next to the centre lines M and N (two aircraft up to 36 m side by side; blue outbound, orange inbound in the simulator). The parser takes the colour after the letter: `via november blue, mike blue`, `hold short of mike orange`. The OSM importer appends the `colour` of a guide line to its taxiway name.
- **Cargo airlines** (`cargo` in `src/data/airlines.ts`) park on the cargo stands first and use other stands only when no cargo stand is free. New operators: UPS, FedEx, European Air Transport (DHL), Sundair, Corendon; new types: A300-600F, B747-400F, B747-8F, B777F; new destinations for the long-haul freighters.
- Airport data: `layoutEdges()` selects the imported edges of whole areas (polygons) or raw taxiway names for `drawOnly`, `edgeNames` or `edgeMaxWingspanM`; `drawOnly` taxiways keep their names on the scope.
- Airport menu: continent **Australia / Oceania** - Australia (Brisbane FIR YBBB, Melbourne FIR YMMM) and New Zealand (New Zealand FIR NZZC) with the planned airports Sydney, Melbourne, Perth, Brisbane, Auckland and Wellington (*Coming soon*).
- **Airport recipe** in `docs/airport-data.md`: sources first (AIP, charts, VATSIM Germany procedures, OpenStreetMap, traffic), the chart's target list as tests, build, digitise, check visually and in the simulation, document. `scripts/georef.mjs` fits chart pixels to coordinates (with the residual of every control point) and converts traced outlines into airport data - the charts stay on your machine.

- **METAR**: a weather observation at minute 20 and 50 of every hour, from the session seed (CAVOK, few / scattered, broken or overcast cloud, visibility, rain, mist or snow, temperature after the month and the time of day, a QNH that rises or falls during the session); a SPECI at each phase of a thunderstorm; cold with snow in de-icing scenarios. A new METAR shows in the message window and says what differs from the ATIS; the toolbar shows the ATIS letter in red until you broadcast a new one.
- **ATIS** as D-ATIS text and spoken (`... Transition level 70. Wind 250 degrees 8 knots, CAVOK, temperature 12, dew point 6, QNH 1018. Trend nosig. Information K out.`), with notices: navigation aids out of service, the runway of each apron and of the large aircraft with parallel runways, closed taxiways, de-icing, A-CDM in progress, DCL out of service, windshear. The ATIS editor shows the latest METAR, is pre-filled with its QNH and previews the new ATIS in both forms.
- **Old ATIS letters**: crews listen to the ATIS 2-8 minutes before their first call, so after a new ATIS some report the old letter. `information K is current, QNH 1018` (aircraft menu, quick-action bar) or the ALL STN broadcast corrects them; a crew that leaves your frequency with an old letter costs 3 points (new score table row and debriefing tip). `QNH 1018` alone is understood too.
- Airport data: `climate` (monthly mean temperatures) for the METAR.

- **Intermediate holding positions** from the charts (OpenStreetMap `holding_position:type=intermediate`, e.g. Leipzig/Halle): `hold short of taxiway X` stops there, with the nose at the line.

- **Cologne/Bonn apron U** (maintenance and general aviation): U10-U26 at their AIP positions, reached across runway 13R/31L at B / P and along P; business jets park there.
- **Bremen runway 05/23** (700 m, VFR take-offs only) is drawn as a runway; it was a plain line ending in the grass.

### Changed

- **Taxiways that ended in nothing**: aprons at the end of drawn-only taxiways are imported too (Cologne/Bonn apron L at the 24 end); Leipzig/Halle K leads to the noise abatement facility and G2 to its pad (they were pruned as dead ends), and the stub P south-east of H1 is drawn closed, as on the chart.
- **Hold short** without a holding position: the aircraft stops with its nose 40 m from the centre line of the other taxiway, measured from where its route leaves its own taxiway - it stopped 40 m before the junction node, which at junctions mapped with fillets (Leipzig N / E7) was in the middle of the junction.
- **Lenient crews**: a via list that leaves out a connecting taxiway is no longer refused; the crew adds it (at most two taxiways, 600 m between the named ones; after the last one, one taxiway on to the destination) and reads back the whole route.
- **Rapid exits that fork before their holding points** (OpenStreetMap: a branch with a runway holding position of its own) keep both branches behind the one holding point of the chart: at Leipzig/Halle S2, S3 and S4 (landing 26L) now lead onto T east as well as west; the import pruned the second branch as a dead end. Memmingen C and D get their second fillet onto P. Of the branches of one exit, the landing crew takes the one towards its stand.
- **Turning off rapid exits either way**: from one taxiway onto another the router allows turns up to 175 degrees (OpenStreetMap often lacks the fillet for the other direction, e.g. Cologne/Bonn A1 onto A); automatic routes use them only if there is no other way. Exit paths follow the exit's own taxiway instead of a one-way fillet (Leipzig S3). Vacated arrivals stop with the nose clear of the taxiway ahead instead of in the junction.
- Landing: crews prefer an exit from which they can taxi on to their stand without turning around, and backtrack to one marked for it if none ahead does (Sylt: airliners that roll on to L backtrack to D).
- Opposite traffic on lanes beside each other too close for both wingspans (Leipzig apron 4) or without a junction between them: the crew further from the narrow part waits short of it until the other has passed (they met and blocked each other for good).
- See-and-avoid only checks traffic within reach of the look-ahead (faster with many aircraft on the ground, same behaviour).
- Sidebar: **SAY AGAIN** instead of STANDBY - the selected aircraft (or the pilot who called last) repeats its last transmission. `standby` stays in the aircraft menu and on the command line.
- **Compact data tags when zoomed out**: with the whole airport in view (the typical Tower picture, e.g. on an iPad) tags show only the callsign, `*` for a request and `PAN`; the selected (tapped) aircraft and the one under the mouse get the full tag. *Settings -> Data tags -> Always full* keeps the full tags.
- Pushback: without a `facing`, a direction that would need a 180 degree turn afterwards (towards the dead end of a taxilane) is only taken if there is no other.
- Landing: an arrival does not take an exit where a departure is holding at the holding point (an exit that is also a departure entry); it waited on the runway for good.
- Automatic routes keep the taxi flows only if that does not mean crossing a runway more often (a detour round the other side of the airport).
- AI Ground: crossings of a runway that is not in use are cleared with that runway's name (it named the runway in use, which the crew refused); the Ground and Tower menus offer `Cross runway` with the runway the aircraft holds short of.
- OSM importer: a guide line colour is no longer appended twice when the ref already names it (`L orange`).

### Fixed

- **Taxi instructions at Cologne/Bonn (and Bremen, Leipzig/Halle)**: every taxi instruction of the aircraft menu got `unable`. OpenStreetMap maps the fillets of many junctions as short unnamed ways; the proposed route listed them as empty via taxiways and the router did not allow unnamed edges between two via taxiways. Short unnamed links (up to 150 m) are now allowed anywhere on a via route and never listed in it. A test sends the menu's taxi instruction to every departure and arrival at every airport and runway direction.
- Parser: taxilane names with a dot (`Z4.1`, said `zulu 4 point 1`) are understood.
- OSM layouts: a pushback stand at the dead end of a taxilane (Cologne/Bonn D30, Leipzig/Halle apron 4) is pushed back from the node before it; it was pushed out facing the dead end.

## [1.3.1] - 2026-10-22

The airport menu step by step, with animations and *Coming soon* where there is no airport yet.

### Changed

- Airport menu: it always starts with the continents (it opened with the way to the selected airport expanded); each column slides in with a short animation after a choice in the previous one, its entries fade in one after another, and the dialog and the open columns glide to their new centred place. The selected airport is marked in its column. No animation with the system setting *reduce motion*.
- Airport menu: *Coming soon* wherever there is no airport yet (continents, countries, FIRs, the planned airports) instead of the number of planned airports; the airport column ends with a lit stop bar and *END OF LIST* instead of the legend of the traffic bars (their meaning is in the tooltip).

### Fixed

- Tests: the one-hour sessions at Nuremberg and Sylt get a 30 s time limit like the other long simulation tests (with all test files running in parallel, the Nuremberg one could exceed the default 5 s).

## [1.3.0] - 2026-10-22

The airport menu of the Connect dialog: continent, country and FIR, airport - with the runways and the traffic level of each airport.

### Added

- **Airport menu** in the Connect dialog: the airport field opens columns to the right of the dialog, each next to the previous one so an earlier choice can still be changed - continent (Europe, North America, South America, Asia), country with its FIR, for Germany the FIRs (Bremen EDWW, Langen EDGG, München EDMM), airport with its runways and traffic bars (1-4, from the movements per hour at medium traffic). The dialog and the menu are centred together; picking an airport closes the menu. Keyboard: arrow keys, Enter, Escape. Planned airports are listed but cannot be selected.
- Airport data: `fir` (ICAO code of the FIR), continents, countries and FIRs in `src/data/regions.ts`.

### Changed

- A shared scenario link selects the airport of its scenario in the Connect dialog (it showed an error until the airport was picked by hand).
- Phones: the Connect dialog puts the labels above the fields, so nothing is cut off at the right edge.
- Project rules: before every release the user is asked for the version number (patch, minor or major), with a suggestion; minor and patch releases are no longer published without asking.

## [1.2.1] - 2026-10-22

Complete layouts for Sylt and Nuremberg and every airport checked against the DFS AIP (AIRAC 2026OCT01: text pages, aerodrome, ground movement, approach and SID charts - used as a reference only, facts read by hand). Published as 1.3.0 at first and renumbered to 1.2.1; 1.3.0 is the airport menu above.

### Added

- **Sylt: every taxiway of the aerodrome chart** (AMDT 06/26): besides A, C, D, I and P now **B** (5.7 t), **E**, **F**, **G** (to the glider site), **L**, **L1** (Apron 3), **L3** and **M**, the lanes of Apron 2, Apron 3 and Apron 4, with their holding points (B, G and L at runway 14/32; M, P, E and F at runway 06/24). Weight-limited taxiways (B, Apron 4: 5.7 t; I: 2 t) are for light aircraft, which the simulator does not have. **Apron 3** gets business jet positions N1-N3: general aviation from 15 t or 19 m wingspan must park there (AIP); arrivals 32 vacate via L, departures 14 line up from L.
- **Nuremberg: the general aviation lanes** S3 (to Apron G2 / G2A), S4 west (FAI apron) and **T2** (aprons U1 / U2), code B, and the **GA aprons** OSM does not have, digitised from the ground movement chart: the rest of Apron G2 / G2A, the J corridor ("Entry GAT"), the strips along S3 / S4 and at Hangar 8, the FAI and Aero-Dienst aprons; G3 is grass parking and no longer drawn as an apron.
- **Sylt: the closed parts of the aerodrome chart**, digitised by hand: G along the east side and its links to the 24 end and runway 14/32, E south of runway 06/24, the 80 m wide **former runway** (closed east of 14/32, C runs on its western part) with the links and the loop around it, the stub west of D and the turning pad at A. Crosses are never drawn on a runway in use.
- **Buildings and aprons**: the OSM importer now takes every building on the aerodrome (also buildings mapped as multipolygons, such as the Nuremberg terminal, and hangars just outside a boundary drawn too tightly), paved taxiway areas and helipads. Nuremberg shows the terminal, hangars 2-8, Halle A, the maintenance and Aero-Dienst buildings and 70 more; Sylt the Apron 3 and Apron 4 hangars and the general aviation buildings; Memmingen 91 buildings instead of 35 (re-imported, the taxi graph is unchanged). **Stuttgart** gets the real building outlines from OpenStreetMap (141 buildings: terminals 0-4, hangars, cargo, the tower ...) instead of a few rough rectangles - `osm-import.mjs --buildings-only` for airports whose taxi graph is built by hand.
- Airport data: **`pavement`** lines - paved surfaces outside the taxi graph, drawn like taxiways but never routed (links inside a runway strip that would bypass the holding points; closed taxiways that lead nowhere, drawn with crosses and refused by crews). `buildLayout()` options `drawOnly`, `keepNodes` and `edgeMaxWingspanM` (limits that change along a taxiway); taxiways not connected to the runway are drawn as pavement.
- Airport data: **published approaches per runway end** (`approaches`). A runway without an ILS is flown as an RNP approach whatever the ILS switches say (Approach spaces such arrivals like non-precision approaches, the ATIS reports no ILS outage, the scope labels the centre line `RNP`); a localizer-only approach needs published localizer minima. Sylt: runway 14 has an RNP approach only (it was flown as an ILS). Stuttgart 07: the localizer approach is for aircraft up to 5.7 t, so airliners fly RNP when the ILS 07 fails.
- Stuttgart: intersections **F** (2020 m) and **E** (1400 m) for runway 07; Nuremberg: intersection **D** (1900 m) for runway 10.

### Changed

- **AIP declared distances** on every entry: Sylt C 1748 m; Nuremberg A / F 2700, B 1962, E 2300 m; Memmingen W 2630, R 2175, N 1570 m (06) and N 1070 m without the backtrack (24, the crew now says `1070 metres available from N`).
- **Taxiway widths after the AIP** (AD 2.8): Sylt 15 m (C 12 m), Nuremberg 22.5-23 m (N2 18 m, N4 21 m, the GA lanes 10.5 m), Memmingen R 23 m, N / W 18 m, the south side 12 m, Stuttgart 30 m for the main taxiways (C, E, G, Y 23 m, W, Z 22.5 m).
- Code letter limits from the AIP: Stuttgart G, E and C code D (52 m); Nuremberg J code C from F to M4 (code D / E only cross it between M3 and M4 / N4) and code B south of M4; Sylt: business jets of 19 m and more no longer use Apron 2 and the grass taxiway I.
- Nuremberg: the link from the east end of the apron to A, B and N2 is **M2** (ground movement chart; was named A).
- Memmingen: **P is closed west of P4** (crosses on the charts; it was open up to the 06 end), R meets the runway about 475 m from the 06 end (was 455 m).
- Thresholds, elevations and reference points from the AIP: Sylt (elevation 52 ft, threshold 14 32 ft / 32 31 ft, the ARP on the 14/32 centre line), Nuremberg (1044 ft, thresholds 1020 / 1044 ft), Memmingen (2079 ft, threshold 24 2053 ft).
- Stuttgart: de-icing pad **DP2** takes code E plus the B747-8 (68.5 m, AIP AD 2.20; was 80 m); KRH also for Pirmasens (ETIP).
- Building names on the scope: each name once (on the largest building that carries it), largest buildings first; a name that would cover a stand number, a taxiway designator or another name is left out; unnamed buildings get no label.
- Briefings and airport pages: approaches, declared distances, hot spots (Sylt M / P at the 06 end, Nuremberg M3 / M2), AIP sources.
- Production build: the generated airport data (OSM layouts and buildings) is a JavaScript file of its own, so the code bundle stays below the bundler's size warning.

### Fixed

- Sylt: runway 06/24 is 45 m wide (was 30 m); the threshold elevations of 14 and 32 were swapped.
- Nuremberg briefing: the parallel taxiway lies south of the runway (it said north).
- Memmingen briefing: stand 6 is a taxi-in / taxi-out position in the simulator (it said pushback).

## [1.2.0] - 2026-10-21

Real-world overhaul and EuroScope fidelity: every airport and procedure checked against real data (OpenStreetMap, OurAirports, VATSIM Germany data, published charts as a reference only), SIDs by destination, Stuttgart TORA, de-icing pads and stands as published, and a PHX scope style modelled on the VATSIM Germany ground radar.

### Added

- **PHX scope style** (settings: *Scope style*, default *PHX night*; also *PHX day* and *Classic*): the look of the VATSIM Germany EuroScope ground radar, modelled on the DFS PHOENIX tower display - its map colours (grass, aprons, taxiways, holding points, de-icing pads), **departures blue, arrivals yellow**, radar returns drawn as raw video with an SSR symbol and **history dots**, label boxes, the PHX ground states (`SUG`, `PBG`, `TXG` / `TX`, `ALU`, `DEP`, `ONB`) and list windows with grey title bars. *Classic* keeps the previous colours and EuroScope states. See [user guide](docs/user-guide.md#colours).
- **SIDs by destination**: flight plans are filed via the SID towards the destination (new SID fields `towards` - a sector of initial great-circle bearings - and `destinations` for fixes that serve only certain airports), with positions of all destinations from OurAirports (`data/destinations.ts`). The data validation checks that every destination has a SID.
- **Stuttgart: all real exit fixes** with their current designators - 25: ABTAL4B, DKB9B, ETASA4B, GEBNO7B, KRH5B, KUNOD2B, OKIBA4B, ROTWE5B, SUL3B, TAGIK4B, VESID4B; 07: the H SIDs - with the VATSIM Germany Delivery restrictions (ETASA only to Frankfurt and nearby, KRH to Saarbruecken, Karlsruhe / Baden-Baden and nearby, SUL to Zurich, Friedrichshafen and nearby, DKB to Nuremberg and Schwaebisch Hall, GEBNO not planned automatically).
- Stuttgart: southern departures (ROTWE, SUL, KUNOD, ABTAL) contact **sector Reutlingen 119.200**, the others **Langen Radar 125.050** (new SID field `frequency`); crews read back the frequency of their sector.
- Stuttgart: **published TORA per entry** (new fields `toraM` on runway ends and departure entries) - 25: A 3045, B 2435, C 2175, D 1990, **E 1665 (new)**; 07: K / Y 3345, I 3090, W 2520, H 2515, **G 2210 (new)** - shown in the briefing and used by the crews.
- Airport data: `runwayCrossings` (automatic routes cross a runway only there) and `avoidTaxiways` (used by automatic routes only if there is no other way); Stuttgart crosses only between **K and Y** and keeps off the military taxiway **Z**.
- Stuttgart: stand **44**, wide-body positions **9A, 24A, 26A, 28A** and the **Apron South layout since AIRAC 2512** (100-104 code D, 206 / 207 code E-F).
- Nuremberg: SID **SULUS** (north-west).
- Departure / arrival lists: cells with a function (callsign, type, SID, squawk, clearance flag, cleared-to point, state) open it with a click, like the tag items.

### Changed

- **Tags** laid out like the VATSIM Germany ground labels: callsign with runway (departures) or stand (arrivals), type and wake category with the ground state, SID (clickable) and the cleared-to point; airborne aircraft show altitude, speed and SID or approach.
- **Lists** in the VATSIM Germany column order: departures REQ, C/S, STND, TSAT, CTOT, ATYP, W, ADES, RWY, SID, ASSR, C, INT, TAXI, STS, FRQ; arrivals REQ, C/S, ATYP, W, ADEP, RWY, APCH, SEQ, LND, DIST, STND, STS, FRQ.
- Stuttgart **de-icing pads DP1-DP4** at their real positions: entered from N and left onto S in their direction (DP1 / DP3 westbound, DP2 / DP4 eastbound), wingspan limits DP1 65 m, DP2 80 m, DP3 / DP4 36 m.
- Stuttgart stand sizes after the stand data: 9 up to 60.5 m (9A up to 65 m), 11 code D, 48 30 m, 51 / 53 / 55 / 56 45 m, 52 / 54 code D, 65 29 m, 71A / 74A code E-F (80 m, the only stands for an A380 diversion); the holding bays P1 / P2 follow OpenStreetMap.
- **Magnetic variation** of all airports from the World Magnetic Model (2026): Stuttgart 3.9°, Nuremberg 4.3°, Memmingen 4.1°, Sylt 3.9°.
- Nuremberg and Memmingen SIDs are planned by the direction of the destination (Memmingen: UMTEX south-west, KPT east and south, LUPOL west and north).
- **Stand allocation**: narrow-bodies are spread over all stands up to code D (52 m) instead of always the smallest one that fits; **alternative stand positions** (a larger stand overlapping a smaller one, e.g. 9A, 71A) stay free for the aircraft that need them.
- The command line placeholder shows an example for the airport and position.
- Briefing: TORA of every entry and the wingspan limit of every de-icing pad.

### Fixed

- Sylt: the runway rotation (`ROT`) aligns the scope with the main runway 14/32 instead of 06/24.
- Phraseology: "1 mile final" instead of "1 miles final".
- Stuttgart: TORA 25 was measured from the runway geometry (3345 m); the published value is 3045 m.

## [1.1.1] - 2026-10-14

### Added

- Airport data: **permanently closed taxiway parts** (`closed: true` on an edge, `closedEdges` / closed `addEdges` in `buildLayout()`): drawn with black crosses like on the aerodrome chart, never used by routes; crews refuse a route via a taxiway that is closed everywhere (`unable, taxiway S closed`). Unnamed apron lanes get no designator label.
- **More realistic taxiway drawing**: taxiways are drawn as rounded chains (bends with the radius taxiing aircraft fly) instead of straight pieces with corners, junctions and runway entries get fillets (widened corners), and taxiways have their own **widths**. Memmingen after the chart (N / W 23 m, R 27 m, the south side and S 15 m, GA lanes 12 m), Nuremberg from OSM (A-D, F 20 m). The OSM importer reads `width` tags; `buildLayout()` takes `widthM` per taxiway.
- Airport data: **curved edges** (`shape` points). Runway strips built by `buildLayout()` keep the curve of the taxiway instead of a straight line from the holding point to the runway: aircraft taxi, line up and vacate along it. Memmingen W now has its turn towards the runway (holding point W lies before it); the strips at Nuremberg and Sylt follow their fillets too.

### Changed

- **Realistic speeds on final**: arrivals no longer fly the whole final at their final approach speed. They intercept at 170-190 kt, reduce to 160 kt from 7-8.5 NM and keep it until 4 NM (the usual Approach instruction), then slow down to Vapp - stabilised at about 3 NM / 1000 ft. Approach spaces arrivals so the spacing is met at the threshold (compression on final), ETAs follow the profile. `resume normal speed` returns to the profile, `reduce to final approach speed` slows down at once; crews refuse a speed they could not reduce from in time. Speed menu: 180 kt until 6 NM, 170 kt until 5 NM, 160 / 150 kt until 4 NM. Release benchmark (Stuttgart, automatic controller): 11.7 departures / 6.6 arrivals per hour instead of 14.0 / 7.2 - arrivals now take longer on final, so the runway is free for departures less often; Tower benchmark 11.3 / 10.2 (11.2 / 10.6). No collisions, incursions or go-arounds. Measured on the commits before and after this change: the drop comes from it alone.
- **Memmingen: complete layout after the aerodrome chart.** All taxiways and aprons are now in the simulator: **R** (between the aprons and the runway, 2175 m take-off run for 06; an intersection for 06 and an exit for 24), the south side **P**, **P4**, **C**, **D**, **E**, the GA lanes, Apron 3 and **Apron 4** (small aircraft only, 24 m wingspan limit), and the parts the chart marks closed (crosses): **S**, P east of E, the loops around both runway ends and the branches to Apron 4. The OSM positions were checked against the chart's intersection take-off distances (within a few metres); what OSM lacks was digitised by hand from the chart (approximate).
- Memmingen checked against the AIP aerodrome and ground movement charts (as a reference only): terminal stands are **P11 / P12** (were 1 / 2), runway length 2630 m; the position of holding point W (before the turn towards the runway) matches.

## [1.1.0] - 2026-10-14

Winter operations, three more airports and runway backtracking: de-icing as a scenario condition, the Stuttgart holding bays P1/P2 and de-icing pads DP1-DP4, Nuremberg, Memmingen and Sylt from OpenStreetMap.

### Added

- **De-icing** (winter operations): scenario option `I` (scenario builder: *Conditions* -> *De-icing*), preset *Winter morning*. Every departure up to 52 m wingspan has to be de-iced on one of the de-icing pads before take-off: the crew asks `ready for taxi, request de-icing`, you taxi it to a pad (`taxi to de-icing pad DP2 via N`, or `taxi to de-icing` for a free one), it is de-iced for 6-10 minutes (status `DEICE`) and reports `de-icing complete on DP2, ready for taxi`. Crews refuse the runway before the de-icing and refuse an occupied pad. ATIS, briefing and the *Taxi to* menu (pads first) show it; the AI Ground de-ices too and releases de-iced aircraft from the pads only while fewer than 3 departures taxi to the runway. See [scenarios](docs/scenarios.md#de-icing).
- **Stuttgart: holding bays P1/P2** at the 25 end (bypass from N to S, code C) and the **de-icing pads DP1-DP4** between N and S, at estimated positions ([EDDS](docs/airports/EDDS.md#holding-bays-and-de-icing-pads)). New airport data field `deicingPads`, checked by the data validation.
- **Nuremberg (EDDN)**: layout from OpenStreetMap, procedures after the VATSIM Germany SOP - runway 28 preferred, parallel taxiway F / A, terminal stands with pushback, remote and cargo stands taxi-in / taxi-out, business jet stands, taxiway restrictions; Ground gives the clearances (datalink common, no A-CDM). About 60 % of Stuttgart's traffic. See [EDDN](docs/airports/EDDN.md).
- **Memmingen (EDJA)**: layout from OpenStreetMap, procedures after the VATSIM Germany SOP. Only the taxiways airliners may use (W, N); departures 24 and landings 06 **backtrack** on the runway. Ground gives the clearances (no Delivery). Ryanair / Wizz Air traffic at about a third of Stuttgart's rate. See [EDJA](docs/airports/EDJA.md).
- **Backtracking**: `backtrack runway 24, line up and wait` / `enter runway 24 and backtrack` / `backtrack runway 24, cleared for take-off` - the departure taxis along the runway to its end, turns around on the runway and departs from the full length; `backtrack, vacate via N` - an arrival turns around after landing and backtracks to an exit behind it. Airports mark entries and exits used that way (`backtrack`); crews ask for it (`request backtrack`) and refuse a line-up without it when the runway ahead is too short. The AI Tower backtracks on its own, Approach spaces arrivals wider on such runways. Tower menu and quick-action bar (`B/T`).
- **Sylt (EDXW)**: layout from OpenStreetMap, procedures after the VATSIM Germany SOP - a Tower-only airport (Sylt Tower also does the ground movements and clearances), runway 14/32 in use, departures 32 cross runway 06/24 on the way to the 32 end, arrivals vacate at the far end, three airliner stands and a business jet apron. A quarter of Stuttgart's traffic. See [EDXW](docs/airports/EDXW.md).
- **OpenStreetMap importer** `scripts/osm-import.mjs` and `buildLayout()` for airport layouts from OSM (ODbL), see [airport data](docs/airport-data.md#importing-from-openstreetmap).
- Airport data: `traffic.rateFactor` (movements relative to Stuttgart), `wind` (wind distribution at session start), stand `use` (airline / ga / cargo), `traffic.standReserve` (the last free stands are kept for arrivals; Approach releases an arrival only when a stand is free), `runwayOps[].arrivalSpacingNm`, lettered stand ids (`G1`, `stand golf 1`), holding points of a second runway (crossings) in `buildLayout()`, initial climb as a flight level when it is above the transition altitude (`climb via SID to flight level 70`).

### Changed

- Roadmap: the wishes for after 1.0 are now a "1.x" section in the [roadmap](docs/roadmap.md).
- Project rules: minor and patch releases (1.x.y) may be published without asking.
- The AI Ground keeps a departure on its stand while its way out would meet an arrival coming the other way on a taxiway (single taxiways like Memmingen N). Stuttgart benchmark unchanged (Tower benchmark: 10.6 instead of 10.5 arrivals per hour).
- Connect dialog: only the positions the airport has are offered (Memmingen has no Delivery); the tutorials are Stuttgart-only; scenario presets adapt to the airport (runway, closures, night rules, de-icing).

### Fixed

- An arrival that lands while every stand is taken gets a stand as soon as one becomes free (before, it kept none).
- A runway crossing request names the runway that is actually crossed, and is withdrawn when the aircraft is moving again.
- At an airport without a Ground position, the Tower's ground instructions (taxi, pushback, crossings) are accepted on the Tower frequency.

## [1.0.0] - 2026-10-13

The first full version: Delivery, Ground and Tower at Stuttgart, alone and combined, with tutorials for each position, training scenarios with conditions (night flying restrictions, closed taxiways, thunderstorm), traffic sliders and a final review. Statistics: [benchmarks](docs/benchmarks.md#major-release-statistics) (chart: `docs/images/benchmarks-1.0.svg`), review: [release report](docs/release-1.0-report.md).

### Added

- Benchmark chart for the release (`docs/images/benchmarks-1.0.svg`) in the benchmarks page and the README.
- **Release report for 1.0** ([docs/release-1.0-report.md](docs/release-1.0-report.md)): criteria, checks, fixes, realism review, open points; 1.0 candidate statistics in `docs/benchmarks.md`.

- **Sliders** with five steps: traffic density (light ... heavy, also in the settings), special events (never, very rare, rare, occasional, often - also in the settings), and in the scenario builder the traffic mix (departure rush ... balanced ... arrival rush) and the share of heavies (normal, 10, 20, 35, 50 %). Scenario codes store the in-between steps as four digits (`EDDS-25-4214-X-...`); the letter form (`MB2`) is kept whenever it fits, so older codes stay valid and unchanged.

- **Tutorials** for Delivery, Ground and Tower (Connect dialog, *Tutorial*): a guided first session with a fixed traffic situation; a panel on the scope explains each step in a few words, *Show me* puts the example instruction into the command line, steps continue on their own when done; *Back* shows the previous step again, *Next* goes on, *Skip tutorial* ends it; the panel disappears when the tutorial is finished; *Live traffic* afterwards. The Delivery lesson includes a readback error to catch and a datalink clearance. Every lesson is played automatically by a test.

- **Scenario conditions** in the scenario builder (*Conditions*) and the scenario code: an optional sixth part with tokens such as `T2215.N.CE.CS` (codes without it stay valid):
  - **Start time** in local airport time (`T2215`; Stuttgart: Europe/Berlin).
  - **Night flying restrictions** (`N`, Stuttgart: no jet departures 23:00-06:00, no landings 23:30-06:00, delayed landings until 24:00): traffic plans around the curfew (morning wave from 06:00, delayed arrivals only), messages before and at each boundary, jets still on the ground at 23:00 are postponed to the morning or ask to taxi back to the stand (-10 if they were ready in time), crews refuse take-off in the curfew; local time in the toolbar.
  - **Closed taxiways** (`CE`, `CS` ...): red and hatched on the scope, in the ATIS, the briefing and a NOTAM message; routes and AI avoid them, their holding points and exits are closed, crews answer `unable, taxiway S closed`; the builder (and the Connect dialog) refuse closures that cut stands off.
- **Thunderstorm** scheduled event (`S`): 5 minutes warning (gusts, 8 NM arrival spacing, half the arrivals), 15 minutes overhead (tailwind gust front, no pushbacks or take-offs - lightning and windshear -, go-arounds at 1 NM with more than 10 kt tailwind or in windshear, no penalty), then the wind settles from the new direction.
- Presets *Night shift*, *Construction works* and *Thunderstorm*.
- Gusts in the wind (toolbar `070/18G32KT`, ATIS editor, ATIS text, clearances `gusting 32 knots`).

- Stuttgart reference data (research with sources and confidence) in the airport page; values adopted from it are listed below.
- COORD: Ground can ask every departure for the **earliest intersection** it accepts - shown as `INT D` in the tag and the `INT` column of the departure list.
- Tower can ask departures `advise able for departure from intersection B` (*Able intersection?* in the Tower menu), like Ground.
- **Coordination** (`COORD` in the toolbar): ask Approach for no more arrivals or Ground (when run by the simulator) to hold all departures, to make room - 2 points per minute each while it is on.
- Tower can give taxi instructions to vacated arrivals (*Taxi to stand*, `TAXI` in the quick-action bar), not only to departures.
- The take-off menu updates its hint (runway occupied, spacing countdown, next arrival) live while it is open.
- Reloading or closing the page asks first: end the session with DISCONNECT, the debriefing is not saved.
- **ROGER**: `roger` (sidebar button, quick-action bar) acknowledges a call without a read-back - the aircraft stops flashing and the pilot waits 4 minutes before calling again (2 minutes after `standby`, which also stops the flashing now).
- **Request hand-off** for aircraft still with a simulator-run position (aircraft menu, `REQ H/O`): a departure taxiing on Ground, an arrival on final with Approach, a vacated arrival with Tower, a cleared departure with Delivery.
- Tower: *Taxi to* another holding point for departures still taxiing (e.g. to the intersection B); *Contact Radar* for every aircraft in the air, also after a go-around (it was missing in the quick-action bar).
- Arrivals appear 12 NM out on Approach frequency and are handed to Tower at 8-10 NM; departures stay on the scope until 10 NM (about the size of the Stuttgart control zone).
- More natural movement: every crew taxis at its own pace (±15 %, drifting a little), brakes differently after landing (1.2-2.0 m/s²) and now and then rolls on to the next exit.

### Changed

- Mobile quick-action bar: one-time instructions disappear once given (`RB OK` after the readback is confirmed, *continue approach* and the take-off clearance on Tower, `HOLD` while holding); `CONT` (continue taxi) only while the aircraft waits for it.

- The red flashing CATC alert on the ground comes only when **both** aircraft are rolling towards each other; an aircraft standing still (holding, waiting, stopped) no longer makes the other one flash. A pair that stops briefly and rolls on is not announced again within 60 s. The route preview still warns about standing traffic.

- Runway 07 taxi flows as in the VATSIM Germany SOP: N westbound (arrivals to the aprons), S eastbound (N is always used against the runway direction).
- SIDs with the real first fixes and letters (KRH, ETASA, SUL, ROTWE; B = runway 25, H = runway 07), e.g. `ETASA4B` (numbers approximate).
- IFR clearances in the German form: `cleared to Frankfurt, ETASA4B departure, flight planned route, climb via SID to altitude 5000 feet, squawk 2312` (the short form is still understood).
- Approach hands arrivals to Tower at 8-10 NM (they appear at 12 NM); the session wind is westerly 60 % of the time (Stuttgart's long-term average).
- The AI Ground hands departures to Tower earlier and not always at the same spot: 700-1400 m before the holding point (each flight differently); far out the crew calls `taxiing to holding point A`.
- A requested hand-off takes 4-10 s of coordination before the crew changes frequency.
- **Pilot voices (TTS) and speech recognition (MIC) are switched off** for now (hidden; the code stays).
- Without a landing clearance an arrival asks again at one mile (`one mile final, request landing clearance`) and goes around only just before the threshold (0.15 NM) instead of at 0.5 NM.
- The AI Ground hands a departure to Tower early only once it is on one of the last two taxiways of its route (runway 07 via M, L2, K: from L2 on, no longer already on M).
- MIC works like a push-to-talk key on touch screens: hold it while you speak, or tap to start and tap again to stop.

### Fixed

- The ATIS always said `transition level 70`; it now follows the QNH (transition altitude 5000 ft: FL60 from 1013 hPa, FL70 below).

- Landing aircraft crept along the exit at 10 kt and stayed in the protected runway area for up to a minute, so the next arrival sometimes went around: they now keep their exit speed until they are behind the holding point. More arrivals and departures per hour as a result (benchmark 14.0 / 7.2, Tower benchmark 11.2 / 10.5).
- Two departures from K and Y (the same runway point at the 07 end) cleared at the same moment lined up nose to nose and blocked the runway for good; an aircraft lining up onto a point nearby now blocks the line-up.
- A departure at the holding point whose take-off was refused (thunderstorm) never called again; it now reminds Tower after 150 s. Reminders on the way to the holding point say `taxiing to holding point A` instead of `holding point , ready for departure`.

- A rejected take-off (also on `stop immediately`) brakes at once down to taxi speed and takes the next exit, instead of rolling on at the speed it had.
- Touch screens: sub-menus no longer open on top of their menu where the same tap selected an entry of both (e.g. *Able intersection* and *Intersection B*); they open on a tap, beside the menu or below the row, and a tap right after a menu opened is ignored. Menus are never wider than the screen.

- Tower: a departure from an intersection (e.g. B) no longer counts the runway as occupied by an aircraft lined up behind it at the full-length entry (A): it may line up and take off first. The full-length departure still waits while the intersection departure is on the runway in front of it.

- A departure cleared for take-off on its runway did not take off after the ATIS had changed the runway in use: it now takes off from the runway in its clearance.
- Arrivals already talking to Tower went back to Approach when the runway in use changed.
- A new departure could appear on a drive-through stand that another departure was still taxiing out of (collision).
- Speech recognition on the iPad: Safari ended the recognition at the first short pause and dropped the last phrase when stopped. It is now restarted until you release MIC, everything heard is kept, and the last unfinished phrase is used too.
- iPad / iPhone: pilot voices (TTS) still silent. The unlock now runs on a real tap (click / end of touch - Safari ignores touchstart), switching TTS on speaks a confirmation, only voices installed on the device are used (no effect voices), stuck speech queues are cleared, utterances are kept until they have been spoken, and the speech engine is reset after the microphone. New *Test* button in the settings.

## [0.8.0] - 2026-10-10

Combined positions with Tower, pilots who resolve simple conflicts, and a debriefing after each session.

### Added

- **Debriefing** (0.8): DISCONNECT opens a debriefing of the session - what earned and what cost points, answer times and the longest waits, incidents and warnings, and advice for the next session - with *Continue session* or *End session*.
- **Combined positions with Tower** (0.8): staff Ground + Tower, Delivery + Tower or all three. Aircraft change frequency as on split positions; after `contact ground` a vacated arrival calls you on Ground for its taxi.
- **Extended runway centrelines** on the scope (as on a EuroScope map): 15 NM from each threshold with NM ticks, the runway in use brighter; marked `LOC U/S` with the localizer off.
- **Tower speed control** on final: `maintain 160 knots until 4 miles`, `reduce speed to 150 knots`, `reduce to final approach speed`; and **immediate take-off**: `cleared for immediate take-off` / `cleared for take-off, no delay`. Both in the Tower menu.
- **All stations** broadcasts: `all stations, information B is now current`, `... runway 25 in use`, `... standby` (holds every open request), `... expect delays` - no read-back. ALL STN in the sidebar (a menu; in mobile mode phrase buttons in the quick-action bar).
- `report position` / `say position` to a follow-me (`On taxiway N, leading DCEEO`) or an aircraft on the ground.
- **Acknowledge CATC alerts**: *Acknowledge CATC alert* in the aircraft menu (`ACK` in the quick-action bar) stops the red flashing of a head-on alert you have checked; a new conflict of the same aircraft alerts again.
- Tower phraseology `continue approach, expect late landing clearance` (also in the Tower menu).
- **Sidebar** next to the message window: a large SEND button on top, MIC, STANDBY and ALL STN.
- **Switch your frequencies off and on**: click a frequency in the toolbar (e.g. `EDDS_DEL 121.915`) to hand that position to the simulator - pilots waiting on it are answered by the AI - and click again to take it back. At least one frequency stays on. New AI Delivery for crews still waiting for their clearance.

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
