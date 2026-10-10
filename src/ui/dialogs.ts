import type { AirportData, StationType } from '../core/airport/types';
import { describeScenario, parseScenarioCode, type Scenario } from '../core/scenario';
import type { Density, Simulation } from '../core/simulation';
import { h } from './dom';
import { renderBriefing } from './briefing';
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
  { type: 'DEL', label: 'Delivery', available: true },
  { type: 'GND', label: 'Ground', available: true },
  { type: 'TWR', label: 'Tower', available: true },
  { type: 'APP', label: 'Approach / Departure', available: false },
  { type: 'CTR', label: 'Radar / Center', available: false },
];

export interface LoginResult {
  airport: AirportData;
  position: StationType;
  /** All staffed positions (combined positions). */
  positions: StationType[];
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

    // Several positions can be staffed together (combined positions, e.g. Delivery + Ground).
    const positions = new Set<StationType>((settings.positions?.length ? (settings.positions as StationType[]) : [settings.position as StationType]).filter((t) => POSITIONS.some((p) => p.type === t && p.available)));
    if (!positions.size) positions.add('GND');
    const posButtons = POSITIONS.map((p) => {
      const b = h(`button.pos-${p.type}`, {
        type: 'button',
        text: p.label,
        disabled: !p.available,
        title: !p.available ? 'Planned for a later version' : 'Click to staff this position; select several for combined positions',
      });
      b.addEventListener('click', () => {
        if (positions.has(p.type) && positions.size > 1) positions.delete(p.type);
        else positions.add(p.type);
        posButtons.forEach((x, i) => x.classList.toggle('active', positions.has(POSITIONS[i].type)));
        update();
      });
      if (positions.has(p.type)) b.classList.add('active');
      return b;
    });
    /** Staffed positions in their natural order; the primary one is the highest (Ground before Delivery). */
    const selectedPositions = (): StationType[] => POSITIONS.filter((p) => positions.has(p.type)).map((p) => p.type);

