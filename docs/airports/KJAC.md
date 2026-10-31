[Documentation](../README.md) › [Airports](README.md) › KJAC

# KJAC - Jackson Hole

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | KJAC / JAC (Jackson Hole Airport)                                            |
| Location           | 7 miles north of Jackson, Wyoming, United States, inside Grand Teton National Park (Salt Lake City ARTCC, KZLC) |
| Reference point    | 43°36'26.4"N 110°44'15.9"W (FAA NASR)                                        |
| Elevation          | 6451 ft; thresholds 01 6413 ft, 19 6451 ft                                   |
| Magnetic variation | 11° E (13° E in 2005, 0.1° W per year - airport diagram)                     |
| Transition altitude | 18000 ft (US); initial altitude 15000 ft (ALPIN FIVE crosses KICNE at or above 15000) |
| Runway             | **1/19**, 1920 m x 46 m (6300 ft x 150 ft), true bearing 020° / 200°, no displaced threshold (blast pads beyond both ends) |
| Data files         | [`src/data/airports/kjac.ts`](../../src/data/airports/kjac.ts), layout [`kjac.layout.ts`](../../src/data/airports/kjac.layout.ts) (generated) |

The only commercial airport inside a US national park, at 6451 ft between the Teton Range and the Gros Ventre mountains: one runway, one parallel taxiway and a terminal ramp that fills up with business jets in the ski season. The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `kjac.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Taxiways, apron, parking positions 1-11, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Runway ends and elevations, declared distances, frequencies, approaches, remarks | FAA NASR airport data, cycle 2611 (public domain) |
| Taxiway designators, hot spot, aprons, de-icing pad | FAA airport diagram AL-504 and hot spot list, cycle 2611 (public domain) |
| SIDs | FAA departure procedures ALPIN FIVE, DIVYD TWO (RNAV), GEYSER SIX and TETON THREE (obstacle), cycle 2611 (public domain) |
| Traffic | Jackson Hole Airport route network (Wikipedia); operator shares, the business jet share and the destinations are estimates |

**Simplified, estimated or not modelled:**

- the **holding points** carry the names of their taxiways (US airports name none): A1, A2, A3, A4. **C** forks off A1 between the runway and the holding position line (hot spot 1: aircraft sometimes miss A1 and enter the blast pad) and is linked to the A1 holding point. A2 and A3 meet the runway at right angles with a fillet to either side; OpenStreetMap maps each fillet as a way of its own - the simulator leads straight from the holding point to the runway between them and draws the fillets,
- the **parking positions** are the eleven of OpenStreetMap (1-11 along taxiway A, about 45 m apart: up to code C); no parking positions are published. The **South GA ramp** and the **FBO ramp** (part of the one apron area OpenStreetMap calls "Commercial Ramp") are drawn, without parking positions: business jets park on 1-11,
- the **de-icing pad** at the north end of A (B, B1, B2 around it) is drawn, not used; its links to A are drawn too,
- one **Ground** position: clearance delivery and ground control share 124.55, so Jackson Ground gives the clearances. **Salt Lake Center** (133.25, Jackson RCAG) works the departures and arrivals,
- the **tower hours** (0700-2130 local; class E / CTAF outside them), the noise abatement procedures for departures on runway 19, the density altitude (longer take-off runs) and the winter conditions are not modelled,
- the obstacle departures **GEYSER SIX** (runway 1) and **TETON THREE** (runway 19) can be cleared but are not planned automatically,
- traffic: estimated operator shares (SkyWest flying for United and Delta about a quarter, business jets about a quarter), 60 % of Stuttgart's movements per density step (`rateFactor` 0.6).

**Never use this simulator for real-world navigation.**

## Runway and approaches

| Runway | TORA / TODA / ASDA / LDA (ft) | Entries | Exits | Approaches |
| ------ | ----------------------------- | ------- | ----- | ---------- |
| 19 | 6300 / 6300 / 6300 / 6300 | A4 (full length), A3 | A3, A2, A1 | ILS Y / Z or LOC, RNAV (RNP) X / Y, RNAV (GPS) Z |
| 1 | 6300 / 6300 / 6300 / 6300 | A1 (full length), A2 | A2, A3, A4 | RNAV (GPS) X, RNAV (RNP) Y / Z, VOR - no ILS |

Runway 19 is the calm-wind runway and the only one with an ILS (estimate: 75 % of the time). FAA remarks: aircraft that fail to touch down within the first third of the runway sometimes fail to stop on it; pushbacks from the terminal make A2 unavailable now and then.

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Ground (with clearances) | Jackson Ground | 124.55 |
| Tower | Jackson Tower | 118.075 (CTAF when closed) |
| Approach / Departure | Salt Lake Center | 133.25 |
| ATIS | Jackson Hole | 120.625 |

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **A** | Parallel taxiway on the east side, the whole length |
| **A1**, **A2**, **A3**, **A4** | From A to the runway (A1 south end, A4 north end) |
| **C** | Off A1 to the south ramps (hot spot 1) |
| **D** | From A to the South GA ramp |
| **B**, **B1**, **B2** | Around the de-icing pad at the north end (drawn) |

## Procedures

- **Clearances** (Ground, FAA form - see [phraseology](../phraseology.md)): runway 19 **ALPIN5** (south to KICNE, then Big Piney or Idaho Falls), runway 1 **DIVYD2** (RNAV, north-east to DIVYD, then Boysen Reservoir, Dunoir, HUKET or JEDHY) for every destination.
- **Runway 19**: departures from A4 (full length) or A3; arrivals vacate at A3, A2 or A1.
- **Runway 1**: departures from A1 (full length) or A2; arrivals vacate at A2, A3 or A4.
