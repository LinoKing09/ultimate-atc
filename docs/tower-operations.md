# Tower operations: how departures and arrivals share a runway

This page summarises how tower controllers manage a **single runway in mixed mode** (departures and arrivals on the same runway, as at Stuttgart). It covers the separation minima involved and how the simulator's AI Tower implements them. It is the background for the [AI Tower rules](simulation.md#ai-tower).

> These are simplified, publicly documented rules for a simulator. Real minima depend on the state's AIP, local procedures, weather and the wake category scheme in use (ICAO legacy categories or RECAT-EU). The exact current values are in ICAO Doc 4444 (PANS-ATM). Several figures below come from secondary sources and are marked as such.

## 1. The three separations that limit a single runway

### 1.1 Departure behind departure

Two consecutive departures need **both**:

- **Wake turbulence separation** (time-based, measured between airborne times). Behind a *Heavy*, the following departure needs **2 minutes**, or **3 minutes** if it starts from an intermediate point (intersection) of the runway. In this case ICAO adds one minute. The UK CAA applies the same idea: 2 min Heavy behind Heavy and Medium behind Heavy, 3 min behind an A380. [1][2]
- **Route separation** after take-off. If the departure routes diverge immediately after take-off (for example ≥ 45° different headings), departures can follow each other closely, typically **1 minute**. On the same route the spacing must be larger, typically **2 minutes** or a radar distance. [3][5]

  VATSIM Germany's Braunschweig SOP, for example, uses **3 NM** (or wake turbulence, whichever is greater) between departures, and **5 NM** when both use the same SID waypoint. [5]

### 1.2 Arrival behind arrival

On final approach, arrivals are separated by radar distance:

- **Radar minimum** of 5 NM, which the ATS authority can reduce to **3 NM**. Under specific conditions it can be reduced to **2.5 NM** on the same final within 10 NM of the threshold: runway occupancy times are monitored, exits are suitable, and braking action is good. [4]
- **Wake turbulence minima** (legacy ICAO categories): Heavy behind Heavy 4 NM, Medium behind Heavy 5 NM, Light behind Heavy 6 NM, Light behind Medium 5 NM. This table comes from a training source and should be checked against Doc 4444. [6]
- Since November 2020 ICAO also allows **seven new wake turbulence groups** (by MTOW and wingspan) instead of the legacy categories. [7]

### 1.3 Runway separation (who may be on the runway)

- A **landing** aircraft may only cross the threshold when the preceding landing aircraft has vacated the runway and the preceding departure is airborne and has passed the end of the runway, or has started a turn.
- **Reduced Runway Separation Minima (RRSM)**, Doc 4444 §7.11, where approved: a landing aircraft may cross the threshold when the preceding aircraft is **airborne and has passed a point at least 2400 m** from the threshold. For a preceding landing aircraft, the condition is that it has passed 2400 m, is still moving, and will vacate without backtracking. This applies to the heavier "Category 3" aircraft. States add conditions, such as daylight, visibility ≥ 5 km and tailwind ≤ 5 kt. [8][9]
- RRSM is **not** applied between a departure and a *preceding landing* aircraft. A departure waits until the landing aircraft has vacated. [8]
- **Line-up clearance is not a take-off clearance.** If a departure is lined up to use a gap, it should be told to be ready for an immediate departure. The time lined up should be short: the rate of missed approaches and simultaneous runway occupancy grows with the time between line-up and start of roll. [10]

## 2. Mixed-mode flow: making gaps

On a single runway, every departure needs a **gap** between two arrivals large enough for:

```
line-up (30-40 s)  +  take-off roll until airborne and clear (~45-55 s)  +  buffer
```

At a typical final approach speed of 140 kt (about 26 s per NM), that is roughly **4-5 NM** of final. Add the runway occupancy time of the preceding landing aircraft (about 50-60 s until it has vacated), and two arrivals need to be about **6 NM apart** to fit one departure in between.

This is exactly what busy airports do:

- VATSIM Germany's Berlin SOP sets target spacings on final of **6 NM when departures are expected**, 3 NM when there are none, and 5 NM in low visibility. Tower may ask Approach for wider spacing to release departures, and must "use every gap sufficient for departing traffic". [11]
- The BEA report on a Lyon-Saint-Exupéry incident shows the risk of mixed mode: no minimum interval was defined for inserting a departure, and the controller had no aids for managing arrival-departure separation. [12]

**Techniques that increase throughput:**

