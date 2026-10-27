[Documentation](../README.md) › [Airports](README.md) › VTSP

# VTSP - Phuket

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | VTSP / HKT (Phuket International Airport)                                   |
| Location           | Phuket, Thailand (Bangkok FIR, VTBB)                                        |
| Reference point    | 08°06'45"N 098°18'33"E (AIP AD 2.2)                                         |
| Elevation          | 84 ft (AIP); threshold 09 22 ft, threshold 27 84 ft                         |
| Magnetic variation | 0.5° W (AIP, 2025)                                                          |
| Transition altitude | 11000 ft; initial climb of the SIDs 5000 ft                                |
| Runway             | **09/27**, 3000 m x 45 m, true bearing 085° / 265°, **100 m displacement area** before the 27 threshold |
| Data files         | [`src/data/airports/vtsp.ts`](../../src/data/airports/vtsp.ts), layout [`vtsp.layout.ts`](../../src/data/airports/vtsp.layout.ts) (generated) |

The first airport in Asia. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `vtsp.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, holding positions, aprons, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway, thresholds, displacement area, declared distances and the take-off run from G, taxiway designators and widths, the closed taxiways C and D, the **stand coordinates and sizes**, frequencies, ILS, SIDs (designators, end fixes, initial climb), local rules | AIP Thailand AD 2 VTSP (AIRAC 2026-10-01) with its aerodrome chart, aircraft parking / docking chart (stand coordinate table) and SID charts, used as a reference only: facts digitised by hand, no chart content copied |
| Traffic | Phuket International Airport route network 2026 (Wikipedia), AOT traffic statistics (about 280 movements a day); operator shares are estimates |

**Simplified or not modelled:**

- the **stands** are the positions of the AIP table; OpenStreetMap has no lead-in lines there, so each stand's lane node is the nearest point on T1, T2 or P (`snap` in the airport file) - the lead-in lines are straight, the real ones curve,
- the taxilanes **T5, T6 and T7** carry the names of the parking chart (OpenStreetMap calls the X between the two islands T3 / T4 and has no T7); the X is joined where the lanes cross,
- **Apron E** (private jet terminal, stands 51-54) is reached via **K**, across the runway: drawn, not used, like the Royal Thai Navy apron north of the runway; private jets are not simulated,
- **taxi flows** (a simulator convention, not published): the apron lanes are a loop - in on **T2** southbound, round **T7**, out on **T1** northbound - so arrivals and departures do not meet head-on between the stands; P itself is used both ways,
- **arrivals 27** roll on to **A** at the runway end (the aprons are at the west end, and P carries the departures east to J); the rapid exit E and the exit B are not used by the simulated traffic; **arrivals 09** vacate via the **western fillet of F**, G, H or J (the eastern fillet of F would leave them facing away from the aprons),
- intersection departures from **G** (2500 m, AIP AD 2.23), and - without a published distance, measured on the map - from **F** (27, 2060 m) and **B** (09, 2790 m); K is not offered (it belongs to Apron E),
- the lead-in line of **J** sweeps from the runway end onto the centre line 70 m further west: departures 27 line up there (the published 3100 m are kept),
- the hot spots HS 1-3, the turn pad at the 27 threshold and the second fillets of G and H are drawn; low visibility rules on P (hold below 3000 m visibility) are not modelled,
- traffic: estimated operator shares (Thai AirAsia about 30 %), about 90 % of Stuttgart's movements per density step (`rateFactor` 0.9).

**Never use this simulator for real-world navigation.**

## Runway and approaches

| Runway | TORA / TODA / ASDA / LDA (m) | Entries | Approaches |
| ------ | ---------------------------- | ------- | ---------- |
| 09 | 3000 / 3000 / 3000 / 3000 | A (3000), B (2790, measured) | RNP (and VOR) - **no ILS**; approach over the Andaman Sea |
| 27 | 3100 / 3100 / 3100 / 3000 | J (3100, end of the displacement area), H (3000, threshold), G (2500), F (2060, measured) | **ILS** (localizer offset 1.4°, glide path 3.2°), LOC, RNP; approach over the hills |

The south-west monsoon (May-October) brings westerly winds and runway 27, the north-east monsoon easterly winds and runway 09.

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Delivery | Phuket Delivery | 118.550 |
| Ground | Phuket Ground | 121.900 |
| Tower | Phuket Tower | 118.100 |
| Approach | Phuket Approach | 124.700 |
| ATIS | Phuket International | 128.000 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **P** | Parallel taxiway south of the runway (150 m from its centre line), from A in the west to J in the east; 23 m |
| **A** | From the 09 threshold to P and the aprons; runway holding point A (departures 09, exit 27) |
| **B** | From the runway south-west to P and T2 (fillets to both sides of P) |
| **C, D** | South of the runway - **closed** (drawn with crosses) |
| **E** | Rapid exit for runway 27 (not used by the simulated arrivals, see above) |
| **F** | Rapid exit for runway 09, forking to both sides of P behind its holding line |
| **G** | Exit 09; intersection departure 27 (2500 m) |
| **H** | At the 27 threshold: exit 09, departure 27 (3000 m) |
| **J** | At the end of the displacement area: departure 27 full length (3100 m), exit 09 at the end |
| **K** | North of the runway to Apron E - drawn |
| **T1 - T7** | Apron taxilanes: T1 along Apron D, T2 along Apron A, linked by the X (T3-T6) and T7 at the south end |

| Stands | Use in the simulator |
| ------ | -------------------- |
| Apron B: 1-6 | Along P; code D, stand 6 up to a B747 |
| Apron A: 7-16, 12L, 12R, 14L, 14R | Along T2 at the terminal (boarding bridges 4-15); 7-12 and 14 code E, 12L / 12R / 14L / 14R code C positions inside 12 and 14 |
| Apron D: 31-40, 32L-34R | Along T1; 31-34 code E (the L / R positions code C inside them), 35-40 code C / D |

## Procedures

- **Clearances:** "cleared to Bangkok, SAVSA1B departure, initial climb 5000 ft, squawk ...". RNAV SIDs to fixes 30 NM out: **1A** from runway 09, **1B** from runway 27 - SUSID / IGEVI (north), SAVSA (Bangkok), ONETI (China), EMRIT / EPGOT (east), REBED (Kuala Lumpur, Singapore, Australia), ANPUB / UBNEN (west), SATVA / UPSAB (India, the Gulf, Europe).
- **Taxi:** departures 27 taxi the whole length of P east to J (or H, G); departures 09 leave the aprons to A. From the stands of Apron A crews push back onto T2 facing south and leave via T7 and T1; from Apron D they push back onto T1 facing north.
- **Arrivals 27** land towards the aprons and vacate at A; **arrivals 09** vacate at the far end (F, G, H, J) and taxi back along P.
