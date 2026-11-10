import type { Aircraft } from '../core/aircraft';
import { KT_TO_MS, M_PER_NM, add, headingVector, length, scale, sub, type Vec2 } from '../core/geo';
import { assignedHeading, assignedLevel, finalCoordinates, headingText, inConflict, offered, toMagnetic, windAloft } from '../core/radar';
import type { Simulation } from '../core/simulation';
import type { ScopeStyle } from './scope';

/**
 * The radar scope of the Approach / Departure position, after the EuroScope radar display: a dark screen with the
 * navaids and fixes, the extended runway centre lines with mile ticks, range rings, the targets with their history
 * trail and one-minute speed vector, and the data tags (callsign; level, trend and cleared level; ground speed,
 * assigned heading or next fix and the approach clearance). The radar picture updates once per sweep (4 s), like
 * a real radar. Clicking a tag item opens its function (level, heading, speed, route), right click the aircraft menu.
 */

/** Clickable items of a radar tag. */
export type RadarTagItem = 'callsign' | 'level' | 'heading' | 'speed' | 'route' | 'approach';

export interface RadarScopeCallbacks {
  onSelect(callsign: string | undefined): void;
  onContextMenu(callsign: string, clientX: number, clientY: number): void;
  onTagItem(callsign: string, item: RadarTagItem, clientX: number, clientY: number): void;
}

interface RadarTheme {
  background: string;
  ring: string;
  centreline: string;
  runway: string;
  fix: string;
  fixLabel: string;
  vor: string;
  holding: string;
  boundary: string;
  /** Tags: assumed (on your frequency), incoming (first call not answered), others. */
  assumed: string;
  incoming: string;
  other: string;
  history: string;
  stca: string;
  emergency: string;
  selected: string;
  text: string;
  /** Routes of the selected aircraft. */
  route: string;
}

/** EuroScope-like: dark grey screen, grey maps, white assumed tracks, green-grey others. */
const ES_DARK: RadarTheme = {
  background: 'rgb(30, 35, 40)',
  ring: 'rgba(120, 130, 140, 0.18)',
  centreline: 'rgba(150, 160, 170, 0.55)',
  runway: 'rgb(200, 200, 200)',
  fix: 'rgba(140, 150, 160, 0.75)',
  fixLabel: 'rgba(150, 160, 170, 0.75)',
  vor: 'rgba(120, 170, 200, 0.85)',
  holding: 'rgba(120, 130, 140, 0.4)',
  boundary: 'rgba(110, 140, 110, 0.45)',
  assumed: 'rgb(235, 235, 235)',
  incoming: 'rgb(255, 210, 90)',
  other: 'rgb(120, 170, 120)',
  history: 'rgba(180, 190, 200, 0.6)',
  stca: 'rgb(255, 70, 70)',
  emergency: 'rgb(255, 92, 240)',
  selected: 'rgb(111, 227, 255)',
  text: 'rgb(170, 180, 190)',
  route: 'rgba(245, 245, 245, 0.9)',
};

/** Day palette (for the PHX day / map styles): light grey screen. */
const ES_DAY: RadarTheme = {
  ...ES_DARK,
  background: 'rgb(196, 202, 206)',
  ring: 'rgba(70, 80, 90, 0.18)',
  centreline: 'rgba(60, 70, 80, 0.6)',
  runway: 'rgb(40, 40, 40)',
  fix: 'rgba(60, 70, 80, 0.8)',
  fixLabel: 'rgba(50, 60, 70, 0.85)',
  vor: 'rgba(20, 80, 130, 0.9)',
  holding: 'rgba(60, 70, 80, 0.4)',
  boundary: 'rgba(40, 100, 40, 0.5)',
  assumed: 'rgb(10, 10, 10)',
  incoming: 'rgb(170, 90, 0)',
  other: 'rgb(40, 100, 40)',
  history: 'rgba(40, 50, 60, 0.6)',
  selected: 'rgb(0, 90, 160)',
  text: 'rgb(40, 50, 60)',
  route: 'rgba(20, 20, 20, 0.85)',
};

