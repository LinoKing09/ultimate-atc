import { describe, expect, it } from 'vitest';
import { sidsForDestination } from '../src/core/delivery';
import { Simulation } from '../src/core/simulation';
import { KJAC } from '../src/data/airports/kjac';
import { createBot } from './bot';

describe('Jackson Hole (KJAC) after the FAA airport diagram', () => {
  it('has runway 1/19, the taxiways and holding positions of the airport diagram', () => {
    expect(KJAC.runways.map((r) => [r.name, r.lengthM])).toEqual([['01/19', 1920]]);
    expect(KJAC.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A1', 'A2', 'A3', 'A4']);
    const names = new Set(KJAC.taxiEdges.map((e) => e.name));
    for (const t of ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'B1', 'B2', 'C', 'D']) expect(names.has(t), t).toBe(true);
    expect(KJAC.stands.map((s) => s.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    // Runway 19 has the ILS, runway 1 RNAV only.
    expect(KJAC.runways[0].ends.map((e) => [e.name, !!e.approaches?.includes('ILS')])).toEqual([
      ['01', false],
      ['19', true],
    ]);
  });

  it('plans ALPIN5 from runway 19 and DIVYD2 from runway 1 for every destination', () => {
    expect(sidsForDestination(KJAC, '19', 'KDEN').map((s) => s.name)).toEqual(['ALPIN5']);
    expect(sidsForDestination(KJAC, '19', 'KSEA').map((s) => s.name)).toEqual(['ALPIN5']);
    expect(sidsForDestination(KJAC, '01', 'KORD').map((s) => s.name)).toEqual(['DIVYD2']);
  });

  it('talks FAA: Jackson Ground gives the clearances, departures contact Salt Lake Center', () => {
    const sim = new Simulation({ airport: KJAC, position: 'GND', density: 'medium', seed: 1, events: false, runway: '19', generateTraffic: false });
    expect(sim.airport.station('DEL')).toBeUndefined();
    expect(sim.stationFor('delivery')).toBe('GND');
    expect(sim.atisText()).toMatch(/^Jackson Hole information [A-Z], \d{4} Zulu\. .*altimeter \d{4}\./);
  });

  it('runs an hour of traffic in each direction (scripted Ground and Tower) without collisions', () => {
    for (const runway of ['19', '01']) {
      const sim = new Simulation({ airport: KJAC, position: 'GND', positions: ['GND', 'TWR'], runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(3);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(3);
    }
  }, 300000);
});
