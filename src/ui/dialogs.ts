import type { AirportData, StationType } from '../core/airport/types';
import { describeScenario, parseScenarioCode, type Scenario } from '../core/scenario';
import type { Density, Simulation } from '../core/simulation';
import { h } from './dom';
import { showScenarioBuilder } from './scenarioBuilder';
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
  density: Density;
  events: boolean;
  seed?: number;
  /** Training scenario from a scenario code (overrides density and events). */
  scenario?: Scenario;
}

/** EuroScope-like "connect" dialog: pick airport, position and traffic. The runway follows the wind (ATIS). */
export function showLogin(airports: AirportData[], settings: Settings, initialScenario?: string): Promise<LoginResult> {
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

    const eventsBox = h('input', { type: 'checkbox' });
    eventsBox.checked = settings.events;
    const densitySel = h('select');
    for (const d of ['light', 'medium', 'heavy']) densitySel.append(h('option', { value: d, text: d }));
    densitySel.value = settings.density;
    const seedInput = h('input', { type: 'text', placeholder: 'random', spellcheck: 'false', autocomplete: 'off', value: initialScenario ?? '' });
    const builderBtn = h('button', { type: 'button', text: 'Scenario builder...', title: 'Choose what to train and get a scenario code' });
    const scenarioInfo = h('div.sub.scenario-info');
    const callsign = h('span');
    const notice = h('div.notice');

    const airport = () => airports.find((a) => a.icao === airportSel.value)!;
    /** The seed field takes a plain number (seed) or a scenario code. */
    const readSeedField = (): { seed?: number; scenario?: Scenario; error?: string } => {
      const v = seedInput.value.trim();
      if (!v) return {};
      if (/^\d+$/.test(v)) return { seed: Number(v) };
      const sc = parseScenarioCode(v);
      if ('error' in sc) return { error: sc.error };
      if (sc.airport !== airport().icao) return { error: `This scenario is for ${sc.airport}` };
      return { seed: sc.seed, scenario: sc };
    };
    const updateScenario = () => {
      const r = readSeedField();
      densitySel.disabled = eventsBox.disabled = !!r.scenario;
      scenarioInfo.textContent = r.error ? r.error : r.scenario ? `Scenario: ${describeScenario(r.scenario)}` : 'A number (seed) repeats the same traffic; a scenario code also sets runway, traffic and events.';
      scenarioInfo.style.color = r.error ? 'var(--danger)' : '';
      connect.disabled = !!r.error;
    };
    seedInput.addEventListener('input', updateScenario);
    builderBtn.addEventListener('click', async () => {
      const code = await showScenarioBuilder(airport(), seedInput.value.trim() || undefined);
      if (code) {
        seedInput.value = code;
        updateScenario();
      }
    });
    const update = () => {
      const ap = airport();
      const st = ap.stations.find((s) => s.type === position);
      callsign.textContent = st ? `${st.callsign}  ${st.frequency}  "${st.name}"` : '-';
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
          h('label', { text: 'Traffic' }),
          densitySel,
          h('label', { text: 'Special events' }),
          h('label', {}, eventsBox, ' emergencies, rejected take-offs (rare)'),
          h('label', { text: 'Scenario' }),
          h('div.rangerow', {}, seedInput, builderBtn),
        ),
        scenarioInfo,
        h('div.sub', { text: 'The runway in use is chosen from the wind. You can change it at any time in the ATIS (click ATIS in the toolbar).' }),
        notice,
        h('div.actions', {}, h('a', { href: `${REPO_URL}#readme`, target: '_blank', rel: 'noopener', text: 'Documentation' }), connect),
      ),
    );
    const overlay = h('div.overlay', {}, form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = readSeedField();
      if (r.error) return;
      overlay.remove();
      resolve({
        airport: airport(),
        position,
        density: r.scenario?.density ?? (densitySel.value as Density),
        events: r.scenario?.randomEvents ?? eventsBox.checked,
        seed: r.seed,
        scenario: r.scenario,
      });
    });
    document.body.append(overlay);
    updateScenario();
    connect.focus();
  });
}

