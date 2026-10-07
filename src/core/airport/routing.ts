import { dot, headingVector, sub, type Vec2 } from '../geo';
import { otherEnd, type Airport, type TaxiEdge, type TaxiNode } from './airport';

/**
 * Taxi route finding.
 *
 * Controllers give taxi instructions as a destination plus an ordered list
 * of taxiways ("taxi to holding point G1 via N, G"). The router searches the
 * taxi graph for the shortest path that uses exactly these taxiways in this
 * order. Implementation: Dijkstra over the state (node, number of `via`
 * taxiways already joined).
 *
 * Free edges (not named in `via`) are tolerated only where controllers
 * normally omit them:
 *  - before the first via taxiway: stand lead-in lines, apron taxilanes and the
 *    taxiway the aircraft is currently on,
 *  - after the last via taxiway: stand lead-in lines, taxilanes and the
 *    taxiway the destination lies on.
 *
 * With an empty `via` list the router returns the shortest overall route
 * (used by the UI's "auto route" and by AI traffic) and avoids crossing
 * runways if any alternative exists.
 */

export interface RouteStart {
  /** Start at a node (e.g. a stand). */
  node?: TaxiNode;
  /** ...or at an arbitrary position/heading (an aircraft somewhere on the network). */
  position?: Vec2;
  heading?: number;
}

export interface TaxiRoute {
  /** Nodes to pass through, in order. The first entry is the start node. */
  nodes: TaxiNode[];
  /** Edges between consecutive nodes. */
  edges: TaxiEdge[];
  /** If the route starts from an arbitrary position, that position (it precedes `nodes[0]`). */
  startPosition?: Vec2;
  /** True if the aircraft has to turn around to follow the route. */
  requiresUTurn: boolean;
  length: number;
  /** Distinct taxiway names in order of use (for read-backs and display). */
  taxiways: string[];
}

export interface RouteError {
  error: string;
}

const RUNWAY_CROSSING_PENALTY = 3000;
const UTURN_PENALTY = 400;
const FREE_EDGE_PENALTY = 1.15;

export function findRoute(
  airport: Airport,
  start: RouteStart,
  destination: TaxiNode,
  via: string[] = [],
): TaxiRoute | RouteError {
  const viaU = via.map((v) => v.toUpperCase());
  for (const v of viaU) {
    if (!airport.taxiwayNames.has(v)) return { error: `unknown taxiway ${v}` };
  }
  const m = viaU.length;
  const auto = m === 0;

  // ---- resolve start candidates
  interface Seed {
    node: TaxiNode;
    cost: number;
    uTurn: boolean;
  }
  const seeds: Seed[] = [];
  let startEdgeName: string | undefined;
  let startPosition: Vec2 | undefined;

  if (start.node) {
    seeds.push({ node: start.node, cost: 0, uTurn: false });
    // Taxiway(s) at the start node count as "current taxiway".
    startEdgeName = undefined;
  } else if (start.position) {
    const near = airport.nearestEdge(start.position);
    if (!near) return { error: 'not on the taxiway network' };
    startPosition = start.position;
    startEdgeName = near.edge.name.toUpperCase();
    const fwd = start.heading !== undefined ? headingVector(start.heading) : undefined;
    for (const n of [near.edge.from, near.edge.to]) {
      const d = Math.hypot(n.pos.x - start.position.x, n.pos.y - start.position.y);
      if (d < 1 && seeds.length > 0) continue;
      let uTurn = false;
      if (fwd && d > 3) uTurn = dot(sub(n.pos, start.position), fwd) < 0;
      // Respect one-way edges when moving along them.
      if (near.edge.oneWay && n === near.edge.from && d > 3) continue;
      seeds.push({ node: n, cost: d + (uTurn ? UTURN_PENALTY : 0), uTurn });
    }
  } else {
    return { error: 'no start given' };
  }

  const startNames = new Set<string>();
  if (startEdgeName) startNames.add(startEdgeName);
  if (start.node) for (const e of start.node.edges) startNames.add(e.name.toUpperCase());
  const destNames = new Set(destination.edges.map((e) => e.name.toUpperCase()));

  // ---- Dijkstra over (node, k)
  const key = (n: TaxiNode, k: number) => `${n.id}|${k}`;
  const dist = new Map<string, number>();
  const prev = new Map<string, { key: string; edge: TaxiEdge | null; seed?: Seed }>();
  const open: { key: string; node: TaxiNode; k: number; cost: number }[] = [];

  for (const s of seeds) {
    const k0 = 0;
    const kk = key(s.node, k0);
    if ((dist.get(kk) ?? Infinity) > s.cost) {
      dist.set(kk, s.cost);
      prev.set(kk, { key: '', edge: null, seed: s });
      open.push({ key: kk, node: s.node, k: k0, cost: s.cost });
    }
  }

  const goalKey = key(destination, m);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.cost > (dist.get(cur.key) ?? Infinity)) continue;
    if (cur.key === goalKey) break;

    for (const e of cur.node.edges) {
      if (e.kind === 'runway') continue;
      if (e.oneWay && e.from !== cur.node) continue;
      const nxt = otherEnd(e, cur.node);
      // Stand lead-in lines may only be used to leave the start stand or to enter the destination stand.
      if (e.kind === 'stand' && nxt !== destination && cur.node !== start.node) continue;

      const name = e.name.toUpperCase();
      let k = cur.k;
      let cost = e.length;
      if (auto) {
        if (e.kind === 'runwayStrip') cost += RUNWAY_CROSSING_PENALTY / 2;
      } else if (k < m && name === viaU[k] && !(k > 0 && name === viaU[k - 1])) {
        k += 1;
      } else if (k > 0 && name === viaU[k - 1]) {
        // continuing on the current via taxiway
      } else if ((e.kind === 'stand' || e.kind === 'taxilane') && (k === 0 || k === m)) {
        cost *= FREE_EDGE_PENALTY;
      } else if (k === 0 && startNames.has(name)) {
        cost *= FREE_EDGE_PENALTY;
      } else if (k === m && destNames.has(name)) {
        cost *= FREE_EDGE_PENALTY;
      } else {
        continue;
      }
      const nk = key(nxt, k);
      const nc = cur.cost + cost;
      if (nc < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nc);
        prev.set(nk, { key: cur.key, edge: e });
        open.push({ key: nk, node: nxt, k, cost: nc });
      }
    }
  }

  if (!dist.has(goalKey)) {
    return { error: auto ? 'no route found' : `no route via ${viaU.join(', ')}` };
  }

  // ---- reconstruct
  const nodes: TaxiNode[] = [];
  const edges: TaxiEdge[] = [];
  let k = goalKey;
  let seed: Seed | undefined;
  for (;;) {
    const p = prev.get(k)!;
    const nodeId = k.split('|')[0];
    nodes.unshift(airport.node(nodeId));
    if (p.edge) edges.unshift(p.edge);
    if (p.seed) {
      seed = p.seed;
      break;
    }
    k = p.key;
  }

  const taxiways: string[] = [];
  for (const e of edges) {
    if (e.kind === 'stand') continue;
    if (taxiways[taxiways.length - 1] !== e.name) taxiways.push(e.name);
  }

  return {
    nodes,
    edges,
    startPosition,
    requiresUTurn: seed?.uTurn ?? false,
    length: dist.get(goalKey)!,
    taxiways,
  };
}

export function isRouteError(r: TaxiRoute | RouteError): r is RouteError {
  return (r as RouteError).error !== undefined;
}