1. **Line up behind landing traffic**: "behind the landing A320, line up and wait behind". The departure taxis onto the runway as soon as the landing aircraft has passed its entry, and takes off once that aircraft has vacated.
2. **Line up behind a departure**: the next departure lines up while the previous one is rolling.
3. **Use the departure route split**: alternate departures on diverging SIDs (1 minute) instead of the same SID (2 minutes).
4. **Intersection departures** for light or medium aircraft that don't need the full length. This gives a shorter roll and a quicker entry. Behind a heavy it costs an extra minute of wake separation.
5. **Ask Approach for gaps** when the departure queue grows (6 NM, more for longer queues), and close the gaps again when it is empty.
6. **Ground**: deliver departures to the holding point in a sensible order (mix SIDs, keep heavies apart), and keep the vacate points behind the exits free, so landing aircraft can clear the runway quickly.

## 3. What the simulator does

| Rule | Implementation (see `src/core/tower.ts`, `src/core/traffic.ts`) |
| ---- | ---------------------------------------------------------------- |
| Departure wake separation | 120 s after a heavy became airborne, 180 s from an intersection |
| Departure route separation | 60 s for different first SID fix, 120 s for the same fix |
| Line up and wait | Allowed when the separation will be met within 45 s, behind a rolling departure, or behind a landing aircraft that is > 300 m past the entry |
| Immediate departure | Take-off 3-8 s after lining up |
| Take-off vs. arrival | Next arrival more than `roll time + 8 s` (about 2 NM) from the threshold |
| Line-up vs. arrival | Next arrival far enough out for line-up + remaining separation + roll + 15 s (about 4-5 NM) |
| Landing vs. runway | Go-around at 0.5 NM if the runway is occupied; a departure already beyond 1200 m / 100 kt is accepted (RRSM-like) |
| Landing vs. landing | The preceding landing aircraft must have vacated |
| Arrival spacing | max(wake minimum, 4 NM; 6 NM with departures waiting; 8 NM with four or more) |
| Emergencies | No line-ups while an emergency arrival is within 8 NM |
| Exit choice | Skips exits whose vacate point is blocked by a waiting aircraft |

**Effect** (automatic controller test, EDDS runway 25, two hours of heavy traffic):

| Measure                              | Before (v0.1) | After |
| ------------------------------------ | -----------: | ----: |
| Mean wait at the holding point       |       ~336 s | ~110 s |
| Departures airborne                  |            7 |    20 |
| Go-arounds                           |           18 |     0 |

Many v0.1 go-arounds were caused by [gridlock](glossary.md), so the before figures are pessimistic. The model now behaves like a reasonable single-runway operation.

## Sources

1. EUROCONTROL / SESAR: *Reduced wake turbulence separation minima between departures from closely spaced runway entry taxiways* (2025), summarising the Doc 4444 departure minima - https://www.sesarju.eu/sites/default/files/documents/sid/2025/pres/Reduced%20wake%20turbulence%20separation%20minima%20between%20departures%20from%20Closely%20Spaced%20Runway%20Entry%20Taxiways.pdf
2. SKYbrary: *Separation Standards* - https://skybrary.aero/index.php/Separation_Standards
3. FAA JO 7110.65, Section 6-5 (Lateral separation, diverging headings ≥ 45°) - https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap6_section_5.html
4. SKYbrary: *Separation Standards* (surveillance minima 5 / 3 / 2.5 NM) - https://skybrary.aero/index.php/Separation_Standards
5. VATSIM Germany Knowledgebase, FIR Bremen tower SOPs - https://knowledgebase.vatsim-germany.org/books/sops-fir-bremen/page/tower-V2K
6. IVAO: *Wake turbulence separation minima* (training material, secondary) - https://wiki.ivao.aero/en/home/training/documentation/Wake_turbulence_separation_minima
7. ICAO APAC: *ICAO Wake Turbulence Groups* (2023 RECAT webinar) - https://www.icao.int/sites/default/files/APAC/Meetings/2023/2023%20RECAT%20Webinar/5-Presentations/1.ICAO-Wake-Turbulence-Groups.pdf
8. FAA presentation at the ICAO APAC Capacity Assessment Workshop 2025: *How can runway occupancy time be reduced* (quotes Doc 4444 §7.11 RRSM) - https://www.icao.int/sites/default/files/APAC/Meetings/2025/2025%20Capacity%20Assessment%20WS/Day%202/SP-09-How-Can-Runway-Occupancy-Time-Be-Reduced-FAA.pdf
9. IFALPA position paper 19POS07: *Reduced runway separation minima for night operations* - https://ifalpa.org/media/3415/19pos07-reduced-runway-separation-minima-for-night-operations.pdf
10. SKYbrary: *Line-up* / *Immediate take-off clearances* - https://skybrary.aero/articles/immediate-takeoff-clearances
11. VATSIM Germany Knowledgebase, Berlin tower SOP (approach target spacing, use of departure gaps) - https://knowledgebase.vatsim-germany.org/books/sops-fir-bremen/page/tower-PmY/revisions/5881
12. BEA: Investigation report on the serious incident at Lyon-Saint-Exupéry (mixed-mode runway) - https://bea.aero/fileadmin/user_upload/PH-EXH_EN.pdf
