# EDDN - Nuremberg

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDN / NUE (Albrecht Dürer Airport Nuremberg)                               |
| Location           | Nuremberg, Bavaria, Germany                                                 |
| Reference point    | 49°29'55"N 011°04'41"E (OurAirports)                                        |
| Elevation          | 1046 ft                                                                     |
| Magnetic variation | 4.0° E (simulation value)                                                   |
| Transition altitude | 5000 ft; initial climb of the RNAV SIDs FL70                               |
| Runway             | **10/28**, 2700 m x 45 m, true heading 099° / 279°; **28 preferred**        |
| Data files         | [`src/data/airports/eddn.ts`](../../src/data/airports/eddn.ts), layout [`eddn.layout.ts`](../../src/data/airports/eddn.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `eddn.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Runway, taxiways, holding points (names from the OSM tags "Rollhalt Alpha" ...), stands, aprons, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Reference point, elevations | [OurAirports](https://ourairports.com/) (public domain) |
| Frequencies, SIDs, stand use, taxiway restrictions, preferred runway, exits, intersections | VATSIM Germany Nürnberg SOP (facts only; a simulation resource, not an official source) |

**Simplified or not modelled:**

- the general aviation areas (aprons G1-G3, U1, U2, the FAI and Aerodienst aprons, taxiway T2) and the helipads; only the business jet stands 81-86 on M4 / S4,
- the CAT II/III holding points (J, F/C, B and A) are plain junctions - no low visibility operations,
- taxiway J is not limited to code C (larger aircraft cross it between M3 and M4 / N4; the simulator does not split it),
- code D / E aircraft taxi without follow-me (real: "Higher Code Letter Aircraft" procedure),
- the unnamed link from the east end of the apron to A / B / N2 is part of A in the simulator,
- terminal buildings mapped as multipolygons in OSM are not drawn,
- SIDs: designators from the SOP (BOLSI, ERETO, RODIS, SUKAD; G = runway 28, C = runway 10), the numbers change with the AIRAC cycle,
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
| **F** | Parallel taxiway north of the aprons, west part: from the 10 end to the junction with C, M2 and N2 |
| **A** | Parallel taxiway, east part: from the apron (M1 / M2, N2) to the 28 end |
| **F, E, D, C, B, A** | Connectors to the runway with their holding points; F and A at the runway ends (full length 10 / 28), E and B intersections for small aircraft, D (code D) and C (code C) exits |
| **J** | From the west apron (M3 / M4 / N4) up to F |
| **M1-M4** | Apron taxilanes along the terminal stands (M2, M3), the cargo apron (M1) and the west apron (M4) |
| **N2, N4** | Lanes behind the remote stands 30-35 (N2) and 40-44 (N4), used only to enter them |
| **S3, S4** | GA apron lanes south of M4 (code B) |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 01-06, 09-16 | Terminal (jet bridges 10-13), nose south, taxi in and push back onto M1 / M2 / M3 (01 for turboprops) |
| 30-35 | Remote, in via N2, nose south, out via M2 (code C) |
| 40-44 (40D, 41D, 43D code D; 40E code E) | West apron, in via N4, out via M4 |
| 26-28 (26D, 28D code D; 27E code E) | Cargo, in via M1, nose north, out via A (used for airliners only when nothing else is free) |
| 81-86 | Business jets: 81, 83, 85 nose north (in from S4, out via M4), 82, 84, 86 nose south with pushback onto M4 |

Taxiways B, C, E and N2 are limited to code C (36 m), D to code D (52 m), S3 / S4 to code B (24 m).

## Procedures

- **Runway 28 is preferred**; the direction changes only with more than 5 kt tailwind.
- **Departures**: 28 from A (full length), small aircraft from intersection B; 10 from F, small aircraft from E. C is not used for departures.
- **Arrivals vacate not earlier than C** (a departure may be waiting at B or E): runway 28 via C, D, E or F (end), runway 10 via C, B or A (end).
- Fill the remote stands 30-35 and 40-44 from the far end: N2 and N4 are blocked by the aircraft parked on them.

## Traffic

Eurowings, Ryanair, Lufthansa (Frankfurt) and Lufthansa CityLine, TUI, Condor, SunExpress, Pegasus, Turkish, KLM Cityhopper, Air France, Wizz Air and business jets; shares are estimates from the route network.
