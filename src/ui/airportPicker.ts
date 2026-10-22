import type { AirportData } from '../core/airport/types';
import { PLANNED_AIRPORTS, REGIONS, regionOf, trafficLevel, type ContinentInfo, type CountryInfo, type FirInfo } from '../data/regions';
import { h } from './dom';

/** Runways of an airport, e.g. "06/24 14/32". */
export const runwayList = (a: AirportData): string => a.runways.map((r) => r.name).join(' ');

/** Traffic bars (1-4) of an airport, busiest = four bars. */
export function trafficBars(a: AirportData): HTMLElement {
  const t = trafficLevel(a);
  return h('span.traffic', { title: `Traffic: about ${t.perHour} movements per hour at medium density` }, ...[1, 2, 3, 4].map((i) => h(i <= t.level ? 'i.on' : 'i')));
}

interface Item {
  /** Identifies the item when the menu opens on the current airport: continent, country, FIR or ICAO code. */
  key: string;
  label: string;
  /** Second, dimmed line. */
  detail?: string;
  /** Shown on the right (traffic bars). */
  side?: HTMLElement;
  title?: string;
  /** Dimmed but selectable (a continent or country without an available airport). */
  dim?: boolean;
  disabled?: boolean;
  /** Opens the next column to the right. */
  next?: () => Column;
  /** An airport: picking it closes the menu. */
  icao?: string;
}

interface Column {
  title: string;
  cls: string;
  items: Item[];
  /** Shown when the column has no items. */
  empty?: string;
  legend?: string;
}

export interface AirportPicker {
  /** The columns; placed to the right of the Connect dialog. */
  el: HTMLElement;
  /** Opens the menu with the way to this airport expanded. */
  open(icao: string): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * Airport menu of the Connect dialog: columns that open to the right of each other - continent, country
 * (with its FIR), the FIRs of a country that has several (Germany), airports - so an earlier choice can
 * still be changed while the later columns are open.
 */
export function airportPicker(airports: AirportData[], onPick: (icao: string) => void): AirportPicker {
  // Airports whose FIR is not in REGIONS are listed under "Other".
  const others = airports.filter((a) => !regionOf(a.fir));
  const continents: ContinentInfo[] = others.length ? [...REGIONS, { name: 'Other', countries: [{ name: 'Other airports', firs: [{ icao: '', name: 'Other airports' }] }] }] : REGIONS;
  const available = (fir: string) => (fir ? airports.filter((a) => a.fir === fir) : others);
  const planned = (fir: string) => PLANNED_AIRPORTS.filter((p) => p.fir === fir);
  const count = (firs: FirInfo[]) => ({
    n: firs.reduce((s, f) => s + available(f.icao).length, 0),
    planned: firs.reduce((s, f) => s + planned(f.icao).length, 0),
  });
  const countText = (c: { n: number; planned: number }) =>
    [c.n ? `${c.n} airport${c.n > 1 ? 's' : ''}` : '', c.planned ? `${c.planned} planned` : ''].filter(Boolean).join(', ') || 'No airports yet';

  const airportColumn = (fir: FirInfo): Column => ({
    title: fir.icao ? `Airports - ${fir.icao}` : 'Airports',
    cls: 'airports',
    items: [
      ...available(fir.icao).map((a) => ({
        key: a.icao,
        label: `${a.icao}  ${a.name}`,
        detail: `RWY ${runwayList(a)}`,
        side: trafficBars(a),
        title: `${a.name} (${a.city}): runways ${runwayList(a)}, about ${trafficLevel(a).perHour} movements per hour at medium traffic`,
        icao: a.icao,
      })),
      ...planned(fir.icao).map((p) => ({ key: p.icao, label: `${p.icao}  ${p.name}`, detail: 'Planned for a later version', disabled: true })),
    ],
    legend: 'Bars: traffic (4 = busiest)',
  });
  const firColumn = (country: CountryInfo): Column => ({
    title: `FIR - ${country.name}`,
    cls: 'firs',
    items: country.firs.map((f) => ({ key: f.icao, label: `${f.name} (${f.icao})`, detail: countText(count([f])), dim: !count([f]).n, next: () => airportColumn(f) })),
  });
  const countryColumn = (continent: ContinentInfo): Column => ({
    title: 'Country',
    cls: 'countries',
    items: continent.countries.map((c) => ({
      key: c.name,
      label: c.name,
      // A country with one FIR shows it here; one with several (Germany) lists them in a column of their own.
      detail: c.firs.length > 1 ? c.firs.map((f) => f.icao).join(' / ') : c.firs[0].icao ? `${c.firs[0].name} (${c.firs[0].icao})` : countText(count(c.firs)),
      title: countText(count(c.firs)),
      dim: !count(c.firs).n,
      next: () => (c.firs.length > 1 ? firColumn(c) : airportColumn(c.firs[0])),
    })),
    empty: 'No airports yet',
  });
  const continentColumn = (): Column => ({
    title: 'Continent',
    cls: 'continents',
    items: continents.map((c) => {
      const k = count(c.countries.flatMap((x) => x.firs));
      return { key: c.name, label: c.name, detail: countText(k), dim: !k.n, next: () => countryColumn(c) };
    }),
  });

  const el = h('div.picker', { hidden: true });
  /** Open columns and their items. */
  let cols: { el: HTMLElement; items: { b: HTMLButtonElement; it: Item }[] }[] = [];
  const meta = new WeakMap<HTMLElement, { depth: number; it: Item }>();

  const truncate = (depth: number) => {
    for (const c of cols.splice(depth + 1)) c.el.remove();
  };
  const activate = (depth: number, b: HTMLButtonElement, it: Item, focusNext = false) => {
    if (it.icao) {
      onPick(it.icao);
      return;
    }
    truncate(depth);
    for (const x of cols[depth].items) x.b.classList.toggle('on', x.b === b);
    if (it.next) push(it.next(), focusNext);
  };
  const push = (col: Column, focus = false) => {
    const depth = cols.length;
    const list = h('div.picker-items');
    const colEl = h(`div.picker-col.${col.cls}`, {}, h('div.ptitle', { text: col.title }), list);
    const items = col.items.map((it) => {
      const b = h(
        'button.picker-item',
        { type: 'button', disabled: it.disabled, title: it.title, class: it.dim ? 'dim' : undefined },
        h('span.pi-text', {}, h('span.pi-label', { text: it.label }), it.detail ? h('span.pi-detail', { text: it.detail }) : null),
        it.side ?? null,
        it.next ? h('span.pi-arrow', { text: '▸' }) : null,
      );
      b.addEventListener('click', () => activate(depth, b, it));
      meta.set(b, { depth, it });
      list.append(b);
      return { b, it };
    });
    if (!items.length) list.append(h('div.picker-empty', { text: col.empty ?? 'No airports yet' }));
    if (col.legend) colEl.append(h('div.picker-legend', { text: col.legend }));
    cols.push({ el: colEl, items });
    el.append(colEl);
    colEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) items.find((x) => !x.b.disabled)?.b.focus();
  };

