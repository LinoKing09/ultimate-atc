[Documentation](../README.md) › [Airports](README.md) › SEQM

# SEQM - Quito

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | SEQM / UIO (Mariscal Sucre International Airport)                          |
| Location           | Tababela, 20.5 km east of Quito, Ecuador (Guayaquil FIR, SEFG)             |
| Reference point    | 00°07'27"S 078°21'16"W (AIP AD 2.2, centre of the runway)                   |
| Elevation          | **7910 ft** (2411 m); threshold 18 7776 ft, threshold 36 7910 ft             |
| Magnetic variation | 5° W (AIP, 2025)                                                            |
| Transition altitude | 18000 ft; every departure is restricted to 17000 ft at first (AD 2.22)     |
| Runway             | **18/36**, 4098 m x 45 m, true bearing 177.5° / 357.5°, no displaced thresholds |
| Data files         | [`src/data/airports/seqm.ts`](../../src/data/airports/seqm.ts), layout [`seqm.layout.ts`](../../src/data/airports/seqm.layout.ts) (generated) |

The first airport in South America, and the highest in the simulator. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `seqm.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiway geometry, aprons, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway, thresholds, declared distances, taxiway designators and widths, the standard taxi routes (AD 2.20), runway use and departure restrictions (AD 2.22), **stand coordinates and critical aircraft**, frequencies, ILS, the RNAV SIDs with their end fixes | AIP Ecuador AD 2 SEQM (AIRAC AMDT 01/26) with its aerodrome chart, ground movement chart, parking / docking charts and the RNAV SID tables (AD 2 SEQM 28.x-2), used as a reference only: facts digitised by hand, no chart content copied |
| Traffic | Quito airport route network (Wikipedia; about 5 million passengers a year), flower exports by freighter; operator shares are estimates |

**Corrections to OpenStreetMap** (after the AIP charts):

- OpenStreetMap calls the apron lane along the terminal **H**; it is **C**. H is the link from C across B to A (south of the stands 61-67), **J** the link further north,
- OpenStreetMap calls the parallel taxiway west of A in the south **F**; it is **B** (from J to E). The links between B and A in the south are, from north to south, **G** (at A1), **F** and **E**,
- the **commercial apron** has grown north since OpenStreetMap was drawn: C is extended to the stands 13-16 and 57-60 (drawn as a rectangle), positions after the AIP stand table,
- OpenStreetMap has the stand lead-in lines without numbers: every stand is at its AIP position, its lane node the nearest point on C, B or H (`snap`).

**Simplified or not modelled:**

- the holding points at the runway ends are called "TWY A THR 18" and "TWY A THR 36" in the AIP (AD 2.9); the simulator names them **A18** and **A36** (both would be "A"),
- **runway 18 has no SID** in the simulator: the conventional SIDs of the AIP (charts AD 2 SEQM 27.x) were not available. AD 2.22 allows radar vectors instead ("se utilizarán las salidas publicadas en la AIP o guía vectorial"), so departures from runway 18 are cleared with **radar vectors** - "cleared to Guayaquil, radar vectors, flight planned route, climb 17000 feet",
- the RNAV SIDs of runway 36 are planned by the direction of the destination (sectors halfway between the bearings of the end fixes); where the AIP has an A and a B version (KETOM, REBEK, TEMOX, ORETA, MIDEX) both are offered,
- the AIP publishes no intersection take-off runs: the runs from **A1** (runway 36, 3010 m), **A3** (18, 2600 m) and **A2** (18, 1680 m) are measured on the map,
- the rapid exit **A2** forks behind its holding point: the branch for runway 36 is used, the northern branch is drawn,
- the **general aviation apron** (D, stands 90A-99, helicopter stand H3), the **maintenance apron**, the **isolated stand Z** (with T) and the way south to H3 are drawn, not used,
- the overlapping larger positions 51A, 53A and 56A are separate stands; the AIP says they are towed in from C,
- low visibility procedures (CAT II on runway 36) are not modelled; the thin air at 7910 ft does not lengthen the take-off runs in the simulator,
- traffic: estimated operator shares (LATAM and Avianca Ecuador about two fifths), 60 % of Stuttgart's movements per density step (`rateFactor` 0.6).

**Never use this simulator for real-world navigation.**

## Runway and approaches

| Runway | TORA / TODA / ASDA / LDA (m) | Entries (take-off run, intersections measured) | Approaches |
| ------ | ---------------------------- | ----- | ---------- |
| 18 | 4098 / 4098 / 4098 / 4098 | A18 (north end); A3 (2600), A2 (1680) | ILS CAT I (glide path 3.2°) |
| 36 | 4098 / 4098 / 4098 / 4098 | A36 (south end); A1 (3010) | ILS CAT II (glide path 3.2°) |

All arrivals and departures use **runway 36** normally; runway 18 only with wind from the SSW to SSE of 8 kt or more (AD 2.22). Aircraft departing runway 36 must not turn right before the VOR QNV, those departing runway 18 never turn left.

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Ground (gives the clearances, no Delivery) | Quito Ground | 121.900 |
| Tower | Quito Tower | 118.350 |
| Approach | Quito Approach | 121.200 |
| ATIS | Quito | 118.900 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **A** | Parallel taxiway west of the runway, the whole length; 23 m |
| **A1** | Rapid exit for runway 18, joins A at G |
| **A2** | Rapid exit for runway 36 (the northern branch is drawn) |
| **A3** | Rapid exit for runway 36 |
| **B** | Second parallel in front of the aprons, from J in the north to E in the south; 18 m (23 m between G and H) |
| **J, H** | Links from A across B to C, north and south of the stands 61-67 |
| **G, F, E** | Links between A and B in the south (G 42 m wide, with the engine run-up pads) |
| **C** | Apron lane of the commercial apron |
| **D, T** | General aviation apron and the isolated stand - drawn |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 6-16 | West side of C at the terminal; code C to E (A350 on 11, 14, 16) |
| 51-60, 51A, 53A, 56A | East side of C; code C, the A positions code D / E |
| 61-67 | Along B, code C |
| 3-5 | South of H, code C |
| 80-85, 84A | Cargo apron along B: flower freighters, up to the B747-8 on 81, 84A and 85 |

## Procedures

- **Clearances** (Ground): runway 36 - "cleared to Bogota, ARNOK3A departure, flight planned route, climb via SID to altitude 17000 feet, squawk ..."; runway 18 - "cleared to Bogota, radar vectors, flight planned route, climb 17000 feet, squawk ...".
- **SIDs** of runway 36 by direction: NEGAL (north, Miami, the US), ARNOK (north-east, Bogota, Panama), SIMOG (east), VURIS (south-east), KETOM (south), REBEK (south-west, Guayaquil, Cuenca), TEMOX, ORETA, MIDEX (west, Manta, the Galapagos), PALAD (north-west).
- **Taxi** (AD 2.20): to the stands 3-16 and 51-60 via H or J and C, to 61-67 and the cargo apron via H and B; departures to runway 36 down A to A36, to runway 18 up A to A18. No 180-degree turns on the taxiways.
