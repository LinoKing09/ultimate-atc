import { LocalProjection, distance, type LatLon } from '../../core/geo';
import type { AreaData, ExitData, PavementLineData, StandData, TaxiEdgeData, TaxiEdgeKind, TaxiNodeData } from '../../core/airport/types';

/**
 * Airport layouts imported from OpenStreetMap by `scripts/osm-import.mjs` (files `<icao>.layout.ts`),
 * and the helper that turns them into the taxi graph of an `AirportData`. The OSM part gives the
 * geometry (taxiways, runway centre line, holding positions, stands, aprons, buildings); the airport
 * file adds what OSM does not know or gets wrong: holding point names, taxiway names, stand sizes,
 * runway operations.
 */
export interface OsmLayout {
  /** [id, lat, lon] */
  nodes: [string, number, number][];
  /** [from, to, name, kind, oneWay?, widthM?] - kind 'taxiway' or 'runway'; width from the OSM `width` tag */
  edges: [string, string, string, string, boolean?, number?][];
  holdingPositions: { node: string; ref: string; type: string; taxiways: string[] }[];
  stands: { id: string; pos: [number, number]; heading: number; lanes: string[]; spacingM: number }[];
  areas: { name: string; polygon: [number, number][] }[];
  buildings: { name: string; polygon: [number, number][] }[];
  /** Taxiways not connected to the runway (drawn only): [lat, lon] points. */
  pavement?: { name: string; points: [number, number][]; widthM?: number }[];
}

export interface StandSpec {
  id: string;
  /** Imported stand to take position, heading and lanes from when its OSM ref differs from `id`. */
  osm?: string;
  apron: string;
  maxWingspanM: number;
  /** false: self-manoeuvring / drive-through stand (taxi in on `lanes[0]`, out on `lanes[1]`). */
  pushback: boolean;
  /** Lane node(s); default: the imported ones. */
  lanes?: string[];
  /**
   * Taxiways to put the lane node on when `pos` comes from the AIP and no lead-in line is imported: the lane node
   * is the foot of the perpendicular from the stand onto the nearest of these taxiways (an existing node within
   * 8 m, else a new node splitting that edge). Phuket.
   */
  snap?: string[];
  /** Position and heading; default: the imported ones. */
  pos?: LatLon;
  heading?: number;
  /** Who parks here first (see StandData.use). */
  use?: StandData['use'];
  /**
   * `pos` is where the nose wheel stops (the AIP stand coordinates): the aircraft reference point is placed this
   * many metres behind it, along the stand heading.
   */
  noseStopM?: number;
}

export interface LayoutOptions {
  /** Physical runway name, e.g. "06/24" (the runway edges are named like this). */
  runway: string;
  /**
   * Holding positions that are runway holding points: imported node -> published name (holding
   * point of `runway`), or { name, runway, node } for another runway or a fixed runway node (e.g.
   * the same node for the holding points on both sides of a runway crossing). Others become plain nodes.
   */
  holdingPoints: Record<string, string | { name: string; runway?: string; node?: string }>;
  /** Rename the taxiway of single edges (imported names that are missing or wrong): "from>to" -> name. */
  edgeNames?: Record<string, string>;
  /** Rename taxiways everywhere: imported name -> name ("?" = unnamed ways). */
  taxiwayNames?: Record<string, string>;
  /** Taxiways that are apron taxilanes. */
  taxilanes?: string[];
  /** Keep only these taxiways (after renaming); default all. */
  taxiways?: string[];
  /** Largest wingspan per taxiway (default: none). */
  maxWingspanM?: Record<string, number>;
  /** Largest wingspan of single edges ("from>to"), where a taxiway has different limits along its length. */
  edgeMaxWingspanM?: Record<string, number>;
  /** Pavement width per taxiway in metres, also for its runway strip (default: the OSM `width` tag, else by kind: taxiway 23, taxilane 20). */
  widthM?: Record<string, number>;
  /** Edges to leave out ("from>to"), e.g. service roads tagged as taxiway. */
  dropEdges?: string[];
  /**
   * Edges drawn as pavement only, never part of the taxi graph ("from>to"): links inside a runway strip
   * that would bypass the holding points, the second fillet of a junction, lanes no simulated aircraft uses.
   */
  drawOnly?: string[];
  /** Extra edges [from, to, name, kind, closed?]. */
  addEdges?: [string, string, string, TaxiEdgeKind, boolean?][];
  /**
   * Permanently closed imported edges ("from>to"), see TaxiEdgeData.closed. Closed edges are never
   * pruned as dead ends and never become part of a runway strip.
   */
  closedEdges?: string[];
  /** Extra nodes [id, lat, lon]. */
  addNodes?: [string, number, number][];
  /** Dead-end nodes to keep (dead ends are pruned otherwise). */
  keepNodes?: string[];
  /** The stands to use (imported stands not listed are dropped). */
  stands: StandSpec[];
  /** Buildings / aprons to keep: only those within this distance (m) of the taxiways and stands. Default 300. */
  areaRadiusM?: number;
  /** Leave out the imported taxiways that are not connected to the runway (drawn as pavement by default). */
  dropLoosePavement?: boolean;
}

