import { otherEnd } from '../core/airport/airport';
import type { Compass, StationType } from '../core/airport/types';
import type { Aircraft } from '../core/aircraft';
import { distance, headingDiff, headingOf, sub, type Vec2 } from '../core/geo';
import { formatCommand } from '../core/phraseology/format';
import { parseTransmission } from '../core/phraseology/parser';
import { acknowledgeCatc, catcAlert, headOnPartner, resolveOptions, routeHeadOn } from '../core/conflicts';
import { allocateSquawk, CTOT_EARLY_S, hhmm, initialClimbFt, sendDcl, suggestedSid } from '../core/delivery';
import { previewTaxi } from '../core/pilot';
import { destinationName } from '../data/destinations';
import type { RadioMessage } from '../core/radio';
import type { Simulation } from '../core/simulation';
import { REPO_URL, showAtisEditor, showHelp } from './dialogs';
import { formatTime, h } from './dom';
import { arrivalList, departureList, VehicleList } from './lists';
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
/** Keys that work as push-to-talk (held down). */
const PTT_KEYS = new Set(['Backquote', 'ControlRight', 'Insert']);

/**
 * The controller client: wires the simulation to the scope, the traffic
 * lists, the message window and the command line.
 */
export class App {
  private readonly scope: Scope;
  private readonly menu = new PopupMenu();
  private readonly lists: { el: HTMLElement; update(sim: Simulation, selected?: string): void }[];
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
  /** Mobile mode: actions for the selected aircraft. */
  private readonly quickbar: HTMLElement;
  private quickbarKey = '';
  /** Quick-action bar: phrases picked for the selected aircraft or vehicle, sent together with SEND. */
  private quickSel: { cs: string; phrases: string[] } | null = null;
  /** While set, say() collects the phrase instead of transmitting it (to learn what a menu action would say). */
  private capture: string[] | null = null;
  /** Mobile mode: the quick-action bar shows the ALL STATIONS broadcasts. */
  private allStationsMode = false;
  /** Density / events last chosen in the settings; the session keeps a scenario's values until they change. */
  private densitySetting: Settings['density'];
  private eventsSetting: boolean;
  private readonly voices = new PilotVoices();
  private readonly voiceIn: VoiceInput;

  private selected?: string;
  private speed = 1;
  private paused = false;
  private last = performance.now();
  private lastSlowUpdate = 0;
  private history: string[] = [];
  private historyIdx = -1;
  private menuPreview = false;

  constructor(
    root: HTMLElement,
    private readonly sim: Simulation,
    private readonly settings: Settings,
  ) {
    this.densitySetting = settings.density;
    this.eventsSetting = settings.events;

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
    const settingsBtn = h('button.settings-btn', { html: '&#9881; SETTINGS', title: 'Settings: device layout, sizes, voice, traffic' });
    settingsBtn.addEventListener('click', () => this.openSettings());
    const helpBtn = h('button', { text: 'HELP', title: 'Phraseology and controls (F1)' });
    helpBtn.addEventListener('click', () => showHelp(this.sim));
    const briefBtn = h('button', { text: 'BRIEFING', title: 'Airport briefing: procedures and information for your position' });
    briefBtn.addEventListener('click', () => showHelp(this.sim, 'briefing'));
    const docsBtn = h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, h('button', { text: 'DOCS', type: 'button' }));
    const disconnect = h('button', { text: 'DISCONNECT', title: 'End the session' });
    disconnect.addEventListener('click', () => {
      // The debriefing first: the simulation pauses while it is open.
      const wasPaused = this.paused;
      if (!wasPaused) this.togglePause();
      showDebrief(this.sim, {
        onContinue: () => {
          if (!wasPaused && this.paused) this.togglePause();
        },
        onEnd: () => location.reload(),
      });
    });

    const toolbar = h(
      'div.toolbar',
      {},
      h('span.brand', { text: 'ULTIMATE ATC' }),
      field('station', 'Your frequencies - click one to switch it off (the simulator takes the position over) or on again'),
      field('rwy', 'Active runway'),
      field('atis', 'Current ATIS'),
      field('wind', 'Surface wind'),
      field('qnh', 'QNH'),
      field('utc', 'Simulation time (UTC)'),
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
      settingsBtn,
      field('score', 'Score: +10 per departure handed off / arrival parked, penalties for incidents, delays and "say again"'),
      helpBtn,
      docsBtn,
      disconnect,
    );