  // Keyboard: up / down within a column, right opens the next column, left goes back.
  el.addEventListener('keydown', (e) => {
    const b = document.activeElement as HTMLButtonElement | null;
    const m = b && meta.get(b);
    if (!m) return;
    const enabled = cols[m.depth].items.filter((x) => !x.b.disabled);
    const i = enabled.findIndex((x) => x.b === b);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') enabled[(i + (e.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]?.b.focus();
    else if (e.key === 'ArrowRight' && m.it.next) activate(m.depth, b, m.it, true);
    else if (e.key === 'ArrowLeft' && m.depth > 0) cols[m.depth - 1].items.find((x) => x.b.classList.contains('on'))?.b.focus();
    else return;
    e.preventDefault();
  });

  const close = () => {
    truncate(-1);
    el.hidden = true;
  };
  return {
    el,
    open(icao) {
      close();
      el.hidden = false;
      push(continentColumn());
      // Expand the way to the current airport and mark it.
      const a = airports.find((x) => x.icao === icao);
      const r = regionOf(a?.fir);
      const keys = r ? [r.continent.name, r.country.name, ...(r.country.firs.length > 1 ? [r.fir.icao] : [])] : a ? ['Other', 'Other airports'] : [];
      keys.forEach((k, depth) => {
        const x = cols[depth]?.items.find((y) => y.it.key === k);
        if (x) activate(depth, x.b, x.it);
      });
      const cur = cols.at(-1)?.items.find((y) => y.it.key === icao);
      cur?.b.classList.add('current');
      (cur?.b ?? cols[0].items[0]?.b)?.focus();
    },
    close,
    isOpen: () => !el.hidden,
  };
}
