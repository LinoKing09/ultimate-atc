# EDXW - Sylt

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDXW / GWT (Sylt Airport, Westerland)                                       |
| Location           | Westerland, Sylt, Schleswig-Holstein, Germany                               |
| Reference point    | 54°54'48"N 008°20'26"E (OurAirports)                                        |
| Elevation          | 51 ft                                                                       |
| Magnetic variation | 3.6° E (simulation value)                                                   |
| Transition altitude | 5000 ft; initial climb of the SIDs 4000 ft                                 |
| Runways            | **14/32**, 2120 m x 45 m, true heading 145° / 325° (all simulated traffic); **06/24**, 1696 m x 30 m, true heading 060° / 240° (light aircraft only, not used - crossed by departures 32) |
| Data files         | [`src/data/airports/edxw.ts`](../../src/data/airports/edxw.ts), layout [`edxw.layout.ts`](../../src/data/airports/edxw.layout.ts) (generated) |

The simulator shows a condensed version of this page as the **airport briefing** (data in `briefing` in `edxw.ts`).

## Data sources and accuracy

| Data | Source |
| ---- | ------ |
| Runways, taxiways, holding points, aprons, buildings | [OpenStreetMap](https://www.openstreetmap.org/) - © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Imported with `scripts/osm-import.mjs`; the derived layout is available under the ODbL |
| Reference point, elevations | [OurAirports](https://ourairports.com/) (public domain) |
| Frequencies, SIDs, runway use, taxiway restrictions, stands | VATSIM Germany Sylt SOP (facts only; a simulation resource, not an official source) |

**Simplified or not modelled:**

- only taxiways A, C, D, I and P; the north aprons (3, 4), taxiways L, E, F, M, B, the glider area and the closed taxiway G are left out,
- runway 06/24 is not used for take-offs and landings and not as a taxiway (real: larger aircraft taxi on it); departures 32 cross it between D2 and A2,
- D2 and A2 are simulator names for the holding points on D and A at runway 06/24,
- business jets use the grass taxiway I and the GA apron (Apron 2) via P; the real limit on I is 2 t,
- the GA stands G1-G4 on Apron 2 are simulator positions (estimated), stands 01-03 on Apron 1 follow the apron markings approximately,
- in reality Bremen Radar gives the IFR clearances; in the simulator (as on VATSIM) Sylt Tower does,
- SIDs: one per runway (OLDIP1A for 14, OLDIP1B for 32), the numbers change with the AIRAC cycle,
- traffic: estimated operator shares, about a quarter of Stuttgart's movements per density step (`rateFactor` 0.25).

**Never use this simulator for real-world navigation.**

## Stations

| Station | Callsign | Frequency |
| ------- | -------- | --------- |
| Tower (also ground movements and clearances) | Sylt Tower | 119.750 |
| Approach | Bremen Radar | 124.075 |
| ATIS | Sylt Information | 118.400 |

Sylt has no Ground or Delivery position: you play **Sylt Tower** for everything on the ground and the runway.

## Layout

| Taxiway | Description |
| ------- | ----------- |
| **D** | From Apron 1 (terminal) north to the 14 end of runway 14/32, and south across runway 06/24 (holding point D2) to A |
| **C** | Short connector from D to runway 14/32 near the 14 end (intersection departures 14, exit 32) |
| **A** | From D (holding point A2 at runway 06/24) the long way round the south of the airfield to the 32 end of runway 14/32 |
| **I, P** | To Apron 2 (general aviation) in the west; business jets only (22 m) |

| Stands | Use in the simulator |
| ------ | -------------------- |
| 01-03 | Apron 1 at the terminal, airliners up to code C, taxi in and out along D |
| G1-G4 | Apron 2, business jets, taxi in and out along P |

## Procedures

- **Runway 32** (preferred with the prevailing westerly winds): departures taxi via D, **cross runway 24** (D2 / A2) and follow A to the 32 end (`taxi to holding point A via D, A, cross runway 24`). Arrivals vacate via C or D near the end.
- **Runway 14**: departures from D (full length) or C (intersection). Arrivals vacate to the right at the end via A and taxi back via A, across runway 06/24, and D.
- One SID per runway, initial climb 4000 ft: space departures at least 5 NM (2 minutes).
- Arrivals vacate only at the far end and occupy the runway for long: Approach spaces them at least **6 NM** (`arrivalSpacingNm`).
- With only three airliner stands, the last free stand is kept for arrivals (`standReserve` 1): Approach releases an arrival only when a stand is free for it.

## Traffic

Lufthansa (Frankfurt, Munich), Lufthansa CityLine, Eurowings, Swiss (summer) and a large share of business jets; shares are estimates.
