import { describe, expect, it } from 'vitest';
import { distance } from '../src/core/geo';
import { formatMetar, lvpInForce } from '../src/core/met';
import { Simulation } from '../src/core/simulation';
import { EDDK } from '../src/data/airports/eddk';
import { EDDM } from '../src/data/airports/eddm';
import { EDDN } from '../src/data/airports/eddn';
import { EDDP } from '../src/data/airports/eddp';
import { EDDS } from '../src/data/airports/edds';
import { EDDW } from '../src/data/airports/eddw';
import { EDJA } from '../src/data/airports/edja';
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
    // Whatever the time of day (the observations vary with it): fog always brings LVP.
    for (let h = 0; h < 24; h += 0.5) {
      const startTime = new Date(Date.UTC(2026, 10, 2, 0, 0) + h * 3600_000);
      const s = new Simulation({ airport: EDDM, position: 'TWR', density: 'medium', seed: 1, events: false, runway: '26R+26L', generateTraffic: false, startTime, scenario: { lowVisibility: true } });
      expect(lvpInForce(s), startTime.toISOString()).toBe(true);
    }
    // Without fog: no LVP.
    const clear = new Simulation({ airport: EDDM, position: 'TWR', density: 'medium', seed: 1, events: false, runway: '26R+26L' });
    expect(lvpInForce(clear)).toBe(false);
    expect(clear.atisText()).not.toMatch(/low visibility/);
  });

  for (const [airport, runway] of [[EDDM, '26R+26L'], [EGKK, '26L'], [EDDS, '25'], [EDDP, '26R+26L'], [EDDK, '31R']] as const) {
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
            expect(Math.min(...lvp.map((n) => distance(a.pos, n.pos))), `${a.callsign} at ${hp}`).toBeLessThan(15);
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

  it('every airport with a CAT II/III runway has its CAT II/III holding positions', () => {
    for (const [airport, hps] of [[EDDS, 12], [EDDN, 4], [EDDW, 4], [EDDK, 7], [EDDP, 23]] as const) {
      const sim = new Simulation({ airport, position: 'GND', density: 'light', seed: 1, events: false, generateTraffic: false });
      expect(sim.airport.lvpHoldingPoints.size, airport.icao).toBe(hps);
      // Each one lies behind its holding point, between it and the taxiway the aircraft come along.
      for (const [name, nodes] of sim.airport.lvpHoldingPoints) {
        for (const n of nodes) expect(distance(n.pos, sim.airport.holdingPoints.get(name)!.pos), `${airport.icao} ${name}`).toBeLessThan(300);
      }
    }
  });

  it('airports without separate CAT II/III holding points use the normal ones', () => {
    const sim = new Simulation({ airport: EDJA, position: 'GND', positions: ['GND', 'TWR'], density: 'medium', seed: 3, events: false, scenario: { lowVisibility: true } });
    const bot = createBot(sim);
    for (let t = 0; t < 2400; t++) {
      sim.tick(1);
      bot();
    }
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.departuresAirborne).toBeGreaterThan(2);
  }, 300000);
});
