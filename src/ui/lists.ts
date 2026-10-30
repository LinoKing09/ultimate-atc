import type { Aircraft } from '../core/aircraft';
import type { Simulation } from '../core/simulation';
import { formatDuration, h } from './dom';
import { hhmm } from '../core/delivery';
import { clearedTo, requestLabel, statusCode, type StatusStyle } from './labels';
import type { TagItem } from './scope';

/** Cell functions of the lists: the tag items plus the squawk and the clearance flag. */
export type ListItem = TagItem | 'squawk' | 'clearance';

interface Column {
  key: string;
  label: string;
  cls?: string;
  /** Clicking the cell opens this function (EuroScope list items), e.g. the SID or the taxi menu. */
  item?: ListItem;
  get: (ac: Aircraft, sim: Simulation, style: StatusStyle) => string;
}

/**
 * EuroScope-style departure and arrival lists (column order as in the VATSIM Germany profile: the
 * request with its waiting time first). Rows are clickable (select) and double-clickable (centre the
 * scope on the aircraft); cells with a function (callsign, SID, squawk, clearance, taxi, status) open
 * it like the items of a data tag.
 */
export class TrafficList {
  /** Ground state names (follows the scope style). */
  statusStyle: StatusStyle = 'phx';

  readonly el: HTMLElement;
  private readonly tbody: HTMLTableSectionElement;
  private readonly countEl: HTMLElement;
  private readonly rows = new Map<string, HTMLTableRowElement>();

  constructor(
    title: string,
    private readonly columns: Column[],
    private readonly filter: (ac: Aircraft) => boolean,
    private readonly cb: ListCallbacks,
    position: { left?: string; right?: string; top: string },
    /** Hide the whole panel while the list is empty. */
    private readonly hideWhenEmpty = false,
  ) {
    this.countEl = h('span.count');
    const collapse = h('button', { title: 'Collapse / expand', text: '_' });
    const titleBar = h('div.title', {}, h('span', {}, title, this.countEl), collapse);
    this.tbody = h('tbody');
    const table = h('table', {}, h('thead', {}, h('tr', {}, ...columns.map((c) => h('th', { text: c.label })))), this.tbody);
    this.el = h('div.panel', {}, titleBar, h('div.body', {}, table));
    this.el.classList.add(title.toLowerCase());
    Object.assign(this.el.style, position);
    // The list you touch comes to the front: an expanded list must not lie under another one
    // (on a phone the collapsed arrivals list covered the collapse button of the expanded departures list).
    this.el.addEventListener('pointerdown', () => bringToFront(this.el), true);
    collapse.addEventListener('click', () => {
      this.el.classList.toggle('collapsed');
      bringToFront(this.el);
      keepInside(this.el);
    });
    // Turning the phone (or resizing the window) must not leave a list outside the screen.
    window.addEventListener('resize', () => requestAnimationFrame(() => keepInside(this.el)));
    makeDraggable(this.el, titleBar, () => {
      this.el.classList.toggle('collapsed');
      bringToFront(this.el);
      keepInside(this.el);
    });
  }

  update(sim: Simulation, selected?: string): void {
    const rows = sim.aircraft.filter(this.filter);
    rows.sort((a, b) => {
      const ra = a.request && sim.isOnMyFrequency(a) ? 0 : 1;
      const rb = b.request && sim.isOnMyFrequency(b) ? 0 : 1;
      return ra - rb || (ra === 0 ? a.requestSince - b.requestSince : a.spawnedAt - b.spawnedAt);
    });
    this.countEl.textContent = `(${rows.length})`;
    if (this.hideWhenEmpty) this.el.style.display = rows.length ? '' : 'none';
    if (!rows.length) {
      this.rows.clear();
      if (!this.tbody.querySelector('td.empty')) this.tbody.replaceChildren(h('tr', {}, h('td.empty', { colspan: String(this.columns.length), text: 'no traffic' })));
      return;
    }
    syncRows(
      this.tbody,
      this.rows,
      rows.map((ac) => {
        const mine = sim.isOnMyFrequency(ac);
        const req = mine && ac.request && !ac.requestAck;
        const late = req && sim.time - ac.requestSince > 60;
        return {
          key: ac.callsign,
          cls: [ac.callsign === selected ? 'selected' : '', mine ? '' : 'other', req ? 'request' : '', late ? 'late' : ''].filter(Boolean).join(' '),
          cells: this.columns.map((c) => ({ text: c.get(ac, sim, this.statusStyle), cls: [c.cls, c.item ? 'fn' : ''].filter(Boolean).join(' '), item: c.item })),
        };
      }),
      this.cb,
    );
  }
}

