import { dot, headingVector, normalize, projectOnSegment, sub, type Vec2 } from '../geo';
import { edgeVertices, isClosedEdge, otherEnd, type Airport, type TaxiEdge, type TaxiNode } from './airport';

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
 *    taxiway the destination lies on,
 *  - anywhere: short unnamed links (the fillets of a junction mapped as ways of
 *    their own), which have no name a controller could say.
 *
 * With `fillGaps` any other taxiway may fill a gap between the named ones (at a
 * higher cost, never across a runway): the pilot's lenient reading of an
 * instruction that leaves out a connecting taxiway. The route then lists the
 * taxiways it added (`filled`).
 *
 * With an empty `via` list the router returns the shortest overall route
 * (used by the UI's "auto route" and by AI traffic) and avoids crossing
 * runways if any alternative exists.
 *
 * Closed taxiways (`airport.closedTaxiways`, a scenario option) and
 * permanently closed edges (`closed` in the airport data) are never used; a
 * `via` list naming a closed taxiway fails with "taxiway X closed". Where the
 * airport names its runway crossing points (`runwayCrossings`), automatic
 * routes cross runways there and elsewhere only if there is no other way.
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
  /**
   * `fillGaps`: taxiways not in the `via` list the route had to add, and their length (m) before the last
   * via taxiway (the stretch after it, to the destination, is not counted).
   */
  filled?: string[];
  filledLength?: number;
  /** The added taxiways after the last via taxiway. */
  filledTail?: string[];
}

export interface RouteError {
  error: string;
}

const RUNWAY_CROSSING_PENALTY = 3000;
/** Extra cost of crossing a runway away from the airport's designated crossing points (automatic routes). */
const OTHER_CROSSING_PENALTY = 20000;
/** Extra cost of a taxiway automatic routes avoid (reserved for other traffic). */
const AVOID_PENALTY = 20000;
const UTURN_PENALTY = 5000;
/** Cost factor of a centre line for aircraft that have guide lines of their own beside it. */
const CENTRE_LINE_FACTOR = 3;
/** Sharpest turn (degrees) an aircraft makes along a taxiway or onto an unnamed link. */
const MAX_TURN = 150;
/**
 * Sharpest turn from one taxiway onto another (e.g. off a rapid exit against the landing direction): the
 * junction has room for it even where OpenStreetMap lacks the fillet. A `via` route takes it when the
 * controller asks for that direction (a little extra cost per degree beyond MAX_TURN); automatic routes
 * only if there is no other way.
 */
const JUNCTION_MAX_TURN = 175;
const SHARP_TURN_COST_M = 20;
const AUTO_SHARP_TURN_PENALTY = 20000;
/** Sharpest turn onto or off the lead line of a de-icing pad. */
const PAD_MAX_TURN = 100;
const FREE_EDGE_PENALTY = 1.15;
/** Unnamed edges up to this length (m) are junction links a `via` list never names. */
const UNNAMED_LINK_M = 150;
/** Cost factor of a taxiway that fills a gap in a `via` list (`fillGaps`). */
const GAP_FACTOR = 3;

export interface RouteOptions {
  /** Points the route must keep away from (e.g. another aircraft standing on a taxiway), with a radius in metres. */
  avoid?: { points: Vec2[]; radius: number };
  /** Automatic routes: never taxi against a standard flow (instead of only avoiding it). */
  strictFlows?: boolean;
  /** Wingspan of the aircraft: edges with a smaller wingspan limit are not used. */
  wingspanM?: number;
  /** Preferred directions of travel (unit vectors) per taxiway name, used for automatic routes. */
  flows?: Map<string, Vec2>;
  /** Whether the aircraft may turn around on the spot (small aircraft only). Default: true. */
  allowUTurn?: boolean;
  /** A `via` list may leave out connecting taxiways; the route fills them in (see above). */
  fillGaps?: boolean;
}

/** Cost factor for automatic routes taxiing against a standard flow. */
const AGAINST_FLOW_FACTOR = 4;

/** True if the segment a-b passes within `radius` of one of the points. */
function segmentNear(a: Vec2, b: Vec2, avoid: { points: Vec2[]; radius: number }): boolean {
  return avoid.points.some((p) => projectOnSegment(p, a, b).dist < avoid.radius);
}

