import { altimeterOf } from '../core/met';
import { otherEnd, type Airport, type TaxiNode } from '../core/airport/airport';
import { capitalize, runwayWords, usRunway } from '../core/runways';
import type { Compass, StationType } from '../core/airport/types';
import type { Aircraft } from '../core/aircraft';
import { distance, headingDiff, headingOf, sub, type Vec2 } from '../core/geo';
import { formatCommand } from '../core/phraseology/format';
import { parseTransmission } from '../core/phraseology/parser';
import { catcAlert, headOnPartner, resolveOptions, routeHeadOn } from '../core/conflicts';
import { allocateSquawk, CTOT_EARLY_S, departureFrequency, hhmm, initialClimb, offBlockDue, sidsForDestination, suggestedSid } from '../core/delivery';
import { formatClearanceClimb, formatDepartureRoute } from '../core/phraseology/format';
import { previewTaxi } from '../core/pilot';
import type { SystemId } from '../core/systems';
import { needsDeicing, padUser } from '../core/deicing';
import { destinationName } from '../data/destinations';
import type { RadioMessage } from '../core/radio';
import { perform, saveSession, type SessionAction } from '../core/session';
import { addControlTime, AUTOSAVE_ID, countSession, downloadSession, formatDuration, loadStats, storeSession } from './sessionStore';
import type { Simulation, TransmitResult } from '../core/simulation';
import { REPO_URL, showAtisEditor, showHelp } from './dialogs';
import { formatTime, h } from './dom';
import { minutesToHhmm } from '../core/time';
import { windWords } from '../core/weather';
import type { TutorialRunner } from '../core/tutorial';
import { TutorialPanel } from './tutorialPanel';
import { arrivalList, departureList, VehicleList, type ListItem, type TrafficList } from './lists';
import { vehicleTel, type Vehicle } from '../core/vehicles';
import { PopupMenu, type MenuItem } from './menu';
import { Scope, type TagItem } from './scope';
import { CommandInput } from './commandInput';
import { saveSettings, type Settings } from './settings';
import { showSettings } from './settingsDialog';
import { showSystems } from './systemsDialog';
import { PilotVoices, VoiceInput } from './voice';
import { showDebrief } from './debriefDialog';

const SPEEDS = [1, 2, 4, 8];
/** How often the session is kept as the autosave (real time, ms). */
const AUTOSAVE_MS = 2 * 60 * 1000;

/** A saved session the App continues (main.ts restores it first). */
export interface RestoredSession {
  name: string;
  controlSeconds: number;
  /** False if the rebuilt traffic differs from the saved one. */
  matches: boolean;
}

/** The positions with a quick-action bar of their own (Approach and Radar to follow). */
type QuickPosition = 'DEL' | 'GND' | 'TWR';
/** A button of a position's quick-action bar: its text and the menu item (by label) it stands for. */
interface QuickSpec {
  text: string;
  re?: RegExp;
  /** Sent instead of what the menu item says (e.g. PUSH without a facing). */
  phrase?: string;
  /** Greyed out even if the menu item is there. */
  off?: boolean;
}
/** phrase: picked and sent with SEND; menu: opens a menu whose choice is picked; action: done at once; off: greyed out. */
interface QuickButton {
  text: string;
  kind: 'phrase' | 'menu' | 'action' | 'off';
  title?: string;
  phrase?: string;
  items?: () => MenuItem[];
  action?: () => void;
}
/** Keys that work as push-to-talk (held down). */
const PTT_KEYS = new Set(['Backquote', 'ControlRight', 'Insert']);
/**
 * Pilot voices (TTS) and speech recognition (MIC) are switched off for 1.0: they are not reliable
 * enough on all devices yet. The code stays; set this to true to bring them back.
 */
const VOICE_ENABLED = false;

/**
 * The controller client: wires the simulation to the scope, the traffic
 * lists, the message window and the command line.
 */
export class App {
  private readonly scope: Scope;
  private readonly menu = new PopupMenu();
  private readonly lists: (TrafficList | VehicleList)[];
  private readonly messagesEl: HTMLElement;
  private readonly input: CommandInput;
  private readonly targetEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly fields: Record<string, HTMLElement> = {};
  private readonly speedButtons: HTMLButtonElement[] = [];
  private readonly pauseButton: HTMLButtonElement;
  private readonly micButton: HTMLButtonElement;
  private readonly ttsButton: HTMLButtonElement;
  private readonly main: HTMLElement;
  private readonly routesBtn: HTMLButtonElement;
  private readonly rotBtn: HTMLButtonElement;
  private readonly sysBtn: HTMLButtonElement;
  private readonly coordBtn: HTMLButtonElement;
  /** Mobile mode: actions for the selected aircraft. */
  private readonly quickbar: HTMLElement;
  private quickbarKey = '';
  /**
   * Quick-action bar: phrases picked for the selected aircraft or vehicle, sent together with SEND.
   * `group`: the menu button the phrase was chosen from (one choice per menu, e.g. one taxi route).
   */
  private quickSel: { cs: string; picks: { phrase: string; group?: string }[] } | null = null;
  /** While set, say() picks the phrase for the quick-action bar instead of transmitting it (a menu opened from there). */
  private picking: { cs: string; group: string } | null = null;
  /** While set, say() collects the phrase instead of transmitting it (to learn what a menu action would say). */
  private capture: string[] | null = null;
  /** Mobile mode: the quick-action bar shows the ALL STATIONS broadcasts. */
  private allStationsMode = false;
  /** Set when the session is ended with DISCONNECT: reloading then needs no warning. */
  private leaving = false;
  /** Density / events last chosen in the settings; the session keeps a scenario's values until they change. */
  private densitySetting: Settings['density'];
  private eventsSetting: number;
  private readonly voices = new PilotVoices();
  private readonly voiceIn: VoiceInput;

  /** Your time on position in this session: real seconds while the simulation runs (not paused, page visible). */
  private controlSeconds = 0;
  /** Time on position and simulation time not yet added to the totals (sessionStore.ts). */
  private statsPending = 0;
  private statsSimTime = 0;
  private lastStatsFlush = 0;
  private lastAutosave = 0;
  private readonly tutorial: boolean;
  private selected?: string;
  private speed = 1;
  private paused = false;
  private last = performance.now();
  private lastSlowUpdate = 0;
  private history: string[] = [];
  private historyIdx = -1;
  private menuPreview = false;
  private tutorialPanel?: TutorialPanel;

  constructor(
    root: HTMLElement,
    private readonly sim: Simulation,
    private readonly settings: Settings,
    tutorial?: TutorialRunner,
    restored?: RestoredSession,
  ) {
    this.tutorial = !!tutorial;
    this.controlSeconds = restored?.controlSeconds ?? 0;
    this.statsSimTime = sim.time;
    // A restored session continues an earlier one: it is not counted again.
    if (!restored) countSession();
    this.densitySetting = settings.density;
    this.eventsSetting = settings.eventLevel;

    // ---------------------------------------------------------------- toolbar
    const field = (key: string, title: string) => (this.fields[key] = h('span.field', { title }));
    this.pauseButton = h('button', { title: 'Pause / resume (Space)', text: 'II' });
    this.pauseButton.addEventListener('click', () => this.togglePause());
    for (const s of SPEEDS) {
      const b = h('button', { text: `${s}x`, title: `Simulation rate ${s}x` });
      b.addEventListener('click', () => this.setSpeed(s));
      this.speedButtons.push(b);
    }
    this.ttsButton = h('button', { text: 'TTS', title: 'Read pilot transmissions aloud (text-to-speech)' });
    this.ttsButton.addEventListener('click', () => this.setTts(!this.voices.enabled, true));
    const routesBtn = (this.routesBtn = h('button', { text: 'ROUTES', title: 'Show the cleared routes of all aircraft on your frequency' }));
    routesBtn.addEventListener('click', () => {
      this.settings.showRoutes = !this.settings.showRoutes;
      saveSettings(this.settings);
      this.applySettings();
    });
    const rotBtn = (this.rotBtn = h('button', { text: 'ROT', title: 'Rotate the scope: runway horizontal (like the aerodrome chart) / north up' }));
    rotBtn.addEventListener('click', () => {
      this.settings.runwayAligned = !this.settings.runwayAligned;
      saveSettings(this.settings);
      this.applySettings();
    });
    const sysBtn = (this.sysBtn = h('button', { text: 'SYSTEMS', title: 'ATC and airport systems: A-SMGCS, A-CDM, datalink, ILS (F3)' }));
    sysBtn.addEventListener('click', () => this.openSystems());
    const coordBtn = (this.coordBtn = h('button', { text: 'COORD', title: 'Coordination with Approach and Ground: stop arrivals or hold departures to make room' }));
    coordBtn.addEventListener('click', () => {
      const r = coordBtn.getBoundingClientRect();
      this.menu.open('COORDINATION', this.coordItems(), r.left, r.bottom + 2);
    });
    const settingsBtn = h('button.settings-btn', { html: '&#9881; SETTINGS', title: 'Settings: device layout, sizes, voice, traffic' });
    settingsBtn.addEventListener('click', () => this.openSettings());
    const helpBtn = h('button', { text: 'HELP', title: 'Phraseology and controls (F1)' });
    helpBtn.addEventListener('click', () => showHelp(this.sim));
    const briefBtn = h('button', { text: 'BRIEFING', title: 'Airport briefing: procedures and information for your position' });
    briefBtn.addEventListener('click', () => showHelp(this.sim, 'briefing'));
    const docsBtn = h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, h('button', { text: 'DOCS', type: 'button' }));
    const saveBtn = h('button', { text: 'SAVE', title: 'Save the session (continue it later from the Connect dialog, or download it as a file)' });
    saveBtn.addEventListener('click', () => this.openSave());
    if (tutorial) saveBtn.style.display = 'none';
    const disconnect = h('button', { text: 'DISCONNECT', title: 'End the session' });
    disconnect.addEventListener('click', () => {
      // The debriefing first: the simulation pauses while it is open.
      const wasPaused = this.paused;
      if (!wasPaused) this.togglePause();
      showDebrief(this.sim, {
        onContinue: () => {
          if (!wasPaused && this.paused) this.togglePause();
        },
        onEnd: () => {
          this.leaving = true;
          this.flushStats();
          this.autosave();
          location.reload();
        },
      });
    });

    const toolbar = h(
      'div.toolbar',
      {},
      h('span.brand', { text: 'ULTIMATE ATC' }),
      field('station', 'Your frequencies - click one to switch it off (the simulator takes the position over) or on again'),
      field('rwy', 'Runway(s) in use - with parallel runways for landings (ARR) or take-offs (DEP) only, both'),
      field('atis', 'Current ATIS'),
      field('wind', 'Surface wind'),
      field('qnh', sim.faa ? 'Altimeter setting (inches of mercury)' : 'QNH (hPa)'),
      field('utc', 'Simulation time (UTC)'),
      field('ontime', 'Your time on position in this session (real time, without pauses)'),
      h('span.sep'),
      this.pauseButton,
      ...this.speedButtons,
      h('span.sep'),
      this.ttsButton,
      routesBtn,
      rotBtn,
      h('span.spacer'),
      briefBtn,
      sysBtn,
      coordBtn,
      settingsBtn,
      field('score', 'Score: +10 per departure handed off / arrival parked, penalties for incidents, delays and "say again"'),
      helpBtn,
      docsBtn,
      saveBtn,
      disconnect,
    );

    for (const key of ['rwy', 'atis', 'wind', 'qnh']) {
      this.fields[key].classList.add('clickable');
      this.fields[key].addEventListener('click', () => showAtisEditor(this.sim));
    }