/** Phosphor (green tube). */
const PHOSPHOR: RadarTheme = {
  ...ES_DARK,
  background: 'rgb(4, 14, 8)',
  ring: 'rgba(60, 200, 90, 0.15)',
  centreline: 'rgba(80, 220, 110, 0.5)',
  runway: 'rgb(120, 255, 150)',
  fix: 'rgba(80, 220, 110, 0.6)',
  fixLabel: 'rgba(80, 220, 110, 0.65)',
  vor: 'rgba(120, 255, 150, 0.8)',
  holding: 'rgba(80, 220, 110, 0.3)',
  boundary: 'rgba(80, 220, 110, 0.35)',
  assumed: 'rgb(170, 255, 180)',
  incoming: 'rgb(230, 255, 120)',
  other: 'rgb(60, 160, 80)',
  history: 'rgba(120, 255, 150, 0.5)',
  text: 'rgb(120, 220, 140)',
  route: 'rgba(200, 255, 210, 0.9)',
};

/** Radar sweep: the targets move on the screen once per sweep (s). */
const SWEEP_S = 4;
/** History trail: positions of the last sweeps. */
const HISTORY_DOTS = 6;
/** Speed vector length (s). */
const VECTOR_S = 60;
/** Extended centre line length (NM). */
const CENTRELINE_NM = 18;

interface TagRect {
  callsign: string;
  x: number;
  y: number;
  w: number;
  h: number;
  items: { item: RadarTagItem; x: number; y: number; w: number; h: number }[];
}

export class RadarScope {
  private cx = 0;
  private cy = 0;
  /** Pixels per metre. */
  private zoom = 0.004;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly ctx: CanvasRenderingContext2D;
  private t: RadarTheme = ES_DARK;
  private tagRects: TagRect[] = [];
  private symbolHits: { callsign: string; x: number; y: number }[] = [];
  /** Positions shown (updated once per sweep) and the trail of each target. */
  private readonly shown = new Map<string, { pos: Vec2; heading: number; trail: Vec2[] }>();
  private lastSweep = -Infinity;
  private hover?: { callsign: string; item?: RadarTagItem };
  private mouse?: Vec2;
  private drag?: { mode: 'pan' | 'tag'; callsign?: string; item?: RadarTagItem; lastX: number; lastY: number; moved: boolean; clientX: number; clientY: number; wasSelected: boolean };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist?: number;
  private longPress?: ReturnType<typeof setTimeout>;
  /** Measuring tool: from a point or an aircraft (callsign) to the mouse, or to a pinned point. */
  private measure?: { from: Vec2 | string; to?: Vec2 };
  /** Tag offsets (screen pixels) per callsign - the radar tags are placed independently of the ground scope. */
  private readonly offsets = new Map<string, Vec2>();
  /** The place each tag was put automatically (see autoOffset). */
  private readonly autoSlot = new Map<string, number>();
  /** Aircraft whose route stays drawn (menu "Show route"). */
  private readonly routesShown = new Set<string>();

