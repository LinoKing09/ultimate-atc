# Benchmarks and release statistics

Every **major release** (1.0, 2.0, ...) gets a statistics section here that shows how much faster, safer and better the simulator has become since the previous major release. Minor releases are measured too, so the trend is visible.

- [How it is measured](#how-it-is-measured)
- [Results by version](#results-by-version)
- [Simulated traffic](#simulated-traffic)
- [Major release statistics](#major-release-statistics)

---

## How it is measured

`npm run benchmark` runs the **release benchmark** (`tests/benchmark.test.ts`): 20 sessions of one hour (runways 25 and 07, seeds 1-10, medium traffic, no special events) with the same simple automatic controller in every version:

- approves pushbacks when nothing taxis within 250 m, sends departures to the runway with the shortest route (`taxi to runway 25`), sends arrivals to their suggested stand, hands departures to Tower when they ask,
- never sequences, never re-routes, never resolves a deadlock.

So the numbers measure the **simulation**, not good controlling: a human controller does much better. They are comparable between versions because the controller and the sessions are always the same. `npm run soak` runs a harder variant with special events and more heavies.

| Measure | Meaning |
| ------- | ------- |
| Departures / h | Departures airborne per hour (average of 20 sessions) |
| Arrivals / h | Arrivals parked per hour |
| Collisions, incursions, go-arounds | Total over all 20 hours |
| Deadlock calls / h | Pilot calls "opposite traffic" / "blocked by" per hour (the automatic controller never answers them, so a deadlock keeps calling) |
| Computing time | CPU time per simulated hour (Node.js 22, one core of a 2.1 GHz Xeon). The browser at 8x needs 8 simulated hours per real hour |

## Results by version

Measured on 2026-10-08 with the same benchmark for every version (older versions checked out from git):

| Version | Departures / h | Arrivals / h | Collisions | Incursions | Go-arounds | Deadlock calls / h | Computing time / sim. hour |
| ------- | -------------: | -----------: | ---------: | ---------: | ---------: | -----------------: | -------------------------: |
| 0.1.0   | 4.7  | 3.6 | 11 | 0 | 53 | 16.0 | 1.4 s |
| 0.2.0   | 10.2 | 5.7 | 0  | 0 | 0  | 13.1 | 1.9 s |
| 0.3.0   | 13.0 | 5.1 | 0  | 0 | 0  | 13.9 | 1.9 s |
| 0.4.0   | 13.4 | 5.2 | 0  | 0 | 0  | 10.2 | 13.8 s |
| 0.4.0 + fixes (before 0.5) | 13.6 | 6.0 | 0 | 0 | 2 | 8.9 | 3.7 s |
| 0.5.0   | 12.3 | 6.7 | 0  | 0 | 2  | 8.9  | 3.0 s |
| 0.6.0   | 11.1 | 6.0 | 0  | 0 | 2  | 8.6  | 2.9 s |
| 0.6.1   | 12.8 | 5.5 | 0  | 0 | 1  | 9.0  | 4.0 s |
| 0.6.2   | 12.8 | 5.5 | 0  | 0 | 1  | 9.0  | 3.8 s |
| 0.7.0   | 12.8 | 5.5 | 0  | 0 | 1  | 9.0  | 4.4 s |
| **0.8.0** | 13.3 | 6.3 | 0  | 0 | 0  | 12.0 | 4.3 s |

**Since 0.1** (0.5.0 compared with 0.1.0): 2.6 times as many departures, 1.9 times as many arrivals per hour, no more collisions (11 → 0) and go-arounds (53 → 2) in 20 hours, 44 % fewer deadlock calls. In 0.5.0 the real Stuttgart traffic mix replaced the generic one (more Eurowings and Turkish traffic, fewer small regional jets), which shifts the departure and arrival numbers slightly; the benchmark sessions are otherwise identical. v0.4.0 introduced the crossing-priority rule, which made the simulation about 7 times slower; caching the sampled paths brought it back to 3.7 s per simulated hour (less than 1 % of a CPU core at 1x).

Soak test (0.5.0, 20 h with special events and more heavies in every third session): 11.8 departures and 6.9 arrivals per hour, no collisions, no incursions, 2 go-arounds, 3.9 s computing time per simulated hour. It now runs in CI on every push.

**0.6.0**: A-CDM and CTOTs make the departure flow more realistic, not faster: crews call for pushback 2 minutes before their TSAT instead of at their ready time, 12 % of the departures have a CTOT and wait for it (on the stand via the TSAT, at the holding point if early), and the sequencer spaces start-ups by 90 s. That costs about 1 departure per hour in the benchmark (the automatic controller is still Ground only; Delivery is AI). Soak test 0.6.0: 12.2 departures and 7.2 arrivals per hour, no collisions, no incursions, 2 go-arounds, 3.1 s computing time per simulated hour.

**0.6.1**: the A-CDM fix (TSATs no longer slide later) brings departures up from 11.1 to 12.8 per hour. Arrivals are slightly lower because tows now keep remote stands occupied for 20-40 minutes and slow tows share the apron; the calmer session start also means fewer departures in the first minutes. The automatic controller approves tows like pushbacks (nothing taxiing within 250 m) - tows are new in 0.6.1. Computing time is higher because of the vehicles and the extra checks. Soak test 0.6.1: 11.2 departures and 6.7 arrivals per hour, no collisions, no incursions, 1 go-around, 5.4 s computing time per simulated hour.

**0.6.2** (vehicle radio, radio discipline): same traffic results as 0.6.1. Soak test 0.6.2: 11.3 departures and 6.8 arrivals per hour, no collisions, no incursions, 1 go-around.

**0.8.0** (pilots resolve simple conflicts): an aircraft already in the other one's lane now always goes first, so two aircraft no longer stop nose to nose on a connector like H (stand-offs at intersections dropped from 6 to 0 in the 20 hours). Departures rise from 12.8 to 13.3 and arrivals from 5.5 to 6.3 per hour. Deadlock calls rise from 9.0 to 12.0 per hour because crews who see opposite traffic in time now stop short of the junction between them and call (`opposite traffic on taxiway N ... request instructions`) - the automatic controller never answers, but a controller (or the AI Ground) can now turn one of them off at that junction instead of ordering a tug. Soak test 0.8.0: 12.1 departures and 6.8 arrivals per hour, no collisions, no incursions, 1 go-around, 6.3 s computing time per simulated hour.

### Tower benchmark (since 0.7)

The same 20 sessions with you as **Tower** (Ground and Delivery run by the simulator) and a simple scripted Tower controller: it clears arrivals to land inside 4 NM when nobody is lined up, clears a departure for take-off when the runway is free, the next arrival is more than 110 s away, the departure spacing is met and its CTOT window is open, hands departures to Radar and arrivals to Ground when they ask, and clears crossings when the runway is free and the next arrival is more than 90 s away.

| Version | Departures / h | Arrivals to Ground / h | Collisions | Incursions | Go-arounds | Separation losses | Missed hand-offs |
| ------- | -------------: | ---------------------: | ---------: | ---------: | ---------: | ----------------: | ---------------: |
| 0.7.0 | 11.4 | 10.1 | 0 | 0 | 0 | 0 | 0 |
| 0.7.x (early hand-off to Tower) | 10.3 | 10.8 | 0 | 0 | 0 | 0 | 0 |
| **0.8.0** | 11.2 | 10.3 | 0 | 0 | 0 | 0 | 0 |

Since the AI Ground hands departures over before the holding point, the scripted controller (which only clears aircraft that have reached the holding point) sees queues on its own frequency that the AI Ground no longer manages; departures dropped by about 1 per hour, arrivals rose slightly. In 0.8.0 the lane priority on the ground brings departures back to 11.2 per hour.

The first run of this benchmark found two problems that were fixed for the release: conflict resolution could send a departure on a detour across the runway (now never chosen by the AI Ground and shown last in the menu), and the AI Ground could not get out of a circle of aircraft blocking each other around a pushback.

## Simulated traffic

How many hours of traffic have been simulated while developing and testing the simulator. Since this page exists, every test file reports its simulated hours (`[simulated traffic] ... h` in the test output; a full `npm test` run currently simulates about **8.5 h**, plus 20 h for the soak test in CI).

| Period | Simulated traffic | Note |
| ------ | ----------------: | ---- |
| v0.1 - v0.4 (development, before counting) | ~100 h | estimate: test suite runs and debugging harnesses |
| after v0.4 (tablet mode, scenarios, briefing, stand fixes) | ~130 h | estimate: test suite runs, debugging, soak tests |
| version benchmark, 2026-10-08 | 120 h | measured: 5 versions x 20 h, plus a repeat of the current version |
| soak tests, 2026-10-08 | 60 h | measured: 3 runs x 20 h |
| 0.5.0 development | ~70 h | estimate: test suite runs (8.5 h each) and debugging |
| 0.5.0 release benchmark and soak test | 40 h | measured: 2 x 20 h |
| 0.6.0 development (systems, conflicts, Delivery) | ~60 h | estimate: test suite runs (about 9 h each) and debugging |
| 0.6.0 release benchmark and soak test | 40 h | measured: 2 x 20 h |
| 0.6.0 - 0.6.1 benchmark and soak runs (bisecting, tuning) | 240 h | measured: 7 benchmark and 5 soak runs of 20 h |
| 0.6.0 - 0.6.1 development | ~135 h | estimate: test suite runs (about 10 h each) and debugging harnesses |
| 0.6.2 - 0.7.0 benchmark, Tower benchmark and soak runs | 160 h | measured: 3 benchmark runs (Ground and Tower) and 2 soak runs of 20 h |
| 0.6.2 - 0.7.0 development | ~60 h | estimate: test suite runs and debugging harnesses |
| after 0.7.0 (Tower benchmark runs while tuning the early hand-off) | 72 h | measured: 3 Tower benchmark runs of 20 h, 3 diagnostic runs of 4 h |
| 0.8.0 development and release (combined positions, opposite traffic, debriefing) | 288 h | measured: 4 benchmark runs and 4 soak runs of 20 h, 3 deadlock analysis runs of 20 h, combined-position test runs (28 h) |
| 0.8.0 development | ~100 h | estimate: test suite runs (about 11 h each) and debugging harnesses |
| **Total so far (0.8.0)** | **~1680 h** | of which 1020 h exactly measured |

From now on each benchmark, soak test and test-suite run adds its measured hours here when results are recorded.

## Major release statistics

No major release yet. Version 1.0 will compare itself with 0.4 (the first version with a complete Ground position and the baseline of the release benchmark) and list the total simulated traffic up to the release. See the [roadmap](roadmap.md#road-to-10) for the proposed 1.0 criteria.
