import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { pavementGeometry } from '../src/core/airport/pavement';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import type { AirportData } from '../src/core/airport/types';
import { Simulation } from '../src/core/simulation';
import { approachType, defaultSystemStates } from '../src/core/systems';
import { EDDN } from '../src/data/airports/eddn';
import { EDXW } from '../src/data/airports/edxw';

const designators = (data: AirportData) => new Set(data.taxiEdges.filter((e) => e.kind === 'taxiway' || e.kind === 'taxilane').map((e) => e.name));
const holdingPoints = (data: AirportData) => data.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort();

describe('pavement lines', () => {
  it('are drawn but never routed; a closed one is known by name and refused', () => {
    const data: AirportData = {
      ...EDXW,
      pavement: [...(EDXW.pavement ?? []), { name: 'Z9', closed: true, points: [EDXW.taxiNodes[0].pos, EDXW.taxiNodes[1].pos] }],
    };
    const ap = new Airport(data);
    expect(ap.taxiwayNames.has('Z9')).toBe(true);
    expect(ap.outOfServiceTaxiways.has('Z9')).toBe(true);
    const geo = pavementGeometry(ap);
    expect(geo.chains.filter((c) => c.closed).length).toBeGreaterThan(0);
    const res = findRoute(ap, { node: ap.node('STAND_01') }, ap.holdingPoint('D')!, ['Z9'], { wingspanM: 35.8 });
    expect(isRouteError(res) && res.error).toBe('taxiway Z9 closed');
  });

  it('drawOnly edges of an OSM layout become pavement, not graph edges', () => {
    const ap = new Airport(EDXW);
    // The paved area at the 14 end between D, L and F would bypass the holding points as a graph edge.
    expect(ap.edges.some((e) => e.kind !== 'runway' && [e.from.id, e.to.id].includes('RWY.F.2'))).toBe(false);
    expect(ap.pavementLines.length).toBeGreaterThan(20);
    expect(ap.pavementLines.every((l) => l.points.length >= 2)).toBe(true);
  });
});

describe('Sylt layout (aerodrome chart)', () => {
  it('has every taxiway of the chart', () => {
    const names = designators(EDXW);
    for (const t of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'L', 'L1', 'L3', 'M', 'P']) expect(names.has(t), t).toBe(true);
    expect(holdingPoints(EDXW)).toEqual(['A', 'A2', 'B', 'C', 'D', 'D2', 'E', 'F', 'G', 'L', 'M', 'P']);
    expect(EDXW.buildings.filter((b) => b.name).map((b) => b.name)).toEqual(expect.arrayContaining(['Terminal 1', 'General Aviation Terminal', 'Halle 28']));
  });

  it('keeps simulated traffic off the light-aircraft taxiways and routes departures 32 across runway 06/24', () => {
    const ap = new Airport(EDXW);
    // B is limited to 5.7 t: no simulated aircraft (smallest: business jets) may use it.
    expect(isRouteError(findRoute(ap, { node: ap.node('STAND_01') }, ap.holdingPoint('B')!, ['D', 'A', 'B'], { wingspanM: 17.2 }))).toBe(true);
    const r = findRoute(ap, { node: ap.node('STAND_01') }, ap.holdingPoint('A')!, [], { wingspanM: 35.8 });
    expect(isRouteError(r)).toBe(false);
    if (!isRouteError(r)) {
      expect(r.taxiways).toEqual(['D', 'A']);
      expect(r.nodes.map((n) => n.id)).toContain('RWY.?');
    }
    // Business jets below 19 m from Apron 2 and larger ones from Apron 3 reach both runways.
    for (const hp of ['A', 'D']) expect(isRouteError(findRoute(ap, { node: ap.node('STAND_G4') }, ap.holdingPoint(hp)!, [], { wingspanM: 17.2 }))).toBe(false);
    expect(isRouteError(findRoute(ap, { node: ap.node('STAND_G4') }, ap.holdingPoint('D')!, [], { wingspanM: 21 }))).toBe(true);
    for (const hp of ['A', 'L']) expect(isRouteError(findRoute(ap, { node: ap.node('STAND_N1') }, ap.holdingPoint(hp)!, [], { wingspanM: 21 }))).toBe(false);
  });
});

describe('Nuremberg layout (ground movement chart)', () => {
  it('has the general aviation lanes, the terminal and the hangars', () => {
    const names = designators(EDDN);
    for (const t of ['A', 'B', 'C', 'D', 'E', 'F', 'J', 'M1', 'M2', 'M3', 'M4', 'N2', 'N4', 'S3', 'S4', 'T2']) expect(names.has(t), t).toBe(true);
    const buildings = EDDN.buildings.map((b) => b.name);
    expect(buildings).toEqual(expect.arrayContaining(['Flughafen-Terminal', 'Hangar 2', 'Hangar 3', 'Hangar 4', 'Hangar 7', 'Hangar 8', 'Halle A']));
    expect(EDDN.buildings.length).toBeGreaterThan(50);
  });
});

describe('published approaches', () => {
  it('a runway without an ILS is flown as RNP whatever the ILS switches say', () => {
    const on = defaultSystemStates();
    expect(approachType(on)).toBe('ILS');
    expect(approachType(on, ['ILS', 'RNP'])).toBe('ILS');
    expect(approachType({ ...on, gp: false }, ['ILS', 'LOC', 'RNP'])).toBe('LOC');
    // No localizer minima for airliners (Stuttgart 07): RNP when the glide path fails.
    expect(approachType({ ...on, gp: false }, ['ILS', 'RNP'])).toBe('RNP');
    expect(approachType({ ...on, loc: false }, ['ILS', 'LOC', 'RNP'])).toBe('RNP');
    expect(approachType(on, ['RNP'])).toBe('RNP');
  });

  it('Sylt: ILS for runway 32, RNP for runway 14', () => {
    const s14 = new Simulation({ airport: EDXW, position: 'TWR', runway: '14', density: 'medium', seed: 1, generateTraffic: false });
    expect(s14.approachName()).toBe('RNP approach runway 14');
    expect(s14.atisText()).not.toMatch(/ILS/);
    const s32 = new Simulation({ airport: EDXW, position: 'TWR', runway: '32', density: 'medium', seed: 1, generateTraffic: false });
    expect(s32.approachName()).toBe('ILS approach runway 32');
  });
});
