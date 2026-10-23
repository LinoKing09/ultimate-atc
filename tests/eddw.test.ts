import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { Simulation } from '../src/core/simulation';
import { EDDW } from '../src/data/airports/eddw';

/** An hour of traffic with a scripted Ground controller (the AI Tower lands and launches). */
function runHour(runway: string): Simulation {
  const sim = new Simulation({ airport: EDDW, position: 'GND', runway, density: 'medium', seed: 1, events: false });
  for (let t = 0; t < 3600; t++) {
    sim.tick(1);
    for (const ac of sim.aircraft) {
      if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
      if (ac.request === 'clearance') sim.transmit(`${ac.callsign} cleared to ${ac.flightPlan.destination} ${ac.flightPlan.sid} departure squawk ${ac.flightPlan.squawk}`);
      if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) sim.transmit(`${ac.callsign} push and start approved`);
      if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${runway}`);
      if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
      if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
    }
  }
  return sim;
}

describe('Bremen (EDDW) after the AIP charts', () => {
  it('has the taxiways, holding points and stands of the charts', () => {
    const ap = new Airport(EDDW);
    const graph = new Set(EDDW.taxiEdges.filter((e) => e.kind !== 'runway' && e.kind !== 'stand').map((e) => e.name));
    for (const t of ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N', 'R', 'S']) expect(graph.has(t), t).toBe(true);
    // F1 (Airbus traffic only) is drawn, not routed.
    expect(EDDW.pavement?.some((l) => l.name === 'F1')).toBe(true);
    expect(EDDW.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A', 'C', 'D', 'E', 'F', 'M']);
    const stands = [...ap.stands.keys()].sort();
    expect(stands).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '12A', '13', '14', '15', '16', '17', '18', '18A', '19']);
    expect(EDDW.runways.map((r) => r.name)).toEqual(['08/26', '05/23']);
  });

  it('publishes the declared distances of the AIP for every entry', () => {
    const tora = (rwy: string) => Object.fromEntries(EDDW.runwayOps.find((o) => o.runway === rwy)!.departureEntries.map((e) => [e.holdingPoint, e.toraM]));
    expect(tora('26')).toEqual({ F: 2040, E: 1714, D: 1255 });
    expect(tora('08')).toEqual({ A: 2040, C: 1235 });
  });

  it('keeps aircraft of 36 m and more off D, E, H and S; wide-bodies reach 12A and 18A', () => {
    const ap = new Airport(EDDW);
    const route = (from: string, hp: string, wingspanM: number, via: string[] = []) => findRoute(ap, { node: ap.node(`STAND_${from}`) }, ap.holdingPoint(hp)!, via, { wingspanM });
    expect(isRouteError(route('02', 'D', 35.8))).toBe(false);
    expect(isRouteError(route('12A', 'D', 47.6))).toBe(true);
    for (const hp of ['A', 'F']) for (const s of ['12A', '18A']) expect(isRouteError(route(s, hp, 47.6)), `${s} ${hp}`).toBe(false);
    expect(isRouteError(route('17', 'F', 35.8, ['S', 'G']))).toBe(false);
  });

  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['26', '08']) {
      const sim = runHour(runway);
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(3);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(3);
    }
  }, 60000);
});
