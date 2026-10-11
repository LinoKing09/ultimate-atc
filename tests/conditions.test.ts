import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { closureProblems } from '../src/core/airport/validate';
import { formatScenarioCode, parseScenarioCode, scenarioSetup, type Scenario } from '../src/core/scenario';
import { Simulation } from '../src/core/simulation';
import { zonedTime } from '../src/core/time';
import { EDDS } from '../src/data/airports/edds';

/** A summer day (CEST, UTC+2) and a winter day (CET, UTC+1). */
const SUMMER = new Date('2026-07-01T12:00:00Z');
const WINTER = new Date('2026-01-15T12:00:00Z');

function simFor(code: string, opts: { generateTraffic?: boolean; day?: Date; position?: 'GND' | 'TWR' } = {}): Simulation {
  const sc = parseScenarioCode(code) as Scenario;
  return new Simulation({
    airport: EDDS,
    position: opts.position ?? 'GND',
    density: sc.density,
    events: sc.randomEvents,
    seed: sc.seed,
    runway: sc.runway,
    generateTraffic: opts.generateTraffic,
    startTime: sc.startLocal ? zonedTime(sc.startLocal, 'Europe/Berlin', opts.day ?? SUMMER) : new Date('2026-07-01T10:00:00Z'),
    scenario: scenarioSetup(sc),
  });
}

