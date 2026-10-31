[Documentation](README.md) › Roadmap

# Roadmap

The long-term goal is a simulator that feels as close as possible to controlling on VATSIM with EuroScope: several positions, many airports, realistic pilots, and eventually shared sessions with other controllers.

Status legend: **done**, *in progress*, planned.

## Road to 1.0

**Version 1.0.0 was released on 2026-10-13** ([release report](release-1.0-report.md)). The text below is the agreement it was released under.

Version 1.0 is the first full version. It is released only when we agree on it: when the criteria below are met, Claude proposes the release - it is never done automatically. (Criteria agreed on 2026-10-08.)

**Criteria for 1.0**

1. **Stuttgart complete**: Delivery, Ground and Tower playable at EDDS - each on its own and as **combined positions** - with realistic procedures, phraseology and AI for the positions you don't staff.
2. **No dead ends**: AI pilots solve simple conflicts themselves the way real pilots would (stop, give way, ask); remaining deadlocks always have a clear way out; no collisions in the soak test.
3. **Training**: a tutorial for each position, scenario presets for typical training topics, a debriefing after a session (what went well, what cost points).
4. **Quality**: soak test clean, performance budget met on an iPad, documentation complete, benchmark statistics for the release in [benchmarks.md](benchmarks.md).

Further airports follow in the 1.x releases (the airport data format, the data checks and per-airport traffic are ready for them since 0.5).

**Combined positions** means one controller staffing several positions at the same time, for example Ground and Tower together, working both frequencies (or one frequency for both). This is realistic: at real airports positions are combined ("zusammengelegt") in quiet periods, for example at night or early in the morning, and split again when traffic grows. On VATSIM it is the normal case ("top-down": a Tower controller also covers Ground and Delivery while those are not staffed). The simulator's station model supports it since 0.5; the positions themselves come with 0.6-0.8.

**Path**

| Version | Focus |
| ------- | ----- |
| **0.5** | **done** - Foundations: role-based station model (combined positions possible), per-airport traffic with the real Stuttgart operator mix, airport data checks, soak test in CI |
| **0.6** | **done** - **Delivery** at EDDS: IFR clearances, squawks, start-up, CTOT, A-CDM, DCL; combined positions in the login; systems window (A-SMGCS, A-CDM, DCL); head-on conflict resolution; AI Ground |
| **0.7** | **done** - **Tower** at EDDS: line-up / take-off / landing clearances, runway crossings, arrival sequence |
| **0.8** | **done** - Combined positions with Tower, AI pilots that resolve simple conflicts (opposite traffic, lane priority), debriefing |
| 0.9 | **done** - Scenario conditions (night flying restrictions, closed taxiways, thunderstorm), tutorials, traffic sliders, polish; final review in the [release report](release-1.0-report.md) |
| **1.0** | **released 2026-10-13** - the first full version, see the [release report](release-1.0-report.md) |
| 1.x | Further airports - 1.1 de-icing, Nuremberg, Memmingen, Sylt and runway backtracking; 1.1.1 Memmingen after the aerodrome chart, rounded taxiway drawing; 1.2 real-world data overhaul (SIDs by destination, Stuttgart TORA, de-icing pads, stands) and the PHX scope style of VATSIM Germany; 1.2.1 complete Sylt and Nuremberg layouts, buildings from OpenStreetMap at every airport, all airports checked against the AIP (approaches per runway, declared distances, widths); 1.3 airport menu in the Connect dialog (continent, country and FIR, airport); 1.4 parallel runways, Leipzig/Halle, Cologne/Bonn, Bremen, METAR and ATIS, hold short and rapid exits as on the charts |

Major releases (1.0, 2.0, ...) come with a statistics section in [benchmarks.md](benchmarks.md) that compares them with the previous major release.

## Road to 2.0

Version 2.0 is the next major version: from a tower simulator with many airports to an **airport and terminal area simulator**. Like 1.0 it is released only when we agree on it: when the criteria below are met, Claude proposes the release. (Criteria agreed on 2026-10-23; the versions on the way there are not fixed.)

**Criteria for 2.0**

