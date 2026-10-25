import type { AirportData, StationType } from '../core/airport/types';
import { runwayChoices, runwayEndsOf } from '../core/runways';
import { altimeterOf, formatMetar } from '../core/met';
import { describeScenario, parseScenarioCode, type Scenario } from '../core/scenario';
import { closureProblems } from '../core/airport/validate';
import { DENSITIES, EVENT_LEVELS, densityIndex } from '../core/levels';
import { levelSlider } from './levelSlider';
import { TUTORIAL_AIRPORT, TUTORIALS, type TutorialId } from '../core/tutorial';
import type { Density, Simulation } from '../core/simulation';
import { regionOf } from '../data/regions';
import { airportPicker, runwayList, trafficBars } from './airportPicker';
import { h } from './dom';
import { renderBriefing } from './briefing';
import { showScenarioBuilder } from './scenarioBuilder';
import type { Settings } from './settings';

export const REPO_URL = 'https://github.com/linoking09/ultimate-atc';

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
  /** Random special events, step 0-4 (never ... often). */
  eventLevel: number;
  seed?: number;
  /** Training scenario from a scenario code (overrides density and events). */
  scenario?: Scenario;
  /** Guided tutorial (sets position and traffic itself). */
  tutorial?: TutorialId;
}

/** EuroScope-like "connect" dialog: pick airport, position and traffic. The runway follows the wind (ATIS). */
export function showLogin(airports: AirportData[], settings: Settings, initialScenario?: string): Promise<LoginResult> {
  return new Promise((resolve) => {
    // The airport: from a shared scenario link, else the last one used.
    const shared = initialScenario ? parseScenarioCode(initialScenario) : undefined;
    let selected = shared && !('error' in shared) && airports.some((a) => a.icao === shared.airport) ? shared.airport : airports.some((a) => a.icao === settings.airport) ? settings.airport : airports[0].icao;
    // The airport field opens the airport menu to the right of the dialog (continent, country, FIR, airport).
    const airportBtn = h('button.airport-field', { type: 'button', title: 'Choose the airport: continent, country and FIR, airport', 'aria-haspopup': 'true' });
    const renderAirportField = () => {
      const ap = airport();
      const r = regionOf(ap.fir);
      airportBtn.replaceChildren(
        h('span.pi-text', {}, h('span.pi-label', { text: `${ap.icao} - ${ap.name}` }), h('span.pi-detail', { text: `${r ? `${r.country.name}, ${r.fir.name} (${r.fir.icao})` : ap.country} - RWY ${runwayList(ap)}` })),
        trafficBars(ap),
        h('span.pi-arrow', { text: '▸' }),
      );
    };
    const picker = airportPicker(
      airports,
      (icao) => {
        selected = icao;
        closePicker();
        renderAirportField();
        update();
      },
      () => [form],
    );
    const closePicker = () => {
      picker.close();
      airportBtn.classList.remove('open');
      airportBtn.focus();
    };
    airportBtn.addEventListener('click', () => {
      if (picker.isOpen()) closePicker();
      else {
        airportBtn.classList.add('open');
        picker.open(selected);
      }
    });

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

    let density: Density = settings.density;
    let eventLevel = settings.eventLevel;
    const densitySlider = levelSlider(DENSITIES.map((d) => d.label), densityIndex(density), (i) => (density = DENSITIES[i].value));
    const eventsSlider = levelSlider(EVENT_LEVELS.map((e) => e.label), eventLevel, (i) => (eventLevel = i));
    const seedInput = h('input', { type: 'text', placeholder: 'random', spellcheck: 'false', autocomplete: 'off', value: initialScenario ?? '' });
    const builderBtn = h('button', { type: 'button', text: 'Scenario builder...', title: 'Choose what to train and get a scenario code' });
    const scenarioInfo = h('div.sub.scenario-info');
    const callsign = h('span');
    const combined = h('div.combined');
    const notice = h('div.notice');

    const airport = () => airports.find((a) => a.icao === selected)!;
    /** The seed field takes a plain number (seed) or a scenario code. */
    const readSeedField = (): { seed?: number; scenario?: Scenario; error?: string } => {
      const v = seedInput.value.trim();
      if (!v) return {};
      if (/^\d+$/.test(v)) return { seed: Number(v) };
      const sc = parseScenarioCode(v);
      if ('error' in sc) return { error: sc.error };
      if (sc.airport !== airport().icao) return { error: `This scenario is for ${sc.airport}` };
      if (sc.closedTaxiways?.length) {
        const problems = closureProblems(airport(), sc.closedTaxiways);
        if (problems.length) return { error: `Taxiway closure not possible: ${problems[0]}` };
      }
      return { seed: sc.seed, scenario: sc };
    };
    const updateScenario = () => {
      const r = readSeedField();
      densitySlider.input.disabled = eventsSlider.input.disabled = !!r.scenario;
      // A scenario code brings its own density and events: show them.
      densitySlider.set(densityIndex(r.scenario?.density ?? density));
      eventsSlider.set(r.scenario?.eventLevel ?? eventLevel);
      scenarioInfo.textContent = r.error
        ? r.error
        : r.scenario
          ? `Scenario: ${describeScenario(r.scenario)}`
          : 'A number (seed) repeats the same traffic; a scenario code also sets runway, traffic, events, start time, night rules, closed taxiways and de-icing.';
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
      // Only the positions this airport has (Memmingen: no Delivery; Sylt: Tower only).
      POSITIONS.forEach((p, i) => {
        const has = p.available && ap.stations.some((st) => st.type === p.type);
        posButtons[i].disabled = !has;
        posButtons[i].title = !p.available ? 'Planned for a later version' : has ? 'Click to staff this position; select several for combined positions' : `${ap.name} has no ${p.label} position - it is covered by the next position up`;
        if (!has) positions.delete(p.type);
      });
      if (!positions.size) positions.add(POSITIONS.find((p) => p.available && ap.stations.some((st) => st.type === p.type))?.type ?? 'TWR');
      posButtons.forEach((x, i) => x.classList.toggle('active', positions.has(POSITIONS[i].type)));
      // The tutorials are written for Stuttgart.
      for (const b of tutorialButtons) {
        b.disabled = ap.icao !== TUTORIAL_AIRPORT;
        b.title = b.disabled ? `The tutorials take place at ${TUTORIAL_AIRPORT}` : b.dataset.summary ?? '';
      }
      updateScenario();
      const sts = selectedPositions()
        .map((t) => ap.stations.find((s) => s.type === t))
        .filter((s) => !!s);
      callsign.textContent = sts.length ? sts.map((st) => `${st!.callsign} ${st!.frequency} "${st!.name}"`).join(' + ') : '-';
      const many = selectedPositions().length > 1;
      combined.classList.toggle('on', many);
      combined.textContent = many ? 'Combined Position' : 'Single Position';
      notice.textContent = ap.dataNotice;
    };

    const connect = h('button.primary', { type: 'submit', text: 'Connect' });
    // Tutorials: a guided first session for each position (fixed traffic, step by step).
    const tutorialButtons = TUTORIALS.map((t) => {
      const b = h(`button.pos-${t.position}`, { type: 'button', text: t.title, title: t.summary });
      b.dataset.summary = t.summary;
      b.addEventListener('click', () => {
        const ap = airports.find((x) => x.icao === TUTORIAL_AIRPORT) ?? airport();
        overlay.remove();
        resolve({ airport: ap, position: t.position, positions: [t.position], density: 'light', eventLevel: 0, tutorial: t.id });
      });
      return b;
    });
    const form = h(
      'form.dialog',
      {},
      h('div.dtitle', {}, h('span', { text: 'Connect' })),
      h(
        'div.dbody',
        {},
        h('h1', { text: 'ULTIMATE ATC' }),
        h('div.sub', { text: 'Air traffic control simulator - EuroScope style, ICAO phraseology (FAA at US airports).' }),
        h(
          'div.grid',
          {},
          h('label', { text: 'Airport' }),
          airportBtn,
          h('label', { text: 'Position' }),
          h('div.positions', {}, ...posButtons),
          h('span'),
          combined,
          h('label', { text: 'Callsign' }),
          callsign,
          h('label', { text: 'Traffic' }),
          densitySlider.el,
          h('label', { text: 'Special events' }),
          eventsSlider.el,
          h('label', { text: 'Scenario' }),
          h('div.rangerow', {}, seedInput, builderBtn),
          h('label', { text: 'Tutorial' }),
          h('div.positions', {}, ...tutorialButtons),
        ),
        h('div.sub', { text: 'New here? A tutorial guides you step by step through a first session as Delivery, Ground or Tower (about 5-15 minutes each).' }),
        scenarioInfo,
        h('div.sub', { text: 'The runway in use is chosen from the wind. You can change it at any time in the ATIS (click ATIS in the toolbar).' }),
        notice,
        h('div.actions', {}, h('a', { href: `${REPO_URL}#readme`, target: '_blank', rel: 'noopener', text: 'Documentation' }), connect),
      ),
    );
    // The dialog and the airport menu next to it, centred together.
    const row = h('div.login-row', {}, form, picker.el);
    const overlay = h('div.overlay', {}, row);
    overlay.addEventListener('click', (e) => {
      if (picker.isOpen() && (e.target === overlay || e.target === row || e.target === picker.el)) closePicker();
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && picker.isOpen()) {
        e.preventDefault();
        closePicker();
      }
    });
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
        density: r.scenario?.density ?? density,
        eventLevel: r.scenario?.eventLevel ?? eventLevel,
        seed: r.seed,
        scenario: r.scenario,
      });
    });
    document.body.append(overlay);
    renderAirportField();
    update();
    connect.focus();
  });
}