    const eventsBox = h('input', { type: 'checkbox' });
    eventsBox.checked = settings.events;
    const densitySel = h('select');
    for (const d of ['light', 'medium', 'heavy']) densitySel.append(h('option', { value: d, text: d }));
    densitySel.value = settings.density;
    const seedInput = h('input', { type: 'text', placeholder: 'random', spellcheck: 'false', autocomplete: 'off', value: initialScenario ?? '' });
    const builderBtn = h('button', { type: 'button', text: 'Scenario builder...', title: 'Choose what to train and get a scenario code' });
    const scenarioInfo = h('div.sub.scenario-info');
    const callsign = h('span');
    const combined = h('div.combined');
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
      const sts = selectedPositions()
        .map((t) => ap.stations.find((s) => s.type === t))
        .filter((s) => !!s);
      callsign.textContent = sts.length ? sts.map((st) => `${st!.callsign} ${st!.frequency} "${st!.name}"`).join(' + ') : '-';
      const many = selectedPositions().length > 1;
      combined.classList.toggle('on', many);
      combined.textContent = many ? 'Combined Position' : 'Single Position';
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
          h('span'),
          combined,
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
        // The primary position is the highest one staffed (Ground before Delivery).
        position: selectedPositions().at(-1)!,
        positions: selectedPositions(),
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

const TOWER_REFERENCE: [string, string][] = [
  ['line up and wait runway 25', 'Departure at (or taxiing to) the holding point: enter the runway and wait. Not a take-off clearance.'],
  ['behind landing EWG7TK, line up and wait behind', 'Conditional line-up: the departure enters the runway once the landing aircraft has passed.'],
  ['wind 250 degrees 8 knots, runway 25, cleared for take-off', 'Take-off clearance (from the holding point it lines up and rolls). Mind the spacing: 2 min behind a heavy or on the same SID, 1 min on diverging SIDs. CTOT flights not before CTOT -5 min (an earlier take-off is a slot violation).'],
  ['hold position, cancel take-off / stop immediately', 'Cancel a take-off clearance; during the roll below 80 kt the crew stops.'],
  ['wind 250 degrees 8 knots, runway 25, cleared to land', 'Landing clearance. Without one the arrival goes around at 0.5 NM.'],
  ['continue approach, expect late landing clearance', 'The landing clearance will come late (runway not free yet). Not a landing clearance: clear it to land before the threshold.'],
  ['continue approach / go around', 'Landing clearance later ("continue" alone works too on final) / the arrival climbs away (costs less than a go-around the crew has to make).'],
  ['maintain 160 knots until 4 miles / reduce to final approach speed', 'Speed control on final to fine-tune the gaps between arrivals.'],
  ['cleared for immediate take-off / cleared for take-off, no delay', 'Brisk line-up and roll without waiting - for tight gaps.'],
  ['vacate via E', 'The exit the arrival should take after landing (if it can still reach it).'],
  ['contact radar 119.200 / contact ground 118.605', 'Departures to Langen Radar after take-off, arrivals to Ground once they have vacated.'],
  ['cross runway 25', 'Runway crossing for an aircraft Ground handed over at the runway holding point; it reports the runway vacated.'],
];

const VEHICLE_REFERENCE: [string, string][] = [
  ['Follow-me 1, proceed [to DCEEO] [via N, F]', 'The follow-me drives to the aircraft it was assigned to (it asks: "request proceed to DCEEO at taxiway F"). Vehicles get "proceed", aircraft "taxi".'],
  ['Follow-me 1, report position', 'The driver reports where the car is (also to an aircraft on the ground: "DLH5AB report position").'],
  ['all stations, information B is now current / standby', 'Broadcast (ALL STN in the sidebar): nobody reads it back. "all stations, standby" puts every open request on hold.'],
  ['Follow-me 1, return to base / proceed to base', 'The follow-me drives back to the fire station (it asks when the job is done).'],
  ['Follow-me 1, hold position / continue', 'Stop / drive on. While leading, the aircraft behind it stops too.'],
  ['Tug 5, tow approved [to stand 45] [via M, N]', 'Approve a tow ("proceed" works too). Hold position, continue, hold short, cross runway and give way work as for aircraft.'],
];

const DELIVERY_REFERENCE: [string, string][] = [
  ['cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312', 'IFR clearance: clearance limit (destination), SID of the runway in use, initial climb, squawk. Add "CTOT 1435" if the flight has a slot. The crew reads it back - check the squawk.'],
  ['readback correct', 'Confirm a correct readback.'],
  ['negative, squawk 2312', 'Correct a wrong readback (or assign a new code).'],
  ['start-up approved', 'Approve engine start; with A-CDM at the TSAT (-5/+5 min), the crew calls when it is due.'],
  ['CTOT 1435', 'Tell the crew its calculated take-off time (ATFM slot: take-off from -5 to +10 minutes).'],
  ['contact ground 118.605', 'Hand a cleared departure to Ground for pushback.'],
  ['Aircraft menu: Send DCL', 'Datalink clearance (DCL) for crews that requested it by datalink: no voice transmission and no readback.'],
];

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
  ['follow the follow-me [to stand 14]', 'A follow-me car comes and leads the aircraft (crews unfamiliar with the airport ask for one).'],
  ['standby', 'Acknowledge a request; the pilot waits two minutes before calling again.'],
  ['expedite taxi', 'Taxi a bit faster.'],
  ['say again', 'The pilot repeats the last transmission.'],
  ['Aircraft menu: Acknowledge CATC alert', 'You have checked the head-on alert and the aircraft will not meet (e.g. one stops or turns off before): the flashing stops until that conflict is over.'],
  ['Aircraft menu: Resolve conflict with ...', 'Two aircraft face each other on a taxiway (A-SMGCS CATC alert): turn one off via a junction, or order a tug (several minutes).'],
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
  ['Click a tag item', 'Callsign: flight plan + telephony; cleared-to: taxi menu; status: aircraft menu'],
  ['Click ATIS / RWY / wind in the toolbar', 'Edit the ATIS (runway in use, wind, QNH, information letter)'],
  ['Space (command line empty)', 'Pause / resume'],
  ['Home', 'Reset the scope view'],
  ['ROT (toolbar)', 'Rotate the scope: runway horizontal like the aerodrome chart / north-up'],
  ['BRIEFING (toolbar)', 'Airport briefing: your position, runway in use, flows, entries and exits, typical routes, stands, hot spots'],
  ['x (command line)', 'Clear the command line'],
  ['ROGER (sidebar) / roger', 'Acknowledge the call of the selected aircraft (or the last caller): no read-back, it stops flashing and waits 4 minutes before calling again.'],
  ['Aircraft menu: Request hand-off to TWR / GND', 'Ask the position the simulator runs for an aircraft now (e.g. a departure still with Ground, an arrival still with Approach).'],
  ['DISCONNECT (toolbar)', 'Debriefing of the session (what earned and what cost points, answer times, incidents, advice), then continue or end the session'],
  ['F3 / SYSTEMS (toolbar)', 'Systems window: status of A-SMGCS (surveillance, RMCA, CATC, routing), A-CDM, DCL and the ILS (localizer, glide path); switch them on or off'],
  ['F2 / SETTINGS (toolbar)', 'Settings: mobile or PC layout, interface and tag size, traffic density, special events'],
  ['Mobile mode: tap / tap again / long press', 'Select the aircraft / open its menu (or the tag item) / open its menu; + and - buttons zoom'],
];

