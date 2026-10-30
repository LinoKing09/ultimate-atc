[Documentation](../README.md) › [Airports](README.md) › EGKK

# EGKK - London Gatwick

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EGKK / LGW (London Gatwick Airport)                                         |
| Location           | 2.7 NM north of Crawley, 24.7 NM south of London, United Kingdom (London FIR, EGTT) |
| Reference point    | 51°08'53"N 000°11'25"W (AIP AD 2.2, centre of runway 08R/26L)               |
| Elevation          | 203 ft; thresholds 08R 196 ft, 26L 196 ft                                   |
| Magnetic variation | 1.3° E (AIP, 2027)                                                          |
| Transition altitude | 6000 ft; the SIDs climb to 6000 ft                                         |
| Runways            | **08R/26L**, 3317 m x 45 m, true bearing 077.6° / 257.6°, thresholds displaced 395 m (08R) and 425 m (26L); **08L/26R** (standby), 2561 m x 45 m |
| Data files         | [`src/data/airports/egkk.ts`](../../src/data/airports/egkk.ts), layout [`egkk.layout.ts`](../../src/data/airports/egkk.layout.ts) (generated) |

The busiest single-runway airport in the world: up to 55 movements an hour on 08R/26L, departures and arrivals alternating. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `egkk.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, aprons, stand lead-in lines, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runways, thresholds, declared distances with the intersection take-offs, taxiway designators and limits, holding points, the rapid exits and their distances, hot spots, runway use, the **stand list with its coordinates**, frequencies, the RNAV SIDs with their end fixes | UK AIP AD 2 EGKK (NATS, AIRAC 2026-10-29) with its aerodrome chart, ground movement / parking / docking charts and the SID coding tables, used as a reference only: facts digitised by hand, no chart content copied |
| Traffic | London Gatwick route network (Wikipedia; about 43 million passengers and 280000 movements a year); operator shares are estimates |

**Simplified, estimated or not modelled:**

- the **standby runway 08L/26R** is only used while 08R/26L is closed: drawn, not used, and not part of the taxi graph - arrivals vacating 08R/26L cross it without a clearance (AIP AD 2.20). Its pre-threshold area 08L is kept as unnamed links from J (J4 / J7) to H, the way to H1, and the stretch between ER and E as the way of traffic vacating via ER onto J,
- the **holding points** carry the names of the chart; the rapid exits **GR** and **BR** share the holding position lines of G1 and B1 on the chart and carry their taxiway names here (one name per holding point), as do **FR** and **ER**. The CAT III holding points (J2 / J3, H2 / H3, G2 / G3, C3, A3, M3) and A2 on AS are plain nodes; low visibility procedures are not modelled,
- the **stand sizes** are not published: the centre stands of the MARS groups (13, 31-36, 47-52, 54, 64, 66, 141-144, 150, 152, 160, 171-178, 180, 230-235) are code E, their L / R positions code C, the others by their spacing (17, 130, 134 code D; 161 code E; the rest code C). Overlapping positions are never used at the same time (wingtip clearance check),
- stands **64 / 64L / 64R, 178L / 178R, 180 / 180R and 570-574** are not in OpenStreetMap: AIP coordinates, lane on the nearest taxiway; the stands OpenStreetMap still has in the work-in-progress area at Pier 6 (691-698) and 551 are not in the AIP list and left out,
- **E** (one way north, only for traffic vacating via ER) is followed from where ER crosses the standby runway; its fork off ER before the holding point is drawn. The eastern fillet of B and the link from B to P behind B1 are drawn (BR leads on to P on its own),
- **Y** and **W** south and east of the runway to Maintenance Area 1 (Hangar 6) are drawn, not used; no general aviation, maintenance or cargo-only traffic,
- the remote holding / de-icing procedures (stands 41 / 43, DA Sierra), A-CDM (TOBT, TSAT), the noise abatement procedures and the night quota are not modelled; Whiskey is limited to code C, the other code D / E limits of AD 2.20 are not modelled,
- the SIDs NOVMA1X and IMVUR1Z climb to 4000 ft in reality (6000 ft in the simulator),
- traffic: estimated operator shares (easyJet about half), 140 % of Stuttgart's movements per density step (`rateFactor` 1.4) - "Heavy" is about 56 movements an hour.

**Never use this simulator for real-world navigation.**

## Runway and approaches

| Runway | TORA / TODA / ASDA / LDA (m) | Entries (take-off run) | Rapid exits (distance from the threshold) | Approaches |
| ------ | ---------------------------- | ---------------------- | ----------------------------------------- | ---------- |
| 26L | 3255 / 3399 / 3317 / 2830 | M1 (full length), A1 (3146), B1 (2891), C1 (2460) | ER (1480 m), FR (1835 m), GR (2126 m); then G, H, J | ILS CAT III, RNP |
| 08R | 3159 / 3311 / 3233 / 2765 | J1 (full length), H1 (2937), G1 (2772) | D (1376 m), CR (1796 m), BR (2251 m); then B, A | ILS CAT III, RNP |

Runway 26L is in use about 70 % of the time (westerly winds). Departures start in the pre-threshold area before the displaced threshold. D is not available for vacating 26L, ER and M not for vacating 08R.

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Delivery | Gatwick Delivery | 121.955 |
| Ground | Gatwick Ground | 121.805 |
| Tower | Gatwick Tower | 124.230 |
| Approach | Gatwick Director | 126.825 |
| ATIS | Gatwick Information | 136.525 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **J** | North of both runways the whole length, from J1 at the 08R end round to the 26L end |
| **K**, **L** | Between the piers of the South and North Terminal |
| **AN**, **AS**, **Z** | Parallels at the east end towards M1, A1 and B1 |
| **M**, **A**, **B**, **C**, **G**, **H**, **J** | To the holding points M1, A1, B1, C1, G1, H1, J1 |
| **D**, **CR**, **BR** / **ER**, **FR**, **GR** | Rapid exits for 08R / 26L |
| **N**, **P**, **Q**, **QA**-**QC**, **R**, **RA**, **S**, **T**, **U**, **V**, **W** | Links to the aprons and the remote stands |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 1-5 (Pier 1), 10-28 (Pier 2), 31-38 (Pier 3) | South Terminal |
| 46-54 (Pier 4), 552-574 (Pier 5), 681-690 (Pier 6), 64-68 (north apron) | North Terminal |
| 41-43 | Remote holding |
| 130-145, 150-180, 230-235 | Remote stands |
| 153, 154, 158, 159 | Cargo apron |

## Procedures

- **Clearances** (Delivery): "cleared to Malaga, BOGNA1X departure, squawk ..." - RNAV SIDs **X** from runway 26L (NOVMA west, TIGER north, DAGGA north-east, WIZAD east, HARDY and SFD south-east, BOGNA south) and **Z** from runway 08R (IMVUR west, LAM north, FRANE north-east, ODVIK east, SFD south), planned by the direction of the destination.
- **Runway 26L**: departures to M1 (full length) or A1, B1, C1; arrivals vacate via ER, FR or GR and cross the standby runway onto J.
- **Runway 08R**: departures to J1 (full length), H1 (via J and the pre-threshold area 08L) or G1; arrivals vacate via D, CR or BR.
