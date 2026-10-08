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
| Stand sizes, wide-body positions, pushback / taxi-out stands | AD 2 EDDS 2-7 (AMDT 10/26, code letter markings), the older **Aircraft Parking/Docking Chart** (AMDT 09/13), [VATSIM Germany knowledge base](https://knowledgebase.vatsim-germany.org/books/airports-langen-fir-edgg/page/general-4ph) (secondary) - see [Stands](#stands) |

The geometry was **digitised by hand**. Positions were measured on the charts, using the 3345 m runway as scale and the 300 m displaced threshold as a check, and converted into the simulator's runway-aligned frame. The accuracy is roughly ±10 m. Only facts are used (topology, designators, approximate positions); no chart graphics are reproduced or distributed.

**Simplified or not modelled:**

- de-icing pads DP1-DP4 on taxiway S, the run-up areas and the holding bays P1/P2 at the 25 end,
- the general aviation apron (EXIT 1-3), the US Army airfield, helicopter routes,
- the "A" stands that overlap others (9A, 24A, 26A, 28A; 71A and 74A are modelled) and stands 206, 207, 300-303,
- the intersection geometry inside the "circle" (the hot spot west of N/S, chart note 1), reduced to one junction node,
- building outlines, which are rough rectangles,
- the SIDs used in flight plans and clearances, which are placeholders and not the published procedures,
- the initial climb in IFR clearances (5000 ft, `initialClimbFt`), a simulator value - check the published SIDs for the real one,
- the squawk codes (a simulator range, not the real code allocation).


**Never use this simulator for real-world navigation.**

## Stations

| Callsign    | Radio name            | Frequency | Simulated by     |
| ----------- | --------------------- | --------- | ---------------- |
| **EDDS_DEL** | **Stuttgart Delivery** | **121.915** | **You** (since v0.6), or AI: clearances are then issued before the aircraft calls Ground |
| **EDDS_GND** | **Stuttgart Ground** | **118.605** | **You**, or AI Ground when you only staff Delivery |
| EDDS_TWR    | Stuttgart Tower       | 118.805 (also 119.055) | AI Tower |
| EDDS_APP    | Langen Radar          | 119.200   | (not simulated)  |
| EDDS_ATIS   | Stuttgart Information | 126.130   | You (ATIS editor) |

## Systems and procedures

Stuttgart has been a **full A-CDM airport** since November 2014 (TOBT from the airlines, TSAT from the pre-departure sequencer, start-up at the TSAT) and offers **departure clearance by datalink (DCL)**; start-up is requested by voice. The simulator gives EDDS all [systems](../systems.md): A-SMGCS surveillance, RMCA, CATC and routing (the services offered for training; which A-SMGCS levels are installed at Stuttgart is not modelled from a published source), A-CDM and DCL.

Delivery procedure in the simulator: clearance request about 10 minutes before off-block, IFR clearance `cleared to <destination> via <SID> departure, climb 5000 feet, squawk <code>`, start-up at the TSAT, then `contact ground 118.605` for pushback.

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

To keep traffic on the two parallel taxiways from meeting head-on, they are used one-way: **N eastbound, S westbound** for both runway directions. Departures from the aprons reach N first and never cross S; arrivals vacating the runway reach S first and never cross N. Automatic routes (pilots without a `via` list, the *Taxi to* menu and the quick-action bar) follow these directions strictly; only if that is impossible without a 180 degree turn they use a taxiway against the flow:

| Runway in use | N         | S         | Idea                                                        |
| ------------- | --------- | --------- | ----------------------------------------------------------- |
| 25            | eastbound | westbound | departures on N to A, arrivals from F/G/E/H on S to the aprons |
| 07            | eastbound | westbound | departures to K via the circle (or west on S), arrivals from D/B/C/A west on S to the aprons |

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
| Apron North    | 9-19          | 36 m          | nose-in, pushback                     | M    |
| Apron North    | 24-29         | 36 m          | nose-in, pushback                     | M    |
| Apron North    | 30-36         | 36 m          | nose-in, pushback                     | M (code C section) |
| Apron North    | 60-65         | 36 m          | nose-in (nose south), pushback        | M (code C section) |
| Apron North    | 71-75         | 36 m          | nose-in, pushback onto N              | N    |
| Apron North    | **71A, 74A**  | 65 m          | wide-body positions overlapping 71+72 / 74+75, pushback onto N | N |
| Apron North    | 40-43, 45-48  | 36 m          | **drive-through**: in from M, out forwards to O | M -> O |
| Apron North    | 50-56         | 36 m          | **drive-through**: in from M, out forwards to N | M -> N |
| Apron South    | 100-104       | 36 m          | nose-in (nose south), pushback (cargo) | V   |
| Apron South    | 105-107       | 65 m          | nose-in, pushback (cargo wide-bodies)  | V    |

**Stand sizes - sources.** The current ground movement chart (AMDT 10/26) marks taxilane M east of the H junction as *max. code letter C* (wingspan below 36 m) and shows the alternative positions 9A, 24A, 26A, 28A, 71A and 206/207 (overlapping their neighbours). The VATSIM Germany knowledge base (a secondary source for simulator controllers) lists 71A, 74A, 105 and 106 as the stands for the largest aircraft. The older aircraft parking/docking chart (AMDT 09/13) confirms that nose-in positions 9-36 and 105-106 are left by pushback and 40-56 are taxi-out positions. From this the simulator uses: all terminal and apron north stands up to code C, wide-bodies on 71A/74A and 105-107. The exact per-stand type limits are not published in these charts, so this is an approximation.

**Wide-bodies block their neighbours** (wingtip clearance, see [simulation model](../simulation.md)): a wide-body on 71A blocks 71 and 72 (and an aircraft on 71 or 72 blocks 71A), likewise 74A with 74/75; on Apron South only every other one of 105-107 can take a wide-body at the same time. The other "A" positions (9A, 24A, 26A, 28A) and 206/207 are not modelled.

Departures on drive-through stands don't need a pushback: they call `request taxi` and leave forwards. The stand allocation prefers Apron North; business jets go to stands 60-65. Apron South is only used when Apron North is full, but you can taxi any aircraft there.

## Traffic

The traffic generator uses the operator mix of Stuttgart (`traffic` in `edds.ts`). Shares are the airlines' passenger shares in scheduled and charter traffic from the airport's annual report 2024 as quoted in the press (Eurowings about 40 % also in 2025), used as movement shares:

| Operator | Share | Types | Main destinations |
| -------- | ----: | ----- | ----------------- |
| Eurowings (EWG) | 39.7 % | A319, A320, A20N, A21N | Palma, Pristina, Barcelona, Berlin, Hamburg, Düsseldorf, Antalya, Dublin, Manchester, Stockholm, Malta, Mostar, Split, Zagreb, Belgrade ... |
| SunExpress (SXS) | 8.3 % | B738, B38M | Antalya, Izmir, Dalaman, Kayseri, Bodrum |
| TUIfly (TUI) | 5.8 % | B738, B38M | Palma, Canaries, Hurghada, Heraklion, Antalya |
| Pegasus (PGT) | 5.4 % | A20N, A21N, B38M | Istanbul Sabiha Gökçen, Antalya, Izmir |
| Lufthansa group (DLH, CLH) | 5.4 % | A319, A320, A20N, CRJ9, E195 | Frankfurt, Munich |
| Turkish Airlines (THY) | 4.7 % | A321, A21N, B738, A332 | Istanbul |
| Condor (CFG) | 3.9 % | A320, A321, A21N | Palma, Canaries, Hurghada, Antalya, Greek islands |
| British Airways (BAW) | 3.7 % | A319, A320, A20N | London Heathrow (about 359,000 passengers in 2025) |
| KLM Cityhopper (KLC) | 2.2 % | E190, E295 | Amsterdam |
| Air France (AFR) | 1.2 % | A319, A320 | Paris CDG |
| Austrian (AUA) | 1.0 % | DH8D, E195 | Vienna |
| Business aviation | 3 % | C56X, CL35 | various |

The busiest destinations in 2025 were Palma (639,000 passengers), Antalya (571,000), Istanbul Sabiha Gökçen (541,000), Istanbul (382,000), Pristina (372,000), London Heathrow (359,000), Barcelona (347,000), Berlin (313,000) and Hamburg (296,000); the destination lists are weighted accordingly. Shares for British Airways, KLM, Air France and Austrian are estimates from their routes; smaller operators (Corendon, AJet, Croatia Airlines and others) are not modelled. Sources: [Stuttgart Airport facts and figures](https://www.stuttgart-airport.com/en/company/airport-development/facts-and-figures), [Stuttgarter Zeitung: top destinations](https://www.stuttgarter-zeitung.de/lokales/stuttgart/flughafen-stuttgart-top-10-fluege-wohin-die-meisten-passagiere-reisen-78825542.html), [Schwäbische Zeitung: airline shares](https://www.schwaebische.de/regional/baden-wuerttemberg/es-ist-nicht-lufthansa-diese-airline-fliegt-am-haeufigsten-am-flughafen-stuttgart-3475888), [airliners.de: 2025 figures](https://www.airliners.de/flughafen-stuttgart-2025-passagierzahlen-steigern/86906).

## Typical routes

**Runway 25**

| From                                  | Instruction                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| Stands 9-29, pushed facing east       | `taxi to holding point A via M, H, N`                          |
| Stands 30-36, 60-65, pushed facing west | `taxi to holding point A via M, H, N`                        |
| Stands 71-75 (pushed onto N facing east) | `taxi to holding point A via N`                             |
| Stands 40-48 (drive-through)          | `taxi to holding point A via O, N`                             |
| Stands 50-56 (drive-through)          | `taxi to holding point A via N`                                |
| Apron South, pushed facing east       | `taxi to holding point A via V, W, H, N, cross runway 25`      |
| Arrival vacated via F, G or E         | `taxi to stand 14 via S, H, M` / `taxi to stand 72 via S, H, N` |
| Arrival vacated via H                 | `taxi to stand 33 via H, M`                                    |
| Arrival vacated via W (south)         | `taxi to stand 105 via V`                                      |

**Runway 07**

| From                                  | Instruction                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| Stands 9-19, pushed facing east       | `taxi to holding point K via M, L2`                            |
| Stands 9-19, pushed facing west       | `taxi to holding point K via M, L3, O`                         |
| Stands 30-36, pushed facing west      | `taxi to holding point K via M, L2`                            |
| Stands 24-29, pushed facing east      | `taxi to holding point K via M, H, S` (westbound on S)         |
| Apron South, pushed facing west       | `taxi to holding point Y via V`                                |
| Arrival vacated via D, B or C         | `taxi to stand 30 via S, H, M` / `taxi to stand 14 via S, H, M` |

### Ground planning tips

- Taxilane **M** is a single lane used in both directions. Push departures so that they leave in the direction they will taxi. Use `give way` or conditional clearances (`behind the A320 passing left to right, push and start approved`) when arrivals are coming in on M.
- The **circle** west of N/S (a hot spot on the chart) joins N, S, O, K, I and L2. Avoid sending two aircraft through it at the same time.
- Keep the vacate points behind the exits free. The Tower won't use an exit whose vacate point is blocked, which costs runway capacity.