const REFERENCE: [string, string][] = [
  ['pushback approved [facing east|west]', 'Approve pushback. Without "facing" the pilot picks the direction towards the runway.'],
  ['push and start approved [facing ...]', 'Pushback and engine start in one go.'],
  ['start-up approved', 'Approve engine start on the stand.'],
  ['cancel pushback / stop pushback / continue pushback', 'Cancel a pushback (a moving aircraft is towed back onto the stand), stop a moving pushback, resume it.'],
  ['taxi to holding point A [runway 25] via L2, S', 'Taxi to a runway holding point along the given taxiways.'],
  ['taxi to runway 25 via L2, S', 'Taxi to the runway; the pilot picks the full-length holding point.'],
  ['taxi to stand 14 via N, L2', 'Taxi an arrival to its stand.'],
  ['taxi via S, hold short of E', 'Incomplete taxi instruction: the clearance limit is the hold-short point.'],
  ['advise able for departure from intersection D', 'Ask whether the crew can depart from an intersection ("are you able intersection D" works too). Answer: "affirm, able" or "negative, we require full length".'],
  ['... hold short of taxiway D | runway 25', 'Add a hold-short point to a route (or send it on its own).'],
  ['cross runway 25', 'Clear an aircraft holding short of the runway to cross (also as part of a taxi instruction).'],
  ['behind the A320 passing left to right, ...', 'Conditional clearance (also "behind DLH5AB", "when clear of the Boeing"). The pilot waits for the traffic.'],
  ['hold position', 'Stop immediately.'],
  ['continue taxi', 'Resume after hold position / hold short of a taxiway.'],
  ['give way to DLH5AB', 'Wait until the named traffic has passed, then continue.'],
  ['number 2 for pushback | taxi | departure', 'Queue position; the pilot waits without reminding you.'],
  ['expect pushback in 5 minutes', 'Expected delay; the pilot waits that long.'],
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
  ['Hold ^ / ` (key left of 1), Right Ctrl or Insert', 'Push-to-talk (speech recognition, Chrome/Edge)'],
  ['Click a tag item', 'Callsign: flight plan + telephony; cleared-to: taxi menu; status: aircraft menu'],
  ['Click ATIS / RWY / wind in the toolbar', 'Edit the ATIS (runway in use, wind, QNH, information letter)'],
  ['Space (command line empty)', 'Pause / resume'],
  ['Home', 'Reset the scope view'],
  ['ROT (toolbar)', 'Rotate the scope: runway horizontal like the aerodrome chart / north-up'],
  ['F2 / SETTINGS (toolbar)', 'Settings: tablet or PC layout, interface and tag size, voices, traffic density, special events'],
  ['Tablet mode: tap / tap again / long press', 'Select the aircraft / open its menu (or the tag item) / open its menu; + and - buttons zoom'],
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
          text: 'White: on your frequency. Grey: other controller (Tower). Flashing yellow: waiting for your answer (orange after one minute). Magenta "PAN": emergency. Red: incident.',
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

/**
 * ATIS editor: the controller sets the runway in use, wind, QNH and the
 * information letter. Applying it broadcasts a new ATIS.
 */
export function showAtisEditor(sim: Simulation): void {
  const a = sim.atis;
  const letterSel = h('select');
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    letterSel.append(h('option', { value: l, text: l }));
  }
  letterSel.value = a.letter === 'Z' ? 'A' : String.fromCharCode(a.letter.charCodeAt(0) + 1);
  const rwySel = h('select');
  for (const o of sim.config.airport.runwayOps) rwySel.append(h('option', { value: o.runway, text: `Runway ${o.runway}` }));
  rwySel.value = a.runway;
  // Pre-filled with the actual surface wind (it may have changed since the last broadcast).
  const dir = h('input', { type: 'number', min: '0', max: '360', step: '10', value: String(sim.observedWind.direction) });
  const spd = h('input', { type: 'number', min: '0', max: '60', value: String(sim.observedWind.speedKt) });
  const qnh = h('input', { type: 'number', min: '950', max: '1060', value: String(a.qnh) });
  const comps = h('div.sub');
  const update = () => {
    const wind = { direction: Number(dir.value) || 0, speedKt: Number(spd.value) || 0 };
    const c = sim.windComponents(rwySel.value, wind);
    const hw = Math.round(c.headwind);
    const xw = Math.abs(Math.round(c.crosswind));
    const best = sim.bestRunwayForWind(wind);
    comps.textContent = `${hw >= 0 ? `Headwind ${hw} kt` : `TAILWIND ${-hw} kt`}, crosswind ${xw} kt.${best !== rwySel.value ? ` Runway ${best} would be into wind.` : ''}`;
    comps.style.color = hw < -5 ? 'var(--danger)' : '';
  };
  [dir, spd, rwySel].forEach((el) => el.addEventListener('input', update));
  update();

  const apply = h('button.primary', { type: 'submit', text: 'Broadcast ATIS' });
  const cancel = h('button', { type: 'button', text: 'Cancel' });
  const form = h(
    'form.dialog',
    {},
    h('div.dtitle', {}, h('span', { text: `ATIS ${sim.config.airport.icao} - currently information ${a.letter}` })),
    h(
      'div.dbody',
      {},
      h('div.sub', { text: sim.atisText() }),
      h(
        'div.grid',
        {},
        h('label', { text: 'Information' }),
        letterSel,
        h('label', { text: 'Runway in use' }),
        rwySel,
        h('label', { text: 'Wind direction' }),
        dir,
        h('label', { text: 'Wind speed (kt)' }),
        spd,
        h('label', { text: 'QNH (hPa)' }),
        qnh,
      ),
      comps,
      h('div.notice', {
        text: 'Changing the runway: departures that are not yet taxiing get the new runway and SID, arrivals further out than 3.5 NM are re-sequenced by Approach. Aircraft already taxiing keep their clearance - re-route them.',
      }),
      h('div.actions', {}, cancel, apply),
    ),
  );
  const overlay = h('div.overlay', {}, form);
  cancel.addEventListener('click', () => overlay.remove());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sim.updateAtis({
      letter: letterSel.value,
      runway: rwySel.value,
      wind: { direction: Number(dir.value) || 0, speedKt: Number(spd.value) || 0 },
      qnh: Number(qnh.value) || a.qnh,
    });
    overlay.remove();
  });
  document.body.append(overlay);
  apply.focus();
}
