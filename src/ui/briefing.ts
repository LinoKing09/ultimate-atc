import type { BriefingSection } from '../core/airport/types';
import type { Simulation } from '../core/simulation';
import { h } from './dom';

/** Renders text with `instructions` in backticks as code. */
function rich(text: string): (Node | string)[] {
  return text.split(/(`[^`]+`)/).map((part) => (part.startsWith('`') && part.endsWith('`') ? h('code', { text: part.slice(1, -1) }) : part));
}

function table(head: [string, string] | undefined, rows: [string, string][]): HTMLElement {
  return h(
    'table.ref.brief',
    {},
    head ? h('thead', {}, h('tr', {}, h('th', { text: head[0] }), h('th', { text: head[1] }))) : null,
    h('tbody', {}, ...rows.map(([a, b]) => h('tr', {}, h('td', {}, ...rich(a)), h('td', {}, ...rich(b))))),
  );
}

function section(s: BriefingSection): HTMLElement {
  return h(
    'div.bsection',
    {},
    h('h2', { text: s.title }),
    s.items?.length ? h('ul', {}, ...s.items.map((t) => h('li', {}, ...rich(t)))) : null,
    s.table ? table(s.table.head, s.table.rows) : null,
  );
}

/**
 * Airport briefing for the current position: facts taken from the airport
 * data (always up to date, including the runway in use right now) followed
 * by the airport's own briefing sections.
 */
export function renderBriefing(sim: Simulation): HTMLElement {
  const ap = sim.config.airport;
  const mine = ap.stations.filter((s) => sim.userControls(s.type));

  const runways = ap.runways.map((r) => {
    const len = r.lengthM ?? Math.round(Math.max(...r.ends.map((e) => sim.airport.runwayEnd(e.name)?.length ?? 0)));
    return `${r.ends.map((e) => e.name).join('/')} (${len} x ${r.widthM} m)`;
  });
  const glance: [string, string][] = [
    ['Airport', `${ap.icao} - ${ap.name}${ap.city !== ap.name ? `, ${ap.city}` : ''}, ${ap.country}`],
    ['Your position', mine.map((s) => `${s.callsign}, "${s.name}", ${s.frequency}`).join(' + ')],
    ['Elevation', `${ap.elevationFt} ft`],
    ['Runways', runways.join(', ')],
    ['Transition altitude', `${ap.transitionAltitudeFt} ft`],
  ];
  const freqs: [string, string][] = ap.stations.map((s) => [s.callsign, `${s.name} ${s.frequency}${sim.userControls(s.type) ? '  (you)' : ''}`]);

  // The runway in use right now.
  const ops = sim.airport.runwayOps(sim.runway);
  const w = sim.observedWind;
  const now: [string, string][] = [
    ['Runway / ATIS', `Runway ${sim.runway}, information ${sim.atisLetter}, wind ${String(w.direction).padStart(3, '0')}/${String(w.speedKt).padStart(2, '0')} kt, QNH ${sim.atis.qnh}`],
  ];
  if (ops) {
    const full = ops.departureEntries.filter((e) => e.fullLength).map((e) => e.holdingPoint);
    const inter = ops.departureEntries.filter((e) => !e.fullLength).map((e) => e.holdingPoint);
    now.push(['Departures', `full length ${full.join(' / ') || '-'}${inter.length ? `; intersections ${inter.join(', ')} (ask "able" first)` : ''}`]);
    now.push(['Arrival exits', ops.exits.map((x) => `${x.name}${x.rapid ? ' (rapid)' : ''}`).join(', ')]);
    if (ops.flows?.length) now.push(['Taxi flows', ops.flows.map((f) => `${f.taxiway} ${f.direction}bound`).join(', ')]);
  }

  const sections = (ap.briefing ?? []).filter((s) => !s.positions || s.positions.some((p) => sim.userControls(p)));
  return h(
    'div.briefing',
    {},
    h('div.sub', { text: `Briefing for ${mine.map((s) => s.callsign).join(' + ')}. Everything here is also in the documentation; open it again at any time with BRIEFING in the toolbar.` }),
    h('h2', { text: 'At a glance' }),
    table(undefined, glance),
    h('h2', { text: `Now: runway ${sim.runway} in use` }),
    table(undefined, now),
    ...sections.map(section),
    h('h2', { text: 'Frequencies' }),
    table(undefined, freqs),
    h('div.notice', { text: ap.dataNotice }),
  );
}
