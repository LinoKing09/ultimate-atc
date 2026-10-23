import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { Airport, edgeVertices } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { distance, projectOnSegment } from '../src/core/geo';
import { HOLD_SHORT_CLEAR_M, vacateStopS } from '../src/core/holdShort';
import { Path } from '../src/core/path';
import { Simulation } from '../src/core/simulation';
import type { AirportData } from '../src/core/airport/types';
import { EDDK } from '../src/data/airports/eddk';
import { EDDP } from '../src/data/airports/eddp';

const lastPilot = (s: Simulation, cs: string) => [...s.messages].reverse().find((m) => m.kind === 'pilot' && m.from === cs)?.text ?? '';
function runUntil(s: Simulation, cond: () => boolean, maxS: number): boolean {
  for (let t = 0; t < maxS && !cond(); t++) s.tick(1);
  return cond();
}

describe('hold short', () => {
  it('stops at the intermediate holding position of the charts, clear of the junction (Leipzig N / E7)', () => {
    for (const later of [false, true]) {
      const s = new Simulation({ airport: EDDP, position: 'GND', runway: '26R+26L', density: 'light', seed: 1, generateTraffic: false, events: false });
      const ac = s.traffic.spawnDeparture(60, { stand: '136', callsign: 'DLH9YP', type: 'CRJ9' }) as Aircraft;
      runUntil(s, () => ac.request === 'pushback', 600);
      s.transmit('DLH9YP push and start approved');
      runUntil(s, () => ac.request === 'taxi', 600);
      s.transmit(`DLH9YP taxi to runway 26R via N, E7${later ? '' : ', hold short of E7'}`);
      expect(runUntil(s, () => /^Taxi to holding point/.test(lastPilot(s, 'DLH9YP')), 30), lastPilot(s, 'DLH9YP')).toBe(true);
      if (later) {
        runUntil(s, () => ac.s > 60, 300);
        s.transmit('DLH9YP hold short of E7');
      }
      expect(runUntil(s, () => ac.stoppedAt?.kind === 'holdShort', 900)).toBe(true);
      // The nose at the dashed line west of the junction (OSM node 2688943217), not in the junction.
      const itp = s.airport.node('HP.2688943217');
      expect(itp.intermediateHold).toBe(true);
      expect(distance(ac.pos, itp.pos)).toBeCloseTo(ac.type.lengthM / 2, -1);
      expect(distance(ac.pos, s.airport.node('E7/H7/N').pos)).toBeGreaterThan(70);
    }
  });

});

describe('rapid exits', () => {
  /** From where an arrival stops after the exit, the crew can taxi either way along the taxiway it meets. */
  function bothWays(data: AirportData, runway: string, exit: string, along: string): void {
    const ap = new Airport(data);
    const ex = data.runwayOps.find((o) => o.runway === runway)!.exits.find((e) => e.name === exit)!;
    const nodes = ex.path.map((id) => ap.node(id));
    const line = ap.polyline(nodes);
    const path = new Path(line.points, line.ids, 40);
    const s = vacateStopS(ap, path, ex.path, 38);
    const start = { position: path.pointAt(s), heading: path.headingAt(s) };
    // Where `along` meets the exit, and a node on it some 300 m to either side.
    const edges = ap.edges.filter((e) => e.name === along);
    const ends = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
    const junction = ends.reduce((a, b) => (distance(a.pos, start.position) < distance(b.pos, start.position) ? a : b));
    const v = edgeVertices(edges.find((e) => e.from === junction || e.to === junction)!);
    const dir = { x: v[v.length - 1].x - v[0].x, y: v[v.length - 1].y - v[0].y };
    for (const sign of [1, -1]) {
      const side = ends.filter((n) => sign * ((n.pos.x - junction.pos.x) * dir.x + (n.pos.y - junction.pos.y) * dir.y) > 0);
      const target = side.sort((a, b) => Math.abs(distance(a.pos, junction.pos) - 300) - Math.abs(distance(b.pos, junction.pos) - 300))[0];
      const r = findRoute(ap, start, target, [along], { allowUTurn: false, wingspanM: 36 });
      expect(isRouteError(r) ? r.error : r.length, `${data.icao} ${exit} -> ${along} ${sign}`).toBeLessThan(distance(start.position, target.pos) * 2 + 300);
    }
    // The aircraft stops behind the runway holding position, with its nose clear of the taxiway ahead.
    const nose = path.pointAt(Math.min(path.length, s + 19));
    const clear = Math.min(...edges.flatMap((e) => edgeVertices(e).slice(1).map((p, i) => projectOnSegment(nose, edgeVertices(e)[i], p).dist)));
    expect(clear).toBeGreaterThan(HOLD_SHORT_CLEAR_M - 3);
    expect(s).toBeGreaterThan((path.marker(ex.path[1])?.s ?? 0) + 19);
  }

  it('Leipzig/Halle S3, S4 (26L) and S8 (08R): on to T either way', () => {
    bothWays(EDDP, '26L', 'S3', 'T');
    bothWays(EDDP, '26L', 'S4', 'T');
    bothWays(EDDP, '08R', 'S8', 'T');
  });

  it('Cologne/Bonn A1 and A2 (13L): on to A either way', () => {
    bothWays(EDDK, '13L', 'A1', 'A');
    bothWays(EDDK, '13L', 'A2', 'A');
  });
});
