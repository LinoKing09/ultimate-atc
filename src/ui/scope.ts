import { edgeVertices, isClosedEdge, type TaxiEdge } from '../core/airport/airport';
import { pavementGeometry, type PavementGeometry } from '../core/airport/pavement';
import type { Aircraft } from '../core/aircraft';
import { catcAlert } from '../core/conflicts';
import { KT_TO_MS, M_PER_NM, add, headingVector, scale, sub, type Vec2 } from '../core/geo';
import type { Simulation } from '../core/simulation';
import { clearedTo, statusCode, type StatusStyle } from './labels';

/**
 * The ground radar scope: draws the aerodrome chart, aircraft symbols and
 * data tags, and handles panning, zooming, selection and tag dragging.
 */

/** Colours of the scope. The PHX styles follow the VATSIM Germany ground radar maps (DFS PHOENIX look). */
interface ScopeTheme {
  /** PHX: radar returns with an SSR symbol, history dots, departures / arrivals in their colours, label boxes. */
  phx: boolean;
  background: string;
  apron: string;
  taxiway: string;
  taxiwayEdge: string;
  centreline: string;
  standLine: string;
  runway: string;
  runwayMark: string;
  building: string;
  buildingEdge: string;
  buildingLabel: string;
  closedCross: string;
  holdBar: string;
  /** De-icing pads. */
  deicing: string;
  /** Taxiway designators. */
  label: string;
  labelBg: string;
  standLabel: string;
  scaleBar: string;
  route: string;
  routeOther: string;
  previewOk: string;
  previewErr: string;
  centrelineActive: string;
  centrelineOther: string;
  followMe: string;
  /** Targets and tags: on your frequency / not (classic), departures / arrivals / others (PHX). */
  mine: string;
  other: string;
  departure: string;
  arrival: string;
  unknown: string;
  /** Radar return (raw video) of the aircraft (PHX). */
  rawVideo: string;
  /** Background of a data tag (PHX) and of the selected one. */
  tagBg: string;
  tagBgSelected: string;
  /** A request flashes between the tag colour and this one; late requests in `late`. */
  request: string;
  late: string;
  danger: string;
  emergency: string;
  selected: string;
}

const CLASSIC: ScopeTheme = {
  phx: false,
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
  buildingLabel: '#b3a797',
  closedCross: 'rgba(15, 18, 19, 0.85)',
  holdBar: '#e0b52a',
  deicing: '#93a6ab',
  label: '#e3c548',
  labelBg: 'rgba(20, 24, 26, 0.85)',
  standLabel: '#93a6ab',
  scaleBar: '#9fb0b5',
  route: 'rgba(111, 227, 255, 0.85)',
  routeOther: 'rgba(160, 190, 200, 0.45)',
  previewOk: 'rgba(123, 220, 143, 0.9)',
  previewErr: 'rgba(255, 90, 90, 0.9)',
  centrelineActive: 'rgba(111, 227, 255, 0.55)',
  centrelineOther: 'rgba(160, 190, 200, 0.28)',
  followMe: '#f5d332',
  mine: '#e8f0f0',
  other: '#8d9ba1',
  departure: '#e8f0f0',
  arrival: '#e8f0f0',
  unknown: '#8d9ba1',
  rawVideo: '#e8f0f0',
  tagBg: 'rgba(0, 0, 0, 0)',
  tagBgSelected: 'rgba(111, 227, 255, 0.12)',
  request: '#ffcf4d',
  late: '#ff7b54',
  danger: '#ff5a5a',
  emergency: '#ff5cf0',
  selected: '#6fe3ff',
};

/** VATSIM Germany PHX night palette (GRP maps: layout colours, label and raw video colours). */
const PHX_NIGHT: ScopeTheme = {
  phx: true,
  background: 'rgb(18, 28, 20)',
  apron: 'rgb(29, 29, 29)',
  taxiway: 'rgb(53, 53, 53)',
  taxiwayEdge: 'rgb(53, 53, 53)',
  centreline: 'rgba(117, 111, 77, 0.95)',
  standLine: 'rgba(117, 111, 77, 0.7)',
  runway: 'rgb(78, 78, 78)',
  runwayMark: 'rgb(150, 150, 150)',
  building: 'rgb(43, 49, 50)',
  buildingEdge: 'rgb(56, 63, 65)',
  buildingLabel: 'rgb(150, 150, 150)',
  closedCross: 'rgb(185, 59, 46)',
  holdBar: 'rgb(193, 121, 4)',
  deicing: 'rgb(90, 109, 156)',
  label: 'rgb(220, 220, 220)',
  labelBg: 'rgba(18, 28, 20, 0.6)',
  standLabel: 'rgb(180, 180, 180)',
  scaleBar: 'rgb(180, 180, 180)',
  route: 'rgba(111, 227, 255, 0.85)',
  routeOther: 'rgba(160, 190, 200, 0.45)',
  previewOk: 'rgba(123, 220, 143, 0.9)',
  previewErr: 'rgba(255, 90, 90, 0.9)',
  centrelineActive: 'rgba(200, 200, 200, 0.55)',
  centrelineOther: 'rgba(150, 150, 150, 0.28)',
  followMe: '#f5d332',
  mine: 'rgb(250, 250, 250)',
  other: 'rgb(150, 150, 150)',
  departure: 'rgb(72, 184, 251)',
  arrival: 'rgb(244, 202, 3)',
  unknown: 'rgb(0, 181, 27)',
  rawVideo: 'rgb(161, 192, 76)',
  tagBg: 'rgba(24, 24, 24, 0.78)',
  tagBgSelected: 'rgba(50, 50, 50, 0.95)',
  request: 'rgb(255, 255, 255)',
  late: 'rgb(255, 120, 0)',
  danger: '#ff5a5a',
  emergency: '#ff5cf0',
  selected: 'rgb(255, 255, 255)',
};

