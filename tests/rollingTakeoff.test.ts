import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}

/** A departure at the holding point of runway 25 (Stuttgart), Tower yours. */
function atHoldingPoint(callsign: string): { sim: Simulation; ac: Aircraft } {
  const sim = new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
  const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign, type: 'A320' }) as Aircraft;
  ac.ctot = undefined;
  expect(runUntil(sim, () => ac.phase === 'holding', 2100)).toBe(true);
  return { sim, ac };
}

/**
 * Lowest speed (m/s) between the start of the line-up and the take-off roll, in small steps, and the speed the
 * take-off roll starts with; undefined if it never rolled.
 */
function speedsToTakeoff(sim: Simulation, ac: Aircraft): { lowest: number; atStart: number } | undefined {
  let lowest = Infinity;
  let rolling = false;
  let speed = 0;
  for (let t = 0; t < 1200 && ac.phase !== 'takeoff'; t++) {
    speed = ac.speed;
    sim.tick(0.1);
    if (ac.phase === 'lineup' && ac.speed > 2) rolling = true;
    if (rolling && ac.phase === 'lineup') lowest = Math.min(lowest, ac.speed);
  }
  return ac.phase === 'takeoff' && rolling ? { lowest, atStart: speed } : undefined;
}

describe('rolling take-off', () => {
  it('cleared for take-off from the holding point: lines up and rolls into the take-off without stopping', () => {
    const starts: number[] = [];
    for (const cs of ['DLH1AB', 'DLH2CD', 'EWG3EF', 'EWG4GH', 'DLH5JK', 'EWG6LM']) {
      const { sim, ac } = atHoldingPoint(cs);
      sim.transmit(`${cs} runway 25, cleared for take-off`);
      const v = speedsToTakeoff(sim, ac);
      expect(v, cs).toBeDefined();
      // Never stopped on the runway.
      expect(v!.lowest, cs).toBeGreaterThan(1.5);
      starts.push(v!.atStart);
    }
    // Each crew its own way: some roll straight into the take-off, others slow down first.
    expect(Math.max(...starts) - Math.min(...starts)).toBeGreaterThan(0.8);
  });

  it('cleared for take-off during the line-up: no stop either', () => {
    const { sim, ac } = atHoldingPoint('DLH7NP');
    sim.transmit('DLH7NP line up and wait runway 25');
    expect(runUntil(sim, () => ac.phase === 'lineup' && ac.speed > 2, 60)).toBe(true);
    sim.transmit('DLH7NP runway 25, cleared for take-off');
    expect(speedsToTakeoff(sim, ac)?.lowest).toBeGreaterThan(1.5);
  });

  it('lined up and waiting: the take-off clearance starts the roll from standstill', () => {
    const { sim, ac } = atHoldingPoint('DLH8QR');
    sim.transmit('DLH8QR line up and wait runway 25');
    expect(runUntil(sim, () => ac.phase === 'lineup' && !!ac.stoppedAt, 120)).toBe(true);
    sim.transmit('DLH8QR runway 25, cleared for take-off');
    expect(runUntil(sim, () => ac.phase === 'takeoff', 30)).toBe(true);
  });
});