export function findRoute(
  airport: Airport,
  start: RouteStart,
  destination: TaxiNode,
  via: string[] = [],
  options: RouteOptions = {},
): TaxiRoute | RouteError {
  const viaU = via.map((v) => v.toUpperCase());
  for (const v of viaU) {
    if (!airport.taxiwayNames.has(v)) return { error: `unknown taxiway ${v}` };
    if (airport.closedTaxiways.has(v) || airport.outOfServiceTaxiways.has(v)) return { error: `taxiway ${v} closed` };
  }
  const m = viaU.length;
  const auto = m === 0;

  // ---- resolve start candidates
  interface Seed {
    node: TaxiNode;
    cost: number;
    uTurn: boolean;
    /** Direction of travel when arriving at the seed node (undefined = any). */
    dir?: Vec2;
  }
  const seeds: Seed[] = [];
  let startEdgeName: string | undefined;
  let startPosition: Vec2 | undefined;

  if (start.node) {
    // A parked aircraft can only leave its stand forwards (drive-through stands) - the heading constrains the first turn.
    seeds.push({ node: start.node, cost: 0, uTurn: false, dir: start.heading !== undefined ? headingVector(start.heading) : undefined });
  } else if (start.position) {
    const near = airport.nearestEdge(start.position);
    if (!near) return { error: 'not on the taxiway network' };
    startPosition = start.position;
    startEdgeName = near.edge.name.toUpperCase();
    const fwd = start.heading !== undefined ? headingVector(start.heading) : undefined;
    for (const n of [near.edge.from, near.edge.to]) {
      const toNode = sub(n.pos, start.position);
      const d = Math.hypot(toNode.x, toNode.y);
      // A node behind the aircraft (even a few metres) can only be reached by turning around.
      const uTurn = !!fwd && d > 1 && dot(toNode, fwd) < 0;
      // Respect one-way edges when moving along them.
      if (near.edge.oneWay && n === near.edge.from && d > 1) continue;
      // Arriving at the node: we travel along toNode, or (if we are standing on it) along our heading.
      const dir = d > 1 ? unit(toNode) : fwd;
      if (uTurn && options.allowUTurn === false) continue;
      if (options.avoid && segmentNear(start.position, n.pos, options.avoid)) continue;
      seeds.push({ node: n, cost: d + (uTurn ? UTURN_PENALTY : 0), uTurn, dir });
    }
  } else {
    return { error: 'no start given' };
  }

  const startNames = new Set<string>();
  if (startEdgeName) startNames.add(startEdgeName);
  if (start.node) for (const e of start.node.edges) startNames.add(e.name.toUpperCase());
  const destNames = new Set(destination.edges.map((e) => e.name.toUpperCase()));

  // ---- Dijkstra over (node, k, incoming edge). The incoming edge is part of the
  // state so that turns sharper than MAX_TURN (hairpins / reversing) can be forbidden.
  interface State {
    key: string;
    node: TaxiNode;
    k: number;
    cost: number;
    dir?: Vec2;
    /** The edge the state was reached by (a runway node reached via a strip: crossing). */
    inEdge?: TaxiEdge;
  }
  // Automatic routes cross runways where the airport designates it (e.g. only between K and Y), elsewhere only
  // if there is no other way (e.g. a designated crossing is closed).
  const crossings = auto && airport.data.runwayCrossings ? new Set(airport.data.runwayCrossings) : undefined;
  const avoid = auto && airport.data.avoidTaxiways ? new Set(airport.data.avoidTaxiways.map((t) => t.toUpperCase())) : undefined;
  const large = airport.data.largeAircraftTaxiways;
  const centreLines = auto && large && options.wingspanM !== undefined && options.wingspanM < large.minWingspanM ? new Set(large.taxiways.map((t) => t.toUpperCase())) : undefined;
  const dist = new Map<string, number>();
  const prev = new Map<string, { key: string; edge: TaxiEdge | null; seed?: Seed; gap?: boolean; tail?: boolean }>();
  const open: State[] = [];

  seeds.forEach((s, i) => {
    const kk = `${s.node.id}|0|seed${i}`;
    dist.set(kk, s.cost);
    prev.set(kk, { key: '', edge: null, seed: s });
    open.push({ key: kk, node: s.node, k: 0, cost: s.cost, dir: s.dir });
  });

  let goalKey: string | undefined;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.cost > (dist.get(cur.key) ?? Infinity)) continue;
    if (cur.node === destination && cur.k === m) {
      goalKey = cur.key;
      break;
    }

    for (const e of cur.node.edges) {
      if (e.kind === 'runway') continue;
      if (e.oneWay && e.from !== cur.node) continue;
      if (isClosedEdge(airport, e)) continue;
      if (options.wingspanM !== undefined && options.wingspanM > e.maxWingspanM) continue;
      if (options.avoid && edgeNear(e, options.avoid)) continue;
      const nxt = otherEnd(e, cur.node);
      // Stand lead-in lines may only be used to leave the start stand or to enter the destination stand
      // (a lead line of several segments is followed to its end).
      if (e.kind === 'stand' && nxt !== destination && cur.node !== start.node && !(cur.inEdge?.kind === 'stand' && cur.inEdge.name === e.name)) continue;
      // Directions when leaving the node and when arriving at the next one (they differ on curved edges).
      const verts = e.from === cur.node ? edgeVertices(e) : edgeVertices(e).reverse();
      const out = unit(sub(verts[1], verts[0]));
      const arrive = unit(sub(verts[verts.length - 1], verts[verts.length - 2]));
      // Onto and off de-icing pads the lead lines allow no sharp turns (enter and leave the way they are painted).
      const pad = airport.isDeicingLead(e) || (!!cur.inEdge && airport.isDeicingLead(cur.inEdge));
      const turn = cur.dir ? turnAngle(cur.dir, out) : 0;
      const otherTaxiway = !!cur.inEdge && !!e.name && !!cur.inEdge.name && e.name !== cur.inEdge.name && e.kind !== 'stand' && cur.inEdge.kind !== 'stand';
      if (turn > (pad ? PAD_MAX_TURN : otherTaxiway ? JUNCTION_MAX_TURN : MAX_TURN)) continue;

      const name = e.name.toUpperCase();
      let k = cur.k;
      let cost = e.length + (turn > MAX_TURN ? (auto ? AUTO_SHARP_TURN_PENALTY : (turn - MAX_TURN) * SHARP_TURN_COST_M) : 0);
      let gap = false;
      if (auto) {
        if (e.kind === 'runwayStrip') cost += RUNWAY_CROSSING_PENALTY / 2;
        // Crossing a runway away from the designated crossing points: only if there is no other way.
        if (crossings && cur.inEdge?.kind === 'runwayStrip' && e.kind === 'runwayStrip' && !crossings.has(cur.node.id) && cur.node.edges.some((x) => x.kind === 'runway')) {
          cost += OTHER_CROSSING_PENALTY;
        }
        // Taxiways reserved for others (e.g. military): only if there is no other way.
        if (avoid?.has(name)) cost += AVOID_PENALTY;
        // Smaller aircraft taxi on the guide lines beside a centre line.
        if (centreLines?.has(name)) cost *= CENTRE_LINE_FACTOR;
        const flow = options.flows?.get(name);
        if (flow && dot(flow, out) < -0.5) {
          if (options.strictFlows) continue;
          cost *= AGAINST_FLOW_FACTOR;
        }
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
      } else if (!name && e.kind !== 'stand' && e.length <= UNNAMED_LINK_M) {
        cost *= FREE_EDGE_PENALTY;
      } else if (options.fillGaps && e.kind !== 'stand' && e.kind !== 'runwayStrip') {
        cost *= GAP_FACTOR;
        gap = true;
      } else {
        continue;
      }
      const nk = `${nxt.id}|${k}|${e.index}`;
      const nc = cur.cost + cost;
      if (nc < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nc);
        prev.set(nk, { key: cur.key, edge: e, gap, tail: gap && k === m });
        open.push({ key: nk, node: nxt, k, cost: nc, dir: arrive, inEdge: e });
      }
    }
  }

  if (!goalKey) {
    return { error: auto ? 'no route found' : `no route via ${viaU.join(', ')}` };
  }

  // ---- reconstruct
  const nodes: TaxiNode[] = [];
  const edges: TaxiEdge[] = [];
  const filled: string[] = [];
  const filledTail: string[] = [];
  let filledLength = 0;
  let k = goalKey;
  let seed: Seed | undefined;
  for (;;) {
    const p = prev.get(k)!;
    const nodeId = k.split('|')[0];
    nodes.unshift(airport.node(nodeId));
    if (p.edge) edges.unshift(p.edge);
    if (p.gap && p.edge) {
      if (!p.tail) filledLength += p.edge.length;
      if (p.edge.name && !filled.includes(p.edge.name)) filled.unshift(p.edge.name);
      if (p.tail && p.edge.name && !filledTail.includes(p.edge.name)) filledTail.unshift(p.edge.name);
    }
    if (p.seed) {
      seed = p.seed;
      break;
    }
    k = p.key;
  }

  const taxiways: string[] = [];
  for (const e of edges) {
    // Unnamed links (junction fillets, runway entries) are not part of a route a controller says.
    if (e.kind === 'stand' || !e.name) continue;
    if (taxiways[taxiways.length - 1] !== e.name) taxiways.push(e.name);
  }

  return {
    nodes,
    edges,
    startPosition,
    requiresUTurn: seed?.uTurn ?? false,
    length: dist.get(goalKey)!,
    taxiways,
    ...(options.fillGaps ? { filled, filledLength, filledTail } : {}),
  };
}

export function isRouteError(r: TaxiRoute | RouteError): r is RouteError {
  return (r as RouteError).error !== undefined;
}

function edgeNear(e: TaxiEdge, avoid: { points: Vec2[]; radius: number }): boolean {
  const v = edgeVertices(e);
  for (let i = 1; i < v.length; i++) if (segmentNear(v[i - 1], v[i], avoid)) return true;
  return false;
}

function unit(v: Vec2): Vec2 {
  return normalize(v);
}

/** Angle in degrees between two unit vectors (0 = straight on, 180 = reversing). */
function turnAngle(a: Vec2, b: Vec2): number {
  return (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI;
}
