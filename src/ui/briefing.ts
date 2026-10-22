import type { BriefingSection } from '../core/airport/types';
import { capitalize, runwayWords } from '../core/runways';
import type { Simulation } from '../core/simulation';
import { h } from './dom';
import { nightRules } from '../core/night';
import { DEICING_MAX_S, DEICING_MIN_S, deicingActive } from '../core/deicing';
import { minutesToHhmm } from '../core/time';
import { formatWind } from '../core/weather';

/** Renders text with `instructions` in backticks as code. */
export function rich(text: string): (Node | string)[] {
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

  // The runway(s) in use right now.
  const w = sim.observedWind;
  const inUse = capitalize(runwayWords(sim.runways));
  const now: [string, string][] = [
    ['Runway / ATIS', `${inUse}, information ${sim.atisLetter}, wind ${formatWind(w, true)}, QNH ${sim.atis.qnh}`],
  ];
  const parallel = sim.parallelOps;
  if (parallel) {
    const mode = { independent: 'independent (no spacing between the finals)', dependent: 'dependent (1.5 NM diagonal between the finals)', staggered: 'staggered (3 NM diagonal between the finals)' }[parallel.approaches];
    now.push(['Parallel runways', `Take-offs and landings on both; each aircraft gets the runway of its apron (or the nearest one), wide-bodies from ${parallel.largeAircraft?.minWingspanM ?? '-'} m the ${parallel.largeAircraft?.runway ?? '-'} runway. Approaches ${mode}; departures from the two runways are independent.`]);
  }
  // Scenario conditions: closed taxiways, night rules, thunderstorm.
  const closed = [...sim.airport.closedTaxiways].sort();
  if (closed.length) now.push(['Closed taxiways', `${closed.join(', ')} - also their runway entries and exits. Crews refuse routes over them ("unable, taxiway ${closed[0]} closed"); automatic routes go around them.`]);
  const night = nightRules(sim);
  if (night) {
    now.push([
      'Night rules',
      `Local time ${minutesToHhmm(sim.localMinutes())}. No jet departures ${minutesToHhmm(night.jetDepartures.from)}-${minutesToHhmm(night.jetDepartures.until)} local, no landings ${minutesToHhmm(night.landings.from)}-${minutesToHhmm(night.landings.until)}` +
        `${night.delayedLandingsUntil !== undefined ? ` (delayed flights until ${minutesToHhmm(night.delayedLandingsUntil)})` : ''}. A jet still on the ground at the curfew goes back to its stand.`,
    ]);
  }
  if (deicingActive(sim)) {
    const pads = sim.airport.deicingPads;
    now.push([
      'De-icing',
      `Every departure up to ${Math.max(...pads.map((p) => p.maxWingspanM))} m wingspan is de-iced on ${pads.map((p) => `${p.name} (max. ${p.maxWingspanM} m)`).join(', ')} before take-off (${DEICING_MIN_S / 60}-${DEICING_MAX_S / 60} min, wide-bodies longer; larger aircraft on their stand). ` +
        `Taxi it to a pad first ("taxi to de-icing pad ${pads[0].name} via ..."); it reports "de-icing complete, ready for taxi". Crews refuse the runway before.`,
    ]);
  }
  if (sim.storm) now.push(['Weather', sim.storm.phase === 'overhead' ? 'Thunderstorm overhead: no pushbacks, no take-offs, windshear on final.' : 'Thunderstorm approaching.']);
  for (const runway of sim.runways) {
    const ops = sim.airport.runwayOps(runway);
    if (!ops) continue;
    // With the take-off run available where it is published; with parallel runways per runway.
    const tag = sim.runways.length > 1 ? ` ${runway}` : '';
    const entry = (e: (typeof ops.departureEntries)[number]) => `${e.holdingPoint}${e.toraM !== undefined ? ` ${e.toraM} m` : ''}`;
    const full = ops.departureEntries.filter((e) => e.fullLength).map(entry);
    const inter = ops.departureEntries.filter((e) => !e.fullLength).map(entry);
    now.push([`Departures${tag}`, `full length ${full.join(' / ') || '-'}${inter.length ? `; intersections ${inter.join(', ')} (ask "able" first)` : ''}`]);
    now.push([`Arrival exits${tag}`, ops.exits.map((x) => `${x.name}${x.rapid ? ' (rapid)' : ''}`).join(', ')]);
    if (ops.flows?.length) now.push([`Taxi flows${tag}`, ops.flows.map((f) => `${f.taxiway} ${f.direction}bound`).join(', ')]);
  }

  const sections = (ap.briefing ?? []).filter((s) => !s.positions || s.positions.some((p) => sim.userControls(p)));
  return h(
    'div.briefing',
    {},
    h('div.sub', { text: `Briefing for ${mine.map((s) => s.callsign).join(' + ')}. Everything here is also in the documentation; open it again at any time with BRIEFING in the toolbar.` }),
    h('h2', { text: 'At a glance' }),
    table(undefined, glance),
    h('h2', { text: `Now: ${runwayWords(sim.runways)} in use` }),
    table(undefined, now),
    ...sections.map(section),
    h('h2', { text: 'Frequencies' }),
    table(undefined, freqs),
    h('div.notice', { text: ap.dataNotice }),
  );
}
