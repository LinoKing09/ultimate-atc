# EDDS - Stuttgart

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDS / STR                                                                  |
| Location           | Stuttgart / Leinfelden-Echterdingen, Germany                                |
| Reference point    | 48°41'24"N 009°13'20"E                                                      |
| Elevation          | 1276 ft                                                                     |
| Magnetic variation | 3.5° E (simulation value)                                                   |
| Transition altitude | 5000 ft                                                                    |
| Runway             | **07/25**, 3345 m x 45 m, true heading 074° / 254°; landing threshold 07 displaced by 300 m (984 ft) |
| Data file          | [`src/data/airports/edds.ts`](../../src/data/airports/edds.ts)              |

> **Planned:** the layout will be redrawn from an accurate aerodrome chart (Foxchart / AIP-based) as soon as one is provided, see the [roadmap](../roadmap.md).
>
> **Accuracy.** Runway end coordinates, elevation and frequencies are **real-world values** (OurAirports, public domain). The taxiway network, intersection names, holding point names, stand numbers and buildings are a **simplified hand-made approximation**. They reproduce the general arrangement of the airport (one runway, parallel taxiways north and south, terminal apron north of the runway, GA/cargo apron north-west, maintenance area south), but **they do not match the official aerodrome chart**. The SIDs used in flight plans are placeholders. Never use this for real-world navigation.

## Stations

| Callsign    | Radio name            | Frequency | Simulated by     |
| ----------- | --------------------- | --------- | ---------------- |
| EDDS_DEL    | Stuttgart Delivery    | 121.915   | AI (clearances are assumed to be issued before pushback) |
| **EDDS_GND** | **Stuttgart Ground** | **118.605** | **You**        |
| EDDS_TWR    | Stuttgart Tower       | 118.805   | AI Tower         |
| EDDS_APP    | Langen Radar          | 119.200   | (not simulated)  |
| EDDS_ATIS   | Stuttgart Information | 126.130   | ATIS letter in the toolbar |

## Layout

![EDDS overview](../images/screenshot-overview.png)

The layout is described in a runway-aligned frame: "along" is measured from the runway 07 end towards 25, "lateral" is the perpendicular distance (positive = north).

```
 lateral (m)
   380   terminal stands 1-22 (Apron 1)               GA / cargo stands 50-57 (Apron 3) at 350
   330   ======= taxilane R =======                    taxilane V at 300
   190   ---------------------------- taxiway N ----------------------------
    95   A1   B1        E1      D1    C1          F1   G1        runway holding points (north)
     0   [========================= RUNWAY 07/25 ==========================]
   -95   A2   B2                D2                F2   G2        runway holding points (south)
  -190   ---------------------------- taxiway S ----------------------------
  -240                    stands 80-84 (Apron South)
         ^ 07 end (west)                                    25 end (east) ^
```

### Taxiways

| Taxiway | Description                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------ |
| **N**   | Parallel taxiway north of the runway, full length from A (west) to G (east)                      |
| **S**   | Parallel taxiway south of the runway, full length from A to G; passes Apron South                |
| **A**   | Connector at the west end (runway 07 threshold area), both sides; holding points A1 (north), A2 (south) |
| **B**   | Connector at 480 m, both sides; continues north from N to taxilane V; holding points B1, B2      |
| **C**   | **One-way rapid exit** for runway 07 arrivals, from the runway (2000 m) north-east to N; holding point C1 |
| **D**   | Connector at 1750 m, both sides; continues north from N to taxilane R; holding points D1, D2     |
| **E**   | **One-way rapid exit** for runway 25 arrivals, from the runway (1500 m) north-west to N; holding point E1 |
| **F**   | Connector at 2900 m, both sides; continues north from N to taxilane R; holding points F1, F2     |
| **G**   | Connector at the east end (runway 25 threshold), both sides; holding points G1, G2               |
| **R**   | Terminal apron taxilane (Apron 1). Joins N at its west end (1500 m) and east end (3100 m); D and F join it in between |
| **V**   | GA / cargo apron taxilane (Apron 3). Joins N at 1150 m; B joins it at 480 m; dead end at the west |

Holding point names follow the scheme **`<connector><side>`**: `1` = north of the runway, `2` = south.

### Runway entries and exits

| Runway | Departure holding points                                      | Arrival exits (in order of distance from the threshold) |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| **25** | **G1**, G2 (full length); F1, F2 (intersection, ~2900 m remaining) | **E** (rapid, north), D (north/south), B (north/south), A (north) |
| **07** | **A1**, A2 (full length); B1, B2 (intersection)               | D (north/south), **C** (rapid, north), F (north/south), G (north) |

About 85% of arrivals vacate to the north. The others vacate to the south via D, B, F or G, and then **have to cross the runway** to reach the terminal.

### Stands

| Apron          | Stands      | Max. wingspan | Pushback onto | Typical users                      |
| -------------- | ----------- | ------------- | ------------- | ---------------------------------- |
| Apron 1 (terminal) | 1, 2    | 65 m          | R             | Wide-bodies (A330, B767, B787)     |
| Apron 1 (terminal) | 3-18    | 36 m          | R             | A319-A321, B737, E-Jets, CRJ, Q400 |
| Apron 1 (terminal) | 19, 20  | 65 m          | R             | Wide-bodies                        |
| Apron 1 (terminal) | 21, 22  | 36 m          | R             | Narrow-bodies                      |
| Apron 3 (GA/cargo) | 50      | 65 m          | V             | Large cargo / GA                   |
| Apron 3 (GA/cargo) | 51-57   | 52 m          | V             | Business jets, narrow-bodies       |
| Apron South        | 80-84   | 52 m          | S             | Maintenance; manual overflow       |

All stands are nose-in stands that need a pushback. Terminal stands face north towards the terminal. A pushback ends on the taxilane, about 45 m to the side of the stand's lead-in line, with the nose pointing **east** or **west**.

The stand allocation (suggested stand for arrivals, stand for new departures) prefers Apron 1 for airlines and Apron 3 for business jets. It picks the smallest free stand that fits. Apron South is not used by the automatic allocation, but you can taxi arrivals there yourself.

## Typical routes (runway 25)

| From                     | To            | Instruction                                             |
| ------------------------ | ------------- | ------------------------------------------------------- |
| Terminal stands 3-18, pushed facing east | G1 | `taxi to holding point G1 via R, F, N, G` (or `via R, N, G` along R to its east end) |
| Terminal stands 19-22    | G1            | `taxi to holding point G1 via R, N, G`                  |
| Apron 3 stands           | G1            | `taxi to holding point G1 via V, N, G`                  |
| Apron South stands       | G2            | `taxi to holding point G2 via S, G` (no crossing)       |
| Arrival vacated via E    | terminal stand | `taxi to stand 14 via N, R` (or `via N, D, R`)         |
| Arrival vacated via D2 (south) | terminal | `taxi to stand 14 via D, R, cross runway 25`          |
| Arrival vacated via B    | Apron 3       | `taxi to stand 52 via B, V`                             |

For **runway 07**, departures go to **A1** (`via R, N, A` from the terminal, `via V, B, N, A` or `via V, N, A` from Apron 3). Arrivals vacate mostly via C (rapid) or D.

### Ground planning tips

- With runway 25 in use, departures from the terminal go **east**, while arrivals vacating via E come from the **west** on N. Use R and N in one direction where possible, and use D or F to get onto or off the apron to avoid head-on traffic on R.
- The rapid exits C and E are one-way. Departures cannot use them.
- G1 and G2 lead onto the same runway entry. Only one aircraft lines up at a time, and Tower takes them in the order they reached the holding points.