export interface BuiltLayout {
  taxiNodes: TaxiNodeData[];
  taxiEdges: TaxiEdgeData[];
  stands: StandData[];
  areas: AreaData[];
  buildings: AreaData[];
  /** Imported edges drawn as pavement only (`drawOnly`), and the imported taxiways not connected to the runway. */
  pavement: PavementLineData[];
  /** Runway node where the strip of a holding point meets the runway, by holding point name. */
  runwayNodeOf: Record<string, string>;
  /**
   * Branches of runway strips behind the same holding point (see buildLayout): the holding point and the
   * first node of the branch behind it - pass it as `next` to `exitVia` for an exit along the branch.
   */
  branches: { of: string; node: string }[];
}

const key = (a: string, b: string) => `${a}>${b}`;

/** Builds nodes, edges and stands of an airport from an imported layout. */
export function buildLayout(layout: OsmLayout, o: LayoutOptions): BuiltLayout {
  const pos = new Map<string, LatLon>(layout.nodes.map(([id, lat, lon]) => [id, { lat, lon }]));
  for (const [id, lat, lon] of o.addNodes ?? []) pos.set(id, { lat, lon });
  const proj = new LocalProjection(pos.values().next().value as LatLon);
  const p = (id: string) => proj.toLocal(pos.get(id)!);
  const drop = new Set(o.dropEdges ?? []);
  const drawOnly = new Set(o.drawOnly ?? []);
  const pavement: PavementLineData[] = [];
  const taxilanes = new Set(o.taxilanes ?? []);

  type E = { from: string; to: string; name: string; kind: TaxiEdgeKind; oneWay?: boolean; closed?: boolean; shape?: LatLon[]; widthM?: number };
  const closed = new Set(o.closedEdges ?? []);
  let edges: E[] = [];
  for (const [from, to, rawName, kind, oneWay, widthM] of layout.edges) {
    if (drop.has(key(from, to)) || drop.has(key(to, from))) continue;
    let name = o.edgeNames?.[key(from, to)] ?? o.edgeNames?.[key(to, from)] ?? rawName;
    if (kind !== 'runway') name = o.taxiwayNames?.[name || '?'] ?? name;
    if (drawOnly.has(key(from, to)) || drawOnly.has(key(to, from))) {
      // Drawn with its name: a taxiway that exists only as pavement (e.g. one no simulated aircraft uses) gets a label.
      pavement.push({ ...(name && kind !== 'runway' ? { name } : {}), points: [pos.get(from)!, pos.get(to)!], ...(widthM ? { widthM } : {}) });
      continue;
    }
    const k: TaxiEdgeKind = kind === 'runway' ? 'runway' : taxilanes.has(name) ? 'taxilane' : 'taxiway';
    const shut = closed.has(key(from, to)) || closed.has(key(to, from));
    edges.push({ from, to, name: kind === 'runway' ? rawName || o.runway : name, kind: k, ...(oneWay ? { oneWay } : {}), ...(shut ? { closed: true } : {}), ...(widthM && kind !== 'runway' ? { widthM } : {}) });
  }
  if (o.taxiways) {
    const only = new Set(o.taxiways);
    edges = edges.filter((e) => e.kind === 'runway' || only.has(e.name));
  }
  for (const [from, to, name, kind, shut] of o.addEdges ?? []) edges.push({ from, to, name, kind, ...(shut ? { closed: true } : {}) });

  // Runway strips: from every named holding point the shortest way to the runway centre line becomes one
  // 'runwayStrip' edge (the line-up and exit logic needs holding point -> runway node directly); the nodes
  // in between become its shape points, so a strip that turns towards the runway keeps its curve.
  const hpSpec = (v: LayoutOptions['holdingPoints'][string]) => (typeof v === 'string' ? { name: v, runway: o.runway } : { runway: o.runway, ...v });
  const hpNames: Record<string, string> = Object.fromEntries(Object.entries(o.holdingPoints).map(([k, v]) => [k, hpSpec(v).name]));
  const runwayNodes = new Set(edges.filter((e) => e.kind === 'runway').flatMap((e) => [e.from, e.to]));
  const runwayNodeOf: Record<string, string> = {};
  const strips: { name: string; runway: string; hp: string; goal: string; inner: string[]; twy: string; widthM?: number }[] = [];
  for (const [hp, raw] of Object.entries(o.holdingPoints)) {
    const { name, runway, node: fixed } = hpSpec(raw);
    const own = new Set(edges.filter((e) => e.kind === 'runway' && e.name === runway).flatMap((e) => [e.from, e.to]));
    if (fixed) {
      // A given runway node: one straight strip; the old connection to the runway is removed below.
      const twy = edges.find((e) => e.kind !== 'runway' && (e.from === hp || e.to === hp))?.name || name;
      edges.push({ from: hp, to: fixed, name: twy, kind: 'runwayStrip' });
      runwayNodeOf[name] = fixed;
      continue;
    }
    // Dijkstra over taxi edges, not through other holding points, at most 400 m.
    const dist = new Map<string, number>([[hp, 0]]);
    const prev = new Map<string, E>();
    const open = [hp];
    let goal: string | undefined;
    while (open.length) {
      open.sort((a, b) => dist.get(a)! - dist.get(b)!);
      const cur = open.shift()!;
      if (own.has(cur)) {
        goal = cur;
        break;
      }
      if (cur !== hp && hpNames[cur]) continue;
      for (const e of edges) {
        if (e.kind === 'runway' || e.closed || (e.from !== cur && e.to !== cur)) continue;
        const nb = e.from === cur ? e.to : e.from;
        const d = dist.get(cur)! + distance(p(cur), p(nb));
        if (d > 400 || d >= (dist.get(nb) ?? Infinity)) continue;
        dist.set(nb, d);
        prev.set(nb, e);
        if (!open.includes(nb)) open.push(nb);
      }
    }
    if (!goal) throw new Error(`holding point ${name} (${hp}) does not reach the runway`);
    const path: E[] = [];
    for (let n = goal; n !== hp; ) {
      const e = prev.get(n)!;
      path.push(e);
      n = e.from === n ? e.to : e.from;
    }
    const twy = path[path.length - 1]?.name ?? name;
    edges = edges.filter((e) => !path.includes(e));
    // The nodes in between stay as shape points: the strip keeps its curve (e.g. a turn towards the runway).
    const inner: string[] = [];
    for (let n = goal, i = 0; i < path.length - 1; i++) {
      const e = path[i];
      n = e.from === n ? e.to : e.from;
      inner.unshift(n);
    }
    const stripWidth = path[path.length - 1]?.widthM;
    edges.push({ from: hp, to: goal, name: twy, kind: 'runwayStrip', ...(inner.length ? { shape: inner.map((id) => pos.get(id)!) } : {}), ...(stripWidth ? { widthM: stripWidth } : {}) });
    runwayNodeOf[name] = goal;
    strips.push({ name, runway, hp, goal, inner, twy, widthM: stripWidth });
  }

  // Branches: a way that leaves a strip between its holding point and the runway, crosses the same holding
  // position line (a runway holding position of its own beside the main one) and joins the taxiways elsewhere
  // - a rapid exit forking into a fillet to either side of the parallel taxiway, behind one holding point
  // (Leipzig S2-S4). The branch is linked to the holding point node, so both ways lead on from the one
  // holding point; its part between the fork and the holding line is drawn as pavement. Without this it
  // would hang loose once the strip is one edge, and be pruned as a dead end.
  const branches: BuiltLayout['branches'] = [];
  const runwayHolds = new Set(layout.holdingPositions.filter((h) => h.type === 'runway').map((h) => h.node));
  for (const st of strips) {
    for (const n of st.inner) {
      for (const e0 of edges.filter((e) => e.kind !== 'runway' && e.kind !== 'runwayStrip' && (e.from === n || e.to === n))) {
        // Follow the branch (nodes with two edges) away from the strip.
        const chain: E[] = [];
        let cur = n;
        for (let e: E | undefined = e0; e; ) {
          chain.push(e);
          cur = e.from === cur ? e.to : e.from;
          if (runwayNodes.has(cur) || runwayHolds.has(cur) || hpNames[cur]) break;
          const next = edges.filter((x) => x !== e && x.kind !== 'runway' && (x.from === cur || x.to === cur));
          e = next.length === 1 ? next[0] : undefined;
        }
        // Only a holding line beside the main one (the same line across a wide exit).
        if (!runwayHolds.has(cur) || hpNames[cur] || distance(p(cur), p(st.hp)) > 60) continue;
        edges = edges.filter((e) => !chain.includes(e));
        for (const e of chain) pavement.push({ points: [pos.get(e.from)!, pos.get(e.to)!], ...(st.widthM ? { widthM: st.widthM } : {}) });
        edges.push({ from: st.hp, to: cur, name: st.twy, kind: 'taxiway', ...(st.widthM ? { widthM: st.widthM } : {}) });
        // The rest of the branch is part of the same taxiway.
        for (let id = cur, guard = 0; guard < 50; guard++) {
          const rest = edges.filter((x) => x.kind !== 'runway' && x.kind !== 'runwayStrip' && !x.name && (x.from === id || x.to === id));
          if (rest.length !== 1) break;
          rest[0].name = st.twy;
          id = rest[0].from === id ? rest[0].to : rest[0].from;
          if (edges.filter((x) => x.from === id || x.to === id).length !== 2) break;
        }
        branches.push({ of: st.hp, node: cur });
      }
    }
  }

  /** The lane node of a stand on the nearest edge of the given taxiways (see StandSpec.snap). */
  const snapLane = (id: string, stop: LatLon, names: Set<string>): string => {
    const q = proj.toLocal(stop);
    let best: { e: E; t: number; d: number } | undefined;
    for (const e of edges) {
      if ((e.kind !== 'taxiway' && e.kind !== 'taxilane') || !names.has(e.name)) continue;
      const a = p(e.from);
      const b = p(e.to);
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = len2 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / len2)) : 0;
      const d = Math.hypot(a.x + (b.x - a.x) * t - q.x, a.y + (b.y - a.y) * t - q.y);
      if (!best || d < best.d) best = { e, t, d };
    }
    if (!best) throw new Error(`stand ${id}: no taxiway ${[...names].join(', ')} to snap to`);
    const { e, t } = best;
    const a = p(e.from);
    const b = p(e.to);
    const foot = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    for (const n of [e.from, e.to]) if (distance(p(n), foot) < 8) return n;
    const node = `${e.name || 'LANE'}@${id}`;
    pos.set(node, proj.toLatLon(foot));
    edges = edges.filter((x) => x !== e);
    edges.push({ ...e, to: node }, { ...e, from: node });
    return node;
  };

  // Stands
  const stands: StandData[] = [];
  const standNodes: TaxiNodeData[] = [];
  for (const spec of o.stands) {
    const imp = layout.stands.find((s) => s.id === (spec.osm ?? spec.id));
    const stop = spec.pos ?? (imp ? { lat: imp.pos[0], lon: imp.pos[1] } : undefined);
    const lanes = spec.lanes ?? imp?.lanes ?? (spec.snap && stop ? [snapLane(spec.id, stop, new Set(spec.snap))] : undefined);
    if (!lanes?.length || !stop) throw new Error(`stand ${spec.id}: no position or lane`);
    const node = `STAND_${spec.id}`;
    const out = lanes[1] ?? lanes[0];
    let heading = spec.heading ?? imp?.heading ?? 0;
    if (spec.heading === undefined) heading = Math.round(spec.pushback ? bearingOf(proj, pos.get(lanes[0])!, stop) : bearingOf(proj, stop, pos.get(out)!));
    // The reference point behind the nose wheel stop position.
    const back = spec.noseStopM ?? 0;
    const p = proj.toLocal(stop);
    const at = back ? proj.toLatLon({ x: p.x - Math.sin((heading * Math.PI) / 180) * back, y: p.y - Math.cos((heading * Math.PI) / 180) * back }) : stop;
    standNodes.push({ id: node, pos: at });
    pos.set(node, at);
    if (spec.pushback) {
      edges.push({ from: lanes[0], to: node, name: spec.id, kind: 'stand' });
    } else {
      edges.push({ from: lanes[0], to: node, name: spec.id, kind: 'stand', oneWay: true });
      edges.push({ from: node, to: out, name: spec.id, kind: 'stand', oneWay: true });
    }
    stands.push({ id: spec.id, apron: spec.apron, pos: at, heading, laneNode: lanes[0], maxWingspanM: spec.maxWingspanM, pushback: spec.pushback, ...(spec.use ? { use: spec.use } : {}) });
  }

  // Every way onto the runway goes through a holding point: other taxiway edges that touch the runway
  // (the second fillet of a junction mapped as a "Y" in OSM) are removed, then dead ends are pruned.
  edges = edges.filter((e) => e.kind === 'runway' || e.kind === 'runwayStrip' || e.kind === 'stand' || !(runwayNodes.has(e.from) || runwayNodes.has(e.to)));
  const keep = new Set([...Object.keys(hpNames), ...(o.keepNodes ?? [])]);
  for (let changed = true; changed; ) {
    changed = false;
    const degree = new Map<string, number>();
    for (const e of edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
    const before = edges.length;
    edges = edges.filter((e) => (e.kind !== 'taxiway' && e.kind !== 'taxilane') || e.closed ? true : ![e.from, e.to].some((id) => degree.get(id) === 1 && !keep.has(id) && !runwayNodes.has(id)));
    changed = edges.length !== before;
  }

  // A pushback stand at the dead end of a taxilane is pushed back from the node before it: from the dead end
  // itself the aircraft could only be pushed out facing the dead end.
  for (const s of stands) {
    if (!s.pushback) continue;
    const taxi = edges.filter((e) => (e.kind === 'taxiway' || e.kind === 'taxilane') && (e.from === s.laneNode || e.to === s.laneNode));
    if (taxi.length !== 1) continue;
    const before = taxi[0].from === s.laneNode ? taxi[0].to : taxi[0].from;
    const lead = edges.find((e) => e.kind === 'stand' && e.from === s.laneNode && e.to === `STAND_${s.id}`)!;
    lead.from = before;
    s.laneNode = before;
  }

  // Wingspan limits and widths
  for (const e of edges) {
    const lim = o.edgeMaxWingspanM?.[key(e.from, e.to)] ?? o.edgeMaxWingspanM?.[key(e.to, e.from)] ?? o.maxWingspanM?.[e.name];
    if (lim) (e as TaxiEdgeData).maxWingspanM = lim;
    const w = e.kind === 'stand' || e.kind === 'runway' ? undefined : o.widthM?.[e.name];
    if (w) (e as TaxiEdgeData).widthM = w;
  }

  // Nodes actually used
  const usedIds = new Set(edges.flatMap((e) => [e.from, e.to]));
  const taxiNodes: TaxiNodeData[] = [];
  // Intermediate holding positions of the charts (OSM holding_position:type=intermediate).
  const intermediate = new Set(layout.holdingPositions.filter((h) => h.type === 'intermediate').map((h) => h.node));
  for (const id of usedIds) {
    if (id.startsWith('STAND_')) continue;
    const at = pos.get(id);
    if (!at) throw new Error(`unknown node ${id}`);
    const n: TaxiNodeData = { id, pos: at };
    if (o.holdingPoints[id]) n.holdingPoint = { name: hpSpec(o.holdingPoints[id]).name, runway: hpSpec(o.holdingPoints[id]).runway };
    else if (intermediate.has(id)) n.intermediateHold = true;
    taxiNodes.push(n);
  }
  taxiNodes.push(...standNodes);

  // Aprons and buildings near the graph
  const radius = o.areaRadiusM ?? 300;
  // Near taxiways and stands (not just the runway: that keeps far-away buildings beside a long runway out).
  // Taxiways drawn only count too: an apron at the end of one belongs to the picture (e.g. a dispersal area).
  const graphPts = [
    ...[...new Set(edges.filter((e) => e.kind !== 'runway').flatMap((e) => [e.from, e.to]))].map((id) => proj.toLocal(pos.get(id)!)),
    ...pavement.flatMap((l) => l.points.map((q) => proj.toLocal(q))),
    ...(o.dropLoosePavement ? [] : (layout.pavement ?? [])).flatMap((l) => l.points.map(([lat, lon]) => proj.toLocal({ lat, lon }))),
  ];
  const near = (poly: [number, number][]) =>
    poly.some(([lat, lon]) => {
      const q = proj.toLocal({ lat, lon });
      return graphPts.some((g) => distance(g, q) < radius);
    });
  const toArea = (a: { name: string; polygon: [number, number][] }): AreaData => ({ name: a.name, polygon: a.polygon.map(([lat, lon]) => ({ lat, lon })) });
  return {
    taxiNodes,
    taxiEdges: edges.map((e) => ({ ...e })),
    stands,
    areas: layout.areas.filter((a) => near(a.polygon)).map(toArea),
    buildings: layout.buildings.filter((a) => near(a.polygon)).map(toArea),
    pavement: [
      ...pavement,
      ...(o.dropLoosePavement ? [] : (layout.pavement ?? [])).map((l) => ({
        ...(l.name ? { name: l.name } : {}),
        points: l.points.map(([lat, lon]) => ({ lat, lon })),
        ...(l.widthM ? { widthM: l.widthM } : {}),
      })),
    ],
    runwayNodeOf,
    branches,
  };
}