const TOWER_REFERENCE: [string, string][] = [
  ['line up and wait runway 25', 'Departure at (or taxiing to) the holding point: enter the runway and wait. Not a take-off clearance.'],
  ['behind landing EWG7TK, line up and wait behind', 'Conditional line-up: the departure enters the runway once the landing aircraft has passed.'],
  ['wind 250 degrees 8 knots, runway 25, cleared for take-off', 'Take-off clearance (from the holding point it lines up and rolls). Mind the spacing: 2 min behind a heavy or on the same SID, 1 min on diverging SIDs. CTOT flights not before CTOT -5 min (an earlier take-off is a slot violation). Refused while a thunderstorm is overhead, and for jets in the night curfew.'],
  ['hold position, cancel take-off / stop immediately', 'Cancel a take-off clearance; during the roll below 80 kt the crew stops.'],
  ['wind 250 degrees 8 knots, runway 25, cleared to land', 'Landing clearance. Without one the arrival goes around at 0.5 NM.'],
  ['continue approach, expect late landing clearance', 'The landing clearance will come late (runway not free yet). Not a landing clearance: clear it to land before the threshold.'],
  ['continue approach / go around', 'Landing clearance later ("continue" alone works too on final) / the arrival climbs away (costs less than a go-around the crew has to make).'],
  ['maintain 160 knots until 4 miles / reduce to final approach speed', 'Speed control on final to fine-tune the gaps between arrivals. Without it arrivals fly about 180 kt on the intercept and 160 kt until 4 NM, then their final approach speed. "resume normal speed" cancels an instruction.'],
  ['cleared for immediate take-off / cleared for take-off, no delay', 'Brisk line-up and roll without waiting - for tight gaps.'],
  ['vacate via E', 'The exit the arrival should take after landing (if it can still reach it; not over a closed taxiway).'],
  ['backtrack runway 24, line up and wait', 'Backtrack (airports without a taxiway to the runway end, e.g. Memmingen N for 24): the departure taxis along the runway to its end, turns around on it and lines up for the full length. Also "enter runway 24 and backtrack" or with "cleared for take-off". The runway is occupied all that time.'],
  ['backtrack, vacate via N', 'An arrival that has rolled past its exit turns around on the runway and backtracks to it (Memmingen runway 06: N).'],
  ['contact radar 125.050 / contact ground 118.605', 'Departures to Radar after take-off (the take-off menu offers the frequency of the SID: at Stuttgart the southern departures go to 119.200), arrivals to Ground once they have vacated.'],
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
  ['cleared to Frankfurt, ETASA4B departure, flight planned route, climb via SID to altitude 5000 feet, squawk 2312', 'IFR clearance: clearance limit (destination), SID of the runway in use, initial climb, squawk. Add "CTOT 1435" if the flight has a slot. The crew reads it back - check the squawk.'],
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
  ['taxi to stand 14 via N, L2', 'Taxi an arrival to its stand. Lettered stands: "taxi to stand G1" / "stand golf 1" (Sylt).'],
  ['turn around, taxi to stand 208', 'The route starts the other way round: an airliner needs a tug for it (several minutes), a small aircraft turns on the spot. Resolve conflict uses it.'],
  ['taxi to de-icing pad DP2 via N', 'Winter scenarios (de-icing): taxi a departure that requests de-icing to a pad first (DP1-DP4; "taxi to de-icing" = a free pad). Status DEICE for 6-10 min, then "de-icing complete, ready for taxi" - now taxi it to the runway. Before that, crews refuse the runway.'],
  ['taxi to runway 13L via N blue, M blue', 'Coloured guide lines for parallel taxiing are taxiways of their own (Cologne/Bonn: M BLUE, M ORANGE, N BLUE, N ORANGE next to the centre lines M and N): say the colour after the letter, "via mike blue".'],
  ['taxi via S, hold short of E', 'Incomplete taxi instruction: the clearance limit is the hold-short point.'],
  ['(closed taxiway in the route)', 'Taxiways closed by the scenario are red and hatched on the scope and in the ATIS: the crew answers "unable, taxiway S closed". Give a route around them. Parts with black crosses (e.g. Memmingen S, Sylt G) are closed permanently, as on the aerodrome chart.'],
  ['advise able for departure from intersection D', 'Ask whether the crew can depart from an intersection ("are you able intersection D" works too). Answer: "affirm, able" or "negative, we require full length".'],
  ['... hold short of taxiway D | runway 25', 'Add a hold-short point to a route (or send it on its own). The aircraft stops at the dashed intermediate holding line of the charts, otherwise with its nose 40 m from the centre line of D.'],
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
  ['information K is current, QNH 1018', 'To a crew that reported an old ATIS letter (aircraft menu). After a new ATIS, "all stations, information K is now current" (ALL STN) reaches everybody on your frequency.'],
  ['SAY AGAIN (sidebar) / say again', 'The selected aircraft (or the last caller) repeats its last transmission.'],
  ['Aircraft menu: Acknowledge CATC alert', 'You have checked the head-on alert and the aircraft will not meet (e.g. one stops or turns off before): the flashing stops until that conflict is over.'],
  ['Aircraft menu: Resolve conflict with ...', 'Two aircraft face each other on a taxiway (A-SMGCS CATC alert: flashing red while both roll towards each other): turn one off via a junction, send it to another entry (departure) or a free stand nearby (arrival), or turn it around (a tug for an airliner, several minutes).'],
];