/** VATSIM Germany PHX day palette. */
const PHX_DAY: ScopeTheme = {
  ...PHX_NIGHT,
  background: 'rgb(169, 199, 170)',
  apron: 'rgb(210, 210, 210)',
  taxiway: 'rgb(195, 195, 195)',
  taxiwayEdge: 'rgb(195, 195, 195)',
  centreline: 'rgba(167, 163, 116, 0.95)',
  standLine: 'rgba(167, 163, 116, 0.8)',
  runway: 'rgb(180, 180, 180)',
  runwayMark: 'rgb(235, 235, 235)',
  building: 'rgb(185, 185, 185)',
  buildingEdge: 'rgb(160, 160, 160)',
  buildingLabel: 'rgb(80, 80, 80)',
  closedCross: 'rgb(127, 72, 72)',
  holdBar: 'rgb(176, 82, 0)',
  label: 'rgb(30, 30, 30)',
  labelBg: 'rgba(210, 210, 210, 0.6)',
  standLabel: 'rgb(80, 80, 80)',
  scaleBar: 'rgb(60, 60, 60)',
  route: 'rgba(0, 110, 160, 0.85)',
  routeOther: 'rgba(60, 80, 90, 0.5)',
  previewOk: 'rgba(20, 140, 50, 0.9)',
  previewErr: 'rgba(200, 30, 30, 0.9)',
  centrelineActive: 'rgba(60, 60, 60, 0.6)',
  centrelineOther: 'rgba(80, 80, 80, 0.3)',
  mine: 'rgb(20, 20, 20)',
  other: 'rgb(90, 90, 90)',
  departure: 'rgb(48, 81, 163)',
  arrival: 'rgb(91, 94, 1)',
  unknown: 'rgb(12, 89, 25)',
  rawVideo: 'rgb(107, 143, 155)',
  tagBg: 'rgba(235, 235, 235, 0.8)',
  tagBgSelected: 'rgba(255, 255, 255, 0.95)',
  request: 'rgb(255, 113, 8)',
  late: 'rgb(200, 0, 0)',
  danger: 'rgb(200, 0, 0)',
  emergency: 'rgb(166, 0, 61)',
  selected: 'rgb(0, 0, 0)',
};

export type ScopeStyle = 'phx-night' | 'phx-day' | 'classic';
const THEMES: Record<ScopeStyle, ScopeTheme> = { 'phx-night': PHX_NIGHT, 'phx-day': PHX_DAY, classic: CLASSIC };

/** Number of history dots behind a moving target (PHX) and the time between them (simulation seconds). */
const HISTORY_DOTS = 5;
const HISTORY_INTERVAL_S = 2;

/** Clickable items of a data tag (EuroScope style). */
/** Distance between repeated designators along long taxiways (metres). */
const LABEL_REPEAT_SPACING = 600;

export type TagItem = 'callsign' | 'type' | 'target' | 'status' | 'sid';

export interface ScopeCallbacks {
  onSelect(callsign: string | undefined): void;
  onContextMenu(callsign: string, clientX: number, clientY: number): void;
  /** Left click on a specific tag item. */
  onTagItem(callsign: string, item: TagItem, clientX: number, clientY: number): void;
}

interface TagRect {
  callsign: string;
  x: number;
  y: number;
  w: number;
  h: number;
  items: { item: TagItem; x: number; y: number; w: number; h: number }[];
}

export class Scope {
  /** View centre in local metres and zoom in pixels per metre. */
  private cx = 0;
  private cy = 0;
  private zoom = 0.3;
  /** World heading (degrees true) that points up on the screen: 0 = north up. */
  private viewHeading = 0;
  private up: Vec2 = { x: 0, y: 1 };
  private right: Vec2 = { x: 1, y: 0 };
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
  /**
   * Touch-friendly behaviour (mobile mode): the first tap on an aircraft only
   * selects it, a second tap (or a long press) opens its menu; hit areas are larger.
   */
  touchMode = false;
  /** Size factor of the data tags. */
  tagScale = 1;
  /** Colours (see `setStyle`). */
  private t: ScopeTheme = PHX_NIGHT;
  /** Ground state names in the tags. */
  statusStyle: StatusStyle = 'phx';
  /** Recent positions of the targets (PHX history dots), newest last, with the time of the last sample. */
  private readonly history = new Map<string, { at: number; points: Vec2[] }>();

