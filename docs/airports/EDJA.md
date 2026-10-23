# EDJA - Memmingen

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDJA / FMM (Allgäu Airport)                                                 |
| Location           | Memmingerberg, Bavaria, Germany                                             |
| Reference point    | 47°59'19.76"N 010°14'22.14"E (AIP AD 2.2)                                  |
| Elevation          | 2079 ft (AIP); thresholds 06: 2079 ft, 24: 2053 ft                          |
| Magnetic variation | 4.1° E (World Magnetic Model, 2026; AIP: 3.2° E, 2025.01)                   |
| Transition altitude | 5000 ft; initial climb of the SIDs FL70                                    |
| Runway             | **06/24**, 45 m wide, true heading 059° / 239°. 2630 m (AIP AD 2.12; 2629 m between the OSM runway ends); the threshold 24 is displaced by 229 m, runway 06 starts at the threshold (the area west of W is a stopway) |
| Data files         | [`src/data/airports/edja.ts`](../../src/data/airports/edja.ts), layout [`edja.layout.ts`](../../src/data/airports/edja.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `edja.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiway R, the western part of P, P4, Apron 4, the pad south of P near E, all closed parts (crosses) | Digitised by hand from the AIP aerodrome chart (AD 2 EDJA 2-5, used as a reference only; no chart content is included). Approximate: the chart was aligned to the OSM runway ends, positions are good to a few tens of metres |
| Runway, taxiways, holding positions, stands, aprons, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs` (see [airport data](../airport-data.md#importing-from-openstreetmap)); the derived layout is available under the ODbL |
| Reference point, elevations, thresholds, declared distances (TORA from every entry), approaches (ILS CAT I or LOC both ways, RNP, NDB), taxiway widths (AD 2.8: R 23 m, N / W 18 m, C / D / E / P 12 m, P4 11 m) | DFS AIP Germany AD 2 EDJA (AIRAC 2026OCT01), used as a reference only: facts read by hand. S and the GA lanes have no published width (12 m / 11 m in the simulator) |
| Frequencies, SIDs, taxiway restrictions, backtracks, stand use, de-icing on stands | VATSIM Germany Memmingen SOP (facts only; a simulation resource, not an official source); frequencies checked against the VATSIM Germany station data and vATIS profile (2026-10-21), SID designators against a public chart index |
| Direction of the exit fixes (for the SID choice), magnetic variation | public waypoint lists and the VATSIM Germany letters of agreement (UMTEX is the transfer point to Switzerland); NOAA World Magnetic Model (October 2026) |
| Checked against | AIP Germany AD 2 EDJA 2-5 (aerodrome chart) and 2-7 (ground movement chart), used only as a reference: runway length, stand designators P11 / P12, the position of holding point W (before the turn towards the runway), the taxiway topology and the closed parts. The OSM intersections match the chart's take-off distances within a few metres: N 1057 m from the 06 end (chart: 2630 - 1570 = 1060 m), C 878 m (880 m), D 1055 m (1060 m), E 627 m from the 24 end (625 m), threshold 24 displaced by 227 m (229 m). No chart content is included |

Accuracy: the OSM parts as good as the OSM mapping (usually a few metres), the hand-digitised parts a few tens of metres. Holding point names are the taxiway names (OSM has no references for them).

**Simplified or not modelled:**

- all taxiways of the chart are modelled. The south side (P, P4, C, D, E and the unnamed GA lanes) is for small aircraft: the chart limits P to an outer main gear wheel span of 6 m, the simulator uses a 24 m wingspan limit on all of them. The airline traffic therefore never uses them; there are no GA stands on Apron 3 / 4 (the chart shows none),
- the unnamed lane to Apron 2 is named N in the simulator,
- taxiway S is named after OpenStreetMap; the AIP charts leave this closed link unnamed,
- holding points of the south taxiways: C, D and E. C and D fork into two fillets onto P behind their holding point (both ways are used); E's second fillet is not used. P4's intermediate holding position is not modelled,
- the 200 m stopway beyond the runway 06 end is drawn as a paved area (not usable by the simulation); the turn loops around both runway ends are closed (crosses) and drawn as closed taxiways,
- holding point W lies before the turn towards the runway (marked on the chart with a red circle and the note "holding points located before turn towards the RWY"): mentioned in the briefing, not drawn,
- stands from OSM, named after the AIP chart: P11 and P12 at the terminal (Apron 1, OSM refs 1 and 2) with pushback, 3-6 on Apron 2 as taxi-in / taxi-out positions (the SOP has a pushback on 6; in the OSM layout its lane ends at the stand),
- no Delivery: Memmingen Ground gives the IFR clearances (the Delivery position is not offered),
- SIDs: KPT, LUPOL and UMTEX (A = runway 24, B = runway 06; the numbers change with the AIRAC cycle), each flight planned via the fix towards its destination: **KPT** (Kempten) 075-200° - Italy, the Balkans, Greece, Turkey, Romania, Bulgaria, Georgia; **UMTEX** (towards Switzerland) 200-280° - Spain, Portugal, France, Morocco, the Canaries; **LUPOL** 280-075° - UK, Ireland, Benelux, Germany north, Scandinavia, Poland. All contact München Radar 129.450 after take-off. The conventional ALG SIDs (non-RNAV aircraft, training) are not modelled,
- traffic: Ryanair, Wizz Air and a few others with estimated shares, about a third of Stuttgart's movements per density step (`rateFactor` 0.35),
- the de-icing station (Memmingen De-icing 121.930, de-icing on the stands) is not a simulator position,
- low visibility procedures (ILS CAT I only), helicopters, VFR traffic.

**Never use this simulator for real-world navigation.**

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Ground (also clearances) | Memmingen Ground | 121.680 |
| Tower | Memmingen Tower | 126.855 |
| Approach | Muenchen Radar (sector Iller) | 129.450 |
| ATIS | Memmingen Information | 118.855 |

## Layout and procedures

| Taxiway / point | Description |
| --------------- | ----------- |
| **W** | From the west end of Apron 2 to the runway 06 end (holding point W, before the turn towards the runway; the simulator follows the turn). Full-length entry for 06, last exit for landings on 24 |
| **N** | Along the aprons and down to the middle of the runway (holding point N, about 1060 m from the 06 end; take-off run 06 from N 1570 m) |
| **R** | From the N / Apron 2 junction straight to the runway, about 475 m from the 06 end (ground movement chart; take-off run 06 from R 2175 m). Used on pilot request (SOP): an intersection for runway 06 departures and an exit for runway 24 landings between N and W |
| **P** | Parallel taxiway on the south side, from a cross west of P4 (next to the glide path antenna 06) to E; small aircraft only. West of the cross and east of E it is closed |
| **P4** | From P to Apron 4 (south-west, GA); small aircraft only |
| **C, D, E** | From P to the runway (holding points C, D, E; take-off run 06 from C 1750 m, from D 1570 m; 24 from E 2005 m, D 1065 m, C 885 m); small aircraft only. Apron 3 (GA parking) lies between C and D |
| **S** (closed) | From N (near Apron 1) to the runway, closed (crosses). Crews refuse it: `unable, taxiway S closed` |
| Closed loops | Around both runway ends, the stub at the threshold 06, P west of P4 and east of E with two links to the runway near the 24 end, and two branches from P to Apron 4 - drawn with crosses, never used |
| Stands P11, P12 | Apron 1 at the terminal, pushback onto N |
| Stands 3-6 | Apron 2, taxi in, turn on the stand and taxi out |

**Backtracking** (the reason Memmingen is in the simulator):

- **Departures 24** taxi to N and need the full length: the crew calls `holding point N, ready for departure, request backtrack`. Clear them with `backtrack runway 24, line up and wait` (or `backtrack runway 24, cleared for take-off`): the aircraft enters at N, taxis along the runway to its end, turns on the runway (the turn loops at the runway ends are closed) and lines up. A take-off clearance without the backtrack gets `unable, we require a backtrack for departure, 1070 metres available from N` (AIP AD 2.13).
- **Departures 06** line up at W (full length), R (intersection, 2175 m) or N (intersection, 1570 m - enough for few airliners).
- **Landings 06** usually roll past N: they slow down, turn around on the runway and backtrack to N (`backtrack, vacate via N` - they do it on their own when N cannot be made).
- **Landings 24** vacate via N if they can make it, otherwise via R or at the end via W.
- While an aircraft backtracks, the runway is occupied for minutes. Approach spaces arrivals at least 10 NM apart when landing aircraft backtrack (runway 06) and 8 NM when departures do (runway 24).
- N is the main taxiway between the aprons and the runway: departures and arrivals meet head-on on it. The AI Ground keeps a departure on its stand while an arrival comes the other way (taxiing in, or about to land and vacate via N). As Ground, do the same.

## Traffic

Memmingen is a base of Ryanair and Wizz Air (point-to-point leisure and ethnic traffic). The simulator uses Ryanair (60 %, B737-800 / MAX), Wizz Air (30 %, A320 / A321neo), SunExpress (5 %) and business jets (5 %); destinations from their Memmingen route networks. Shares are estimates.