    // ---------------------------------------------------------------- scope + panels
    const canvas = h('canvas.scope');
    // Click a frequency in the toolbar: switch it off / on; "+": take over another position.
    this.fields.station.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-add]')) {
        const r = this.fields.station.getBoundingClientRect();
        this.menu.open('TAKE OVER POSITION', this.addStationItems(), r.left, r.bottom + 2);
        return;
      }
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-station]');
      const type = el?.dataset.station as StationType | undefined;
      if (!type) return;
      const err = this.act({ k: 'station', type, on: !this.sim.userControls(type) });
      if (err) this.toast(err);
      this.slowUpdate();
    });

    this.main = h('div.main', {}, canvas);
    const listCb = {
      select: (cs: string) => this.select(cs),
      center: (cs: string) => {
        const pos = this.sim.find(cs)?.pos ?? this.sim.findVehicle(cs)?.pos;
        if (pos) this.scope.centerOn(pos);
      },
      menu: (cs: string, x: number, y: number) => this.openMenu(cs, x, y),
      cell: (cs: string, item: ListItem, x: number, y: number) => this.onListCell(cs, item, x, y),
    };
    this.lists = [departureList(listCb), arrivalList(listCb), new VehicleList(listCb)];
    for (const l of this.lists) this.main.append(l.el);

    // Mobile mode: zoom buttons and a quick-action bar for the selected aircraft.
    const zoomBtn = (text: string, title: string, fn: () => void) => {
      const b = h('button', { text, title, type: 'button' });
      b.addEventListener('click', fn);
      return b;
    };
    this.main.append(
      h(
        'div.zoombar',
        {},
        zoomBtn('+', 'Zoom in', () => this.scope.zoomBy(1.4)),
        zoomBtn('\u2212', 'Zoom out', () => this.scope.zoomBy(1 / 1.4)),
        zoomBtn('\u2302', 'Reset view', () => this.scope.resetView()),
      ),
    );
    this.quickbar = h('div.quickbar');
    this.main.append(this.quickbar);
    // Tutorial: the step panel on the scope.
    if (tutorial) {
      this.tutorialPanel = new TutorialPanel(tutorial, {
        showExample: (text, focus) => {
          if (focus && (this.sim.find(focus) || this.sim.findVehicle(focus))) {
            this.select(focus);
            const pos = this.sim.find(focus)?.pos;
            if (pos) this.scope.centerOn(pos);
          }
          if (text) {
            this.input.value = text;
            this.updatePreview();
          }
        },
        liveTraffic: () => {
          tutorial.startLiveTraffic();
          this.hint('Live traffic: new departures and arrivals from now on. End the session with DISCONNECT.');
        },
      });
      this.main.append(this.tutorialPanel.el);
    }

    // ---------------------------------------------------------------- comms
    this.messagesEl = h('div.messages');
    this.targetEl = h('span.target');
    this.input = new CommandInput('Type an instruction - F1 for help');
    this.previewEl = h('span.preview');
    this.micButton = h('button.mic', { text: 'MIC', title: 'Push-to-talk: hold MIC (or the ^ / ` key, Right Ctrl, Insert) while you speak - or tap MIC to start and tap again to stop' });
    const clearBtn = h('button.clear', { text: '\u00d7', title: 'Clear the command line', type: 'button', 'aria-label': 'Clear the command line' });
    // pointerdown + preventDefault keeps the focus (and an open keyboard) where it is.
    clearBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', () => this.clearInput());
    const sendBtn = h('button.send', { text: 'SEND', title: 'Transmit (Enter)' });
    sendBtn.addEventListener('click', () => this.submit());
    // Sidebar next to the message window: large radio buttons and quick phrases.
    const side = (text: string, title: string, fn: () => void) => {
      const b = h('button', { text, title, type: 'button' });
      b.addEventListener('click', fn);
      return b;
    };
    const toSelected = (phrase: string) => () => {
      const cs = this.selected ?? this.sim.lastCaller()?.callsign;
      if (cs) this.transmit(`${cs} ${phrase}`);
      else this.hint('Select an aircraft first.');
    };
    const allBtn = side('ALL STN', 'Broadcast to all stations', () => this.openAllStations(allBtn));
    const sidebar = h(
      'div.sidebar',
      {},
      sendBtn,
      this.micButton,
      side('ROGER', 'Roger - acknowledge the call of the selected aircraft (or the last caller): it stops flashing', toSelected('roger')),
      side('SAY AGAIN', 'Say again - the selected aircraft (or the last caller) repeats its last transmission', toSelected('say again')),
      allBtn,
    );
    if (!VOICE_ENABLED) this.micButton.remove();
    const comms = h('div.comms', {}, h('div.comms-main', {}, this.messagesEl, h('div.cmdline', {}, this.targetEl, this.input.el, clearBtn, this.previewEl)), sidebar);

    root.replaceChildren(toolbar, this.main, comms);

    this.scope = new Scope(canvas, sim, {
      onSelect: (cs) => this.select(cs),
      onContextMenu: (cs, x, y) => this.openMenu(cs, x, y),
      onTagItem: (cs, item, x, y) => this.onTagItem(cs, item, x, y),
    });
    this.scope.setRotation(settings.runwayAligned);

    // ---------------------------------------------------------------- voice
    this.voices.volume = settings.ttsVolume;
    this.setTts(VOICE_ENABLED && settings.tts && this.voices.supported);
    if (!this.voices.supported) this.ttsButton.disabled = true;
    if (!VOICE_ENABLED) this.ttsButton.style.display = 'none';
    this.voiceIn = new VoiceInput(
      (interim) => {
        this.input.value = interim;
        this.updatePreview();
      },
      (candidates) => {
        const best = this.bestVoiceCandidate(candidates);
        this.input.value = best;
        this.updatePreview();
        if (best !== candidates[0]) this.hint(`Heard "${candidates[0]}" - using the alternative "${best}".`);
        if (this.settings.voiceAutoSend) this.submit(true);
      },
      (listening, error) => {
        this.micButton.classList.toggle('listening', listening);
        // Pilots stop talking while you transmit, so the microphone doesn't pick them up.
        if (listening) this.voices.hold();
        else this.voices.release();
        if (error && error !== 'aborted' && error !== 'no-speech') this.hint(`Speech recognition error: ${error}`);
      },
    );
    if (!this.voiceIn.supported) {
      this.micButton.disabled = true;
      this.micButton.title = 'Speech recognition is not supported by this browser (try Chrome or Edge)';
    }
    // MIC: hold it like a push-to-talk key (release ends the transmission), or tap to start and tap again to stop.
    let pressedAt = 0;
    let startedByPress = false;
    this.micButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pressedAt = performance.now();
      startedByPress = !this.voiceIn.listening;
      if (startedByPress) this.voiceIn.start();
    });
    const release = () => {
      if (!pressedAt) return;
      const held = performance.now() - pressedAt;
      pressedAt = 0;
      // A long press is push-to-talk; a short tap toggles (a second tap stops).
      if (!startedByPress || held > 400) this.voiceIn.stop();
    };
    this.micButton.addEventListener('pointerup', release);
    this.micButton.addEventListener('pointercancel', release);
    this.micButton.addEventListener('contextmenu', (e) => e.preventDefault());
    this.applySettings();

    // ---------------------------------------------------------------- events
    sim.on('message', (m) => this.addMessage(m));
    sim.on('incident', (i) => this.toast(i.text));
    sim.on('aircraftRemoved', (a) => {
      if (a.callsign === this.selected) this.select(undefined);
    });
    for (const m of sim.messages) this.addMessage(m);
    this.input.el.addEventListener('input', () => this.updatePreview());
    this.input.el.addEventListener('keydown', (e) => this.onInputKey(e));
    window.addEventListener('keydown', (e) => this.onGlobalKey(e));
    window.addEventListener('keyup', (e) => {
      if (VOICE_ENABLED && PTT_KEYS.has(e.code)) {
        e.preventDefault();
        this.voiceIn.stop();
      }
    });
    window.addEventListener('resize', () => this.scope.resize());
    this.fitToViewport();
    new ResizeObserver(() => this.scope.resize()).observe(this.main);

    this.setSpeed(1);
    const staffed = sim.config.airport.stations.filter((st) => sim.userControls(st.type)).map((st) => `${st.callsign} (${st.name}, ${st.frequency})`);
    if (tutorial) this.hint(`Tutorial ${tutorial.tutorial.title}: follow the steps in the tutorial panel. "Show me" puts the example instruction into the command line - send it with Enter or SEND.`);
    this.hint(`Connected as ${staffed.join(' + ')}. ${capitalize(runwayWords(sim.runways))} in use. BRIEFING shows the airport briefing, F1 the help. End the session with DISCONNECT - it shows your debriefing, which is not saved.`);
    if (restored) {
      this.hint(`Session "${restored.name}" restored - ${formatDuration(this.controlSeconds, true)} on position so far. Paused: press Space (or >) to continue.`);
      this.togglePause();
      if (!restored.matches) this.hint('The restored traffic differs slightly from the saved session (it was saved by an earlier version of the simulation).');
    }
    // Reloading or closing the page ends the session without the debriefing: the browser asks first.
    // The session is kept as the autosave, and the time on position is counted.
    window.addEventListener('beforeunload', (e) => {
      this.flushStats();
      this.autosave();
      if (this.leaving) return;
      e.preventDefault();
      e.returnValue = 'Please end the session with DISCONNECT - it shows your debriefing, which is not saved.';
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * Keeps the layout inside the visible area. When the command line gets the
   * focus on an iPad, Safari would otherwise push the whole page up to make
   * room for the keyboard bar; instead the app shrinks to the visible height.
   */
  private fitToViewport(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--app-height', `${Math.round(vv.height)}px`);
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', () => window.scrollTo(0, 0));
    update();
  }

  // ------------------------------------------------------------------ main loop

  private frame(t: number): void {
    const dt = Math.min(0.5, (t - this.last) / 1000);
    this.last = t;
    if (!this.paused) {
      this.sim.tick(dt * this.speed);
      if (!document.hidden) {
        this.controlSeconds += dt;
        this.statsPending += dt;
      }
    }
    this.scope.selected = this.selected;
    this.scope.render(t);
    if (t - this.lastSlowUpdate > 250) {
      this.lastSlowUpdate = t;
      this.slowUpdate();
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  private slowUpdate(): void {
    const sim = this.sim;
    this.fields.ontime.innerHTML = `ON <b>${formatDuration(this.controlSeconds, true)}</b>`;
    const now = performance.now();
    if (now - this.lastStatsFlush > 30_000) {
      this.lastStatsFlush = now;
      this.flushStats();
    }
    if (now - this.lastAutosave > AUTOSAVE_MS) {
      this.lastAutosave = now;
      this.autosave();
    }
    for (const l of this.lists) l.update(sim, this.selected);
    this.tutorialPanel?.update(this.selected);
    // Your frequencies (combined positions: several). Switched-off ones are run by the simulator.
    const logged = sim.config.airport.stations.filter((st) => sim.loggedInStations.includes(st.type));
    const active = logged.filter((st) => sim.userControls(st.type));
    const html =
      logged
        .map((st) => {
          const on = sim.userControls(st.type);
          return `<span class="stn pos-${st.type}${on ? '' : ' off'}" data-station="${st.type}" title="${on ? 'Click to switch off' : 'Switched off (run by the simulator) - click to switch on'}"><b>${st.callsign}</b> ${st.frequency}${on ? '' : ' OFF'}</span>`;
        })
        .join(' + ') +
      (active.length > 1 ? '<span class="combined-tag">COMBINED</span>' : '') +
      (sim.vacantStations.length ? '<span class="stn-add" data-add="1" title="Take over another position (its frequency is yours from now on)">+</span>' : '');
    if (this.fields.station.innerHTML !== html) this.fields.station.innerHTML = html;
    // Parallel runways for landings or take-offs only: "ARR 26R DEP 26L" (a mixed runway in both lists).
    const rw = (list: string[]) => list.map((r) => (sim.faa ? usRunway(r) : r)).join(' ');
    const roles = sim.arrivalRunways.length < sim.runways.length || sim.departureRunways.length < sim.runways.length;
    this.fields.rwy.innerHTML = roles ? `ARR <b>${rw(sim.arrivalRunways)}</b> DEP <b>${rw(sim.departureRunways)}</b>` : `RWY <b>${rw(sim.runways)}</b>`;
    // A newer METAR the ATIS does not match yet: the letter in red, the differences in the tooltip.
    const diff = sim.atisDifferences;
    this.fields.atis.innerHTML = `ATIS <b${diff.length ? ' class="bad"' : ''}>${sim.atisLetter}</b>`;
    this.fields.atis.title = diff.length ? `New METAR (${diff.join(', ')}) - click to broadcast a new ATIS` : 'Current ATIS (click to edit)';
    const wind = sim.observedWind;
    const tail = sim.runways.some((r) => sim.windComponents(r, wind).headwind < -5);
    const gust = wind.gustKt ? `G${wind.gustKt}` : '';
    this.fields.wind.innerHTML = `<b${tail || sim.storm ? ' class="bad"' : ''}>${String(wind.direction).padStart(3, '0')}/${String(wind.speedKt).padStart(2, '0')}${gust}</b>KT${sim.storm ? ' TS' : ''}`;
    this.fields.wind.title = sim.storm
      ? `Thunderstorm ${sim.storm.phase === 'overhead' ? 'overhead: no pushbacks, no take-offs, windshear on final' : 'approaching'} (click to edit the ATIS)`
      : tail
        ? 'Tailwind above 5 kt on the runway in use - consider a runway change (click to edit the ATIS)'
        : 'Surface wind (click to edit the ATIS)';
    this.fields.qnh.innerHTML = sim.faa ? `A<b>${altimeterOf(sim.atis.qnh)}</b>` : `Q<b>${sim.atis.qnh}</b>`;
    // With night rules, the local time is shown too (the curfew is in local time).
    this.fields.utc.innerHTML = `<b>${formatTime(sim.utc())}</b>Z${sim.config.scenario?.nightRules ? ` <b>${minutesToHhmm(sim.localMinutes())}</b>L` : ''}`;
    const s = sim.stats;
    const bad = s.collisions + s.incursions + s.goArounds;
    this.fields.score.className = 'field score';
    this.fields.score.innerHTML = `SCORE <b>${s.score}</b> | DEP ${s.departuresHandedOff} | ARR ${s.arrivalsParked} | <span class="${bad ? 'bad' : ''}">INC ${bad}</span>`;
    this.targetEl.textContent = this.targetText();
    this.updateQuickbar();
    // Switched off by you or a failure - not the systems the airport does not have at all.
    const available = this.sim.config.airport.systems;
    const off = Object.entries(this.sim.systems).filter(([id, on]) => !on && (!available || available.includes(id as SystemId))).length;
    this.sysBtn.classList.toggle('sys-warn', off > 0);
    const holds = [this.sim.flow.arrivalsStopped ? 'ARR' : '', this.sim.flow.departuresStopped ? 'DEP' : ''].filter(Boolean);
    this.coordBtn.classList.toggle('sys-warn', holds.length > 0);
    this.coordBtn.textContent = holds.length ? `COORD (${holds.join('+')} HOLD)` : 'COORD';
    this.sysBtn.textContent = off ? `SYSTEMS (${off} OFF)` : 'SYSTEMS';
  }

  private targetText(): string {
    const ac = this.sim.find(this.selected);
    if (ac) return `[${ac.callsign} ${this.sim.tel(ac).toUpperCase()}]`;
    const v = this.sim.findVehicle(this.selected);
    return v ? `[${v.callsign} ${vehicleTel(v).toUpperCase()}]` : '';
  }

  // ------------------------------------------------------------------ controls

  private togglePause(): void {
    this.paused = !this.paused;
    this.pauseButton.classList.toggle('active', this.paused);
    this.pauseButton.textContent = this.paused ? '>' : 'II';
  }

  private setSpeed(s: number): void {
    this.speed = s;
    this.speedButtons.forEach((b, i) => b.classList.toggle('active', SPEEDS[i] === s));
  }

  /** `announce`: called from a click - a short test phrase confirms (and on iOS unlocks) the voices. */
  private setTts(on: boolean, announce = false): void {
    const was = this.voices.enabled;
    this.voices.enabled = on;
    if (!on) this.voices.cancel();
    else if (announce && !was) this.voices.test();
    this.ttsButton.classList.toggle('active', on);
    this.settings.tts = on;
    saveSettings(this.settings);
  }

  private openSystems(): void {
    this.menu.close();
    showSystems(this.sim, () => this.slowUpdate());
  }

  private openSettings(): void {
    this.menu.close();
    showSettings(this.sim, this.settings, () => this.applySettings(), { tts: VOICE_ENABLED && this.voices.supported, mic: VOICE_ENABLED && this.voiceIn.supported, hidden: !VOICE_ENABLED, test: () => this.voices.test('Stuttgart Ground, radio check, readability five') });
  }

  /** Applies the (possibly changed) settings to the running session. */
  private applySettings(): void {
    const s = this.settings;
    const mobile = s.device === 'mobile';
    if (mobile !== document.body.classList.contains('mobile')) {
      document.body.classList.toggle('mobile', mobile);
      // Small screens: start with the lists collapsed so the scope is usable.
      for (const l of this.lists) l.el.classList.toggle('collapsed', mobile && window.innerWidth < 900);
    }
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    // Scope style: PHX (VATSIM Germany ground radar) or classic; the lists follow with their ground states.
    this.scope.setStyle(s.scopeStyle);
    document.body.classList.toggle('phx', s.scopeStyle !== 'classic');
    for (const l of this.lists) l.statusStyle = this.scope.statusStyle;
    this.scope.touchMode = mobile;
    this.scope.tagScale = s.tagScale * (mobile ? 1.25 : 1);
    this.scope.compactTags = s.tagDetail !== 'full';
    this.scope.showAllRoutes = s.showRoutes;
    this.routesBtn.classList.toggle('active', s.showRoutes);
    if (s.runwayAligned !== this.scope.runwayAligned) this.scope.setRotation(s.runwayAligned);
    this.rotBtn.classList.toggle('active', s.runwayAligned);
    if (this.voices.enabled !== (VOICE_ENABLED && s.tts && this.voices.supported)) this.setTts(VOICE_ENABLED && s.tts && this.voices.supported, true);
    this.voices.volume = s.ttsVolume;
    this.voices.rate = s.ttsRate;
    this.voiceIn.lang = s.voiceLang;
    if (s.density !== this.densitySetting) this.act({ k: 'density', density: (this.densitySetting = s.density) });
    if (s.eventLevel !== this.eventsSetting) this.act({ k: 'eventLevel', level: (this.eventsSetting = s.eventLevel) });
    this.input.placeholder = mobile ? 'Tap an aircraft, or type / speak an instruction' : `Type an instruction, e.g. "DLH5AB ${this.exampleInstruction()}" - F1 for help`;
    this.quickbarKey = '';
    this.updateQuickbar();
    requestAnimationFrame(() => this.scope.resize());
  }

  /** An example instruction for the command line, for this airport, runway and position. */
  private exampleInstruction(): string {
    const sim = this.sim;
    if (sim.userTower) return `line up and wait runway ${sim.runway}`;
    if (sim.userControls(sim.stationFor('ground'))) {
      const hp = sim.airport.runwayOps(sim.runway)?.departureEntries.find((e) => e.fullLength)?.holdingPoint;
      return hp ? `taxi to holding point ${hp}` : `taxi to runway ${sim.runway}`;
    }
    const sid = sidsForDestination(sim.config.airport, sim.runway, 'EDDF')[0]?.name ?? 'ETASA4B';
    return `cleared to Frankfurt, ${formatDepartureRoute(sid)}, ${formatClearanceClimb(sid, initialClimb(sim))}, squawk 2312`;
  }

  /**
   * Mobile mode: the quick-action bar of the selected aircraft. Every position (DEL, GND, TWR) has a
   * fixed set of buttons in a fixed order, whatever the aircraft is doing: what does not apply right
   * now is greyed out instead of left away, so a button is always in the same place.
   */
  private updateQuickbar(): void {
    const mobile = this.settings.device === 'mobile';
    if (this.allStationsMode && mobile && !this.selected) {
      const key = `ALL|${this.sim.atisLetter}|${this.sim.runwayKey}`;
      this.quickbar.classList.add('show');
      if (key === this.quickbarKey) return;
      this.quickbarKey = key;
      const close = h('button', { text: '×', type: 'button', title: 'Close' });
      close.addEventListener('click', () => {
        this.allStationsMode = false;
        this.clearInput();
        this.updateQuickbar();
      });
      this.quickbar.replaceChildren(
        h('span.qcs', { text: 'ALL STATIONS' }),
        ...this.allStationsPhrases().map((p) => this.quickPhrase('all stations', p.short, p.phrase)),
        close,
      );
      return;
    }
    this.allStationsMode = false;
    const v = this.sim.findVehicle(this.selected);
    const ac = this.sim.find(this.selected);
    const show = mobile && (!!v || !!ac);
    this.quickbar.classList.toggle('show', show);
    if (!show) {
      this.quickbarKey = '';
      return;
    }
    const cs = (v ?? ac)!.callsign;
    if (this.quickSel && this.quickSel.cs !== cs) this.clearQuickSel();
    const pos = v ? 'GND' : this.quickPosition(ac!);
    const buttons = v ? this.vehicleQuickButtons(v) : this.aircraftQuickButtons(ac!, pos);
    // Rebuilt only when a button changes its state (not for every new wind in a clearance) or a pick changes.
    const picks = this.quickSel?.cs === cs ? this.quickSel.picks.map((p) => `${p.group ?? ''}:${p.phrase}`).join(';') : '';
    const key = `${cs}|${pos}|${picks}|${buttons.map((b) => `${b.text}:${b.kind}`).join('|')}`;
    if (key === this.quickbarKey) return;
    this.quickbarKey = key;
    const at = (b: HTMLButtonElement): [number, number] => {
      const r = b.getBoundingClientRect();
      return [r.left, r.top];
    };
    const els = buttons.map((q) => {
      if (q.kind === 'phrase') return this.quickPhrase(cs, q.text, q.phrase!);
      const b = h('button', { text: q.text, type: 'button', title: q.title ?? q.text });
      if (q.kind === 'off') b.disabled = true;
      else if (q.kind === 'action') b.addEventListener('click', () => q.action!());
      else {
        // Menus: what is chosen there is picked like a phrase button and sent with SEND.
        if (this.quickSel?.cs === cs && this.quickSel.picks.some((p) => p.group === q.text)) b.classList.add('picked');
        b.addEventListener('click', () => this.menu.open(`${cs} - ${q.title ?? q.text}`, this.pickable(cs, q.text, q.items!()), ...at(b)));
      }
      return b;
    });
    this.quickbar.replaceChildren(h('span.qcs', { text: cs }), h('span.qpos', { text: pos }), ...els);
  }

  /** The position whose quick-action bar an aircraft gets: the frequency it is on, or the one of yours it comes to next. */
  private quickPosition(ac: Aircraft): QuickPosition {
    const sim = this.sim;
    const del = sim.stationFor('delivery');
    const gnd = sim.stationFor('ground');
    const twr = sim.stationFor('tower');
    const freq = sim.isOnMyFrequency(ac) ? ac.frequency : sim.handoffTarget(ac);
    if (freq) {
      if (freq === del && del !== gnd) return 'DEL';
      if (sim.userTower && freq === twr) return 'TWR';
      return sim.userControls(gnd) || !sim.userTower ? 'GND' : 'TWR';
    }
    if (sim.userTower && (!ac.onGround || !sim.userControls(gnd))) return 'TWR';
    if (sim.userControls(gnd)) return 'GND';
    return del !== gnd && sim.userControls(del) ? 'DEL' : 'TWR';
  }

  /** The fixed buttons of a position, filled from the aircraft menu of the moment. */
  private aircraftQuickButtons(ac: Aircraft, pos: QuickPosition): QuickButton[] {
    const sim = this.sim;
    const mine = sim.isOnMyFrequency(ac);
    const items = !mine ? [] : pos === 'DEL' ? this.deliveryItems(ac) : pos === 'TWR' ? this.towerItems(ac) : this.menuItems(ac);
    const ground = sim.airport.station(sim.stationFor('ground'));
    const specs: QuickSpec[] =
      pos === 'DEL'
        ? [
            { text: 'CLR', re: /^(IFR clearance|IFR clearance by voice|Amend IFR clearance)$/ },
            { text: 'DCL', re: /^Send DCL/ },
            { text: 'RB OK', re: /^Readback correct/ },
            { text: 'SQWK', re: /^Squawk$/ },
            { text: 'START', re: /^Start-up approved/ },
            // Without a Ground (St. Maarten) Delivery hands the crews to the Tower.
            { text: ground?.type === 'TWR' ? 'TWR' : 'GND', re: /^Contact (Ground|Tower)/ },
          ]
        : pos === 'GND'
          ? [
              { text: 'PUSH', re: /^Push and start approved/, phrase: 'push and start approved' },
              { text: 'TAXI', re: /^Taxi to( stand)?$/ },
              // HOLD while it may move, CONT only when it waits for it (hold position, hold short, give way).
              { text: 'HOLD', re: /^Hold position$/, off: ac.holdPosition },
              { text: 'CONT', re: /^Continue taxi$/, off: !(ac.holdPosition || ac.stoppedAt?.kind === 'holdShort' || ac.giveWayTo) },
              { text: 'H/S', re: /^Hold short of$/ },
              { text: 'CROSS', re: /^Cross runway/ },
              { text: 'GIVE WAY', re: /^Give way to$/ },
              { text: 'FLWM', re: /^Follow the follow-me$/ },
              { text: 'RESOLVE', re: /^Resolve conflict/ },
              { text: 'TOW', re: /^Tow approved to stand( \S+)?$/, phrase: 'tow approved' },
              { text: 'TWR', re: /^Contact Tower/ },
            ]
          : [
              { text: 'TAXI', re: /^Taxi( to|, hold short of)$/ },
              { text: 'LUP', re: /^Line up and wait/ },
              { text: 'B/T', re: /^Backtrack .*line up/ },
              { text: 'T/O', re: /^Cleared for take-off/ },
              { text: 'HOLD', re: /^Hold position$/ },
              { text: 'STOP', re: /^Stop immediately/ },
              { text: 'CROSS', re: /^Cross runway/ },
              // On final: continue approach; on the ground: continue taxi (after hold position or a hold-short).
              { text: 'CONT', re: /^Continue (approach|taxi)$/ },
              { text: 'LAND', re: /^Cleared to land/ },
              { text: 'G/A', re: /^Go around/ },
              { text: 'VAC', re: /^Vacate via/ },
              { text: 'GND', re: /^Contact Ground/ },
              { text: 'RDR', re: /^Contact (?!Ground)/ },
            ];
    const buttons = specs.map((s) => this.quickButton(s, items));
    // The same at every position (ROGER and standby: the sidebar and MENU).
    buttons.push(
      mine && ac.atisOutdated ? { text: `INFO ${sim.atisLetter}`, kind: 'phrase', phrase: `information ${sim.atisLetter} is current, ${sim.pressurePhrase()}` } : { text: `INFO ${sim.atisLetter}`, kind: 'off' },
    );
    if (pos !== 'DEL') buttons.push(catcAlert(sim, ac) ? { text: 'ACK', kind: 'action', action: () => this.acknowledgeCatc(ac) } : { text: 'ACK', kind: 'off' });
    const pending = sim.handoffPending(ac);
    buttons.push(
      !mine && sim.handoffTarget(ac) && !pending ? { text: 'REQ H/O', kind: 'action', action: () => this.requestHandoff(ac) } : { text: pending ? 'H/O REQ...' : 'REQ H/O', kind: 'off' },
      { text: 'MENU', kind: 'menu', title: `${sim.tel(ac).toUpperCase()}`, items: () => this.menuItems(ac) },
    );
    return buttons;
  }

  /** Follow-me car: always PROCEED, HOLD, CONT, BASE. */
  private vehicleQuickButtons(v: Vehicle): QuickButton[] {
    const items = this.vehicleItems(v);
    return [
      this.quickButton({ text: 'PROCEED', re: /^Proceed to/ }, items),
      this.quickButton({ text: 'HOLD', re: /^Hold position$/ }, items),
      this.quickButton({ text: 'CONT', re: /^Continue$/ }, items),
      this.quickButton({ text: 'BASE', re: /^Return to base$/ }, items),
      { text: 'MENU', kind: 'menu', title: vehicleTel(v).toUpperCase(), items: () => this.vehicleItems(v) },
    ];
  }

  /** A quick-action button from the menu item its spec names: greyed out if there is none (or it is disabled). */
  private quickButton(spec: QuickSpec, items: MenuItem[]): QuickButton {
    const it = spec.re ? items.find((i) => !i.divider && spec.re!.test(i.label)) : undefined;
    if (!it || it.disabled || spec.off) return { text: spec.text, kind: 'off', title: it?.label };
    if (spec.phrase) return { text: spec.text, kind: 'phrase', phrase: spec.phrase, title: it.label };
    if (it.submenu) return { text: spec.text, kind: 'menu', title: it.label, items: it.submenu };
    if (!it.action) return { text: spec.text, kind: 'off', title: it.label };
    const phrase = this.phraseOf(it.action);
    return phrase ? { text: spec.text, kind: 'phrase', phrase, title: it.label } : { text: spec.text, kind: 'action', action: it.action, title: it.label };
  }

  /** A menu opened from the quick-action bar: its instructions are picked (sent with SEND), not transmitted at once. */
  private pickable(cs: string, group: string, items: MenuItem[]): MenuItem[] {
    return items.map((it) => ({
      ...it,
      submenu: it.submenu && (() => this.pickable(cs, group, it.submenu!())),
      action:
        it.action &&
        (() => {
          this.picking = { cs, group };
          try {
            it.action!();
          } finally {
            this.picking = null;
          }
        }),
    }));
  }

  private select(cs: string | undefined): void {
    this.selected = cs;
    this.scope.selected = cs;
    this.targetEl.textContent = this.targetText();
    this.updatePreview();
    for (const l of this.lists) l.update(this.sim, cs);
  }

  // ------------------------------------------------------------------ messages

  private addMessage(m: RadioMessage): void {
    const from = m.kind === 'atc' ? this.sim.station.callsign : m.from === 'SYSTEM' ? '***' : m.from;
    const row = h(`div.msg.${m.kind}`, {}, h('span.time', { text: formatTime(new Date(this.sim.startEpochMs + m.time * 1000)) }), h('span.from', { text: from }), m.text);
    if (m.callsign) {
      row.dataset.callsign = m.callsign;
      row.addEventListener('click', () => this.select(m.callsign));
    }
    this.appendRow(row);
    if (m.kind === 'pilot') this.voices.speak(m.from, m.spoken, Math.min(1.4, 1 + (this.speed - 1) * 0.1));
  }

  private hint(text: string): void {
    this.appendRow(h('div.msg.hint', {}, h('span.time', { text: formatTime(this.sim.utc()) }), h('span.from', { text: '>>>' }), text));
  }

  private appendRow(row: HTMLElement): void {
    const el = this.messagesEl;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    el.append(row);
    while (el.childElementCount > 400) el.firstElementChild?.remove();
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  private toast(text: string): void {
    const t = h('div.toast', { text });
    this.main.append(t);
    setTimeout(() => t.remove(), 5000);
  }

  // ------------------------------------------------------------------ command line

  private clearInput(): void {
    this.voiceIn.discard();
    this.clearQuickSel();
    this.input.value = '';
    this.historyIdx = -1;
    this.updatePreview();
  }

  private submit(fromVoice = false): void {
    const text = this.input.value.trim();
    // Sent: what the microphone heard so far must not come back into the command line.
    this.voiceIn.discard();
    if (this.voiceIn.listening && !fromVoice) this.voiceIn.stop();
    if (!text) return;
    this.history.unshift(text);
    this.history = this.history.slice(0, 50);
    this.historyIdx = -1;
    this.transmit(text, fromVoice);
    this.input.value = '';
    this.updatePreview();
  }

  private transmit(text: string, fromVoice = false): void {
    this.clearQuickSel();
    const res = perform(this.sim, { k: 'transmit', text, selected: this.selected, fallback: fromVoice || undefined }) as TransmitResult;
    if (res.hint) this.hint(res.hint);
    if (res.callsign && this.sim.find(res.callsign)) this.select(res.callsign);
  }

  private onInputKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.submit();
    } else if (e.key === 'Escape') {
      if (this.input.value) this.clearInput();
      else this.select(undefined);
      this.updatePreview();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      this.historyIdx = Math.max(-1, Math.min(this.history.length - 1, this.historyIdx + (e.key === 'ArrowUp' ? 1 : -1)));
      this.input.value = this.historyIdx >= 0 ? this.history[this.historyIdx] : '';
      this.updatePreview();
    }
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (document.querySelector('.overlay')) return;
    if (VOICE_ENABLED && PTT_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.voiceIn.start();
      return;
    }
    if (e.key === 'F1') {
      e.preventDefault();
      showHelp(this.sim);
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      this.openSettings();
      return;
    }
    if (e.key === 'F3') {
      e.preventDefault();
      this.openSystems();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this.selectNextRequest();
      this.input.focus();
      return;
    }
    if (e.key === ' ' && !this.input.value) {
      e.preventDefault();
      this.togglePause();
      return;
    }
    if (e.key === 'Home' && !this.input.focused) {
      this.scope.resetView();
      return;
    }
    if (e.key === 'Escape' && !this.input.focused) {
      this.menu.close();
      this.select(undefined);
      return;
    }
    if (!this.input.focused && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing anywhere goes to the command line. The key is inserted here: focusing during the
      // key event is too late for this key on iPad (with a hardware keyboard), so "taxi" became "axi".
      e.preventDefault();
      this.input.focus();
      this.input.append(e.key);
    }
  }

  private selectNextRequest(): void {
    const ground = this.sim.userControls(this.sim.stationFor('ground'));
    const pending = [
      ...this.sim.aircraft.filter((a) => a.request && this.sim.isOnMyFrequency(a)),
      ...this.sim.vehicles.filter((v) => v.request && ground),
    ].sort((a, b) => a.requestSince - b.requestSince);
    if (!pending.length) return;
    const idx = pending.findIndex((a) => a.callsign === this.selected);
    const next = pending[(idx + 1) % pending.length];
    this.select(next.callsign);
  }

  /** Shows what the typed text will do and previews taxi routes on the scope. */
  private updatePreview(): void {
    const text = this.input.value.trim();
    this.previewEl.className = 'preview';
    if (this.menuPreview) return;
    this.scope.preview = undefined;
    if (!text) {
      this.previewEl.textContent = '';
      return;
    }
    if (/^all stations\b/i.test(text)) {
      this.previewEl.textContent = '-> broadcast to all stations (no read-back)';
      this.previewEl.classList.add('ok');
      return;
    }
    const parsed = parseTransmission(text, {
      callsigns: this.sim.radioCallsigns,
      taxiways: this.sim.airport.taxiwayNames,
      sids: this.sim.sidNames,
      selected: this.selected,
    });
    const ac = this.sim.find(parsed.callsign);
    if (!parsed.commands.length) {
      this.previewEl.textContent = parsed.unparsed.length ? `? ${parsed.unparsed.slice(0, 4).join(' ')}` : '';
      return;
    }
    const vehicle = this.sim.findVehicle(parsed.callsign);
    let ok = !!ac || !!vehicle;
    let warn = false;
    let msg = `${ac ? ac.callsign : parsed.callsign ?? '(no callsign)'}: ${parsed.commands.map(formatCommand).join(', ')}`;
    const taxi = parsed.commands.find((c) => c.type === 'taxi');
    if (ac && taxi && taxi.type === 'taxi' && (taxi.destination || taxi.via.length)) {
      const r = previewTaxi(this.sim, ac, taxi);
      if ('error' in r) {
        ok = false;
        msg += `  -- ${r.error}`;
      } else {
        const pts = routePoints(this.sim.airport, ac, r.route.nodes, r.route.startPosition);
        this.scope.preview = { points: pts, ok: true };
        // The pilot accepts any stand that fits; you see (the crew doesn't yet) whether it is free.
        const dest = r.dest;
        if (dest.kind === 'stand') {
          const occ = this.sim.standOccupant(dest.stand, ac);
          const nb = occ ? undefined : this.sim.standNeighbourConflict(dest.stand, ac.type.wingspanM, ac);
          if (occ || nb) {
            warn = true;
            msg += occ ? `  -- stand ${dest.stand} taken by ${occ.callsign}` : `  -- stand ${dest.stand}: too close to ${nb!.aircraft.callsign} on ${nb!.stand.id}`;
          }
        }
        // A-SMGCS CATC: warn before transmitting a route that meets other traffic head-on.
        const c = this.sim.systemOn('catc') ? routeHeadOn(this.sim, ac, pts) : undefined;
        if (c) {
          warn = true;
          msg += `  -- CATC: head-on with ${c.other.callsign}${c.taxiway ? ` on ${c.taxiway}` : ''}`;
        }
      }
    }
    if (ac && !this.sim.isOnMyFrequency(ac)) {
      ok = false;
      msg += '  -- not on your frequency';
    }
    if (parsed.unparsed.length) msg += `  (ignored: ${parsed.unparsed.join(' ')})`;
    this.previewEl.textContent = msg;
    this.previewEl.classList.add(ok ? (warn ? 'warn' : 'ok') : 'err');
  }

  /** Picks the speech recognition alternative that makes the most sense as an instruction. */
  private bestVoiceCandidate(candidates: string[]): string {
    const callsigns = this.sim.radioCallsigns;
    let best = candidates[0];
    let bestScore = -Infinity;
    candidates.forEach((text, i) => {
      const p = parseTransmission(text, { callsigns, taxiways: this.sim.airport.taxiwayNames, selected: this.selected, sids: this.sim.sidNames });
      const ac = this.sim.find(p.callsign);
      let score = p.commands.length * 3 - p.unparsed.length - i * 0.3;
      if (p.explicitCallsign && ac) score += 4;
      if (ac && this.sim.isOnMyFrequency(ac)) score += 1;
      if (ac?.request) score += 1;
      if (p.condition) score += 1;
      const taxi = p.commands.find((c) => c.type === 'taxi');
      if (ac && taxi && taxi.type === 'taxi') score += 'error' in previewTaxi(this.sim, ac, taxi) ? -2 : 2;
      if (score > bestScore) {
        bestScore = score;
        best = text;
      }
    });
    return best;
  }

  /** The aircraft is on your Delivery frequency (clearance, SID and squawk are yours). */
  private onMyDelivery(ac: Aircraft): boolean {
    const del = this.sim.stationFor('delivery');
    return this.sim.isOnMyFrequency(ac) && ac.frequency === del && del !== this.sim.stationFor('ground');
  }

  /** EuroScope-style list cell functions: like the tag items, plus squawk and clearance flag (Delivery). */
  private onListCell(cs: string, item: ListItem, x: number, y: number): void {
    const ac = this.sim.find(cs);
    if (!ac) {
      if (this.sim.findVehicle(cs)) this.openMenu(cs, x, y);
      return;
    }
    if (item === 'squawk' || item === 'clearance') {
      if (this.onMyDelivery(ac)) this.menu.open(`${ac.callsign} - clearance`, this.deliveryItems(ac), x, y);
      else this.menu.open(`${ac.callsign} - ${this.sim.tel(ac).toUpperCase()}`, this.flightPlanItems(ac), x, y);
      return;
    }
    this.onTagItem(cs, item, x, y);
  }

  /** EuroScope-style tag item functions. */
  private onTagItem(cs: string, item: TagItem, x: number, y: number): void {
    const ac = this.sim.find(cs);
    if (!ac) return;
    if (item === 'sid') {
      // The SID: on your Delivery frequency the clearance menu, otherwise the flight plan.
      if (this.onMyDelivery(ac)) this.menu.open(`${ac.callsign} - clearance`, this.deliveryItems(ac), x, y);
      else this.menu.open(`${ac.callsign} - ${this.sim.tel(ac).toUpperCase()}`, this.flightPlanItems(ac), x, y);
    } else if (item === 'callsign' || item === 'type') {
      this.menu.open(`${ac.callsign} - ${this.sim.tel(ac).toUpperCase()}`, this.flightPlanItems(ac), x, y);
    } else if (item === 'target') {
      if (!this.sim.isOnMyFrequency(ac)) return;
      if (this.sim.userTower && ac.frequency === this.sim.stationFor('tower') && ac.category !== 'departure') {
        this.menu.open(`${ac.callsign} - taxi, hold short of`, this.towerTaxiLimits(ac), x, y);
        return;
      }
      const items = ac.category === 'arrival' || ac.returnToStand ? this.standDestinations(ac) : this.taxiDestinations(ac);
      this.menu.open(ac.category === 'arrival' || ac.returnToStand ? `${ac.callsign} - taxi to stand` : `${ac.callsign} - taxi to`, items, x, y);
    } else {
      this.openMenu(cs, x, y);
    }
  }

  private flightPlanItems(ac: Aircraft): MenuItem[] {
    const fp = ac.flightPlan;
    const info = (label: string, hint: string): MenuItem => ({ label, hint, disabled: true });
    const items: MenuItem[] = [
      info('Telephony', this.sim.tel(ac).toUpperCase()),
      info('Type', `${ac.type.icao} (${ac.type.name}), wake ${ac.type.wake}`),
      info('Route', `${fp.departure} - ${fp.destination}`),
      info('Flight plan', `${fp.sid ? `${fp.sid} ` : ''}${fp.route} FL${fp.cruiseFl}`),
      info('Runway / squawk', `${fp.runway ?? '-'} / ${fp.squawk}`),
      info('Stand', ac.stand ?? (ac.assignedStand ? `(${ac.assignedStand})` : '-')),
      info('Frequency', ac.frequency),
    ];
    if (ac.emergency) items.push(info('EMERGENCY', 'PAN PAN - medical'));
    items.push({ divider: true, label: '' }, { label: 'Aircraft menu', submenu: () => this.menuItems(ac) });
    return items;
  }

  // ------------------------------------------------------------------ aircraft menu

  private openMenu(cs: string, x: number, y: number): void {
    const v = this.sim.findVehicle(cs);
    if (v) {
      this.menu.open(`${v.callsign}  ${vehicleTel(v).toUpperCase()}${v.aircraft ? `  > ${v.aircraft}` : ''}`, this.vehicleItems(v), x, y);
      return;
    }
    const ac = this.sim.find(cs);
    if (!ac) return;
    this.menu.open(`${ac.callsign}  ${ac.type.icao}  ${ac.category === 'departure' ? `> ${ac.flightPlan.destination}` : `< ${ac.flightPlan.departure}`}`, this.menuItems(ac), x, y);
  }

  /** Broadcasts to all stations on your frequencies (no read-back). */
  private allStationsPhrases(): { label: string; short: string; phrase: string }[] {
    const sim = this.sim;
    return [
      { label: `Information ${sim.atisLetter} is now current`, short: `INFO ${sim.atisLetter}`, phrase: `information ${sim.atisLetter} is now current, ${sim.pressurePhrase()}` },
      { label: `${capitalize(runwayWords(sim.runways))} in use`, short: `RWY ${sim.runways.join('/')}`, phrase: `${runwayWords(sim.runways)} in use` },
      { label: 'Standby', short: 'STBY', phrase: 'standby' },
      { label: 'Expect delays', short: 'DELAYS', phrase: 'expect delays' },
    ];
  }

  /** ALL STATIONS: the broadcasts as a menu, in mobile mode in the quick-action bar (pick, then SEND). */
  private openAllStations(anchor: HTMLElement): void {
    if (this.settings.device === 'mobile') {
      this.select(undefined);
      this.allStationsMode = true;
      this.quickbarKey = '';
      this.updateQuickbar();
      return;
    }
    const r = anchor.getBoundingClientRect();
    this.menu.open(
      'ALL STATIONS',
      this.allStationsPhrases().map((p) => ({ label: p.label, action: () => this.transmit(`all stations, ${p.phrase}`) })),
      r.left - 220,
      r.top,
    );
  }

  /** The positions you can still take over, for the "+" next to your frequencies. */
  private addStationItems(): MenuItem[] {
    return this.sim.vacantStations.map((type) => {
      const st = this.sim.airport.station(type)!;
      return {
        label: `${st.name} (${st.callsign})`,
        hint: st.frequency,
        action: () => {
          const err = this.act({ k: 'addStation', type });
          if (err) this.toast(err);
          this.slowUpdate();
        },
      };
    });
  }

  /** Coordination with the simulator-run neighbours: hold arrivals (Approach) or departures (Ground). */
  private coordItems(): MenuItem[] {
    const sim = this.sim;
    const f = sim.flow;
    const app = sim.stationName('APP');
    const gnd = sim.stationName(sim.stationFor('ground'));
    const set = (kind: 'arrivals' | 'departures', stop: boolean) => () => {
      const err = this.act({ k: 'flow', kind, stop });
      if (err) this.hint(err);
      this.slowUpdate();
    };
    return [
      f.arrivalsStopped
        ? { label: `${app}: resume arrivals`, hint: `held ${sim.stats.arrivalStopMinutes} min`, action: set('arrivals', false) }
        : { label: `${app}: no more arrivals`, hint: '-2/min', action: set('arrivals', true) },
      f.departuresStopped
        ? { label: `${gnd}: release departures`, hint: `held ${sim.stats.departureStopMinutes} min`, action: set('departures', false) }
        : { label: `${gnd}: hold all departures`, hint: sim.canHoldDepartures ? '-2/min' : 'you staff Ground', disabled: !sim.canHoldDepartures, action: set('departures', true) },
      {
        label: `${f.askIntersections ? '\u2611' : '\u2610'} ${gnd}: ask departures for the earliest intersection`,
        hint: sim.canHoldDepartures ? undefined : 'you staff Ground',
        disabled: !sim.canHoldDepartures,
        action: () => {
          const err = this.act({ k: 'askIntersections', on: !f.askIntersections });
          if (err) this.hint(err);
        },
      },
      {
        label: `${f.sendIntersections ? '\u2611' : '\u2610'} ${gnd}: send departures to the earliest intersection`,
        hint: sim.canHoldDepartures ? 'asks them too' : 'you staff Ground',
        disabled: !sim.canHoldDepartures,
        action: () => {
          const err = this.act({ k: 'sendIntersections', on: !f.sendIntersections });
          if (err) this.hint(err);
        },
      },
    ];
  }

  private requestHandoff(ac: Aircraft): void {
    const err = this.act({ k: 'handoff', callsign: ac.callsign });
    if (err) this.hint(err);
    this.quickbarKey = '';
    this.updateQuickbar();
  }

  /** Acknowledges the CATC alert of an aircraft (no flashing until the conflict ends). */
  private acknowledgeCatc(ac: Aircraft): void {
    if (!catcAlert(this.sim, ac)) return;
    this.act({ k: 'catcAck', callsign: ac.callsign });
    this.quickbarKey = '';
    this.updateQuickbar();
  }

  /** Adds the time on position since the last call to the totals (the start of the account statistics). */
  private flushStats(): void {
    if (this.statsPending <= 0) return;
    const icao = this.sim.config.airport.icao;
    const positions = this.sim.loggedInStations.filter((t) => this.sim.userControls(t));
    addControlTime(this.statsPending, Math.max(0, this.sim.time - this.statsSimTime), icao, positions);
    this.statsPending = 0;
    this.statsSimTime = this.sim.time;
    this.fields.ontime.title = `Your time on position in this session (real time, without pauses). In total: ${formatDuration(loadStats().controlSeconds)}`;
  }

  /** Keeps the session in the browser as the autosave (not tutorials). */
  private autosave(): void {
    if (this.tutorial || this.sim.steps === 0) return;
    storeSession({ ...saveSession(this.sim, 'Autosave', this.controlSeconds), id: AUTOSAVE_ID });
  }

  /** SAVE: a name, then into the browser's storage and/or as a file. */
  private openSave(): void {
    this.menu.close();
    const sim = this.sim;
    const utc = sim.utc();
    const positions = sim.loggedInStations.join('+');
    const name = h('input', { type: 'text', value: `${sim.config.airport.icao} ${positions} ${String(utc.getUTCHours()).padStart(2, '0')}${String(utc.getUTCMinutes()).padStart(2, '0')}Z`, maxlength: '60' });
    const save = h('button.primary', { type: 'submit', text: 'Save' });
    const download = h('button', { type: 'button', text: 'Download file', title: 'Save it as a file (to keep it, or to continue on another device)' });
    const cancel = h('button', { type: 'button', text: 'Cancel' });
    const form = h(
      'form.dialog',
      {},
      h('div.dtitle', {}, h('span', { text: 'Save session' })),
      h(
        'div.dbody',
        {},
        h('div.sub', { text: 'Continue it later with "Saved sessions" in the Connect dialog. The traffic is rebuilt from the start of the session, which takes a few seconds for a long session.' }),
        h('div.grid', {}, h('label', { text: 'Name' }), name),
        h('div.actions', {}, cancel, download, save),
      ),
    );
    const overlay = h('div.overlay', {}, form);
    const snapshot = () => saveSession(sim, name.value.trim() || 'Session', this.controlSeconds);
    cancel.addEventListener('click', () => overlay.remove());
    download.addEventListener('click', () => {
      downloadSession(snapshot());
      overlay.remove();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = snapshot();
      const err = storeSession(s);
      overlay.remove();
      this.flushStats();
      this.hint(err ?? `Session "${s.name}" saved. Continue it later with "Saved sessions" in the Connect dialog.`);
    });
    document.body.append(overlay);
    name.focus();
    name.select();
  }

  /** Changes the simulation (logged for saving, see session.ts); returns an error text if it was not possible. */
  private act(a: SessionAction): string | undefined {
    const r = perform(this.sim, a);
    return typeof r === 'string' ? r : undefined;
  }

  private say(ac: Aircraft | Vehicle, phrase: string): void {
    if (this.capture) {
      this.capture.push(phrase);
      return;
    }
    if (this.picking?.cs === ac.callsign) {
      this.pick(ac.callsign, phrase, this.picking.group);
      return;
    }
    this.transmit(`${ac.callsign} ${phrase}`);
  }

  /** The phrase a menu action would transmit (undefined if it does something else, e.g. opens a menu). */
  private phraseOf(action: () => void): string | undefined {
    this.capture = [];
    try {
      action();
      return this.capture[0];
    } finally {
      this.capture = null;
    }
  }

  /**
   * Quick-action bar button for a phrase: a tap picks it (or unpicks it), the
   * picked phrases are written to the command line and sent together with SEND
   * - e.g. "readback correct, start-up approved".
   */
  private quickPhrase(cs: string, text: string, phrase: string): HTMLButtonElement {
    const b = h('button', { text, type: 'button', title: phrase });
    if (this.quickSel?.cs === cs && this.quickSel.picks.some((p) => p.phrase === phrase)) b.classList.add('picked');
    b.addEventListener('click', () => this.pick(cs, phrase));
    return b;
  }

  /**
   * Picks a phrase for the quick-action bar (or unpicks it if it is picked already). A phrase
   * chosen in a menu replaces the earlier choice from the same menu; the aircraft menu (MENU)
   * collects any number.
   */
  private pick(cs: string, phrase: string, group?: string): void {
    if (this.quickSel?.cs !== cs) this.quickSel = { cs, picks: [] };
    const sel = this.quickSel;
    const i = sel.picks.findIndex((p) => p.phrase === phrase);
    if (i >= 0) sel.picks.splice(i, 1);
    else {
      if (group && group !== 'MENU') sel.picks = sel.picks.filter((p) => p.group !== group);
      sel.picks.push({ phrase, group });
    }
    this.input.value = sel.picks.length ? `${cs} ${sel.picks.map((p) => p.phrase).join(', ')}` : '';
    this.updatePreview();
    this.quickbarKey = '';
    this.updateQuickbar();
  }

  private clearQuickSel(): void {
    this.quickSel = null;
    this.quickbar.querySelectorAll('.picked').forEach((n) => n.classList.remove('picked'));
  }

  /** Follow-me car: the vehicle phraseology ("proceed", "hold position", "continue", "return to base"). */
  private vehicleItems(v: Vehicle): MenuItem[] {
    const center: MenuItem = { label: 'Centre view', action: () => this.scope.centerOn(v.pos) };
    if (!this.sim.userControls(this.sim.stationFor('ground'))) return [{ label: `On ${this.sim.stationFor('ground')} frequency`, disabled: true }, { divider: true, label: '' }, center];
    const items: MenuItem[] = [];
    if (v.aircraft && (v.state === 'assigned' || v.state === 'toAircraft')) {
      items.push({ label: `Proceed to ${v.aircraft}`, hint: v.request === 'proceed' ? 'requested' : undefined, action: () => this.say(v, `proceed to ${v.aircraft}`) });
    }
    items.push({
      label: 'Return to base',
      hint: v.request === 'return' ? 'requested' : undefined,
      disabled: v.state === 'idle' || v.state === 'returning',
      action: () => this.say(v, 'return to base'),
    });
    items.push({ label: 'Hold position', disabled: v.holding || v.state === 'idle', action: () => this.say(v, 'hold position') });
    items.push({ label: 'Continue', disabled: !v.holding, action: () => this.say(v, 'continue') });
    if (v.request) items.push({ label: 'Standby', action: () => this.say(v, 'standby') });
    items.push({ divider: true, label: '' }, center);
    return items;
  }

  private routeItem(ac: Aircraft, label: string, phraseDest: string, hint?: string): MenuItem {
    const cmd = parseTransmission(`taxi to ${phraseDest}`, { callsigns: [], taxiways: this.sim.airport.taxiwayNames }).commands[0];
    const r = cmd && cmd.type === 'taxi' ? previewTaxi(this.sim, ac, cmd) : { error: 'invalid' };
    if ('error' in r) return { label, hint: r.error, disabled: true };
    const destText = r.dest.kind === 'holdingPoint' ? `holding point ${r.dest.name}` : phraseDest;
    if (!this.sim.systemOn('routing')) {
      // No A-SMGCS routing service: no proposed route - plan it yourself (or let the pilot take the standard route).
      return { label, hint: hint ?? 'no route proposal', action: () => this.say(ac, `taxi to ${destText}`) };
    }
    const via = r.route.taxiways.filter((t) => this.sim.airport.taxiwayNames.has(t.toUpperCase()));
    const pts = routePoints(this.sim.airport, ac, r.route.nodes, r.route.startPosition);
    const conflict = this.sim.systemOn('catc') ? routeHeadOn(this.sim, ac, pts) : undefined;
    const phrase = `taxi to ${destText}${via.length ? ` via ${via.join(', ')}` : ''}`;
    const onHover = (on: boolean) => {
      this.menuPreview = on;
      this.scope.preview = on ? { points: routePoints(this.sim.airport, ac, r.route.nodes, r.route.startPosition), ok: true } : undefined;
      if (!on) this.updatePreview();
    };
    // A click sends the whole route; the sub-menu limits it: "..., hold short of taxiway L".
    const limits = this.holdShortLimits(ac, via, (t) => `${phrase}, hold short of taxiway ${t}`);
    return {
      label,
      hint: `${hint ?? `via ${via.join(' ')}`}${conflict ? `  ! head-on ${conflict.other.callsign}` : ''}`,
      action: () => this.say(ac, phrase),
      onHover,
      submenu: limits.length ? () => [{ label: 'Whole route', hint: via.join(' '), action: () => this.say(ac, phrase), onHover }, { divider: true, label: '' }, ...limits] : undefined,
    };
  }

  /**
   * "Hold short of" choices along a route: one per taxiway of the `via` list the aircraft is not on yet,
   * each checked like a typed instruction (greyed out with the crew's answer if it would not work).
   */
  private holdShortLimits(ac: Aircraft, via: string[], phraseFor: (taxiway: string, index: number) => string | undefined): MenuItem[] {
    const here = ac.phase === 'parked' ? undefined : this.sim.airport.nearestEdge(ac.pos)?.edge.name?.toUpperCase();
    const items: MenuItem[] = [];
    via.forEach((t, i) => {
      if (t.toUpperCase() === here) return;
      const phrase = phraseFor(t, i);
      if (!phrase) return;
      const cmd = parseTransmission(phrase, { callsigns: [], taxiways: this.sim.airport.taxiwayNames }).commands[0];
      const r = cmd?.type === 'taxi' ? previewTaxi(this.sim, ac, cmd) : { error: 'invalid' };
      if ('error' in r) {
        items.push({ label: `Hold short of ${t}`, hint: r.error, disabled: true });
        return;
      }
      items.push({
        label: `Hold short of ${t}`,
        action: () => this.say(ac, phrase),
        onHover: (on) => {
          this.menuPreview = on;
          this.scope.preview = on ? { points: routePoints(this.sim.airport, ac, r.route.nodes, r.route.startPosition), ok: true } : undefined;
          if (!on) this.updatePreview();
        },
      });
    });
    return items;
  }

  /**
   * Tower: a vacated arrival is not taxied to its stand (that is Ground's job) - only on to a
   * clearance limit along the way to it, "taxi via E, N, hold short of taxiway L", then Ground.
   */
  private towerTaxiLimits(ac: Aircraft): MenuItem[] {
    const stand = ac.assignedStand ?? this.sim.freeStands(ac.type.wingspanM, undefined, ac).sort((a, b) => distance(a.pos, ac.pos) - distance(b.pos, ac.pos))[0]?.id;
    const cmd = stand ? parseTransmission(`taxi to stand ${stand}`, { callsigns: [], taxiways: this.sim.airport.taxiwayNames }).commands[0] : undefined;
    const r = cmd?.type === 'taxi' ? previewTaxi(this.sim, ac, cmd) : { error: 'no free stand' };
    if ('error' in r) return [{ label: 'No route', hint: r.error, disabled: true }];
    const via = r.route.taxiways.filter((t) => this.sim.airport.taxiwayNames.has(t.toUpperCase()));
    const items = this.holdShortLimits(ac, via, (t, i) => (i > 0 ? `taxi via ${via.slice(0, i).join(', ')}, hold short of taxiway ${t}` : undefined));
    return items.length ? items : [{ label: 'No taxiway to hold short of', hint: `stand ${stand}: Ground`, disabled: true }];
  }

  private menuItems(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    const center: MenuItem = { label: 'Centre view', action: () => this.scope.centerOn(ac.pos) };
    const resetTag: MenuItem = { label: 'Reset tag position', action: () => (ac.tagOffset = undefined) };
    const alert = catcAlert(sim, ac);
    if (alert) {
      const other = alert.a === ac ? alert.b : alert.a;
      items.push({ label: 'Acknowledge CATC alert', hint: other.callsign, action: () => this.acknowledgeCatc(ac) }, { divider: true, label: '' });
    }

    if (!sim.isOnMyFrequency(ac)) {
      items.push({ label: `On ${ac.frequency} frequency`, disabled: true });
      // Ask the (simulator-run) position for the aircraft now, e.g. a departure from Ground before the holding point.
      const to = sim.handoffTarget(ac);
      if (to) items.push(sim.handoffPending(ac) ? { label: `Hand-off to ${to} requested`, disabled: true } : { label: `Request hand-off to ${to}`, action: () => this.requestHandoff(ac) });
      items.push({ divider: true, label: '' }, center, resetTag);
      return items;
    }

    const rwy = sim.runway;
    const tower = sim.airport.station(sim.stationFor('tower'));
    // The crew reported an old ATIS letter.
    if (ac.atisOutdated) {
      items.push({ label: `Information ${sim.atisLetter} is current`, hint: `has ${ac.atisHeard}`, action: () => this.say(ac, `information ${sim.atisLetter} is current, ${sim.pressurePhrase()}`) }, { divider: true, label: '' });
    }

    if (ac.frequency === sim.stationFor('delivery') && sim.stationFor('delivery') !== sim.stationFor('ground')) {
      items.push(...this.deliveryItems(ac));
      items.push({ divider: true, label: '' }, center, resetTag);
      return items;
    }
    if (sim.userTower && ac.frequency === sim.stationFor('tower')) {
      items.push(...this.towerItems(ac));
      items.push({ divider: true, label: '' }, center, resetTag);
      return items;
    }

    if (ac.phase === 'parked' && ac.category === 'tow') {
      const to = ac.tow?.to ?? '';
      items.push({ label: `Tow approved to stand ${to}`, action: () => this.say(ac, 'tow approved') });
      items.push({
        label: 'Tow approved to stand',
        submenu: () =>
          sim
            .freeStands(ac.type.wingspanM, undefined, ac)
            .slice(0, 16)
            .map((s) => ({ label: `Stand ${s.id}`, action: () => this.say(ac, `tow approved to stand ${s.id}`) })),
      });
    } else if (ac.phase === 'parked' && ac.category === 'departure') {
      const facings = this.pushFacings(ac);
      const pushSub = (startup: boolean) => (): MenuItem[] => [
        { label: 'Pilot decides', action: () => this.say(ac, startup ? 'push and start approved' : 'pushback approved') },
        ...facings.map((f) => ({
          label: `Facing ${f}`,
          action: () => this.say(ac, `${startup ? 'push and start approved' : 'pushback approved'} facing ${f}`),
        })),
      ];
      const stand = sim.airport.stand(ac.stand ?? '');
      if (stand?.pushback === false) {
        items.push({ label: 'Taxi to', submenu: () => this.taxiDestinations(ac) });
      } else {
        // A slot flight pushed now would wait at the holding point: the hint says from when it fits.
        const due = offBlockDue(sim, ac);
        const slot = ac.ctot !== undefined ? `CTOT ${hhmm(sim, ac.ctot)}${sim.time < due - 60 ? `: not before ${hhmm(sim, due)}` : ''}` : undefined;
        items.push({ label: 'Pushback approved', hint: slot, submenu: pushSub(false) });
        items.push({ label: 'Push and start approved', hint: slot, submenu: pushSub(true) });
      }
      items.push({ label: 'Start-up approved', action: () => this.say(ac, 'start-up approved') });
      items.push(this.ableItem(ac));
    } else if (ac.onGround && ['pushback', 'startup', 'taxi', 'holding'].includes(ac.phase)) {
      if (ac.category === 'arrival' || ac.returnToStand || ac.category === 'tow') {
        items.push({ label: 'Taxi to stand', submenu: () => this.standDestinations(ac) });
      } else {
        items.push({ label: 'Taxi to', submenu: () => this.taxiDestinations(ac) });
      }
      items.push({ label: 'Hold position', action: () => this.say(ac, 'hold position') });
      items.push({ label: 'Continue taxi', action: () => this.say(ac, 'continue taxi') });
      const onRoute = this.taxiwaysAhead(ac);
      items.push({
        label: 'Hold short of',
        disabled: !onRoute.length,
        submenu: () => onRoute.map((t) => ({ label: `Taxiway ${t}`, action: () => this.say(ac, `hold short of taxiway ${t}`) })),
      });
      const cross = this.crossingRunway(ac);
      items.push({ label: `Cross runway ${cross ?? rwy}`, disabled: !cross, action: () => this.say(ac, `cross runway ${cross}`) });
      const partner = headOnPartner(sim, ac);
      if (partner) items.push(this.resolveItem(ac, partner));
      if (ac.category !== 'tow') items.push(this.followMeItem(ac));
      const near = sim.aircraft
        .filter((o) => o !== ac && o.onGround && o.phase !== 'parked' && o.phase !== 'arrived' && distance(o.pos, ac.pos) < 800)
        .sort((a, b) => distance(a.pos, ac.pos) - distance(b.pos, ac.pos))
        .slice(0, 8);
      items.push({
        label: 'Give way to',
        disabled: !near.length,
        submenu: () => near.map((o) => ({ label: o.callsign, hint: `${Math.round(distance(o.pos, ac.pos))} m`, action: () => this.say(ac, `give way to ${o.callsign}`) })),
      });
      if (ac.category === 'departure' && !ac.returnToStand) items.push(this.ableItem(ac));
      if (ac.category === 'departure' && tower) {
        items.push({ divider: true, label: '' });
        items.push({
          label: `Contact Tower ${tower.frequency}`,
          disabled: !['taxi', 'holding'].includes(ac.phase),
          action: () => this.say(ac, `contact tower ${tower.frequency}`),
        });
      }
    }
    if (ac.phase === 'pushback') {
      items.push({ label: 'Stop pushback', action: () => this.say(ac, 'stop pushback') });
      items.push({ label: 'Cancel pushback', action: () => this.say(ac, 'cancel pushback') });
    }
    if (ac.request) {
      const what = ac.request === 'pushback' ? 'pushback' : ac.request === 'handoff' ? 'departure' : ac.request === 'tow' ? 'tow' : 'taxi';
      items.push({
        label: `Number ... for ${what}`,
        submenu: () => [1, 2, 3, 4, 5].map((n) => ({ label: `Number ${n}`, action: () => this.say(ac, `number ${n} for ${what}`) })),
      });
      items.push({ label: 'Standby', action: () => this.say(ac, 'standby') });
    }
    items.push({ label: 'Say again', action: () => this.say(ac, 'say again') });
    items.push({ divider: true, label: '' }, center, resetTag);
    return items;
  }

  /** "wind 250 degrees 8 knots" - the wind is given with take-off and landing clearances. */
  private windPhrase(): string {
    return `wind ${windWords(this.sim.observedWind)}`;
  }

  /** Tower: line-up, take-off and landing clearances, go-around, exits, crossings, hand-offs. */
  private towerItems(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    const rwy = ac.runway ?? sim.runway;
    const rwyEnd = sim.tower.endFor(rwy);
    const ground = sim.airport.station(sim.stationFor('ground'));
    const radar = sim.airport.station('APP');
    const eta = sim.tower.nextArrivalEta(rwyEnd);
    const arrival = Number.isFinite(eta) ? `next arrival ${Math.round(eta)} s` : 'no arrival';
    // Tower may give taxi instructions too: a vacated arrival on to a point short of the next taxiway (the stand is Ground's).
    if (ac.onGround && ac.phase === 'taxi' && (ac.category !== 'departure' || ac.returnToStand)) {
      items.push({ label: 'Taxi, hold short of', hint: ac.assignedStand ? `towards stand ${ac.assignedStand}` : undefined, submenu: () => this.towerTaxiLimits(ac) });
    }
    if (ac.category === 'departure' && ac.onGround && ['holding', 'lineup', 'taxi'].includes(ac.phase)) {
      const busy = sim.tower.runwayBusyForDeparture(ac);
      const slotOpens = ac.ctot !== undefined && sim.time < ac.ctot - CTOT_EARLY_S ? ac.ctot - CTOT_EARLY_S : undefined;
      // Tower may send a departure to another holding point (e.g. an intersection) before it gets there.
      if (ac.phase === 'taxi' || ac.phase === 'holding') {
        items.push({ label: 'Taxi to', submenu: () => this.taxiDestinations(ac) });
        items.push(this.ableItem(ac));
      }
      items.push({ label: `Line up and wait runway ${rwy}`, disabled: ac.phase === 'lineup' || !!ac.lineUpCleared, hint: busy ? 'runway occupied' : undefined, action: () => this.say(ac, `line up and wait runway ${rwy}`) });
      // Backtrack: along the runway to its end, turn around there, full-length departure.
      const hpName = ac.stoppedAt?.holdingPoint ?? (ac.routeDestination?.kind === 'holdingPoint' ? ac.routeDestination.name : undefined);
      if (ac.phase !== 'lineup' && hpName && sim.tower.canBacktrackFrom(hpName, ac)) {
        items.push({ label: `Backtrack runway ${rwy}, line up and wait`, disabled: !!ac.lineUpCleared, hint: busy ? 'runway occupied' : ac.request === 'departure' && /request backtrack/.test(ac.lastTransmission ?? '') ? 'requested' : undefined, action: () => this.say(ac, `backtrack runway ${rwy}, line up and wait`) });
        items.push({ label: `Backtrack runway ${rwy}, cleared for take-off`, disabled: !!ac.takeoffCleared, hint: busy ? 'runway occupied!' : undefined, action: () => this.say(ac, `backtrack runway ${rwy}, cleared for take-off`) });
      }
      const landing = sim.aircraft.filter((o) => (o.phase === 'approach' && sim.distanceToThresholdNm(o) < 5) || o.phase === 'landing');
      items.push({
        label: 'Behind ... line up and wait',
        disabled: !landing.length || ac.phase === 'lineup',
        submenu: () => landing.map((o) => ({ label: `behind landing ${o.callsign}`, hint: o.type.icao, action: () => this.say(ac, `behind landing ${o.callsign}, line up and wait behind`) })),
      });
      items.push({
        label: `Cleared for take-off runway ${rwy}`,
        // Live while the menu is open: runway, CTOT, the spacing countdown, the next arrival.
        hint: () => {
          const wait = Math.max(0, Math.round(sim.tower.spacingRemaining(ac)));
          const eta = sim.tower.nextArrivalEta(sim.tower.departureEnd(ac));
          if (sim.tower.runwayBusyForDeparture(ac)) return 'runway occupied!';
          if (slotOpens !== undefined && sim.time < slotOpens) return `CTOT: not before ${hhmm(sim, slotOpens)}!`;
          if (wait) return `spacing: wait ${wait} s`;
          return Number.isFinite(eta) ? `next arrival ${Math.round(eta)} s` : 'no arrival';
        },
        disabled: (ac.phase === 'taxi' && ac.routeDestination?.kind !== 'holdingPoint') || !!ac.takeoffCleared,
        action: () => this.say(ac, `${this.windPhrase()}, runway ${rwy}, cleared for take-off`),
      });
      items.push({
        label: `Cleared for immediate take-off`,
        hint: slotOpens !== undefined ? `CTOT: not before ${hhmm(sim, slotOpens)}!` : undefined,
        disabled: (ac.phase === 'taxi' && ac.routeDestination?.kind !== 'holdingPoint') || !!ac.takeoffCleared,
        action: () => this.say(ac, `${this.windPhrase()}, runway ${rwy}, cleared for immediate take-off`),
      });
      if (ac.takeoffCleared || ac.lineUpCleared) items.push({ label: 'Cancel take-off', action: () => this.say(ac, 'hold position, cancel take-off') });
    }
    // Taxiing traffic on Tower frequency (departures, vacated arrivals, crossings): hold, and continue again.
    if (ac.onGround && ['taxi', 'holding', 'lineup'].includes(ac.phase)) {
      items.push({ label: 'Hold position', disabled: ac.holdPosition, action: () => this.say(ac, 'hold position') });
      if (ac.phase !== 'lineup') {
        items.push({
          label: 'Continue taxi',
          hint: ac.holdPosition ? 'holding position' : ac.stoppedAt?.kind === 'holdShort' ? `holding short of ${ac.stoppedAt.target}` : undefined,
          disabled: !(ac.holdPosition || ac.stoppedAt?.kind === 'holdShort' || ac.giveWayTo),
          action: () => this.say(ac, 'continue taxi'),
        });
      }
    }
    if (ac.phase === 'takeoff') items.push({ label: 'Stop immediately', action: () => this.say(ac, 'stop immediately') });
    // Every aircraft in the air (departures, go-arounds) can be handed to Radar.
    if ((ac.phase === 'climb' || ac.phase === 'goAround') && radar) {
      // Departures: the radar sector of their SID (e.g. the southern departures at Stuttgart).
      const f = (ac.category === 'departure' && departureFrequency(this.sim, ac)) || radar.frequency;
      items.push({ label: `Contact ${radar.name} ${f}`, hint: ac.request === 'radar' ? 'requested' : undefined, action: () => this.say(ac, `contact radar ${f}`) });
    }
    if (ac.phase === 'approach') {
      items.push({
        label: `Cleared to land runway ${rwy}`,
        disabled: !!ac.landingCleared,
        hint: sim.tower.runwayBusy(ac, rwyEnd) ? 'runway occupied!' : `${sim.distanceToThresholdNm(ac).toFixed(1)} NM`,
        action: () => this.say(ac, `${this.windPhrase()}, runway ${rwy}, cleared to land`),
      });
      items.push({ label: 'Continue approach', disabled: !!ac.landingCleared || !!ac.continueApproachGiven, action: () => this.say(ac, 'continue approach') });
      items.push({
        label: 'Continue, expect late landing clearance',
        disabled: !!ac.landingCleared || !!ac.continueApproachGiven,
        action: () => this.say(ac, 'continue approach, expect late landing clearance'),
      });
      const vapp = ac.type.approachSpeedKt;
      items.push({
        label: 'Speed',
        hint: ac.speedRestriction ? (ac.speedRestriction.untilNm > 0 ? `${ac.speedRestriction.kt} kt until ${ac.speedRestriction.untilNm} NM` : 'final approach speed') : `${Math.round(ac.speed / 0.514444)} kt`,
        submenu: () => [
          ...[[180, 6], [170, 5], [160, 4], [150, 4]]
            .filter(([kt]) => kt > vapp)
            .map(([kt, nm]) => ({ label: `Maintain ${kt} knots until ${nm} miles`, action: () => this.say(ac, `maintain ${kt} knots until ${nm} miles`) })),
          { label: 'Reduce to final approach speed', hint: `${vapp} kt`, action: () => this.say(ac, 'reduce to final approach speed') },
        ],
      });
      items.push({ label: 'Go around', action: () => this.say(ac, 'go around') });
      const exits = sim.airport.exits(rwy);
      items.push({ label: 'Vacate via', submenu: () => exits.map((e) => ({ label: `Taxiway ${e.name}`, hint: e.rapid ? 'rapid' : undefined, action: () => this.say(ac, `vacate via ${e.name}`) })) });
    }
    const cross = ac.onGround && ac.stoppedAt?.kind === 'runway' ? this.crossingRunway(ac) : undefined;
    if (cross) items.push({ label: `Cross runway ${cross}`, hint: !sim.tower.crossingFree(ac.stoppedAt!.target) ? 'runway occupied!' : arrival, action: () => this.say(ac, `cross runway ${cross}`) });
    // Arrivals can be handed to Ground right after touchdown (they call Ground once vacated).
    if (ac.onGround && ground && (ac.phase === 'taxi' || (ac.category === 'arrival' && (ac.phase === 'landing' || ac.phase === 'vacating')))) {
      items.push({ label: `Contact Ground ${ground.frequency}`, hint: ac.request === 'vacated' ? 'vacated' : undefined, action: () => this.say(ac, `contact ground ${ground.frequency}`) });
    }
    if (ac.request) items.push({ label: 'Standby', action: () => this.say(ac, 'standby') });
    items.push({ label: 'Say again', action: () => this.say(ac, 'say again') });
    return items;
  }

  /** Clearance Delivery: IFR clearance (voice or DCL), squawk, readback, start-up, hand-off to Ground. */
  private deliveryItems(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    // Keep the code of an earlier clearance; otherwise the next free code.
    const squawk = ac.clearance?.squawk || allocateSquawk(sim);
    const suggested = suggestedSid(sim, ac);
    const sids = sim.config.airport.sids
      .filter((sd) => sim.isDepartureRunway(sd.runway))
      .sort((a, b) => (a.name === suggested ? -1 : b.name === suggested ? 1 : a.name.localeCompare(b.name)));
    const sidHint = (name: string, fix: string) => (name === suggested ? `${fix || 'radar vectors'} - flight plan` : fix || 'radar vectors');
    const dest = destinationName(ac.flightPlan.destination);
    const ctot = ac.ctot !== undefined ? `, CTOT ${hhmm(sim, ac.ctot)}` : '';
    const dclRequest = ac.dcl && sim.systemOn('dcl') && !ac.cleared;
    if (dclRequest) {
      items.push({
        label: 'Send DCL (datalink)',
        hint: `squawk ${squawk}`,
        submenu: () =>
          sids.map((sd) => ({
            label: sd.name,
            hint: sidHint(sd.name, sd.fix),
            action: () => {
              const err = this.act({ k: 'dcl', callsign: ac.callsign, sid: sd.name, squawk });
              if (err) this.toast(err);
              this.slowUpdate();
            },
          })),
      });
    }
    items.push({
      label: ac.cleared ? 'Amend IFR clearance' : dclRequest ? 'IFR clearance by voice' : 'IFR clearance',
      hint: `squawk ${squawk}`,
      submenu: () =>
        sids.map((sd) => ({
          label: sd.name,
          hint: sidHint(sd.name, sd.fix),
          action: () => this.say(ac, `cleared to ${dest}, ${formatDepartureRoute(sd.name)}, ${formatClearanceClimb(sd.name, initialClimb(sim))}, squawk ${squawk}${ctot}`),
        })),
    });
    items.push({ label: 'Readback correct', disabled: !ac.cleared || !!ac.readbackConfirmed, action: () => this.say(ac, 'readback correct') });
    const assigned = ac.clearance?.squawk;
    items.push({
      label: 'Squawk',
      disabled: !assigned,
      submenu: () => [
        { label: `Negative, squawk ${assigned}`, action: () => this.say(ac, `negative, squawk ${assigned}`) },
        { label: 'New code', hint: allocateSquawk(sim), action: () => this.say(ac, `squawk ${allocateSquawk(sim)}`) },
      ],
    });
    const tsat = sim.systemOn('acdm') && ac.tsat !== undefined ? ac.tsat : undefined;
    items.push({
      label: 'Start-up approved',
      hint: !ac.cleared ? 'no clearance yet' : tsat !== undefined ? `TSAT ${hhmm(sim, tsat)}` : undefined,
      disabled: !ac.cleared || ac.startupApproved || ac.phase !== 'parked',
      action: () => this.say(ac, 'start-up approved'),
    });
    if (ac.ctot !== undefined) items.push({ label: `CTOT ${hhmm(sim, ac.ctot)}`, action: () => this.say(ac, `CTOT ${hhmm(sim, ac.ctot!)}`) });
    const ground = sim.airport.station(sim.stationFor('ground'));
    if (ground) {
      items.push({ divider: true, label: '' });
      const word = ground.type === 'TWR' ? 'tower' : 'ground';
      items.push({ label: `Contact ${ground.type === 'TWR' ? 'Tower' : 'Ground'} ${ground.frequency}`, disabled: !ac.cleared, action: () => this.say(ac, `contact ${word} ${ground.frequency}`) });
    }
    if (ac.request) items.push({ label: 'Standby', action: () => this.say(ac, 'standby') });
    items.push({ label: 'Say again', action: () => this.say(ac, 'say again') });
    return items;
  }

  private taxiDestinations(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    // Winter operations: the de-icing pads first while the departure still needs de-icing.
    if (needsDeicing(sim, ac)) {
      for (const pad of sim.airport.deicingPads) {
        const user = padUser(sim, pad, ac);
        items.push(user ? { label: `De-icing ${pad.name}`, hint: `occupied (${user.callsign})`, disabled: true } : this.routeItem(ac, `De-icing ${pad.name}`, `de-icing pad ${pad.name}`));
      }
    }
    for (const ops of sim.config.airport.runwayOps) {
      if (items.length) items.push({ divider: true, label: '' });
      for (const e of ops.departureEntries) {
        const label = `${e.holdingPoint}  RWY ${ops.runway}${e.fullLength ? '' : ' (intersection)'}`;
        const item = this.routeItem(ac, label, `holding point ${e.holdingPoint} runway ${ops.runway}`);
        if (!sim.isDepartureRunway(ops.runway)) item.label += sim.isRunwayInUse(ops.runway) ? ' - landings only' : ' - not in use';
        items.push(item);
      }
    }
    return items;
  }

  /**
   * Resolve a head-on conflict the way it is done in real operations: one
   * aircraft turns off via another taxiway (the other one waits), or - if
   * there is no junction left between them - a tug turns one around.
   */
  private resolveItem(ac: Aircraft, other: Aircraft): MenuItem {
    return {
      label: `Resolve conflict with ${other.callsign}`,
      submenu: () => {
        if (!this.sim.systemOn('routing')) return [{ label: 'Routing service off', disabled: true }];
        const options = resolveOptions(this.sim, ac, other).filter((o) => this.sim.isOnMyFrequency(o.aircraft));
        if (!options.length) return [{ label: 'No way out found', disabled: true }];
        return options.map((o) => ({
          label: `${o.aircraft.callsign}: ${o.tug ? 'tug turnaround, then ' : /^turn around/.test(o.instruction) ? 'turn around, then ' : ''}${o.instruction.replace(/^turn around, /, '').replace(/^taxi to /, 'to ')}`,
          hint: `${o.tug ? 'tug: 5-10 min' : o.route ? `${o.other.callsign} waits` : 'towed back onto the stand'}${o.crossesRunway ? ', crosses runway' : ''}`,
          action: () => this.say(o.aircraft, o.instruction),
          onHover: (on: boolean) => {
            this.menuPreview = on;
            this.scope.preview = on && o.route ? { points: routePoints(this.sim.airport, o.aircraft, o.route.nodes, o.route.startPosition), ok: true } : undefined;
            if (!on) this.updatePreview();
          },
        }));
      },
    };
  }

  /**
   * The runway an aircraft holds short of (or will, on its route) as said in a crossing clearance: the end in use,
   * else the lower-numbered end ("cross runway 24").
   */
  private crossingRunway(ac: Aircraft): string | undefined {
    const target = ac.stoppedAt?.kind === 'runway' ? ac.stoppedAt.target : ac.stops.find((s) => s.kind === 'runway')?.target;
    return target ? (this.sim.activeEndOn(target) ?? target.split('/')[0]) : undefined;
  }

  /** "Follow the follow-me" - to the allocated stand if the aircraft has no route yet. */
  private followMeItem(ac: Aircraft): MenuItem {
    const toStand = !ac.route && ac.assignedStand;
    return {
      label: 'Follow the follow-me',
      hint: ac.followMe ? 'ordered' : ac.wantsFollowMe ? 'requested' : toStand ? `to stand ${ac.assignedStand}` : undefined,
      disabled: !!ac.followMe,
      action: () => this.say(ac, 'follow the follow-me'),
    };
  }

  /** "Advise able for departure from intersection X" for the intersections of the runway in use. */
  private ableItem(ac: Aircraft): MenuItem {
    const ops = this.sim.airport.runwayOps(this.sim.departureRunwayOf(ac));
    const entries = ops?.departureEntries.filter((e) => !e.fullLength) ?? [];
    return {
      label: 'Able intersection?',
      disabled: !entries.length,
      submenu: () =>
        entries.map((e) => {
          const answer = ac.ableIntersection?.[e.holdingPoint.toUpperCase()];
          return {
            label: `Intersection ${e.holdingPoint}`,
            hint: answer === undefined ? '' : answer ? 'able' : 'full length',
            action: () => this.say(ac, `advise able for departure from intersection ${e.holdingPoint}`),
          };
        }),
    };
  }

  private standDestinations(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    if (ac.assignedStand) items.push(this.routeItem(ac, `Stand ${ac.assignedStand}`, `stand ${ac.assignedStand}`, 'assigned'));
    const free = sim
      .freeStands(ac.type.wingspanM, (s) => s.id !== ac.assignedStand, ac)
      .sort((a, b) => distance(a.pos, ac.pos) - distance(b.pos, ac.pos))
      .slice(0, 14);
    if (items.length && free.length) items.push({ divider: true, label: '' });
    for (const s of free) items.push(this.routeItem(ac, `Stand ${s.id}`, `stand ${s.id}`, `${s.apron}`));
    if (!items.length) items.push({ label: 'No free stand', disabled: true });
    return items;
  }

  private taxiwaysAhead(ac: Aircraft): string[] {
    if (!ac.route || !ac.path) return [];
    const names: string[] = [];
    for (let i = 1; i < ac.route.nodes.length; i++) {
      const n = ac.route.nodes[i];
      const s = ac.path.marker(n.id)?.s ?? 0;
      if (s < ac.s + 40) continue;
      for (const e of n.edges) {
        if ((e.kind === 'taxiway' || e.kind === 'taxilane') && e.name !== ac.route.edges[i - 1].name && !names.includes(e.name)) names.push(e.name);
      }
    }
    return names;
  }

  private pushFacings(ac: Aircraft): Compass[] {
    const stand = this.sim.airport.stand(ac.stand ?? '');
    if (!stand) return [];
    const out: Compass[] = [];
    const all: [Compass, number][] = [
      ['north', 0],
      ['east', 90],
      ['south', 180],
      ['west', 270],
    ];
    for (const e of stand.lane.edges) {
      if (e.kind !== 'taxilane' && e.kind !== 'taxiway') continue;
      const nose = (headingOf(sub(otherEnd(e, stand.lane).pos, stand.lane.pos)) + 180) % 360;
      const best = all.reduce((b, c) => (Math.abs(headingDiff(nose, c[1])) < Math.abs(headingDiff(nose, b[1])) ? c : b));
      if (!out.includes(best[0])) out.push(best[0]);
    }
    return out;
  }
}

function routePoints(airport: Airport, ac: Aircraft, nodes: TaxiNode[], start?: Vec2): Vec2[] {
  return [start ?? ac.pos, ...(nodes[0] ? airport.polyline(nodes).points : [])];
}
