import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

describe('navigation aids (ILS)', () => {
  it('switches the approach procedure and the arrival spacing', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 1, generateTraffic: false });
    expect(sim.approachType).toBe('ILS');
    expect(sim.atisText()).toMatch(/ILS approach runway 25/);
    sim.setSystem('gp', false);
    expect(sim.approachType).toBe('LOC');
    expect(sim.atisText()).toMatch(/localizer approach runway 25, glide path runway 25 out of service/);
    sim.setSystem('loc', false);
    expect(sim.approachType).toBe('RNP');
    expect(sim.atisText()).toMatch(/RNP approach runway 25, ILS runway 25 out of service/);
    expect(sim.traffic.requiredArrivalSpacingNm('M')).toBeGreaterThanOrEqual(5);
    expect(sim.messages.some((m) => /Approach procedure now: RNP approach runway 25/.test(m.text))).toBe(true);
    sim.setSystem('loc', true);
    sim.setSystem('gp', true);
    expect(sim.traffic.requiredArrivalSpacingNm('M')).toBe(4);
  });
});
