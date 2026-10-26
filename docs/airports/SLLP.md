[Documentation](../README.md) › [Airports](README.md) › SLLP

# SLLP - La Paz

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | SLLP / LPB (El Alto International Airport)                                  |
| Location           | El Alto, La Paz, Bolivia (La Paz FIR, SLLF)                                 |
| Reference point    | 16°30'45"S 068°11'32"W (AIP AD 2.2)                                         |
| Elevation          | **13314 ft** (4058 m); threshold 10 13110 ft, threshold 28 13314 ft          |
| Magnetic variation | 7° W (AIP, 2015)                                                            |
| Transition altitude | 18000 ft; initial climb 17000 ft in the simulator                          |
| Runway             | **10/28**, 4000 m x 46 m, true bearing 091° / 272°, slope 1.55 %, no displaced thresholds |
| Data files         | [`src/data/airports/sllp.ts`](../../src/data/airports/sllp.ts), layout [`sllp.layout.ts`](../../src/data/airports/sllp.layout.ts) (generated) |

The highest airport in the simulator. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `sllp.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, apron, stands with their lead-in lines, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway, thresholds and elevations, declared distances, taxiway designators and widths, frequencies, ILS, the turning area at threshold 10, the SIDs (AD 2.24) and their end fixes (area chart of the departure routes) | AIP Bolivia AD 2 SLLP - an **older edition** (magnetic variation 2015, AASANA still named), as published by [IVAO Bolivia](https://bo.ivao.aero/) for simulation. The current AIP of NAABOL needs a login. Used as a reference only: facts digitised by hand, no chart content copied |
| Traffic | El Alto International Airport route network (Wikipedia); operator shares are estimates |

**Simplified, estimated or not modelled:**

- the AIP names the taxiways **A, B and C**; OpenStreetMap names A and B, and the chart copy has lost its labels: **C could not be placed**. The unnamed link from B to the north-east is drawn,
- the **stand sizes** are not published: estimated from the spacing of the stands (1, 6, 7 up to 52 m, 2-5 up to 36 m); the other positions OpenStreetMap maps (auxiliary, presidential and air force aprons north of the main apron) are drawn, not used,
- **no parallel taxiway**: departures 10 enter at A and backtrack 2.8 km to the turning area at threshold 10 (1230 m remain from A without it, measured on the map); arrivals 28 turn around on the runway and backtrack to A,
- arrivals 10 roll uphill to the end and vacate via B (a simulator convention: vacating at A they would meet the departures backtracking from A head-on),
- the SIDs are planned by the direction of the destination (sectors halfway between the bearings of the end fixes); where two versions exist (ELAKO 6 / 7, KOMPA 6 / 7, ELAMU 1 / 2) both are offered; the SID versions are those of the older AIP edition,
- the thin air does not lengthen the take-off runs or landing rolls in the simulator; runway 28 has a visual approach only (flown as RNP here),
- traffic: estimated operator shares (Boliviana de Aviación about two thirds), 30 % of Stuttgart's movements per density step (`rateFactor` 0.3).

**Never use this simulator for real-world navigation.**

## Runway and approaches

| Runway | TORA / TODA / ASDA / LDA (m) | Entry | Approaches |
| ------ | ---------------------------- | ----- | ---------- |
| 10 | 4000 / 4250 / 4000 / 4000 | A, with a backtrack to the threshold | ILS CAT I (glide path 2.4°), VOR, NDB |
| 28 | 4000 / 4400 / 4000 / 4000 | B (east end) | visual |

Runway 10 rises 1.55 % towards the east: departures on 28 run downhill, landings on 10 uphill. Piston aircraft may not take off on runway 10 (AIP).

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Ground (gives the clearances, no Delivery) | La Paz Ground | 121.900 |
| Tower | La Paz Tower | 118.300 |
| Approach | La Paz Approach | 119.500 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **A** | From the main apron diagonally to the runway, 1230 m from the east end; 23 m |
| **B** | From the main apron to the east end of the runway (threshold 28); 23 m |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 1-7 | Main apron at the terminal |

## Procedures

- **Clearances** (Ground): "cleared to Santa Cruz, TERAX1 departure, flight planned route, climb via SID to 17000 feet, squawk ...". SIDs: ELAMU (north), RENEP, REDIR, SALKO, KIGAX (north-east, runway 28 only), TERAX, DAKOG, UREMA (east), ARPIS, LONAB (south-east), IROBO (south), TEGUM, KOVIS (south-west), KOMPA (west), ELAKO (north-west, Peru), KIBUX (north).
- **Runway 28**: departures from B; arrivals roll west, turn around and backtrack to A: "backtrack, vacate via A".
- **Runway 10**: "backtrack runway 10, line up and wait" from A; arrivals vacate via B.
