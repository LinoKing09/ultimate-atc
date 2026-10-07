import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { EDDS } from '../src/data/airports/edds';

const airport = new Airport(EDDS);

describe('EDDS data', () => {
  it('has a consistent taxi graph', () => {
    for (const e of airport.edges) {
      expect(e.length).toBeGreaterThan(0.5);
    }
    expect(airport.stands.size).toBeGreaterThan(30);
    expect(airport.holdingPoint('G1')?.holdingPoint?.runway).toBe('07/25');
  });

  it('has a runway of about 3345 m pointing ~074 true', () => {
    const r25 = airport.runwayEnd('25')!;
    const r07 = airport.runwayEnd('07')!;
    expect(r07.length).toBeGreaterThan(3300);
    expect(r07.length).toBeLessThan(3400);
    expect(r07.heading).toBeGreaterThan(70);
    expect(r07.heading).toBeLessThan(78);
    expect(Math.round((r25.heading - r07.heading + 360) % 360)).toBe(180);
  });

  it('has valid runway operations data', () => {
    for (const ops of EDDS.runwayOps) {
      expect(airport.runwayEnd(ops.runway)).toBeDefined();
      for (const e of ops.departureEntries) expect(airport.holdingPoint(e.holdingPoint), e.holdingPoint).toBeDefined();
      for (const ex of ops.exits) {
        ex.path.forEach((id) => expect(airport.nodes.has(id), id).toBe(true));
        expect(airport.node(ex.path[1]).holdingPoint, `${ex.name} exit holding point`).toBeDefined();
      }
    }
  });

  it('every stand can reach every departure holding point', () => {
    for (const s of airport.stands.values()) {
      for (const hp of ['G1', 'A1']) {
        const r = findRoute(airport, { node: s.node }, airport.holdingPoint(hp)!);
        expect(isRouteError(r), `stand ${s.id} -> ${hp}`).toBe(false);
      }
    }
  });
});

describe('findRoute', () => {
  it('follows the given via taxiways', () => {
    const r = findRoute(airport, { node: airport.stand('10')!.node }, airport.holdingPoint('G1')!, ['R', 'N', 'G']);
    if (isRouteError(r)) throw new Error(r.error);
    expect(r.taxiways).toEqual(['10', 'R', 'N', 'G'].filter((t) => t !== '10'));
    expect(r.nodes[r.nodes.length - 1].id).toBe('G1');
  });

  it('allows the taxilane to be omitted when leaving a stand', () => {
    const r = findRoute(airport, { node: airport.stand('10')!.node }, airport.holdingPoint('G1')!, ['N']);
    expect(isRouteError(r)).toBe(false);
  });

  it('rejects routes that do not connect', () => {
    const r = findRoute(airport, { node: airport.stand('10')!.node }, airport.holdingPoint('G1')!, ['S']);
    expect(isRouteError(r)).toBe(true);
  });

  it('rejects unknown taxiways', () => {
    const r = findRoute(airport, { node: airport.stand('10')!.node }, airport.holdingPoint('G1')!, ['Q']);
    expect(isRouteError(r) && r.error).toContain('unknown taxiway');
  });

  it('auto-routes avoid crossing the runway when possible', () => {
    const r = findRoute(airport, { node: airport.stand('10')!.node }, airport.holdingPoint('A1')!);
    if (isRouteError(r)) throw new Error(r.error);
    expect(r.edges.some((e) => e.kind === 'runwayStrip')).toBe(false);
  });

  it('respects one-way rapid exits', () => {
    // Taxiing from N into rapid exit E towards the runway is not allowed.
    const r = findRoute(airport, { node: airport.node('N_E') }, airport.holdingPoint('E1')!, ['E']);
    expect(isRouteError(r)).toBe(true);
  });

  it('routes from an arbitrary position on the network', () => {
    const n = airport.node('N_D').pos;
    const r = findRoute(airport, { position: { x: n.x + 30, y: n.y }, heading: 254 }, airport.holdingPoint('A1')!, ['N', 'A']);
    expect(isRouteError(r)).toBe(false);
  });
});
