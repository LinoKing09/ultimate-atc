# EDDP - Leipzig/Halle

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDP / LEJ (Leipzig/Halle Airport)                                          |
| Location           | Schkeuditz, between Leipzig and Halle, Saxony, Germany                      |
| Reference point    | 51°25'26.37"N 012°14'10.98"E (AIP)                                         |
| Elevation          | 469 ft (AIP)                                                                |
| Magnetic variation | 5.0° E (AIP: 4.9° E 2026.01, +0.2° per year)                                |
| Transition altitude | 5000 ft; initial climb of the SIDs FL70                                    |
| Runways            | **08L/26R**, 3600 m x 45 m (north), and **08R/26L**, 3600 m x 60 m (south), true heading 085.7° / 265.8°, 2.1 km apart - **both in use at the same time**, for take-offs and landings |
| Data files         | [`src/data/airports/eddp.ts`](../../src/data/airports/eddp.ts), layout [`eddp.layout.ts`](../../src/data/airports/eddp.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `eddp.ts`). How the simulator handles two runways in use is described in [parallel runways](../simulation.md#parallel-runways).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, holding points, aprons, buildings, stand lead-in lines | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway thresholds and elevations, aerodrome elevation, reference point and magnetic variation, declared distances and intersection take-off distances, stand positions (AD 2.8 checkpoints), taxiway widths, rapid exits (RETIL), parallel runway operations, frequencies | DFS AIP Germany AD 2 EDDP (AIRAC 2026OCT01) with its aerodrome chart and SID charts, used as a reference only: facts read by hand and with text recognition from the published pages, no chart content copied |
| Runway assignment by apron and size, operating modes, stand use and the bay sizes of apron 4, airlines | VATSIM Germany airport page Leipzig/Halle (facts only; a simulation resource, not an official source) |
| Traffic | Leipzig/Halle Airport route network 2026 (Wikipedia), ADV statistics (about 85,000 movements and 1.4 million t of freight in 2024); operator shares and the cargo share (about two thirds of the movements) are estimates |

**Simplified or not modelled:**

- both runways are used in **mixed mode** with **dependent parallel approaches** (1.5 NM diagonal, AIP AD 2.22); the AIP also allows segregated operations, VATSIM uses staggered approaches (3 NM) without an Arrival controller - the simulator offers the parallel runways together or one runway alone,
- one Tower position works both runways (`Leipzig Tower` 121.105; the northern runway has its own frequency 125.955, cross-coupled when one controller works both, as on VATSIM),
- the holding points carry the names of their taxiways (the charts give no designators); the CAT II/III holding positions are not modelled separately, except **H1** (08R from the north), which only exists as a CAT II/III position far from the runway (hot spot 1); A2 joins A1 before the runway,
- stands: the AIP positions of aprons 1-5 without the alternative positions (L / R / W / M and the southerly aligned ones); apron 4 sizes after the VATSIM Germany bays (A 401-412 52 m, B 421-436 36 m, C 441-452 52 m, D 461-478 52 m, E 481-487 80 m); apron 1 (101-111 36 m taxi-out positions, 112-121 and 137-143 business jets, jetway stands 126-136 52 m), apron 2 (65 m), apron 3 (80 m) and apron 5 (65 m) are estimates,
- apron 2 has no taxilane in OSM: the simulator adds one along its stands (part of V ORANGE); apron 3 gets lead-in lines from F; stands at the dead end of an apron 4 taxilane push back from the node before it,
- the orange guide line L between stands 101-111 (follow-me only), the de-icing pads and the engine run-up stand are drawn but not used,
- taxi flows (simulator convention): direction 26 eastbound on N and T, direction 08 westbound - departures from apron 1 leave via the bridges E7 / E8 (26) or W1 (08), arrivals come the other way,
- night: the airport is open 24 hours for cargo; the AIP restrictions for passenger flights (from 23:30 local) are not modelled; HIRO exits at night (S6 / S4) are not enforced,
- no general aviation, light aircraft or Antonov An-124 (no type data).

**Never use this simulator for real-world navigation.**

## Runways and approaches

| Runway | True heading | TORA (m) | Intersection take-offs (TORA) | Approaches |
| ------ | -----------: | -------- | ----------------------------- | ---------- |
| 08L | 085.7° | 3600 (A1, A2) | A3 2450, A4 1850, A5 1745 | ILS Z / Y CAT II/III, LOC, RNP |
| 26R | 265.8° | 3600 (A9, A8) | A7 2450, A6 1850, A5 1745 | ILS Z / Y CAT II/III, LOC, RNP |
| 08R | 085.7° | 3600 (S1, H1) | S2 3270, S3 2450, S4 1850, H5 / S5 1595 | ILS Z / Y CAT II/III, LOC, RNP |
| 26L | 265.8° | 3600 (S10) | S9 3270, H8 2885, S8 2850, H7 2760, S7 2725, S6 2250, H5 / S5 1895 | ILS Z / Y CAT II/III, LOC, RNP |

TODA = TORA + 300 m everywhere (AIP AD 2.13). Thresholds: 08L 417 ft, 26R 447 ft, 08R 427 ft, 26L 469 ft. Direction **26** is preferred (up to 5 kt tailwind).

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Delivery | Leipzig Delivery | 121.680 |
| Ground | Leipzig Ground | 121.805 |
| Tower | Leipzig Tower | 121.105 (south), 125.955 (north) |
| Approach | Muenchen Radar | 126.065 (north), 126.175 (south) |
| ATIS | Leipzig Information | 123.955 |

Datalink clearances (DCL) and A-CDM as at the real airport and on VATSIM.

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **C** | Parallel taxiway south of the northern runway; **A1-A9** link it to the runway (A4 rapid exit landing 26R, A6 landing 08L); **B**, **G1**, **G2** short links at both ends |
| **W1**, **E7 / E8** | From C south to the terminal: W1 in the west (to H1 and the 08R end), the two bridges E7 and E8 in the east (to H7 / H8 and the southern runway) |
| **N** | Along apron 1 (terminal) from W1 to E7 / E8; **L** and **M** taxilanes of apron 1; **H2**, **K** to the west; **H5** from N to the southern runway |
| **T**, **V** | Along the south side of the southern runway: T next to the runway, V along the cargo aprons 2, 4 and 5; **S1-S10** link them to the runway (S3 / S4 rapid exits landing 26L, S6 landing 08R), **Y** links T and V |
| **Z1-Z5** | Taxilanes of apron 4 (DHL hub), each with an orange and a blue guide line (Z1.1 / Z1.2 ...) |
| **F** | Apron 3 north of the terminal |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 101-111 | Apron 1, airliners up to 36 m, taxi in from L, taxi out onto N |
| 112-121, 137-143 | Apron 1, business jets |
| 126-136 | Apron 1, jetway stands at the terminal, up to 52 m, pushback onto N |
| 201-222 | Apron 2, cargo outside the DHL network, up to 65 m |
| 301-308 | Apron 3, large freighters, up to 80 m |
| 401-487 | Apron 4, the DHL hub, bays A-E (36-80 m) |
| 501-506 | Apron 5, cargo, up to 65 m |

## Procedures

- **Runway assignment** (VATSIM): departures from aprons 1 and 3 use the northern runway, from aprons 2, 4 and 5 the southern one; A340-600, B777 and B747 always the southern one. Arrivals land on the runway of their stand; Approach uses the other one when its final is full. The SID letter names the runway: **N** 26R, **S** 26L, **Q** 08L, **E** 08R.
- **Direction 26**: departures from apron 1 taxi east on N, over E7 / E8 to C and east to A9 / A8; from apron 4 east on V / T to S10. Arrivals 26R vacate at A4 or A3 and taxi via W1 to apron 1; arrivals 26L vacate at S4 / S3 and taxi east on V to apron 4.
- **Direction 08**: departures from apron 1 taxi west on N to W1 and A1; from apron 4 west on T to S1. Arrivals 08L vacate at A6 / A7 and come back over E7 / E8; arrivals 08R vacate at S6 - S8.
- Arrivals to the other side of the airport cross the other runway (`cross runway 26L`), only when that runway is free.
- SIDs climb to **FL70**: PENEM (north) and ORTAG (west) - Muenchen Radar 126.065; NEVKO (south-west), GOLAT (south) and DRN (Dresden, east) - Muenchen Radar South 126.175. The numbers change with the AIRAC cycle.

## Traffic

The DHL hub: European Air Transport (the hub airline: A300, B757, B767, A330), DHL Air UK, AeroLogic (B777F), ASL Ireland and Star Air for the network, Kalitta, Atlas, Polar and MNG for the long-haul and partner cargo; passenger flights by Eurowings, Ryanair, Condor, SunExpress, Corendon, Pegasus, Lufthansa, Austrian, Turkish Airlines, Sundair and business jets. Shares are estimates.
