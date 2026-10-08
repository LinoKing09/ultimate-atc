import { describe, expect, it } from 'vitest';
import { validateAirport } from '../src/core/airport/validate';
import { Simulation } from '../src/core/simulation';
import { AIRPORTS } from '../src/data/airports';

describe('airport data', () => {
  for (const ap of AIRPORTS) {
    it(`${ap.icao} passes the airport data checks`, () => {
      expect(validateAirport(ap)).toEqual([]);
    });

    it(`${ap.icao} generates traffic from its own operator mix`, () => {
      const sim = new Simulation({ airport: ap, position: 'GND', density: 'heavy', seed: 1 });
      for (let t = 0; t < 3600; t++) sim.tick(1);
      const ops = new Set((ap.traffic?.operators ?? []).map((o) => o.airline));
      if (ops.size) {
        for (const a of sim.aircraft) {
          const known = [...ops].some((op) => a.callsign.startsWith(op)) || /^D[A-Z]{4}$/.test(a.callsign);
          expect(known, a.callsign).toBe(true);
        }
      }
    });
  }

  it('reports broken data', () => {
    const ap = AIRPORTS[0];
    const broken = { ...ap, traffic: { operators: [{ airline: 'XXX', weight: 1 }] }, stands: [...ap.stands, { ...ap.stands[0] }] };
    const problems = validateAirport(broken);
    expect(problems.some((p) => p.includes('duplicate stand'))).toBe(true);
  });
});
