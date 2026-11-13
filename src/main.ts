import './style.css';
import { scenarioSetup } from './core/scenario';
import { restoreSession } from './core/session';
import { Simulation } from './core/simulation';
import { zonedTime } from './core/time';
import { TutorialRunner, tutorialById, tutorialConfig } from './core/tutorial';
import { AIRPORTS } from './data/airports';
import { App } from './ui/app';
import { showLogin } from './ui/dialogs';
import { showLoading } from './ui/loading';
import { loadSettings, saveSettings } from './ui/settings';

// A right click is the simulator's (aircraft menus, like EuroScope): never the browser's menu - except in text
// fields, where it offers copy and paste.
document.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest('input, textarea, [contenteditable="true"]')) return;
  e.preventDefault();
});

async function start(): Promise<void> {
  const settings = loadSettings();
  // The interface theme already colours the Connect dialog.
  document.documentElement.dataset.uiTheme = settings.uiTheme;
  // A shared link can carry a scenario code: ?scenario=EDDS-25-MB2-M10-K7Q2M
  const shared = new URLSearchParams(location.search).get('scenario') ?? undefined;
  const login = await showLogin(AIRPORTS, settings, shared);
  // From Connect to the scope: a loading screen, so that a large airport (München with traffic in progress: a few
  // seconds) does not look like a page that does not react.
  const airportTitle = `${login.airport.icao} ${login.airport.name}`;
  // A tutorial sets up its own session (position, fixed traffic).
  const tutorial = tutorialById(login.tutorial);
  if (tutorial) {
    const loading = showLoading(airportTitle, `Tutorial: ${tutorial.title}`);
    await loading.step('Preparing the airport ...');
    const sim = new Simulation(tutorialConfig(tutorial, login.airport));
    const runner = new TutorialRunner(tutorial, sim);
    await loading.step('Drawing the aerodrome chart ...');
    const app = new App(document.getElementById('app')!, sim, settings, runner);
    loading.close();
    (window as unknown as { atc: unknown }).atc = { sim, app, runner };
    return;
  }
  // A saved session: rebuilt from its start (a few seconds for a long one), then continued.
  if (login.saved) {
    const saved = login.saved;
    const loading = showLoading(`Restoring "${saved.name}"`, saved.airport);
    try {
      await loading.step('Rebuilding the session from its start ...', 0);
      const { sim, matches } = await restoreSession(saved, AIRPORTS, (done) => loading.step(`Rebuilding the session from its start ... ${Math.round(done * 100)} %`, done));
      await loading.step('Drawing the aerodrome chart ...');
      settings.airport = saved.airport;
      saveSettings(settings);
      const app = new App(document.getElementById('app')!, sim, settings, undefined, { name: saved.name, controlSeconds: saved.controlSeconds, matches, appVersion: saved.appVersion });
      loading.close();
      (window as unknown as { atc: unknown }).atc = { sim, app };
    } catch (e) {
      await loading.step(`The session could not be restored: ${(e as Error).message}`);
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

  const positions = (login.positions?.length ? login.positions : [login.position]).join(' + ');
  const loading = showLoading(airportTitle, `${positions}${login.start === 'handover' ? ' - taking over traffic in progress' : ''}`);
  await loading.step('Preparing the airport and the traffic ...');
  const sim = new Simulation({
    deferTakeOver: true,
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
  // Traffic in progress: the simulator works the airport for 20 minutes first - in pieces, with progress.
  if (sim.takeOverPending) {
    await sim.takeOverAsync((done) => loading.step(`Taking over the traffic ... ${Math.round(done * 100)} %`, done));
  }
  await loading.step('Drawing the aerodrome chart ...');
  const app = new App(document.getElementById('app')!, sim, settings);
  loading.close();
  // Exposed for debugging from the browser console.
  (window as unknown as { atc: unknown }).atc = { sim, app };
}

void start();
