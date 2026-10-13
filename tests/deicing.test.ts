import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { DEICING_MAX_S, deicingActive, needsDeicing } from '../src/core/deicing';
import { parseTransmission } from '../src/core/phraseology/parser';
import { formatScenarioCode, parseScenarioCode, scenarioSetup, type Scenario } from '../src/core/scenario';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';
import { statusCode } from '../src/ui/labels';

function simFor(code: string, opts: { generateTraffic?: boolean; position?: 'GND' | 'TWR' } = {}): Simulation {
  const sc = parseScenarioCode(code) as Scenario;
  return new Simulation({
    airport: EDDS,
    position: opts.position ?? 'GND',
    density: sc.density,
    eventLevel: sc.eventLevel,
    seed: sc.seed,
    runway: sc.runway,
    generateTraffic: opts.generateTraffic,
    startTime: new Date('2026-01-15T07:00:00Z'),
    scenario: scenarioSetup(sc),
  });
}

function runUntil(sim: Simulation, cond: () => boolean, maxSeconds: number): boolean {
  for (let t = 0; t < maxSeconds; t++) {
    if (cond()) return true;
    sim.tick(1);
  }
  return cond();
}

function lastPilotMessage(sim: Simulation, callsign: string): string {
  const msgs = sim.messages.filter((m) => m.kind === 'pilot' && m.from === callsign);
  return msgs[msgs.length - 1]?.text ?? '';
}

/** Spawns a departure on a pushback stand and brings it to "ready for taxi". */
function readyForTaxi(sim: Simulation, stand: string, callsign: string, type = 'A320'): Aircraft {
  const ac = sim.traffic.spawnDeparture(2, { stand, callsign, type }) as Aircraft;
  expect(runUntil(sim, () => ac.request === 'pushback', 300)).toBe(true);
  sim.transmit(`${callsign} push and start approved`);
  expect(runUntil(sim, () => ac.request === 'taxi', 300)).toBe(true);
  return ac;
}

describe('de-icing: data and phraseology', () => {
  it('the scenario option I round-trips', () => {
    const s: Scenario = { airport: 'EDDS', runway: '25', density: 'medium', mix: 'balanced', heavyLevel: 0, eventLevel: 2, events: [], deicing: true, seed: 42 };
    const code = formatScenarioCode(s);
    expect(code).toBe('EDDS-25-MB2-X-I-16');
    expect(parseScenarioCode(code)).toEqual(s);
    expect(parseScenarioCode('EDDS-25-MB2-X-T0630.CE.I-16')).toMatchObject({ deicing: true, closedTaxiways: ['E'], startLocal: '0630' });
  });

  it('parses de-icing destinations', () => {
    const ctx = { callsigns: ['DLH5AB'], taxiways: new Set(['N', 'S', 'P1', 'P2']) };
    const dest = (t: string) => {
      const c = parseTransmission(t, ctx).commands[0];
      return c?.type === 'taxi' ? c.destination : undefined;
    };
    expect(dest('DLH5AB taxi to de-icing pad DP2 via N')).toEqual({ kind: 'deicing', pad: 'DP2' });
    expect(dest('DLH5AB taxi to deicing pad delta papa 3 via N')).toEqual({ kind: 'deicing', pad: 'DP3' });
    expect(dest('DLH5AB taxi to de-icing position 4')).toEqual({ kind: 'deicing', pad: 'DP4' });
    expect(dest('DLH5AB taxi to de-icing via N')).toEqual({ kind: 'deicing', pad: undefined });
  });

  it('P1 / P2 lead from N to S at the 25 end (code C only)', () => {
    const sim = simFor('EDDS-25-MB0-X-1', { generateTraffic: false });
    const from = sim.airport.node('N_D');
    const to = sim.airport.holdingPoint('A')!;
    for (const p of ['P1', 'P2']) {
      const r = findRoute(sim.airport, { node: from }, to, ['N', p, 'S'], { wingspanM: 35.8 });
      expect(isRouteError(r)).toBe(false);
      expect(isRouteError(findRoute(sim.airport, { node: from }, to, ['N', p, 'S'], { wingspanM: 60 }))).toBe(true);
    }
  });

  it('pads are never used as a short cut between N and S', () => {
    const sim = simFor('EDDS-25-MB0-X-1', { generateTraffic: false });
    const r = findRoute(sim.airport, { node: sim.airport.node('N_G') }, sim.airport.node('S_E'));
    expect(isRouteError(r)).toBe(false);
    if (!isRouteError(r)) expect(r.nodes.some((n) => /^DP\d$/.test(n.id))).toBe(false);
  });
});

