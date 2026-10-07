import type { Aircraft } from '../core/aircraft';
import { KT_TO_MS, add, headingVector, scale, sub, type Vec2 } from '../core/geo';
import type { Simulation } from '../core/simulation';
import { clearedTo, statusCode } from './labels';

/**
 * The ground radar scope: draws the aerodrome chart, aircraft symbols and
 * data tags, and handles panning, zooming, selection and tag dragging.
 */

const C = {
  background: '#26343a',
  apron: '#36444a',
  taxiway: '#4a5a60',
  taxiwayEdge: '#58696f',
  centreline: 'rgba(214, 190, 70, 0.55)',
  standLine: 'rgba(214, 190, 70, 0.35)',
  runway: '#17191a',
  runwayMark: '#d9dcdc',
  building: '#5b5249',
  buildingEdge: '#7c7064',
  holdBar: '#e0b52a',
  label: '#e3c548',
  labelBg: 'rgba(20, 24, 26, 0.85)',
  standLabel: '#93a6ab',
  route: 'rgba(111, 227, 255, 0.85)',
  routeOther: 'rgba(160, 190, 200, 0.45)',
  previewOk: 'rgba(123, 220, 143, 0.9)',
  previewErr: 'rgba(255, 90, 90, 0.9)',
  mine: '#e8f0f0',
  other: '#8d9ba1',
  request: '#ffcf4d',
  late: '#ff7b54',
  danger: '#ff5a5a',
  selected: '#6fe3ff',
};

export interface ScopeCallbacks {
  onSelect(callsign: string | undefined): void;
  onContextMenu(callsign: string, clientX: number, clientY: number): void;
}

