import { describe, expect, it } from 'vitest';
import { distance } from '../src/core/geo';
import { formatMetar, lvpInForce } from '../src/core/met';
import { Simulation } from '../src/core/simulation';
import { EDDM } from '../src/data/airports/eddm';
import { EDDS } from '../src/data/airports/edds';
import { EGKK } from '../src/data/airports/egkk';
import { createBot } from './bot';

describe('low visibility procedures (fog)', () => {
  it('reports fog with the runway visual range and announces LVP in the ATIS', () => {
    const sim = new Simulation({ airport: EDDM, position: 'TWR', density: 'medium', seed: 1, events: false, runway: '26R+26L', scenario: { lowVisibility: true } });
    expect(lvpInForce(sim)).toBe(true);
    expect(formatMetar(sim, sim.met.metar)).toMatch(/ 0[1-5][05]0 R26R\/\d{4}N R26L\/\d{4}N FG OVC00[12] /);
    expect(sim.atisText()).toMatch(/low visibility procedures in operation/);
    expect(sim.atisText()).toMatch(/runway visual range runway 26R \d+ metres/);
    expect(sim.atisDatis()).toContain('LVP IN OPS');
    // Approach spaces the arrivals at least 6 NM.
    expect(sim.traffic.requiredArrivalSpacingNm('M', '26R')).toBeGreaterThanOrEqual(6);
    // Without fog: no LVP.
    const clear = new Simulation({ airport: EDDM, position: 'TWR', density: 'medium', seed: 1, events: false, runway: '26R+26L' });
    expect(lvpInForce(clear)).toBe(false);
    expect(clear.atisText()).not.toMatch(/low visibility/);
  });

  for (const [airport, runway] of [[EDDM, '26R+26L'], [EGKK, '26L']] as const) {
    it(`${airport.icao}: departures wait at the CAT II/III holding points, line up from there and take off; no collisions`, () => {
      const sim = new Simulation({ airport, position: 'GND', positions: ['GND', 'TWR'], runway, density: 'medium', seed: 2, events: false, scenario: { lowVisibility: true } });
      const bot = createBot(sim);
      const atLvp = new Set<string>();
      let maxTaxiKt = 0;
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
        for (const a of sim.aircraft) {
          if (a.phase === 'taxi') maxTaxiKt = Math.max(maxTaxiKt, a.speed / 0.5144);
          const hp = a.phase === 'holding' && a.stoppedAt?.holdingPoint;
          const lvp = hp ? sim.airport.lvpHoldingPoints.get(hp.toUpperCase()) : undefined;
          if (lvp) {
            expect(distance(a.pos, lvp.pos), `${a.callsign} at ${hp}`).toBeLessThan(15);
            atLvp.add(a.callsign);
          }
        }
      }
      expect(sim.stats.collisions).toBe(0);
      expect(atLvp.size).toBeGreaterThan(2);
      expect(sim.stats.departuresAirborne).toBeGreaterThan(4);
      expect(sim.stats.arrivalsParked).toBeGreaterThan(4);
      expect(maxTaxiKt).toBeLessThan(10.5);
    }, 300000);
  }

  it('airports without separate CAT II/III holding points use the normal ones', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', positions: ['GND', 'TWR'], runway: '25', density: 'medium', seed: 3, events: false, scenario: { lowVisibility: true } });
    const bot = createBot(sim);
    for (let t = 0; t < 2400; t++) {
      sim.tick(1);
      bot();
    }
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.departuresAirborne).toBeGreaterThan(2);
  }, 300000);
});
