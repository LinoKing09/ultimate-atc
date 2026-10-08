# EDDS - Stuttgart

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDS / STR                                                                  |
| Location           | Stuttgart / Leinfelden-Echterdingen, Germany                                |
| Reference point    | 48°41'23.56"N 009°13'19.07"E                                                |
| Elevation          | 1276 ft                                                                     |
| Magnetic variation | 3.5° E (simulation value)                                                   |
| Transition altitude | 5000 ft                                                                    |
| Runway             | **07/25**, 3345 m x 45 m, true heading 074° / 254°; landing threshold 07 displaced by 300 m (984 ft); threshold elevations 1267 ft (07) / 1181 ft (25) |
| Data file          | [`src/data/airports/edds.ts`](../../src/data/airports/edds.ts)              |

The simulator shows a condensed version of this page as the **airport briefing** (`BRIEFING` in the toolbar, data in `briefing` in `edds.ts`). Keep both consistent.

## Data sources and accuracy

| Data                                         | Source                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Runway end coordinates                       | [OurAirports](https://ourairports.com/) (public domain)                 |
| ARP, elevations, frequencies, taxiway designators, holding points, stand numbers, layout | AIP Germany, **AD 2 EDDS 2-5 Aerodrome Chart** and **AD 2 EDDS 2-7 Aerodrome Ground Movement Chart** (AMDT 10/26) |

The geometry was **digitised by hand**. Positions were measured on the charts, using the 3345 m runway as scale and the 300 m displaced threshold as a check, and converted into the simulator's runway-aligned frame. The accuracy is roughly ±10 m. Only facts are used (topology, designators, approximate positions); no chart graphics are reproduced or distributed.

**Simplified or not modelled:**

- de-icing pads DP1-DP4 on taxiway S, the run-up areas and the holding bays P1/P2 at the 25 end,
- the general aviation apron (EXIT 1-3), the US Army airfield, helicopter routes,
- the "A" stands that overlap others (9A, 24A, 26A, 28A, 71A, 74A) and stands 206, 207, 300-303,
- the intersection geometry inside the "circle" (the hot spot west of N/S, chart note 1), reduced to one junction node,
- building outlines, which are rough rectangles,
- the SIDs used in flight plans, which are placeholders and not the published procedures.

**Never use this simulator for real-world navigation.**

## Stations

| Callsign    | Radio name            | Frequency | Simulated by     |
| ----------- | --------------------- | --------- | ---------------- |
| EDDS_DEL    | Stuttgart Delivery    | 121.915   | AI (clearances are assumed to be issued before pushback) |
| **EDDS_GND** | **Stuttgart Ground** | **118.605** | **You**        |
| EDDS_TWR    | Stuttgart Tower       | 118.805 (also 119.055) | AI Tower |
| EDDS_APP    | Langen Radar          | 119.200   | (not simulated)  |
| EDDS_ATIS   | Stuttgart Information | 126.130   | You (ATIS editor) |

## Layout

![EDDS overview (runway-aligned scope)](../images/screenshot-overview.png)

The layout uses a runway-aligned frame, the same orientation as the aerodrome chart: "along" is measured from the runway 07 end towards 25, "lateral" is the perpendicular distance in metres (positive = north). In the simulator, the **ROT** button switches the scope between this orientation (the default) and north-up.

```
 lateral (m)
  ~520   stands 24-29, 30-36                       (handling / hangars behind)
  ~450   stands 9-19 (Terminals 1-4)
 376-481 taxilane M (Apron North)        stands 60-65 / 71-75 between M and N
  ~370   stands 50-56 (M -> N)           ~311 stands 40-48 (M -> O)
   279   L3 --- O ---(circle)----------------------- N -------------------------------
   229        O                          L2 joins the circle from M
   190        Z     (circle)-------------------------- S -------------------------------\
    93           K   I        H        G   F      E      D   C      B          A    (north holding points)
     0   [07]====|===|========|========|===|======|======|===|======|==========|==[25]
   -90           Y            W                                                     (south holding points)
  -262   Z --- R --- V ------(stands 100-107, Apron South)--- W
```

### Taxiways

| Taxiway | Description                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------- |
| **N**   | Outer parallel taxiway north of the runway (279 m), from the circle to the 25 end, where it joins A |
| **S**   | Inner parallel taxiway north of the runway (190 m), from the circle to A                          |
| **O**   | West of the circle (229 m), along the drive-through stands 40-48, to L3                           |
| **M**   | Apron North taxilane. It runs from L3 along the terminal stands 9-19 (376 m), up past 24-29 (437 m) and 30-36 (481 m), then down to N east of stand 75 |
| **L2**  | From M (near stand 18) down into the circle                                                       |
| **L3**  | West end of the apron: links M and O; Z continues south                                           |
| **K / Y** | At the 07 end: K runs from the circle to the runway (holding point K), Y from the runway south to R/V (holding point Y) |
| **I**   | Angled from the circle to the runway near the 07 threshold: rapid exit for 25, intersection entry for 07 (holding point I) |
| **H / W** | H runs from Apron North (M) across N and S, angled to the runway: rapid exit for 25, entry for 07 (holding point H). W continues south from the same runway point to V (holding point W) |
| **G**   | Perpendicular from N/S to the runway (holding point G); crosses F just north of the holding points |
| **F**   | Angled rapid exit for 25 from the runway to S/N (holding point F)                                 |
| **E**   | Perpendicular (holding point E)                                                                   |
| **D**   | Angled from S/N to the runway: rapid exit for 07, intersection entry for 25 (holding point D)     |
| **C**   | Perpendicular from S; shares the junction with D (holding point C)                                |
| **B**   | Angled: rapid exit for 07, intersection entry for 25 (holding point B)                            |
| **A**   | At the 25 end, where N and S end (holding point A, full length for 25)                            |
| **Z / R / V** | South: Z runs from L3/O around the 07 end to R; R to Y; V along Apron South to W            |

Holding points carry the name of their taxiway (`holding point A`, `holding point K`, ...). The 07 end has K (north) and Y (south); H and W share one runway entry.

### Standard taxi flows

To keep traffic on the two parallel taxiways from meeting head-on, automatic routes follow these directions. Automatic routes are the ones pilots take without a `via` list, and the suggestions in the *Taxi to* menu:

| Runway in use | N         | S         | Idea                                                        |
| ------------- | --------- | --------- | ----------------------------------------------------------- |
| 25            | westbound | eastbound | departures on S to A, arrivals from F/H/I/E/G on N to the aprons |
| 07            | westbound | westbound | departures on S/N to K, arrivals from D/B/C/A west to the aprons |

These are a simulator convention for the dual parallel layout, not a published procedure. Your own `via` instructions are always followed as given.

### Runway entries and exits

| Runway | Departure holding points                                  | Arrival exits (from the threshold onwards)                                |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **25** | **A** (full length); B, C, D (intersections)              | F (rapid), E, G, H (rapid), W (south), I (rapid), K, Y (south)            |
| **07** | **K** / **Y** (full length, north / south); I, H, W (intersections) | G, E, D (rapid), C, B (rapid), A                                |

**Vacate points** (where an arrival stops after leaving the runway and waits for your taxi instruction) lie between the runway holding position and the next taxiway. Behind F and G they are on the short connector before the F/G junction, clear of taxiway S, so a waiting arrival does not block traffic on S (approximation of the real geometry).

**Take-off run available** from the 25 intersections (simulator values, measured from the point where the aircraft enters the runway): B about 2700 m, C about 2450 m, D about 2200 m; full length from A about 3300 m. This decides the pilots' answer to `advise able for departure from intersection ...`.

About 85% of arrivals vacate to the north. On runway 25 the others vacate to the south via W or Y. They then need a **runway crossing** (at W/H or Y/K) to reach Apron North, unless they park on Apron South.

### Stands

| Apron / area   | Stands        | Max. wingspan | Type                                  | Lane |
| -------------- | ------------- | ------------- | ------------------------------------- | ---- |
| Apron North    | 9-19          | 36 m (9, 19: 65 m) | nose-in, pushback                | M    |
| Apron North    | 24-29         | 36 m (24, 29: 65 m) | nose-in, pushback               | M    |
| Apron North    | 30-36         | 36 m          | nose-in, pushback                     | M    |
| Apron North    | 60-65         | 36 m          | nose-in (nose south), pushback        | M    |
| Apron North    | 71-75         | 36 m          | nose-in, pushback onto N              | N    |
| Apron North    | 40-43, 45-48  | 36 m          | **drive-through**: in from M, out forwards to O | M -> O |
| Apron North    | 50-56         | 36 m          | **drive-through**: in from M, out forwards to N | M -> N |
| Apron South    | 100-104       | 36 m          | nose-in (nose south), pushback (cargo) | V   |
| Apron South    | 105-107       | 65 m          | nose-in, pushback (cargo widebodies)  | V    |

Departures on drive-through stands don't need a pushback: they call `request taxi` and leave forwards. The stand allocation prefers Apron North; business jets go to stands 60-65. Apron South is only used when Apron North is full, but you can taxi any aircraft there.

## Typical routes

**Runway 25**

| From                                  | Instruction                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| Stands 9-19, pushed facing east       | `taxi to holding point A via M, L2, S`                         |
| Stands 24-29, pushed facing east      | `taxi to holding point A via M, H, S`                          |
| Stands 30-36, 60-65, pushed facing west | `taxi to holding point A via M, H, S`                        |
| Stands 71-75 (pushed onto N)          | `taxi to holding point A via N, G, S`                          |
| Stands 40-48 (drive-through)          | `taxi to holding point A via O, S`                             |
| Stands 50-56 (drive-through)          | `taxi to holding point A via N, H, S`                          |
| Apron South, pushed facing east       | `taxi to holding point A via V, W, H, S, cross runway 25`      |
| Arrival vacated via F, G or H         | `taxi to stand 14 via N, L2` / `taxi to stand 33 via N, H, M`  |
| Arrival vacated via W (south)         | `taxi to stand 105 via V`                                      |

**Runway 07**

| From                                  | Instruction                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| Stands 9-19, pushed facing east       | `taxi to holding point K via M, L2`                            |
| Stands 9-19, pushed facing west       | `taxi to holding point K via M, L3, O`                         |
| Stands 30-36, pushed facing west      | `taxi to holding point K via M, H, S` (westbound on S)         |
| Apron South, pushed facing west       | `taxi to holding point Y via V`                                |
| Arrival vacated via D, B or C         | `taxi to stand 30 via S, H, M` / `taxi to stand 14 via N, L2`  |

### Ground planning tips

- Taxilane **M** is a single lane used in both directions. Push departures so that they leave in the direction they will taxi. Use `give way` or conditional clearances (`behind the A320 passing left to right, push and start approved`) when arrivals are coming in on M.
- The **circle** west of N/S (a hot spot on the chart) joins N, S, O, K, I and L2. Avoid sending two aircraft through it at the same time.
- Keep the vacate points behind the exits free. The Tower won't use an exit whose vacate point is blocked, which costs runway capacity.