1. **Approach / Departure playable**: a radar position (Approach, Departure or both combined) at least at Stuttgart - vectoring, altitude and speed instructions, ILS / RNP clearances, sequencing onto final with the real spacing, hand-offs to and from Tower and Center - with an AI for it when it is not staffed (as today). Top-down: one controller can work everything from Delivery to Approach.
2. **Large airports under heavy traffic**: Cologne/Bonn and Leipzig/Halle (parallel runways, cargo hubs) hold up under heavy traffic - no deadlocks, AI positions that keep the flow going.
3. **The world map comes alive**: at least one airport on each continent of the airport menu (from the *Coming soon* list), each with the regional phraseology where it differs (FAA vs ICAO: "line up and wait", "taxi via", altitudes and runway designators). *(Done in 1.5: North America - San Diego KSAN with FAA phraseology, US METAR and ATIS; Asia - Phuket VTSP; Australia / Oceania - Wellington NZWN; South America - Quito SEQM: every continent has an airport.)*
4. **Weather and visibility**: the surface wind changes with the METAR during a session *(done in 1.5)*; **low visibility procedures** (CAT II/III holding points, larger spacing, LVP in the ATIS) at every airport that publishes them.
5. **Voice works on the iPad**: speech recognition and text-to-speech tested on the iPad and on by default, with the voice phraseology of every position.
6. **No dead ends at any airport**: the soak test runs at every airport and every runway direction - no collisions, every deadlock has a way out, no aircraft stuck for good. *(Done in 1.5: `npm run soak` covers every airport, runway direction and staffing; kept green for new airports.)*
7. **Quality**: every airport passes the chart checks of the recipe (nothing ends in nothing, every apron, no invented designators); the performance budget is met on an iPad with heavy traffic at the largest airport; documentation and in-app help complete; benchmark statistics comparing 2.0 with 1.0 in [benchmarks.md](benchmarks.md).