interface TagRect {
  callsign: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Scope {
  /** View centre in local metres and zoom in pixels per metre. */
  private cx = 0;
  private cy = 0;
  private zoom = 0.3;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly ctx: CanvasRenderingContext2D;
  private tagRects: TagRect[] = [];
  private symbolHits: { callsign: string; x: number; y: number; r: number }[] = [];

  selected?: string;
  /** Route preview while the controller is typing a taxi instruction. */
  preview?: { points: Vec2[]; ok: boolean };
  showAllRoutes = true;

  private drag?: { mode: 'pan' | 'tag'; callsign?: string; lastX: number; lastY: number; moved: boolean };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist?: number;

  private readonly taxiwayLabels: { name: string; pos: Vec2 }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
    private readonly cb: ScopeCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.computeLabels();
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

  resetView(): void {
    const b = this.sim.airport.bounds();
    this.cx = (b.minX + b.maxX) / 2;
    this.cy = (b.minY + b.maxY) / 2;
    const w = b.maxX - b.minX + 300;
    const hgt = b.maxY - b.minY + 300;
    this.zoom = Math.min(this.width / w, this.height / hgt) || 0.3;
  }

  centerOn(p: Vec2): void {
    this.cx = p.x;
    this.cy = p.y;
    this.zoom = Math.max(this.zoom, 0.9);
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(12, Math.max(0.04, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  toScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.cx) * this.zoom + this.width / 2, y: this.height / 2 - (p.y - this.cy) * this.zoom };
  }

  toWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.width / 2) / this.zoom + this.cx, y: (this.height / 2 - sy) / this.zoom + this.cy };
  }

  // ------------------------------------------------------------------ input

  private hitTest(sx: number, sy: number): { callsign: string; kind: 'tag' | 'symbol' } | undefined {
    for (let i = this.tagRects.length - 1; i >= 0; i--) {
      const t = this.tagRects[i];
      if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h) return { callsign: t.callsign, kind: 'tag' };
    }
    let best: { callsign: string; d: number } | undefined;
    for (const s of this.symbolHits) {
      const d = Math.hypot(sx - s.x, sy - s.y);
      if (d <= s.r && (!best || d < best.d)) best = { callsign: s.callsign, d };
    }
    return best ? { callsign: best.callsign, kind: 'symbol' } : undefined;
  }

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
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
        } else {
          this.drag = { mode: 'pan', lastX: sx, lastY: sy, moved: false };
        }
        return;
      }
      if (hit?.kind === 'tag') {
        this.cb.onSelect(hit.callsign);
        this.drag = { mode: 'tag', callsign: hit.callsign, lastX: sx, lastY: sy, moved: false };
      } else if (hit) {
        this.cb.onSelect(hit.callsign);
      } else {
        this.drag = { mode: 'pan', lastX: sx, lastY: sy, moved: false };
      }
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy });
      if (this.pointers.size === 2 && this.pinchDist) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomBy(d / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinchDist = d;
        return;
      }
      const hover = this.hitTest(sx, sy);
      c.style.cursor = hover ? 'pointer' : this.drag?.mode === 'pan' ? 'grabbing' : 'crosshair';
      if (!this.drag) return;
      const dx = sx - this.drag.lastX;
      const dy = sy - this.drag.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
      this.drag.lastX = sx;
      this.drag.lastY = sy;
      if (this.drag.mode === 'pan') {
        this.cx -= dx / this.zoom;
        this.cy += dy / this.zoom;
      } else if (this.drag.callsign) {
        const ac = this.sim.find(this.drag.callsign);
        if (ac) {
          const off = ac.tagOffset ?? defaultTagOffset();
          ac.tagOffset = { x: off.x + dx, y: off.y + dy };
        }
      }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = undefined;
      if (this.drag && this.drag.mode === 'pan' && !this.drag.moved && e.button === 0) this.cb.onSelect(undefined);
      this.drag = undefined;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------ static chart

  private computeLabels(): void {
    const byName = new Map<string, { len: number; pos: Vec2 }>();
    for (const e of this.sim.airport.edges) {
      if (e.kind !== 'taxiway' && e.kind !== 'taxilane') continue;
      const cur = byName.get(e.name);
      if (!cur || e.length > cur.len) {
        byName.set(e.name, { len: e.length, pos: scale(add(e.from.pos, e.to.pos), 0.5) });
      }
    }
    for (const [name, v] of byName) this.taxiwayLabels.push({ name, pos: v.pos });
  }

  private drawChart(): void {
    const ctx = this.ctx;
    const ap = this.sim.airport;
    const z = this.zoom;

    const poly = (pts: Vec2[], fill: string, stroke?: string) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const s = this.toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    for (const a of ap.areas) poly(a.polygon, C.apron);

    // Runways
    for (const end of ap.runwayEnds.values()) {
      if (end.name > (ap.oppositeEnd(end.name)?.name ?? '')) continue; // draw each runway once
      const u = headingVector(end.heading);
      const n = { x: -u.y, y: u.x };
      const w = end.widthM / 2;
      const a = end.start;
      const b = end.farEnd;
      poly([add(a, scale(n, w)), add(b, scale(n, w)), sub(b, scale(n, w)), sub(a, scale(n, w))], C.runway);
    }

    // Taxiways (edges drawn as thick round lines)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const e of ap.edges) {
        if (e.kind === 'runway' || e.kind === 'stand') continue;
        const a = this.toScreen(e.from.pos);
        const b = this.toScreen(e.to.pos);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = pass === 0 ? C.taxiwayEdge : C.taxiway;
        ctx.lineWidth = Math.max(pass === 0 ? 3 : 2, e.widthM * z + (pass === 0 ? 2 : 0));
        ctx.stroke();
      }
    }
    // Centre lines and stand lead-in lines
    if (z > 0.25) {
      ctx.lineWidth = 1;
      for (const e of ap.edges) {
        if (e.kind === 'runway') continue;
        const a = this.toScreen(e.from.pos);
        const b = this.toScreen(e.to.pos);
        ctx.strokeStyle = e.kind === 'stand' ? C.standLine : C.centreline;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Runway markings
    for (const end of ap.runwayEnds.values()) {
      const u = headingVector(end.heading);
      const n = { x: -u.y, y: u.x };
      ctx.strokeStyle = C.runwayMark;
      // centre line dashes, drawn once per runway
      if (end.name < (ap.oppositeEnd(end.name)?.name ?? '')) {
        ctx.setLineDash([Math.max(2, 30 * z), Math.max(2, 20 * z)]);
        ctx.lineWidth = Math.max(1, 0.9 * z);
        const a = this.toScreen(add(end.start, scale(u, 120)));
        const b = this.toScreen(sub(end.farEnd, scale(u, 120)));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // threshold bars
      ctx.lineWidth = Math.max(1, 1.8 * z);
      for (let k = -7; k <= 7; k++) {
        if (k === 0) continue;
        const off = scale(n, k * 2.6);
        const a = this.toScreen(add(add(end.threshold, off), scale(u, 6)));
        const b = this.toScreen(add(add(end.threshold, off), scale(u, 36)));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // designator
      const p = this.toScreen(add(end.threshold, scale(u, 70)));
      ctx.save();
      ctx.translate(p.x, p.y);
      // text "up" points along the landing direction, as painted on the runway
      ctx.rotate((end.heading * Math.PI) / 180);
      ctx.fillStyle = C.runwayMark;
      ctx.font = `bold ${Math.max(10, Math.min(28, 22 * z))}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(end.name, 0, 0);
      ctx.restore();
    }

    // Buildings
    for (const b of ap.buildings) poly(b.polygon, C.building, C.buildingEdge);

    // Holding points
    ctx.font = `${Math.max(9, Math.min(12, 11 * z))}px Consolas, monospace`;
    for (const node of ap.holdingPoints.values()) {
      const strip = node.edges.find((e) => e.kind === 'runwayStrip');
      const other = node.edges.find((e) => e.kind !== 'runwayStrip');
      const ref = strip ?? other;
      if (!ref) continue;
      const far = ref.from === node ? ref.to : ref.from;
      const d = sub(far.pos, node.pos);
      const len = Math.hypot(d.x, d.y) || 1;
      const u = { x: d.x / len, y: d.y / len };
      const n = { x: -u.y, y: u.x };
      const half = 13;
      const a = this.toScreen(add(node.pos, scale(n, half)));
      const b = this.toScreen(sub(node.pos, scale(n, half)));
      ctx.strokeStyle = C.holdBar;
      ctx.lineWidth = Math.max(2, 2.5 * z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (z > 0.18) {
        const lp = this.toScreen(add(node.pos, scale(n, half + 14)));
        this.labelBox(node.holdingPoint!.name, lp.x, lp.y, C.holdBar);
      }
    }

    // Stands
    if (z > 0.35) {
      ctx.font = `${Math.max(9, Math.min(12, 10 * z))}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const s of ap.stands.values()) {
        const v = headingVector(s.heading);
        const p = this.toScreen(add(s.pos, scale(v, 22)));
        ctx.fillStyle = C.standLabel;
        ctx.fillText(s.id, p.x, p.y);
        const q = this.toScreen(s.pos);
        ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
      }
    }

    // Taxiway designators
    if (z > 0.12) {
      ctx.font = `bold ${Math.max(10, Math.min(13, 12 * z))}px Consolas, monospace`;
      for (const l of this.taxiwayLabels) {
        const p = this.toScreen(l.pos);
        this.labelBox(l.name, p.x, p.y, C.label);
      }
    }

    // Building names
    if (z > 0.3) {
      ctx.font = `${Math.max(9, Math.min(12, 10 * z))}px Consolas, monospace`;
      ctx.fillStyle = '#b3a797';
      ctx.textAlign = 'center';
      for (const b of ap.buildings) {
        if (b.name === 'Tower') continue;
        const c = b.polygon.reduce((acc, p) => add(acc, scale(p, 1 / b.polygon.length)), { x: 0, y: 0 });
        const p = this.toScreen(c);
        ctx.fillText(b.name.toUpperCase(), p.x, p.y);
      }
    }
  }

  private labelBox(text: string, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 6;
    const h = 14;
    ctx.fillStyle = C.labelBg;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 1);
  }

  // ------------------------------------------------------------------ dynamic

  private colorFor(ac: Aircraft, now: number): string {
    if (ac.incident) return C.danger;
    const mine = this.sim.isOnMyFrequency(ac);
    if (mine && ac.request) {
      const late = this.sim.time - ac.requestSince > 60;
      const blink = Math.floor(now / 500) % 2 === 0;
      return blink ? (late ? C.late : C.request) : C.mine;
    }
    return mine ? C.mine : C.other;
  }

  private drawRoutes(): void {
    const ctx = this.ctx;
    for (const ac of this.sim.aircraft) {
      if (!ac.path || !ac.onGround || ac.phase === 'takeoff') continue;
      const sel = ac.callsign === this.selected;
      if (!sel && !this.showAllRoutes) continue;
      if (!sel && !(ac.phase === 'taxi' && this.sim.isOnMyFrequency(ac))) continue;
      const pts = ac.path.points;
      const start = ac.s;
      ctx.beginPath();
      const p0 = this.toScreen(ac.pos);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 0; i < pts.length; i++) {
        if (ac.path.cum[i] <= start) continue;
        const p = this.toScreen(pts[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = sel ? C.route : C.routeOther;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash(sel ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // stops
      for (const st of ac.stops) {
        if (st.s < start) continue;
        const p = this.toScreen(ac.path.pointAt(st.s));
        ctx.fillStyle = st.kind === 'runway' ? C.danger : st.kind === 'holdShort' ? C.request : sel ? C.route : C.routeOther;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
    }
    if (this.preview && this.preview.points.length > 1) {
      ctx.beginPath();
      this.preview.points.forEach((p, i) => {
        const s = this.toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = this.preview.ok ? C.previewOk : C.previewErr;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawAircraft(ac: Aircraft, color: string): void {
    const ctx = this.ctx;
    const p = this.toScreen(ac.pos);
    const z = this.zoom;
    const L = ac.type.lengthM;
    const S = ac.type.wingspanM;
    const minPx = 14;
    const k = Math.max(z, minPx / L);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((ac.heading * Math.PI) / 180);
    ctx.scale(k, k);
    // simple top-down silhouette, nose towards -y
    const fw = ac.type.silhouette === 'widebody' ? 3.2 : 2.0;
    const wingY = -L * 0.02;
    const sweep = ac.type.silhouette === 'turboprop' ? 0.02 * L : 0.14 * L;
    const chord = 0.16 * L;
    ctx.beginPath();
    ctx.moveTo(0, -L / 2);
    ctx.quadraticCurveTo(fw, -L / 2 + 2, fw, -L / 2 + 6);
    ctx.lineTo(fw, wingY);
    ctx.lineTo(S / 2, wingY + sweep);
    ctx.lineTo(S / 2, wingY + sweep + chord * 0.35);
    ctx.lineTo(fw, wingY + chord);
    ctx.lineTo(fw * 0.7, L / 2 - 6);
    ctx.lineTo(S * 0.18, L / 2 - 1);
    ctx.lineTo(S * 0.18, L / 2 + 1);
    ctx.lineTo(0, L / 2);
    ctx.lineTo(-S * 0.18, L / 2 + 1);
    ctx.lineTo(-S * 0.18, L / 2 - 1);
    ctx.lineTo(-fw * 0.7, L / 2 - 6);
    ctx.lineTo(-fw, wingY + chord);
    ctx.lineTo(-S / 2, wingY + sweep + chord * 0.35);
    ctx.lineTo(-S / 2, wingY + sweep);
    ctx.lineTo(-fw, wingY);
    ctx.lineTo(-fw, -L / 2 + 6);
    ctx.quadraticCurveTo(-fw, -L / 2 + 2, 0, -L / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = ac.onGround ? 0.9 : 0.75;
    ctx.fill();
    ctx.restore();

    if (ac.callsign === this.selected) {
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(12, (S * k) / 2 + 4), 0, Math.PI * 2);
      ctx.stroke();
    }
    this.symbolHits.push({ callsign: ac.callsign, x: p.x, y: p.y, r: Math.max(10, (Math.max(L, S) * k) / 2) });

    // speed vector for airborne / fast traffic
    if (!ac.onGround || ac.speed > 20 * KT_TO_MS) {
      const v = headingVector(ac.heading);
      const ahead = this.toScreen(add(ac.pos, scale(v, ac.speed * 30)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ahead.x, ahead.y);
      ctx.stroke();
    }
  }

  private drawTag(ac: Aircraft, color: string): void {
    const ctx = this.ctx;
    const p = this.toScreen(ac.pos);
    const off = ac.tagOffset ?? defaultTagOffset();
    const mine = this.sim.isOnMyFrequency(ac);
    const lines: string[] = [];
    const compact = (ac.phase === 'parked' && !ac.request) || ac.phase === 'arrived';
    lines.push(ac.callsign + (mine && ac.request ? ' *' : ''));
    if (!compact) {
      if (ac.onGround) {
        const target = clearedTo(ac) || (ac.category === 'arrival' && ac.assignedStand ? `>${ac.assignedStand}` : ac.stand ?? '');
        lines.push(`${ac.type.icao} ${target}`.trim());
        lines.push(`${statusCode(ac)} ${Math.round(ac.speed / KT_TO_MS)}`);
      } else {
        lines.push(`${ac.type.icao} ${ac.category === 'arrival' ? 'ARR' : ac.flightPlan.destination}`);
        lines.push(`A${String(Math.round(ac.altitudeFt / 100)).padStart(3, '0')} ${Math.round(ac.speed / KT_TO_MS)}`);
      }
    }
    ctx.font = '11px Consolas, Menlo, monospace';
    const lh = 12;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 4;
    const hgt = lines.length * lh + 2;
    const tx = p.x + off.x;
    const ty = p.y + off.y;
    // leader line
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    const lx = Math.min(Math.max(p.x, tx), tx + w);
    const ly = Math.min(Math.max(p.y, ty), ty + hgt);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (ac.callsign === this.selected) {
      ctx.fillStyle = 'rgba(111, 227, 255, 0.12)';
      ctx.fillRect(tx, ty, w, hgt);
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, tx + 2, ty + 1 + i * lh));
    this.tagRects.push({ callsign: ac.callsign, x: tx, y: ty, w, h: hgt });
  }

  render(now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = C.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawChart();
    this.drawRoutes();

    this.tagRects = [];
    this.symbolHits = [];
    const list = [...this.sim.aircraft].filter((a) => a.phase !== 'gone' && (a.onGround || this.sim.distanceToThresholdNm(a) < 12 || a.altitudeFt < this.sim.airport.data.elevationFt + 5000));
    // selected last so its tag is on top
    list.sort((a, b) => (a.callsign === this.selected ? 1 : 0) - (b.callsign === this.selected ? 1 : 0));
    for (const ac of list) this.drawAircraft(ac, this.colorFor(ac, now));
    for (const ac of list) {
      // Declutter: quiet parked aircraft only get a tag when zoomed in or selected.
      const quiet = (ac.phase === 'parked' && !ac.request) || ac.phase === 'arrived';
      if (quiet && this.zoom < 0.6 && ac.callsign !== this.selected) continue;
      this.drawTag(ac, this.colorFor(ac, now));
    }

    // scale bar
    this.drawScaleBar();
  }

  private drawScaleBar(): void {
    const ctx = this.ctx;
    const targetPx = 120;
    const raw = targetPx / this.zoom;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw * 0.6) ?? raw;
    const px = nice * this.zoom;
    const x = 12;
    const y = this.height - 14;
    ctx.strokeStyle = '#9fb0b5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.fillStyle = '#9fb0b5';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x + px + 6, y + 2);
  }
}

export function defaultTagOffset(): Vec2 {
  return { x: 16, y: -42 };
}