  selected?: string;
  touchMode = false;
  tagScale = 1;
  // Members of the ground scope's interface that do not apply to the radar.
  preview?: { points: Vec2[]; ok: boolean };
  showAllRoutes = true;
  compactTags = true;
  manualStrips = false;
  statusStyle: 'phx' | 'euroscope' = 'euroscope';
  readonly isPhx = false;
  readonly effect: 'phosphor' | 'vignette' | undefined = undefined;
  private style: ScopeStyle = 'phx-night';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
    private readonly cb: RadarScopeCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.bindEvents();
    this.resize();
    this.resetView();
  }

  // ------------------------------------------------------------------ view

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = r.width;
    this.height = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
  }

  /** The radar is always north-up. */
  setRotation(_runwayAligned: boolean): void {}

  get runwayAligned(): boolean {
    return false;
  }

  setStyle(style: ScopeStyle): void {
    this.style = style;
    this.t = style === 'phx-day' || style === 'map' ? ES_DAY : style === 'phosphor' ? PHOSPHOR : ES_DARK;
  }

  get scopeStyle(): ScopeStyle {
    return this.style;
  }

  /** About 70 NM across: the whole terminal area. */
  resetView(): void {
    this.cx = 0;
    this.cy = 0;
    const span = 64 * M_PER_NM;
    this.zoom = Math.min(this.width, this.height) / span || 0.004;
  }

  centerOn(p: Vec2): void {
    this.cx = p.x;
    this.cy = p.y;
  }

  panBy(dx: number, dy: number): void {
    this.cx -= dx / this.zoom;
    this.cy += dy / this.zoom;
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(0.08, Math.max(0.0008, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  toScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.cx) * this.zoom + this.width / 2, y: this.height / 2 - (p.y - this.cy) * this.zoom };
  }

  toWorld(sx: number, sy: number): Vec2 {
    return { x: this.cx + (sx - this.width / 2) / this.zoom, y: this.cy + (this.height / 2 - sy) / this.zoom };
  }

  // ------------------------------------------------------------------ input

  private hitTest(sx: number, sy: number): { callsign: string; item?: RadarTagItem; tag: boolean } | undefined {
    for (let i = this.tagRects.length - 1; i >= 0; i--) {
      const t = this.tagRects[i];
      if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h) {
        const it = t.items.find((r) => sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h);
        return { callsign: t.callsign, item: it?.item, tag: true };
      }
    }
    const r = this.touchMode ? 22 : 10;
    let best: { callsign: string; d: number } | undefined;
    for (const s of this.symbolHits) {
      const d = Math.hypot(sx - s.x, sy - s.y);
      if (d <= r && (!best || d < best.d)) best = { callsign: s.callsign, d };
    }
    return best ? { callsign: best.callsign, tag: false } : undefined;
  }

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) c.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
    c.addEventListener('pointerdown', (e) => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      this.pointers.set(e.pointerId, { x: sx, y: sy });
      c.setPointerCapture(e.pointerId);
      clearTimeout(this.longPress);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.drag = undefined;
        return;
      }
      const hit = this.hitTest(sx, sy);
      if (e.button === 2) {
        if (hit) {
          this.cb.onSelect(hit.callsign);
          this.cb.onContextMenu(hit.callsign, e.clientX, e.clientY);
        } else this.drag = { mode: 'pan', lastX: sx, lastY: sy, moved: false, clientX: e.clientX, clientY: e.clientY, wasSelected: false };
        return;
      }
      if (hit) {
        const wasSelected = this.selected === hit.callsign;
        this.cb.onSelect(hit.callsign);
        this.drag = { mode: 'tag', callsign: hit.callsign, item: hit.item, lastX: sx, lastY: sy, moved: false, clientX: e.clientX, clientY: e.clientY, wasSelected };
        if (this.touchMode) {
          this.longPress = setTimeout(() => {
            if (this.drag?.moved) return;
            this.drag = undefined;
            this.cb.onContextMenu(hit.callsign, e.clientX, e.clientY);
          }, 550);
        }
      } else this.drag = { mode: 'pan', lastX: sx, lastY: sy, moved: false, clientX: e.clientX, clientY: e.clientY, wasSelected: false };
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      this.mouse = { x: sx, y: sy };
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy });
      if (this.pointers.size === 2 && this.pinchDist) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomBy(d / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinchDist = d;
        return;
      }
      if (e.pointerType !== 'touch') {
        const h = this.hitTest(sx, sy);
        this.hover = h ? { callsign: h.callsign, item: h.item } : undefined;
        c.style.cursor = h ? 'pointer' : 'crosshair';
      }
      const d = this.drag;
      if (!d) return;
      const dx = sx - d.lastX;
      const dy = sy - d.lastY;
      if (Math.abs(dx) + Math.abs(dy) > (this.touchMode ? 6 : 2)) {
        d.moved = true;
        clearTimeout(this.longPress);
      }
      d.lastX = sx;
      d.lastY = sy;
      if (d.mode === 'pan' || (d.mode === 'tag' && !this.offsets.has(d.callsign!) && !d.item && this.touchMode)) this.panBy(dx, dy);
      else if (d.callsign) {
        const off = this.offsets.get(d.callsign) ?? DEFAULT_OFFSET;
        this.offsets.set(d.callsign, { x: off.x + dx, y: off.y + dy });
      }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pinchDist !== undefined && this.pointers.size < 2) {
        this.pinchDist = undefined;
        this.drag = undefined;
        return;
      }
      clearTimeout(this.longPress);
      const d = this.drag;
      if (d && d.mode === 'pan' && !d.moved && e.button === 0) this.cb.onSelect(undefined);
      if (d && d.mode === 'tag' && !d.moved && d.callsign && (!this.touchMode || d.wasSelected)) {
        if (d.item) this.cb.onTagItem(d.callsign, d.item, d.clientX, d.clientY);
        else if (this.touchMode) this.cb.onContextMenu(d.callsign, d.clientX, d.clientY);
      }
      this.drag = undefined;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => (this.mouse = undefined));
    // Measuring tool (EuroScope: double click): from a point or an aircraft to the mouse; a second double click
    // pins the end, a third one (or Escape) removes it.
    c.addEventListener('dblclick', (e) => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (this.measure && !this.measure.to) {
        this.measure.to = this.toWorld(sx, sy);
        return;
      }
      const hit = this.hitTest(sx, sy);
      this.measure = this.measure?.to && !hit ? undefined : { from: hit ? hit.callsign : this.toWorld(sx, sy) };
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.measure = undefined;
    });
  }

  // ------------------------------------------------------------------ drawing

  render(now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.t.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.sweep();
    this.drawMap();
    this.tagRects = [];
    this.symbolHits = [];
    const list = this.sim.aircraft.filter((a) => this.shown.has(a.callsign));
    list.sort((a, b) => (a.callsign === this.selected ? 1 : 0) - (b.callsign === this.selected ? 1 : 0));
    for (const ac of list) this.drawTarget(ac, this.colorOf(ac, now));
    for (const ac of list) this.drawTag(ac, this.colorOf(ac, now));
    this.drawMeasure();
    this.drawInfo();
  }

  /** Bearing (magnetic), distance and - from an aircraft - the flying time at its ground speed. */
  private drawMeasure(): void {
    const m = this.measure;
    if (!m) return;
    const ac = typeof m.from === 'string' ? this.sim.find(m.from) : undefined;
    const from = typeof m.from === 'string' ? (this.shown.get(m.from)?.pos ?? ac?.pos) : m.from;
    const to = m.to ?? (this.mouse ? this.toWorld(this.mouse.x, this.mouse.y) : undefined);
    if (!from || !to) {
      if (typeof m.from === 'string' && !ac) this.measure = undefined;
      return;
    }
    const ctx = this.ctx;
    const a = this.toScreen(from);
    const b = this.toScreen(to);
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const brg = toMagnetic(this.sim, (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI);
    let text = `${headingText(brg)}\u00b0 ${(d / M_PER_NM).toFixed(1)}NM`;
    if (ac && ac.speed > 1) {
      const s = d / ac.speed;
      text += ` ${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    }
    ctx.save();
    ctx.strokeStyle = this.t.selected;
    ctx.fillStyle = this.t.selected;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.font = `${Math.round(11 * this.tagScale)}px Consolas, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, b.x + 8, b.y - 4);
    ctx.restore();
  }

  /** Once per sweep: the targets jump to their new positions, the old ones become the history trail. */
  private sweep(): void {
    const t = this.sim.time;
    if (t - this.lastSweep < SWEEP_S && t >= this.lastSweep) return;
    this.lastSweep = t;
    const seen = new Set<string>();
    for (const ac of this.sim.aircraft) {
      // Airborne targets only (the radar does not see the aircraft on the ground) - and the take-off roll.
      if (ac.phase === 'gone' || (ac.onGround && !(ac.phase === 'takeoff' && ac.speed > 50 * KT_TO_MS))) continue;
      seen.add(ac.callsign);
      const prev = this.shown.get(ac.callsign);
      const trail = prev ? [...prev.trail, prev.pos].slice(-HISTORY_DOTS) : [];
      this.shown.set(ac.callsign, { pos: { ...ac.pos }, heading: ac.radar?.track ?? ac.heading, trail });
    }
    for (const cs of [...this.shown.keys()]) if (!seen.has(cs)) this.shown.delete(cs);
  }

  private drawMap(): void {
    const ctx = this.ctx;
    const sim = this.sim;
    const as = sim.airspace;
    const centre = this.toScreen({ x: 0, y: 0 });
    // Range rings every 10 NM.
    ctx.strokeStyle = this.t.ring;
    ctx.lineWidth = 1;
    for (let nm = 10; nm <= 60; nm += 10) {
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, nm * M_PER_NM * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Your airspace (approximate: a circle of its radius).
    if (as) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = this.t.boundary;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, as.data.radiusNm * M_PER_NM * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Runways and the extended centre lines of the runways in use, with a tick every mile (long ones every 5 NM).
    for (const rw of sim.config.airport.runways) {
      const a = sim.airport.runwayEnd(rw.ends[0].name);
      const b = sim.airport.runwayEnd(rw.ends[1].name);
      if (!a || !b) continue;
      const pa = this.toScreen(a.threshold);
      const pb = this.toScreen(b.threshold);
      ctx.strokeStyle = this.t.runway;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const r of sim.arrivalRunways) {
      const end = sim.airport.runwayEnd(r);
      if (!end) continue;
      const back = headingVector(end.heading + 180);
      const side = headingVector(end.heading + 90);
      const p0 = this.toScreen(end.threshold);
      const p1 = this.toScreen(add(end.threshold, scale(back, CENTRELINE_NM * M_PER_NM)));
      ctx.strokeStyle = this.t.centreline;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      for (let nm = 1; nm <= CENTRELINE_NM; nm++) {
        const len = (nm % 5 === 0 ? 0.6 : 0.25) * M_PER_NM;
        const c0 = add(end.threshold, scale(back, nm * M_PER_NM));
        const s0 = this.toScreen(add(c0, scale(side, len)));
        const s1 = this.toScreen(add(c0, scale(side, -len)));
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
      }
      ctx.stroke();
      this.label(`${r}`, p1.x + 4, p1.y, this.t.fixLabel);
    }
    if (!as) return;
    // Holdings (racetracks, simplified).
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = this.t.holding;
    for (const h of as.holdings) {
      const fix = as.fix(h.fix);
      if (!fix) continue;
      const inbound = h.inboundCourse + sim.config.airport.magneticVariation;
      const leg = 3.7 * M_PER_NM;
      const width = (h.turn === 'right' ? 1 : -1) * 2.4 * M_PER_NM;
      const back = headingVector(inbound + 180);
      const side = headingVector(inbound + 90);
      const p = [fix, add(fix, scale(side, width)), add(add(fix, scale(side, width)), scale(back, leg)), add(fix, scale(back, leg))].map((q) => this.toScreen(q));
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      ctx.lineTo(p[3].x, p[3].y);
      ctx.moveTo(p[1].x, p[1].y);
      ctx.lineTo(p[2].x, p[2].y);
      ctx.stroke();
    }
    ctx.restore();
    // Navaids (hexagon) and fixes (triangle) with their names.
    ctx.font = `${Math.round(10 * this.tagScale)}px Consolas, Menlo, monospace`;
    const placed: Vec2[] = [];
    // Navaids first: a fix right next to one already drawn keeps its symbol but not its name.
    // RNAV waypoints (DS531 ...) only on a route that is shown, like in EuroScope's sector file.
    const fixes = [...as.fixes].filter(([, f]) => f.kind !== 'rnav').sort((a, b) => (a[1].kind === 'fix' ? 1 : 0) - (b[1].kind === 'fix' ? 1 : 0));
    for (const [name, f] of fixes) {
      const p = this.toScreen(f.pos);
      if (p.x < -40 || p.y < -40 || p.x > this.width + 40 || p.y > this.height + 40) continue;
      const crowded = placed.some((q) => Math.abs(q.x - p.x) < 34 && Math.abs(q.y - p.y) < 12);
      placed.push(p);
      ctx.strokeStyle = f.kind === 'fix' ? this.t.fix : this.t.vor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (f.kind === 'fix') {
        ctx.moveTo(p.x, p.y - 4);
        ctx.lineTo(p.x + 4, p.y + 3);
        ctx.lineTo(p.x - 4, p.y + 3);
        ctx.closePath();
      } else {
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const q = { x: p.x + 5 * Math.cos(a), y: p.y + 5 * Math.sin(a) };
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        }
        ctx.closePath();
      }
      ctx.stroke();
      if (!crowded) this.label(name, p.x + 6, p.y - 8, this.t.fixLabel);
    }
  }

  private label(text: string, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  /** Tag colour: STCA red (flashing), emergency, assumed (yours), incoming (first call), others. */
  private colorOf(ac: Aircraft, now: number): string {
    const blink = Math.floor(now / 500) % 2 === 0;
    if (inConflict(this.sim, ac.callsign)) return blink ? this.t.stca : this.t.assumed;
    if (ac.emergency) return this.t.emergency;
    // Center offers the track (EuroScope: transfer to me): it flashes until you assume it.
    if (offered(ac)) return blink ? this.t.incoming : this.t.other;
    const mine = this.sim.isOnMyFrequency(ac) && ac.frequency === 'APP';
    if (mine && ac.request && !ac.requestAck) return blink ? this.t.incoming : this.t.assumed;
    if (mine) return this.t.assumed;
    return this.t.other;
  }

  private drawTarget(ac: Aircraft, color: string): void {
    const ctx = this.ctx;
    const s = this.shown.get(ac.callsign)!;
    const p = this.toScreen(s.pos);
    const mine = ac.frequency === 'APP' && this.sim.isOnMyFrequency(ac);
    // History trail.
    ctx.fillStyle = this.t.history;
    for (const q of s.trail) {
      const d = this.toScreen(q);
      ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
    }
    // Position symbol: a square for your tracks (assumed), a diamond for the others.
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (mine) ctx.rect(p.x - 4, p.y - 4, 8, 8);
    else {
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x + 5, p.y);
      ctx.lineTo(p.x, p.y + 5);
      ctx.lineTo(p.x - 5, p.y);
      ctx.closePath();
    }
    ctx.stroke();
    // One-minute speed vector.
    const ahead = this.toScreen(add(s.pos, scale(headingVector(s.heading), ac.speed * VECTOR_S)));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(ahead.x, ahead.y);
    ctx.stroke();
    if (ac.callsign === this.selected) {
      ctx.strokeStyle = this.t.selected;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (ac.callsign === this.selected || this.routesShown.has(ac.callsign)) this.drawRoute(ac, p);
    this.symbolHits.push({ callsign: ac.callsign, x: p.x, y: p.y });
  }

  /**
   * The route the aircraft flies (EuroScope "show route"): white lines from the target through every fix still ahead -
   * SID, STAR, RNAV transition or direct-to - with the fix names; a holding fix with its racetrack sign.
   */
  private drawRoute(ac: Aircraft, from: Vec2): void {
    const r = ac.radar;
    const as = this.sim.airspace;
    if (!r || !as) return;
    const names = r.hold ? [r.hold.fix] : r.route;
    if (!names.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.t.route;
    ctx.fillStyle = this.t.route;
    ctx.lineWidth = 1;
    // On vectors the route is no longer flown: dashed (where it would go when cleared back on it).
    if (r.heading !== undefined) ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const pts: { name: string; p: Vec2 }[] = [];
    for (const n of names) {
      const f = as.fix(n);
      if (!f) continue;
      const q = this.toScreen(f);
      ctx.lineTo(q.x, q.y);
      pts.push({ name: n, p: q });
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${Math.round(10 * this.tagScale)}px Consolas, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const { name, p } of pts) {
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.fillText(name, p.x + 5, p.y + 3);
    }
    if (r.transition && pts.length) ctx.fillText(r.transition, pts[pts.length - 1].p.x + 5, pts[pts.length - 1].p.y + 14);
    ctx.restore();
  }

  /**
   * Where a tag you have not moved goes: the first of six places around the target that covers no other tag and no
   * other target - it keeps its place while that stays free, so the tags do not jump around.
   */
  private autoOffset(callsign: string, p: Vec2, w: number, h: number): Vec2 {
    const slots: Vec2[] = [
      { x: 18, y: -38 },
      { x: 18, y: 14 },
      { x: -w - 18, y: -38 },
      { x: -w - 18, y: 14 },
      { x: 18, y: -38 - h },
      { x: -w - 18, y: -38 - h },
    ];
    const free = (o: Vec2) => {
      const x = p.x + o.x;
      const y = p.y + o.y;
      if (this.tagRects.some((t) => t.callsign !== callsign && x < t.x + t.w + 2 && x + w + 2 > t.x && y < t.y + t.h + 2 && y + h + 2 > t.y)) return false;
      return !this.symbolHits.some((s) => s.callsign !== callsign && s.x > x - 6 && s.x < x + w + 6 && s.y > y - 6 && s.y < y + h + 6);
    };
    const kept = this.autoSlot.get(callsign) ?? 0;
    const order = [kept, ...slots.map((_, i) => i).filter((i) => i !== kept)];
    const pick = order.find((i) => free(slots[i])) ?? kept;
    this.autoSlot.set(callsign, pick);
    return slots[pick];
  }

  /** Shows (or hides) the route of an aircraft also when it is not selected. */
  toggleRoute(callsign: string): void {
    if (this.routesShown.has(callsign)) this.routesShown.delete(callsign);
    else this.routesShown.add(callsign);
  }

  /** Back to the default tag position. */
  resetTag(callsign: string): void {
    this.offsets.delete(callsign);
  }

  routeShown(callsign: string): boolean {
    return this.routesShown.has(callsign);
  }

  /** Data tag (EuroScope style): callsign / level, trend, cleared level / speed, heading or fix, approach. */
  private drawTag(ac: Aircraft, color: string): void {
    const ctx = this.ctx;
    const s = this.shown.get(ac.callsign)!;
    const p = this.toScreen(s.pos);
    const r = ac.radar;
    const mine = ac.frequency === 'APP' && this.sim.isOnMyFrequency(ac);
    const detailed = ac.callsign === this.selected || this.hover?.callsign === ac.callsign;
    // Tag families (EuroScope): the full tag for your tracks and those offered to you, a short one (callsign, level,
    // speed) for the others, the detailed one with a fourth line for the selected or hovered track.
    const concerned = mine || offered(ac) || detailed;
    type Part = { text: string; item?: RadarTagItem; color?: string };
    const lines: Part[][] = [];
    const head: Part[] = [{ text: ac.callsign, item: 'callsign' }];
    if (ac.emergency) head.push({ text: ' PAN', color: this.t.emergency });
    if (mine && ac.request && !ac.requestAck) head.push({ text: ac.request === 'checkIn' ? ' C/I' : ' *' });
    if (offered(ac)) head.push({ text: ' H/O' });
    // Your transfer to the next controller: ">TWR" while it is offered, "TWR" (accepted) when you can send the crew over.
    if (mine && r?.transfer) head.push({ text: r.transfer.acceptedAt === undefined ? ` >${r.transfer.to}` : ` ${r.transfer.to}`, color: r.transfer.acceptedAt === undefined ? this.t.incoming : this.t.other });
    lines.push(head);
    const alt = String(Math.round(ac.altitudeFt / 100)).padStart(3, '0');
    const trend = ac.verticalSpeedFpm > 300 ? '↑' : ac.verticalSpeedFpm < -300 ? '↓' : ' ';
    // On the final approach the cleared level no longer applies: the approach clearance takes it down.
    const cfl = ac.phase === 'approach' ? 'APP' : r ? String(Math.round(assignedLevel(r) / 100)).padStart(3, '0') : '';
    const gs = String(Math.round(ac.speed / KT_TO_MS)).padStart(3, '0');
    if (!concerned) lines.push([{ text: `${alt}${trend} ${gs}` }]);
    else lines.push([{ text: `${alt}${trend}${cfl}`, item: 'level' }]);
    const third: Part[] = [{ text: r?.speedKt !== undefined ? `S${r.speedKt}` : gs, item: 'speed' }, { text: ' ' }];
    const hdg = r ? assignedHeading(r) : undefined;
    if (hdg !== undefined) third.push({ text: `H${headingText(hdg)}`, item: 'heading' });
    else if (r?.hold) third.push({ text: `HLD ${r.hold.fix}`, item: 'route' });
    else if (r?.route[0]) third.push({ text: r.route[0], item: 'route' });
    else if (ac.phase === 'approach' || r?.locCaptured) third.push({ text: `LOC${ac.runway ?? ''}`, item: 'heading' });
    // Own navigation (no assigned heading, no fix): nothing assigned.
    else third.push({ text: 'H---', item: 'heading' });
    if (r?.approach) third.push({ text: ` ${r.approach.kind === 'ILS' ? 'I' : r.approach.kind === 'LOC' ? 'L' : 'R'}${r.approach.runway}`, item: 'approach' });
    if (concerned) lines.push(third);
    // Selected or hovered: type and wake, squawk, destination / SID and the distance to the threshold on final.
    if (detailed) {
      const extra = ac.category === 'departure' ? (ac.flightPlan.sid ?? ac.flightPlan.destination) : ac.flightPlan.departure;
      const end = ac.runway ? this.sim.airport.runwayEnd(ac.runway) : undefined;
      const fin = end && ac.category === 'arrival' && (ac.phase === 'approach' || r?.locCaptured) ? ` ${(-finalCoordinates(end, ac.pos).along / M_PER_NM).toFixed(1)}NM` : '';
      lines.push([{ text: `${ac.type.icao}/${ac.type.wake} ${ac.flightPlan.squawk} ${extra}${fin}` }]);
    }
    const k = this.tagScale;
    ctx.font = `${Math.round(11 * k)}px Consolas, Menlo, monospace`;
    const lh = Math.round(12 * k);
    const w = Math.max(...lines.map((l) => ctx.measureText(l.map((x) => x.text).join('')).width)) + 4;
    const h = lines.length * lh + 2;
    const off = this.offsets.get(ac.callsign) ?? this.autoOffset(ac.callsign, p, w, h);
    const tx = p.x + off.x;
    const ty = p.y + off.y;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(Math.min(Math.max(p.x, tx), tx + w), Math.min(Math.max(p.y, ty), ty + h));
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (ac.callsign === this.selected) {
      ctx.fillStyle = 'rgba(111, 227, 255, 0.10)';
      ctx.fillRect(tx, ty, w, h);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const items: TagRect['items'] = [];
    lines.forEach((parts, i) => {
      let x = tx + 2;
      const y = ty + 1 + i * lh;
      for (const part of parts) {
        const pw = ctx.measureText(part.text).width;
        if (this.hover?.callsign === ac.callsign && part.item && this.hover.item === part.item) {
          ctx.fillStyle = 'rgba(111, 227, 255, 0.25)';
          ctx.fillRect(x - 1, y - 1, pw + 2, lh);
        }
        ctx.fillStyle = part.color ?? color;
        ctx.fillText(part.text, x, y);
        if (part.item) items.push({ item: part.item, x: x - 1, y: y - 1, w: pw + 2, h: lh });
        x += pw;
      }
    });
    ctx.restore();
    this.tagRects.push({ callsign: ac.callsign, x: tx, y: ty, w, h, items });
  }

  /** Scale (NM) and the bearing / distance of the mouse from the airport (like EuroScope's status line). */
  private drawInfo(): void {
    const ctx = this.ctx;
    const nm = 10;
    const px = nm * M_PER_NM * this.zoom;
    const x = 12;
    const y = this.height - 14;
    ctx.strokeStyle = this.t.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.font = '10px Consolas, Menlo, monospace';
    ctx.fillStyle = this.t.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    let text = `${nm} NM`;
    if (this.mouse) {
      const w = this.toWorld(this.mouse.x, this.mouse.y);
      const d = Math.hypot(w.x, w.y) / M_PER_NM;
      const brg = toMagnetic(this.sim, (Math.atan2(w.x, w.y) * 180) / Math.PI);
      text += `   ${this.sim.config.airport.icao} ${headingText(brg)}° ${d.toFixed(1)} NM`;
    }
    // Wind aloft at 5000 ft and FL100 (drift on headings).
    const w5 = windAloft(this.sim, 5000);
    const w10 = windAloft(this.sim, 10000);
    const wt = (w: { direction: number; speedKt: number }) => `${headingText(toMagnetic(this.sim, w.direction))}/${Math.round(w.speedKt)}`;
    text += `   WIND A50 ${wt(w5)}  FL100 ${wt(w10)}`;
    ctx.fillText(text, x + px + 6, y + 2);
  }

  /** The aircraft ahead on the same final and the distance to it (NM), for the menu hint. */
  spacingAhead(ac: Aircraft): { callsign: string; nm: number } | undefined {
    const end = ac.runway ? this.sim.airport.runwayEnd(ac.runway) : undefined;
    if (!end) return undefined;
    const mine = -finalCoordinates(end, ac.pos).along;
    let best: { callsign: string; nm: number } | undefined;
    for (const o of this.sim.aircraft) {
      if (o === ac || o.runway !== ac.runway || o.onGround || o.category !== 'arrival') continue;
      const d = -finalCoordinates(end, o.pos).along;
      if (d < mine && d > 0) {
        const nm = length(sub(o.pos, ac.pos)) / M_PER_NM;
        if (!best || nm < best.nm) best = { callsign: o.callsign, nm };
      }
    }
    return best;
  }
}

const DEFAULT_OFFSET: Vec2 = { x: 18, y: -38 };
