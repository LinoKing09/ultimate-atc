# EDDS - Stuttgart

| Item               | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| ICAO / IATA        | EDDS / STR                                                                  |
| Location           | Stuttgart / Leinfelden-Echterdingen, Germany                                |
| Reference point    | 48°41'23.56"N 009°13'19.07"E                                                |
| Elevation          | 1276 ft                                                                     |
| Magnetic variation | 3.9° E (World Magnetic Model, 2026; AIP AD 2.2: 3.0° E, 2026.01)            |
| Transition altitude | 5000 ft                                                                    |
| Runway             | **07/25**, 3345 m x 45 m, true heading 074° / 254°; landing threshold 07 displaced by 300 m (984 ft); threshold elevations 1267 ft (07) / 1181 ft (25). Take-off run available 07: 3345 m, **25: 3045 m** (the 300 m behind the displaced threshold 07 do not count for take-offs 25) |
| Data file          | [`src/data/airports/edds.ts`](../../src/data/airports/edds.ts)              |

The simulator shows a condensed version of this page as the **airport briefing** (`BRIEFING` in the toolbar, data in `briefing` in `edds.ts`). Keep both consistent.

## Data sources and accuracy

| Data                                         | Source                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Runway end coordinates                       | [OurAirports](https://ourairports.com/) (public domain); cross-checked against the AIP thresholds (AD 2.12): within 4 m |
| Declared distances, approaches, taxiway widths, de-icing pad limits, code letter limits, low visibility procedures, night restrictions | DFS AIP Germany AD 2 EDDS (AIRAC 2026OCT01): text pages AD 2.8, 2.12, 2.13, 2.20, 2.22 and the approach and SID charts, used as a reference only (facts read by hand) |
| ARP, elevations, frequencies, taxiway designators, holding points, stand numbers, layout | AIP Germany, **AD 2 EDDS 2-5 Aerodrome Chart** and **AD 2 EDDS 2-7 Aerodrome Ground Movement Chart** (AMDT 10/26) |
| Night flying restrictions, time zone          | Flughafen Stuttgart (published night flying restrictions); applied only in scenarios with night rules, see [scenarios](../scenarios.md#start-time-and-night-flying-restrictions) |
| Stand sizes, wide-body positions, pushback / taxi-out stands | AD 2 EDDS 2-7 (AMDT 10/26, code letter markings), the older **Aircraft Parking/Docking Chart** (AMDT 09/13), the stand data of the VATSIM Germany ground radar (EuroScope package `edgg-package`, 2026) - see [Stands](#stands) |
| De-icing pads DP1-DP4 (position, lead lines, wingspan limits), take-off run available (TORA) from every entry, the current Apron South | VATSIM Germany EuroScope package (`edgg-package`, 2026): its ground radar maps are generated from the AIP data (AIXM). Used as a reference only - positions were read off and converted into the simulator's frame; no files or map content are included |
| Holding bays P1 / P2 | [OpenStreetMap](https://www.openstreetmap.org/) (the two unnamed links between N and S at the 25 end) |
| SIDs | Designators from a public chart index (2026) and the VATSIM Germany vSID configuration; destination restrictions and the radar sectors from the VATSIM Germany Delivery SOP; exit fix positions from public waypoint lists |
| Frequencies | VATSIM Germany station data (`datahub`, matching the AIP values used before); ATIS from the VATSIM Germany vATIS profile |
| Magnetic variation | NOAA World Magnetic Model (October 2026) |

The geometry was **digitised by hand**. Positions were measured on the charts, using the 3345 m runway as scale and the 300 m displaced threshold as a check, and converted into the simulator's runway-aligned frame. The accuracy is roughly ±10 m. Only facts are used (topology, designators, approximate positions); no chart graphics are reproduced or distributed.

**Checked on 2026-10-21** against OpenStreetMap and the VATSIM Germany ground radar data: all runway holding positions lie within 10 m of the OSM positions, the stands within 20 m of the ground radar stand positions; the published take-off run from every entry matches the simulator's geometry within 100 m (the published values are used).

**Simplified or not modelled:**

- the run-up areas, the general aviation apron (GAT exits 1-3), the US Army airfield, helipads and helicopter routes,
- on Apron South (layout since AIRAC 2512) the small stands 300-303 and the new 105-107 between 206 and 207 (the simulator has 100-104, 206 and 207),
- while a de-icing pad is in use, the real operation closes S next to it (I-H for DP1 / DP2, H-F for DP3 / DP4); the simulator does not,
- the intersection geometry inside the "circle" (the hot spot west of N/S, chart note 1), reduced to one junction node,
- building outlines, which are rough rectangles,
- the SIDs: all exit fixes with their 2026 designators (B = runway 25, H = runway 07), but no routes or altitude restrictions; flight plans pick the SID by the direction of the destination (see [SIDs](#sids)). The local SIDs STG / TEDGO and the RNP K-SIDs (runway 07) are not modelled,
- the initial climb in IFR clearances (5000 ft, `initialClimbFt`), as in the VATSIM Germany SOP (also the German transition altitude),
- the squawk codes (a simulator range, not the real code allocation).


**Never use this simulator for real-world navigation.**

### Reference data (research 2026-10-11, checked again 2026-10-21)

Facts collected from public sources to bring the simulation closer to reality. Confidence: **certain** = official body or the airport operator; **likely** = VATSIM Germany SOP or another secondary source (modelled on the real operation, but not the real procedures); **estimate** = derived. Values marked open were not found. The official source for most of them is the AIP Germany AD 2 EDDS (sections 2.13, 2.20, 2.22), which still has to be checked.

| Topic | Value | Confidence / source | In the simulator |
| ----- | ----- | ------------------- | ---------------- |
| Control zone | class D, GND - 3500 ft AMSL; extent roughly 15 NM east-west, 10 NM north-south along the runway axis | likely (VATGER Tower SOP); extent estimate | departures leave the scope at 10 NM |
| Approach / Director | Langen Radar 125.050 and 119.200, Stuttgart Arrival 119.850 (0500-2100 UTC) | certain (AIP AD 2.18) | Langen Radar 125.050; southern departures (ROTWE, SUL, KUNOD, ABTAL) 119.200 - the VATSIM Germany sector split (the AIP SID charts say "contact Langen Radar 125.050" for every SID) |
| Approach -> Tower hand-off | no fixed value; typically when established on the ILS, about 8-10 NM | estimate | 8-10 NM |
| Departure hand-off | VATSIM: auto hand-off (crews call Langen Radar when airborne); north SIDs to sector Stuttgart, south SIDs (ROTWE, SUL, KUNOD, ABTAL) to sector Reutlingen 119.200 | likely (VATGER) | you hand departures to Radar (`contact radar`); the crew reads back the frequency of its SID's sector |
| SIDs | exit fixes ABTAL, DKB, ETASA, GEBNO, KRH, KUNOD, OKIBA, ROTWE, STG, SUL, TAGIK, TEDGO, VESID; restrictions: ETASA only Frankfurt area, KRH only EDDR / EDRZ / EDSB / ETAR / ETIP, SUL jets only EDTL / EDNY / LSZH / LSZR, DKB only via N869 or EDDN / EDTY, GEBNO via Z76 max FL180, TAGIK via ABUMO / ASKIK max FL240, OKIBA min FL200 | likely (VATGER Delivery SOP, chart index) | all but STG / TEDGO; flight plans by destination direction and these restrictions |
| Frequencies | ATIS 126.130 (call sign STUTTGART ATIS), Delivery 121.915, Ground 118.605 (one Ground frequency, no Apron), Tower 118.805 and 119.055 | certain (AIP AD 2.18) | as listed |
| Runway | 3345 m, threshold 07 displaced 300 m; 07: TORA / TODA / ASDA 3345, LDA 3045 m; 25: TORA / TODA 3045, ASDA 3345, LDA 3345 m | certain (AIP AD 2.12 / 2.13) | modelled |
| Approaches | ILS CAT II / III both ways (RVR 75 m); 25 also LOC, VOR and RNP; 07 also RNP (LNAV) - the LOC and VOR approaches 07 only for aircraft up to 5.7 t | certain (AIP AD 2.19, approach charts) | 07 `['ILS', 'RNP']`: with the ILS 07 out of service airliners fly RNP; 25 `['ILS', 'LOC', 'RNP']` |
| Intersection departures | crews are asked for every intersection; smaller aircraft usually C (25) or G (07) | likely (VATGER) | `advise able for departure from intersection ...`; take-off run per type and flight; E (25) and G (07) are entries since 1.2 |
| Take-off run available | 25: A 3045, B 2435, C 2175, D 1990, E 1665 m; 07: K / Y 3345, I 3090, H 2515, W 2520, G 2210, F 2020, E 1400 m | certain (AIP AD 2.13) | the published values, every one an entry |
| Code letter limits, widths | G, E and C max. code letter D; widths A, B, D, F, H, I, K, N, O, S, V 30 m, C, E, G, Y 23 m, W, Z 22.5 m | certain (AIP AD 2.8, aerodrome chart) | modelled (G, E, C 52 m) |
| Planned exits | heavy B (07) / H (25), medium jet D (07) / F (25), medium prop and light jet E (07) / F (25) | certain (AIP AD 2.20) | exits chosen by speed and type |
| Taxi flows | N against the runway direction, S the other way: runway 25 N eastbound / S westbound, runway 07 N westbound / S eastbound | likely (VATGER Ground SOP) | modelled (07 changed on 2026-10-11) |
| Holding bays / de-icing | bypass P1/P2 (max B739/A321); de-icing only on DP1-DP4, all entered from N and left via S (DP1 / DP3 westbound, DP2 / DP4 eastbound); DP1 code E (65 m), DP2 code E plus B747-8 / C-5 (68.5 m, AIP AD 2.20), DP3 / DP4 code C; S closed next to a pad in use | DP1-DP4 certain (A-CDM briefing), rest likely (VATGER SOP and ground radar map) | P1/P2 at the OSM positions; DP1-DP4 at the map positions with these limits since 1.2 (S stays open); de-icing as the scenario option `I` |
| Runway crossings | only between K and Y | likely (VATGER) | automatic routes cross only between K and Y (elsewhere only if K / Y is closed) |
| Taxiway Z | west of Y, reserved for military aircraft | likely (VATGER) | automatic routes avoid it |
| Taxi-out stands | 40-56 taxi out; 61-64 only with the opposite stand free; jet bridges only at 9-16 | likely (VATGER) | 40-48, 50-56 taxi out |
| Stand sizes | 9 up to 60.5 m (9A 60.5-65 m), 11 code D, 24A / 26A / 28A code D-E, 48 30 m, 51 / 53 / 55 / 56 45 m, 52 / 54 code D, 65 29 m, 71A / 74A code E-F (A380 diversions), Apron South 100-104 code D, 206 / 207 code E-F | likely (VATGER ground radar stand data) | modelled since 1.2 |
| Simultaneous pushbacks | at least two stands between them | likely (VATGER) | AI Ground: nothing taxiing within 250 m |
| Initial climb / transition | climb via SID to 5000 ft; transition altitude 5000 ft, transition level in the ATIS | likely (VATGER) | 5000 ft; TL from the QNH: FL60 from 1013 hPa, FL70 below (the lowest flight level at least 1000 ft above the transition altitude) |
| Capacity | max. 48 movements/h (40 departures without arrivals; 40 arrivals with max. 8 departures), 14 in LVP | likely (VATGER) | traffic densities below that |
| Traffic 2025 | 95 765 movements, 9.6 million passengers | certain (aerotelegraph) | - |
| Runway direction | 2025: 55 % of departures to the west; long-term average 60/40 west/east | certain (RP Stuttgart noise report) | session wind 60 % westerly |
| Night restrictions | no jet departures 23:00-06:00, no landings 23:30-06:00 (delayed landings until 24:00); the same for propeller aircraft not meeting the noise standards | certain (AIP AD 2.20 2.1, Flughafen Stuttgart) | adopted as the scenario option *night flying restrictions* (`nightRestrictions`, time zone Europe/Berlin); exemptions not modelled |
| A-CDM | TOBT from 90 min before EOBT, TSAT published 40 min before TOBT; start-up within TSAT ±5 min; push / taxi at the latest 5 min after start-up approval; TOBT changeable 3 times after the TSAT | certain (STR A-CDM flight crew briefing) | start-up at TSAT ±5 min |
| IFR clearance (Germany) | `cleared to Frankfurt, ETASA4B departure, flight planned route, climb via SID to altitude 5000 feet, squawk 1000` | likely (VATGER Delivery SOP) | used since 2026-10-11 (the older short form is still understood) |
| Conditional clearance | `SAS941, behind DC9 on short final, line up behind` (ICAO Doc 4444 12.2.7) | certain | understood; menu: `behind landing X, line up and wait behind` |
| "Expect late landing clearance" | not a DFS / ICAO standard phrase; German practice is to not withhold the landing clearance when the runway will be clear at the threshold | open / likely | kept as an extra phrase |
| LVP | preparation at RVR < 1000 m and / or ceiling <= 300 ft; in force at RVR <= 600 m and / or ceiling < 200 ft (or taxiing in RVR < 550 m); CAT IIIa / b and low-visibility take-offs both ways; stop bars at the CAT II / III holding positions | certain (AIP AD 2.22) | not modelled yet |

Sources: [VATSIM Germany EDDS SOPs](https://knowledgebase.vatsim-germany.org/books/sops-fir-langen/page/overview-SL5) (Tower, Ground, Delivery, Arrival), [STR A-CDM Flight Crew Briefing](https://www.munich-airport.de/_b/0000000000000007901533bb5dd3f2ee/str-flightcrew-brief-en.pdf), [SkyVector EDDS](https://skyvector.com/airport/EDDS/Stuttgart-Airport), [BAV EDDS briefing](https://files.bavirtual.co.uk/bavirtual-docstore/om-c/aerodrome-briefings/europe/EDDS.pdf), [RP Stuttgart noise report 2025](https://rps.baden-wuerttemberg.de/fileadmin/RP-Internet/Themenportal/Verkehr/Luftverkehr/_DocumentLibraries/Documents/Jahresberichte_Laermschutzbeauftragter/46_lsb2025.pdf), Flughafen Stuttgart noise reports, aerotelegraph, SKYbrary (LVP), ICAO Doc 4444.

## Stations

| Callsign    | Radio name            | Frequency | Simulated by     |
| ----------- | --------------------- | --------- | ---------------- |
| **EDDS_DEL** | **Stuttgart Delivery** | **121.915** | **You** (since v0.6), or AI: clearances are then issued before the aircraft calls Ground |
| **EDDS_GND** | **Stuttgart Ground** | **118.605** | **You**, or AI Ground when you only staff Delivery |
| EDDS_TWR    | Stuttgart Tower       | 118.805 (also 119.055) | AI Tower |
| EDDS_APP    | Langen Radar          | 125.050 (sector Stuttgart); 119.200 for the southern departures (sector Reutlingen) | (not simulated) |
| EDDS_ATIS   | Stuttgart Information | 126.130   | You (ATIS editor) |

## Systems and procedures

Stuttgart has been a **full A-CDM airport** since November 2014 (TOBT from the airlines, TSAT from the pre-departure sequencer, start-up at the TSAT) and offers **departure clearance by datalink (DCL)**; start-up is requested by voice. The simulator gives EDDS all [systems](../systems.md): A-SMGCS surveillance, RMCA, CATC and routing (the services offered for training; which A-SMGCS levels are installed at Stuttgart is not modelled from a published source), A-CDM, DCL and the ILS (localizer and glide path) of the runway in use.

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
  -262   Z --- R --- V ------(stands 100-104, 206, 207, Apron South)--- W
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
| **Z / R / V** | South: Z runs from L3/O around the 07 end to R (reserved for military aircraft - automatic routes avoid it); R to Y; V along Apron South to W |
| **P1 / P2** | Holding bays at the 25 end: angled links from N down to S just before A (code C, wingspan up to 36 m) |
| **DP1-DP4** | De-icing pads between N and S: DP1 / DP2 between I and H, DP3 / DP4 between H and F, see below |

Holding points carry the name of their taxiway (`holding point A`, `holding point K`, ...). The 07 end has K (north) and Y (south); H and W share one runway entry.

**Closing taxiways** (scenario option, e.g. for construction works): every taxiway can be closed except **N**, **O**, **V** and **A** - they are the only way to or from some stands (N: stands 50-56 and 71-75; O: 40-48; V: Apron South) or the only full-length entry of runway 25 (A). Closing several at once is checked in the scenario builder. The preset *Construction works* closes E and S: departures and arrivals then share N.

### Holding bays and de-icing pads

- **P1 / P2** (bypass): two angled links from N down to S at the 25 end - P1 from N 2998 m to S 3123 m, P2 from N 3104 m to S 3230 m from the 07 end (OpenStreetMap) - limited to code C (36 m wingspan; the SOP says max. B739 / A321). A departure that is not ready can wait on P1 or P2 while the next one passes it via S to A (re-sequencing), or use them as `taxi to holding point A via N, P1, S`.
- **DP1-DP4** (de-icing pads, positions from the VATSIM Germany ground radar map): drive-through bays between N and S, **all entered from N and left onto S** along their painted lead lines - DP1 (N 246 m -> S 124 m from the 07 end) and DP3 (N 767 m -> S 717 m) lead west, DP2 (N 364 m -> S 450 m) and DP4 (N 793 m -> S 885 m) east. Wingspan limits: **DP1 65 m** (code E, no B747), **DP2 68.5 m** (code E plus B747-8 / C-5, AIP AD 2.20), **DP3 and DP4 36 m** (code C) - every aircraft in the simulator fits DP1 or DP2. The lead lines allow no sharp turn: eastbound on N (from the circle) DP2 and DP4 lie ahead to the right, DP1 is entered westbound (from H or M). After the pad, runway 25 departures from DP2 / DP4 continue on S towards A; runway 07 departures from DP1 / DP3 on S towards K (from DP2 the sharp left onto H and N, from DP4 via F and N). In reality S is closed next to the pads in use (I-H for DP1 / DP2, H-F for DP3 / DP4); the simulator keeps it open. Used in the scenario option [de-icing](../scenarios.md#de-icing).

### Standard taxi flows

To keep traffic on the two parallel taxiways from meeting head-on, they are used one-way: **N against the runway direction, S the other way** (as in the VATSIM Germany SOP). Automatic routes (pilots without a `via` list, the *Taxi to* menu and the quick-action bar) follow these directions strictly; only if that is impossible without a 180 degree turn they use a taxiway against the flow:

| Runway in use | N         | S         | Idea                                                        |
| ------------- | --------- | --------- | ----------------------------------------------------------- |
| 25            | eastbound | westbound | departures on N to A, arrivals from F/G/E/H on S to the aprons |
| 07            | westbound | eastbound | arrivals from E/D/C/A west on N to the aprons, departures to K via M, L2 (or west on N from 50-56) |

The directions follow the VATSIM Germany SOP (modelled on the real operation, not a published procedure). Your own `via` instructions are always followed as given.

### Runway entries and exits

| Runway | Departure holding points                                  | Arrival exits (from the threshold onwards)                                |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **25** | **A** (full length); B, C, D, E (intersections)           | F (rapid), E, G, H (rapid), W (south), I (rapid), K, Y (south)            |
| **07** | **K** / **Y** (full length, north / south); I, H, W, G (intersections) | G, E, D (rapid), C, B (rapid), A                             |

**Vacate points** (where an arrival stops after leaving the runway and waits for your taxi instruction) lie between the runway holding position and the next taxiway. Behind F and G they are on the short connector before the F/G junction, clear of taxiway S, so a waiting arrival does not block traffic on S (approximation of the real geometry).

**Take-off run available** (published values): runway 25 from A **3045 m** (the 300 m behind the displaced threshold 07 do not count for take-offs 25), B 2435 m, C 2175 m, D 1990 m, E 1665 m; runway 07 from K / Y 3345 m, I 3090 m, H 2515 m, W 2520 m, G 2210 m. This decides the pilots' answer to `advise able for departure from intersection ...`. Smaller aircraft usually depart from C (25) or G (07).

About 85% of arrivals vacate to the north. On runway 25 the others vacate to the south via W or Y. They then need a **runway crossing** to reach Apron North, unless they park on Apron South - **only between K and Y** (VATSIM Germany SOP): automatic routes cross there (elsewhere only if K or Y is closed); your own `via` list may cross elsewhere.

### Stands

| Apron / area   | Stands        | Max. wingspan | Type                                  | Lane |
| -------------- | ------------- | ------------- | ------------------------------------- | ---- |
| Apron North    | 9-19          | 36 m; **9 60.5 m**, **11 52 m** | nose-in, pushback (jet bridges 9-16) | M    |
| Apron North    | **9A**        | 65 m          | wide-body position overlapping 9      | M    |
| Apron North    | 24-29         | 36 m          | nose-in, pushback                     | M    |
| Apron North    | **24A, 26A, 28A** | 65 m      | code D-E positions overlapping 24+25, 25+26, 28 | M |
| Apron North    | 30-36         | 36 m          | nose-in, pushback                     | M (code C section) |
| Apron North    | 60-65         | 36 m (65: 29 m) | nose-in (nose south), pushback      | M (code C section) |
| Apron North    | 71-75         | 36 m          | nose-in, pushback onto N              | N    |
| Apron North    | **71A, 74A**  | 80 m          | code E-F positions overlapping 71+72 / 74+75, pushback onto N (A380 diversions) | N |
| Apron North    | 40-48         | 36 m (48: 30 m) | **drive-through**: in from M, out forwards to O | M -> O |
| Apron North    | 50-56         | 50: 36 m, 51 / 53 / 55 / 56: 45 m, 52 / 54: 52 m | **drive-through**: in from M, out forwards to N | M -> N |
| Apron South    | 100-104       | 52 m          | nose-in (nose south), pushback (cargo) | V   |
| Apron South    | **206, 207**  | 80 m          | nose-in, pushback (cargo wide-bodies; the former 105 / 106) | V |

**Stand sizes - sources.** The current ground movement chart (AMDT 10/26) marks taxilane M east of the H junction as *max. code letter C* (wingspan below 36 m) and shows the alternative positions 9A, 24A, 26A, 28A, 71A and 206/207 (overlapping their neighbours). The per-stand limits come from the stand data of the VATSIM Germany ground radar (2026), which follows the airport's stand allocation: code letters or wingspan ranges per stand, the overlapping positions and the AIRAC 2512 changes on Apron South (100-104 moved, 105 / 106 renamed 206 / 207). The older aircraft parking/docking chart (AMDT 09/13) confirms that nose-in positions 9-36 and 100-107 are left by pushback and 40-56 are taxi-out positions. Stand 44 exists again (it was missing before 1.2); stands 45-48 are currently blocked by construction works in reality (AIP SUP until 30 October 2026), which the simulator ignores.

**Alternative positions block their neighbours** (wingtip clearance, see [simulation model](../simulation.md)): a wide-body on 71A blocks 71 and 72 (and an aircraft on 71 or 72 blocks 71A), likewise 74A with 74/75, 9A with 9, 24A with 24 and 25, 26A with 25 and 26, 28A with 28. Narrow-bodies use them only when nothing else is free.

Departures on drive-through stands don't need a pushback: they call `request taxi` and leave forwards. The stand allocation prefers Apron North; business jets go to stands 60-65. Apron South is only used when Apron North is full, but you can taxi any aircraft there.

## SIDs

Every flight plan is filed via the exit fix towards its destination (great-circle bearing from Stuttgart); fixes restricted to a few destinations are only used for them. The designators are those of 2026 (B = runway 25, H = runway 07; the numbers change with the AIRAC cycle):

| Exit fix | Runway 25 / 07 | Used for (simulator) | Radar after take-off |
| -------- | -------------- | -------------------- | -------------------- |
| VESID    | VESID4B / VESID2H | destinations 255-340° (UK, Ireland, Benelux, Paris) | Langen Radar 125.050 |
| OKIBA    | OKIBA4B / OKIBA4H | 340-045° (Hamburg, Bremen, Berlin, Scandinavia; min. FL200) | 125.050 |
| TAGIK    | TAGIK4B / TAGIK2H | Duesseldorf, Cologne, Moenchengladbach, Paderborn, Dortmund, Muenster (via Frankfurt area, max. FL240) | 125.050 |
| ETASA    | ETASA4B / ETASA2H | Frankfurt (EDDF, EDFE, EDFC, ETOU) | 125.050 |
| KRH      | KRH5B / KRH2H     | Saarbruecken, Karlsruhe / Baden-Baden, Ramstein, Pirmasens (EDDR, EDRZ, EDSB, ETAR, ETIP) | 125.050 |
| DKB      | DKB9B / DKB4H     | Nuremberg area (EDDN, EDTY) | 125.050 |
| GEBNO    | GEBNO7B / GEBNO6H | short flights via Z76 below FL180 - not used by the generated traffic | 125.050 |
| ABTAL    | ABTAL4B / ABTAL4H | 045-110° (Munich, Vienna, Budapest, Poland, Romania) | sector Reutlingen 119.200 |
| KUNOD    | KUNOD2B / KUNOD2H | 110-190° (Italy, Balkans, Greece, Turkey, Egypt) | 119.200 |
| ROTWE    | ROTWE5B / ROTWE7H | 190-255° (Spain, Portugal, Canaries, southern France, Geneva, Morocco) | 119.200 |
| SUL      | SUL3B / SUL3H     | jets to Zurich, Friedrichshafen, Lahr, Altenrhein (LSZH, EDNY, EDTL, LSZR) | 119.200 |

The restrictions (ETASA, KRH, SUL, DKB, GEBNO, TAGIK, OKIBA) are those of the VATSIM Germany Delivery SOP; the sectors in between are the simulator's approximation of the route network. Delivery checks that the cleared SID leads to the first fix of the flight plan. Not modelled: the local IFR SIDs STG and TEDGO and the RNP K-SIDs of runway 07.

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
| Apron South, pushed facing west       | `taxi to holding point A via V, Y, K, N, cross runway 25` (crossings only between K and Y) |
| Arrival vacated via F, G or E         | `taxi to stand 14 via S, H, M` / `taxi to stand 72 via S, H, N` |
| Arrival vacated via H                 | `taxi to stand 33 via H, M`                                    |
| Arrival vacated via W (south)         | `taxi to stand 206 via V`                                      |

**Runway 07**

| From                                  | Instruction                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| Stands 9-19, pushed facing east       | `taxi to holding point K via M, L2`                            |
| Stands 9-19, pushed facing west       | `taxi to holding point K via M, L3, O`                         |
| Stands 30-36, pushed facing west      | `taxi to holding point K via M, L2`                            |
| Stands 24-29, pushed facing west      | `taxi to holding point K via M, L2`                            |
| Apron South, pushed facing west       | `taxi to holding point Y via V`                                |
| Arrival vacated via D, C or E         | `taxi to stand 30 via N, H, M` / `taxi to stand 14 via N, H, M` |

### Ground planning tips

- Taxilane **M** is a single lane used in both directions. Push departures so that they leave in the direction they will taxi. Use `give way` or conditional clearances (`behind the A320 passing left to right, push and start approved`) when arrivals are coming in on M.
- The **circle** west of N/S (a hot spot on the chart) joins N, S, O, K, I and L2. Avoid sending two aircraft through it at the same time.
- Keep the vacate points behind the exits free. The Tower won't use an exit whose vacate point is blocked, which costs runway capacity.
