[Documentation](README.md) › Contributing

# Contributing

## Workflow

1. Create a branch from `main`.
2. Make your change. Keep the simulation core (`src/core`) free of DOM access.
3. **Update the documentation** (see below) and add an entry under `## [Unreleased]` in `CHANGELOG.md`.
4. Run the checks:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
5. Open a pull request. CI runs the same checks.

## Documentation rules

The documentation is part of the product and must always describe the current state:

| If you change ...                                    | update ...                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| the parser, commands, read-backs or pilot calls      | `docs/phraseology.md`, the help dialog in `src/ui/dialogs.ts` |
| UI elements, keyboard shortcuts, colours, lists, tags | `docs/user-guide.md`, the help dialog                        |
| AI behaviour, timings, traffic, score                | `docs/simulation.md` (numbers must match the code)            |
| scenario codes, presets, scheduled events            | `docs/scenarios.md`                                           |
| tutorial lessons (`src/core/tutorial.ts`)            | `docs/tutorials.md`; keep `tests/tutorial.test.ts` passing    |
| module structure, data flow                          | `docs/architecture.md`                                        |
| the airport data format                              | `docs/airport-data.md`                                        |
| an airport's layout                                  | `docs/airports/<ICAO>.md`                                     |
| features, status                                     | `README.md`, `docs/roadmap.md`                                |
| anything that changes simulation behaviour or speed  | run `npm run benchmark` before a release, add the results to `docs/benchmarks.md` |
| anything                                             | `CHANGELOG.md`                                                |

All code, comments, UI text and documentation are written in **English**.

## Code style

- TypeScript strict mode; avoid `any` and non-null assertions where a check is cheap.
- Small, focused modules; comments explain *why*, not *what*.
- Units: metres, seconds, m/s internally; knots and feet only at the edges (data tables, display). Use the constants in `core/geo.ts`.
- Headings in degrees true (0 = north, clockwise).
- Use the seeded RNG (`sim.rng`), never `Math.random()`, inside the simulation, so scenarios stay reproducible.

## Tests

- Unit tests for pure logic (parser, routing, geometry).
- Scenario tests drive the `Simulation` directly with `sim.transmit(...)` and `sim.tick(...)` (see `tests/simulation.test.ts`). Use `generateTraffic: false` and spawn aircraft with `sim.traffic.spawnDeparture/spawnArrival` for deterministic setups.
- New airports need a data-consistency test (every stand reaches every departure holding point, exits exist).

## Handbook

`docs/handbook/ultimate-atc-handbook.pdf` is built from the Markdown documentation; rebuild it when the player documentation or the UI changes noticeably (at least before a release):

1. Screenshots: start the app (`npm run dev`) and run `node scripts/handbook-shots.mjs [--url http://localhost:5173/]`. It drives the app with Playwright and writes `docs/images/handbook/*.jpg` and `shots.json` (the screen regions numbered in the user guide figure).
2. Book: `npm run handbook`. `scripts/handbook.mjs` renders the chapters (list `chapters` in the script) with `marked` into one HTML page in the colours and font of the app and prints it to PDF with Playwright. Breadcrumbs and local tables of contents are removed, links between pages become links inside the book, links to pages the book leaves out (developer documentation, sections such as *Tests*) go to GitHub.

Playwright is not a dependency of the project: set `PLAYWRIGHT` to its module and `CHROMIUM` to a browser executable if needed, for example `PLAYWRIGHT=/path/to/playwright/index.mjs CHROMIUM=/path/to/chrome npm run handbook`. A new player page belongs in `chapters`; a new screenshot in both scripts.
