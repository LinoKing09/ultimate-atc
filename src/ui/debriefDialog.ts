import { debrief } from '../core/debrief';
import type { Simulation } from '../core/simulation';
import { h } from './dom';

/** Simulation time as mm:ss since the session start (or h:mm:ss). */
function at(seconds: number): string {
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/**
 * Debriefing after a session (DISCONNECT): what earned points, what cost
 * points, response times, incidents and advice for the next session.
 */
export function showDebrief(sim: Simulation, actions: { onContinue: () => void; onEnd: () => void }): void {
  document.querySelector('.overlay.debrief')?.remove();
  const d = debrief(sim);
  const table = (rows: { label: string; count: number; points: number }[], empty: string) =>
    rows.length
      ? h(
          'table.debrief-table',
          {},
          ...rows.map((r) => h('tr', {}, h('td', { text: r.label }), h('td.num', { text: String(r.count) }), h(`td.num.${r.points >= 0 ? 'plus' : 'minus'}`, { text: `${r.points > 0 ? '+' : ''}${r.points}` }))),
        )
      : h('div.sub', { text: empty });
  const list = (items: { time: number; text: string }[]) => h('ul.debrief-list', {}, ...items.map((i) => h('li', { text: `${at(i.time)}  ${i.text}` })));
  const body = h(
    'div.dbody',
    {},
    h('div.debrief-head', {}, h('div', {}, h('div.sub', { text: `${d.positions.join(' + ')} - ${Math.round(d.durationS / 60)} min of traffic` }), h('div.debrief-score', { text: `SCORE ${d.score}` }))),
    h(
      'div.sub',
      {},
      `${d.departuresAirborne} departures airborne, ${d.answered} requests answered, average answer time ${Math.round(d.averageWaitS)} s` +
        (d.longestWaits.length ? ` (longest: ${d.longestWaits.map((w) => `${w.callsign} ${w.seconds} s`).join(', ')})` : ''),
    ),
    h('h2', { text: 'What went well' }),
    table(d.good, 'Nothing scored yet.'),
    h('h2', { text: 'What cost points' }),
    table(d.costs, 'Nothing - no points lost.'),
    ...(d.incidents.length ? [h('h2', { text: 'Incidents' }), list(d.incidents)] : []),
    ...(d.warnings.length ? [h('h2', { text: 'Warnings' }), list(d.warnings)] : []),
    h('h2', { text: 'For the next session' }),
    h('ul.debrief-list', {}, ...d.tips.map((t) => h('li', { text: t }))),
  );
  const cont = h('button', { type: 'button', text: 'Continue session' });
  const end = h('button.primary', { type: 'button', text: 'End session' });
  const overlay = h('div.overlay.debrief', {}, h('div.dialog.wide', {}, h('div.dtitle', {}, h('span', { text: 'DEBRIEFING' })), body, h('div.actions', {}, cont, end)));
  cont.addEventListener('click', () => {
    overlay.remove();
    actions.onContinue();
  });
  end.addEventListener('click', () => actions.onEnd());
  document.body.append(overlay);
}
