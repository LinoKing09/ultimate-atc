[Documentation](../README.md) › [Airports](README.md) › EDDM

# EDDM - München

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDM / MUC (Flughafen München Franz Josef Strauß)                            |
| Location           | 15.4 NM north-east of München city centre, Germany (München FIR, EDMM)      |
| Reference point    | 48°21'13.62"N 011°47'09.91"E (AIP AD 2.2)                                   |
| Elevation          | 1487 ft; thresholds 08L 1467 ft, 26R 1449 ft, 08R 1486 ft, 26L 1470 ft      |
| Magnetic variation | 3.7° E (AIP, 2026)                                                          |
| Transition altitude | 5000 ft; the SIDs climb to 5000 ft                                         |
| Runways            | **08L/26R** (north) and **08R/26L** (south), each 4000 m x 60 m, true bearing 083.4° / 263.4°, 2.3 km apart, no displaced thresholds |
| Data files         | [`src/data/airports/eddm.ts`](../../src/data/airports/eddm.ts), layout [`eddm.layout.ts`](../../src/data/airports/eddm.layout.ts) (generated) |

The hub of Lufthansa in the south: two parallel runways used at the same time for take-offs and landings, with independent parallel approaches, and the runway chosen by direction. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `eddm.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, aprons, stand lead-in lines, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runways, thresholds, declared distances with the intersection take-offs, taxiway designators, holding points, the high-speed turn-offs (HIRO), the runway use by direction, the **stand list with its coordinates**, frequencies, the RNAV SIDs | DFS AIP AD 2 EDDM (AIRAC 2026-10-29) with its aerodrome chart, aircraft parking / docking charts and SID charts, used as a reference only: facts digitised by hand, no chart content copied |
| Traffic | Munich Airport route network (Wikipedia; about 41 million passengers and 330000 movements a year); operator shares are estimates |

**Simplified, estimated or not modelled:**

- the **holding points** are the CAT I positions of the chart (A1-A15 without A7 and A11, B1-B15 without B5 and B9); the CAT II/III positions further out are drawn as hold lines, used only during low visibility operations in reality (not modelled),
- **A7** and **B9** (crossed out on the aerodrome chart) are drawn, not used,
- the long **high-speed turn-offs** cross each other before the runway (A8 / A9, B6 / B7, B8 / B10 / B11): each holding point leads onto the runway along its own taxiway (`stripsAlongTaxiway`, `maxStripM` 700 m in `buildLayout`),
- the **stand sizes** are not published: the centre position of a stand with A / B positions is code E, the A / B positions code C, the others by their spacing (70 m and more code E, 57 m and more code D, else code C). Overlapping positions are never used at the same time (wingtip clearance check),
- stands without a lead-in line in OpenStreetMap (among them 201, 318A, 352-356, 371 / 372, 511-523, 586, 591-595) have their AIP coordinates and the lane node on the nearest apron taxiway; **99-108** (the new pier of Terminal 1, under construction on the aerodrome chart, no taxilanes in OpenStreetMap) and the stands of the maintenance aprons 7 and 8 (7xx / 8xx) are left out; general aviation on apron 5 (5xx), cargo on apron 9 (9xx),
- one **Ground** and one **Tower** for both runways (AIP: Ground 121.980 north / 121.830 south, Tower 118.705 north / 120.505 south); Muenchen Apron 1-3 is not a separate position,
- the de-icing areas, A-CDM (TOBT, TSAT), the noise abatement procedures and the night restrictions are not modelled; MIQ (Mike) SIDs are not planned automatically,
- traffic: estimated operator shares (Lufthansa and Lufthansa CityLine about 60 %), twice Stuttgart's movements per density step (`rateFactor` 2).

**Never use this simulator for real-world navigation.**

## Runways and approaches

| Runway | TORA (m) | Entries (take-off run) | High-speed turn-offs (distance from the threshold) | Approaches |
| ------ | -------- | ---------------------- | -------------------------------------------------- | ---------- |
| 08L | 4000 | A1 / A2 (full length), A3 (3885), A4 (3041), A6 (2422) | A5 (1270 m), A8 (1710 m), A10 (2260 m); then A12-A15 | ILS CAT III, RNP |
| 26R | 4000 | A15 / A14 (full length), A13 (3900), A12 (3009), A10 (2489) | A9 (1580 m), A6 (2200 m); then A4-A1 | ILS CAT III, RNP |
| 08R | 4000 | B1 / B2 (full length), B3 (3885), B4 (3069), B6 (2449) | B7 (1580 m), B10 (2200 m); then B12-B15 | ILS CAT III, RNP |
| 26L | 4000 | B15 / B14 (full length), B13 (3885), B12 (3041), B10 (2429) | B11 (1160 m), B8 (1660 m), B6 (2220 m); then B4-B1 | ILS CAT III, RNP |

Operating direction 26 is in use about 60 % of the time (westerly winds, estimate). Both runways are used for take-offs and landings (mixed); the ATIS editor can also make them segregated or semi-mixed (see [parallel runways](../simulation.md#parallel-runways)). Approaches are **independent** by default.

**Runway by direction** (AIP AD 2.20 3.1.4 / 3.2.1, `departureSectors` / `arrivalSectors` in `parallelRunways`):

| Traffic | Northern runway (08L / 26R) | Southern runway (08R / 26L) |
| ------- | --------------------------- | --------------------------- |
| Departures, operating direction 26 | Destinations 327°-100° (north, north-east, BIBAG) | 100°-327° (south-east, south, south-west, north-west) |
| Departures, operating direction 08 | Destinations 277°-100° (north-west, north, north-east) | 100°-277° |
| Arrivals | Origins 270°-090° (via ROKIL / LANDU) | Origins 090°-270° (via NAPSA / BETOS) |

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Delivery | Muenchen Delivery | 121.730 |
| Ground | Muenchen Ground | 121.980 |
| Tower | Muenchen Tower | 118.705 |
| Approach | Muenchen Radar | 123.905 (departures to the south: 127.955) |
| ATIS | Muenchen ATIS | 123.130 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **M**, **N** | Parallels south of the northern runway |
| **S**, **T** | Parallels north of the southern runway |
| **A1**-**A15** / **B1**-**B15** | To the holding points of the northern / southern runway; A4-A6, A8-A10, A12 and B4, B6-B8, B10-B12 angled (high-speed turn-offs) |
| **N1**-**N4**, **S1**-**S8** | Links from the parallels to the aprons |
| **W1**, **W2**, **E1**-**E3**, **C1**-**C5**, **D1**-**D6**, **CENTER2** | Apron taxiways of Terminal 1 (apron 1) and Terminal 2 (aprons 2 and 3) |
| **B12WEST** | Between S and T west of B12 - not to be confused with B12 (hot spot) |
| **R** | Along aprons 6-9 in the west |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 110-195 | Apron 1 (Terminal 1 and its remote stands) |
| 201-263 | Apron 2 (Terminal 2) |
| 301-372 | Apron 3 (satellite of Terminal 2) |
| 511-595 | Apron 5 (general aviation) |
| 601-614 | Apron 6 |
| 901-907 | Apron 9 (cargo) |

## Procedures

- **Clearances** (Delivery): "cleared to Hamburg, EVIVA5N departure, squawk ..." - RNAV SIDs, the letter names the runway: **Q** 08L, **E** 08R, **S** 26L, **N** 26R (OBAXA from 08L / 08R: T / P). Exit fixes clockwise from the north: EVIVA, AKINI, ANKER, BIBAG, KIRDI, ROTAX, VAVOR, TURBU, TULSI, OBAXA, MERSI, ALG, OLASO, RIDAR, GIVMI, INPUD, planned by the direction of the destination; the departures to the south (BIBAG to OLASO) call Muenchen Radar on 127.955.
- **Northern runway**: departures from A1 / A2 (08L) or A14 / A15 (26R) or the intersections; arrivals vacate via the high-speed turn-offs onto M and N.
- **Southern runway**: departures from B1 / B2 (08R) or B14 / B15 (26L) or the intersections; arrivals vacate via the high-speed turn-offs onto T and S.
