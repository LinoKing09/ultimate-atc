import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';
import { EDJA } from '../src/data/airports/edja';

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}
function last(sim: Simulation, cs: string): string {
  return sim.messages.filter((m) => m.kind === 'pilot' && m.from === cs).at(-1)?.text ?? '';
}
const ctx = { callsigns: ['DLH5AB', 'EWG7TK'], taxiways: new Set(['A', 'B', 'C', 'D', 'E', 'N', 'S']) };

describe('backtrack phraseology', () => {
  it('parses backtrack with line-up, take-off and vacate', () => {
    expect(parseTransmission('DLH5AB backtrack runway 25, line up and wait', ctx).commands).toEqual([{ type: 'lineUp', runway: '25', backtrack: true }]);
    expect(parseTransmission('DLH5AB backtrack runway 25', ctx).commands).toEqual([{ type: 'lineUp', runway: '25', backtrack: true }]);
    expect(parseTransmission('DLH5AB enter runway 25 and backtrack', ctx).commands).toEqual([{ type: 'lineUp', runway: '25', backtrack: true }]);
    expect(parseTransmission('DLH5AB backtrack runway 25, cleared for take-off', ctx).commands).toEqual([{ type: 'takeoff', runway: '25', backtrack: true }]);
    expect(parseTransmission('EWG7TK backtrack, vacate via C', ctx).commands).toEqual([{ type: 'vacate', exit: 'C', backtrack: true }]);
    expect(parseTransmission('DLH5AB line up and wait runway 25', ctx).commands).toEqual([{ type: 'lineUp', runway: '25' }]);
  });
});

describe('backtrack on the runway', () => {
  /** Ground + Tower at Stuttgart: a departure taxied to the intersection D of runway 25. */
  function atD(): { sim: Simulation; ac: Aircraft } {
    const sim = new Simulation({ airport: EDDS, position: 'TWR', positions: ['GND', 'TWR'], runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
    // A regional jet: it accepts the intersection D.
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'CRJ9' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'pushback', 900)).toBe(true);
    sim.transmit('DLH5AB push and start approved facing east');
    expect(runUntil(sim, () => ac.request === 'taxi', 300)).toBe(true);
    sim.transmit('DLH5AB taxi to holding point D via M, H, N');
    expect(runUntil(sim, () => ac.phase === 'holding', 1200)).toBe(true);
    sim.transmit('DLH5AB contact tower');
    expect(runUntil(sim, () => ac.frequency === 'TWR', 60)).toBe(true);
    return { sim, ac };
  }

  it('a departure backtracks from an intersection to the runway end, turns and departs from the full length', () => {
    const { sim, ac } = atD();
    const end = sim.airport.runwayEnd('25')!;
    sim.transmit('DLH5AB backtrack runway 25, line up and wait');
    expect(runUntil(sim, () => /backtrack runway 25, line up and wait/i.test(last(sim, 'DLH5AB')), 20)).toBe(true);
    // It taxis along the runway towards the 25 start, against the take-off direction.
    let minAlong = Infinity;
    expect(
      runUntil(sim, () => {
        if (ac.phase === 'lineup') minAlong = Math.min(minAlong, sim.airport.runwayCoordinates(end, ac.pos).along);
        return ac.phase === 'lineup' && !!ac.stoppedAt;
      }, 600),
    ).toBe(true);
    expect(minAlong).toBeLessThan(40);
    const c = sim.airport.runwayCoordinates(end, ac.pos);
    expect(c.along).toBeLessThan(80);
    expect(Math.abs(c.lateral)).toBeLessThan(5);
    expect(Math.abs(((ac.heading - end.heading + 540) % 360) - 180)).toBeLessThan(10);
    expect(ac.intersectionDeparture).toBe(false);
    sim.transmit('DLH5AB runway 25, cleared for take-off');
    expect(runUntil(sim, () => ac.phase === 'climb', 180)).toBe(true);
    expect(sim.stats.incursions).toBe(0);
  });

  it('take-off clearance with backtrack in one transmission', () => {
    const { sim, ac } = atD();
    sim.transmit('DLH5AB backtrack runway 25, cleared for take-off');
    expect(runUntil(sim, () => /backtrack runway 25, cleared for take-off runway 25/i.test(last(sim, 'DLH5AB')), 20)).toBe(true);
    expect(runUntil(sim, () => ac.phase === 'climb', 900)).toBe(true);
  });
});

