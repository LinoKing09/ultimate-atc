[Documentation](../README.md) › [Airports](README.md) › KSAN

# KSAN - San Diego

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | KSAN / SAN (San Diego International Airport, Lindbergh Field)               |
| Location           | San Diego, California, United States (Los Angeles ARTCC, KZLA)               |
| Elevation          | 17 ft                                                                       |
| Magnetic variation | 11° E                                                                       |
| Transition altitude | 18000 ft (US); initial altitude of the SIDs 5000 ft                        |
| Runway             | **9/27**, 2865 m x 61 m (9401 ft x 200 ft), both thresholds displaced (9: 1000 ft, 27: 1810 ft) |
| Phraseology        | **FAA** (US), see [phraseology](../phraseology.md#faa-phraseology-us-airports) |
| Data files         | [`src/data/airports/ksan.ts`](../../src/data/airports/ksan.ts), layout [`ksan.layout.ts`](../../src/data/airports/ksan.layout.ts) (generated) |

The first airport outside Europe. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `ksan.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, holding positions, aprons, buildings, stand lead-in lines (Terminal 2, west remote, north apron) | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway, displaced thresholds, declared distances, elevation, frequencies, approaches | FAA Chart Supplement and the FAA airport diagram, used as a reference only: facts digitised by hand, no chart content copied |
| Facility name "Lindbergh", runway use, SID assignment, intersection distances, initial altitude | VATSIM Los Angeles ARTCC San Diego Tower SOP (facts only; a simulation resource, not an official source) |
| Traffic | San Diego International Airport route network 2026 (Wikipedia), FAA traffic counts (about 600 movements a day); operator shares are estimates |

**Simplified or not modelled:**

- **Terminal 1** (opened 2025) has no parking positions in OpenStreetMap yet: ten gates (1-10) are placed 41 m apart along its airside front, pushback onto taxiway A - numbering and positions **approximate**,
- the cargo ramp and the general aviation (FBO) aprons on the north side are drawn but have no parking positions; cargo flights and business jets park on the north apron (N1-N10),
- Terminal 2 East gates 28 and 32 lie one behind the other on fanned OpenStreetMap lead-in lines: a parked aircraft on one blocks the way into the other,
- departures 9 from B10 and B9 are both treated as full length (TORA 2524 m, Chart Supplement 8280 ft),
- **taxi flows** (a simulator convention, not published): west traffic - departures east on B and C; east traffic west on both; A is used both ways,
- no noise curfew (in reality no take-offs between 23:30 and 06:30 local), no departure clearance times (EDCT) beyond the random slots of the simulator, no SoCal TRACON coordination,
- traffic: estimated operator shares (Southwest about 38 %).

**Never use this simulator for real-world navigation.**

## Runways and approaches

| Runway | Take-off run (m) | Landing distance (m) | Intersection take-offs | Approaches |
| ------ | ---------------: | -------------------: | ---------------------- | ---------- |
| 27 | 2865 (B1, C1) | 2313 | C2 2679, C3 2167, B2 2110\*, C4 / B4 1935 | LOC, RNAV - **no ILS**, over downtown |
| 9 | 2524 (B10, B9) | 2560 | B8 2265, B7 1928, B6 1585, B5 / C5 1300\* | ILS, LOC, RNAV |

\* not in the intersection table: measured on the map. C2 and C3 point east, away from runway 27: departures there roll a little east and turn around on the runway.

West traffic (27) is used most of the time; east traffic (9) only with more than 10 kt tailwind on 27 (about 8 % of the sessions).

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Clearance Delivery | Lindbergh Clearance Delivery | 125.900 |
| Ground | Lindbergh Ground | 123.900 |
| Tower | Lindbergh Tower | 118.300 |
| Departure | SoCal Departure | 125.150 (ZZOOO), 119.600 (PADRZ), 124.350 (runway 9) |
| ATIS | San Diego International | 134.800 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **B** | Along the south side of the runway, from B1 (27 end) to B10 (9 end); the terminals lie south of it |
| **C** | Along the north side of the runway, from C1 to C6; the north apron and the cargo ramp lie north of it |
| **A** | South of B in front of Terminal 1, with A3-A7 to B |
| **B1-B10, C1-C6** | Connectors to the runway, named like their holding positions: `hold short of runway 27 at B4`. B4 / C4 and B6 / C6 are crossings |
| **D, F, H, J** | North side: to the cargo and general aviation ramps |
| **P, X** | Terminal 2 West and the west remote positions |

| Stands | Use in the simulator |
| ------ | -------------------- |
| Terminal 1: 1-10 | Narrow-bodies (approximate) |
| Terminal 2 East: 20-32 | Narrow-bodies |
| Terminal 2 West: 33-51, 50A | Narrow-bodies, 40-43 regional jets, **48** and **51** wide-bodies (international) |
| West remote: 11-14, W2-W4 | Remote; W2 / W3 up to 52 m, **W4** wide-bodies |
| North apron: N1-N10 | N1-N5 business jets, N6-N10 cargo (N7-N10 up to 52 m) |

Wide-bodies (B787 to London, A350 to Frankfurt, Hawaiian A330, cargo B767) have only three stands that take them: with a large share of heavies, the generator makes a normal flight while none is free.

## Procedures

- **Clearances:** "cleared to ... airport, PADRZ2 departure, then as filed, climb via SID except maintain 5000, departure frequency 125.15, squawk 1234". Pre-departure clearances (PDC) by datalink like the DCL elsewhere. There is no start-up approval: when ready, the crew asks Delivery for the Ground frequency and calls Ground "ready to push".
- **SIDs:** runway 27 **PADRZ2** (north, west; departure 119.6) or **ZZOOO4** (east, south; 125.15); runway 9 **ECHHO2** (north-west), **MMOTO2** (oceanic) or **SAYOW2** (east), all 124.35.
- **Taxi:** "runway 27, taxi via B" - the runway is the clearance limit; departures 27 to B1 (south side) or C1 (north apron), departures 9 to B10 / B9.
- **Arrivals 27** vacate to the south at B5-B10 (Terminal 2 at the west end, Terminal 1 via A) or to the north at C5 / C6 (north apron, crossing back at B6 / C6 for the terminals). Crews report "clear of runway 27 at B5".