  private drag?: {
    mode: 'pan' | 'tag';
    callsign?: string;
    item?: TagItem;
    /** The aircraft was already selected when the pointer went down (touch mode: second tap). */
    wasSelected?: boolean;
    clientX?: number;
    clientY?: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist?: number;
  private pinchMid?: { x: number; y: number };
  private longPress?: ReturnType<typeof setTimeout>;

  /** Taxiway designators; `repeat` labels are extra copies along long taxiways, shown when zoomed in. */
  private readonly taxiwayLabels: { name: string; pos: Vec2; repeat: boolean }[] = [];
  /** Buildings with a name (not the tower), largest first, with the centre of their outline. */
  private readonly namedBuildings: { name: string; centre: Vec2 }[];
  /** Rounded taxiway pavement, computed once. */
  private readonly pavement: PavementGeometry;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
    private readonly cb: ScopeCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.computeLabels();
    // Each name once, on the largest building that carries it (OSM often splits a complex into parts).
    this.namedBuildings = this.sim.airport.buildings
      .filter((b) => b.name && b.name !== 'Tower' && b.polygon.length >= 3)
      .map((b) => ({ name: b.name, ...polygonCentre(b.polygon) }))
      .sort((a, b) => b.area - a.area)
      .filter((b, i, all) => all.findIndex((o) => o.name === b.name) === i);
    this.pavement = pavementGeometry(this.sim.airport);
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

  /**
   * Rotates the scope. With `runwayAligned` false the scope is north-up; with
   * true the main runway is horizontal (like the aerodrome chart), its first
   * end on the left.
   */
  setRotation(runwayAligned: boolean): void {
    // The main runway (the first one in the airport data), its first end on the left.
    const first = this.sim.airport.data.runways[0]?.ends[0].name;
    const end = first ? this.sim.airport.runwayEnd(first) : undefined;
    this.viewHeading = runwayAligned && end ? (end.heading - 90 + 360) % 360 : 0;
    this.up = headingVector(this.viewHeading);
    this.right = headingVector(this.viewHeading + 90);
    this.resetView();
  }

  get runwayAligned(): boolean {
    return this.viewHeading !== 0;
  }

  /** Scope style: the PHX palettes (VATSIM Germany) or the classic one. */
  setStyle(style: ScopeStyle): void {
    this.t = THEMES[style] ?? PHX_NIGHT;
    this.statusStyle = this.t.phx ? 'phx' : 'euroscope';
  }

  get isPhx(): boolean {
    return this.t.phx;
  }

  resetView(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of this.sim.airport.nodes.values()) {
      const vx = n.pos.x * this.right.x + n.pos.y * this.right.y;
      const vy = n.pos.x * this.up.x + n.pos.y * this.up.y;
      minX = Math.min(minX, vx);
      maxX = Math.max(maxX, vx);
      minY = Math.min(minY, vy);
      maxY = Math.max(maxY, vy);
    }
    const cxv = (minX + maxX) / 2;
    const cyv = (minY + maxY) / 2;
    this.cx = this.right.x * cxv + this.up.x * cyv;
    this.cy = this.right.y * cxv + this.up.y * cyv;
    const w = maxX - minX + 300;
    const hgt = maxY - minY + 400;
    this.zoom = Math.min(this.width / w, this.height / hgt) || 0.3;
  }

  centerOn(p: Vec2): void {
    this.cx = p.x;
    this.cy = p.y;
    this.zoom = Math.max(this.zoom, 0.9);
  }