describe('backtrack after landing', () => {
  /** Stuttgart with only one exit for runway 25: B, behind the stopping point, reached by backtracking. */
  function onlyB(): Simulation {
    const airport = structuredClone(EDDS);
    const ops = airport.runwayOps.find((o) => o.runway === '25')!;
    const b = ops.exits.find((x) => x.name === 'B') ?? { name: 'B', path: ['RWY_B', 'B', 'B_CLR'], rapid: false };
    ops.exits = [{ ...b, backtrack: true }];
    return new Simulation({ airport, position: 'TWR', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
  }

  it('an arrival that cannot make an exit ahead turns around and backtracks to the exit behind it', () => {
    const sim = onlyB();
    const end = sim.airport.runwayEnd('25')!;
    const ac = sim.traffic.spawnArrival(6, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'landing', 30)).toBe(true);
    sim.transmit('EWG7TK runway 25, cleared to land');
    expect(runUntil(sim, () => ac.phase === 'landing', 600)).toBe(true);
    let maxAlong = 0;
    let headingBack = false;
    expect(
      runUntil(sim, () => {
        if (ac.phase === 'landing' || ac.phase === 'vacating') {
          maxAlong = Math.max(maxAlong, sim.airport.runwayCoordinates(end, ac.pos).along);
          if (Math.abs(((ac.heading - end.heading + 540) % 360) - 180) > 150 && ac.speed > 2) headingBack = true;
        }
        return ac.request === 'vacated';
      }, 900),
    ).toBe(true);
    expect(headingBack).toBe(true);
    // B is about 630 m from the 25 start; the aircraft rolled well past it and came back.
    expect(maxAlong).toBeGreaterThan(900);
    expect(last(sim, 'EWG7TK')).toMatch(/runway 25 vacated via B$/);
    expect(sim.stats.incursions).toBe(0);
  });

  it('"backtrack, vacate via B": the requested exit behind is reached by backtracking', () => {
    const sim = onlyB();
    const ac = sim.traffic.spawnArrival(6, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'landing', 30)).toBe(true);
    sim.transmit('EWG7TK runway 25, cleared to land');
    sim.transmit('EWG7TK backtrack, vacate via B');
    expect(runUntil(sim, () => /backtrack, vacate via B/i.test(last(sim, 'EWG7TK')), 20)).toBe(true);
    expect(runUntil(sim, () => ac.request === 'vacated', 900)).toBe(true);
    expect(ac.exitName).toBe('B');
  });
});

describe('Memmingen (EDJA): backtracks in normal operation', () => {
  it('runway 24: the departure from N backtracks to the runway end (AI Tower)', () => {
    const sim = new Simulation({ airport: EDJA, position: 'GND', runway: '24', density: 'medium', seed: 7, events: false, generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(2, { stand: '1', callsign: 'RYR1AB', type: 'B738' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'pushback', 900)).toBe(true);
    sim.transmit('RYR1AB push and start approved');
    expect(runUntil(sim, () => ac.request === 'taxi', 300)).toBe(true);
    sim.transmit('RYR1AB taxi to runway 24');
    expect(runUntil(sim, () => /taxi to holding point N runway 24/i.test(last(sim, 'RYR1AB')), 15)).toBe(true);
    expect(runUntil(sim, () => ac.phase === 'holding', 900)).toBe(true);
    sim.transmit('RYR1AB contact tower');
    const end = sim.airport.runwayEnd('24')!;
    let minAlong = Infinity;
    expect(
      runUntil(sim, () => {
        if (ac.phase === 'lineup' || ac.phase === 'takeoff') minAlong = Math.min(minAlong, sim.airport.runwayCoordinates(end, ac.pos).along);
        return ac.phase === 'climb';
      }, 900),
    ).toBe(true);
    expect(minAlong).toBeLessThan(60);
    expect(ac.intersectionDeparture).toBe(false);
  });

  it('runway 06: an arrival rolls past N, turns around and vacates via N (AI Tower)', () => {
    const sim = new Simulation({ airport: EDJA, position: 'GND', runway: '06', density: 'medium', seed: 7, events: false, generateTraffic: false });
    const ac = sim.traffic.spawnArrival(6, { callsign: 'WZZ1AB', type: 'A21N' }) as Aircraft;
    expect(runUntil(sim, () => ac.phase === 'landing', 600)).toBe(true);
    expect(runUntil(sim, () => ac.phase === 'taxi', 600)).toBe(true);
    expect(ac.exitName).toBe('N');
    expect(sim.stats.incursions).toBe(0);
  });

  it('runs an hour of traffic on each runway (AI Tower and AI Ground) without collisions', () => {
    for (const runway of ['24', '06']) {
      // You as Ground (a simple scripted controller), the AI Tower owns the runway.
      const sim = new Simulation({ airport: EDJA, position: 'GND', runway, density: 'medium', seed: 2, events: false });
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        for (const ac of sim.aircraft) {
          if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
          if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) sim.transmit(`${ac.callsign} push and start approved`);
          if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${runway}`);
          if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
          if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
        }
      }
      expect(sim.stats.collisions).toBe(0);
      expect(sim.stats.departuresAirborne + sim.stats.arrivalsParked).toBeGreaterThan(3);
    }
  });
});