/**
 * Imported edges ("from>to") of the given taxiways, or whose ends all lie inside one of the polygons ([lat, lon];
 * runway centre line nodes are not counted). For `drawOnly` and `edgeMaxWingspanM` lists over whole areas the
 * simulated traffic does not use (a military apron, an apron under construction) or over coloured guide lines.
 */
export function layoutEdges(layout: OsmLayout, o: { names?: string[]; inside?: [number, number][][] }): string[] {
  const at = new Map(layout.nodes.map(([id, lat, lon]) => [id, [lat, lon] as [number, number]]));
  const inPoly = ([lat, lon]: [number, number], poly: [number, number][]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ai, bi] = poly[i];
      const [aj, bj] = poly[j];
      if (ai > lat !== aj > lat && lon < ((bj - bi) * (lat - ai)) / (aj - ai) + bi) c = !c;
    }
    return c;
  };
  const names = new Set(o.names ?? []);
  return layout.edges
    .filter(([from, to, name, kind]) => {
      if (kind === 'runway') return false;
      if (names.has(name)) return true;
      const ends = [from, to].filter((id) => !id.startsWith('RWY.'));
      return ends.length > 0 && (o.inside ?? []).some((poly) => ends.every((id) => inPoly(at.get(id)!, poly)));
    })
    .map(([from, to]) => key(from, to));
}

