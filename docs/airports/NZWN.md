[Documentation](../README.md) › [Airports](README.md) › NZWN

# NZWN - Wellington

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | NZWN / WLG (Wellington International Airport)                               |
| Location           | Rongotai, Wellington, New Zealand (New Zealand FIR, NZZC)                   |
| Reference point    | 41°19'38"S 174°48'19"E (OurAirports)                                        |
| Elevation          | 41 ft                                                                       |
| Magnetic variation | about 23° E                                                                 |
| Transition altitude | 13000 ft (New Zealand)                                                     |
| Runway             | **16/34**, 1815 m between the thresholds, 45 m wide; **130 m** before the 16 threshold and **106 m** before the 34 threshold usable for the take-off run |
| Data files         | [`src/data/airports/nzwn.ts`](../../src/data/airports/nzwn.ts), layout [`nzwn.layout.ts`](../../src/data/airports/nzwn.layout.ts) (generated) |

The first airport in Australia / Oceania. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `nzwn.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, holding positions, pushback holding zones, stands with their lead-in lines, aprons, buildings, thresholds | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway length and take-off runs (1945 m on 16, 1921 m on 34), terminal piers and their use, airlines and destinations, curfew | [Wellington Airport](https://en.wikipedia.org/wiki/Wellington_International_Airport) (Wikipedia) |
| Positions and frequencies, holding points by aircraft type, SIDs and which aircraft fly them, taxi rules | [VATNZ NZWN procedures](https://sops.vatnz.net/aerodromes/Class-C/nzwn/) and the [Wellington terminal area](https://sops.vatnz.net/terminal/wtma/) (VATSIM New Zealand), used as a reference only |
| Reference point, elevation, destinations | [OurAirports](https://ourairports.com/) (public domain) |

The **AIP New Zealand** was not used: its conditions of use allow personal use only. Everything that would normally come from it is marked below.

**Simplified, estimated or not modelled:**

- the **stand sizes** are estimates (light turboprops 17 m, ATR 72 30 m, A320 / B737 36 m); the stand numbers and positions are those of OpenStreetMap,
- the **take-off runs of the intersections** (A2 1745 m, A3 1455 m, A4 1180 m on runway 16; A10 1815 m, A9 1725 m, A8 1530 m on runway 34) are measured on the map, not published figures; the full-length runs (A1 1945 m, A11 1921 m) are the published ones,
- the **SID designators** carry the version number 1 of the 2022 change (ATVEV1Q, UPLUD1P, ...); the real versions may be higher. IDVAL is spelled as in the VATNZ change list (the procedures also write IVDAL),
- **SIDs by direction** (a simulator convention): jets fly ATVEV1Q (16) or UPLUD1P / UPLUD1R (34) whatever their destination; turboprops IDVAL1Q to Nelson, Blenheim and Picton, AGROR1Q to the south and UPROG1Q to the north (16), IPKEP1P to the west and URGEV1P to every other direction (34). The visual SIDs (IDVAL1U, IPKEP1T) and the radar departures are not used,
- the **Western Apron** (general aviation, Life Flight, the air force, Execujet, helicopters) across the runway is drawn with M, N, M4 and M5, not used,
- the **northern fillet of A5** is drawn, not used: arrivals vacating at A5 turn south towards the terminal,
- arrivals **16** vacate at A6-A10 (not A5, which would put them head-on with the departures going north on A),
- the initial climb is the simulator default (5000 ft); the real SIDs have their own altitude restrictions,
- traffic: estimated operator shares (Air New Zealand about two thirds), 80 % of Stuttgart's movements per density step (`rateFactor` 0.8).

**Never use this simulator for real-world navigation.**

## Runway and approaches

| Runway | Take-off run (m) | Entries | Approaches |
| ------ | ---------------- | ------- | ---------- |
| 16 | 1945 from A1 | A1 (full length), A2, A3, A4 | ILS, RNP - over Evans Bay |
| 34 | 1921 from A11 | A11 (full length), A10 (threshold), A9 (angled), A8 | ILS, RNP - over Lyall Bay and Cook Strait |

The prevailing northerly wind puts runway 34 in use most of the time; southerlies come with the fronts. The airport has a **curfew** from midnight to 6 am local time (international arrivals until 1 am).

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Delivery | Wellington Delivery | 128.200 |
| Ground | Wellington Ground | 121.900 |
| Tower | Wellington Tower | 118.800 |
| Approach | Wellington Approach | 119.300 |
| ATIS | Wellington | 126.900 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **A** | Parallel taxiway on the east side of the runway, from A1 in the north to A10 / A11 in the south; 23 m |
| **A1 - A11** | Links between the runway and A; A1 and A11 at the runway ends, A9 an angled entry for runway 34 (it forks behind its holding point), A2 with fillets both ways |
| **B** | Second parallel in front of the terminal, from B10 in the south to B5 / P in the north |
| **B5 - B10** | Links between A and B |
| **R, S, T, U** | From B to the pier lanes C and D |
| **C, D, P, Q** | Apron taxilanes along the piers |
| **Z1 - Z6** | Pushback holding zones on B, R, S, T and U (intermediate holding positions on the scope) |
| **M, N, M4, M5** | Western Apron, across the runway - drawn |

| Stands | Use in the simulator |
| ------ | -------------------- |
| South pier: 3N-12, R1, R2, R2N, R2S | Regional (ATR 72) on D and C; the N / S positions for light turboprops; R1, R2 jets |
| South-west pier: 13-17, 16N, 16S | Air New Zealand domestic jets |
| Main apron: 72N-79S | Regional (ATR 72) along B, C and Q |
| North-west pier: 21-29, 24AN, 24AS | Jetstar and the international flights |

## Procedures

- **Clearances:** "cleared to Auckland, ATVEV1Q departure, flight planned route, climb to altitude 5000 feet, squawk ...". The Delivery hands the crews to Ground once the clearance (voice or datalink) is given.
- **Holding points** (VATNZ): runway 16 - large jets A1, medium jets A1 or A2, turboprops A2 or A3; runway 34 - jets A10 (the simulator uses A11 for the full length), turboprops A9 or A10.
- **Taxi:** A is the only taxiway along the runway; feed the departures onto A via B and the links B5-B10 (from the south pier via R, S, T or U). Arrivals 16 land towards the terminal and vacate at A6-A10; arrivals 34 vacate at A7-A2 and taxi back south on A.
- **Stand names** with letters are said as they are written: "stand 24 alpha november", "stand romeo 2 sierra".
