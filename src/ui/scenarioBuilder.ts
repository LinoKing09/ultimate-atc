import type { AirportData } from '../core/airport/types';
import {
  EVENT_LABEL,
  MAX_EVENT_MINUTE,
  SCENARIO_PRESETS,
  describeScenario,
  formatScenarioCode,
  parseScenarioCode,
  type Scenario,
  type ScenarioEventKind,
} from '../core/scenario';
import type { Density } from '../core/simulation';
import { h } from './dom';

/** A random seed for a new scenario (UI only - the simulation itself uses its seeded generator). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 36 ** 5);
}

/** Link that opens the simulator with this scenario code pre-filled. */
export function scenarioLink(code: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('scenario', code);
  return url.toString();
}

/**
 * Scenario builder: choose what to train, get a scenario code (and a link)
 * that always produces this training session. Resolves with the code to
 * use, or undefined if cancelled.
 */
export function showScenarioBuilder(airport: AirportData, initial?: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const parsed = initial ? parseScenarioCode(initial) : undefined;
    const s: Scenario =
      parsed && !('error' in parsed) && parsed.airport === airport.icao
        ? parsed
        : { airport: airport.icao, runway: undefined, density: 'medium', mix: 'balanced', heavies: false, randomEvents: true, events: [], seed: randomSeed() };

    // ---------------------------------------------------------------- controls
    const runwaySel = h('select');
    runwaySel.append(h('option', { value: '', text: 'From the wind (random)' }));
    for (const o of airport.runwayOps) runwaySel.append(h('option', { value: o.runway, text: `Runway ${o.runway}` }));
    const densitySel = h('select');
    for (const [v, t] of [
      ['light', 'Light'],
      ['medium', 'Medium'],
      ['heavy', 'Heavy'],
    ]) densitySel.append(h('option', { value: v, text: t }));
    const mixSel = h('select');
    for (const [v, t] of [
      ['balanced', 'Balanced'],
      ['departures', 'Departure push (more departures)'],
      ['arrivals', 'Arrival rush (more arrivals)'],
    ]) mixSel.append(h('option', { value: v, text: t }));
    const heavyBox = h('input', { type: 'checkbox' });
    const randomBox = h('input', { type: 'checkbox' });
    const seedInput = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off' });
    const dice = h('button', { type: 'button', text: 'New seed', title: 'Same scenario, different traffic' });
    const eventsEl = h('div.events');
    const addEvent = h('button', { type: 'button', text: '+ Add event' });

    const codeOut = h('input', { type: 'text', readonly: true, class: 'code' });
    const descOut = h('div.sub');
    const status = h('span.val');

    const render = () => {
      runwaySel.value = s.runway ?? '';
      densitySel.value = s.density;
      mixSel.value = s.mix;
      heavyBox.checked = s.heavies;
      randomBox.checked = s.randomEvents;
      seedInput.value = s.seed.toString(36).toUpperCase();
      eventsEl.replaceChildren(
        ...s.events.map((ev, i) => {
          const kind = h('select');
          for (const k of Object.keys(EVENT_LABEL) as ScenarioEventKind[]) kind.append(h('option', { value: k, text: EVENT_LABEL[k] }));
          kind.value = ev.kind;
          kind.addEventListener('change', () => {
            ev.kind = kind.value as ScenarioEventKind;
            output();
          });
          const min = h('input', { type: 'number', min: '1', max: String(MAX_EVENT_MINUTE), value: String(ev.atMin), class: 'min' });
          min.addEventListener('input', () => {
            ev.atMin = Math.max(1, Math.min(MAX_EVENT_MINUTE, Math.round(Number(min.value) || 1)));
            output();
          });
          const del = h('button', { type: 'button', text: 'x', title: 'Remove' });
          del.addEventListener('click', () => {
            s.events.splice(i, 1);
            render();
          });
          return h('div.eventrow', {}, kind, h('span', { text: 'after' }), min, h('span', { text: 'min' }), del);
        }),
      );
      if (!s.events.length) eventsEl.append(h('div.sub', { text: 'No scheduled events.' }));
      output();
    };
    const output = () => {
      const code = formatScenarioCode(s);
      codeOut.value = code;
      descOut.textContent = describeScenario(s);
      status.textContent = '';
    };

    runwaySel.addEventListener('change', () => ((s.runway = runwaySel.value || undefined), output()));
    densitySel.addEventListener('change', () => ((s.density = densitySel.value as Density), output()));
    mixSel.addEventListener('change', () => ((s.mix = mixSel.value as Scenario['mix']), output()));
    heavyBox.addEventListener('change', () => ((s.heavies = heavyBox.checked), output()));
    randomBox.addEventListener('change', () => ((s.randomEvents = randomBox.checked), output()));
    seedInput.addEventListener('input', () => {
      const v = parseInt(seedInput.value.trim(), 36);
      if (Number.isFinite(v) && v >= 0 && v <= 0xffffffff) {
        s.seed = v;
        output();
      }
    });
    dice.addEventListener('click', () => {
      s.seed = randomSeed();
      render();
    });
    addEvent.addEventListener('click', () => {
      const last = s.events.reduce((m, e) => Math.max(m, e.atMin), 0);
      s.events.push({ kind: 'medicalArrival', atMin: Math.min(MAX_EVENT_MINUTE, last + 10) });
      render();
    });

    const presets = SCENARIO_PRESETS.map((p) => {
      const b = h('button', { type: 'button', text: p.name, title: p.description });
      b.addEventListener('click', () => {
        Object.assign(s, structuredClone(p.scenario), { seed: randomSeed() });
        render();
        descOut.textContent = `${p.description} ${describeScenario(s)}`;
      });
      return b;
    });

    const copy = async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = `${what} copied`;
      } catch {
        codeOut.select();
        status.textContent = 'Copy manually (selected)';
      }
    };
    const copyCode = h('button', { type: 'button', text: 'Copy code' });
    copyCode.addEventListener('click', () => void copy(codeOut.value, 'Code'));
    const copyLink = h('button', { type: 'button', text: 'Copy link' });
    copyLink.addEventListener('click', () => void copy(scenarioLink(codeOut.value), 'Link'));
    const cancel = h('button', { type: 'button', text: 'Cancel' });
    const use = h('button.primary', { type: 'button', text: 'Use this scenario' });

    const dialog = h(
      'div.dialog.wide.scenario',
      {},
      h('div.dtitle', {}, h('span', { text: `SCENARIO BUILDER - ${airport.icao}` })),
      h(
        'div.dbody',
        {},
        h('div.sub', {
          text: 'Choose what you want to train. The scenario code stores all of it plus the seed: the same code always gives the same traffic and the same events (as long as your instructions are the same).',
        }),
        h('h2', { text: 'Presets' }),
        h('div.positions', {}, ...presets),
        h('h2', { text: 'Traffic' }),
        h(
          'div.grid',
          {},
          h('label', { text: 'Runway in use' }),
          runwaySel,
          h('label', { text: 'Density' }),
          densitySel,
          h('label', { text: 'Traffic mix' }),
          mixSel,
          h('label', { text: 'More heavies' }),
          h('label', {}, heavyBox, ' about one in three flights is a wide-body'),
          h('label', { text: 'Random events' }),
          h('label', {}, randomBox, ' rare emergencies and rejected take-offs at random'),
          h('label', { text: 'Seed' }),
          h('div.rangerow', {}, seedInput, dice),
        ),
        h('h2', { text: 'Scheduled events' }),
        eventsEl,
        h('div', {}, addEvent),
        h('h2', { text: 'Scenario code' }),
        h('div.rangerow', {}, codeOut, copyCode, copyLink),
        descOut,
        h('div.actions', {}, status, cancel, use),
      ),
    );
    const overlay = h('div.overlay', {}, dialog);
    const close = (code?: string) => {
      overlay.remove();
      resolve(code);
    };
    cancel.addEventListener('click', () => close());
    use.addEventListener('click', () => close(codeOut.value));
    document.body.append(overlay);
    render();
  });
}