/** FAA forms (US airports, San Diego). */
const FAA_REFERENCE: [string, string][] = [
  ['runway 27, taxi via B', 'Taxi to the runway (the runway in front is the clearance limit); "runway 9 at B8, taxi via B" to an intersection.'],
  ['push back approved, tail east', 'Pushback facing west ("tail" = the opposite of "facing"). There is no start-up approval: crews call Delivery "ready to push, request frequency", then Ground "ready to push".'],
  ['cleared to KSFO airport, PADRZ2 departure, then as filed, climb via SID except maintain 5000, departure frequency 125.15, squawk 1234', 'IFR clearance; "then as filed", "expect FL350 10 minutes after departure" and the departure frequency are accepted. Datalink clearances are PDC.'],
  ['runway 27 at B1, line up and wait / wind 250 at 8, runway 27, cleared for takeoff', 'Tower; runways without a leading zero ("runway 9").'],
  ['turn left at B5 / cross runway 27 at C6', 'Vacate via B5; crossing where the crew holds.'],
  ['contact ground point niner / contact SoCal Departure', 'Hand-offs: abbreviated frequency, Departure.'],
  ['altimeter 2992 / information K is current, altimeter 2992', 'Altimeter setting in inches (toolbar A2992); the METAR and ATIS are in US format.'],
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
  ['Click ATIS / RWY / wind in the toolbar', 'Edit the ATIS (runway in use - with parallel runways both together or one alone -, wind and gusts, QNH, information letter). The wind changes with the weather: a new METAR every 30 minutes, the ATIS letter turns red when it no longer matches, and a tailwind above 5 kt brings a runway change hint. "TS" after the wind: thunderstorm - no pushbacks or take-offs while it is overhead, windshear go-arounds (no penalty)'],
  ['2215L after the UTC time', 'Local time, shown with night flying restrictions: jets must be airborne by 2300 local, landings until 2330 (delayed flights until 2400)'],
  ['Space (command line empty)', 'Pause / resume'],
  ['Home', 'Reset the scope view'],
  ['ROT (toolbar)', 'Rotate the scope: runway horizontal like the aerodrome chart / north-up'],
  ['BRIEFING (toolbar)', 'Airport briefing: your position, runway in use, flows, entries and exits, typical routes, stands, hot spots'],
  ['x (command line)', 'Clear the command line'],
  ['ROGER (sidebar) / roger', 'Acknowledge the call of the selected aircraft (or the last caller): no read-back, it stops flashing and waits 4 minutes before calling again.'],
  ['Aircraft menu: Request hand-off to TWR / GND', 'Ask the position the simulator runs for an aircraft now (e.g. a departure still with Ground, an arrival still with Approach).'],
  ['COORD (toolbar)', 'Landline to Approach / Ground: no more arrivals, or hold all departures, to make room. -2 points per minute each while it is on.'],
  ['Tutorial panel (tutorials only)', 'Shows the current step. "Show me" selects the aircraft and puts the example instruction into the command line; Back shows the previous step again, Next goes on (or skips the task), Skip tutorial ends it and starts live traffic; tap the title to fold it away. The panel disappears when the tutorial is finished. Start a tutorial in the Connect dialog.'],
  ['DISCONNECT (toolbar)', 'Debriefing of the session (what earned and what cost points, answer times, incidents, advice), then continue or end the session'],
  ['F3 / SYSTEMS (toolbar)', 'Systems window: status of A-SMGCS (surveillance, RMCA, CATC, routing), A-CDM, DCL and the ILS (localizer, glide path); switch them on or off. A runway without an ILS (Sylt 14) is always flown as an RNP approach'],
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
          ...(sim.faa
            ? [
                h('h2', { text: 'FAA phraseology (US)' }),
                h('p', { text: 'At this airport the FAA forms apply too, and the pilots answer in US wording ("clear of runway 27 at B5", "holding short at B1, ready", "then as filed").' }),
                h('table.ref', {}, ...FAA_REFERENCE.map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', { text: b })))),
              ]
            : []),
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
            text: 'PHX scope style (default, SETTINGS): departures blue, arrivals yellow, vehicles green; dimmed: on another frequency (Tower, or an AI Delivery / Ground). The aircraft shape is the radar return, the small square the transponder (SSR) symbol with history dots behind it. Classic style: white on your frequency, grey on another. Both: flashing (white / yellow) = waiting for your answer, orange after one minute; flashing red = CATC head-on alert; magenta "PAN" = emergency; red = incident.',
          }),
          h('h2', { text: 'Tags and lists' }),
          h('p', {
            text: 'Tag: callsign + runway (departures) or stand (arrivals); type, wake category and ground state; SID and where the aircraft is cleared to, speed. Click the items: callsign / type = flight plan, SID = clearance (Delivery) or flight plan, cleared-to = taxi menu, ground state = aircraft menu. Zoomed out, tags show only the callsign (* = request); select or tap an aircraft for its full tag (Settings: Data tags). List cells with a function (C/S, ATYP, SID, ASSR, C, TAXI / STND, STS, REQ) open it with a click, like in EuroScope.',
          }),
          h('p', {
            text: 'Ground states (PHX / EuroScope): SUG / ST-UP start-up given, PBG / PUSH pushback, TXG / TAXI taxi out, TX / TAXI taxi in, H/P at the holding point, ALU / L/U lined up, DEP / DEPA departing, ONB / PARK on blocks; also RQST, CLRD, DEICE, HOLD, HS-R, VAC, VACD, APP, LAND, G/A.',
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
 * ATIS editor: the controller sets the runway in use, wind, QNH and the information letter (pre-filled
 * from the latest METAR). The preview shows the new ATIS as D-ATIS text and spoken; applying it
 * broadcasts it.
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
  // Parallel runways used together first ("Runways 26R + 26L"), then each runway on its own.
  for (const c of runwayChoices(sim.config.airport)) rwySel.append(h('option', { value: c.key, text: c.label }));
  rwySel.value = a.runway;
  // Pre-filled with the actual surface wind (it may have changed since the last broadcast).
  const dir = h('input', { type: 'number', min: '0', max: '360', step: '10', value: String(sim.observedWind.direction) });
  const spd = h('input', { type: 'number', min: '0', max: '60', value: String(sim.observedWind.speedKt) });
  const gust = h('input', { type: 'number', min: '0', max: '80', value: sim.observedWind.gustKt ? String(sim.observedWind.gustKt) : '', placeholder: '-' });
  const windOf = () => {
    const g = Number(gust.value) || 0;
    const speedKt = Number(spd.value) || 0;
    return { direction: Number(dir.value) || 0, speedKt, ...(g > speedKt ? { gustKt: g } : {}) };
  };
  const qnh = h('input', { type: 'number', min: '950', max: '1060', value: String(sim.metar.qnh) });
  const comps = h('span.hint');
  const qnhHint = h('span.hint');
  const datis = h('pre.datis');
  const spoken = h('div.spoken');
  // Only when the runway changes: what happens to the traffic.
  const notice = h('div.notice', {
    text: 'Runway change: departures not yet taxiing get the new runway and SID, Approach re-sequences arrivals beyond 3.5 NM. Aircraft already taxiing keep their route - re-route them.',
  });
  const update = () => {
    const draft = { letter: letterSel.value, runway: rwySel.value, wind: windOf(), qnh: Number(qnh.value) || a.qnh, updatedAt: sim.time, metar: sim.metar };
    datis.textContent = sim.atisDatis(draft).join('\n');
    spoken.textContent = sim.atisText(draft);
    const wind = { direction: Number(dir.value) || 0, speedKt: Number(spd.value) || 0 };
    const c = sim.windComponents(runwayEndsOf(rwySel.value)[0], wind);
    const hw = Math.round(c.headwind);
    const xw = Math.abs(Math.round(c.crosswind));
    comps.textContent = `${hw >= 0 ? `head ${hw}` : `tail ${-hw}`} / cross ${xw} kt`;
    comps.classList.toggle('bad', hw < -5);
    // Tailwind above 5 kt on the selected runway: wind direction and speed in red (as in the toolbar).
    for (const el of [dir, spd]) el.classList.toggle('bad', hw < -5);
    qnhHint.textContent = sim.faa ? `hPa = A${altimeterOf(Number(qnh.value) || a.qnh)}` : 'hPa';
    notice.hidden = rwySel.value === a.runway;
  };
  [dir, spd, gust, qnh, rwySel, letterSel].forEach((el) => el.addEventListener('input', update));
  update();

  const apply = h('button.primary', { type: 'submit', text: 'Broadcast ATIS' });
  const cancel = h('button', { type: 'button', text: 'Cancel' });
  const diffs = sim.atisDifferences;
  const form = h(
    'form.dialog.atis-editor',
    {},
    h('div.dtitle', {}, h('span', { text: `ATIS ${sim.config.airport.icao}` }), h('span.dim', { text: `current: information ${a.letter}` })),
    h(
      'div.dbody',
      {},
      h('div.metar', { text: formatMetar(sim, sim.metar) }),
      ...(diffs.length ? [h('div.sub.changed', { text: `Changed since information ${a.letter}: ${diffs.join(', ')}` })] : []),
      h(
        'div.atis-form',
        {},
        h('label', { text: 'Information' }),
        letterSel,
        h('label', { text: 'Runway' }),
        rwySel,
        h('label', { text: 'Wind' }),
        h('div.wind', {}, dir, h('span', { text: '°' }), spd, h('span', { text: 'kt gust' }), gust, comps),
        h('label', { text: 'QNH' }),
        h('div.wind', {}, qnh, qnhHint),
      ),
      notice,
      datis,
      h('details.spoken', {}, h('summary', { text: 'Spoken text' }), spoken),
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
      wind: windOf(),
      qnh: Number(qnh.value) || a.qnh,
    });
    overlay.remove();
  });
  document.body.append(overlay);
  apply.focus();
}