type ListCallbacks = {
  select(cs: string): void;
  center(cs: string): void;
  menu(cs: string, x: number, y: number): void;
  /** A cell with a function was clicked. */
  cell?(cs: string, item: ListItem, x: number, y: number): void;
};

/**
 * Updates table rows in place, keyed by callsign. Rows are never re-created
 * while their aircraft is listed: a tap that lands during an update still
 * reaches its row (on touch screens a re-created row swallowed the first tap).
 */
function syncRows(
  tbody: HTMLTableSectionElement,
  rows: Map<string, HTMLTableRowElement>,
  data: { key: string; cls: string; cells: { text: string; cls: string; item?: ListItem }[] }[],
  cb: ListCallbacks,
): void {
  const keep = new Set(data.map((d) => d.key));
  for (const [k, tr] of rows) {
    if (!keep.has(k)) {
      tr.remove();
      rows.delete(k);
    }
  }
  tbody.querySelector('td.empty')?.parentElement?.remove();
  data.forEach((d, i) => {
    let tr = rows.get(d.key);
    if (!tr) {
      const cs = d.key;
      tr = h('tr');
      tr.addEventListener('click', (e) => {
        cb.select(cs);
        const item = (e.target as HTMLElement).closest<HTMLElement>('td[data-item]')?.dataset.item as ListItem | undefined;
        if (item) cb.cell?.(cs, item, e.clientX, e.clientY);
      });
      tr.addEventListener('dblclick', () => cb.center(cs));
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        cb.select(cs);
        cb.menu(cs, e.clientX, e.clientY);
      });
      rows.set(cs, tr);
    }
    if (tr.className !== d.cls) tr.className = d.cls;
    while (tr.cells.length > d.cells.length) tr.lastElementChild?.remove();
    d.cells.forEach((c, j) => {
      const td = tr.cells[j] ?? tr.appendChild(h('td'));
      if (td.textContent !== c.text) td.textContent = c.text;
      if (td.className !== c.cls) td.className = c.cls;
      if ((td.dataset.item ?? '') !== (c.item ?? '')) {
        if (c.item) td.dataset.item = c.item;
        else delete td.dataset.item;
      }
    });
    if (tbody.children[i] !== tr) tbody.insertBefore(tr, tbody.children[i] ?? null);
  });
}

/** The list touched last lies on top of the other lists (`.panel.front`, still below menus and dialogs). */
function bringToFront(panel: HTMLElement): void {
  if (panel.classList.contains('front')) return;
  panel.parentElement?.querySelectorAll('.panel.front').forEach((p) => p.classList.remove('front'));
  panel.classList.add('front');
}

/** A finger that moves less than this (px) taps the title bar instead of dragging it. */
const TAP_SLOP_PX = 8;

/**
 * Drag a panel by its title bar (mouse, pen or finger). It stays inside the scope area, so its title bar - and
 * the collapse button - can always be reached. On touch screens a tap on the title bar calls `onTap`.
 */
function makeDraggable(panel: HTMLElement, handle: HTMLElement, onTap: () => void): void {
  let start: { x: number; y: number; left: number; top: number; id: number; touch: boolean; moved: boolean } | undefined;
  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = panel.getBoundingClientRect();
    const parent = panel.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    start = { x: e.clientX, y: e.clientY, left: r.left - parent.left, top: r.top - parent.top, id: e.pointerId, touch: e.pointerType !== 'mouse', moved: false };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
    start.moved = true;
    panel.style.right = '';
    panel.style.left = `${start.left + dx}px`;
    panel.style.top = `${start.top + dy}px`;
    keepInside(panel);
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!start || e.pointerId !== start.id) return;
    const tap = !start.moved && start.touch && !cancelled;
    start = undefined;
    if (tap) onTap();
  };
  handle.addEventListener('pointerup', (e) => end(e, false));
  handle.addEventListener('pointercancel', (e) => end(e, true));
}

/** Moves a panel back inside its parent (the scope area) where it sticks out. */
function keepInside(panel: HTMLElement): void {
  const parent = panel.offsetParent as HTMLElement | null;
  if (!parent) return;
  const p = parent.getBoundingClientRect();
  const r = panel.getBoundingClientRect();
  const left = Math.min(Math.max(0, r.left - p.left), Math.max(0, p.width - r.width));
  const top = Math.min(Math.max(0, r.top - p.top), Math.max(0, p.height - r.height));
  if (Math.abs(left - (r.left - p.left)) > 0.5 || panel.style.left) {
    panel.style.right = '';
    panel.style.left = `${left}px`;
  }
  if (Math.abs(top - (r.top - p.top)) > 0.5 || panel.style.top) panel.style.top = `${top}px`;
}

