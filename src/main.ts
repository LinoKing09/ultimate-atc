import './style.css';
import { Simulation } from './core/simulation';
import { EDDS } from './data/airports/edds';
import { App } from './ui/app';
import { showLogin } from './ui/dialogs';
import { loadSettings, saveSettings } from './ui/settings';

/** Airports with complete data, selectable in the login dialog. */
const AIRPORTS = [EDDS];

async function start(): Promise<void> {
  const settings = loadSettings();
  const login = await showLogin(AIRPORTS, settings);
  settings.airport = login.airport.icao;
  settings.position = login.position;
  settings.runway = login.runway;
  settings.density = login.density;
  saveSettings(settings);

  const sim = new Simulation({
    airport: login.airport,
    position: login.position,
    runway: login.runway,
    density: login.density,
    seed: login.seed,
  });
  const app = new App(document.getElementById('app')!, sim, settings);
  // Exposed for debugging from the browser console.
  (window as unknown as { atc: unknown }).atc = { sim, app };
}

void start();
