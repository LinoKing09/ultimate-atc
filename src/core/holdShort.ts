import { edgeVertices, type Airport, type TaxiEdge } from './airport/airport';
import type { TaxiRoute } from './airport/routing';
import { distance, projectOnSegment, type Vec2 } from './geo';
import type { Path } from './path';

/**
 * Where an aircraft holds short of a taxiway. Without markings it stops where its nose keeps
 * HOLD_SHORT_CLEAR_M from the centre line of that taxiway (the wingtip of a wide-body passing by
 * stays clear); where the charts have an intermediate holding position before the junction
 * (OpenStreetMap `holding_position:type=intermediate`) it stops with its nose at that line.
 */

/** Distance (m) of the nose from the centre line of the taxiway an aircraft holds short of. */
export const HOLD_SHORT_CLEAR_M = 40;
/** An intermediate holding position at most this far (m) before the junction protects it. */
const ITP_RANGE_M = 250;
/** Unnamed edges up to this length are the fillets of a junction (as in routing.ts). */
const FILLET_M = 150;

/** Distance from a point to the centre lines of the edges. */
function distanceToEdges(p: Vec2, edges: TaxiEdge[]): number {
  let best = Infinity;
  for (const e of edges) {
    const v = edgeVertices(e);
    for (let i = 1; i < v.length; i++) best = Math.min(best, projectOnSegment(p, v[i - 1], v[i]).dist);
  }
  return best;
}

/** The edges of taxiway `name` near a point (a long taxiway may pass the route elsewhere too). */
export function taxiwayEdgesNear(airport: Airport, name: string, at: Vec2, radius = 400): TaxiEdge[] {
  const N = name.toUpperCase();
  return airport.edges.filter((e) => e.name.toUpperCase() === N && edgeVertices(e).some((p) => distance(p, at) < radius));
}

/**
 * The furthest arc length at or before `fromS` (scanning back to `minS`) where the nose of an aircraft
 * of this length is HOLD_SHORT_CLEAR_M from the edges; `minS` if there is none.
 */
export function clearOfS(path: Path, fromS: number, protect: TaxiEdge[], lengthM: number, minS: number): number {
  for (let s = Math.min(fromS, path.length); s >= minS; s -= 2) {
    const nose = path.pointAt(Math.min(path.length, s + lengthM / 2));
    if (distanceToEdges(nose, protect) >= HOLD_SHORT_CLEAR_M) return s;
  }
  return minS;
}

const isFillet = (e: TaxiEdge) => !e.name && e.kind !== 'stand' && e.kind !== 'runwayStrip' && e.length <= FILLET_M;

/**
 * Stop position (arc length of the aircraft centre) before route node `i`, where the route first meets
 * taxiway `name`, not before `minS`; undefined if node `i` is already behind `minS`.
 */
export function holdShortS(airport: Airport, route: TaxiRoute, path: Path, i: number, name: string, lengthM: number, minS: number): number | undefined {
  const sOf = (k: number) => path.marker(route.nodes[k].id)?.s ?? 0;
  if (sOf(i) <= minS) return undefined;
  // The junction starts where the route leaves its taxiway onto the fillets.
  let j = i;
  while (j > 0 && isFillet(route.edges[j - 1])) j--;
  const sJ = sOf(j);
  const cur = j > 0 ? route.edges[j - 1].name : '';
  for (let k = j; k >= 0; k--) {
    const n = route.nodes[k];
    if (sJ - sOf(k) > ITP_RANGE_M) break;
    // Another junction in between: its holding positions are not for this one.
    if (k < j && n.edges.some((e) => e.name && e.name !== cur && e.kind !== 'stand')) break;
    if (n.intermediateHold && k < i) {
      const s = sOf(k) - lengthM / 2;
      if (s >= minS) return s;
      break;
    }
  }
  return clearOfS(path, sOf(i), taxiwayEdgesNear(airport, name, route.nodes[i].pos), lengthM, minS);
}

/**
 * Where an arrival stops after vacating along an exit path (runway node, holding point, ...): with its tail
 * behind the runway holding point and, where the exit ends at a junction, its nose clear of the taxiways
 * there - so traffic on the parallel taxiway passes and the crew can turn either way.
 */
export function vacateStopS(airport: Airport, path: Path, exitPath: string[], lengthM: number): number {
  const sHp = path.marker(exitPath[1])?.s ?? path.length;
  const minS = Math.min(path.length, sHp + lengthM / 2 + 5);
  const end = path.pointAt(path.length);
  // The taxiways ahead: every other named taxiway near the end of the exit.
  const own = new Set(exitPath.slice(1).flatMap((id, i) => (i > 0 ? airport.node(id).edges.filter((e) => otherIs(e, id, exitPath[i])).map((e) => e.name) : [])));
  const reach = lengthM / 2 + HOLD_SHORT_CLEAR_M + 20;
  const protect = airport.edges.filter((e) => e.name && !own.has(e.name) && (e.kind === 'taxiway' || e.kind === 'taxilane') && edgeVertices(e).some((p, i, v) => i > 0 && projectOnSegment(end, v[i - 1], p).dist < reach));
  if (!protect.length) return path.length;
  return Math.min(path.length, clearOfS(path, path.length, protect, lengthM, minS));
}

/** True if edge `e` joins node `id` with node `other`. */
function otherIs(e: TaxiEdge, id: string, other: string): boolean {
  return (e.from.id === id && e.to.id === other) || (e.to.id === id && e.from.id === other);
}
