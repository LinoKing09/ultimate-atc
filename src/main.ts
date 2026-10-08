import './style.css';
import { Simulation } from './core/simulation';
import { AIRPORTS } from './data/airports';
import { App } from './ui/app';
import { showLogin } from './ui/dialogs';
import { loadSettings, saveSettings } from './ui/settings';


async function start(): Promise<void> {
  const settings = loadSettings();
  // A shared link can carry a scenario code: ?scenario=EDDS-25-MB2-M10-K7Q2M
  const shared = new URLSearchParams(location.search).get('scenario') ?? undefined;
  const login = await showLogin(AIRPORTS, settings, shared);
  settings.airport = login.airport.icao;
  settings.position = login.position;
  if (!login.scenario) {
    settings.density = login.density;
    settings.events = login.events;
  }
  saveSettings(settings);

  const sim = new Simulation({
    airport: login.airport,
    position: login.position,
    density: login.density,
    events: login.events,
    seed: login.seed,
    runway: login.scenario?.runway,
    scenario: login.scenario && { mix: login.scenario.mix, heavies: login.scenario.heavies, events: login.scenario.events },
  });
  const app = new App(document.getElementById('app')!, sim, settings);
  // Exposed for debugging from the browser console.
  (window as unknown as { atc: unknown }).atc = { sim, app };
}

void start();
