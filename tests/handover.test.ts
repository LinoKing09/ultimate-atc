import { describe, expect, it } from 'vitest';
import { HANDOVER_S, Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';
import { createBot } from './bot';

describe('taking over from another controller', () => {
  it('starts with traffic in progress, a clean score and the clock at the start time', () => {
    const start = new Date('2026-06-01T10:00:00Z');
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 5, startTime: start, start: 'handover' });
    expect(sim.time).toBeCloseTo(HANDOVER_S, 6);
    expect(sim.sessionStart).toBe(sim.time);
    expect(sim.startEpochMs + sim.time * 1000).toBeCloseTo(start.getTime(), 0);
    expect(sim.aircraft.filter((a) => a.onGround && ['pushback', 'taxi', 'holding', 'lineup'].includes(a.phase)).length).toBeGreaterThan(2);
    expect(sim.stats.departuresAirborne).toBe(0);
    expect(sim.incidents).toEqual([]);
    expect(sim.messages.map((m) => m.text)).toEqual([expect.stringMatching(/^You take over from the controller before you/)]);
  });

  it('runs on with your controller without collisions', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', positions: ['GND', 'TWR'], runway: '25', density: 'medium', seed: 5, start: 'handover', events: false });
    const bot = createBot(sim);
    for (let t = 0; t < 1800; t++) {
      sim.tick(1);
      bot();
    }
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.departuresAirborne).toBeGreaterThan(4);
    expect(sim.stats.arrivalsParked).toBeGreaterThan(2);
  }, 60000);

  it('an empty start is unchanged', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 5 });
    expect(sim.time).toBe(0);
    expect(sim.aircraft.some((a) => a.onGround && a.phase === 'taxi')).toBe(false);
  });
});
