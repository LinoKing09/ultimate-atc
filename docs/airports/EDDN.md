[Documentation](../README.md) › [Airports](README.md) › EDDN

# EDDN - Nuremberg

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDN / NUE (Albrecht Dürer Airport Nuremberg)                               |
| Location           | Nuremberg, Bavaria, Germany                                                 |
| Reference point    | 49°29'55.32"N 011°04'40.83"E (AIP)                                         |
| Elevation          | 1044 ft (AIP)                                                               |
| Magnetic variation | 4.3° E (World Magnetic Model, 2026)                                         |
| Transition altitude | 5000 ft; initial climb of the RNAV SIDs FL70                               |
| Runway             | **10/28**, 2700 m x 45 m, true heading 098.6° / 278.6°; **28 preferred**        |
| Data files         | [`src/data/airports/eddn.ts`](../../src/data/airports/eddn.ts), layout [`eddn.layout.ts`](../../src/data/airports/eddn.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `eddn.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Runway, taxiways, holding points (names from the OSM tags "Rollhalt Alpha" ...), stands, aprons, paved taxiway areas, helipads, buildings (all buildings on the aerodrome, the terminal included) | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Paved areas OSM does not have: the southern half of Apron G2 / G2A, the J corridor between the aprons ("Entry GAT"), the apron strips along S3, S4 and at Hangar 8, the west edge of the GA apron, the terminal frontage, the Hangar A forecourt, the FAI and Aero-Dienst aprons, and the lane from S3 into the Aero-Dienst apron | Digitised by hand from the ground movement chart (AD 2 EDDN 2-7, AMDT 01/26), georeferenced on its printed graticule (approximate, a few metres). The FAI and Aero-Dienst aprons are the outlines of their areas of responsibility (the chart does not shade them; their paving is inferred). G3 is grass parking: not drawn |
| Reference point, elevations, thresholds, declared distances, approaches, taxiway widths and code limits (J, S3, S4, T2), the name M2 of the link at the east end of the apron, hot spot, helicopter stands | DFS AIP Germany AD 2 EDDN (AIRAC 2026OCT01): text pages, aerodrome chart AD 2 EDDN 2-5 (AMDT 10/26) and ground movement chart 2-7 (AMDT 01/26), used as a reference only - facts read by hand, no chart content copied. The stand positions of AD 2.8 match the OSM stands within 4 m |
| Frequencies, SIDs, stand use, taxiway restrictions, preferred runway, exits, intersections | VATSIM Germany Nürnberg SOP (facts only; a simulation resource, not an official source); frequencies checked against the VATSIM Germany station data and vATIS profile (2026-10-21), SID designators against a public chart index |
| Exit fix positions (for the SID choice), magnetic variation | public waypoint lists; NOAA World Magnetic Model (October 2026) |

**Simplified or not modelled:**

- the general aviation areas: the lanes S3 (to Apron G2 / G2A), S4 (west to the FAI apron) and T2 (to aprons U1 / U2) are drawn and can be taxied by small aircraft (code B), but only the business jet stands 81-86 on M4 / S4 are parking positions; the helipads are drawn, helicopters are not simulated,
- the CAT II/III holding points with stop bars (A, B, C/F and J; runway 28 only) are plain junctions - no low visibility operations,
- code D / E aircraft taxi without follow-me (real: PPR and the "Higher Code Letter Aircraft" procedure with a follow-me from the east end of F or from A abeam stand 27),
- the code limits of B, C, D, E and N2 come from the VATSIM Germany SOP (the AIP publishes those of J, S3, S4 and T2),
- intersection C (AIP: 10 1461 m, 28 1289 m) is published but not used for departures (SOP),
- the helicopter stands H1-H4 are drawn (helipads), helicopters are not simulated; the current aerodrome chart (AMDT 10/26) numbers H1-H3 from east to west (H3 west), the older ground movement chart the other way round,
- SIDs: the RNAV SIDs BOLSI, ERETO, RODIS, SUKAD and SULUS (G = runway 28, C = runway 10; the numbers change with the AIRAC cycle), see [SIDs](#sids); the local training SID ERL and the conventional NUB SIDs for non-RNAV aircraft are not modelled,
- traffic: estimated operator shares, about 60 % of Stuttgart's movements per density step (`rateFactor` 0.6).

**Never use this simulator for real-world navigation.**

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Ground (also clearances; datalink clearances common) | Nuernberg Ground | 121.760 |
| Tower | Nuernberg Tower | 118.305 |
| Approach | Muenchen Radar (sector Franken) | 129.525 |
| ATIS | Nuernberg Information | 123.080 |

Nuremberg is not an A-CDM airport (no TSAT); there is no Delivery position.

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **F** | Parallel taxiway between the runway and the aprons, west part: from the 10 end to the junction with C, M2 and N2 |
| **A** | Parallel taxiway, east part: from the M2 / B junction to the 28 end |
| **F, E, D, C, B, A** | Connectors to the runway with their holding points; F and A at the runway ends (full length 10 / 28), E, D (10) and B (28) intersections, D (code D) and C (code C) exits |
| **J** | From the west apron (M3 / M4 / N4) up to F: code C from F to M4 (code D / E only cross it between M3 and M4 / N4), code B from M4 south to the GA entry |
| **M1-M4** | Apron taxilanes along the terminal stands (M2, M3), the cargo apron (M1) and the west apron (M4); M2 also links the east end of the apron north to A, B and N2 |
| **N2, N4** | Lanes behind the remote stands 30-35 (N2) and 40-44 (N4), used only to enter them |
| **S3, S4** | GA apron lanes south of M4 (code B): S3 east to Apron G2 / G2A and the GA entry, S4 west to the FAI apron |
| **T2** | From S4 south to the GA aprons U1 / U2 (code B) |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 01-06, 09-16 | Terminal (jet bridges 10-13), nose south, taxi in and push back onto M1 / M2 / M3 (01 for turboprops) |
| 30-35 | Remote, in via N2, nose south, out via M2 (code C) |
| 40-44 (40D, 41D, 43D code D; 40E code E) | West apron, in via N4, out via M4 |
| 26-28 (26D, 28D code D; 27E code E) | Cargo, in via M1, nose north, out via A (used for airliners only when nothing else is free) |
| 81-86 | Business jets: 81, 83, 85 nose north (in from S4, out via M4), 82, 84, 86 nose south with pushback onto M4 |

Taxiways B, C, E and N2 are limited to code C (36 m), D to code D (52 m), S3 / S4 / T2 to code B (24 m), J as above. Widths (AIP AD 2.8): A, B, C, E, F, J 22.5 m, D and M1-M4 23 m, N4 21 m, N2 18 m, S3 / S4 / T2 10.5 m.

## Runways and approaches

| Runway | THR elevation | TORA (m) | Intersection take-off (TORA, m) | Approaches |
| ------ | ------------: | -------: | ------------------------------- | ---------- |
| 10 | 1020 ft | 2700 | E 2300, D 1900 (C 1461 not used) | **ILS CAT I** (GP 3.0°), LOC, VOR, RNP |
| 28 | 1044 ft | 2700 | B 1962 (C 1289 not used) | **ILS CAT II / III** (GP 3.0°), LOC Z, LOC Y, RNP |

Aerodrome elevation 1044 ft; the thresholds are not displaced (the paved areas beyond them are tagged stopway in OSM, the AIP lists no stopway).

## Procedures

- **Runway 28 is preferred**; the direction changes only with more than 5 kt tailwind.
- **Departures**: 28 from A (full length) or intersection B; 10 from F, or intersections E and D. Aircraft up to 2 t are normally cleared from B / E (AIP). C is not used for departures.
- **Hot spot**: the junction where M3 joins M2 (next to C, F and helicopter stand H4) - "complex taxiway layout, check taxi clearance".
- **Arrivals vacate not earlier than C** (a departure may be waiting at B or E): runway 28 via C, D, E or F (end), runway 10 via C, B or A (end).
- Fill the remote stands 30-35 and 40-44 from the far end: N2 and N4 are blocked by the aircraft parked on them.

## SIDs

Each flight plan is filed via the exit fix towards its destination (great-circle bearing from Nuremberg, a simulator approximation of the route network). After take-off all departures contact München Radar 129.525.

| Exit fix | Runway 28 / 10 | Used for (simulator) |
| -------- | -------------- | -------------------- |
| ERETO    | ERETO1G / ERETO1C | 000-060° (Berlin, Leipzig, Dresden, Scandinavia) |
| RODIS    | RODIS1G / RODIS1C | 060-150° (Prague, Vienna, Budapest, Balkans, Greece, Turkey, Egypt) |
| BOLSI    | BOLSI1G / BOLSI1C | 150-250° (Munich, Italy, Switzerland, Spain, Portugal, Canaries) |
| SUKAD    | SUKAD1G / SUKAD1C | 250-320° (Frankfurt, Rhine-Ruhr, Paris, Benelux, UK, Ireland) |
| SULUS    | SULUS1G / SULUS1C | 320-360° (Hamburg, Bremen, Hannover; only for flights continuing on L604) |

## Traffic

Eurowings, Ryanair, Lufthansa (Frankfurt) and Lufthansa CityLine, TUI, Condor, SunExpress, Pegasus, Turkish, KLM Cityhopper, Air France, Wizz Air and business jets; shares are estimates from the route network.
