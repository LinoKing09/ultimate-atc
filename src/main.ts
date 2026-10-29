import './style.css';
import { scenarioSetup } from './core/scenario';
import { restoreSession } from './core/session';
import { Simulation } from './core/simulation';
import { zonedTime } from './core/time';
import { TutorialRunner, tutorialById, tutorialConfig } from './core/tutorial';
import { AIRPORTS } from './data/airports';
import { App } from './ui/app';
import { showLogin } from './ui/dialogs';
import { h } from './ui/dom';
import { loadSettings, saveSettings } from './ui/settings';

async function start(): Promise<void> {
  const settings = loadSettings();
  // A shared link can carry a scenario code: ?scenario=EDDS-25-MB2-M10-K7Q2M
  const shared = new URLSearchParams(location.search).get('scenario') ?? undefined;
  const login = await showLogin(AIRPORTS, settings, shared);
  // A tutorial sets up its own session (position, fixed traffic).
  const tutorial = tutorialById(login.tutorial);
  if (tutorial) {
    const sim = new Simulation(tutorialConfig(tutorial, login.airport));
    const runner = new TutorialRunner(tutorial, sim);
    const app = new App(document.getElementById('app')!, sim, settings, runner);
    (window as unknown as { atc: unknown }).atc = { sim, app, runner };
    return;
  }
  // A saved session: rebuilt from its start (a few seconds for a long one), then continued.
  if (login.saved) {
    const saved = login.saved;
    const text = h('div', { text: `Restoring "${saved.name}" ...` });
    const overlay = h('div.overlay', {}, h('div.dialog.restoring', {}, h('div.dbody', {}, text)));
    document.body.append(overlay);
    try {
      const { sim, matches } = await restoreSession(saved, AIRPORTS, async (done) => {
        text.textContent = `Restoring "${saved.name}" ... ${Math.round(done * 100)} %`;
        await new Promise((r) => setTimeout(r, 0));
      });
      overlay.remove();
      settings.airport = saved.airport;
      saveSettings(settings);
      const app = new App(document.getElementById('app')!, sim, settings, undefined, { name: saved.name, controlSeconds: saved.controlSeconds, matches });
      (window as unknown as { atc: unknown }).atc = { sim, app };
    } catch (e) {
      text.textContent = `The session could not be restored: ${(e as Error).message}`;
      setTimeout(() => location.reload(), 4000);
    }
    return;
  }
  settings.airport = login.airport.icao;
  settings.position = login.position;
  settings.positions = login.positions;
  if (!login.scenario) {
    settings.density = login.density;
    settings.eventLevel = login.eventLevel;
  }
  settings.start = login.start;
  saveSettings(settings);

  const sim = new Simulation({
    airport: login.airport,
    position: login.position,
    positions: login.positions,
    density: login.density,
    eventLevel: login.eventLevel,
    start: login.start,
    seed: login.seed,
    runway: login.scenario?.runway,
    // A scenario start time is local airport time, today.
    startTime: login.scenario?.startLocal ? zonedTime(login.scenario.startLocal, login.airport.timeZone ?? 'UTC') : undefined,
    scenario: login.scenario && scenarioSetup(login.scenario),
  });
  const app = new App(document.getElementById('app')!, sim, settings);
  // Exposed for debugging from the browser console.
  (window as unknown as { atc: unknown }).atc = { sim, app };
}

void start();
