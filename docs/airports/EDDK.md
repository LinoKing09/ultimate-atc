[Documentation](../README.md) › [Airports](README.md) › EDDK

# EDDK - Cologne/Bonn

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDK / CGN (Köln/Bonn Airport "Konrad Adenauer")                            |
| Location           | Cologne, North Rhine-Westphalia, Germany                                    |
| Reference point    | 50°51'57.30"N 007°08'33.88"E (AIP: 4 m north of the 06/24 centre line, 1469 m from threshold 06) |
| Elevation          | 300 ft (AIP)                                                                |
| Magnetic variation | 3.7° E (AIP: 3.2° E 2024.04, +0.2° per year)                                |
| Transition altitude | 5000 ft; initial climb of the SIDs 5000 ft                                 |
| Runways            | **13L/31R**, 3815 m x 60 m, true heading 137.5° / 317.5° (all simulated traffic); **06/24**, 2459 m x 45 m, true heading 064.4° / 244.4°, and **13R/31L**, 1863 m x 45 m (code C) - drawn and crossed, not used for take-offs and landings. Renamed from 14/32 for the magnetic variation |
| Data files         | [`src/data/airports/eddk.ts`](../../src/data/airports/eddk.ts), layout [`eddk.layout.ts`](../../src/data/airports/eddk.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `eddk.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, holding points, aprons, buildings, stand lead-in lines | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway thresholds and elevations, aerodrome elevation, reference point and magnetic variation, declared distances and intersection take-off distances, stand positions (AD 2.8 checkpoints of aprons A-F and W), taxiway names, widths and limits, hot spots | DFS AIP Germany AD 2 EDDK (AIRAC 2026OCT01) with its aerodrome and ground movement charts, used as a reference only: facts digitised by hand, no chart content copied |
| Frequencies, SIDs, runway use, taxi flows, stand sizes and stand use | VATSIM Germany Köln/Bonn SOP and stand data (facts only; a simulation resource, not an official source), checked against AIP AD 2.18 and the AIP SID charts |
| Traffic | Cologne/Bonn Airport route network 2026 (Wikipedia), ADV statistics (116,000 movements and 842,000 t freight in 2025); operator shares and the cargo share (about a quarter of the movements) are estimates |

**Simplified or not modelled:**

- all take-offs and landings use runway **13L/31R** (as on a normal VATSIM day); 06/24 and 13R/31L are only crossed - departures 31R and arrivals vacating 13L at A2 / A1 cross runway 06/24 on A next to the reference point (holding points AN / AS, hot spot 1),
- the holding points carry the names of their taxiways as on VATSIM (the charts give no designators); AN / AS (A north / south of runway 06/24) are simulator names; the CAT II/III holding positions are not modelled separately,
- **apron U** (maintenance; general aviation parks there too): U10-U26 at their AIP AD 2.8 positions (U10-U14 up to code C, U16-U26 code A), reached across runway 13R/31L at B (holding points B north and P south - no designators on the charts) and along P; the lead-in lines of U10, U12 and U14 leave P where the ground movement chart shows them (digitised by hand). Business jets (registration callsigns) park there,
- the military area south-west of runway 13R/31L (C, Z1, the MIL ramps; only with prior agreement with the Bundeswehr), P beyond apron U to the 06 end, taxiway D east of runway 13L/31R to the 24 end with apron L (the dispersal pads there), and the taxilanes K1-K3 of apron V are drawn but not used: the ground movement chart shows apron V under construction with all parking positions removed. OSM still calls P "B",
- GAT 3 (light aircraft parking G01 / G02 by B) is drawn; light aircraft are not simulated,
- the blue and orange guide lines on M and TXL-N (two aircraft up to 36 m side by side) are taxiways of their own in the simulator (M BLUE, M ORANGE, N BLUE, N ORANGE): blue outbound, orange inbound (a simulator flow, not a published rule); the yellow centre lines are M and N,
- stand sizes follow the VATSIM Germany stand data (code C 36 m, D 52 m, E 65 m, F 80 m); A25-A35 (odd) are nose-out positions (the AIP checkpoint is taken as the nose wheel stop position facing L, the aircraft stands 15 m behind it); aprons E and F (cargo hub) and W (cargo feeders) take the freighters first, the B747-8 only fits E and F,
- taxi-in behind a follow-me car (AIP) and de-icing on the stand are not enforced,
- the airport is open 24 hours; the night rules of AIP AD 2.20 (noisy aircraft, runways 13R/31L, 06 and 24, intersection take-offs only from A5 / A1) are not modelled,
- no military, general aviation or light aircraft traffic,
- traffic: about the volume of Stuttgart per density step (`rateFactor` 1), a quarter of it cargo.

**Never use this simulator for real-world navigation.**

## Runways and approaches

| Runway | True heading | TORA / TODA / ASDA / LDA (m) | Intersection take-offs | Approaches |
| ------ | -----------: | ---------------------------- | ---------------------- | ---------- |
| 13L | 137.5° | 3815 / 3875 / 3815 / 3815 | A5: 3587, A4: 2743, A3: 2121 | ILS CAT II/III, LOC, RNP |
| 31R | 317.5° | 3815 / 3875 / 3815 / 3815 | A1: 3586, A2: 2562, A3: 1781 | ILS CAT II/III, LOC, RNP |
| 06 / 24 | 64.4° / 244.4° | 2459 each | (06 from T 1625, 24 from E 1643 / A 1526) | 06: RNP; 24: ILS, LOC, RNP |
| 13R / 31L | 137.5° / 317.5° | 1863 each | (13R from T2 1354) | RNP (code C) |

Elevations: aerodrome 300 ft, thresholds 13L: 229 ft, 31R: 300 ft, 06: 229 ft, 24: 271 ft, 13R: 220 ft, 31L: 258 ft. Runway 31R is preferred (up to 5 kt tailwind, VATSIM SOP).

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Delivery | Koeln/Bonn Delivery | 121.855 |
| Ground | Koeln/Bonn Ground | 121.730 |
| Tower | Koeln/Bonn Tower | 124.980 |
| Approach | Langen Radar | 135.350 |
| ATIS | Koeln/Bonn Information | 132.130 |

## Layout

All civil aprons lie between the two parallel runways, north of runway 06/24:

| Taxiway | Description |
| ------- | ----------- |
| **A** | The main parallel taxiway south-west of 13L/31R: from the B / M junction at the C pier along aprons E and F, across runway 06/24 next to the reference point (AN / AS, hot spot 1), to the 31R end (holding point A) |
| **E** | Second parallel between A and the runway, from A5 / A7 to runway 06/24 |
| **A1-A5, A7** | Links to runway 13L/31R: A7 and A5 at the 13L end, A1 at the 31R end; A2 (rapid exit landing 13L), A3 (rapid exit landing 31R, hot spot 2) and A4 in between |
| **M** | From A7 / A to Terminal 2, with a yellow centre line (all sizes) and the blue and orange guide lines **M BLUE** / **M ORANGE** (up to 36 m) |
| **N** (TXL-N) | Taxilane of apron D (Terminal 2): centre line N and the guide lines **N BLUE** / **N ORANGE** (up to 36 m) |
| **L** (TXL-L), **S** (TXL-S) | Taxilanes of apron A (Terminal 1) and apron C (C pier, code C) |
| **B** | From aprons A / B over the taxiway bridge (up to 52 m) to T and the 13R end; code E |
| **T**, **T2**, **D** | T along the north side of 13R/31L (code E), T2 to 13R/31L (code C), D along runway 06/24 past apron W to A |
| **P** | From the B crossing of 13R/31L south along apron U (used), on to the 06 end (drawn) |
| C, Z1, K1-K3 | The military area south-west of 13R/31L and apron V - drawn only |

| Stands | Use in the simulator |
| ------ | -------------------- |
| A01-A35 (27) | Apron A, Terminal 1; up to 36 m, A01-A07, A11, A17, A21 and A23 up to 65 m; A25-A35 (odd) nose-out |
| B10-B30 (17) | Apron B, Terminal 1; 36-65 m (B11, B17, B21, B23 up to 65 m) |
| C01-C14, C50 (10) | Apron C, the C pier; up to 36 m, C50 up to 65 m |
| D10-D64 (32) | Apron D, Terminal 2, along N, N BLUE and N ORANGE; mostly up to 36 m, D15, D19, D23 up to 65 m |
| E09-E46 (27), F17-F34 (12) | Cargo aprons along A (UPS, FedEx, DHL); 36-80 m - the B747-8 (68.4 m) only here |
| W10-W34 (13) | Apron W along D (cargo feeders); up to 52 m |

## Procedures

- **Runway 31R** (preferred): departures taxi south on **A**, **cross runway 24** at AN / AS (`cross runway 24`) and line up at **A** (3815 m) or **A1** (3586 m); intersections A2 and A3. Arrivals vacate at **A3** (rapid exit), A4, A5 or A7 and taxi north on **E**: the flow is A outbound (south-east), E inbound (north-west).
- **Runway 13L**: departures line up at **A7** (3815 m) or A5, A4, A3. Arrivals vacate at **A2** (rapid exit), A1 or A at the end and taxi north-west on A, across runway 06/24.
- Terminal 2: outbound on **N BLUE / M BLUE**, inbound on **N ORANGE / M ORANGE** (`taxi to runway 13L via november blue, mike blue`); aircraft of 36 m and more use the centre lines N and M (automatic routes of smaller aircraft keep to the guide lines and use the centre lines only for short links).
- SIDs climb to 5000 ft: WIPUR (north), PODIP (north-east), KUMIK (east, also the south-bound traffic), NVO (west); COL only for Frankfurt. Runway 13L: the F SIDs; runway 31R: R for aircraft up to 98 t, B for heavier ones (filed for the long-haul freighters). The numbers change with the AIRAC cycle.
- A-CDM (TSAT / TOBT) and datalink clearances (DCL) as on VATSIM.

## Traffic

Eurowings (the home carrier), Ryanair, Corendon, Pegasus, SunExpress, Turkish Airlines, Lufthansa, Austrian, Wizz Air, British Airways and Condor; cargo: UPS (European hub: B747-8, B747-400, B767, A300, B757), FedEx (B777F, B767) and DHL / European Air Transport (A300, B757). Shares are estimates.
