import { add, distance, headingOf, normalize, scale, sub, type Vec2 } from '../geo';
import { Path } from '../path';
import { edgeVertices, otherEnd, type Airport, type TaxiEdge, type TaxiNode } from './airport';

/**
 * Drawing geometry of the taxiway pavement (for the scope; no DOM here).
 *
 * The taxi graph is a set of straight segments. Drawn one by one they show kinks at every shape node
 * and sharp corners at junctions. Here the edges are joined into chains (through nodes where exactly
 * two drawable edges of the same width meet) and each chain is rounded off like a taxiway centre line
 * (fillets of up to CHAIN_RADIUS). At junctions and where a taxiway meets the runway, the inner corner
 * between two neighbouring edges gets a fillet: a curved stroke of the narrower width, as the widened
 * pavement of a real junction.
 */

/** A pavement stroke: polyline in local metres and its width. */
export interface PavementStroke {
  points: Vec2[];
  widthM: number;
  /** Permanently closed edges (drawn with crosses on top). */
  closed: boolean;
}

export interface PavementGeometry {
  /** Taxiway and taxilane chains, rounded off. Their points are also the centre lines. */
  chains: PavementStroke[];
  /** Junction fillets (pavement only, no centre line). */
  fillets: PavementStroke[];
}

/** Largest radius of the bends inside a chain (metres): the radius taxiing aircraft fly (pilot.ts applyRoute). */
const CHAIN_RADIUS = 30;
/** Centre-line radius of a junction fillet (metres), plus the width of the narrower taxiway. */
const FILLET_RADIUS = 20;
/** Fillet radius where a taxiway meets a runway (wider: the entries flare out beyond the runway edge). */
const RUNWAY_FILLET_RADIUS = 55;
/** Junction corners wider than this (degrees between the two edges) need no fillet. */
const MAX_FILLET_ANGLE = 165;

const drawable = (e: TaxiEdge) => e.kind === 'taxiway' || e.kind === 'taxilane' || e.kind === 'runwayStrip';

/** Vertices of an edge starting at `from`. */
function verticesFrom(e: TaxiEdge, from: TaxiNode): Vec2[] {
  const v = edgeVertices(e);
  return e.from === from ? v : v.reverse();
}

export function pavementGeometry(airport: Airport): PavementGeometry {
  const edges = airport.edges.filter(drawable);
  const at = new Map<TaxiNode, TaxiEdge[]>();
  for (const e of edges) for (const n of [e.from, e.to]) at.set(n, [...(at.get(n) ?? []), e]);
  const sameStroke = (a: TaxiEdge, b: TaxiEdge) => a.widthM === b.widthM && a.closed === b.closed;
  /** A chain runs through this node: exactly two drawable edges of the same stroke and no runway. */
  const through = (n: TaxiNode) => {
    const es = at.get(n) ?? [];
    return es.length === 2 && sameStroke(es[0], es[1]) && !n.edges.some((e) => e.kind === 'runway');
  };

  // ---- chains
  const chains: PavementStroke[] = [];
  const used = new Set<TaxiEdge>();
  const walk = (start: TaxiNode, first: TaxiEdge): TaxiEdge[] => {
    const out = [first];
    used.add(first);
    let node = otherEnd(first, start);
    let cur = first;
    while (node !== start && through(node)) {
      const next = at.get(node)!.find((e) => e !== cur)!;
      if (used.has(next)) break;
      out.push(next);
      used.add(next);
      cur = next;
      node = otherEnd(next, node);
    }
    return out;
  };
  const emit = (start: TaxiNode, list: TaxiEdge[]) => {
    const pts: Vec2[] = [];
    let node = start;
    for (const e of list) {
      const v = verticesFrom(e, node);
      pts.push(...(pts.length ? v.slice(1) : v));
      node = otherEnd(e, node);
    }
    chains.push({ points: new Path(pts, [], CHAIN_RADIUS).points, widthM: list[0].widthM, closed: list[0].closed });
  };
  // Start at chain ends first, then whatever is left (closed rings).
  for (const [node, es] of at) {
    if (through(node)) continue;
    for (const e of es) if (!used.has(e)) emit(node, walk(node, e));
  }
  for (const e of edges) if (!used.has(e)) emit(e.from, walk(e.from, e));
  // Paved lines outside the taxi graph (links inside runway strips, closed taxiways).
  for (const l of airport.pavementLines) {
    if (l.points.length >= 2) chains.push({ points: new Path(l.points, [], CHAIN_RADIUS).points, widthM: l.widthM, closed: l.closed });
  }

  // ---- junction fillets
  const fillets: PavementStroke[] = [];
  for (const node of airport.nodes.values()) {
    const own = at.get(node) ?? [];
    if (!own.length || through(node)) continue;
    // Every edge leaving the node (runway edges too: entries get their fillets), sorted by direction.
    const legs = node.edges
      .filter((e) => drawable(e) || e.kind === 'runway')
      .map((e) => {
        const v = verticesFrom(e, node);
        const dir = normalize(sub(v[1], v[0]));
        return { e, dir, len: distance(v[0], v[1]), heading: headingOf(dir) };
      })
      .filter((l) => l.len > 1)
      .sort((a, b) => a.heading - b.heading);
    if (legs.length < 2) continue;
    for (let i = 0; i < legs.length; i++) {
      const a = legs[i];
      const b = legs[(i + 1) % legs.length];
      let angle = b.heading - a.heading;
      if (angle < 0) angle += 360;
      if (angle >= MAX_FILLET_ANGLE || angle < 5) continue;
      // Pavement of the narrower taxiway (runway legs take the width of the other leg).
      const wa = a.e.kind === 'runway' ? Infinity : a.e.widthM;
      const wb = b.e.kind === 'runway' ? Infinity : b.e.widthM;
      const width = Math.min(wa, wb);
      if (!Number.isFinite(width)) continue;
      const radius = (a.e.kind === 'runway' || b.e.kind === 'runway' ? RUNWAY_FILLET_RADIUS : FILLET_RADIUS) + width;
      const tangent = radius / Math.tan(((angle / 2) * Math.PI) / 180);
      const la = Math.min(a.len * 0.9, tangent + 5);
      const lb = Math.min(b.len * 0.9, tangent + 5);
      const pts = new Path([add(node.pos, scale(a.dir, la)), node.pos, add(node.pos, scale(b.dir, lb))], [], radius).points;
      fillets.push({ points: pts, widthM: width, closed: a.e.closed && b.e.closed });
    }
  }
  return { chains, fillets };
}
