import type { Aircraft } from '../core/aircraft';
import type { Simulation } from '../core/simulation';
import { formatDuration, h } from './dom';
import { hhmm } from '../core/delivery';
import { clearedTo, requestLabel, statusCode } from './labels';

/**
 * EuroScope-style departure and arrival lists. Rows are clickable (select)
 * and double-clickable (centre the scope on the aircraft).
 */
export class TrafficList {
  readonly el: HTMLElement;
  private readonly tbody: HTMLTableSectionElement;
  private readonly countEl: HTMLElement;

  constructor(
    title: string,
    private readonly columns: { key: string; label: string; cls?: string; get: (ac: Aircraft, sim: Simulation) => string }[],
    private readonly filter: (ac: Aircraft) => boolean,
    private readonly cb: { select(cs: string): void; center(cs: string): void; menu(cs: string, x: number, y: number): void },
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
    Object.assign(this.el.style, position);
    collapse.addEventListener('click', () => this.el.classList.toggle('collapsed'));
    makeDraggable(this.el, titleBar);
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
    this.tbody.replaceChildren();
    if (!rows.length) {
      this.tbody.append(h('tr', {}, h('td.empty', { colspan: String(this.columns.length), text: 'no traffic' })));
      return;
    }
    for (const ac of rows) {
      const mine = sim.isOnMyFrequency(ac);
      const req = mine && ac.request;
      const late = req && sim.time - ac.requestSince > 60;
      const tr = h(`tr${ac.callsign === selected ? '.selected' : ''}${mine ? '' : '.other'}${req ? '.request' : ''}${late ? '.late' : ''}`);
      for (const c of this.columns) tr.append(h('td', { class: c.cls, text: c.get(ac, sim) }));
      tr.addEventListener('click', () => this.cb.select(ac.callsign));
      tr.addEventListener('dblclick', () => this.cb.center(ac.callsign));
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.cb.select(ac.callsign);
        this.cb.menu(ac.callsign, e.clientX, e.clientY);
      });
      this.tbody.append(tr);
    }
  }
}

function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let start: { x: number; y: number; left: number; top: number } | undefined;
  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    const r = panel.getBoundingClientRect();
    const parent = panel.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    start = { x: e.clientX, y: e.clientY, left: r.left - parent.left, top: r.top - parent.top };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start) return;
    panel.style.right = '';
    panel.style.left = `${Math.max(0, start.left + e.clientX - start.x)}px`;
    panel.style.top = `${Math.max(0, start.top + e.clientY - start.y)}px`;
  });
  handle.addEventListener('pointerup', () => (start = undefined));
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
      { key: 'cs', label: 'C/S', cls: 'cs', get: csCell },
      { key: 'type', label: 'TYPE', get: (a) => `${a.type.icao}/${a.type.wake}` },
      { key: 'stand', label: 'STD', get: (a) => a.stand ?? '' },
      { key: 'ades', label: 'ADES', get: (a) => a.flightPlan.destination },
      { key: 'sid', label: 'SID', get: (a) => a.flightPlan.sid ?? '' },
      { key: 'rwy', label: 'RWY', get: (a) => a.flightPlan.runway ?? '' },
      { key: 'ifr', label: 'IFR', get: (a) => (a.cleared ? 'CLR' : '') },
      { key: 'sq', label: 'SQ', get: (a) => a.flightPlan.squawk },
      { key: 'tsat', label: 'TSAT', get: (a, sim) => (a.tsat !== undefined && sim.systemOn('acdm') ? hhmm(sim, a.tsat) : '') },
      { key: 'ctot', label: 'CTOT', cls: 'ctot', get: (a, sim) => (a.ctot !== undefined ? hhmm(sim, a.ctot) : '') },
      { key: 'clr', label: 'TAXI', get: (a) => clearedTo(a) },
      { key: 'sts', label: 'STS', get: (a) => statusCode(a) },
      { key: 'freq', label: 'FRQ', get: (a) => a.frequency },
      { key: 'req', label: 'REQ', cls: 'req', get: reqCell },
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
    this.tbody.replaceChildren();
    for (const v of active) {
      const req = v.request ? `${v.request === 'proceed' ? 'PROC' : 'RTB'} ${formatDuration(sim.time - v.requestSince)}` : '';
      const late = v.request && sim.time - v.requestSince > 60;
      const tr = h(`tr${v.callsign === selected ? '.selected' : ''}${v.request ? '.request' : ''}${late ? '.late' : ''}`);
      for (const [t, cls] of [
        [v.callsign, 'cs'],
        ['FOLLOW-ME', ''],
        [v.aircraft ?? '', ''],
        [v.holding ? 'HOLD' : FOLLOW_ME_STATUS[v.state] ?? '', ''],
        [req, 'req'],
      ])
        tr.append(h('td', { class: cls, text: t }));
      tr.addEventListener('click', () => this.cb.select(v.callsign));
      tr.addEventListener('dblclick', () => this.cb.center(v.callsign));
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.cb.select(v.callsign);
        this.cb.menu(v.callsign, e.clientX, e.clientY);
      });
      this.tbody.append(tr);
    }
  }
}

function towList(cb: ConstructorParameters<typeof TrafficList>[3]): TrafficList {
  return new TrafficList(
    'VEHICLES',
    [
      { key: 'cs', label: 'C/S', cls: 'cs', get: csCell },
      { key: 'acft', label: 'ACFT', get: (a) => a.tow?.aircraft ?? '' },
      { key: 'type', label: 'TYPE', get: (a) => a.type.icao },
      { key: 'from', label: 'FROM', get: (a) => a.tow?.from ?? '' },
      { key: 'to', label: 'TO', get: (a) => a.tow?.to ?? '' },
      { key: 'sts', label: 'STS', get: (a) => statusCode(a) },
      { key: 'freq', label: 'FRQ', get: (a) => a.frequency },
      { key: 'req', label: 'REQ', cls: 'req', get: reqCell },
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
      { key: 'cs', label: 'C/S', cls: 'cs', get: csCell },
      { key: 'type', label: 'TYPE', get: (a) => `${a.type.icao}/${a.type.wake}` },
      { key: 'adep', label: 'ADEP', get: (a) => a.flightPlan.departure },
      { key: 'rwy', label: 'RWY', get: (a) => a.runway ?? '' },
      { key: 'apch', label: 'APCH', get: (a, sim) => (a.phase === 'approach' ? sim.approachType : '') },
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
      { key: 'std', label: 'STD', get: (a) => (a.phase === 'arrived' ? a.stand ?? '' : clearedTo(a) || (a.assignedStand ? `(${a.assignedStand})` : '')) },
      { key: 'sts', label: 'STS', get: (a) => statusCode(a) },
      { key: 'freq', label: 'FRQ', get: (a) => a.frequency },
      { key: 'req', label: 'REQ', cls: 'req', get: reqCell },
    ],
    (a) => a.category === 'arrival' && a.phase !== 'gone' && a.phase !== 'goAround',
    cb,
    { right: '8px', top: '8px' },
  );
}
