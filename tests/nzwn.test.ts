import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { sidsForDestination } from '../src/core/delivery';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { aircraftType } from '../src/data/aircraftTypes';
import { NZWN } from '../src/data/airports/nzwn';
import { createBot } from './bot';

describe('Wellington (NZWN) after OpenStreetMap and the VATNZ procedures', () => {
  it('has runway 16/34 with the displaced thresholds, the taxiways, holding points and stands', () => {
    const ap = new Airport(NZWN);
    expect(NZWN.runways.map((r) => r.name)).toEqual(['16/34']);
    for (const t of ['A', 'B', 'C', 'D', 'P', 'Q', 'R', 'S', 'T', 'U', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10']) {
      expect(ap.taxiwayNames.has(t), t).toBe(true);
    }
    expect(NZWN.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A1', 'A10', 'A11', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']);
    // The Western Apron across the runway is drawn only.
    expect((NZWN.pavement ?? []).some((l) => l.name === 'M')).toBe(true);
    expect(ap.taxiwayNames.has('M')).toBe(false);
    const aprons = new Map<string, number>();
    for (const s of ap.stands.values()) aprons.set(s.apron, (aprons.get(s.apron) ?? 0) + 1);
    expect(Object.fromEntries(aprons)).toEqual({ 'South pier': 18, 'South-west pier': 6, 'Main apron': 16, 'North-west pier': 11 });
  });

  it('publishes the full-length take-off runs behind the displaced thresholds', () => {
    const tora = (rwy: string) => NZWN.runwayOps.find((o) => o.runway === rwy)!.departureEntries.find((e) => e.fullLength)!;
    expect(tora('16')).toMatchObject({ holdingPoint: 'A1', toraM: 1945 });
    expect(tora('34')).toMatchObject({ holdingPoint: 'A11', toraM: 1921 });
  });

  it('files jets and turboprops on their own SIDs', () => {
    const jet = aircraftType('A320')!;
    const prop = aircraftType('AT76')!;
    expect(sidsForDestination(NZWN, '16', 'NZAA', jet).map((s) => s.name)).toEqual(['ATVEV1Q']);
    expect(sidsForDestination(NZWN, '34', 'YSSY', jet).map((s) => s.name)).toEqual(['UPLUD1P', 'UPLUD1R']);
    expect(sidsForDestination(NZWN, '16', 'NZNS', prop).map((s) => s.name)).toEqual(['IDVAL1Q']);
    expect(sidsForDestination(NZWN, '16', 'NZCH', prop).map((s) => s.name)).toEqual(['AGROR1Q']);
    expect(sidsForDestination(NZWN, '16', 'NZAA', prop).map((s) => s.name)).toEqual(['UPROG1Q']);
    expect(sidsForDestination(NZWN, '34', 'NZNS', prop).map((s) => s.name)).toEqual(['IPKEP1P']);
    expect(sidsForDestination(NZWN, '34', 'NZNR', prop).map((s) => s.name)).toEqual(['URGEV1P']);
  });

  it('understands the stand names with letters (R2S, 24AN, 7E)', () => {
    const stand = (t: string) => {
      const c = parseTransmission(`SDA1 taxi to stand ${t} via A`, { callsigns: ['SDA1'], taxiways: new Set(['A']), sids: [] }).commands[0];
      return c?.type === 'taxi' && c.destination?.kind === 'stand' ? c.destination.stand : undefined;
    };
    expect(['R2S', 'romeo 2 sierra', '24AN', '24 alpha november', '7E', '3N', '12'].map(stand)).toEqual(['R2S', 'R2S', '24AN', '24AN', '7E', '3N', '12']);
  });

  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['34', '16']) {
      const sim = new Simulation({ airport: NZWN, position: 'GND', runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(8);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(4);
    }
  }, 120000);
});