function bearingOf(proj: LocalProjection, from: LatLon, to: LatLon): number {
  const a = proj.toLocal(from);
  const b = proj.toLocal(to);
  return ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
}

/**
 * Exit path for `runwayOps`: runway node -> holding point -> the next node behind it (where the
 * aircraft stops after vacating), at least `clearM` metres behind the holding point.
 */
export function exitVia(built: BuiltLayout, name: string, hp: string, opts: { rapid?: boolean; clearM?: number; via?: string; next?: string } = {}): ExitData {
  const rwy = built.runwayNodeOf[built.taxiNodes.find((n) => n.id === hp)?.holdingPoint?.name ?? ''];
  if (!rwy) throw new Error(`exit ${name}: ${hp} is not a holding point`);
  const nodes = new Map(built.taxiNodes.map((n) => [n.id, n.pos]));
  const proj = new LocalProjection(nodes.get(hp)!);
  const at = (id: string) => proj.toLocal(nodes.get(id)!);
  const path = [rwy, hp];
  let len = 0;
  let cur = hp;
  let prev = rwy;
  if (opts.next) {
    // Along a branch behind the holding point (BuiltLayout.branches).
    len += Math.hypot(at(opts.next).x, at(opts.next).y);
    path.push(opts.next);
    prev = cur;
    cur = opts.next;
  }
  while (len < (opts.clearM ?? 50)) {
    const next = built.taxiEdges
      .filter((e) => e.kind !== 'runway' && e.kind !== 'runwayStrip' && e.kind !== 'stand' && (e.from === cur || e.to === cur))
      .map((e) => (e.from === cur ? e.to : e.from))
      .filter((id) => id !== prev && !path.includes(id))
      // Straight on (or along the named taxiway) first.
      .sort((a, b) => score(a) - score(b))[0];
    if (!next) break;
    len += Math.hypot(at(next).x - at(cur).x, at(next).y - at(cur).y);
    path.push(next);
    prev = cur;
    cur = next;
  }
  function score(id: string): number {
    const d1 = { x: at(cur).x - at(prev).x, y: at(cur).y - at(prev).y };
    const d2 = { x: at(id).x - at(cur).x, y: at(id).y - at(cur).y };
    const cos = (d1.x * d2.x + d1.y * d2.y) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y) || 1);
    // Along the exit's own taxiway rather than onto an unnamed fillet that leads one way only.
    const along = opts.via ?? name;
    const named = built.taxiEdges.some((e) => e.name === along && ((e.from === cur && e.to === id) || (e.to === cur && e.from === id)));
    return -cos - (named ? 2 : 0);
  }
  return { name, path, rapid: !!opts.rapid };
}
