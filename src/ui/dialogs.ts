import type { AirportData, StationType } from '../core/airport/types';
import type { Density } from '../core/simulation';
import { h } from './dom';
import type { Settings } from './settings';

export const REPO_URL = 'https://github.com/linoking09/ultimate-atc';

/** Airports offered in the login dialog. Only those with data are selectable. */
const PLANNED_AIRPORTS = [
  { icao: 'EDDF', name: 'Frankfurt' },
  { icao: 'EGLL', name: 'London Heathrow' },
  { icao: 'KLAX', name: 'Los Angeles' },
  { icao: 'KSAN', name: 'San Diego' },
];

const POSITIONS: { type: StationType; label: string; available: boolean }[] = [
  { type: 'DEL', label: 'Delivery', available: false },
  { type: 'GND', label: 'Ground', available: true },
  { type: 'TWR', label: 'Tower', available: false },
  { type: 'APP', label: 'Approach / Departure', available: false },
  { type: 'CTR', label: 'Radar / Center', available: false },
];

export interface LoginResult {
  airport: AirportData;
  position: StationType;
  runway: string;
  density: Density;
  seed?: number;
}

/** EuroScope-like "connect" dialog: pick airport, position, runway and traffic. */
export function showLogin(airports: AirportData[], settings: Settings): Promise<LoginResult> {
  return new Promise((resolve) => {
    const airportSel = h('select');
    for (const a of airports) airportSel.append(h('option', { value: a.icao, text: `${a.icao} - ${a.name}` }));
    for (const a of PLANNED_AIRPORTS) airportSel.append(h('option', { value: a.icao, disabled: true, text: `${a.icao} - ${a.name} (planned)` }));
    airportSel.value = airports.some((a) => a.icao === settings.airport) ? settings.airport : airports[0].icao;

    let position: StationType = 'GND';
    const posButtons = POSITIONS.map((p) => {
      const b = h('button', { type: 'button', text: p.label, disabled: !p.available, title: p.available ? '' : 'Planned for a later version' });
      b.addEventListener('click', () => {
        position = p.type;
        posButtons.forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        update();
      });
      if (p.type === position) b.classList.add('active');
      return b;
    });

    const runwaySel = h('select');
    const densitySel = h('select');
    for (const d of ['light', 'medium', 'heavy']) densitySel.append(h('option', { value: d, text: d }));
    densitySel.value = settings.density;
    const seedInput = h('input', { type: 'number', placeholder: 'random', min: '0' });
    const callsign = h('span');
    const notice = h('div.notice');

    const airport = () => airports.find((a) => a.icao === airportSel.value)!;
    const update = () => {
      const ap = airport();
      const st = ap.stations.find((s) => s.type === position);
      callsign.textContent = st ? `${st.callsign}  ${st.frequency}  "${st.name}"` : '-';
      const prev = runwaySel.value || settings.runway;
      runwaySel.replaceChildren(...ap.runwayOps.map((o) => h('option', { value: o.runway, text: `Runway ${o.runway}` })));
      runwaySel.value = ap.runwayOps.some((o) => o.runway === prev) ? prev : ap.runwayOps[0].runway;
      notice.textContent = ap.dataNotice;
    };
    airportSel.addEventListener('change', update);
    update();

    const connect = h('button.primary', { type: 'submit', text: 'Connect' });
    const form = h(
      'form.dialog',
      {},
      h('div.dtitle', {}, h('span', { text: 'Connect' })),
      h(
        'div.dbody',
        {},
        h('h1', { text: 'ULTIMATE ATC' }),
        h('div.sub', { text: 'Air traffic control simulator - EuroScope style, ICAO phraseology.' }),
        h(
          'div.grid',
          {},
          h('label', { text: 'Airport' }),
          airportSel,
          h('label', { text: 'Position' }),
          h('div.positions', {}, ...posButtons),
          h('label', { text: 'Callsign' }),
          callsign,
          h('label', { text: 'Active runway' }),
          runwaySel,
          h('label', { text: 'Traffic' }),
          densitySel,
          h('label', { text: 'Scenario seed' }),
          seedInput,
        ),
        notice,
        h('div.actions', {}, h('a', { href: `${REPO_URL}#readme`, target: '_blank', rel: 'noopener', text: 'Documentation' }), connect),
      ),
    );
    const overlay = h('div.overlay', {}, form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      overlay.remove();
      const seed = seedInput.value ? Number(seedInput.value) : undefined;
      resolve({
        airport: airport(),
        position,
        runway: runwaySel.value,
        density: densitySel.value as Density,
        seed,
      });
    });
    document.body.append(overlay);
    connect.focus();
  });
}

