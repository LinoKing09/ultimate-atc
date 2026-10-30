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

  it('the controller before you leaves a tidy picture', () => {
    for (const seed of [1, 2, 3]) {
      const sim = new Simulation({ airport: EDDS, position: 'TWR', positions: ['GND', 'TWR'], runway: '25', density: 'heavy', seed, events: false, start: 'handover' });
      const mine = sim.aircraft.filter((a) => sim.isOnMyFrequency(a));
      // Departures already airborne are with Radar.
      expect(mine.filter((a) => a.category === 'departure' && !a.onGround)).toEqual([]);
      // An arrival on short final has its landing clearance unless the runway is occupied right now.
      for (const a of mine.filter((x) => x.phase === 'approach' && sim.distanceToThresholdNm(x) < 4)) {
        expect(a.landingCleared || sim.tower.runwayBusy(a, sim.tower.endFor(a.runway))).toBe(true);
      }
      // Departures taxiing to the runway on Tower frequency have called and were heard.
      for (const a of mine.filter((x) => x.category === 'departure' && x.frequency === 'TWR' && (x.phase === 'holding' || (x.phase === 'taxi' && x.routeDestination?.kind === 'holdingPoint')))) {
        expect(a.request).toBe('departure');
        expect(a.requestAck).toBe(true);
      }
      // Nobody rushes you: at most a few calls in the first minute.
      const n = sim.messages.length;
      for (let t = 0; t < 60; t++) sim.tick(1);
      expect(sim.messages.slice(n).filter((m) => m.kind === 'pilot').length).toBeLessThanOrEqual(5);
    }
  });

  it('an empty start is unchanged', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 5 });
    expect(sim.time).toBe(0);
    expect(sim.aircraft.some((a) => a.onGround && a.phase === 'taxi')).toBe(false);
  });
});
