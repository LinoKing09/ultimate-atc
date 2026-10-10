import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { debrief, SCORE_TABLE, scoreOf } from '../src/core/debrief';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

describe('debriefing', () => {
  it('splits the score into what earned and what cost points, with advice', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'EWG8LM', type: 'A320' }) as Aircraft;
    for (let t = 0; t < 400 && ac.request !== 'pushback'; t++) sim.tick(1);
    for (let t = 0; t < 90; t++) sim.tick(1); // a slow answer
    sim.transmit('EWG8LM push and start approved');
    sim.transmit('EWG8LM banana');
    for (let t = 0; t < 10; t++) sim.tick(1);
    sim.stats.departuresHandedOff = 3;
    sim.stats.separationLosses = 1;
    sim.updateScore();
    const d = debrief(sim);
    expect(d.score).toBe(scoreOf(sim.stats));
    expect(d.good[0]).toMatchObject({ label: 'Departures handed to Tower', count: 3, points: 30 });
    expect(d.costs[0]).toMatchObject({ label: 'Take-offs with too little spacing', count: 1, points: -10 });
    expect(d.costs.some((c) => c.label.startsWith('Slow answers'))).toBe(true);
    expect(d.longestWaits[0]).toMatchObject({ callsign: 'EWG8LM' });
    expect(d.averageWaitS).toBeGreaterThan(30);
    expect(d.tips.some((t) => /departure spacing/.test(t))).toBe(true);
    expect(d.tips.some((t) => /Answer requests sooner/.test(t))).toBe(true);
    expect(d.positions).toEqual(['EDDS_GND']);
  });

  it('the score is the sum of the score table', () => {
    const sim = new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'medium', seed: 1, events: false, generateTraffic: false });
    for (const row of SCORE_TABLE) (sim.stats[row.key] as number) = 2;
    sim.updateScore();
    expect(sim.stats.score).toBe(SCORE_TABLE.reduce((s, r) => s + 2 * r.points, 0));
  });
});
