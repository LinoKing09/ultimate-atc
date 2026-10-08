# Project rules for Claude

- **Language**: everything in the repository (code, comments, UI text, documentation, commit messages) is written in **English**, even if the conversation with the user is in another language.
- **Documentation is mandatory**: every change must update the affected documentation in `docs/`, `README.md` and the in-app help (`src/ui/dialogs.ts`) where relevant, and add an entry to `CHANGELOG.md` under `## [Unreleased]`. See the mapping table in `docs/contributing.md`. Numbers in `docs/simulation.md` must match the code.
- **Architecture**: `src/core` must not access the DOM. Browser-specific code lives in `src/ui`.
- **Determinism**: use `sim.rng` (seeded) inside the simulation, never `Math.random()`.
- **Checks before committing**: `npm run typecheck`, `npm test`, `npm run build`.
- **Airport data**: only use data that may be redistributed (OurAirports public domain, OpenStreetMap with attribution). Official charts (AIP) may only be used as a reference to digitise facts by hand (designators, topology, approximate positions); never commit chart files or chart graphics. Mark sources and approximations in `dataNotice` and in `docs/airports/<ICAO>.md`.
- **Publishing**: after the checks pass, commit, merge into `main` and push by default, unless the user says otherwise for that change.
- **Releases**: never bump to a major version (1.0, 2.0, ...) on your own. Propose it when the criteria in `docs/roadmap.md` ("Road to 1.0") are met and decide together with the user. Every major release gets a statistics section in `docs/benchmarks.md` (run `npm run benchmark`, include the total simulated traffic hours).
