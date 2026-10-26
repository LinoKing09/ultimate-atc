import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { sidsForDestination } from '../src/core/delivery';
import { Simulation } from '../src/core/simulation';
import { aircraftType } from '../src/data/aircraftTypes';
import { TNCM } from '../src/data/airports/tncm';
import { createBot } from './bot';

describe('St. Maarten (TNCM) after the Dutch Caribbean eAIP', () => {
  it('has runway 10/28 with the displaced threshold 10, the taxiways A-E, holding points and stands', () => {
    const ap = new Airport(TNCM);
    expect(TNCM.runways.map((r) => [r.name, r.lengthM])).toEqual([['10/28', 2300]]);
    for (const t of ['A', 'B', 'C', 'D', 'E']) expect(ap.taxiwayNames.has(t), t).toBe(true);
    expect(TNCM.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    const aprons = new Map<string, number>();
    for (const s of ap.stands.values()) aprons.set(s.apron, (aprons.get(s.apron) ?? 0) + 1);
    expect(Object.fromEntries(aprons)).toEqual({ 'Apron A': 4, 'Apron B': 5, 'Apron C': 10, 'Apron E': 2 });
    // Delivery and Tower only: Juliana Tower handles the taxiing.
    expect(TNCM.stations.map((s) => s.type)).toEqual(['DEL', 'TWR', 'APP', 'ATIS']);
  });

  it('publishes the remaining runway from each taxiway and backtracks on runway 28', () => {
    const ops = (rwy: string) => TNCM.runwayOps.find((o) => o.runway === rwy)!;
    expect(Object.fromEntries(ops('10').departureEntries.map((e) => [e.holdingPoint, e.toraM]))).toEqual({ A: 2300, B: 1968, C: 1576, D: 1432, E: 1258 });
    expect(ops('28').departureEntries).toMatchObject([
      { holdingPoint: 'E', backtrack: true, toraM: 962 },
      { holdingPoint: 'D', backtrack: true, toraM: 785 },
      { holdingPoint: 'C', backtrack: true, toraM: 651 },
    ]);
    expect(ops('10').exits).toMatchObject([
      { name: 'E', backtrack: true },
      { name: 'D', backtrack: true },
      { name: 'C', backtrack: true },
    ]);
  });

  it('files jets on MODOR2, turboprops on BOPAT2, and gives radar vectors from runway 28', () => {
    expect(sidsForDestination(TNCM, '10', 'KMIA', aircraftType('A321')).map((s) => s.name)).toEqual(['MODOR2']);
    expect(sidsForDestination(TNCM, '10', 'TFFJ', aircraftType('DHC6')).map((s) => s.name)).toEqual(['BOPAT2']);
    expect(sidsForDestination(TNCM, '28', 'KMIA', aircraftType('A321')).map((s) => s.name)).toEqual(['RV']);
  });

  it('runs an hour of traffic on each runway (scripted Tower) without collisions', () => {
    for (const runway of ['10', '28']) {
      const sim = new Simulation({ airport: TNCM, position: 'TWR', runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(3);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(2);
    }
  }, 120000);
});
