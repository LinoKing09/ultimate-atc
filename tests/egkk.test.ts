import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { sidsForDestination } from '../src/core/delivery';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EGKK } from '../src/data/airports/egkk';
import { createBot } from './bot';

describe('London Gatwick (EGKK) after the UK AIP', () => {
  it('has runway 08R/26L in use, the standby runway drawn, the taxiways and holding points of the chart', () => {
    const ap = new Airport(EGKK);
    expect(EGKK.runways.map((r) => [r.name, r.lengthM])).toEqual([
      ['08R/26L', 3317],
      ['08L/26R', 2561],
    ]);
    // The standby runway is not part of the taxi graph.
    expect(EGKK.taxiEdges.filter((e) => e.kind === 'runway').every((e) => e.name === '08R/26L')).toBe(true);
    for (const t of ['A', 'AN', 'AS', 'B', 'BR', 'C', 'CR', 'D', 'ER', 'FR', 'G', 'GR', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'QA', 'R', 'S', 'U', 'Z']) expect(ap.taxiwayNames.has(t), t).toBe(true);
    expect(EGKK.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A1', 'B1', 'BR', 'C1', 'D1', 'ER', 'FR', 'G1', 'GR', 'H1', 'J1', 'M1']);
  });

  it('has the stands of the AIP stand list (without the work-in-progress area at Pier 6)', () => {
    const ids = EGKK.stands.map((s) => s.id);
    expect(ids).toHaveLength(187);
    for (const s of ['1', '13L', '31', '41E', '64', '180R', '235', '552', '574', '681', '690']) expect(ids, s).toContain(s);
    expect(ids).not.toContain('691');
  });

  it('publishes the take-off runs of the intersections (AIP AD 2.13) and the rapid exits (AD 2.20)', () => {
    const ops = (rwy: string) => EGKK.runwayOps.find((o) => o.runway === rwy)!;
    expect(Object.fromEntries(ops('26L').departureEntries.map((e) => [e.holdingPoint, e.toraM]))).toEqual({ M1: 3255, A1: 3146, B1: 2891, C1: 2460 });
    expect(Object.fromEntries(ops('08R').departureEntries.map((e) => [e.holdingPoint, e.toraM]))).toEqual({ J1: 3159, H1: 2937, G1: 2772 });
    expect(ops('26L').exits.filter((x) => x.rapid).map((x) => x.name)).toEqual(['ER', 'FR', 'GR']);
    expect(ops('08R').exits.filter((x) => x.rapid).map((x) => x.name)).toEqual(['D', 'CR', 'BR']);
  });

  it('plans the RNAV SIDs by the direction of the destination: X from 26L, Z from 08R', () => {
    expect(sidsForDestination(EGKK, '26L', 'LEMG').map((s) => s.name)).toEqual(['BOGNA1X']);
    expect(sidsForDestination(EGKK, '26L', 'EGPH').map((s) => s.name)).toEqual(['TIGER1X']);
    expect(sidsForDestination(EGKK, '26L', 'KMCO').map((s) => s.name)).toEqual(['NOVMA1X']);
    expect(sidsForDestination(EGKK, '08R', 'LHBP').map((s) => s.name)).toEqual(['ODVIK2Z']);
    expect(sidsForDestination(EGKK, '08R', 'KMCO').map((s) => s.name)).toEqual(['IMVUR1Z']);
  });

  it('reads the two-letter taxiways typed and spoken', () => {
    const ctx = { callsigns: ['EZY12AB'], taxiways: new Airport(EGKK).taxiwayNames };
    const via = (text: string) => (parseTransmission(text, ctx).commands[0] as { via: string[] }).via;
    expect(via('EZY12AB taxi to holding point M1 via J, AN, AS')).toEqual(['J', 'AN', 'AS']);
    expect(via('EZY12AB taxi to stand 131 via november alpha, papa, kilo')).toEqual(['NA', 'P', 'K']);
    expect(via('EZY12AB taxi to stand 565 via J and QA')).toEqual(['J', 'QA']);
  });

  it('runs an hour of traffic on each runway direction (scripted Ground and Tower) without collisions', () => {
    for (const runway of ['26L', '08R']) {
      const sim = new Simulation({ airport: EGKK, position: 'GND', positions: ['GND', 'TWR'], runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(6);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(6);
    }
  }, 300000);
});
