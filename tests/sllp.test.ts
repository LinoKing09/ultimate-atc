import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { sidsForDestination } from '../src/core/delivery';
import { Simulation } from '../src/core/simulation';
import { SLLP } from '../src/data/airports/sllp';
import { createBot } from './bot';

describe('La Paz (SLLP) after the AIP Bolivia', () => {
  it('has runway 10/28 at 13314 ft, the taxiways A and B, holding points and stands', () => {
    const ap = new Airport(SLLP);
    expect(SLLP.runways.map((r) => [r.name, r.lengthM])).toEqual([['10/28', 4000]]);
    expect(SLLP.elevationFt).toBe(13314);
    for (const t of ['A', 'B']) expect(ap.taxiwayNames.has(t), t).toBe(true);
    expect(SLLP.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A', 'B']);
    expect([...ap.stands.keys()].sort()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('backtracks departures 10 from A and arrivals 28 to A', () => {
    const ops = (rwy: string) => SLLP.runwayOps.find((o) => o.runway === rwy)!;
    expect(ops('10').departureEntries).toMatchObject([{ holdingPoint: 'A', backtrack: true }]);
    expect(ops('28').departureEntries).toMatchObject([{ holdingPoint: 'B', fullLength: true, toraM: 4000 }]);
    expect(ops('28').exits).toMatchObject([{ name: 'A', backtrack: true }]);
  });

  it('plans the SIDs by the direction of the destination, some from runway 28 only', () => {
    expect(sidsForDestination(SLLP, '28', 'SPJC').map((s) => s.name)).toEqual(['ELAKO6', 'ELAKO7']);
    expect(sidsForDestination(SLLP, '10', 'SLVR').map((s) => s.name)).toEqual(['TERAX1']);
    expect(sidsForDestination(SLLP, '28', 'SLCO').map((s) => s.name)).toEqual(['ELAMU1', 'ELAMU2']);
    expect(sidsForDestination(SLLP, '28', 'SBGR').map((s) => s.name)).toEqual(['DAKOG1']);
  });

  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['28', '10']) {
      const sim = new Simulation({ airport: SLLP, position: 'GND', runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(1);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(1);
    }
  }, 120000);
});
