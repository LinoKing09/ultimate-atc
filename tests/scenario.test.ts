import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { SCENARIO_PRESETS, formatScenarioCode, parseScenarioCode, type Scenario } from '../src/core/scenario';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

function simFor(code: string, generateTraffic = true): Simulation {
  const sc = parseScenarioCode(code) as Scenario;
  return new Simulation({
    airport: EDDS,
    position: 'GND',
    density: sc.density,
    eventLevel: sc.eventLevel,
    seed: sc.seed,
    runway: sc.runway,
    generateTraffic,
    scenario: { mix: sc.mix, heavyLevel: sc.heavyLevel, events: sc.events },
  });
}

describe('scenario codes', () => {
  it('round-trips', () => {
    const s: Scenario = {
      airport: 'EDDS',
      runway: '25',
      density: 'heavy',
      mix: 'departures',
      heavyLevel: 3,
      eventLevel: 0,
      events: [
        { kind: 'windShift', atMin: 30 },
        { kind: 'medicalArrival', atMin: 10 },
      ],
      seed: 123456789,
    };
    const code = formatScenarioCode(s);
    expect(code).toBe('EDDS-25-HD1-M10W30-21I3V9');
    expect(parseScenarioCode(code)).toEqual({ ...s, events: [s.events[1], s.events[0]] });
    expect(parseScenarioCode('edds-auto-lb2-x-1')).toMatchObject({ runway: undefined, density: 'light', mix: 'balanced', heavyLevel: 0, eventLevel: 2, events: [], seed: 1 });
  });

  it('stores the five-step sliders as digits when the letters cannot express them', () => {
    const s: Scenario = { airport: 'EDDS', runway: '25', density: 'medium-heavy', mix: 'more-arrivals', heavyLevel: 1, eventLevel: 4, events: [], seed: 42 };
    const code = formatScenarioCode(s);
    expect(code).toBe('EDDS-25-4414-X-16');
    expect(parseScenarioCode(code)).toEqual(s);
    // Letter form whenever possible, so codes from before 0.9 stay the same.
    expect(formatScenarioCode({ ...s, density: 'heavy', mix: 'departures', heavyLevel: 3, eventLevel: 2 })).toBe('EDDS-25-HD3-X-16');
    expect(formatScenarioCode({ ...s, density: 'light', mix: 'balanced', heavyLevel: 0, eventLevel: 1 })).toBe('EDDS-25-1301-X-16');
    for (const bad of ['EDDS-25-6300-X-1', 'EDDS-25-3305-X-1', 'EDDS-25-330-X-1']) expect(parseScenarioCode(bad)).toHaveProperty('error');
  });

  it('rejects invalid codes', () => {
    for (const bad of ['EDDS-25', 'EDDS-25-QB0-X-1', 'EDDS-25-MB0-M10Z5-1', 'EDDS-25-MB0-X-!!', 'EDDS-25-MB0-X-ZZZZZZZ']) {
      expect(parseScenarioCode(bad)).toHaveProperty('error');
    }
  });

  it('presets produce valid codes', () => {
    for (const p of SCENARIO_PRESETS) {
      const code = formatScenarioCode({ ...p.scenario, airport: 'EDDS', seed: 42 });
      expect(parseScenarioCode(code)).not.toHaveProperty('error');
    }
  });
});

describe('traffic sliders', () => {
  it('intermediate density and mix steps set the rates', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', density: 'light-medium', seed: 1, generateTraffic: false, scenario: { mix: 'more-departures' } });
    expect(sim.traffic.rates).toEqual({ departures: 11 * 1.3, arrivals: 10 * 0.75 });
  });

  it('special event steps scale the chances (never, standard, often)', () => {
    const factor = (cfg: { events?: boolean; eventLevel?: number }) => new Simulation({ airport: EDDS, position: 'GND', density: 'light', seed: 1, generateTraffic: false, ...cfg }).eventFactor;
    expect(factor({ eventLevel: 0 })).toBe(0);
    expect(factor({ eventLevel: 2 })).toBe(1);
    expect(factor({ eventLevel: 4 })).toBe(4);
    expect(factor({ events: false })).toBe(0);
    expect(factor({})).toBe(1);
  });

  it('a larger share of heavies gives more wide-bodies', () => {
    // Share of wide-bodies among 1000 picked flights (operator and type, before a stand is looked for).
    const share = (heavyLevel: number) => {
      const sim = new Simulation({ airport: EDDS, position: 'GND', density: 'light', seed: 5, generateTraffic: false, scenario: { heavyLevel } });
      const pick = (sim.traffic as unknown as { pickSpec(): { type: { wake: string } } }).pickSpec.bind(sim.traffic);
      let n = 0;
      for (let i = 0; i < 1000; i++) if (pick().type.wake === 'H') n++;
      return n / 1000;
    };
    const normal = share(0);
    expect(share(1)).toBeGreaterThan(normal + 0.05);
    expect(share(4)).toBeGreaterThan(0.45);
    expect(share(4)).toBeLessThan(0.6);
  });
});