    for (const key of ['rwy', 'atis', 'wind', 'qnh']) {
      this.fields[key].classList.add('clickable');
      this.fields[key].addEventListener('click', () => showAtisEditor(this.sim));
    }

    // ---------------------------------------------------------------- scope + panels
    const canvas = h('canvas.scope');
    // Click a frequency in the toolbar: switch it off / on.
    this.fields.station.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-station]');
      const type = el?.dataset.station as StationType | undefined;
      if (!type) return;
      const err = this.sim.setStationActive(type, !this.sim.userControls(type));
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

    // ---------------------------------------------------------------- comms
    this.messagesEl = h('div.messages');
    this.targetEl = h('span.target');
    this.input = new CommandInput('Type an instruction, e.g. "DLH5AB taxi to holding point A via L2, S" - F1 for help');
    this.previewEl = h('span.preview');
    this.micButton = h('button.mic', { text: 'MIC', title: 'Push-to-talk: hold the ^ / ` key, Right Ctrl or Insert (or click to start/stop)' });
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
      side('STANDBY', 'Standby - to the selected aircraft (or the last caller)', toSelected('standby')),
      allBtn,
    );
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
    this.setTts(settings.tts && this.voices.supported);
    if (!this.voices.supported) this.ttsButton.disabled = true;
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
    this.micButton.addEventListener('click', () => (this.voiceIn.listening ? this.voiceIn.stop() : this.voiceIn.start()));
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
      if (PTT_KEYS.has(e.code)) {
        e.preventDefault();
        this.voiceIn.stop();
      }
    });
    window.addEventListener('resize', () => this.scope.resize());
    this.fitToViewport();
    new ResizeObserver(() => this.scope.resize()).observe(this.main);

    this.setSpeed(1);
    const staffed = sim.config.airport.stations.filter((st) => sim.userControls(st.type)).map((st) => `${st.callsign} (${st.name}, ${st.frequency})`);
    this.hint(`Connected as ${staffed.join(' + ')}. Runway ${sim.runway} in use. BRIEFING shows the airport briefing, F1 the help.`);
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
    if (!this.paused) this.sim.tick(dt * this.speed);
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
    for (const l of this.lists) l.update(sim, this.selected);
    // Your frequencies (combined positions: several). Switched-off ones are run by the simulator.
    const logged = sim.config.airport.stations.filter((st) => sim.loggedInStations.includes(st.type));
    const active = logged.filter((st) => sim.userControls(st.type));
    const html =
      logged
        .map((st) => {
          const on = sim.userControls(st.type);
          return `<span class="stn pos-${st.type}${on ? '' : ' off'}" data-station="${st.type}" title="${on ? 'Click to switch off' : 'Switched off (run by the simulator) - click to switch on'}"><b>${st.callsign}</b> ${st.frequency}${on ? '' : ' OFF'}</span>`;
        })
        .join(' + ') + (active.length > 1 ? '<span class="combined-tag">COMBINED</span>' : '');
    if (this.fields.station.innerHTML !== html) this.fields.station.innerHTML = html;
    this.fields.rwy.innerHTML = `RWY <b>${sim.runway}</b>`;
    this.fields.atis.innerHTML = `ATIS <b>${sim.atisLetter}</b>`;
    const wind = sim.observedWind;
    const tail = sim.windComponents(sim.runway, wind).headwind < -5;
    this.fields.wind.innerHTML = `<b${tail ? ' class="bad"' : ''}>${String(wind.direction).padStart(3, '0')}/${String(wind.speedKt).padStart(2, '0')}</b>KT`;
    this.fields.wind.title = tail ? 'Tailwind above 5 kt on the runway in use - consider a runway change (click to edit the ATIS)' : 'Surface wind (click to edit the ATIS)';
    this.fields.qnh.innerHTML = `Q<b>${sim.atis.qnh}</b>`;
    this.fields.utc.innerHTML = `<b>${formatTime(sim.utc())}</b>Z`;
    const s = sim.stats;
    const bad = s.collisions + s.incursions + s.goArounds;
    this.fields.score.className = 'field score';
    this.fields.score.innerHTML = `SCORE <b>${s.score}</b> | DEP ${s.departuresHandedOff} | ARR ${s.arrivalsParked} | <span class="${bad ? 'bad' : ''}">INC ${bad}</span>`;
    this.targetEl.textContent = this.targetText();
    this.updateQuickbar();
    const off = Object.values(this.sim.systems).filter((v) => !v).length;
    this.sysBtn.classList.toggle('sys-warn', off > 0);
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
    showSettings(this.sim, this.settings, () => this.applySettings(), { tts: this.voices.supported, mic: this.voiceIn.supported, test: () => this.voices.test('Stuttgart Ground, radio check, readability five') });
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
    this.scope.touchMode = mobile;
    this.scope.tagScale = s.tagScale * (mobile ? 1.25 : 1);
    this.scope.showAllRoutes = s.showRoutes;
    this.routesBtn.classList.toggle('active', s.showRoutes);
    if (s.runwayAligned !== this.scope.runwayAligned) this.scope.setRotation(s.runwayAligned);
    this.rotBtn.classList.toggle('active', s.runwayAligned);
    if (this.voices.enabled !== (s.tts && this.voices.supported)) this.setTts(s.tts && this.voices.supported, true);
    this.voices.volume = s.ttsVolume;
    this.voices.rate = s.ttsRate;
    this.voiceIn.lang = s.voiceLang;
    if (s.density !== this.densitySetting) this.sim.config.density = this.densitySetting = s.density;
    if (s.events !== this.eventsSetting) this.sim.config.events = this.eventsSetting = s.events;
    this.input.placeholder = mobile ? 'Tap an aircraft, or type / speak an instruction' : this.sim.userTower
        ? 'Type an instruction, e.g. "DLH5AB line up and wait runway 25" - F1 for help'
        : this.sim.userControls('GND')
        ? 'Type an instruction, e.g. "DLH5AB taxi to holding point A via L2, S" - F1 for help'
        : 'Type an instruction, e.g. "DLH5AB cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312" - F1 for help';
    this.quickbarKey = '';
    this.updateQuickbar();
    requestAnimationFrame(() => this.scope.resize());
  }

  /** Mobile mode: one-tap buttons for the most common instructions to the selected aircraft. */
  private updateQuickbar(): void {
    if (this.allStationsMode && this.settings.device === 'mobile' && !this.selected) {
      const key = `ALL|${this.sim.atisLetter}|${this.sim.runway}`;
      this.quickbar.classList.add('show');
      if (key === this.quickbarKey) return;
      this.quickbarKey = key;
      const close = h('button', { text: '\u00d7', type: 'button', title: 'Close' });
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
    if (v && this.settings.device === 'mobile') {
      // Follow-me car: the vehicle phrases as buttons.
      const key = `${v.callsign}|${v.state}|${v.request}|${v.holding}`;
      this.quickbar.classList.add('show');
      if (key === this.quickbarKey) return;
      this.quickbarKey = key;
      const short: Record<string, string> = { 'Return to base': 'BASE', 'Hold position': 'HOLD', Continue: 'CONT', Standby: 'STBY' };
      const buttons = this.vehicleItems(v)
        .filter((i) => i.action && !i.disabled && i.label !== 'Centre view')
        .map((i) => {
          const text = short[i.label] ?? (i.label.startsWith('Proceed') ? 'PROCEED' : i.label);
          const phrase = this.phraseOf(i.action!);
          if (phrase) return this.quickPhrase(v.callsign, text, phrase);
          const b = h('button', { text, type: 'button' });
          b.addEventListener('click', () => i.action!());
          return b;
        });
      this.quickbar.replaceChildren(h('span.qcs', { text: v.callsign }), ...buttons);
      return;
    }
    const ac = this.sim.find(this.selected);
    const show = this.settings.device === 'mobile' && !!ac;
    this.quickbar.classList.toggle('show', show);
    if (!show || !ac) {
      this.quickbarKey = '';
      return;
    }
    const mine = this.sim.isOnMyFrequency(ac);
    const key = `${ac.callsign}|${ac.phase}|${ac.onGround}|${ac.request}|${mine}|${ac.frequency}|${ac.cleared}|${ac.startupApproved}|${ac.wantsFollowMe}|${ac.lineUpCleared}|${ac.takeoffCleared}|${ac.landingCleared}|${ac.stoppedAt?.kind}|${headOnPartner(this.sim, ac)?.callsign ?? ''}|${catcAlert(this.sim, ac)?.key ?? ''}`;
    if (key === this.quickbarKey) return;
    this.quickbarKey = key;
    if (this.quickSel && this.quickSel.cs !== ac.callsign) this.clearQuickSel();
    const phrase = (text: string, p: string) => this.quickPhrase(ac.callsign, text, p);
    const btn = (text: string, fn: (b: HTMLButtonElement) => void) => {
      const b = h('button', { text, type: 'button' });
      b.addEventListener('click', () => fn(b));
      return b;
    };
    const at = (b: HTMLButtonElement): [number, number] => {
      const r = b.getBoundingClientRect();
      return [r.left, r.top];
    };
    const items: HTMLElement[] = [h('span.qcs', { text: ac.callsign })];
    if (catcAlert(this.sim, ac)) items.push(btn('ACK', () => this.acknowledgeCatc(ac)));
    if (mine && this.sim.userTower && ac.frequency === this.sim.stationFor('tower')) {
      // Tower: the clearances of the moment as buttons.
      const short: [RegExp, string][] = [
        [/^Line up/, 'LUP'],
        [/^Cleared for take-off/, 'T/O'],
        [/^Cleared to land/, 'LAND'],
        [/^Continue approach/, 'CONT'],
        [/^Go around/, 'G/A'],
        [/^Cross runway/, 'CROSS'],
        [/^Contact Ground/, 'GND'],
        [/^Contact .*Radar/, 'RDR'],
        [/^Stop immediately/, 'STOP'],
        [/^Hold position/, 'HOLD'],
      ];
      for (const i of this.towerItems(ac)) {
        const s = short.find(([re]) => re.test(i.label));
        if (!s || !i.action || i.disabled) continue;
        const p = this.phraseOf(i.action);
        items.push(p ? phrase(s[1], p) : btn(s[1], () => i.action!()));
      }
    } else if (mine && ac.frequency === this.sim.stationFor('delivery') && this.sim.stationFor('delivery') !== this.sim.stationFor('ground')) {
      const del = this.deliveryItems(ac);
      const sub = (label: string) => del.find((i) => i.label === label);
      const clr = sub('Send DCL (datalink)') ?? sub('IFR clearance') ?? sub('IFR clearance by voice') ?? sub('Amend IFR clearance');
      if (clr && !ac.cleared) items.push(btn(clr.label.startsWith('Send') ? 'DCL' : 'CLR', (b) => this.menu.open(`${ac.callsign} - ${clr.label}`, clr.submenu!(), ...at(b))));
      if (ac.cleared) items.push(phrase('RB OK', 'readback correct'));
      if (ac.cleared && !ac.startupApproved) items.push(phrase('START', 'start-up approved'));
      const ground = this.sim.airport.station(this.sim.stationFor('ground'));
      if (ac.cleared && ground) items.push(phrase('GND', `contact ground ${ground.frequency}`));
    } else if (mine) {
      if (ac.phase === 'parked' && ac.category === 'tow') {
        items.push(phrase('TOW', 'tow approved'));
      } else if (ac.phase === 'parked' && ac.category === 'departure') {
        const stand = this.sim.airport.stand(ac.stand ?? '');
        if (stand?.pushback === false) items.push(btn('TAXI', (b) => this.menu.open(`${ac.callsign} - taxi to`, this.taxiDestinations(ac), ...at(b))));
        else items.push(phrase('PUSH', 'push and start approved'));
      } else if (ac.onGround && ['pushback', 'startup', 'taxi', 'holding'].includes(ac.phase)) {
        const arr = ac.category === 'arrival' || ac.returnToStand || ac.category === 'tow';
        items.push(btn('TAXI', (b) => this.menu.open(arr ? `${ac.callsign} - taxi to stand` : `${ac.callsign} - taxi to`, arr ? this.standDestinations(ac) : this.taxiDestinations(ac), ...at(b))));
        items.push(phrase('HOLD', 'hold position'));
        const partner = headOnPartner(this.sim, ac);
        if (ac.wantsFollowMe) items.push(phrase('FLWM', 'follow the follow-me'));
        if (partner) items.push(btn('RESOLVE', (b) => this.menu.open(`${ac.callsign} - resolve conflict`, this.resolveItem(ac, partner).submenu!(), ...at(b))));
        items.push(phrase('CONT', 'continue taxi'));
        const tower = this.sim.airport.station(this.sim.stationFor('tower'));
        if (ac.category === 'departure' && tower && ['taxi', 'holding'].includes(ac.phase)) items.push(phrase('TWR', `contact tower ${tower.frequency}`));
      }
    }
    items.push(btn('MENU', (b) => this.openMenu(ac.callsign, ...at(b))));
    this.quickbar.replaceChildren(...items);
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
    const res = this.sim.transmit(text, this.selected, { fallbackToLastCaller: fromVoice });
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
    if (PTT_KEYS.has(e.code)) {
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
        const pts = routePoints(ac, r.route.nodes.map((n) => n.pos), r.route.startPosition);
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

  /** EuroScope-style tag item functions. */
  private onTagItem(cs: string, item: TagItem, x: number, y: number): void {
    const ac = this.sim.find(cs);
    if (!ac) return;
    if (item === 'callsign' || item === 'type') {
      this.menu.open(`${ac.callsign} - ${this.sim.tel(ac).toUpperCase()}`, this.flightPlanItems(ac), x, y);
    } else if (item === 'target') {
      if (!this.sim.isOnMyFrequency(ac)) return;
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
      { label: `Information ${sim.atisLetter} is now current`, short: `INFO ${sim.atisLetter}`, phrase: `information ${sim.atisLetter} is now current, QNH ${sim.atis.qnh}` },
      { label: `Runway ${sim.runway} in use`, short: `RWY ${sim.runway}`, phrase: `runway ${sim.runway} in use` },
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

  /** Acknowledges the CATC alert of an aircraft (no flashing until the conflict ends). */
  private acknowledgeCatc(ac: Aircraft): void {
    const alert = catcAlert(this.sim, ac);
    if (!alert || !acknowledgeCatc(this.sim, ac)) return;
    this.sim.system(`CATC alert ${alert.a.callsign} / ${alert.b.callsign} acknowledged.`, 'system', ac.callsign);
    this.quickbarKey = '';
    this.updateQuickbar();
  }

  private say(ac: Aircraft | Vehicle, phrase: string): void {
    if (this.capture) {
      this.capture.push(phrase);
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
    b.dataset.phrase = phrase;
    if (this.quickSel?.cs === cs && this.quickSel.phrases.includes(phrase)) b.classList.add('picked');
    b.addEventListener('click', () => {
      if (this.quickSel?.cs !== cs) this.quickSel = { cs, phrases: [] };
      const list = this.quickSel.phrases;
      const i = list.indexOf(phrase);
      if (i >= 0) list.splice(i, 1);
      else list.push(phrase);
      b.classList.toggle('picked', i < 0);
      this.input.value = list.length ? `${cs} ${list.join(', ')}` : '';
      this.updatePreview();
    });
    return b;
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
    const pts = routePoints(ac, r.route.nodes.map((n) => n.pos), r.route.startPosition);
    const conflict = this.sim.systemOn('catc') ? routeHeadOn(this.sim, ac, pts) : undefined;
    return {
      label,
      hint: `${hint ?? `via ${via.join(' ')}`}${conflict ? `  ! head-on ${conflict.other.callsign}` : ''}`,
      action: () => this.say(ac, `taxi to ${destText} via ${via.join(', ')}`),
      onHover: (on) => {
        this.menuPreview = on;
        this.scope.preview = on ? { points: routePoints(ac, r.route.nodes.map((n) => n.pos), r.route.startPosition), ok: true } : undefined;
        if (!on) this.updatePreview();
      },
    };
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
      items.push({ label: `On ${ac.frequency} frequency`, disabled: true }, { divider: true, label: '' }, center, resetTag);
      return items;
    }

    const rwy = sim.runway;
    const tower = sim.airport.station(sim.stationFor('tower'));

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
        items.push({ label: 'Pushback approved', submenu: pushSub(false) });
        items.push({ label: 'Push and start approved', submenu: pushSub(true) });
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
      const rwyStop = ac.stoppedAt?.kind === 'runway' || ac.stops.some((s) => s.kind === 'runway');
      items.push({ label: `Cross runway ${rwy}`, disabled: !rwyStop, action: () => this.say(ac, `cross runway ${rwy}`) });
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
    const w = this.sim.observedWind;
    return w.speedKt === 0 ? 'wind calm' : `wind ${String(w.direction).padStart(3, '0')} degrees ${w.speedKt} knots`;
  }

  /** Tower: line-up, take-off and landing clearances, go-around, exits, crossings, hand-offs. */
  private towerItems(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    const rwy = ac.runway ?? sim.runway;
    const ground = sim.airport.station(sim.stationFor('ground'));
    const radar = sim.airport.station('APP');
    const eta = sim.tower.nextArrivalEta();
    const arrival = Number.isFinite(eta) ? `next arrival ${Math.round(eta)} s` : 'no arrival';
    if (ac.category === 'departure' && ac.onGround && ['holding', 'lineup', 'taxi'].includes(ac.phase)) {
      const spacing = Math.max(0, Math.round(sim.tower.spacingRemaining(ac)));
      const busy = sim.tower.runwayBusy(ac);
      const slotOpens = ac.ctot !== undefined && sim.time < ac.ctot - CTOT_EARLY_S ? ac.ctot - CTOT_EARLY_S : undefined;
      items.push({ label: `Line up and wait runway ${rwy}`, disabled: ac.phase === 'lineup' || !!ac.lineUpCleared, hint: busy ? 'runway occupied' : undefined, action: () => this.say(ac, `line up and wait runway ${rwy}`) });
      const landing = sim.aircraft.filter((o) => (o.phase === 'approach' && sim.distanceToThresholdNm(o) < 5) || o.phase === 'landing');
      items.push({
        label: 'Behind ... line up and wait',
        disabled: !landing.length || ac.phase === 'lineup',
        submenu: () => landing.map((o) => ({ label: `behind landing ${o.callsign}`, hint: o.type.icao, action: () => this.say(ac, `behind landing ${o.callsign}, line up and wait behind`) })),
      });
      items.push({
        label: `Cleared for take-off runway ${rwy}`,
        hint: busy ? 'runway occupied!' : slotOpens !== undefined ? `CTOT: not before ${hhmm(sim, slotOpens)}!` : spacing ? `spacing: wait ${spacing} s` : arrival,
        disabled: ac.phase === 'taxi' && ac.routeDestination?.kind !== 'holdingPoint',
        action: () => this.say(ac, `${this.windPhrase()}, runway ${rwy}, cleared for take-off`),
      });
      items.push({
        label: `Cleared for immediate take-off`,
        hint: slotOpens !== undefined ? `CTOT: not before ${hhmm(sim, slotOpens)}!` : undefined,
        disabled: ac.phase === 'taxi' && ac.routeDestination?.kind !== 'holdingPoint',
        action: () => this.say(ac, `${this.windPhrase()}, runway ${rwy}, cleared for immediate take-off`),
      });
      if (ac.takeoffCleared || ac.lineUpCleared) items.push({ label: 'Cancel take-off', action: () => this.say(ac, 'hold position, cancel take-off') });
      items.push({ label: 'Hold position', action: () => this.say(ac, 'hold position') });
    }
    if (ac.phase === 'takeoff') items.push({ label: 'Stop immediately', action: () => this.say(ac, 'stop immediately') });
    if (ac.phase === 'climb' && radar) items.push({ label: `Contact ${radar.name} ${radar.frequency}`, hint: ac.request === 'radar' ? 'requested' : undefined, action: () => this.say(ac, `contact radar ${radar.frequency}`) });
    if (ac.phase === 'approach') {
      items.push({
        label: `Cleared to land runway ${rwy}`,
        disabled: !!ac.landingCleared,
        hint: sim.tower.runwayBusy() ? 'runway occupied!' : `${sim.distanceToThresholdNm(ac).toFixed(1)} NM`,
        action: () => this.say(ac, `${this.windPhrase()}, runway ${rwy}, cleared to land`),
      });
      items.push({ label: 'Continue approach', disabled: !!ac.landingCleared, action: () => this.say(ac, 'continue approach') });
      items.push({
        label: 'Continue, expect late landing clearance',
        disabled: !!ac.landingCleared,
        action: () => this.say(ac, 'continue approach, expect late landing clearance'),
      });
      const vapp = ac.type.approachSpeedKt;
      items.push({
        label: 'Speed',
        hint: ac.speedRestriction ? `${ac.speedRestriction.kt} kt until ${ac.speedRestriction.untilNm} NM` : `${Math.round(ac.speed / 0.514444)} kt`,
        submenu: () => [
          ...[180, 170, 160, 150]
            .filter((kt) => kt > vapp)
            .map((kt) => ({ label: `Maintain ${kt} knots until 4 miles`, action: () => this.say(ac, `maintain ${kt} knots until 4 miles`) })),
          { label: 'Reduce to final approach speed', hint: `${vapp} kt`, action: () => this.say(ac, 'reduce to final approach speed') },
        ],
      });
      items.push({ label: 'Go around', action: () => this.say(ac, 'go around') });
      const exits = sim.airport.exits(rwy);
      items.push({ label: 'Vacate via', submenu: () => exits.map((e) => ({ label: `Taxiway ${e.name}`, hint: e.rapid ? 'rapid' : undefined, action: () => this.say(ac, `vacate via ${e.name}`) })) });
    }
    if (ac.onGround && ac.stoppedAt?.kind === 'runway') items.push({ label: `Cross runway ${rwy}`, hint: sim.tower.runwayBusy() ? 'runway occupied!' : arrival, action: () => this.say(ac, `cross runway ${rwy}`) });
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
    const climb = `${initialClimbFt(sim)} feet`;
    // Keep the code of an earlier clearance; otherwise the next free code.
    const squawk = ac.clearance?.squawk || allocateSquawk(sim);
    const suggested = suggestedSid(sim, ac);
    const sids = sim.config.airport.sids
      .filter((sd) => sd.runway === sim.runway)
      .sort((a, b) => (a.name === suggested ? -1 : b.name === suggested ? 1 : a.name.localeCompare(b.name)));
    const sidHint = (name: string, fix: string) => (name === suggested ? `${fix} - flight plan` : fix);
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
              const err = sendDcl(sim, ac, sd.name, squawk);
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
          action: () => this.say(ac, `cleared to ${dest} via ${sd.name} departure, climb ${climb}, squawk ${squawk}${ctot}`),
        })),
    });
    items.push({ label: 'Readback correct', disabled: !ac.cleared, action: () => this.say(ac, 'readback correct') });
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
      items.push({ label: `Contact Ground ${ground.frequency}`, disabled: !ac.cleared, action: () => this.say(ac, `contact ground ${ground.frequency}`) });
    }
    if (ac.request) items.push({ label: 'Standby', action: () => this.say(ac, 'standby') });
    items.push({ label: 'Say again', action: () => this.say(ac, 'say again') });
    return items;
  }

  private taxiDestinations(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    for (const ops of sim.config.airport.runwayOps) {
      if (items.length) items.push({ divider: true, label: '' });
      for (const e of ops.departureEntries) {
        const label = `${e.holdingPoint}  RWY ${ops.runway}${e.fullLength ? '' : ' (intersection)'}`;
        const item = this.routeItem(ac, label, `holding point ${e.holdingPoint} runway ${ops.runway}`);
        if (ops.runway !== sim.runway) item.label += ' - not in use';
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
          label: `${o.aircraft.callsign}: ${o.tug ? 'tug turnaround, then ' : ''}${o.instruction.replace(/^taxi to /, 'to ')}`,
          hint: `${o.tug ? 'tug: 5-10 min' : o.route ? `${o.other.callsign} waits` : 'towed back onto the stand'}${o.crossesRunway ? ', crosses runway' : ''}`,
          action: () => this.say(o.aircraft, o.instruction),
          onHover: (on: boolean) => {
            this.menuPreview = on;
            this.scope.preview = on && o.route ? { points: routePoints(o.aircraft, o.route.nodes.map((n) => n.pos), o.route.startPosition), ok: true } : undefined;
            if (!on) this.updatePreview();
          },
        }));
      },
    };
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
    const ops = this.sim.airport.runwayOps(this.sim.runway);
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

function routePoints(ac: Aircraft, nodes: Vec2[], start?: Vec2): Vec2[] {
  return [start ?? ac.pos, ...nodes];
}