export type HelpTab = 'briefing' | 'phraseology' | 'controls';
let lastHelpTab: HelpTab = 'briefing';

/** Help window with tabs: airport briefing, phraseology, controls. */
export function showHelp(sim: Simulation, tab: HelpTab = lastHelpTab): void {
  document.querySelector('.overlay.help')?.remove();
  const close = h('button', { type: 'button', text: 'Close' });
  const body = h('div.dbody');
  const pages: Record<HelpTab, { label: string; render: () => HTMLElement }> = {
    briefing: { label: `Airport briefing ${sim.config.airport.icao}`, render: () => renderBriefing(sim) },
    phraseology: {
      label: 'Phraseology',
      render: () =>
        h(
          'div',
          {},
          h('p', {
            text:
              'Delivery: departures call for their IFR clearance about 10 minutes before off-block (or request it by datalink), then for start-up; clear them, check the readback, approve start-up and hand them to Ground. ' +
              'Ground: departures call for pushback and taxi; you hand them to Tower at the runway holding point. ' +
              'Arrivals call Ground after vacating the runway; taxi them to a stand. Keep traffic moving, avoid conflicts and never let anyone onto the runway without a clearance. ' +
              'Tower: departures call ready for departure at the holding point, arrivals call on final; line them up, clear them for take-off or to land, keep the departure spacing, and hand departures to Radar and arrivals to Ground.',
          }),
          h('p', {
            text:
              'Type instructions in ICAO phraseology. The callsign can be the ICAO code (DLH5AB), the radiotelephony callsign (Lufthansa 5AB), or omitted if an aircraft is selected. Several instructions can be combined in one transmission.',
          }),
          h('h2', { text: 'Ground' }),
          h('table.ref', {}, ...REFERENCE.map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', { text: b })))),
          h('h2', { text: 'Tower' }),
          h('table.ref', {}, ...TOWER_REFERENCE.map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', { text: b })))),
          h('h2', { text: 'Delivery' }),
          h('table.ref', {}, ...DELIVERY_REFERENCE.map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', { text: b })))),
          h('h2', { text: 'Vehicles' }),
          h('table.ref', {}, ...VEHICLE_REFERENCE.map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', { text: b })))),
          h('p', { text: 'Radio discipline: after an instruction nobody else calls until the addressed station has read back.' }),
        ),
    },
    controls: {
      label: 'Controls',
      render: () =>
        h(
          'div',
          {},
          h('table.ref', {}, ...KEYS.map(([a, b]) => h('tr', {}, h('td', {}, h('kbd', { text: a })), h('td', { text: b })))),
          h('h2', { text: 'Colours' }),
          h('p', {
            text: 'White: on your frequency. Grey: other controller (Tower, or an AI Delivery / Ground). Flashing yellow: waiting for your answer (orange after one minute). Magenta "PAN": emergency. Red: incident.',
          }),
          h('p', {}, 'Full documentation: ', h('a', { href: REPO_URL, target: '_blank', rel: 'noopener', text: REPO_URL })),
        ),
    },
  };
  const tabButtons = (Object.keys(pages) as HelpTab[]).map((key) => {
    const b = h('button', { type: 'button', text: pages[key].label, role: 'tab' });
    b.addEventListener('click', () => show(key));
    return { key, b };
  });
  const show = (key: HelpTab) => {
    lastHelpTab = key;
    for (const t of tabButtons) t.b.classList.toggle('active', t.key === key);
    body.replaceChildren(pages[key].render());
    body.scrollTop = 0;
  };
  const overlay = h(
    'div.overlay.help',
    {},
    h(
      'div.dialog.wide',
      {},
      h('div.dtitle', {}, h('span', { text: `Help - ${sim.config.airport.stations.filter((st) => sim.userControls(st.type)).map((st) => st.name).join(' + ')}` }), close),
      h('div.tabs', { role: 'tablist' }, ...tabButtons.map((t) => t.b)),
      body,
    ),
  );
  const done = () => overlay.remove();
  close.addEventListener('click', done);
  overlay.addEventListener('click', (e) => e.target === overlay && done());
  document.body.append(overlay);
  show(tab);
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
    comps.textContent = `${hw >= 0 ? `Headwind ${hw} kt` : `Tailwind ${-hw} kt`}, crosswind ${xw} kt.`;
    // Tailwind above 5 kt on the selected runway: wind direction and speed in red (as in the toolbar).
    for (const el of [dir, spd]) el.classList.toggle('bad', hw < -5);
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
