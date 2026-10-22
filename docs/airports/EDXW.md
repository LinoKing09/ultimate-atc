# EDXW - Sylt

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDXW / GWT (Sylt Airport, Westerland)                                       |
| Location           | Westerland, Sylt, Schleswig-Holstein, Germany                               |
| Reference point    | 54°54'41.89"N 008°20'32.59"E (AIP: on the 14/32 centre line, 180 m SSE of the runway intersection) |
| Elevation          | 52 ft (AIP)                                                                 |
| Magnetic variation | 3.9° E (World Magnetic Model, 2026)                                         |
| Transition altitude | 5000 ft; initial climb of the SIDs 4000 ft                                 |
| Runways            | **14/32**, 2120 m x 45 m, true heading 144.5° / 324.5° (all simulated traffic); **06/24**, 1696 m x 45 m, true heading 059.7° / 239.7° (unlit, no instrument procedures; not used - crossed by departures 32) |
| Data files         | [`src/data/airports/edxw.ts`](../../src/data/airports/edxw.ts), layout [`edxw.layout.ts`](../../src/data/airports/edxw.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `edxw.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, holding points, aprons, buildings, stands 01-03 | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway thresholds and elevations, aerodrome elevation and reference point, declared distances, intersection take-off distances, approaches per runway, taxiway widths, surfaces and weight limits, parking rules | DFS AIP Germany AD 2 EDXW (AIRAC 2026OCT01) and its aerodrome chart AD 2 EDXW 2-5 (AMDT 06/26), used as a reference only: facts digitised by hand, no chart content copied |
| Taxiway names L1 / L3, the closed parts (X on the chart) and the former runway | Aerodrome chart (as above); what OSM does not have - G along the east side, the G links into the 24 end and to runway 14/32 at the glide path antenna, E south of runway 06/24, the former runway (80 m wide) with the links around it, the stub west of D and the turning pad at A - is digitised by hand from the chart, georeferenced on the four runway ends (approximate, about 5 m) |
| Frequencies, SIDs, runway use, stands | VATSIM Germany Sylt SOP (facts only; a simulation resource, not an official source); frequencies checked against the VATSIM Germany station data and vATIS profile, the SIDs and their initial climb (4000 ft) against the VATSIM Germany vSID configuration and the AIP SID charts (2026-10-21) |
| Magnetic variation | NOAA World Magnetic Model (October 2026); the AIP gives 3.5° E (2023.11) + 0.2° per year |

**Simplified or not modelled:**

- runway 06/24 is not used for take-offs and landings and not as a taxiway; departures 32 cross it near the 06 end between D2 and A2 (D meets it about 190 m, A about 130 m from threshold 06; the simulator joins both at one runway point). D2 and A2 are simulator names,
- business jets below 19 m wingspan reach Apron 2 via the grass taxiway I (AIP: 2 t; per the VATSIM SOP real jets taxi on runway 06/24 to M / P) - larger ones park on **Apron 3** as the AIP requires (general aviation from 15 t or 19 m wingspan),
- the positions G1-G4 (Apron 2) and N1-N3 (Apron 3) are simulator stands (the aprons have no published stands); stands 01-03 on Apron 1 follow the apron markings approximately,
- light aircraft are not simulated: taxiway B (5.7 t; intersection take-off 32 from B 1826 m), I (2 t, grass), Apron 4 (5.7 t), the lanes of Apron 2 west and the track to the glider site are limited accordingly,
- the paved area at the 14 end between D, L and F and the links at the 06 end between D, M, P and A lie inside the runway strips: they are drawn, but taxi routes use the holding points,
- in reality Bremen Radar gives the IFR clearances; in the simulator (as on VATSIM) Sylt Tower does,
- the ATIS is called `Sylt Information` (VATSIM); the AIP call sign is `SYLT ATIS`,
- SIDs: one per runway (OLDIP1A for 14, OLDIP1B for 32), the numbers change with the AIRAC cycle,
- traffic: estimated operator shares, about a quarter of Stuttgart's movements per density step (`rateFactor` 0.25).

**Never use this simulator for real-world navigation.**

## Runways and approaches

| Runway | True heading | TORA / TODA / ASDA / LDA (m) | Intersection take-off | Approaches |
| ------ | -----------: | ---------------------------- | --------------------- | ---------- |
| 14 | 144.5° | 2120 / 2180 / 2152 / 2120 | C: 1748 | **RNP** only (LPV, GPA 3.0°) - no ILS |
| 32 | 324.5° | 2120 / 2180 / 2152 / 2120 | B: 1826 (5.7 t) | **ILS CAT I** (GP 3.0°), RNP |
| 06 / 24 | 59.7° / 239.7° | 1696 each | - | none (unlit, PCN 35) |

The simulator flies runway 14 arrivals as `RNP approach runway 14` whatever the ILS switches in the systems window say; Approach spaces them like non-precision approaches. Elevations: aerodrome 52 ft, thresholds 14: 32 ft, 32: 31 ft, 06: 29 ft, 24: 52 ft.

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Tower (also ground movements and clearances) | Sylt Tower | 119.750 |
| Approach | Bremen Radar | 124.075 |
| ATIS | Sylt Information | 118.400 |

Sylt has no Ground or Delivery position: you play **Sylt Tower** for everything on the ground and the runway.

## Layout

All taxiways of the aerodrome chart (AIP AD 2.8: 15 m wide, C 12 m; I grass):

| Taxiway | Description |
| ------- | ----------- |
| **D** | From Apron 1 (terminal) north to the 14 end of runway 14/32, and south to runway 06/24 (holding point D2) |
| **C** | Short connector from D to runway 14/32 near the 14 end (intersection departures 14, exit 32) |
| **A** | From runway 06/24 near the 06 end (holding point A2) the long way round the south of the airfield to the 32 end of runway 14/32 |
| **B** | From A to runway 14/32 near the 32 end; 5.7 t (light aircraft) |
| **L** | From the 14 end (holding point L, opposite D) east past Apron 3 to Apron 4; L1 leads into Apron 3, L3 along its east side |
| **F, E** | F from L round the north of the airfield to the 24 end of runway 06/24 (holding point F); E from F to runway 06/24 a little before |
| **G** | From the 32 end (holding point G) north-east to the track to the glider site; the rest of G (along the east side to the 24 end, and the link west to runway 14/32 at the glide path antenna) is closed (crosses) |
| Former runway | An 80 m wide paved band from D / C across runway 14/32 to the east, closed east of 14/32 (crosses) like E south of runway 06/24, the narrow links and the loop around it and the link from A along runway 06/24; C runs on its western part. Drawn only |
| **I, M, P** | To Apron 2 (general aviation) in the west: I (grass, 2 t) from D; M and P from Apron 2 to runway 06/24 at its 06 end (holding points M and P - hot spot "holding points! Runway ahead!") |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 01-03 | Apron 1 at the terminal, airliners up to code C, taxi in and out along D |
| G1-G4 | Apron 2, business jets below 19 m wingspan, taxi in and out along P |
| N1-N3 | Apron 3 (hangar 74), business jets from 19 m (up to 32 m), in from L1, out onto L3 |

## Procedures

- **Runway 32** (preferred with the prevailing westerly winds, ILS): departures taxi via D, **cross runway 24** (D2 / A2) and follow A to the 32 end (`taxi to holding point A via D, A, cross runway 24`); from Apron 3 they first cross runway 14/32 at its 14 end (L to D). Arrivals vacate at the end via C or D (west: Apron 1 / 2) or L (north: Apron 3).
- **Runway 14** (RNP approach): departures from D or L (full length) or C (intersection, 1748 m). Arrivals vacate to the right at the end via A and taxi back via A, across runway 06/24, and D.
- One SID per runway, initial climb 4000 ft: space departures at least 5 NM (2 minutes).
- Arrivals vacate only at the far end and occupy the runway for long: Approach spaces them at least **6 NM** (`arrivalSpacingNm`).
- With only three airliner stands, the last free stand is kept for arrivals (`standReserve` 1): Approach releases an arrival only when a stand is free for it.

## Traffic

Lufthansa (Frankfurt, Munich), Lufthansa CityLine, Eurowings, Swiss (summer) and a large share of business jets; shares are estimates.