/** The simple automatic Ground controller of the benchmark. */
function groundBot(sim: Simulation): void {
  for (const ac of sim.aircraft) {
    if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
    if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) {
      sim.transmit(`${ac.callsign} push and start approved`);
    }
    if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${sim.runway}`);
    if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) {
      sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
    }
    if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
    if (ac.request === 'tow') sim.transmit(`${ac.callsign} tow approved`);
  }
}

function runUntil(sim: Simulation, cond: () => boolean, maxSeconds: number, bot = false): boolean {
  for (let t = 0; t < maxSeconds; t++) {
    if (cond()) return true;
    sim.tick(1);
    if (bot) groundBot(sim);
  }
  return cond();
}

function lastPilotMessage(sim: Simulation, callsign: string): string {
  const msgs = sim.messages.filter((m) => m.kind === 'pilot' && m.from === callsign);
  return msgs[msgs.length - 1]?.text ?? '';
}

describe('scenario code options', () => {
  const base: Scenario = { airport: 'EDDS', runway: '25', density: 'medium', mix: 'balanced', heavies: false, randomEvents: true, events: [], seed: 42 };

  it('keeps codes without options at five parts', () => {
    expect(formatScenarioCode(base)).toBe('EDDS-25-MB2-X-16');
    expect(parseScenarioCode('EDDS-25-MB2-X-16')).toEqual(base);
  });

  it('round-trips start time, night rules, closed taxiways and the thunderstorm event', () => {
    const s: Scenario = { ...base, events: [{ kind: 'thunderstorm', atMin: 20 }], startLocal: '2215', nightRules: true, closedTaxiways: ['S', 'E'] };
    const code = formatScenarioCode(s);
    expect(code).toBe('EDDS-25-MB2-S20-T2215.N.CE.CS-16');
    expect(parseScenarioCode(code)).toEqual({ ...s, closedTaxiways: ['E', 'S'] });
    expect(parseScenarioCode('edds-auto-lb0-x-cl2-1')).toMatchObject({ closedTaxiways: ['L2'], seed: 1 });
  });

  it('rejects invalid options', () => {
    for (const bad of ['EDDS-25-MB2-X-T2460-16', 'EDDS-25-MB2-X-Q-16', 'EDDS-25-MB2-X-N.T22-16', 'EDDS-25-MB2-X-N-N-16']) {
      expect(parseScenarioCode(bad)).toHaveProperty('error');
    }
  });
});

describe('local time', () => {
  it('converts a local start time to UTC (summer and winter time)', () => {
    expect(zonedTime('2215', 'Europe/Berlin', SUMMER).toISOString()).toBe('2026-07-01T20:15:00.000Z');
    expect(zonedTime('2215', 'Europe/Berlin', WINTER).toISOString()).toBe('2026-01-15T21:15:00.000Z');
  });

  it('gives the local minute of the day', () => {
    const sim = simFor('EDDS-25-MB0-X-T2350.N-1', { generateTraffic: false });
    expect(sim.localMinutes()).toBe(23 * 60 + 50);
    for (let t = 0; t < 900; t++) sim.tick(1);
    expect(sim.localMinutes()).toBe(5); // 00:05
  });
});

describe('night flying restrictions', () => {
  it('no jet take-off and no landing in the curfew, delayed arrivals until 2400', () => {
    const sim = simFor('EDDS-25-MB0-X-T2220.N-7');
    const takeoffs: number[] = [];
    const landings: { min: number; cs: string }[] = [];
    const seen = new Set<string>();
    for (let t = 0; t < 130 * 60; t++) {
      sim.tick(1);
      groundBot(sim);
      for (const ac of sim.aircraft) {
        if (seen.has(`${ac.callsign}:${ac.phase}`)) continue;
        seen.add(`${ac.callsign}:${ac.phase}`);
        if (ac.phase === 'takeoff' && ac.type.silhouette !== 'turboprop') takeoffs.push(sim.localMinutes());
        if (ac.phase === 'landing' && ac.category === 'arrival') landings.push({ min: sim.localMinutes(), cs: ac.callsign });
      }
    }
    expect(takeoffs.length).toBeGreaterThan(2);
    // 23:00 = 1380; the run ends at 00:30.
    expect(takeoffs.filter((m) => m >= 1380 || m < 360)).toEqual([]);
    expect(landings.filter((l) => l.min < 360)).toEqual([]);
    expect(landings.some((l) => l.min >= 1380)).toBe(true);
    expect(sim.messages.some((m) => /Night curfew: no more jet departures/.test(m.text))).toBe(true);
    expect(sim.messages.some((m) => /Landing curfew/.test(m.text))).toBe(true);
    expect(sim.messages.some((m) => /closed for landings until 0600/.test(m.text))).toBe(true);
  }, 60000);

  it('the morning wave departs from 0600 local', () => {
    const sim = simFor('EDDS-25-MB0-X-T0520.N-3', { day: WINTER });
    const takeoffs: number[] = [];
    for (let t = 0; t < 75 * 60; t++) {
      sim.tick(1);
      groundBot(sim);
      for (const ac of sim.aircraft) if (ac.phase === 'takeoff' && ac.s < 3 && ac.type.silhouette !== 'turboprop') takeoffs.push(sim.localMinutes());
    }
    expect(takeoffs.length).toBeGreaterThan(0);
    expect(Math.min(...takeoffs)).toBeGreaterThanOrEqual(360);
  }, 60000);

  it('a jet that misses the curfew is postponed or sent back to the stand', () => {
    const sim = simFor('EDDS-25-MB0-X-T2235.N-1', { generateTraffic: false });
    const parked = sim.traffic.spawnDeparture(60, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const taxiing = sim.traffic.spawnDeparture(60, { stand: '12', callsign: 'EWG1AB', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => taxiing.request === 'pushback', 600)).toBe(true);
    sim.transmit('EWG1AB push and start approved');
    expect(runUntil(sim, () => taxiing.request === 'taxi', 600)).toBe(true);
    sim.transmit('EWG1AB taxi to holding point A');
    // Nobody hands it to Tower: it is still at the holding point at 23:00.
    expect(runUntil(sim, () => sim.localMinutes() === 23 * 60 + 1, 3600)).toBe(true);
    sim.tick(10);
    expect(parked.missedCurfew).toBe(true);
    expect(parked.phase).toBe('parked');
    expect(parked.readyAt - sim.time).toBeGreaterThan(6 * 3600);
    expect(taxiing.returnToStand).toBe(true);
    expect(taxiing.request).toBe('taxiIn');
    expect(lastPilotMessage(sim, 'EWG1AB')).toMatch(/missed the night curfew, request taxi back to stand/);
    expect(sim.stats.curfewMissed).toBe(2);
  }, 30000);
});

describe('closed taxiways', () => {
  it('routes avoid them and refuse them in a via list', () => {
    const sim = simFor('EDDS-25-MB0-X-CS.CE-1', { generateTraffic: false });
    expect([...sim.airport.closedTaxiways].sort()).toEqual(['E', 'S']);
    const stand = sim.airport.stand('14')!;
    const hpA = sim.airport.holdingPoint('A')!;
    const via = findRoute(sim.airport, { node: stand.node, heading: (stand.heading + 180) % 360 }, hpA, ['M', 'H', 'S']);
    expect(via).toEqual({ error: 'taxiway S closed' });
    const auto = findRoute(sim.airport, { node: sim.airport.node('E_CLR') ?? stand.node }, stand.node);
    expect(isRouteError(auto)).toBe(true); // E_CLR lies on the closed taxiway E
    const out = findRoute(sim.airport, { node: stand.node, heading: (stand.heading + 180) % 360 }, hpA);
    expect(isRouteError(out)).toBe(false);
    if (!isRouteError(out)) expect(out.taxiways.some((t) => t === 'S' || t === 'E')).toBe(false);
    expect(sim.atisText()).toMatch(/taxiways E and S closed/);
  });

  it('the crew answers "unable, taxiway X closed"', () => {
    const sim = simFor('EDDS-25-MB0-X-CS-1', { generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'pushback', 300)).toBe(true);
    sim.transmit('DLH5AB push and start approved');
    expect(runUntil(sim, () => ac.request === 'taxi', 300)).toBe(true);
    sim.transmit('DLH5AB taxi to holding point A via M H S');
    expect(runUntil(sim, () => /unable, taxiway S closed/i.test(lastPilotMessage(sim, 'DLH5AB')), 15)).toBe(true);
    sim.transmit('DLH5AB taxi to holding point G');
    expect(runUntil(sim, () => /taxi to holding point G/i.test(lastPilotMessage(sim, 'DLH5AB')), 15)).toBe(true);
  });

  it('refuses a holding point on a closed taxiway and arrivals do not vacate there', () => {
    const sim = simFor('EDDS-25-MB0-X-CF.CE-4');
    const exits = new Set<string>();
    for (let t = 0; t < 40 * 60; t++) {
      sim.tick(1);
      groundBot(sim);
      for (const a of sim.aircraft) if (a.category === 'arrival' && a.exitName) exits.add(a.exitName);
    }
    expect(exits.size).toBeGreaterThan(0);
    expect(exits.has('F')).toBe(false);
    expect(exits.has('E')).toBe(false);
    expect(sim.stats.collisions).toBe(0);
    expect(sim.messages.some((m) => /NOTAM: taxiways E, F closed/.test(m.text))).toBe(true);
  }, 60000);

  it('reports closures that cut stands off', () => {
    expect(closureProblems(EDDS, ['E', 'S'])).toEqual([]);
    expect(closureProblems(EDDS, ['N']).length).toBeGreaterThan(0);
    expect(closureProblems(EDDS, ['X9'])).toEqual(['unknown taxiway X9']);
  });
});

describe('thunderstorm', () => {
  it('warns, stops pushbacks and take-offs, causes go-arounds, then passes', () => {
    const sim = simFor('EDDS-25-MB0-S1-9');
    const takeoffsOverhead: string[] = [];
    let pushRefused = '';
    let gustSeen = false;
    for (let t = 0; t < 30 * 60; t++) {
      sim.tick(1);
      groundBot(sim);
      if (sim.storm?.phase === 'overhead') {
        gustSeen ||= (sim.observedWind.gustKt ?? 0) > sim.observedWind.speedKt;
        // The take-off roll starts only for aircraft lined up before the storm arrived.
        for (const ac of sim.aircraft) if (ac.phase === 'takeoff' && ac.s < 3 && sim.time > 6 * 60 + 60) takeoffsOverhead.push(ac.callsign);
        const parked = sim.aircraft.find((a) => a.category === 'departure' && a.phase === 'parked' && a.cleared && sim.time >= a.readyAt);
        if (!pushRefused && parked) {
          sim.transmit(`${parked.callsign} push and start approved`);
          sim.tick(5);
          pushRefused = lastPilotMessage(sim, parked.callsign);
        }
      }
    }
    expect(sim.messages.some((m) => /MET: thunderstorm approaching/.test(m.text))).toBe(true);
    expect(sim.messages.some((m) => /MET: thunderstorm overhead, gust front/.test(m.text))).toBe(true);
    expect(sim.messages.some((m) => /MET: the thunderstorm has passed/.test(m.text))).toBe(true);
    expect(sim.storm).toBeUndefined();
    expect(gustSeen).toBe(true);
    expect(takeoffsOverhead).toEqual([]);
    expect(pushRefused).toMatch(/lightning alert/);
    // Strong tailwind on runway 25 with nobody changing the runway: the arrivals go around (no penalty).
    expect(sim.stats.weatherGoArounds).toBeGreaterThan(0);
    expect(sim.stats.goArounds).toBe(0);
    expect(sim.atis.wind.gustKt).toBeUndefined();
  }, 60000);

  it('crews refuse a take-off clearance while it is overhead', () => {
    const sim = simFor('EDDS-25-MB0-S5-9', { generateTraffic: false, position: 'TWR' });
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'departure' && sim.storm?.phase === 'overhead', 1800)).toBe(true);
    expect(sim.atisText()).toMatch(/thunderstorm over the airport/);
    sim.transmit('DLH5AB cleared for take-off runway 25');
    expect(runUntil(sim, () => /unable, thunderstorm overhead/i.test(lastPilotMessage(sim, 'DLH5AB')), 15)).toBe(true);
    expect(ac.takeoffCleared).toBeFalsy();
  }, 30000);
});