const REFERENCE: [string, string][] = [
  ['pushback approved [facing east|west]', 'Approve pushback. Without "facing" the pilot picks the direction towards the runway.'],
  ['push and start approved [facing ...]', 'Pushback and engine start in one go.'],
  ['start-up approved', 'Approve engine start on the stand.'],
  ['taxi to holding point G1 [runway 25] via N, G', 'Taxi to a runway holding point along the given taxiways.'],
  ['taxi to runway 25 via N', 'Taxi to the runway; the pilot picks the full-length holding point.'],
  ['taxi to stand 12 via N, R', 'Taxi an arrival to its stand.'],
  ['... hold short of taxiway D | runway 25', 'Add a hold-short point to a route (or send it on its own).'],
  ['cross runway 25', 'Clear an aircraft holding short of the runway to cross (also as part of a taxi instruction).'],
  ['hold position', 'Stop immediately.'],
  ['continue taxi', 'Resume after hold position / hold short of a taxiway.'],
  ['give way to DLH5AB', 'Wait until the named traffic has passed, then continue.'],
  ['contact tower [118.805]', 'Hand the aircraft over to Tower (do this at or before the holding point).'],
  ['standby', 'Acknowledge a request; the pilot waits two minutes before calling again.'],
  ['expedite taxi', 'Taxi a bit faster.'],
  ['say again', 'The pilot repeats the last transmission.'],
];

const KEYS: [string, string][] = [
  ['Enter', 'Transmit the command line'],
  ['Esc', 'Clear the command line / deselect / close menus'],
  ['Tab', 'Select the next aircraft with a pending request (longest waiting first)'],
  ['Up / Down', 'Command history'],
  ['Mouse wheel', 'Zoom'],
  ['Drag (left or right button)', 'Pan the scope; drag a tag to move it'],
  ['Left click', 'Select aircraft (commands without callsign go to the selection)'],
  ['Right click', 'Aircraft menu (pushback, taxi, handoff, ...)'],
  ['Double click on list row', 'Centre the scope on the aircraft'],
  ['Hold ^ / ` (key left of 1)', 'Push-to-talk (speech recognition, Chrome/Edge)'],
  ['Space (command line empty)', 'Pause / resume'],
  ['Home', 'Reset the scope view'],
];

export function showHelp(): void {
  const close = h('button', { type: 'button', text: 'Close' });
  const overlay = h(
    'div.overlay',
    {},
    h(
      'div.dialog.wide',
      {},
      h('div.dtitle', {}, h('span', { text: 'Help - Ground position' }), close),
      h(
        'div.dbody',
        {},
        h('p', {
          text:
            'You are Ground. Departures call for pushback and taxi; you hand them to Tower at the runway holding point. ' +
            'Arrivals call you after vacating the runway; taxi them to a stand. Keep traffic moving, avoid conflicts and never let anyone onto the runway without a clearance.',
        }),
        h('p', {
          text:
            'Type instructions in ICAO phraseology. The callsign can be the ICAO code (DLH5AB), the radiotelephony callsign (Lufthansa 5AB), or omitted if an aircraft is selected. Several instructions can be combined in one transmission.',
        }),
        h('h2', { text: 'Phraseology' }),
        h('table.ref', {}, ...REFERENCE.map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', { text: b })))),
        h('h2', { text: 'Controls' }),
        h('table.ref', {}, ...KEYS.map(([a, b]) => h('tr', {}, h('td', {}, h('kbd', { text: a })), h('td', { text: b })))),
        h('h2', { text: 'Colours' }),
        h('p', {
          text: 'White: on your frequency. Grey: other controller (Tower). Flashing yellow: waiting for your answer (orange after one minute). Red: incident.',
        }),
        h('p', {}, 'Full documentation: ', h('a', { href: REPO_URL, target: '_blank', rel: 'noopener', text: REPO_URL })),
      ),
    ),
  );
  const done = () => overlay.remove();
  close.addEventListener('click', done);
  overlay.addEventListener('click', (e) => e.target === overlay && done());
  document.body.append(overlay);
}
