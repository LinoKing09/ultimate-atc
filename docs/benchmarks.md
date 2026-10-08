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
| **0.6.0** | 11.1 | 6.0 | 0  | 0 | 2  | 8.6  | 2.9 s |

**Since 0.1** (0.5.0 compared with 0.1.0): 2.6 times as many departures, 1.9 times as many arrivals per hour, no more collisions (11 → 0) and go-arounds (53 → 2) in 20 hours, 44 % fewer deadlock calls. In 0.5.0 the real Stuttgart traffic mix replaced the generic one (more Eurowings and Turkish traffic, fewer small regional jets), which shifts the departure and arrival numbers slightly; the benchmark sessions are otherwise identical. v0.4.0 introduced the crossing-priority rule, which made the simulation about 7 times slower; caching the sampled paths brought it back to 3.7 s per simulated hour (less than 1 % of a CPU core at 1x).

Soak test (0.5.0, 20 h with special events and more heavies in every third session): 11.8 departures and 6.9 arrivals per hour, no collisions, no incursions, 2 go-arounds, 3.9 s computing time per simulated hour. It now runs in CI on every push.

**0.6.0**: A-CDM and CTOTs make the departure flow more realistic, not faster: crews call for pushback 2 minutes before their TSAT instead of at their ready time, 12 % of the departures have a CTOT and wait for it (on the stand via the TSAT, at the holding point if early), and the sequencer spaces start-ups by 90 s. That costs about 1 departure per hour in the benchmark (the automatic controller is still Ground only; Delivery is AI). Soak test 0.6.0: 12.2 departures and 7.2 arrivals per hour, no collisions, no incursions, 2 go-arounds, 3.1 s computing time per simulated hour.

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
| **Total so far (0.6.0)** | **~620 h** | of which 260 h exactly measured |

From now on each benchmark, soak test and test-suite run adds its measured hours here when results are recorded.

## Major release statistics

No major release yet. Version 1.0 will compare itself with 0.4 (the first version with a complete Ground position and the baseline of the release benchmark) and list the total simulated traffic up to the release. See the [roadmap](roadmap.md#road-to-10) for the proposed 1.0 criteria.
