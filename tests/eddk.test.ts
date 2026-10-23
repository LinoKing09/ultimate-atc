import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDDK } from '../src/data/airports/eddk';

/** An hour of traffic with a scripted Ground controller (the AI Delivery and Tower do the rest). */
function runHour(runway: string): Simulation {
  const sim = new Simulation({ airport: EDDK, position: 'GND', runway, density: 'medium', seed: 1, events: false });
  for (let t = 0; t < 3600; t++) {
    sim.tick(1);
    for (const ac of sim.aircraft) {
      if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
      if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) sim.transmit(`${ac.callsign} push and start approved`);
      if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${runway}`);
      if (ac.request === 'crossing') sim.transmit(`${ac.callsign} cross runway 24`);
      if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
      if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
    }
  }
  return sim;
}

describe('Cologne/Bonn (EDDK) after the AIP charts', () => {
  it('has the runways, taxiways, holding points and stands of the charts', () => {
    const ap = new Airport(EDDK);
    expect(EDDK.runways.map((r) => r.name)).toEqual(['13L/31R', '06/24', '13R/31L']);
    const graph = new Set(EDDK.taxiEdges.filter((e) => e.kind !== 'runway' && e.kind !== 'stand').map((e) => e.name));
    for (const t of ['A', 'A1', 'A2', 'A3', 'A4', 'A5', 'A7', 'B', 'D', 'E', 'M', 'N', 'L', 'P', 'S', 'T', 'T2']) expect(graph.has(t), t).toBe(true);
    // The military area south-west of 13R/31L and apron V (no positions, under construction): drawn, not routed.
    // P is used from the B crossing to apron U and drawn on to the 06 end.
    const drawn = new Set((EDDK.pavement ?? []).map((l) => l.name));
    for (const t of ['C', 'Z1', 'K1', 'K2', 'K3']) expect(drawn.has(t) && !graph.has(t), t).toBe(true);
    expect(drawn.has('P')).toBe(true);
    expect(EDDK.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A', 'A1', 'A2', 'A3', 'A4', 'A5', 'A7', 'AN', 'AS', 'B', 'E', 'P', 'T', 'T2']);
    const aprons = new Map<string, number>();
    for (const s of ap.stands.values()) aprons.set(s.apron, (aprons.get(s.apron) ?? 0) + 1);
    expect(Object.fromEntries(aprons)).toEqual({ 'Apron A': 27, 'Apron B': 17, 'Apron C': 10, 'Apron D': 32, 'Apron E': 27, 'Apron F': 12, 'Apron U': 9, 'Apron W': 13 });
  });

  it('publishes the declared distances of the AIP for every entry', () => {
    const tora = (rwy: string) => Object.fromEntries(EDDK.runwayOps.find((o) => o.runway === rwy)!.departureEntries.map((e) => [e.holdingPoint, e.toraM]));
    expect(tora('31R')).toEqual({ A: 3815, A1: 3586, A2: 2562, A3: 1781 });
    expect(tora('13L')).toEqual({ A7: 3815, A5: 3587, A4: 2743, A3: 2121 });
  });

  it('departures 31R cross runway 06/24 on A; the B747-8 parks on the cargo aprons', () => {
    const ap = new Airport(EDDK);
    const r = findRoute(ap, { node: ap.node('STAND_D30') }, ap.holdingPoint('A')!, [], { wingspanM: 35.8 });
    expect(isRouteError(r)).toBe(false);
    if (!isRouteError(r)) expect(r.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([ap.holdingPoint('AN')!.id]));
    const big = [...ap.stands.values()].filter((s) => s.maxWingspanM >= 68.4).map((s) => s.apron);
    expect(new Set(big)).toEqual(new Set(['Apron E', 'Apron F']));
  });

  it('taxis on the coloured guide lines of M and TXL-N: blue outbound, orange inbound', () => {
    const ap = new Airport(EDDK);
    const p = parseTransmission('EWG1 taxi to runway 13L via november blue mike blue a7, hold short of mike orange', { callsigns: ['EWG1'], taxiways: ap.taxiwayNames });
    expect(p.commands[0]).toMatchObject({ type: 'taxi', via: ['N BLUE', 'M BLUE', 'A7'], holdShort: [{ kind: 'taxiway', name: 'M ORANGE' }] });
    const names = (from: string, hp: string) => {
      const r = findRoute(ap, { node: ap.node(`STAND_${from}`) }, ap.holdingPoint(hp)!, [], { wingspanM: 35.8, flows: ap.flowVectors('13L'), strictFlows: true });
      return isRouteError(r) ? [] : r.taxiways;
    };
    expect(names('D20', 'A7')).toContain('M BLUE');
    expect(names('D20', 'A7')).not.toContain('M ORANGE');
  });

  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['31R', '13L']) {
      const sim = runHour(runway);
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(5);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(4);
    }
  }, 120000);
});

describe('Cologne/Bonn (EDDK) apron U', () => {
  it('business jets taxi to apron U across runway 13R/31L at B and P', () => {
    const sim = new Simulation({ airport: EDDK, position: 'GND', runway: '31R', density: 'light', seed: 1, generateTraffic: false, events: false });
    const ap = sim.airport;
    const r = findRoute(ap, { node: ap.stand('W20')!.node }, ap.stand('U12')!.node);
    expect(isRouteError(r) ? r.error : r.taxiways).toEqual(expect.arrayContaining(['B', 'P']));
  });
});