function reqCell(ac: Aircraft, sim: Simulation): string {
  if (!ac.request || !sim.isOnMyFrequency(ac)) return '';
  const seq = ac.sequence ? ` #${ac.sequence.number}` : '';
  return `${requestLabel(ac)}${seq} ${formatDuration(sim.time - ac.requestSince)}`;
}

function csCell(ac: Aircraft): string {
  return ac.emergency ? `${ac.callsign} PAN` : ac.callsign;
}

export function departureList(cb: ConstructorParameters<typeof TrafficList>[3]): TrafficList {
  return new TrafficList(
    'DEPARTURES',
    [
      { key: 'req', label: 'REQ', cls: 'req', item: 'status', get: reqCell },
      { key: 'cs', label: 'C/S', cls: 'cs', item: 'callsign', get: csCell },
      { key: 'stand', label: 'STND', get: (a) => a.stand ?? '' },
      { key: 'tsat', label: 'TSAT', get: (a, sim) => (a.tsat !== undefined && sim.systemOn('acdm') ? hhmm(sim, a.tsat) : '') },
      { key: 'ctot', label: 'CTOT', cls: 'ctot', get: (a, sim) => (a.ctot !== undefined ? hhmm(sim, a.ctot) : '') },
      { key: 'type', label: 'ATYP', item: 'type', get: (a) => a.type.icao },
      { key: 'wtc', label: 'W', get: (a) => a.type.wake },
      { key: 'ades', label: 'ADES', get: (a) => a.flightPlan.destination },
      { key: 'rwy', label: 'RWY', get: (a) => a.flightPlan.runway ?? '' },
      { key: 'sid', label: 'SID', item: 'sid', get: (a) => a.flightPlan.sid ?? '' },
      { key: 'sq', label: 'ASSR', item: 'squawk', get: (a) => a.flightPlan.squawk },
      // Clearance flag (EuroScope "C"): the IFR clearance has been given.
      { key: 'clr', label: 'C', cls: 'flag', item: 'clearance', get: (a) => (a.cleared ? '\u2713' : '') },
      // Earliest intersection the crew accepts (COORD: Ground asks every departure).
      { key: 'int', label: 'INT', get: (a) => a.earliestIntersection ?? '' },
      { key: 'taxi', label: 'TAXI', item: 'target', get: (a) => clearedTo(a) },
      { key: 'sts', label: 'STS', item: 'status', get: (a, _sim, style) => statusCode(a, style) },
      { key: 'freq', label: 'FRQ', get: (a) => a.frequency },
    ],
    (a) => a.category === 'departure' && a.phase !== 'climb' && a.phase !== 'gone',
    cb,
    { left: '8px', top: '8px' },
  );
}

/** Follow-me cars at work (rows for the vehicles list). */
const FOLLOW_ME_STATUS: Record<string, string> = { assigned: 'ASSG', toAircraft: 'PROC', leading: 'LEAD', done: 'DONE', returning: 'RTB' };

/**
 * Vehicles on your frequency: tows (an aircraft moved by a tug, which talks to
 * you under the tug's callsign) and follow-me cars. Hidden while empty.
 */
export class VehicleList {
  readonly el: HTMLElement;
  private readonly tows: TrafficList;
  private readonly tbody: HTMLTableSectionElement;
  private readonly fmTable: HTMLElement;
  private readonly fmRows = new Map<string, HTMLTableRowElement>();

  constructor(cb: ConstructorParameters<typeof TrafficList>[3]) {
    this.tows = towList(cb);
    this.el = this.tows.el;
    this.tbody = h('tbody');
    const head = ['C/S', 'TASK', 'ACFT', 'STS', 'REQ'].map((t) => h('th', { text: t }));
    this.fmTable = h('table.fm', {}, h('thead', {}, h('tr', {}, ...head)), this.tbody);
    this.el.querySelector('.body')?.append(this.fmTable);
    this.cb = cb;
  }

  private readonly cb: ConstructorParameters<typeof TrafficList>[3];

  get statusStyle(): StatusStyle {
    return this.tows.statusStyle;
  }

  set statusStyle(style: StatusStyle) {
    this.tows.statusStyle = style;
  }

