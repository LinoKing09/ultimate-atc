[Documentation](../README.md) › [Airports](README.md) › TNCM

# TNCM - St. Maarten

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | TNCM / SXM (Princess Juliana International Airport)                         |
| Location           | Simpson Bay, Sint Maarten (San Juan FIR, TJZS)                              |
| Reference point    | 18°02'27"N 063°06'32"W (eAIP AD 2.2)                                        |
| Elevation          | 14 ft; threshold 10 12 ft, threshold 28 9 ft                                |
| Magnetic variation | 14° W                                                                       |
| Runway             | **10/28**, 2300 m x 45 m, true bearing 082° / 262°; threshold 10 **displaced 100 m** |
| Data files         | [`src/data/airports/tncm.ts`](../../src/data/airports/tncm.ts), layout [`tncm.layout.ts`](../../src/data/airports/tncm.layout.ts) (generated) |

The airport of the low landings over Maho Beach. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `tncm.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, aprons, stand lead-in lines, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway, displaced threshold, declared distances, the **remaining runway from each taxiway**, taxiway designators and widths, apron strengths, the **stand coordinates**, frequencies, the SIDs and departure rules | Dutch Caribbean eAIP AD 2 TNCM (AIRAC AMDT 03-26) with its aerodrome chart and parking / docking charts (DC-ANSP), used as a reference only: facts digitised by hand, no chart content copied |
| Traffic | Princess Juliana International Airport route network (Wikipedia); operator shares are estimates |

**Simplified, estimated or not modelled:**

- **no parallel taxiway**: A-F lead from the aprons on the north side straight to the runway, each joining it with two fillets. The simulator uses the eastern fillet (towards the take-off direction of runway 10, and the one a westbound aircraft turns into), the western one is drawn,
- the **holding points** are not in OpenStreetMap (except C): they are put on the taxiways 77-92 m from the runway centre line, before the fork into the fillets,
- the **stand sizes** are not published: estimated from the apron strengths of AD 2.8 (Apron A and B2 / B3 wide-bodies up to 65 m, B1 52 m, B4 / B5 36 m, Apron C 25 m, Apron E 30 m),
- the AIP coordinates of **B4, B5 and C1-C6** lie on or next to the apron lane (68 m and about 20 m from the stand markings - the lead-in points, it seems); the OpenStreetMap positions are used there. **A3** is led in from the A apron lane below it (OpenStreetMap: from a short link south of it),
- the southern lane of Apron C, Apron E and the taxiways D and E are limited to 36 m wingspan in the simulator: the larger aircraft use A, B and C,
- **runway 28 departures** enter at E, D or C and **backtrack** to the runway end (the light turboprops need no backtrack: 962 m remain from E); **runway 10 arrivals** roll to the end, turn around and backtrack to E, D or C. Runway 28 has a visual approach only (flown as RNP here),
- **runway 28 has no SID**: the AIP gives "a clearance to intercept the initial route" - in the simulator **radar vectors**,
- **F** (F apron), **G1, G2** (G apron), **H** (helicopter stands), the **West apron** and the turning loops at both runway ends are drawn, not used: general aviation is not simulated,
- the right turn after take-off on runway 10 and the circuit directions are not modelled,
- traffic: estimated operator shares (Winair about a third), 45 % of Stuttgart's movements per density step (`rateFactor` 0.45).

**Never use this simulator for real-world navigation.**

## Runway and approaches

| Runway | TORA / TODA / ASDA / LDA (m) | Entries (remaining runway) | Approaches |
| ------ | ---------------------------- | -------------------------- | ---------- |
| 10 | 2300 / 2360 / 2300 / 2200 | A (2300), B (1968), C (1576), D (1432), E (1258) | RNAV (GNSS), VOR - over Maho Beach |
| 28 | 2200 / 2260 / 2200 / 2200 | E (962), D (785), C (651) - with a backtrack to the runway end | visual |

The trade wind blows from the east: runway 10 is in use almost all the time.

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Delivery | Juliana Delivery | 121.650 |
| Tower (also taxiing - there is no Ground) | Juliana Tower | 118.700 |
| Approach | Juliana Approach | 128.950 |
| ATIS | Juliana | 127.650 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **A** | West end: from the B apron to the start of the take-off run 10; 16.5 m |
| **B** | From the A and B aprons to the runway; 32 m |
| **C** | From the A apron and the west end of Apron C to the runway; 27.5 m |
| **D, E** | From Aprons C and E to the runway; 18 m and 21.5 m |
| **F, G1, G2, H** | To the F, G and H aprons (general aviation, helicopters) - drawn |

| Stands | Use in the simulator |
| ------ | -------------------- |
| A1-A4 | Apron A at the terminal: wide-bodies (A4 code D) |
| B1-B5 | Apron B: B2 / B3 wide-bodies, B1 code D, B4 / B5 narrow-bodies |
| C1-C10 | Apron C: regional turboprops (Winair) |
| C11, C12 | Apron E: regional turboprops |

## Procedures

- **Clearances** (Delivery): runway 10 - jets "MODOR2 departure", turboprops "BOPAT2 departure" (AIP AD 2.22); runway 28 - "cleared to Miami, radar vectors, flight planned route, climb 5000 feet". Delivery then hands the crews to the **Tower** ("contact Tower").
- **Runway 10**: departures taxi to A (full length) or an intersection; arrivals roll to the end, turn right and backtrack: "backtrack, vacate via E".
- **Runway 28**: "backtrack runway 28, line up and wait" from E, D or C; arrivals vacate at E, D, C, B or at the end via A.
- The runway is occupied for a long time by every backtrack - leave space between the landings.