describe('de-icing: operations', () => {
  it('a departure is de-iced on a pad before it taxis to the runway', () => {
    const sim = simFor('EDDS-25-MB0-X-I-1', { generateTraffic: false });
    expect(deicingActive(sim)).toBe(true);
    expect(sim.atisText()).toMatch(/de-icing in progress/i);
    const ac = readyForTaxi(sim, '14', 'DLH5AB');
    expect(lastPilotMessage(sim, 'DLH5AB')).toMatch(/ready for taxi, request de-icing/i);
    expect(needsDeicing(sim, ac)).toBe(true);

    sim.transmit('DLH5AB taxi to runway 25');
    expect(runUntil(sim, () => /we require de-icing first/i.test(lastPilotMessage(sim, 'DLH5AB')), 15)).toBe(true);
    sim.transmit('DLH5AB taxi to de-icing pad DP2 via N');
    expect(runUntil(sim, () => /taxi to de-icing pad DP2 via N/i.test(lastPilotMessage(sim, 'DLH5AB')), 15)).toBe(true);
    expect(runUntil(sim, () => ac.deicing === 'inProgress', 900)).toBe(true);
    expect(ac.deicingPad).toBe('DP2');
    expect(statusCode(ac)).toBe('DEICE');
    sim.transmit('DLH5AB taxi to runway 25 via S');
    expect(runUntil(sim, () => /de-icing in progress/i.test(lastPilotMessage(sim, 'DLH5AB')), 15)).toBe(true);

    expect(runUntil(sim, () => /de-icing complete on DP2, ready for taxi/i.test(lastPilotMessage(sim, 'DLH5AB')), DEICING_MAX_S + 120)).toBe(true);
    expect(ac.deicing).toBe('done');
    sim.transmit('DLH5AB taxi to holding point A via S');
    expect(runUntil(sim, () => ac.phase === 'holding', 900)).toBe(true);
    expect(ac.stoppedAt?.holdingPoint).toBe('A');
    expect(ac.deicingPad).toBeUndefined();
    expect(sim.stats.collisions).toBe(0);
  }, 30000);

  it('an occupied pad is refused; without a pad name the crew takes a free one', () => {
    const sim = simFor('EDDS-25-MB0-X-I-1', { generateTraffic: false });
    const a = readyForTaxi(sim, '14', 'DLH5AB');
    sim.transmit('DLH5AB taxi to de-icing pad DP1 via N');
    const b = readyForTaxi(sim, '12', 'EWG1AB');
    sim.transmit('EWG1AB taxi to de-icing pad DP1 via N');
    expect(runUntil(sim, () => /de-icing pad DP1 is occupied/i.test(lastPilotMessage(sim, 'EWG1AB')), 15)).toBe(true);
    sim.transmit('EWG1AB taxi to de-icing via N');
    expect(runUntil(sim, () => b.routeDestination?.kind === 'deicing', 15)).toBe(true);
    expect(b.deicingPad).not.toBe('DP1');
    expect(a.deicingPad).toBe('DP1');
  }, 30000);

  it('aircraft too large for the pads are de-iced on the stand', () => {
    const sim = simFor('EDDS-25-MB0-X-I-1', { generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(2, { stand: '105', callsign: 'UAE51', type: 'B788' }) as Aircraft;
    expect(needsDeicing(sim, ac)).toBe(false);
  });

  it('without the option nothing changes', () => {
    const sim = simFor('EDDS-25-MB0-X-1', { generateTraffic: false });
    const ac = readyForTaxi(sim, '14', 'DLH5AB');
    expect(needsDeicing(sim, ac)).toBe(false);
    expect(lastPilotMessage(sim, 'DLH5AB')).not.toMatch(/de-icing/);
    expect(sim.atisText()).not.toMatch(/de-icing/);
  }, 30000);

  it('AI Ground de-ices every departure in a winter hour', () => {
    const sim = simFor('EDDS-AUTO-MD0-X-I-7', { position: 'TWR' });
    // Scripted Tower: clear what calls, like the Tower benchmark's controller, kept minimal here.
    const departed = new Map<string, number>();
    const deiced = new Set<string>();
    const padsUsed = new Set<string>();
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      for (const ac of sim.aircraft) {
        if (ac.deicing === 'done') deiced.add(ac.callsign);
        if (ac.deicing === 'inProgress' && ac.deicingPad) padsUsed.add(ac.deicingPad);
        if (ac.category === 'departure' && !ac.onGround) departed.set(ac.callsign, ac.type.wingspanM);
        if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
        if (ac.request === 'departure') sim.transmit(`${ac.callsign} runway ${sim.runway} cleared for take-off`);
        if (ac.request === 'landing') sim.transmit(`${ac.callsign} runway ${sim.runway} cleared to land`);
        if (ac.request === 'vacated') sim.transmit(`${ac.callsign} contact ground`);
        if (ac.request === 'radar') sim.transmit(`${ac.callsign} contact radar`);
      }
    }
    expect(padsUsed.size).toBeGreaterThan(1);
    expect(departed.size).toBeGreaterThan(3);
    // Every departure that fits a pad was de-iced before it took off.
    for (const [cs, span] of departed) if (span <= 52) expect(deiced.has(cs)).toBe(true);
    expect(sim.stats.collisions).toBe(0);
  }, 120000);
});