describe('scenario simulation', () => {
  it('the same code gives the same traffic', () => {
    const callsigns = (s: Simulation) => {
      s.tick(5);
      for (let t = 0; t < 600; t++) s.tick(1);
      return s.aircraft.map((a) => `${a.callsign}/${a.type.icao}/${a.stand ?? ''}`).join(',');
    };
    const code = 'EDDS-AUTO-MB0-X-ABC12';
    expect(callsigns(simFor(code))).toBe(callsigns(simFor(code)));
    expect(callsigns(simFor(code))).not.toBe(callsigns(simFor('EDDS-AUTO-MB0-X-ABC13')));
  });

  it('fixes the runway and adds heavies', () => {
    const sim = simFor('EDDS-07-HB1-X-7');
    expect(sim.runway).toBe('07');
    for (let t = 0; t < 1800; t++) sim.tick(1);
    const all = sim.aircraft;
    expect(all.filter((a) => a.type.wake === 'H').length).toBeGreaterThanOrEqual(2);
  });

  it('a departure push generates more departures than arrivals', () => {
    const sim = simFor('EDDS-25-HD0-X-5');
    const seen = new Map<string, string>();
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      for (const a of sim.aircraft) seen.set(a.callsign, a.category);
    }
    const dep = [...seen.values()].filter((c) => c === 'departure').length;
    const arr = [...seen.values()].filter((c) => c === 'arrival').length;
    expect(dep).toBeGreaterThan(arr * 2);
  }, 30000);

  it('schedules a medical emergency for the next arrival', () => {
    const sim = simFor('EDDS-25-MB0-M1-9');
    let found: Aircraft | undefined;
    for (let t = 0; t < 900 && !found; t++) {
      sim.tick(1);
      found = sim.aircraft.find((a) => a.category === 'arrival' && a.emergency === 'medical');
    }
    expect(found).toBeDefined();
    expect(sim.time).toBeGreaterThanOrEqual(60);
  });

  it('marks a departure for a medical emergency', () => {
    const sim = simFor('EDDS-25-MB0-D2-9');
    for (let t = 0; t < 130; t++) sim.tick(1);
    expect(sim.aircraft.filter((a) => a.plannedMedical).length).toBeGreaterThanOrEqual(1);
  });

  it('shifts the wind and asks for a runway change', () => {
    const sim = simFor('EDDS-25-MB0-W1-9', false);
    const before = { ...sim.observedWind };
    for (let t = 0; t < 70; t++) sim.tick(1);
    expect(sim.observedWind.direction).not.toBe(before.direction);
    expect(sim.messages.some((m) => /Supervisor: the surface wind is now .* runway 07/.test(m.text))).toBe(true);
    expect(sim.atis.wind).toEqual(before); // the ATIS changes only when you broadcast it
    sim.updateAtis({ runway: '07', wind: sim.observedWind });
    expect(sim.runway).toBe('07');
  });

  it('forces a rejected take-off', () => {
    const sim = simFor('EDDS-25-MB0-R1-3');
    for (let t = 0; t < 3600 && sim.stats.rejectedTakeoffs === 0; t++) {
      sim.tick(1);
      for (const ac of sim.aircraft) {
        if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
        if (ac.request === 'pushback') sim.transmit(`${ac.callsign} push and start approved`);
        if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway 25`);
        if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
      }
    }
    expect(sim.stats.rejectedTakeoffs).toBe(1);
  }, 30000);
});
