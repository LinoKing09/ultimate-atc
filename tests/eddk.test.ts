import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDDK } from '../src/data/airports/eddk';
import { createBot } from './bot';

/** An hour of traffic with a scripted Ground controller (the AI Delivery and Tower do the rest). */
function runHour(runway: string): Simulation {
  const sim = new Simulation({ airport: EDDK, position: 'GND', runway, density: 'medium', seed: 1, events: false });
  const bot = createBot(sim);
  for (let t = 0; t < 3600; t++) {
    sim.tick(1);
    bot();
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

describe('Cologne/Bonn (EDDK) runway combinations (VATSIM Germany SOP)', () => {
  const sim = (runway: string, position: 'GND' | 'TWR' = 'TWR') => new Simulation({ airport: EDDK, position, runway, density: 'light', seed: 1, generateTraffic: false, events: false });

  it('offers 31R + 24 (take-offs 31R, landings 24) and 31R + 31L (code C landings on 31L), never 24 or 31L alone', () => {
    const s = sim('31R+24');
    expect(s.departureRunways).toEqual(['31R']);
    expect(s.arrivalRunways).toEqual(['24']);
    expect(s.atisText(s.atis)).toContain('arrival runway 24, departure runway 31R');
    // Other role splits are not allowed: back to the published one.
    expect(s.checkedUse('31R+24', { roles: {}, approaches: 'staggered' })?.roles).toEqual({ '31R': 'departures', '24': 'arrivals' });
    const p = sim('31R+31L');
    expect(p.arrivalRunways).toEqual(['31R', '31L']);
    expect(p.departureRunways).toEqual(['31R']);
    expect(p.parallelUse?.approaches).toBe('dependent');
    expect(p.checkedUse('31R+31L', { roles: { '31L': 'arrivals' }, approaches: 'independent' })?.approaches).not.toBe('independent');
    expect(p.atisDatis(p.atis).join(' ')).toContain('RWY 31L ONLY FOR A/C WITH WINGSPAN UP TO 36M');
    const a320 = p.traffic.spawnArrival(8, { type: 'A320' })!;
    const b748 = p.traffic.spawnArrival(8, { type: 'B748' })!;
    expect(p.runwayFor(a320.assignedStand, a320.type, 'arrival')).toMatch(/31[LR]/);
    expect(p.runwayFor(b748.assignedStand, b748.type, 'arrival')).toBe('31R');
    expect(() => sim('24')).toThrow(/landings only/);
    expect(() => s.updateAtis({ runway: '31L' })).toThrow(/landings only/);
    // The default stays 13L/31R alone.
    expect(sim('31R').runways).toEqual(['31R']);
  });

  it('a take-off on 31R must pass runway 24 before the next arrival to 24 is at 1 NM, else that one goes around', () => {
    const s = sim('31R+24');
    const t = s.tower;
    const r31 = t.endFor('31R');
    const r24 = t.endFor('24');
    const x = t.crossingAlong(r31, r24)!;
    // The intersection is about 1.5 km from threshold 31R (between A2 and A3).
    expect(x).toBeGreaterThan(1200);
    expect(x).toBeLessThan(2000);
    const dep = s.traffic.spawnDeparture(0, { type: 'A320', callsign: 'EWG1' })!;
    Object.assign(dep, { phase: 'takeoff', runway: '31R', onGround: true, pos: { ...r31.threshold }, speed: 0 });
    expect(t.crossingConflict(dep, r24)).toBe(true);
    expect(t.runwayBusy(undefined, r24)).toBe(true);
    const arr = s.traffic.spawnArrival(1.2, { type: 'A320', callsign: 'EWG2', runway: '24' })!;
    arr.landingCleared = true;
    // Arrivals to 24 count for the take-off on 31R from 1 NM final.
    expect(t.nextArrivalEta(r31, true)).toBeLessThan(t.nextArrivalEta(r31));
    for (let i = 0; i < 20 && arr.phase === 'approach'; i++) {
      s.tick(1);
      dep.pos = { ...r31.threshold };
    }
    expect(arr.phase).not.toBe('approach');
    expect(arr.phase).not.toBe('landing');
    // Once the departure is past the intersection, runway 24 is free of it.
    const beyond = { x: r31.threshold.x + Math.sin((r31.heading * Math.PI) / 180) * (x + 200), y: r31.threshold.y + Math.cos((r31.heading * Math.PI) / 180) * (x + 200) };
    dep.pos = beyond;
    expect(t.crossingConflict(dep, r24)).toBe(false);
  });

  it('runs an hour of traffic on each combination (scripted Ground, AI Tower) without collisions or incursions', () => {
    for (const runway of ['31R+24', '31R+31L']) {
      const s = runHour(runway);
      expect(s.stats.collisions, runway).toBe(0);
      expect(s.stats.incursions, runway).toBe(0);
      expect(s.stats.departuresAirborne, runway).toBeGreaterThan(5);
      expect(s.stats.arrivalsParked, runway).toBeGreaterThan(4);
    }
  }, 180000);
});