**Not part of 2.0**: Frankfurt and multiplayer (both [3.0](#road-to-30)), a Center position, configurable tag profiles. Pilots who make mistakes (wrong turn, missed hold short) and stand allocation by airline and terminal stay on the wish list and may be proposed again later.

## Road to 3.0

Version 3.0 turns the simulator into **shared sessions**: several human controllers at one airport, like an evening on VATSIM, with **Frankfurt** as the big hub to staff together. The criteria are a proposal (2026-10-23) until the project owner agrees; like every major version, 3.0 is released only when we agree on it, and the versions on the way there are not fixed. It builds on 2.0 (Approach / Departure, the large airports, the world map).

**Criteria for 3.0**

1. **Multiplayer**: a session runs on a server, several human controllers staff different positions of the same airport (Delivery, Ground, Tower, Approach, Apron at Frankfurt) and see the same traffic in real time. Joining by a session link or code, late join and reconnect after a lost connection; positions without a human are run by the AI, which hands over when a controller joins or leaves.
2. **Coordination between controllers**: hand-offs to a human controller (the pilot changes to that frequency and calls in), ownership of each aircraft visible to everyone (lists, tags), coordination messages (release, runway crossing, runway change), text chat; a shared ATIS. Voice between controllers (push-to-talk) is optional.
3. **Frankfurt (EDDF)** built after the airport recipe and its chart checks: runways 07C/25C and 07R/25L, the Northwest runway 07L/25R (landings only), runway 18 (departures only), the taxiway system with the bridges and all aprons; the **Apron** positions (Frankfurt's apron control) as a position of their own; runway configurations and traffic of a real Frankfurt day.
4. **Performance**: the server runs heavy Frankfurt traffic with all positions staffed; clients stay smooth on an iPad; a short lag (up to about 300 ms) does not change what a controller sees or the outcome.
5. **Robust sessions**: the server is the only authority (one deterministic simulation, clients send transmissions); a session survives a client dropping out; a session can be saved and replayed for the debriefing of all controllers.
6. **Quality**: a multiplayer soak test (bots as controllers on every position) with no collisions and no deadlocks; documentation and in-app help for hosting and joining; benchmark statistics comparing 3.0 with 2.0 in [benchmarks.md](benchmarks.md).

**Requirements**

| Area | Requirement |
| ---- | ----------- |
| Server | `Simulation` runs unchanged in Node.js (the core is DOM-free and seeded, see [architecture](architecture.md#multiplayer-vatsim-like-shared-sessions)); one process per session; ticks at a fixed rate |
| Protocol | WebSocket; clients send controller transmissions (plain text) and UI actions (hand-off, ownership); the server sends state snapshots and deltas, radio messages, events |
| Positions | Each client staffs one or more positions (combined positions as today); `isOnMyFrequency` per client; the AI runs every unstaffed position |
| Hand-offs | Between human positions: the receiving controller sees the aircraft announced, the pilot calls in on the new frequency; between human and AI as today |
| Visibility | Tag and list colours show who owns an aircraft (own, other controller, AI); each controller keeps their own scope view, zoom and style |
| Communication | Text chat between controllers, coordination messages from the aircraft menu; optional voice between controllers |
| Frankfurt | Airport data after the recipe (OpenStreetMap layout, AIP facts by hand, VATSIM Germany procedures), Apron position, Frankfurt traffic mix; checked against the charts from the start |
| Hosting | The game stays playable alone without a server (GitHub Pages); a server is needed only for shared sessions. Where it runs (self-hosted, a small cloud service, one player as host) is open |
| Privacy | No accounts required: a callsign per controller; the server stores no personal data beyond a running session |
| Scoring | A score per controller and one for the team; a shared debriefing |
| Tests | Unit tests for the protocol, a multiplayer soak test with bots, reconnect and late-join tests |

**Open questions** (to decide before the work starts): hosting and cost of the server; one player as host versus a dedicated server; whether voice between controllers is needed for 3.0.

## v0.9 - Scenario conditions, tutorials, beta

- **done** - Scenario options: start time (local), Stuttgart's night flying restrictions, closed taxiways (construction works), thunderstorm event (gusts, tailwind gust front, windshear go-arounds, departure and pushback stop); extended scenario code with an optional options part
- **done** - Tutorials for each position (Delivery, Ground, Tower): guided lessons with a fixed traffic situation, step panel with *Show me*, live traffic afterwards; tested by playing every lesson
- **done** - Polish: five-step traffic sliders, CATC only for closing traffic, intersection line-ups, touch menus, quick-action bar, rejected take-off braking
- **done** - Final review for 1.0 ([release report](release-1.0-report.md)): diagnostic runs over all positions and conditions, six fixes (exit speed, K/Y line-up, departure re-call, transition level, rejected take-off, touch menus)
- **done** - 1.0.0 released on 2026-10-13 (decision of the project owner); the iPad performance check continues in play

## v0.8 - Combined positions, pilots, debriefing

- **done** - Combined positions with Tower: Ground + Tower, Delivery + Tower or all three, with the frequency changes of split positions
- **done** - Pilots resolve simple conflicts: crews who see opposite traffic stop short of the junction between them and ask; lane priority at intersections and connectors
- **done** - Debriefing after a session (DISCONNECT): what earned and what cost points, answer times, incidents, advice
- **done** - Tower extras: extended centrelines, speed control, immediate take-off, expect late landing clearance, early hand-off from Ground; all-stations broadcasts, CATC acknowledge, sidebar

## v0.7 - Tower

- **done** - Tower position at EDDS (on its own): line up and wait (also behind landing traffic), take-off and landing clearances with wind, continue approach, go around, cancel take-off, vacate via, hand-offs to Radar and Ground
- **done** - Pilot calls on Tower frequency; go-around without landing clearance; separation check of departures; RMCA warnings for clearances onto an occupied runway
- **done** - Runway crossings through Tower when Ground is run by the AI; arrival sequence in the arrivals list; Tower menu, quick-action bar, briefing and help
- **done** - AI Ground resolves circles of aircraft blocking each other (cancels a pushback in the circle)

## v0.6 - Delivery and systems

- **done** - Delivery position at EDDS: IFR clearances with readback checks (wrong squawks to catch), squawk allocation, start-up, CTOTs with their -5/+10 minute window, datalink clearances (DCL)
- **done** - A-CDM pre-departure sequencer: TOBT, TSAT, start-up and pushback calls at the TSAT
- **done** - Combined positions in the Connect dialog (Delivery + Ground); AI Ground when only Delivery is staffed
- **done** - Systems window: A-SMGCS (surveillance, RMCA, CATC, routing), A-CDM, DCL - status and on/off
- **done** - Head-on conflicts: CATC warning before transmitting, *Resolve conflict* menu (turn off via a junction, or a tug taking 5-10 minutes)
- **done** (0.6.1) - Ground vehicles: tugs on the scope, tow requests, follow-me on request; vehicle tracking and ILS in the systems window; calmer session start

## v0.5 - Foundations

- **done** - Real traffic mix for Stuttgart (airline shares, fleets, busiest destinations) as airport data (`traffic`)
- **done** - Station roles (`delivery` / `ground` / `tower`) and staffed stations instead of fixed station types; combined positions possible in the core
- **done** - Airport data checks for every airport (`validateAirport`, run by the tests)
- **done** - Soak test (20 h of traffic) in CI; release benchmark
- **done** - Stand suitability (wingtip clearance, real EDDS stand sizes, wide-body positions), taxiway wingspan limits
- **done** - Mobile mode optimised for the iPad, scenario builder, airport briefing (released with 0.5)

## v0.4 - Settings and mobile

- **done** - In-game settings menu (layout, sizes, voices, traffic, events)
- **done** - Mobile mode (optimised for the iPad): zoom buttons, tap-twice / long-press menus, quick-action bar, larger touch targets
- **done** - Intersection departures with "advise able" and per-type runway requirements
- **done** - No 180 degree turns for airliners, tug turnaround when stuck, tow-back after a cancelled pushback
- **done** - Crossing priority on the ground, AI Tower handling of stranded departures, vacate points clear of taxiway S
- **done** - Airport briefing (help window) and a clear button for the command line
- **done** - Scenario builder and shareable scenario codes (runway, traffic mix, heavies, scheduled events)
- planned - More mobile mode improvements: landscape layout, swipe-up command sheet, haptic feedback on requests

## v0.2 / v0.3 - Feedback rounds 1 and 2

- **done** - ATIS editor (runway in use, wind, QNH, letter) instead of choosing the runway at login; runway changes during the session
- **done** - Much better voice control: recognition alternatives, fuzzy callsigns, misrecognition fixes, last-caller fallback, TTS pauses while transmitting
- **done** - Extended phraseology: cancel/stop/continue pushback, conditional clearances, queue numbers, expected delays, incomplete taxi instructions (clearance limit)
- **done** - Special events: medical emergencies, rejected take-offs
- **done** - EuroScope-like clickable tag items, telephony display
- **done** - Realistic routing (no U-turns / hairpins), arrival turn-around bug fixed
- **done** - Researched tower separation model (departure/arrival/runway separation, departure gaps), see [tower-operations.md](tower-operations.md)
- **done** - Accurate EDDS layout digitised from the AIP aerodrome charts (v0.3), scope rotation, standard taxi flows

## v0.1 - Ground at EDDS

- **done** - Browser app, EuroScope-style ground radar, departure and arrival lists, message window, command line
- **done** - EDDS layout (approximate), real runway and frequencies
- **done** - ICAO phraseology parser (typed and spoken), live route preview
- **done** - AI pilots: requests, read-backs, reminders, see-and-avoid, deadlock reports
- **done** - AI Tower: departures, arrivals, exits, go-arounds, incursion detection
- **done** - Text-to-speech and speech recognition
- **done** - Score and incident statistics
- **done** - CI and GitHub Pages deployment

## 1.x - after 1.0

Wishes collected for the 1.x releases (from the [release report](release-1.0-report.md#after-10) and earlier sessions), roughly in order:

- **done** (1.1) - **Nuremberg (EDDN), Memmingen (EDJA) and Sylt (EDXW)** from OpenStreetMap with an importer (`scripts/osm-import.mjs`), procedures after the VATSIM Germany SOPs; Tower-only airports (Sylt)
- **done** (1.1) - **Runway backtracking** for departures and arrivals (Memmingen)
- **done** (1.1) - **EDDS holding bays P1/P2** (bypass at the 25 end) and **de-icing pads DP1-DP4** with de-icing as a scenario condition (winter operations); since 1.2 at their real positions (P1/P2 from OSM, DP1-DP4 after the VATSIM Germany ground radar data) with their wingspan limits
- **done** (1.2) - **Real-world data overhaul** of all four airports: SIDs with the real designators planned towards the destination, published take-off run available from every Stuttgart entry (25: 3045 m), Stuttgart stand sizes and wide-body positions, Apron South after AIRAC 2512, crossings only between K and Y, radar frequency per SID, magnetic variation 2026
- **done** (1.2) - **EuroScope look of VATSIM Germany** (PHX night / day: the DFS PHOENIX tower display): colours, radar returns with SSR symbol and history dots, departure / arrival tag colours, PHX ground states, VATSIM Germany tag and list layout with clickable list cells
- **done** (1.2.1) - **Complete layouts**: every taxiway of the Sylt aerodrome chart (light-aircraft taxiways with their limits, closed parts drawn), the Nuremberg GA lanes and aprons, all buildings on every aerodrome from OpenStreetMap (also Stuttgart), paved areas inside runway strips drawn but not routed
- **done** (1.2.1) - **AIP check of all four airports**: published approaches per runway (Sylt 14 RNP only), declared distances from every entry, taxiway widths and code letter limits, thresholds and elevations
- **done** (1.3) - **Airport menu** in the Connect dialog: continent, country with its FIR (Germany: Bremen, Langen, München), airport with runways and traffic level, ready for airports on other continents
- planned - **Low visibility procedures (LVP)** with the CAT II/III holding points and larger spacing (values from the AIP, supplied as text)
- planned - **Voice**: test text-to-speech and speech recognition again on the iPad and switch them back on
- planned - Smarter AI Tower after a rejected take-off; partial taxiway closures; a taxiway blocked during the session (special event)
- **done** (1.4) - **Cologne/Bonn (EDDK)** with its cargo hub (UPS, FedEx, DHL; cargo airlines park on the cargo aprons) and the parallel guide lines of Terminal 2, and **Bremen (EDDW)**, both after the airport recipe (sources first, the charts as tests)
- **done** (1.4) - **Parallel runways in use at the same time** (mixed mode, dependent / staggered / independent approaches, runway per apron and size, AI Tower per runway, ATIS) and **Leipzig/Halle (EDDP)** with the DHL hub
- planned (1.6) - **Airports with two runways in parallel operation** - independent, dependent or segregated. First step **done** (1.5.2): the ATIS sets the runway use (mixed, segregated, semi-mixed) and the approach mode, and the simulation follows it; next: airports that use it
- planned - Further airports (the single-runway airports on the other continents listed as *Coming soon*) and the Approach / Departure position - see [Road to 2.0](#road-to-20); Frankfurt comes with [3.0](#road-to-30)

## Next steps

### Gameplay and realism

- planned - EDDS details: GA apron and GAT exits, Apron South stands 300-303 and the new 105-107, S closed next to a de-icing pad in use (A-stands 9A, 24A, 26A, 28A, de-icing pads and P1/P2: done, see 1.x above)
- planned - Real `follow` behaviour (follow-the-leader)
- planned - Stand allocation per airline and terminal (Schengen / non-Schengen), contact/remote stands
- planned - More special events (bird strike, a taxiway blocked during the session - closed taxiways for a whole session are done since 0.9; follow-me and tows are done since 0.6.1), de-icing, engine-start delays, pilots who make mistakes (wrong turn, missed hold short; squawk read-back errors are done since 0.6)
- planned - Low visibility procedures (CAT II/III holding points, larger spacing)
- **done** - Weather that changes during the session: half-hourly METAR, drifting QNH and thunderstorm SPECIs (1.4); the surface wind changes with every METAR, with a runway change hint on tailwind (1.5)
- planned - Scenario files (fixed traffic for training); more tutorial lessons (combined positions, conflicts, runway change)

### Positions

- planned - **Approach / Departure**: radar scope, vectoring, altitude and speed instructions, ILS clearances, handoffs
- planned - **Radar / Center**: en-route sector, coordination, handoffs between sectors

### Airports

- **done** (1.1) - EDDN Nuremberg, EDJA Memmingen, EDXW Sylt
- **done** (1.4) - EDDK Cologne/Bonn, EDDW Bremen, EDDP Leipzig/Halle
- planned - EDDF Frankfurt ([3.0](#road-to-30))
- planned - EGLL London Heathrow
- planned - KLAX Los Angeles
- **done** - KSAN San Diego, the first US airport (1.5)
- **done** - VTSP Phuket, the first airport in Asia (1.5)
- **done** - NZWN Wellington, the first airport in Australia / Oceania (1.5)
- **done** - SEQM Quito, the first airport in South America (1.5)
- **done** - TNCM St. Maarten (1.5)
- **done** - SLLP La Paz (1.5)
- **done** - EGKK London Gatwick, the busiest single runway (1.5)
- **done** - EDDM München, two parallel runways with independent approaches (1.6)
- planned - Per-airport traffic mix (operators, destinations, fleet); regional phraseology differences: FAA **done** (San Diego, 1.5), others with their airports

### Client

- planned - EuroScope-like configurable tag items and colour profiles
- planned - Scope rotation (runway horizontal), saved views
- planned - Flight strip / flight plan window, ATIS editor
- planned - Sound effects (radio clicks, frequency congestion)
- planned - Mobile and tablet layout improvements

### Multiplayer

Planned for [3.0](#road-to-30).

- planned - Run the simulation on a server; multiple human controllers on different positions of the same airport
- planned - Hand-offs and coordination between human controllers, text and voice channels
