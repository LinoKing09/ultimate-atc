import type { AirportData } from '../core/airport/types';
import { closureProblems } from '../core/airport/validate';
import { minutesToHhmm } from '../core/time';
import {
  EVENT_LABEL,
  MAX_EVENT_MINUTE,
  presetsFor,
  describeScenario,
  formatScenarioCode,
  parseScenarioCode,
  type Scenario,
  type ScenarioEventKind,
} from '../core/scenario';
import { DEFAULT_EVENT_LEVEL, DENSITIES, EVENT_LEVELS, HEAVY_SHARES, MIXES, densityIndex, mixIndex } from '../core/levels';
import { levelSlider } from './levelSlider';
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
        : { airport: airport.icao, runway: undefined, density: 'medium', mix: 'balanced', heavyLevel: 0, eventLevel: DEFAULT_EVENT_LEVEL, events: [], seed: randomSeed() };

    // ---------------------------------------------------------------- controls
    const runwaySel = h('select');
    runwaySel.append(h('option', { value: '', text: 'From the wind (random)' }));
    for (const o of airport.runwayOps) runwaySel.append(h('option', { value: o.runway, text: `Runway ${o.runway}` }));
    const densitySlider = levelSlider(DENSITIES.map((d) => d.label), densityIndex(s.density), (i) => ((s.density = DENSITIES[i].value), output()));
    const mixSlider = levelSlider(MIXES.map((m) => m.label), mixIndex(s.mix), (i) => ((s.mix = MIXES[i].value), output()));
    const heavySlider = levelSlider(HEAVY_SHARES.map((x) => x.label), s.heavyLevel, (i) => ((s.heavyLevel = i), output()));
    const eventSlider = levelSlider(EVENT_LEVELS.map((x) => x.label), s.eventLevel, (i) => ((s.eventLevel = i), output()));
    const seedInput = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off' });
    const dice = h('button', { type: 'button', text: 'New seed', title: 'Same scenario, different traffic' });
    const startInput = h('input', { type: 'time', class: 'start' });
    const nightBox = h('input', { type: 'checkbox' });
    const night = airport.nightRestrictions;
    const deiceBox = h('input', { type: 'checkbox' });
    const pads = (airport.deicingPads ?? []).map((p) => p.name);
    // Taxiways that can be closed (not taxilanes on the aprons, not runway strips).
    const taxiways = [...new Set(airport.taxiEdges.filter((e) => e.kind === 'taxiway').map((e) => e.name.toUpperCase()))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const closedBoxes = new Map(taxiways.map((t) => [t, h('input', { type: 'checkbox', value: t })]));
    const closedEl = h('div.taxiways', {}, ...taxiways.map((t) => h('label', {}, closedBoxes.get(t)!, ` ${t}`)));
    const closedStatus = h('div.sub');
    const eventsEl = h('div.events');
    const addEvent = h('button', { type: 'button', text: '+ Add event' });

    const codeOut = h('input', { type: 'text', readonly: true, class: 'code' });
    const descOut = h('div.sub');
    const status = h('span.val');

    const render = () => {
      runwaySel.value = s.runway ?? '';
      densitySlider.set(densityIndex(s.density));
      mixSlider.set(mixIndex(s.mix));
      heavySlider.set(s.heavyLevel);
      eventSlider.set(s.eventLevel);
      seedInput.value = s.seed.toString(36).toUpperCase();
      startInput.value = s.startLocal ? `${s.startLocal.slice(0, 2)}:${s.startLocal.slice(2)}` : '';
      nightBox.checked = !!s.nightRules;
      deiceBox.checked = !!s.deicing;
      for (const [t, box] of closedBoxes) box.checked = !!s.closedTaxiways?.includes(t);
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
    let closureCache: { key: string; problems: string[] } = { key: '', problems: [] };
    const output = () => {
      const code = formatScenarioCode(s);
      codeOut.value = code;
      descOut.textContent = describeScenario(s);
      status.textContent = '';
      // A closure that cuts stands off from the runway cannot be used.
      const key = (s.closedTaxiways ?? []).join(',');
      if (key !== closureCache.key) closureCache = { key, problems: key ? closureProblems(airport, s.closedTaxiways!) : [] };
      const problems = closureCache.problems;
      closedStatus.textContent = problems.length
        ? `Not possible: ${problems.slice(0, 2).join('; ')}${problems.length > 2 ? ` (+${problems.length - 2} more)` : ''}.`
        : s.closedTaxiways?.length
          ? 'Every stand still reaches the runways. Routes over a closed taxiway are refused by the crews.'
          : 'No taxiway closed.';
      closedStatus.style.color = problems.length ? 'var(--danger)' : '';
      use.disabled = copyCode.disabled = copyLink.disabled = problems.length > 0;
    };

    runwaySel.addEventListener('change', () => ((s.runway = runwaySel.value || undefined), output()));
    startInput.addEventListener('change', () => {
      const v = startInput.value.replace(':', '');
      s.startLocal = /^\d{4}$/.test(v) ? v : undefined;
      output();
    });
    nightBox.addEventListener('change', () => ((s.nightRules = nightBox.checked || undefined), output()));
    deiceBox.addEventListener('change', () => ((s.deicing = deiceBox.checked || undefined), output()));
    for (const [t, box] of closedBoxes) {
      box.addEventListener('change', () => {
        const set = new Set(s.closedTaxiways ?? []);
        if (box.checked) set.add(t);
        else set.delete(t);
        s.closedTaxiways = set.size ? [...set].sort() : undefined;
        output();
      });
    }
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

    const presets = presetsFor(airport).map((p) => {
      const b = h('button', { type: 'button', text: p.name, title: p.description });
      b.addEventListener('click', () => {
        // Options a preset does not set are cleared.
        Object.assign(s, { startLocal: undefined, nightRules: undefined, closedTaxiways: undefined, deicing: undefined }, structuredClone(p.scenario), { seed: randomSeed() });
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
          densitySlider.el,
          h('label', { text: 'Traffic mix' }),
          mixSlider.el,
          h('label', { text: 'Heavies' }),
          heavySlider.el,
          h('label', { text: 'Random events' }),
          eventSlider.el,
          h('label', { text: 'Seed' }),
          h('div.rangerow', {}, seedInput, dice),
        ),
        h('h2', { text: 'Conditions' }),
        h(
          'div.grid',
          {},
          h('label', { text: 'Start time (local)' }),
          h('div.rangerow', {}, startInput, h('span.sub', { text: 'empty = now' })),
          ...(night
            ? [
                h('label', { text: 'Night restrictions' }),
                h('label', {}, nightBox, ` no jet departures ${minutesToHhmm(night.jetDepartures.from)}-${minutesToHhmm(night.jetDepartures.until)}, no landings ${minutesToHhmm(night.landings.from)}-${minutesToHhmm(night.landings.until)} local${night.delayedLandingsUntil !== undefined ? ` (delayed flights until ${minutesToHhmm(night.delayedLandingsUntil)})` : ''}`),
              ]
            : []),
          ...(pads.length
            ? [
                h('label', { text: 'De-icing' }),
                h('label', {}, deiceBox, ` winter: departures are de-iced on ${pads.length > 1 ? `${pads[0]}-${pads[pads.length - 1]}` : pads[0]} before take-off`),
              ]
            : []),
        ),
        h('div.sub.closed-head', { text: 'Closed taxiways (construction works):' }),
        closedEl,
        closedStatus,
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