  update(sim: Simulation, selected?: string): void {
    this.tows.update(sim, selected);
    const active = sim.vehicles.filter((v) => v.state !== 'idle');
    const towCount = sim.aircraft.filter((a) => a.category === 'tow' && a.phase !== 'gone' && a.phase !== 'arrived').length;
    this.el.style.display = towCount || active.length ? '' : 'none';
    this.fmTable.style.display = active.length ? '' : 'none';
    const count = this.el.querySelector('.count');
    if (count) count.textContent = `(${towCount + active.length})`;
    const towTable = this.el.querySelector<HTMLElement>('table:not(.fm)');
    if (towTable) towTable.style.display = towCount ? '' : 'none';
    syncRows(
      this.tbody,
      this.fmRows,
      active.map((v) => {
        const req = v.request ? `${v.request === 'proceed' ? 'PROC' : 'RTB'} ${formatDuration(sim.time - v.requestSince)}` : '';
        const late = v.request && sim.time - v.requestSince > 60;
        return {
          key: v.callsign,
          cls: [v.callsign === selected ? 'selected' : '', v.request ? 'request' : '', late ? 'late' : ''].filter(Boolean).join(' '),
          cells: [
            { text: v.callsign, cls: 'cs' },
            { text: 'FOLLOW-ME', cls: '' },
            { text: v.aircraft ?? '', cls: '' },
            { text: v.holding ? 'HOLD' : FOLLOW_ME_STATUS[v.state] ?? '', cls: '' },
            { text: req, cls: 'req' },
          ],
        };
      }),
      this.cb,
    );
  }
}

function towList(cb: ConstructorParameters<typeof TrafficList>[3]): TrafficList {
  return new TrafficList(
    'VEHICLES',
    [
      { key: 'req', label: 'REQ', cls: 'req', item: 'status', get: reqCell },
      { key: 'cs', label: 'C/S', cls: 'cs', item: 'callsign', get: csCell },
      { key: 'acft', label: 'ACFT', get: (a) => a.tow?.aircraft ?? '' },
      { key: 'type', label: 'ATYP', get: (a) => a.type.icao },
      { key: 'from', label: 'FROM', get: (a) => a.tow?.from ?? '' },
      { key: 'to', label: 'TO', get: (a) => a.tow?.to ?? '' },
      { key: 'sts', label: 'STS', item: 'status', get: (a, _sim, style) => statusCode(a, style) },
      { key: 'freq', label: 'FRQ', get: (a) => a.frequency },
    ],
    (a) => a.category === 'tow' && a.phase !== 'gone' && a.phase !== 'arrived',
    cb,
    { left: '8px', top: '58%' },
  );
}

export function arrivalList(cb: ConstructorParameters<typeof TrafficList>[3]): TrafficList {
  return new TrafficList(
    'ARRIVALS',
    [
      { key: 'req', label: 'REQ', cls: 'req', item: 'status', get: reqCell },
      { key: 'cs', label: 'C/S', cls: 'cs', item: 'callsign', get: csCell },
      { key: 'type', label: 'ATYP', item: 'type', get: (a) => a.type.icao },
      { key: 'wtc', label: 'W', get: (a) => a.type.wake },
      { key: 'adep', label: 'ADEP', get: (a) => a.flightPlan.departure },
      { key: 'rwy', label: 'RWY', get: (a) => a.runway ?? '' },
      { key: 'apch', label: 'APCH', get: (a, sim) => (a.phase === 'approach' ? sim.approachTypeFor(a.runway ?? sim.runway) : '') },
      {
        key: 'seq',
        label: 'SEQ',
        // Arrival sequence on final: number 1 is the closest.
        get: (a, sim) => {
          if (a.phase !== 'approach') return '';
          const d = sim.distanceToThresholdNm(a);
          return String(1 + sim.aircraft.filter((o) => o.phase === 'approach' && sim.distanceToThresholdNm(o) < d).length);
        },
      },
      { key: 'lnd', label: 'LND', get: (a) => (a.phase === 'approach' && a.landingCleared ? 'CLR' : '') },
      {
        key: 'dist',
        label: 'DIST',
        get: (a, sim) => (a.phase === 'approach' ? `${sim.distanceToThresholdNm(a).toFixed(1)}nm` : a.exitName ?? ''),
      },
      { key: 'std', label: 'STND', item: 'target', get: (a) => (a.phase === 'arrived' ? a.stand ?? '' : clearedTo(a) || (a.assignedStand ? `(${a.assignedStand})` : '')) },
      { key: 'sts', label: 'STS', item: 'status', get: (a, _sim, style) => statusCode(a, style) },
      { key: 'freq', label: 'FRQ', get: (a) => a.frequency },
    ],
    (a) => a.category === 'arrival' && a.phase !== 'gone' && a.phase !== 'goAround',
    cb,
    { right: '8px', top: '8px' },
  );
}
