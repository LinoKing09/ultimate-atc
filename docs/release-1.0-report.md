[Documentation](README.md) › Release report 1.0

# Release report: version 1.0

Final review before version 1.0 (2026-10-13). It checks the [Road to 1.0](roadmap.md#road-to-10) criteria, lists what was tested and fixed during the review, assesses how realistic the simulation is, and names what is still open.

**Released as 1.0.0 on 2026-10-13** on the project owner's decision. The iPad performance check (below) was left to play on the device after the release; no device measurement was made.

- [Summary](#summary)
- [Criteria](#criteria)
- [How it was checked](#how-it-was-checked)
- [Found and fixed during the review](#found-and-fixed-during-the-review)
- [Realism review](#realism-review)
- [Known limitations](#known-limitations)
- [Statistics](#statistics)
- [Open points at the release](#open-points-at-the-release)
- [After 1.0](#after-10)

---

## Summary

**Recommendation: ready for 1.0 once the iPad check is done.** Three of the four criteria are met with measurements. The fourth is met except for one point that can only be checked on the device: the iPad performance (see [Open points at the release](#open-points-at-the-release)).

- Delivery, Ground and Tower are playable at Stuttgart, alone and in every combination, with AI for the positions you don't staff.
- 142 automated tests, the release benchmark (Ground and Tower) and the 20-hour soak test pass: **no collision, no runway incursion**; go-arounds only after a random rejected take-off.
- The review found and fixed six problems (runway occupied too long after landing, a line-up dead end, a silent departure, the ATIS transition level, rejected take-offs, touch menus).
- The documentation is complete and all internal links work.

## Criteria

| # | Criterion | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | **Stuttgart complete**: Delivery, Ground, Tower, each alone and combined, realistic procedures, phraseology and AI | **met** | Diagnostic runs of Delivery, Ground + Tower and all three combined (two seeds each, both runways) without errors or collisions; AI Delivery / Ground / Tower in every session where a position is not staffed; Stuttgart reference data with sources in [EDDS](airports/EDDS.md) |
| 2 | **No dead ends**: pilots solve simple conflicts; remaining deadlocks have a clear way out; no collisions in the soak test | **met** | Crews stop and ask, give way at intersections (since 0.8); every head-on stand-off offers *Resolve conflict* (turn-off or tug); the one dead end found in the review (K/Y line-up) is fixed; soak test 20 h: 0 collisions |
| 3 | **Training**: tutorial per position, scenario presets, debriefing | **met** | Tutorials for Delivery, Ground and Tower (played automatically by a test), 10 presets, scenario builder with five-step sliders and conditions (night rules, closures, thunderstorm), debriefing with points, waits, incidents and tips |
| 4 | **Quality**: soak test clean, performance budget on an iPad, documentation complete, benchmark statistics | **met except the iPad measurement** | Soak test clean (0 collisions / 0 incursions); documentation updated for every change, link check without errors; statistics in [benchmarks.md](benchmarks.md#major-release-statistics); iPad: see below |

## How it was checked

| Check | Result |
| ----- | ------ |
| Test suite (`npm test`): 142 tests, about 24 h of simulated traffic per run | all pass |
| Type check, production build | pass |
| Release benchmark (Ground, 20 x 1 h) | 14.0 departures / 7.2 arrivals per hour, 0 collisions, 0 incursions, 0 go-arounds |
| Tower benchmark (20 x 1 h) | 11.2 departures / 10.5 arrivals to Ground per hour, 0 incidents, 0 separation losses, 0 missed hand-offs |
| Soak test (20 x 1 h, special events, more heavies) | 12.9 / 7.0 per hour, 0 collisions, 0 incursions, 2 go-arounds (one rejected take-off) |
| Diagnostic runs: Delivery alone, Ground + Tower, all three; thunderstorm (Ground, Tower); closed taxiways (Ground, Tower); night rules (Ground, Tower, 2 h); density step 4; special events "often"; arrival rush; AI only (2 h) | no errors, no collisions; problems found are listed below |
| Tutorials | each played automatically with its example instructions; no instruction refused |
| Browser (Chromium, desktop and phone size with touch emulation) | login, scenario builder, tutorial panel, menus, quick-action bar checked with screenshots |
| Documentation | every page updated with its feature; all relative links and anchors resolve |
| Performance | PC: 60 fps, 2.6 ms of JavaScript per frame at 8x with 25 aircraft (0.5 ms simulation, 2.0 ms scope). With the CPU throttled 4x: about 23 ms per frame. Not measured on an iPad |

The automatic controllers of the benchmark and the diagnostic runs are deliberately simple: they never answer "blocked" or "opposite traffic" calls. Aircraft that stayed blocked in those runs (mostly with closed taxiways or a thunderstorm) waited for an instruction that a controller - or the AI Ground - gives; they are not simulator dead ends.

## Found and fixed during the review

| Problem | Effect | Fix |
| ------- | ------ | --- |
| Landing aircraft crept along the exit at 10 kt inside the protected runway area | the next arrival sometimes went around (the "4 go-arounds" of the earlier soak tests) | exit speed is kept until behind the holding point; benchmark +0.3 departures and +0.4 arrivals per hour |
| Departures from K and Y (same runway point at the 07 end) cleared at the same moment | both lined up nose to nose and blocked the runway for good (5 go-arounds in one test session) | an aircraft lining up nearby blocks the line-up |
| A departure whose take-off was refused (thunderstorm) | never called Tower again | calls again after 150 s; reminders on the way to the holding point name it |
| ATIS | always `transition level 70` | follows the QNH (FL60 from 1013 hPa, FL70 below) |
| Rejected take-off | rolled on at the speed it had when stopped | brakes at once to 25 kt, takes the next exit |
| Touch menus | a sub-menu opened on top of its menu, one tap selected entries in both | sub-menus open on a tap beside the menu or below the row; taps right after opening are ignored |

Also changed in this cycle on request: the red CATC alert only when both aircraft roll towards each other, intersection line-ups (an aircraft lined up at A does not block a departure from B), shorter tutorial texts, one-time buttons leave the quick-action bar.

## Realism review

Rated against ICAO / German practice and the Stuttgart data in [EDDS](airports/EDDS.md). **Realistic** = matches real procedures within the simulator's level of detail; **simplified** = deliberately simpler, documented; **not modelled** = left out.

| Area | Rating | Notes |
| ---- | ------ | ----- |
| Aerodrome layout, holding points, stands, taxi flows (both runways) | realistic | digitised from the AIP charts (±10 m), flows as in the VATSIM Germany SOP |
| Runway use (60 % 25 / 40 % 07), runway in use from the wind, tailwind limits | realistic | long-term Stuttgart average |
| IFR clearance (German form), SIDs, squawks | realistic / simplified | SID first fixes and letters real, numbers approximate; squawk range is a simulator range |
| A-CDM (TOBT, TSAT), CTOT window -5 / +10 min, DCL | realistic | as in European A-CDM / Network Manager practice |
| Pushback, start-up, taxi speeds, turning limits (no 180° turns for airliners), wingtip clearance on stands | realistic | |
| Departure separation (2 min behind heavy / same SID, 1 min diverging), wake turbulence distances on final, reduced runway separation | realistic | ICAO PANS-ATM values, see [tower operations](tower-operations.md) |
| Line-up and wait, conditional line-up, intersection departures with "able" check | realistic | |
| Landing roll, exit choice and exit speeds, go-around logic | realistic (after the review fix) | |
| Rejected take-off | realistic (after the review fix) | |
| Phraseology and read-backs | realistic | ICAO with German usage; the parser accepts common variations |
| ATIS content | realistic (after the review fix) | transition level from the QNH |
| Night flying restrictions | realistic | Flughafen Stuttgart rules; exemptions not modelled |
| Thunderstorm | simplified | one storm cell with fixed phases; gust front, lightning stop, windshear and tailwind go-arounds as in practice |
| Closed taxiways | simplified | whole taxiways only, no partial closures |
| Approach / Radar | simplified | arrivals appear on final and are spaced by the simulator; departures leave at 10 NM |
| Traffic mix | realistic | airline shares and destinations of Stuttgart 2024 / 2025 |
| Low visibility procedures, CAT II/III holding points, de-icing (DP1-DP4), holding bays P1/P2, GA apron, crosswind limits | not modelled | listed under [After 1.0](#after-10) |

## Known limitations

- **iPad performance** is not measured on the device (only in a desktop browser with a throttled CPU).
- **AI Tower after a rejected take-off**: in one soak session the aircraft that had rejected its take-off later lined up again and an arrival went around. Rare (special events only) and realistic in effect, but the AI could plan that line-up better.
- **Voice**: text-to-speech and speech recognition are switched off (`VOICE_ENABLED = false`); the code is there and needs a new test on the iPad.
- **Real-world data**: SID numbers and the squawk range are approximations; the layout is accurate to about ±10 m. Not for real-world navigation.
- **Simple benchmark controllers**: the benchmark numbers measure the simulation, not good controlling; a human controller handles more traffic.

## Statistics

![Release benchmark from 0.1 to 1.0](images/benchmarks-1.0.svg)

See [benchmarks.md](benchmarks.md#major-release-statistics): since 0.4 (the benchmark baseline) +4 % departures and +38 % arrivals per hour, still 0 collisions, 0 incursions and 0 go-arounds in the benchmark, computing time down from 13.8 to 6.2 s per simulated hour; since 0.1 three times the departures, twice the arrivals, collisions 11 → 0, go-arounds 53 → 0. About **2730 hours** of traffic have been simulated during development (1480 h exactly measured).

## Open points at the release

The project owner released 1.0 before these checks; they remain the first things to watch in play.

1. **iPad check by the project owner**: one session of about 30 minutes in mobile mode with heavy traffic at 4x / 8x - smooth scrolling and zooming, menus and quick-action bar, no lag. This closes the performance criterion.
2. **A short play test** of the review fixes on the iPad: landing roll and exits, a rejected take-off (`stop immediately`), intersection line-ups, touch menus.
3. **Release steps**: done - version 1.0.0 in `package.json`, `CHANGELOG.md` section `[1.0.0]`, the statistics section in `benchmarks.md` final with the [benchmark chart](images/benchmarks-1.0.svg), roadmap updated, tag `v1.0.0`.

## After 1.0

Wishes and ideas collected so far (roadmap, 1.x):

- Holding bays P1/P2 and de-icing pads DP1-DP4
- Low visibility procedures (LVP) with CAT II/III holding points, take-off run available from the intersections (values from the AIP, supplied as text)
- Text-to-speech and speech recognition tested again and switched back on
- Smarter AI Tower after a rejected take-off; partial taxiway closures; a taxiway blocked during the session
- Further airports (EDDF first), then the Approach / Departure position
