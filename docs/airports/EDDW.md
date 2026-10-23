[Documentation](../README.md) › [Airports](README.md) › EDDW

# EDDW - Bremen

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDW / BRE (Bremen Airport "Hans Koschnick")                                |
| Location           | Bremen, Germany                                                             |
| Reference point    | 53°02'50.64"N 008°47'12.29"E (AIP: 35 m north of the runway, near taxiway C) |
| Elevation          | 14 ft (AIP)                                                                 |
| Magnetic variation | 3.9° E (AIP, 2026.10)                                                       |
| Transition altitude | 5000 ft; initial climb of the SIDs 4000 ft                                 |
| Runways            | **08/26**, 2040 m x 45 m, true heading 087.8° / 267.8° (renamed from 09/27); **23**, 700 m x 23 m (light aircraft, take-off only - drawn, not used) |
| Data files         | [`src/data/airports/eddw.ts`](../../src/data/airports/eddw.ts), layout [`eddw.layout.ts`](../../src/data/airports/eddw.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `eddw.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, holding points, aprons, buildings, stand lead-in lines, the paved areas beyond the thresholds, runway 23 | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway thresholds and elevations, aerodrome elevation, reference point and magnetic variation, declared distances and intersection take-off distances, stand positions (AD 2.8 checkpoints), taxiway widths and limits, night rules | DFS AIP Germany AD 2 EDDW (AIRAC 2026OCT01) with its aerodrome and ground movement charts, used as a reference only: facts digitised by hand, no chart content copied |
| Frequencies, SIDs, runway use, stand use, arrival spacing | VATSIM Germany Bremen SOP and station data (facts only; a simulation resource, not an official source), checked against AIP AD 2.18 and the AIP SID charts |
| Traffic | Bremen Airport route network 2026 (Wikipedia), ADV statistics (28,000 movements in 2024); operator shares are estimates |

**Simplified or not modelled:**

- the holding points carry the names of their taxiways (the charts give no designators); departures 26 are cleared via F only up to the CAT II/III holding position (noise rule, AIP AD 2.20) - that is holding point F in the simulator,
- C, D and E meet the runway in a Y: the simulator routes on one fillet of each (C: the eastern one, for departures 08; D and E: the western ones, for exits landing 08 and departures 26) and draws the other one,
- stands 12A and 18A (wide-bodies up to 52 m) are pushback stands here; stands 12-17 are taxi-in / taxi-out stands between N and S (ground movement chart),
- the paved sections beyond both thresholds (stopways, the special take-off runways of the Airbus Beluga), runway 05/23 (700 m, drawn as a runway: VFR take-offs only), the Airbus taxiways F1 / F2, the lanes to the LH parking and the helicopter platform and the inner GA lane of Apron 2 are drawn but not used,
- intersection take-offs 08 from D (808 m) and 26 from C (836 m) are published but not offered (VATSIM SOP),
- Beluga flights, light aircraft, helicopters and the general aviation parking along R are not simulated,
- night rules (AIP AD 2.20): jet take-offs not between 22:30 and 06:00, landings until 22:30 and delayed ones until 24:00 local; the exceptions for quieter aircraft and home carriers are simplified to these times,
- traffic: estimated operator shares, about 40 % of Stuttgart's movements per density step (`rateFactor` 0.4).

**Never use this simulator for real-world navigation.**

## Runways and approaches

| Runway | True heading | TORA / TODA / ASDA / LDA (m) | Intersection take-offs | Approaches |
| ------ | -----------: | ---------------------------- | ---------------------- | ---------- |
| 08 | 087.8° | 2040 / 2100 / 2040 / 2040 | C: 1235 | ILS CAT II/III, LOC, RNP |
| 26 | 267.8° | 2040 / 2100 / 2040 / 2040 | E: 1714, D: 1255 | ILS CAT II/III, LOC, RNP |

Elevations: aerodrome 14 ft, thresholds 08: 13 ft, 26: 14 ft. Westerly winds prevail: runway 26 is in use more often.

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Ground (also IFR clearances) | Bremen Ground | 121.755 |
| Tower | Bremen Tower | 120.330 |
| Approach | Bremen Radar | 124.800 |
| ATIS | Bremen Information | 132.380 |

Bremen has no Delivery: Ground gives the IFR clearances (VATSIM SOP).

## Layout

No full parallel taxiway (AIP AD 2.8: 23 m wide unless noted):

| Taxiway | Description |
| ------- | ----------- |
| **A** | From the north-west corner of Apron 1 (junction of N, S, R and L) south-west to the 08 end - the only way there; exit for jets landing 26 |
| **F** | From the C / G / K junction east along the runway to the 26 end |
| **C** | From the east end of N on Apron 1 south across F to the runway (intersection departures 08); continues south of the runway as M |
| **D, E** | From F to the runway (intersection departures 26, exits landing 08); below 36 m wingspan |
| **G** | From the south end of S diagonally to the C / F / K junction; below 52 m |
| **H** | From the east end of Apron 1 to F; below 36 m |
| **K** | From R (Apron 2) to the C / F / K junction; below 24 m |
| **N** | Taxilane along stands 01-11 (Apron 1); below 52 m |
| **S** | Taxilane south of stands 12-17 to Apron 2 (stands 18, 18A, 19); below 36 m |
| **R** | Taxilane of Apron 2 (general aviation), code B |
| **L** | To Apron 3 (hangars) in the west; up to 31 m |
| **M** | South of the runway to the maintenance area (holding point M); not used by the simulated traffic |
| F1, F2 | To the Airbus factory, Airbus traffic only - drawn |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 01-11 | Apron 1 at the terminal, pushback onto N, up to 36 m |
| 12-17 | Apron 1, taxi in from N, taxi out onto S, up to 36 m; 14-16 also for larger business jets |
| 12A | Apron 1, wide-bodies up to 52 m, pushback onto N |
| 18, 19 | Apron 2, pushback onto S, up to 36 m |
| 18A | Apron 2, wide-bodies up to 52 m, pushback onto the G / S junction |

## Procedures

- **Runway 26** (preferred): departures taxi via N (or S and G, or H) to F and along F to holding point F (`taxi to runway 26`); intersections E (1714 m) and D (1255 m) on request. Jets landing 26 vacate at the end via **A** (C only after coordination) and taxi back along A to the apron.
- **Runway 08**: departures taxi via N or S to the north-west corner and along A to holding point A; intersection C (1235 m). Arrivals vacate at **D** or **E** (below 36 m) or **F** at the end.
- One SID per exit fix and runway, all climbing to 4000 ft (M = runway 08; on 26 the Z variants where they exist, otherwise L): ABDIM and OKWEL (west), WSN (north), GESTO (east), NIE (south-east), WIMCI (south). The numbers change with the AIRAC cycle.
- Approach spaces arrivals at least **6 NM** (`arrivalSpacingNm`, VATSIM SOP target spacing).

## Traffic

Ryanair (the largest operator), Lufthansa and Lufthansa CityLine (Munich), KLM Cityhopper (Amsterdam), Eurowings, Austrian, Swiss, Turkish Airlines, Pegasus, SunExpress, Sundair, Corendon and business jets; shares are estimates.