  /** Moves the view by a screen distance in pixels. */
  panBy(dx: number, dy: number): void {
    this.cx -= (dx * this.right.x - dy * this.up.x) / this.zoom;
    this.cy -= (dx * this.right.y - dy * this.up.y) / this.zoom;
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(12, Math.max(0.04, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  toScreen(p: Vec2): Vec2 {
    const dx = p.x - this.cx;
    const dy = p.y - this.cy;
    return {
      x: (dx * this.right.x + dy * this.right.y) * this.zoom + this.width / 2,
      y: this.height / 2 - (dx * this.up.x + dy * this.up.y) * this.zoom,
    };
  }

  toWorld(sx: number, sy: number): Vec2 {
    const r = (sx - this.width / 2) / this.zoom;
    const u = (this.height / 2 - sy) / this.zoom;
    return { x: this.cx + r * this.right.x + u * this.up.x, y: this.cy + r * this.right.y + u * this.up.y };
  }

  /** Canvas rotation (radians) for something pointing at world heading `h`. */
  private screenAngle(h: number): number {
    return ((h - this.viewHeading) * Math.PI) / 180;
  }

  // ------------------------------------------------------------------ input

  private hover?: { callsign: string; item?: TagItem };

  private hitTest(sx: number, sy: number): { callsign: string; kind: 'tag' | 'symbol'; item?: TagItem } | undefined {
    for (let i = this.tagRects.length - 1; i >= 0; i--) {
      const t = this.tagRects[i];
      if (sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h) {
        const it = t.items.find((r) => sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h);
        return { callsign: t.callsign, kind: 'tag', item: it?.item };
      }
    }
    let best: { callsign: string; d: number } | undefined;
    for (const s of this.symbolHits) {
      const d = Math.hypot(sx - s.x, sy - s.y);
      if (d <= s.r + (this.touchMode ? 14 : 0) && (!best || d < best.d)) best = { callsign: s.callsign, d };
    }
    return best ? { callsign: best.callsign, kind: 'symbol' } : undefined;
  }

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari: pinching the scope must not zoom the page.
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
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        clearTimeout(this.longPress);
        this.drag = undefined;
        return;
      }
      const hit = this.hitTest(sx, sy);
      clearTimeout(this.longPress);
      if (this.touchMode && hit && e.button === 0) {
        // Long press opens the aircraft menu.
        this.longPress = setTimeout(() => {
          if (this.drag?.moved) return;
          this.drag = undefined;
          this.cb.onSelect(hit.callsign);
          this.cb.onContextMenu(hit.callsign, e.clientX, e.clientY);
        }, 550);
      }
      const wasSelected = !!hit && this.selected === hit.callsign;
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
        this.drag = { mode: 'tag', callsign: hit.callsign, item: hit.item, wasSelected, clientX: e.clientX, clientY: e.clientY, lastX: sx, lastY: sy, moved: false };
      } else if (hit) {
        this.cb.onSelect(hit.callsign);
        if (this.touchMode) this.drag = { mode: 'tag', callsign: hit.callsign, wasSelected, clientX: e.clientX, clientY: e.clientY, lastX: sx, lastY: sy, moved: false };
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
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Two fingers pan and zoom at the same time.
        if (this.pinchMid) this.panBy(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
        this.zoomBy(d / this.pinchDist, mid.x, mid.y);
        this.pinchDist = d;
        this.pinchMid = mid;
        return;
      }
      if (e.pointerType !== 'touch') {
        // Hover feedback only for mouse and pen (a finger has no hover).
        const hover = this.hitTest(sx, sy);
        this.hover = hover ? { callsign: hover.callsign, item: hover.item } : undefined;
        c.style.cursor = hover ? 'pointer' : this.drag?.mode === 'pan' ? 'grabbing' : 'crosshair';
      }
      if (!this.drag) return;
      const dx = sx - this.drag.lastX;
      const dy = sy - this.drag.lastY;
      if (Math.abs(dx) + Math.abs(dy) > (this.touchMode ? 6 : 2)) {
        this.drag.moved = true;
        clearTimeout(this.longPress);
      }
      this.drag.lastX = sx;
      this.drag.lastY = sy;
      if (this.drag.mode === 'pan') {
        this.panBy(dx, dy);
      } else if (!this.drag.item) {
        // Touch mode: dragging that starts on an aircraft symbol pans the scope.
        this.panBy(dx, dy);
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
      if (this.pointers.size < 2) {
        // After a pinch, no tap/click and no jump when the remaining finger moves on.
        if (this.pinchDist !== undefined) {
          this.pinchDist = undefined;
          this.pinchMid = undefined;
          const rest = [...this.pointers.values()][0];
          this.drag = rest ? { mode: 'pan', lastX: rest.x, lastY: rest.y, moved: true } : undefined;
          return;
        }
      }
      if (this.drag && this.drag.mode === 'pan' && !this.drag.moved && e.button === 0) this.cb.onSelect(undefined);
      clearTimeout(this.longPress);
      // A click (no drag) on a tag item opens that item's function, like in EuroScope.
      // In touch mode only the second tap does: the first one just selects the aircraft.
      const d = this.drag;
      if (d && d.mode === 'tag' && !d.moved && d.callsign && (!this.touchMode || d.wasSelected)) {
        if (d.item) this.cb.onTagItem(d.callsign, d.item, d.clientX ?? e.clientX, d.clientY ?? e.clientY);
        else if (this.touchMode) this.cb.onContextMenu(d.callsign, d.clientX ?? e.clientX, d.clientY ?? e.clientY);
      }
      this.drag = undefined;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------ static chart

  /**
   * Places taxiway designators: one on the longest segment of each taxiway,
   * plus repeats every ~600 m along long taxiways (N, S, M ...) so the name
   * stays visible when zoomed in on a part of the airport.
   */
  private computeLabels(): void {
    const byName = new Map<string, { edges: { a: Vec2; b: Vec2; len: number }[]; total: number }>();
    for (const e of this.sim.airport.edges) {
      // Unnamed apron lanes get no label.
      if ((e.kind !== 'taxiway' && e.kind !== 'taxilane') || !e.name) continue;
      const cur = byName.get(e.name) ?? { edges: [], total: 0 };
      cur.edges.push({ a: e.from.pos, b: e.to.pos, len: e.length });
      cur.total += e.length;
      byName.set(e.name, cur);
    }
    // Named pavement lines (closed taxiways outside the taxi graph), segment by segment.
    for (const l of this.sim.airport.pavementLines) {
      if (!l.name || this.sim.airport.edges.some((e) => e.name === l.name)) continue;
      const cur = byName.get(l.name) ?? { edges: [], total: 0 };
      for (let i = 0; i < l.points.length - 1; i++) {
        const len = Math.hypot(l.points[i + 1].x - l.points[i].x, l.points[i + 1].y - l.points[i].y);
        cur.edges.push({ a: l.points[i], b: l.points[i + 1], len });
        cur.total += len;
      }
      byName.set(l.name, cur);
    }
    for (const [name, t] of byName) {
      const edges = [...t.edges].sort((p, q) => q.len - p.len);
      const main = edges[0];
      const placed: Vec2[] = [scale(add(main.a, main.b), 0.5)];
      this.taxiwayLabels.push({ name, pos: placed[0], repeat: false });
      if (t.total < LABEL_REPEAT_SPACING * 1.5) continue;
      // Candidate points every 50 m along every segment, away from the junctions at its ends.
      const candidates: Vec2[] = [];
      for (const e of edges) {
        for (let d = 30; d <= e.len - 30; d += 50) candidates.push(add(e.a, scale(sub(e.b, e.a), d / e.len)));
      }
      for (const c of candidates) {
        if (placed.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= LABEL_REPEAT_SPACING)) {
          placed.push(c);
          this.taxiwayLabels.push({ name, pos: c, repeat: true });
        }
      }
    }
  }

  /**
   * Extended runway centrelines (the approach path / ILS localizer course, as
   * in EuroScope): from each threshold outwards, with a tick every NM and a
   * longer one every 5 NM. The runway in use is brighter.
   */
  private drawExtendedCentrelines(): void {
    const ctx = this.ctx;
    const ap = this.sim.airport;
    const lengthNm = 15;
    ctx.save();
    ctx.lineCap = 'butt';
    for (const end of ap.runwayEnds.values()) {
      const active = end.name === this.sim.runway;
      const out = headingVector((end.heading + 180) % 360);
      const n = { x: -out.y, y: out.x };
      const a = this.toScreen(end.threshold);
      const b = this.toScreen(add(end.threshold, scale(out, lengthNm * M_PER_NM)));
      ctx.strokeStyle = active ? this.t.centrelineActive : this.t.centrelineOther;
      ctx.lineWidth = 1;
      ctx.setLineDash(active ? [] : [6, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let nm = 1; nm <= lengthNm; nm++) {
        const half = (nm % 5 === 0 ? 350 : 150) * (active ? 1 : 0.7);
        const p = add(end.threshold, scale(out, nm * M_PER_NM));
        const t1 = this.toScreen(add(p, scale(n, half)));
        const t2 = this.toScreen(sub(p, scale(n, half)));
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.stroke();
      }
      if (active && (!this.sim.systemOn('loc') || !this.sim.hasIls(end.name))) {
        // No localizer (out of service, or none published): label the line so nobody takes it for an ILS course.
        ctx.fillStyle = this.t.centrelineOther;
        ctx.font = '10px Consolas, Menlo, monospace';
        const lbl = this.toScreen(add(end.threshold, scale(out, 3 * M_PER_NM)));
        ctx.fillText(this.sim.hasIls(end.name) ? 'LOC U/S' : this.sim.approachTypeFor(end.name), lbl.x + 6, lbl.y - 6);
      }
    }
    ctx.restore();
  }

  /** Starts a canvas path along an edge, through its shape points. */
  private edgePath(e: TaxiEdge): void {
    this.polylinePath(edgeVertices(e));
  }

  /** Starts a canvas path along a polyline (local metres). */
  private polylinePath(points: Vec2[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach((v, i) => {
      const p = this.toScreen(v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
  }

  /** Permanently closed taxiway parts (airport data): crosses along the pavement, as on the aerodrome chart. */
  private drawOutOfService(): void {
    const ap = this.sim.airport;
    const ctx = this.ctx;
    const z = this.zoom;
    ctx.save();
    ctx.strokeStyle = this.t.closedCross;
    ctx.lineWidth = Math.max(1, Math.min(2.5, 3 * z));
    ctx.lineCap = 'round';
    const half = Math.max(2.5, 9 * z);
    const spacing = 60; // metres between crosses
    ctx.beginPath();
    // No crosses on a runway in use (a closed former runway or taxiway may run beneath it).
    const runways = [...new Set([...ap.runwayEnds.values()].map((e) => e.runway))];
    const onRunway = (q: Vec2) => runways.some((r) => ap.isOnRunway(r, q, 5));
    const crossesAlong = (pts: Vec2[]) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          if (onRunway(q)) continue;
          const p = this.toScreen(q);
          ctx.moveTo(p.x - half, p.y - half);
          ctx.lineTo(p.x + half, p.y + half);
          ctx.moveTo(p.x - half, p.y + half);
          ctx.lineTo(p.x + half, p.y - half);
        }
      }
    };
    for (const e of ap.edges) if (e.closed) crossesAlong([e.from.pos, e.to.pos]);
    for (const l of ap.pavementLines) if (l.closed) crossesAlong(l.points);
    ctx.stroke();
    ctx.restore();
  }

  /** Closed taxiways (scenario option): red, hatched, with the designator crossed out. */
  private drawClosedTaxiways(): void {
    const ap = this.sim.airport;
    if (!ap.closedTaxiways.size) return;
    const ctx = this.ctx;
    const z = this.zoom;
    ctx.save();
    ctx.lineCap = 'butt';
    for (const e of ap.edges) {
      if (e.closed || !isClosedEdge(ap, e)) continue;
      const a = this.toScreen(e.from.pos);
      const b = this.toScreen(e.to.pos);
      const w = Math.max(3, e.widthM * z + 2);
      ctx.strokeStyle = 'rgba(220, 60, 60, 0.45)';
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // Diagonal hatching across the taxiway.
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const half = w / 2;
      const step = Math.max(6, w * 1.2);
      ctx.strokeStyle = 'rgba(255, 90, 90, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let d = step / 2; d < len; d += step) {
        const cx = a.x + ux * d;
        const cy = a.y + uy * d;
        ctx.moveTo(cx - uy * half - ux * half, cy + ux * half - uy * half);
        ctx.lineTo(cx + uy * half + ux * half, cy - ux * half + uy * half);
      }
      ctx.stroke();
    }
    ctx.restore();
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

    for (const a of ap.areas) poly(a.polygon, this.t.apron);

    // Taxiways: rounded chains and junction fillets (see core/airport/pavement.ts), edge colour first.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const strokes = [...this.pavement.fillets, ...this.pavement.chains];
    for (const pass of [0, 1]) {
      for (const st of strokes) {
        this.polylinePath(st.points);
        ctx.strokeStyle = pass === 0 ? this.t.taxiwayEdge : this.t.taxiway;
        ctx.lineWidth = Math.max(pass === 0 ? 3 : 2, st.widthM * z + (pass === 0 ? 2 : 0));
        ctx.stroke();
      }
    }
    // Runways, on top of the taxiway pavement (only the fillets outside the runway edge stay visible)
    for (const end of ap.runwayEnds.values()) {
      if (end.name > (ap.oppositeEnd(end.name)?.name ?? '')) continue; // draw each runway once
      const u = headingVector(end.heading);
      const n = { x: -u.y, y: u.x };
      const w = end.widthM / 2;
      const a = end.start;
      const b = end.farEnd;
      poly([add(a, scale(n, w)), add(b, scale(n, w)), sub(b, scale(n, w)), sub(a, scale(n, w))], this.t.runway);
    }
    this.drawExtendedCentrelines();

    this.drawClosedTaxiways();
    this.drawOutOfService();
    // Centre lines and stand lead-in lines
    if (z > 0.25) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.t.centreline;
      for (const st of this.pavement.chains) {
        if (st.closed) continue;
        this.polylinePath(st.points);
        ctx.stroke();
      }
      ctx.strokeStyle = this.t.standLine;
      for (const e of ap.edges) {
        if (e.kind !== 'stand') continue;
        this.edgePath(e);
        ctx.stroke();
      }
    }

    // Runway markings
    for (const end of ap.runwayEnds.values()) {
      const u = headingVector(end.heading);
      const n = { x: -u.y, y: u.x };
      ctx.strokeStyle = this.t.runwayMark;
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
      ctx.rotate(this.screenAngle(end.heading));
      ctx.fillStyle = this.t.runwayMark;
      ctx.font = `bold ${Math.max(10, Math.min(28, 22 * z))}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(end.name, 0, 0);
      ctx.restore();
    }

    // Buildings
    for (const b of ap.buildings) poly(b.polygon, this.t.building, this.t.buildingEdge);

    // Holding points
    ctx.font = `${Math.max(9, Math.min(12, 11 * z))}px Consolas, monospace`;
    for (const node of ap.holdingPoints.values()) {
      const strip = node.edges.find((e) => e.kind === 'runwayStrip');
      const other = node.edges.find((e) => e.kind !== 'runwayStrip');
      const ref = strip ?? other;
      if (!ref) continue;
      // Towards the next vertex (the first shape point of a curved strip).
      const verts = ref.from === node ? edgeVertices(ref) : edgeVertices(ref).reverse();
      const d = sub(verts[1], node.pos);
      const len = Math.hypot(d.x, d.y) || 1;
      const u = { x: d.x / len, y: d.y / len };
      const n = { x: -u.y, y: u.x };
      const half = 13;
      const a = this.toScreen(add(node.pos, scale(n, half)));
      const b = this.toScreen(sub(node.pos, scale(n, half)));
      ctx.strokeStyle = this.t.holdBar;
      ctx.lineWidth = Math.max(2, 2.5 * z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (z > 0.18) {
        const lp = this.toScreen(add(node.pos, scale(n, half + 14)));
        this.labelBox(node.holdingPoint!.name, lp.x, lp.y, this.t.holdBar);
      }
    }

    // Screen boxes of the stand and taxiway labels: building names keep clear of them.
    const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const box = (x: number, y: number, halfW: number, halfH: number) => ({ x0: x - halfW, x1: x + halfW, y0: y - halfH, y1: y + halfH });

    // Stands
    if (z > 0.35) {
      ctx.font = `${Math.max(9, Math.min(12, 10 * z))}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const s of ap.stands.values()) {
        const v = headingVector(s.heading);
        const p = this.toScreen(add(s.pos, scale(v, 22)));
        ctx.fillStyle = this.t.standLabel;
        ctx.fillText(s.id, p.x, p.y);
        taken.push(box(p.x, p.y, ctx.measureText(s.id).width / 2 + 1, 6));
        const q = this.toScreen(s.pos);
        ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
      }
    }

    // De-icing pads: outlined square with the designator
    if (z > 0.12 && ap.deicingPads.length) {
      ctx.font = `${Math.max(9, Math.min(12, 10 * z))}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const pad of ap.deicingPads) {
        const p = this.toScreen(pad.node.pos);
        const half = Math.max(4, 18 * z);
        ctx.strokeStyle = this.t.deicing;
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
        if (z > 0.25) {
          ctx.fillStyle = this.t.standLabel;
          ctx.fillText(pad.name, p.x + half + 14, p.y);
        }
      }
    }

    // Taxiway designators
    if (z > 0.12) {
      ctx.font = `bold ${Math.max(10, Math.min(13, 12 * z))}px Consolas, monospace`;
      for (const l of this.taxiwayLabels) {
        if (l.repeat && z < 0.35) continue; // repeats only when zoomed in
        const p = this.toScreen(l.pos);
        // Closed taxiways: designator in red (session closure) or grey (permanently closed).
        const u = l.name.toUpperCase();
        taken.push(box(p.x, p.y, ctx.measureText(l.name).width / 2 + 3, 7));
        this.labelBox(l.name, p.x, p.y, ap.closedTaxiways.has(u) ? '#ff6b6b' : ap.outOfServiceTaxiways.has(u) ? this.t.standLabel : this.t.label);
      }
    }

    // Building names
    if (z > 0.3) {
      ctx.font = `${Math.max(9, Math.min(12, 10 * z))}px Consolas, monospace`;
      ctx.fillStyle = this.t.buildingLabel;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Largest buildings first; a name that would overlap a stand, a taxiway or another name is left out.
      for (const b of this.namedBuildings) {
        const p = this.toScreen(b.centre);
        const text = b.name.toUpperCase();
        const r = box(p.x, p.y, ctx.measureText(text).width / 2 + 2, 7);
        if (taken.some((q) => r.x0 < q.x1 && q.x0 < r.x1 && r.y0 < q.y1 && q.y0 < r.y1)) continue;
        taken.push(r);
        ctx.fillText(text, p.x, p.y);
      }
    }
  }

  private labelBox(text: string, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 6;
    const h = 14;
    ctx.fillStyle = this.t.labelBg;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 1);
  }

  // ------------------------------------------------------------------ dynamic

  /** Tag colour: PHX by category (departures blue, arrivals yellow, others green), classic by frequency. */
  private baseColor(ac: Aircraft): string {
    if (!this.t.phx) return this.sim.isOnMyFrequency(ac) ? this.t.mine : this.t.other;
    return ac.category === 'departure' ? this.t.departure : ac.category === 'arrival' ? this.t.arrival : this.t.unknown;
  }

  private colorFor(ac: Aircraft, now: number): string {
    const base = this.baseColor(ac);
    if (ac.incident) return this.t.danger;
    if (ac.emergency) return Math.floor(now / 400) % 2 === 0 ? this.t.emergency : base;
    // A-SMGCS CATC: aircraft routed head-on flash red - only conflicts that involve your traffic, until acknowledged.
    if (catcAlert(this.sim, ac)) return Math.floor(now / 350) % 2 === 0 ? this.t.danger : base;
    const mine = this.sim.isOnMyFrequency(ac);
    // Acknowledged requests ("roger", "standby") do not flash.
    if (mine && ac.request && !ac.requestAck) {
      const late = this.sim.time - ac.requestSince > 60;
      const blink = Math.floor(now / 500) % 2 === 0;
      return blink ? (late ? this.t.late : this.t.request) : base;
    }
    return base;
  }

  /** PHX: traffic that is not on your frequency is drawn dimmed. */
  private dimmed(ac: Aircraft): boolean {
    return this.t.phx && !this.sim.isOnMyFrequency(ac);
  }

  /** PHX history dots: samples the target positions every few seconds (simulation time). */
  private updateHistory(list: Aircraft[]): void {
    const now = this.sim.time;
    for (const ac of list) {
      const h = this.history.get(ac.callsign);
      if (!h) {
        this.history.set(ac.callsign, { at: now, points: [{ ...ac.pos }] });
        continue;
      }
      if (now - h.at < HISTORY_INTERVAL_S) continue;
      h.at = now;
      const last = h.points[h.points.length - 1];
      if (Math.hypot(ac.pos.x - last.x, ac.pos.y - last.y) < 2) continue;
      h.points.push({ ...ac.pos });
      if (h.points.length > HISTORY_DOTS + 1) h.points.shift();
    }
    if (this.history.size > list.length + 20) {
      const live = new Set(list.map((a) => a.callsign));
      for (const cs of this.history.keys()) if (!live.has(cs)) this.history.delete(cs);
    }
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
      ctx.strokeStyle = sel ? this.t.route : this.t.routeOther;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash(sel ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // stops
      for (const st of ac.stops) {
        if (st.s < start) continue;
        const p = this.toScreen(ac.path.pointAt(st.s));
        ctx.fillStyle = st.kind === 'runway' ? this.t.danger : st.kind === 'holdShort' ? this.t.request : sel ? this.t.route : this.t.routeOther;
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
      ctx.strokeStyle = this.preview.ok ? this.t.previewOk : this.t.previewErr;
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
    ctx.rotate(this.screenAngle(ac.heading));
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
    // PHX: the radar return (raw video) in its own colour; the SSR symbol carries the tag colour.
    ctx.fillStyle = this.t.phx ? this.t.rawVideo : color;
    ctx.globalAlpha = this.t.phx ? 0.8 : ac.onGround ? 0.9 : 0.75;
    ctx.fill();
    ctx.restore();
    if (this.t.phx) this.drawSsrSymbol(ac, p, color);

    if (ac.callsign === this.selected) {
      ctx.strokeStyle = this.t.selected;
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

  /**
   * PHX target: history dots behind a moving aircraft and the SSR symbol (a small square) at its
   * position - only with A-SMGCS surveillance (cooperative targets); without it just the raw video.
   */
  private drawSsrSymbol(ac: Aircraft, p: Vec2, color: string): void {
    if (!this.sim.systemOn('surveillance')) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    if (this.dimmed(ac)) ctx.globalAlpha = 0.55;
    const dots = this.history.get(ac.callsign)?.points ?? [];
    for (let i = 0; i < dots.length - 1; i++) {
      const d = this.toScreen(dots[i]);
      if (Math.hypot(d.x - p.x, d.y - p.y) < 3) continue;
      ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
    }
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    ctx.restore();
  }

  /**
   * The follow-me cars (with a label if vehicle tracking is on). Tugs are not drawn: at the nose of
   * the aircraft they move they merge with its return on the ground radar.
   */
  private drawVehicles(): void {
    const labels = this.sim.systemOn('surveillance') && this.sim.systemOn('vehicles');
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    // Positions between two simulation steps, for a smooth movement on screen.
    const f = Math.min(1, this.sim.stepFraction);
    for (const v of this.sim.vehicles) {
      if (v.state === 'idle') continue;
      const pos = { x: v.prevPos.x + (v.pos.x - v.prevPos.x) * f, y: v.prevPos.y + (v.pos.y - v.prevPos.y) * f };
      const turn = ((v.heading - v.prevHeading + 540) % 360) - 180;
      const heading = v.prevHeading + turn * f;
      // A driver waiting for your answer flashes like an aircraft with a request.
      const label = labels ? `${v.name}${v.request ? ' *' : ''}${v.holding ? ' HOLD' : ''}` : undefined;
      this.drawVehicle(pos, heading, 4.6, 1.9, v.request && blink ? this.t.request : this.t.followMe, label);
      const p = this.toScreen(pos);
      this.symbolHits.push({ callsign: v.callsign, x: p.x, y: p.y, r: 12 });
      if (v.callsign === this.selected) {
        this.ctx.strokeStyle = this.t.selected;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  private drawVehicle(pos: Vec2, heading: number, lengthM: number, widthM: number, color: string, label?: string): void {
    const ctx = this.ctx;
    const p = this.toScreen(pos);
    const k = Math.max(this.zoom, 6 / lengthM);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(this.screenAngle(heading));
    ctx.fillStyle = color;
    ctx.fillRect((-widthM / 2) * k, (-lengthM / 2) * k, widthM * k, lengthM * k);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect((-widthM / 2) * k, (-lengthM / 2) * k, widthM * k, lengthM * k);
    ctx.restore();
    if (label) {
      const fs = Math.round(10 * this.tagScale);
      ctx.font = `${fs}px Consolas, Menlo, monospace`;
      ctx.fillStyle = color;
      ctx.fillText(label, p.x + 8, p.y - 6);
    }
  }

  /**
   * Data tag, laid out like the VATSIM Germany ground labels: callsign and runway (departures) or stand
   * (arrivals); type, wake category and ground state; SID (departures) and where the aircraft is cleared
   * to, with speed and queue information. Airborne: callsign and type; altitude and speed; runway or SID.
   */
  private drawTag(ac: Aircraft, color: string): void {
    const ctx = this.ctx;
    const p = this.toScreen(ac.pos);
    const off = ac.tagOffset ?? defaultTagOffset();
    const mine = this.sim.isOnMyFrequency(ac);
    const compact = (ac.phase === 'parked' && !ac.request) || ac.phase === 'arrived';
    const hovered = this.hover?.callsign === ac.callsign;
    const dep = ac.category === 'departure';
    // Each line is a list of items; items are clickable.
    type Part = { text: string; item?: TagItem; color?: string };
    const lines: Part[][] = [];
    const head: Part[] = [{ text: ac.callsign, item: 'callsign' }];
    if (!compact && ac.onGround) {
      const where = dep ? ac.runway ?? ac.flightPlan.runway : ac.category === 'arrival' ? ac.stand ?? ac.assignedStand : undefined;
      if (where) head.push({ text: ` ${where}`, item: dep ? undefined : 'target' });
    }
    if (ac.emergency) head.push({ text: ' PAN', color: this.t.emergency });
    if (mine && ac.request) head.push({ text: ' *' });
    lines.push(head);
    // Hovering the callsign shows the radiotelephony callsign (e.g. "SPEEDBIRD 947").
    if (hovered && this.hover?.item === 'callsign') lines.push([{ text: this.sim.tel(ac).toUpperCase(), color: this.t.selected }]);
    if (!compact) {
      const kt = Math.round(ac.speed / KT_TO_MS);
      if (ac.onGround) {
        lines.push([{ text: `${ac.type.icao} ${ac.type.wake}`, item: 'type' }, { text: ' ' }, { text: statusCode(ac, this.statusStyle), item: 'status' }]);
        const target = clearedTo(ac) || (!dep && ac.assignedStand ? `>${ac.assignedStand}` : '');
        const third: Part[] = [];
        if (dep && ac.flightPlan.sid) third.push({ text: ac.flightPlan.sid, item: 'sid' }, { text: ' ' });
        third.push({ text: target || '---', item: 'target' });
        const seq = ac.sequence ? ` #${ac.sequence.number}` : '';
        const int = dep && ac.earliestIntersection ? ` INT ${ac.earliestIntersection}` : '';
        third.push({ text: `${kt > 1 ? ` ${kt}` : ''}${seq}${int}` });
        lines.push(third);
      } else {
        lines.push([{ text: `${ac.type.icao} ${ac.type.wake}`, item: 'type' }]);
        lines.push([{ text: `A${String(Math.round(ac.altitudeFt / 100)).padStart(3, '0')} ${kt}` }]);
        lines.push(dep ? [{ text: ac.flightPlan.sid ?? ac.flightPlan.destination, item: 'sid' }] : [{ text: `${this.sim.approachType} ${ac.runway ?? ''}`.trim() }]);
      }
    }
    const k = this.tagScale;
    ctx.font = `${Math.round(11 * k)}px Consolas, Menlo, monospace`;
    const lh = Math.round(12 * k);
    const widths = lines.map((l) => ctx.measureText(l.map((x) => x.text).join('')).width);
    const w = Math.max(...widths) + 4;
    const hgt = lines.length * lh + 2;
    const tx = p.x + off.x;
    const ty = p.y + off.y;
    const selected = ac.callsign === this.selected;
    ctx.save();
    if (this.dimmed(ac) && !selected) ctx.globalAlpha = 0.55;
    // leader line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    const lx = Math.min(Math.max(p.x, tx), tx + w);
    const ly = Math.min(Math.max(p.y, ty), ty + hgt);
    ctx.lineTo(lx, ly);
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.6;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    // PHX: every label on a box (selected: lighter box with a frame); classic: only selected / hovered.
    if (this.t.phx || selected || hovered) {
      ctx.fillStyle = selected ? this.t.tagBgSelected : hovered && !this.t.phx ? 'rgba(255, 255, 255, 0.05)' : this.t.tagBg;
      ctx.fillRect(tx, ty, w, hgt);
      if (selected && this.t.phx) {
        ctx.strokeStyle = color;
        ctx.strokeRect(tx + 0.5, ty + 0.5, w - 1, hgt - 1);
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const items: TagRect['items'] = [];
    lines.forEach((parts, i) => {
      let x = tx + 2;
      const y = ty + 1 + i * lh;
      for (const part of parts) {
        const pw = ctx.measureText(part.text).width;
        const isHover = hovered && part.item && this.hover?.item === part.item;
        if (isHover) {
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
    this.tagRects.push({ callsign: ac.callsign, x: tx, y: ty, w, h: hgt, items });
  }

  render(now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.t.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawChart();
    this.drawRoutes();

    this.tagRects = [];
    this.symbolHits = [];
    const list = [...this.sim.aircraft].filter((a) => a.phase !== 'gone' && (a.onGround || this.sim.distanceToThresholdNm(a) < 13 || a.altitudeFt < this.sim.airport.data.elevationFt + 5000));
    // selected last so its tag is on top
    list.sort((a, b) => (a.callsign === this.selected ? 1 : 0) - (b.callsign === this.selected ? 1 : 0));
    if (this.t.phx) this.updateHistory(list);
    for (const ac of list) this.drawAircraft(ac, this.colorFor(ac, now));
    this.drawVehicles();
    for (const ac of list) {
      // Declutter: quiet parked aircraft only get a tag when zoomed in or selected.
      const quiet = (ac.phase === 'parked' && !ac.request) || ac.phase === 'arrived';
      if (quiet && this.zoom < 0.6 && ac.callsign !== this.selected) continue;
      // Without A-SMGCS surveillance the targets have no identity: no data tags.
      if (!this.sim.systemOn('surveillance')) continue;
      // A towed aircraft has its transponder off: it is identified by the tug's squitter (vehicle tracking).
      if (ac.category === 'tow' && !this.sim.systemOn('vehicles')) continue;
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
    ctx.strokeStyle = this.t.scaleBar;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.fillStyle = this.t.scaleBar;
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x + px + 6, y + 2);
  }
}

export function defaultTagOffset(): Vec2 {
  return { x: 16, y: -42 };
}

/** Area (m²) and centroid of a polygon (vertex average for a degenerate one). */
function polygonCentre(pts: Vec2[]): { area: number; centre: Vec2 } {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-6) return { area: 0, centre: pts.reduce((acc, p) => add(acc, scale(p, 1 / pts.length)), { x: 0, y: 0 }) };
  return { area: Math.abs(a2) / 2, centre: { x: cx / (3 * a2), y: cy / (3 * a2) } };
}
