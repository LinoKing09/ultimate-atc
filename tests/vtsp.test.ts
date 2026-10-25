import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { Simulation } from '../src/core/simulation';
import { VTSP } from '../src/data/airports/vtsp';
import { createBot } from './bot';

describe('Phuket (VTSP) after the AIP Thailand charts', () => {
  it('has runway 09/27 with the displacement area, the taxiways, holding points and stands of the charts', () => {
    const ap = new Airport(VTSP);
    expect(VTSP.runways.map((r) => [r.name, r.lengthM])).toEqual([['09/27', 3100]]);
    for (const t of ['A', 'B', 'E', 'F', 'G', 'H', 'J', 'P', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) expect(ap.taxiwayNames.has(t), t).toBe(true);
    // C and D are closed (aerodrome chart), K leads to Apron E (private jets, not simulated): drawn only.
    const drawn = (VTSP.pavement ?? []).filter((l) => l.name);
    expect(drawn.filter((l) => l.closed).map((l) => l.name).sort()).toEqual(['C', 'D']);
    expect(drawn.some((l) => l.name === 'K')).toBe(true);
    expect(VTSP.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A', 'B', 'E', 'F', 'G', 'H', 'J']);
    const aprons = new Map<string, number>();
    for (const s of ap.stands.values()) aprons.set(s.apron, (aprons.get(s.apron) ?? 0) + 1);
    expect(Object.fromEntries(aprons)).toEqual({ 'Apron B': 6, 'Apron A': 13, 'Apron D': 16 });
    // Wide-bodies (code E, 65 m) on the stands the AIP gives them.
    expect([...ap.stands.values()].filter((s) => s.maxWingspanM >= 65).map((s) => s.id).sort()).toEqual(['10', '11', '12', '14', '31', '32', '33', '34', '6', '7', '8', '9']);
  });

  it('publishes the take-off run of every entry (AIP AD 2.13 / 2.23)', () => {
    const tora = (rwy: string) => Object.fromEntries(VTSP.runwayOps.find((o) => o.runway === rwy)!.departureEntries.map((e) => [e.holdingPoint, e.toraM]));
    expect(tora('27')).toEqual({ J: 3100, H: 3000, G: 2500 });
    expect(tora('09')).toEqual({ A: 3000 });
  });

  it('arrivals 09 vacate onto the western fillet of F, towards the aprons', () => {
    const ap = new Airport(VTSP);
    const f = ap.exits('09').find((e) => e.name === 'F')!;
    const end = ap.node(f.path[f.path.length - 1]).pos;
    const before = ap.node(f.path[f.path.length - 2]).pos;
    const heading = ((Math.atan2(end.x - before.x, end.y - before.y) * 180) / Math.PI + 360) % 360;
    const r = findRoute(ap, { position: end, heading }, ap.stand('4')!.node, [], { wingspanM: 35.8 });
    expect(isRouteError(r) ? r.error : r.requiresUTurn).toBe(false);
  });

  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['27', '09']) {
      const sim = new Simulation({ airport: VTSP, position: 'GND', runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(6);
      // Arrivals 09 vacate at the far end and taxi 3 km back along P: fewer are parked within the first hour.
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(2);
    }
  }, 120000);
});
