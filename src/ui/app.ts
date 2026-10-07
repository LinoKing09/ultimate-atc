import { otherEnd } from '../core/airport/airport';
import type { Compass } from '../core/airport/types';
import type { Aircraft } from '../core/aircraft';
import { distance, headingDiff, headingOf, sub, type Vec2 } from '../core/geo';
import { formatCommand } from '../core/phraseology/format';
import { parseTransmission } from '../core/phraseology/parser';
import { previewTaxi } from '../core/pilot';
import type { RadioMessage } from '../core/radio';
import type { Simulation } from '../core/simulation';
import { REPO_URL, showAtisEditor, showHelp } from './dialogs';
import { formatTime, h } from './dom';
import { arrivalList, departureList, type TrafficList } from './lists';
import { PopupMenu, type MenuItem } from './menu';
import { Scope, type TagItem } from './scope';
import { saveSettings, type Settings } from './settings';
import { PilotVoices, VoiceInput } from './voice';

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
  private readonly lists: TrafficList[];
  private readonly messagesEl: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly targetEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly fields: Record<string, HTMLElement> = {};
  private readonly speedButtons: HTMLButtonElement[] = [];
  private readonly pauseButton: HTMLButtonElement;
  private readonly micButton: HTMLButtonElement;
  private readonly ttsButton: HTMLButtonElement;
  private readonly main: HTMLElement;
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
    this.ttsButton.addEventListener('click', () => this.setTts(!this.voices.enabled));
    const routesBtn = h('button', { text: 'ROUTES', title: 'Show the cleared routes of all aircraft on your frequency' });
    routesBtn.addEventListener('click', () => {
      this.scope.showAllRoutes = !this.scope.showAllRoutes;
      routesBtn.classList.toggle('active', this.scope.showAllRoutes);
      this.settings.showRoutes = this.scope.showAllRoutes;
      saveSettings(this.settings);
    });
    const rotBtn = h('button', { text: 'ROT', title: 'Rotate the scope: runway horizontal (like the aerodrome chart) / north up' });
    rotBtn.addEventListener('click', () => {
      this.scope.setRotation(!this.scope.runwayAligned);
      rotBtn.classList.toggle('active', this.scope.runwayAligned);
      this.settings.runwayAligned = this.scope.runwayAligned;
      saveSettings(this.settings);
    });
    const helpBtn = h('button', { text: 'HELP', title: 'Phraseology and controls (F1)' });
    helpBtn.addEventListener('click', () => showHelp());
    const docsBtn = h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, h('button', { text: 'DOCS', type: 'button' }));
    const disconnect = h('button', { text: 'DISCONNECT', title: 'End the session' });
    disconnect.addEventListener('click', () => {
      if (confirm('Disconnect and end this session?')) location.reload();
    });

    const toolbar = h(
      'div.toolbar',
      {},
      h('span.brand', { text: 'ULTIMATE ATC' }),
      field('station', 'Your position'),
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
    this.main = h('div.main', {}, canvas);
    const listCb = {
      select: (cs: string) => this.select(cs),
      center: (cs: string) => {
        const ac = this.sim.find(cs);
        if (ac) this.scope.centerOn(ac.pos);
      },
      menu: (cs: string, x: number, y: number) => this.openMenu(cs, x, y),
    };
    this.lists = [departureList(listCb), arrivalList(listCb)];
    for (const l of this.lists) this.main.append(l.el);

    // ---------------------------------------------------------------- comms
    this.messagesEl = h('div.messages');
    this.targetEl = h('span.target');
    this.input = h('input', {
      type: 'text',
      placeholder: 'Type an instruction, e.g. "DLH5AB taxi to holding point A via L2, S" - F1 for help',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    this.previewEl = h('span.preview');
    this.micButton = h('button.mic', { text: 'MIC', title: 'Push-to-talk: hold the ^ / ` key, Right Ctrl or Insert (or click to start/stop)' });
    const sendBtn = h('button', { text: 'SEND', title: 'Transmit (Enter)' });
    sendBtn.addEventListener('click', () => this.submit());
    const comms = h('div.comms', {}, this.messagesEl, h('div.cmdline', {}, this.targetEl, this.input, this.previewEl, this.micButton, sendBtn));

    root.replaceChildren(toolbar, this.main, comms);

    this.scope = new Scope(canvas, sim, {
      onSelect: (cs) => this.select(cs),
      onContextMenu: (cs, x, y) => this.openMenu(cs, x, y),
      onTagItem: (cs, item, x, y) => this.onTagItem(cs, item, x, y),
    });
    this.scope.showAllRoutes = settings.showRoutes;
    routesBtn.classList.toggle('active', settings.showRoutes);
    this.scope.setRotation(settings.runwayAligned);
    rotBtn.classList.toggle('active', settings.runwayAligned);

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
        if (listening) this.voices.pause();
        else this.voices.resume();
        if (error && error !== 'aborted' && error !== 'no-speech') this.hint(`Speech recognition error: ${error}`);
      },
    );
    if (!this.voiceIn.supported) {
      this.micButton.disabled = true;
      this.micButton.title = 'Speech recognition is not supported by this browser (try Chrome or Edge)';
    }
    this.micButton.addEventListener('click', () => (this.voiceIn.listening ? this.voiceIn.stop() : this.voiceIn.start()));

    // ---------------------------------------------------------------- events
    sim.on('message', (m) => this.addMessage(m));
    sim.on('incident', (i) => this.toast(i.text));
    sim.on('aircraftRemoved', (a) => {
      if (a.callsign === this.selected) this.select(undefined);
    });
    for (const m of sim.messages) this.addMessage(m);
    this.input.addEventListener('input', () => this.updatePreview());
    this.input.addEventListener('keydown', (e) => this.onInputKey(e));
    window.addEventListener('keydown', (e) => this.onGlobalKey(e));
    window.addEventListener('keyup', (e) => {
      if (PTT_KEYS.has(e.code)) {
        e.preventDefault();
        this.voiceIn.stop();
      }
    });
    window.addEventListener('resize', () => this.scope.resize());
    new ResizeObserver(() => this.scope.resize()).observe(this.main);

    this.setSpeed(1);
    this.hint(`Connected as ${sim.station.callsign} (${sim.station.name}, ${sim.station.frequency}). Runway ${sim.runway} in use. Press F1 for help.`);
    requestAnimationFrame((t) => this.frame(t));
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
    const st = sim.station;
    this.fields.station.innerHTML = `<b>${st.callsign}</b> ${st.frequency}`;
    this.fields.rwy.innerHTML = `RWY <b>${sim.runway}</b>`;
    this.fields.atis.innerHTML = `ATIS <b>${sim.atisLetter}</b>`;
    const wind = sim.atis.wind;
    const tail = sim.windComponents(sim.runway).headwind < -5;
    this.fields.wind.innerHTML = `<b${tail ? ' class="bad"' : ''}>${String(wind.direction).padStart(3, '0')}/${String(wind.speedKt).padStart(2, '0')}</b>KT`;
    this.fields.wind.title = tail ? 'Tailwind above 5 kt on the runway in use - consider a runway change (click to edit the ATIS)' : 'Surface wind (click to edit the ATIS)';
    this.fields.qnh.innerHTML = `Q<b>${sim.atis.qnh}</b>`;
    this.fields.utc.innerHTML = `<b>${formatTime(sim.utc())}</b>Z`;
    const s = sim.stats;
    const bad = s.collisions + s.incursions + s.goArounds;
    this.fields.score.className = 'field score';
    this.fields.score.innerHTML = `SCORE <b>${s.score}</b> | DEP ${s.departuresHandedOff} | ARR ${s.arrivalsParked} | <span class="${bad ? 'bad' : ''}">INC ${bad}</span>`;
    this.targetEl.textContent = this.targetText();
  }

  private targetText(): string {
    const ac = this.sim.find(this.selected);
    return ac ? `[${ac.callsign} ${this.sim.tel(ac).toUpperCase()}]` : '';
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

  private setTts(on: boolean): void {
    this.voices.enabled = on;
    if (!on) this.voices.cancel();
    this.ttsButton.classList.toggle('active', on);
    this.settings.tts = on;
    saveSettings(this.settings);
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

  private submit(fromVoice = false): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.history.unshift(text);
    this.history = this.history.slice(0, 50);
    this.historyIdx = -1;
    this.transmit(text, fromVoice);
    this.input.value = '';
    this.updatePreview();
  }

  private transmit(text: string, fromVoice = false): void {
    const res = this.sim.transmit(text, this.selected, { fallbackToLastCaller: fromVoice });
    if (res.hint) this.hint(res.hint);
    if (res.callsign && this.sim.find(res.callsign)) this.select(res.callsign);
  }

  private onInputKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.submit();
    } else if (e.key === 'Escape') {
      if (this.input.value) this.input.value = '';
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
      showHelp();
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
    if (e.key === 'Home' && document.activeElement !== this.input) {
      this.scope.resetView();
      return;
    }
    if (e.key === 'Escape' && document.activeElement !== this.input) {
      this.menu.close();
      this.select(undefined);
      return;
    }
    if (document.activeElement !== this.input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.input.focus();
    }
  }

  private selectNextRequest(): void {
    const pending = this.sim.aircraft
      .filter((a) => a.request && this.sim.isOnMyFrequency(a))
      .sort((a, b) => a.requestSince - b.requestSince);
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
    const parsed = parseTransmission(text, {
      callsigns: this.sim.aircraft.map((a) => a.callsign),
      taxiways: this.sim.airport.taxiwayNames,
      selected: this.selected,
    });
    const ac = this.sim.find(parsed.callsign);
    if (!parsed.commands.length) {
      this.previewEl.textContent = parsed.unparsed.length ? `? ${parsed.unparsed.slice(0, 4).join(' ')}` : '';
      return;
    }
    let ok = !!ac;
    let msg = `${ac ? ac.callsign : parsed.callsign ?? '(no callsign)'}: ${parsed.commands.map(formatCommand).join(', ')}`;
    const taxi = parsed.commands.find((c) => c.type === 'taxi');
    if (ac && taxi && taxi.type === 'taxi' && (taxi.destination || taxi.via.length)) {
      const r = previewTaxi(this.sim, ac, taxi);
      if ('error' in r) {
        ok = false;
        msg += `  -- ${r.error}`;
      } else {
        this.scope.preview = { points: routePoints(ac, r.route.nodes.map((n) => n.pos), r.route.startPosition), ok: true };
      }
    }
    if (ac && !this.sim.isOnMyFrequency(ac)) {
      ok = false;
      msg += '  -- not on your frequency';
    }
    if (parsed.unparsed.length) msg += `  (ignored: ${parsed.unparsed.join(' ')})`;
    this.previewEl.textContent = msg;
    this.previewEl.classList.add(ok ? 'ok' : 'err');
  }

  /** Picks the speech recognition alternative that makes the most sense as an instruction. */
  private bestVoiceCandidate(candidates: string[]): string {
    const callsigns = this.sim.aircraft.map((a) => a.callsign);
    let best = candidates[0];
    let bestScore = -Infinity;
    candidates.forEach((text, i) => {
      const p = parseTransmission(text, { callsigns, taxiways: this.sim.airport.taxiwayNames, selected: this.selected });
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
    const ac = this.sim.find(cs);
    if (!ac) return;
    this.menu.open(`${ac.callsign}  ${ac.type.icao}  ${ac.category === 'departure' ? `> ${ac.flightPlan.destination}` : `< ${ac.flightPlan.departure}`}`, this.menuItems(ac), x, y);
  }

  private say(ac: Aircraft, phrase: string): void {
    this.transmit(`${ac.callsign} ${phrase}`);
  }

  private routeItem(ac: Aircraft, label: string, phraseDest: string, hint?: string): MenuItem {
    const cmd = parseTransmission(`taxi to ${phraseDest}`, { callsigns: [], taxiways: this.sim.airport.taxiwayNames }).commands[0];
    const r = cmd && cmd.type === 'taxi' ? previewTaxi(this.sim, ac, cmd) : { error: 'invalid' };
    if ('error' in r) return { label, hint: r.error, disabled: true };
    const via = r.route.taxiways.filter((t) => this.sim.airport.taxiwayNames.has(t.toUpperCase()));
    const destText = r.dest.kind === 'holdingPoint' ? `holding point ${r.dest.name}` : phraseDest;
    return {
      label,
      hint: hint ?? `via ${via.join(' ')}`,
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

    if (!sim.isOnMyFrequency(ac)) {
      items.push({ label: `On ${ac.frequency} frequency - not yours`, disabled: true }, { divider: true, label: '' }, center, resetTag);
      return items;
    }

    const rwy = sim.runway;
    const tower = sim.airport.station('TWR');

    if (ac.phase === 'parked' && ac.category === 'departure') {
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
    } else if (ac.onGround && ['pushback', 'startup', 'taxi', 'holding'].includes(ac.phase)) {
      if (ac.category === 'arrival' || ac.returnToStand) {
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
      const near = sim.aircraft
        .filter((o) => o !== ac && o.onGround && o.phase !== 'parked' && o.phase !== 'arrived' && distance(o.pos, ac.pos) < 800)
        .sort((a, b) => distance(a.pos, ac.pos) - distance(b.pos, ac.pos))
        .slice(0, 8);
      items.push({
        label: 'Give way to',
        disabled: !near.length,
        submenu: () => near.map((o) => ({ label: o.callsign, hint: `${Math.round(distance(o.pos, ac.pos))} m`, action: () => this.say(ac, `give way to ${o.callsign}`) })),
      });
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
      const what = ac.request === 'pushback' ? 'pushback' : ac.request === 'handoff' ? 'departure' : 'taxi';
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

  private standDestinations(ac: Aircraft): MenuItem[] {
    const sim = this.sim;
    const items: MenuItem[] = [];
    if (ac.assignedStand) items.push(this.routeItem(ac, `Stand ${ac.assignedStand}`, `stand ${ac.assignedStand}`, 'assigned'));
    const free = sim
      .freeStands(ac.type.wingspanM, (s) => s.id !== ac.assignedStand)
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
