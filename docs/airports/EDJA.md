# EDJA - Memmingen

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDJA / FMM (Allgäu Airport)                                                 |
| Location           | Memmingerberg, Bavaria, Germany                                             |
| Reference point    | 47°59'17"N 010°14'18"E (OurAirports)                                        |
| Elevation          | 2077 ft                                                                     |
| Magnetic variation | 3.9° E (simulation value)                                                   |
| Transition altitude | 5000 ft; initial climb of the SIDs FL70                                    |
| Runway             | **06/24**, 45 m wide, true heading 059° / 239°. In the simulator 2620 m between the runway ends (OSM geometry; published 2943 m including the paved areas beyond); the threshold 24 is displaced by about 230 m, runway 06 starts at the threshold (the area west of W is a stopway) |
| Data files         | [`src/data/airports/edja.ts`](../../src/data/airports/edja.ts), layout [`edja.layout.ts`](../../src/data/airports/edja.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `edja.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Runway, taxiways, holding positions, stands, aprons, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs` (see [airport data](../airport-data.md#importing-from-openstreetmap)); the derived layout is available under the ODbL |
| Reference point, elevation | [OurAirports](https://ourairports.com/) (public domain) |
| Frequencies, SIDs, taxiway restrictions, backtracks, stand use, de-icing on stands | VATSIM Germany Memmingen SOP (facts only; a simulation resource, not an official source) |

Accuracy: as good as the OSM mapping (usually a few metres). Holding point names are the taxiway names (OSM has no references for them).

**Simplified or not modelled:**

- only the taxiways airliners may use: **W** (apron to the runway 06 end) and **N** (aprons to the middle of the runway), plus the unnamed lane to Apron 2 (named N in the simulator). The south side - taxiway P (outer main gear span up to 6 m only), C, D, E, the GA apron 3 and the former military areas - is left out; taxiway S is closed in reality and not modelled,
- stands 1-6 from OSM: 1 and 2 at the terminal (Apron 1) with pushback, 3-6 on Apron 2 as taxi-in / taxi-out positions (the SOP has a pushback on 6; in the OSM layout its lane ends at the stand),
- no Delivery: Memmingen Ground gives the IFR clearances (the Delivery position is not offered),
- SIDs: designators from the SOP (KPT, LUPOL, UMTEX; A = runway 24, B = runway 06), the numbers change with the AIRAC cycle,
- traffic: Ryanair, Wizz Air and a few others with estimated shares, about a third of Stuttgart's movements per density step (`rateFactor` 0.35),
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
| **W** | From the west end of Apron 2 to the runway 06 end (holding point W). Full-length entry for 06, last exit for landings on 24 |
| **N** | Along the aprons and down to the middle of the runway (holding point N, about 1000 m from the 06 end, 1600 m from the 24 end). The only way between the aprons and the runway for airliners besides W |
| Stands 1, 2 | Apron 1 at the terminal, pushback onto N |
| Stands 3-6 | Apron 2, taxi in, turn on the stand and taxi out |

**Backtracking** (the reason Memmingen is in the simulator):

- **Departures 24** taxi to N and need the full length: the crew calls `holding point N, ready for departure, request backtrack`. Clear them with `backtrack runway 24, line up and wait` (or `backtrack runway 24, cleared for take-off`): the aircraft enters at N, taxis along the runway to its end, turns on the runway (there are no turn pads) and lines up. A take-off clearance without the backtrack gets `unable, we require a backtrack for departure, 1009 metres available from N`.
- **Departures 06** line up at W (full length) or N (intersection, about 1600 m - enough for few airliners).
- **Landings 06** usually roll past N: they slow down, turn around on the runway and backtrack to N (`backtrack, vacate via N` - they do it on their own when N cannot be made).
- **Landings 24** vacate via N if they can make it, otherwise at the end via W.
- While an aircraft backtracks, the runway is occupied for minutes. Approach spaces arrivals at least 10 NM apart when landing aircraft backtrack (runway 06) and 8 NM when departures do (runway 24).
- N is a single taxiway between the aprons and the runway: departures and arrivals meet head-on on it. The AI Ground keeps a departure on its stand while an arrival comes the other way (taxiing in, or about to land and vacate via N). As Ground, do the same.

## Traffic

Memmingen is a base of Ryanair and Wizz Air (point-to-point leisure and ethnic traffic). The simulator uses Ryanair (60 %, B737-800 / MAX), Wizz Air (30 %, A320 / A321neo), SunExpress (5 %) and business jets (5 %); destinations from their Memmingen route networks. Shares are estimates.
