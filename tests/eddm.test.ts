import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { sidsForDestination } from '../src/core/delivery';
import { parseTransmission } from '../src/core/phraseology/parser';
import { aircraftType } from '../src/data/aircraftTypes';
import { Simulation } from '../src/core/simulation';
import { EDDM } from '../src/data/airports/eddm';
import { createBot } from './bot';

const A320 = aircraftType('A320');

describe('München (EDDM) after the DFS AIP', () => {
  it('has the two parallel runways and the holding points of the aerodrome chart', () => {
    expect(EDDM.runways.map((r) => [r.name, r.lengthM, r.widthM])).toEqual([
      ['08L/26R', 4000, 60],
      ['08R/26L', 4000, 60],
    ]);
    const hps = EDDM.taxiNodes.filter((n) => n.holdingPoint).map((n) => `${n.holdingPoint!.name}:${n.holdingPoint!.runway}`);
    const names = (p: string, nums: number[]) => nums.map((i) => `${p}${i}`);
    expect(hps.filter((h) => h.endsWith('08L/26R')).map((h) => h.split(':')[0]).sort()).toEqual(names('A', [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15]).sort());
    expect(hps.filter((h) => h.endsWith('08R/26L')).map((h) => h.split(':')[0]).sort()).toEqual(names('B', [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15]).sort());
    // Each holding point leads onto the runway along its own taxiway (B6 / B7 and B8 / B10 / B11 cross each other).
    for (const e of EDDM.taxiEdges.filter((x) => x.kind === 'runwayStrip')) expect(e.to, e.name).toBe(`RWY.${e.name}`);
  });

  it('publishes the take-off runs of the intersections (AIP AD 2.13) and the high-speed turn-offs (AD 2.20)', () => {
    const ops = (rwy: string) => EDDM.runwayOps.find((o) => o.runway === rwy)!;
    expect(Object.fromEntries(ops('26R').departureEntries.map((e) => [e.holdingPoint, e.toraM]))).toEqual({ A15: 4000, A14: 4000, A13: 3900, A12: 3009, A10: 2489 });
    expect(Object.fromEntries(ops('08R').departureEntries.map((e) => [e.holdingPoint, e.toraM]))).toEqual({ B1: 4000, B2: 4000, B3: 3885, B4: 3069, B6: 2449 });
    expect(ops('08L').exits.filter((x) => x.rapid).map((x) => x.name)).toEqual(['A5', 'A8', 'A10', 'A12']);
    expect(ops('26L').exits.filter((x) => x.rapid).map((x) => x.name)).toEqual(['B11', 'B8', 'B6', 'B4']);
  });

  it('assigns the runway by direction: north and north-east from the northern runway, south from the southern one', () => {
    const sim = new Simulation({ airport: EDDM, position: 'GND', density: 'medium', seed: 1, events: false, runway: '26R+26L', generateTraffic: false });
    expect(sim.runwayFor('218', A320, 'departure', 10)).toBe('26R'); // Hamburg
    expect(sim.runwayFor('218', A320, 'departure', 200)).toBe('26L'); // Rome
    expect(sim.runwayFor('218', A320, 'departure', 300)).toBe('26L'); // north-west: 26L
    expect(sim.runwayFor('218', A320, 'arrival', 340)).toBe('26R');
    expect(sim.runwayFor('218', A320, 'arrival', 150)).toBe('26L');
    expect(sidsForDestination(EDDM, '26R', 'EDDH').map((s) => s.name)).toEqual(['EVIVA5N']);
    expect(sidsForDestination(EDDM, '26L', 'LIRF').map((s) => s.name)).toEqual(['TULSI7S']);
    expect(sidsForDestination(EDDM, '08L', 'EGLL').map((s) => s.name)).toEqual(['RIDAR7Q']);
  });

  it('reads B12WEST typed and spoken', () => {
    const ctx = { callsigns: ['DLH4AB'], taxiways: new Airport(EDDM).taxiwayNames };
    const via = (text: string) => (parseTransmission(text, ctx).commands[0] as { via: string[] }).via;
    expect(via('DLH4AB taxi to stand 218 via B12, B12WEST, S7, W2')).toEqual(['B12', 'B12WEST', 'S7', 'W2']);
    expect(via('DLH4AB taxi to stand 218 via bravo one two, bravo one two west, sierra seven')).toEqual(['B12', 'B12WEST', 'S7']);
  });

  it('runs an hour of traffic in each operating direction (scripted Ground and Tower) without collisions', () => {
    for (const runway of ['26R+26L', '08L+08R']) {
      const sim = new Simulation({ airport: EDDM, position: 'GND', positions: ['GND', 'TWR'], runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      const landedOn = new Set<string>();
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
        for (const a of sim.aircraft) if (a.phase === 'landing') landedOn.add(a.runway!);
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(6);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(6);
      expect(landedOn.size, runway).toBe(2);
    }
  }, 600000);
});
