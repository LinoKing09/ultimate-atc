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
    expect(airport.stands.size).toBeGreaterThan(50);
    for (const hp of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'W', 'Y']) {
      expect(airport.holdingPoint(hp)?.holdingPoint?.runway, hp).toBe('07/25');
    }
    for (const t of ['N', 'S', 'M', 'O', 'L2', 'L3', 'R', 'V', 'Z']) expect(airport.taxiwayNames.has(t), t).toBe(true);
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

  it('every stand can reach every departure holding point without turning around', () => {
    for (const s of airport.stands.values()) {
      for (const ops of EDDS.runwayOps) {
        for (const e of ops.departureEntries) {
          const heading = s.pushback ? (s.heading + 180) % 360 : s.heading;
          const r = findRoute(airport, { node: s.node, heading }, airport.holdingPoint(e.holdingPoint)!);
          expect(isRouteError(r), `stand ${s.id} -> ${e.holdingPoint}`).toBe(false);
        }
      }
    }
  });
});

describe('findRoute', () => {
  const stand14 = () => airport.stand('14')!.node;

  it('follows the given via taxiways', () => {
    const r = findRoute(airport, { node: stand14() }, airport.holdingPoint('A')!, ['M', 'H', 'N']);
    if (isRouteError(r)) throw new Error(r.error);
    expect(r.taxiways).toEqual(['M', 'H', 'N', 'A']);
    expect(r.nodes[r.nodes.length - 1].id).toBe('A');
  });

  it('allows the apron taxilane to be omitted when leaving a stand', () => {
    const r = findRoute(airport, { node: stand14() }, airport.holdingPoint('K')!, ['L2']);
    if (isRouteError(r)) throw new Error(r.error);
    expect(r.taxiways).toEqual(['M', 'L2', 'K']);
  });

  it('rejects routes that do not connect', () => {
    const r = findRoute(airport, { node: stand14() }, airport.holdingPoint('A')!, ['S']);
    expect(isRouteError(r)).toBe(true);
  });

  it('rejects unknown taxiways', () => {
    const r = findRoute(airport, { node: stand14() }, airport.holdingPoint('A')!, ['Q']);
    expect(isRouteError(r) && r.error).toContain('unknown taxiway');
  });

  it('auto-routes avoid crossing the runway when possible', () => {
    const r = findRoute(airport, { node: stand14() }, airport.holdingPoint('K')!);
    if (isRouteError(r)) throw new Error(r.error);
    expect(r.edges.some((e) => e.kind === 'runwayStrip')).toBe(false);
  });

  it('drive-through stands are left forwards', () => {
    const s = airport.stand('52')!;
    const r = findRoute(airport, { node: s.node, heading: s.heading }, airport.holdingPoint('K')!);
    if (isRouteError(r)) throw new Error(r.error);
    expect(r.nodes[1].id).toBe('N_52');
  });

  it('routes from an arbitrary position on the network', () => {
    const n = airport.node('N_G').pos;
    const r = findRoute(airport, { position: { x: n.x - 30, y: n.y }, heading: 254 }, airport.holdingPoint('K')!, ['N']);
    expect(isRouteError(r)).toBe(false);
  });
});

describe('EDDS briefing', () => {
  it('has a briefing that only names existing holding points', () => {
    expect(EDDS.briefing?.length).toBeGreaterThan(3);
    const text = JSON.stringify(EDDS.briefing);
    for (const m of text.matchAll(/holding point ([A-Z]\d?)\b/g)) {
      expect(EDDS.taxiNodes.some((n) => n.holdingPoint?.name === m[1])).toBe(true);
    }
  });
});
