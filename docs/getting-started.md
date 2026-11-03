[Documentation](README.md) › Getting started

# Getting started

## Play online

Every push to `main` builds the app and deploys it to GitHub Pages (see [below](#deploying-to-github-pages)). Once Pages is enabled for the repository, the simulator is available at:

```
https://linoking09.github.io/ultimate-atc/
```

To read the documentation on paper, print the [handbook (PDF)](handbook/ultimate-atc-handbook.pdf).

## Run locally

Requirements:

- [Node.js](https://nodejs.org/) **20 or newer** (CI uses Node 22)
- npm (comes with Node.js)
- A desktop browser. Chrome, Edge, Firefox and Safari are supported. Speech recognition (the MIC button) needs Chrome or Edge.

```bash
git clone https://github.com/linoking09/ultimate-atc.git
cd ultimate-atc
npm install
npm run voice-model
npm run dev
```

`npm run voice-model` downloads the speech model of the own speech recogniser (vosk-model-small-en-us-0.15, about 40 MB, Apache 2.0) into `public/models/` and writes the list of words it knows next to it (`<model>.lexicon.txt`, read from the model's grammar graph); `npm run voice-model -- --all` also the large one (vosk-model-en-us-0.22-lgraph, about 128 MB) for the *Speech model* setting. It is not committed; the GitHub Pages build runs the same script. Without it everything works, but the own speech recogniser cannot load and the app falls back to the browser's.

Open the URL Vite prints (normally `http://localhost:5173`). The page reloads automatically when you change the source code.

### Production build

```bash
npm run build      # type check + bundle into dist/
npm run preview    # serve dist/ on http://localhost:4173
```

`dist/` is a static site: an `index.html`, a CSS file and two JavaScript files (the code and the generated airport data, split in `vite.config.ts`). You can host it on any static web server. The build uses relative asset paths (`base: './'` in `vite.config.ts`), so it also works from a sub-directory.

### Tests

```bash
npm test           # all tests once
npm run test:watch # re-run on change
npm run typecheck  # TypeScript only
```

The tests live in `tests/`:

| File                       | What is covered                                                                  |
| -------------------------- | -------------------------------------------------------------------------------- |
| `tests/routing.test.ts`    | EDDS data consistency, taxi route finding with `via` constraints, one-way exits  |
| `tests/parser.test.ts`     | Phraseology parser (typed and spoken forms), text-to-speech formatting           |
| `tests/simulation.test.ts` | End-to-end scenarios: departure push/taxi/handoff/take-off, arrival landing and parking, runway crossing, separation, routing realism (no turn-backs / U-turns), extended phraseology (cancel/stop pushback, queue numbers, clearance limits, conditional clearances), ATIS and runway change, special events, tower flow (waiting times, go-arounds), a one-hour soak test |

## Deploying to GitHub Pages

The repository contains two workflows in `.github/workflows/`:

| Workflow     | Trigger                       | What it does                                                    |
| ------------ | ----------------------------- | --------------------------------------------------------------- |
| `ci.yml`     | every push and pull request   | `npm ci`, type check, tests, production build                   |
| `pages.yml`  | push to `main`, manual run    | fetches both speech models, builds the site and publishes `dist/` to GitHub Pages |

**One-time setup:** in the repository, open **Settings -> Pages** and set **Source** to **GitHub Actions**. The `pages.yml` workflow fails until this is done. After that, every push to `main` updates the live site.

## Browser notes

- **Text-to-speech** (TTS button) uses the browser's built-in voices. The available voices depend on the operating system. English voices are preferred when installed.
- **Speech recognition** (MIC button, or hold the key left of `1`, which is `^` on German keyboards and `` ` `` on US keyboards) uses the **own speech recogniser** by default: Vosk (Kaldi as WebAssembly) in the browser, with the model served by the site - the audio never leaves the device, and after the first load (about 40 MB, cached by the browser) it works offline. It needs WebAssembly, Web Workers and microphone access (all current browsers, also Safari on the iPad). In the settings you can switch to the browser's speech recognition (Web Speech API; Chrome sends the audio to Google's speech service). The `npm audit` warning about `uuid` (a dependency of vosk-browser) concerns uuid v3/v5/v6 with a given buffer; vosk-browser only creates v4 ids.
- **Settings** (last airport, traffic density, special events, TTS on/off, route display) are stored in your browser's `localStorage`. If storage is blocked, for example in some private-browsing modes, the app still works with default settings.
