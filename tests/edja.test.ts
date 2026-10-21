import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { Simulation } from '../src/core/simulation';
import { EDJA } from '../src/data/airports/edja';

describe('Memmingen (EDJA) layout after the aerodrome chart', () => {
  const ap = new Airport(EDJA);

  it('has all taxiways of the chart, with the closed parts marked', () => {
    for (const t of ['W', 'N', 'R', 'P', 'P4', 'C', 'D', 'E', 'S']) expect(ap.taxiwayNames.has(t)).toBe(true);
    expect([...ap.outOfServiceTaxiways]).toEqual(['S']);
    expect(ap.edges.filter((e) => e.closed).length).toBeGreaterThan(30);
    expect(ap.areas.map((a) => a.name)).toEqual(expect.arrayContaining(['Apron 1', 'Apron 2', 'Apron 3', 'Apron 4']));
  });

  it('closed edges never touch the runway and are never part of a route', () => {
    const runwayNodes = new Set(ap.edges.filter((e) => e.kind === 'runway').flatMap((e) => [e.from, e.to]));
    for (const e of ap.edges.filter((x) => x.closed)) {
      expect(runwayNodes.has(e.from) || runwayNodes.has(e.to)).toBe(false);
    }
    // From the P / E junction westwards along P (open up to the cross west of P4): the closed part east of E is not used.
    const r = findRoute(ap, { node: ap.holdingPoint('E')! }, ap.node('P.X'));
    expect(isRouteError(r)).toBe(false);
    if (!isRouteError(r)) expect(r.edges.some((e) => e.closed)).toBe(false);
    // Into the closed loop around the runway 24 end or the closed western part of P: no route.
    expect(isRouteError(findRoute(ap, { node: ap.holdingPoint('E')! }, ap.node('X24.PAD')))).toBe(true);
    expect(isRouteError(findRoute(ap, { node: ap.holdingPoint('E')! }, ap.node('P.W1')))).toBe(true);
    const viaS = findRoute(ap, { node: ap.stand('P11')!.node }, ap.holdingPoint('N')!, ['S']);
    expect(isRouteError(viaS) && viaS.error).toBe('taxiway S closed');
  });

  it('the south side takes small aircraft only, R takes airliners', () => {
    const stand = ap.stand('5')!;
    expect(isRouteError(findRoute(ap, { node: stand.node, heading: stand.heading }, ap.holdingPoint('C')!, [], { wingspanM: 36 }))).toBe(true);
    expect(isRouteError(findRoute(ap, { node: ap.holdingPoint('C')! }, ap.node('P4.5'), [], { wingspanM: 16 }))).toBe(false);
    expect(isRouteError(findRoute(ap, { node: stand.node, heading: stand.heading }, ap.holdingPoint('R')!, ['N', 'R'], { wingspanM: 36 }))).toBe(false);
  });

  it('a runway 06 departure lines up at R: 2175 m take-off run as on the chart', () => {
    const end = ap.runwayEnd('06')!;
    const ops = EDJA.runwayOps.find((o) => o.runway === '24')!;
    const rwyR = ap.node(ops.exits.find((x) => x.name === 'R')!.path[0]);
    expect(Math.round(end.length - ap.runwayCoordinates(end, rwyR.pos).along)).toBeGreaterThan(2150);
    const sim = new Simulation({ airport: EDJA, position: 'GND', runway: '06', density: 'medium', seed: 3, events: false, generateTraffic: false });
    // A regional jet: it accepts the intersection (a B737 crew needs the full length).
    const ac = sim.traffic.spawnDeparture(2, { stand: '5', callsign: 'RYR1AB', type: 'CRJ9' })!;
    for (let t = 0; t < 900 && ac.request !== 'pushback' && ac.request !== 'taxi'; t++) sim.tick(1);
    sim.transmit('RYR1AB taxi to holding point R via N, R');
    for (let t = 0; t < 900 && ac.phase !== 'holding'; t++) sim.tick(1);
    expect(ac.phase).toBe('holding');
    expect(Math.hypot(ac.pos.x - ap.holdingPoint('R')!.pos.x, ac.pos.y - ap.holdingPoint('R')!.pos.y)).toBeLessThan(15);
  });

  it('W keeps its turn towards the runway: line-up follows the curve, not the chord', () => {
    const strip = ap.holdingPoint('W')!.edges.find((e) => e.kind === 'runwayStrip')!;
    expect(strip.shape.length).toBeGreaterThan(2);
    const corner = strip.shape[Math.floor(strip.shape.length / 2)];
    const sim = new Simulation({ airport: EDJA, position: 'GND', positions: ['GND', 'TWR'], runway: '06', density: 'medium', seed: 3, events: false, generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(2, { stand: '5', callsign: 'RYR1AB', type: 'B738' })!;
    for (let t = 0; t < 900 && ac.request !== 'taxi'; t++) sim.tick(1);
    sim.transmit('RYR1AB taxi to holding point W');
    for (let t = 0; t < 900 && ac.phase !== 'holding'; t++) sim.tick(1);
    sim.transmit('RYR1AB contact tower');
    for (let t = 0; t < 60 && ac.frequency !== 'TWR'; t++) sim.tick(1);
    sim.transmit('RYR1AB line up and wait runway 06');
    let closest = Infinity;
    for (let t = 0; t < 300 && !(ac.phase === 'lineup' && ac.stoppedAt); t++) {
      sim.tick(1);
      closest = Math.min(closest, Math.hypot(ac.pos.x - corner.x, ac.pos.y - corner.y));
    }
    expect(ac.phase).toBe('lineup');
    expect(closest).toBeLessThan(15);
  });
});
