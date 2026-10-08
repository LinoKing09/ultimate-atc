import {
  LocalProjection,
  distance,
  headingOf,
  normalize,
  projectOnSegment,
  sub,
  type Vec2,
} from '../geo';
import type {
  AirportData,
  ExitData,
  RunwayOpsData,
  StandData,
  StationData,
  StationType,
  TaxiEdgeKind,
} from './types';

export interface TaxiNode {
  id: string;
  pos: Vec2;
  holdingPoint?: { name: string; runway: string };
  edges: TaxiEdge[];
}

export interface TaxiEdge {
  /** Index into `Airport.edges`. */
  index: number;
  from: TaxiNode;
  to: TaxiNode;
  name: string;
  kind: TaxiEdgeKind;
  oneWay: boolean;
  length: number;
  widthM: number;
  /** Largest wingspan allowed (Infinity = no restriction). */
  maxWingspanM: number;
}

export interface RunwayEnd {
  name: string;
  /** Name of the physical runway, e.g. "07/25". */
  runway: string;
  threshold: Vec2;
  /** Start of the take-off run. */
  start: Vec2;
  /** Far end of the runway (start of the opposite end). */
  farEnd: Vec2;
  /** True heading when using this runway end. */
  heading: number;
  /** Length from `start` to `farEnd`. */
  length: number;
  elevationFt: number;
  widthM: number;
}

export interface Stand extends Omit<StandData, 'pos'> {
  pos: Vec2;
  node: TaxiNode;
  lane: TaxiNode;
}

const DEFAULT_WIDTH: Record<TaxiEdgeKind, number> = {
  taxiway: 23,
  taxilane: 20,
  stand: 4,
  runwayStrip: 23,
  runway: 45,
};

/**
 * Runtime representation of an airport: local metric coordinates, a
 * navigable taxi graph and convenience lookups. Built once from `AirportData`.
 */
export class Airport {
  readonly proj: LocalProjection;
  readonly nodes = new Map<string, TaxiNode>();
  readonly edges: TaxiEdge[] = [];
  readonly stands = new Map<string, Stand>();
  readonly holdingPoints = new Map<string, TaxiNode>();
  readonly runwayEnds = new Map<string, RunwayEnd>();
  readonly areas: { name: string; polygon: Vec2[] }[];
  readonly buildings: { name: string; polygon: Vec2[] }[];
  /** All taxiway designators known at this airport (upper case). */
  readonly taxiwayNames = new Set<string>();

  constructor(readonly data: AirportData) {
    this.proj = new LocalProjection(data.arp);

    for (const n of data.taxiNodes) {
      const node: TaxiNode = { id: n.id, pos: this.proj.toLocal(n.pos), edges: [] };
      if (n.holdingPoint) {
        node.holdingPoint = { ...n.holdingPoint };
        this.holdingPoints.set(n.holdingPoint.name.toUpperCase(), node);
      }
      this.nodes.set(n.id, node);
    }

    for (const e of data.taxiEdges) {
      const from = this.node(e.from);
      const to = this.node(e.to);
      const edge: TaxiEdge = {
        index: this.edges.length,
        from,
        to,
        name: e.name,
        kind: e.kind,
        oneWay: e.oneWay ?? false,
        length: distance(from.pos, to.pos),
        widthM: e.widthM ?? DEFAULT_WIDTH[e.kind],
        maxWingspanM: e.maxWingspanM ?? Infinity,
      };
      this.edges.push(edge);
      from.edges.push(edge);
      to.edges.push(edge);
      if (e.kind === 'taxiway' || e.kind === 'taxilane' || e.kind === 'runwayStrip') {
        this.taxiwayNames.add(e.name.toUpperCase());
      }
    }

    for (const s of data.stands) {
      const node = this.node(`STAND_${s.id}`);
      this.stands.set(s.id.toUpperCase(), {
        ...s,
        pos: this.proj.toLocal(s.pos),
        node,
        lane: this.node(s.laneNode),
      });
    }

    for (const rwy of data.runways) {
      const [a, b] = rwy.ends;
      const aStart = this.proj.toLocal(a.end);
      const bStart = this.proj.toLocal(b.end);
      for (const [end, start, far] of [
        [a, aStart, bStart],
        [b, bStart, aStart],
      ] as const) {
        this.runwayEnds.set(end.name, {
          name: end.name,
          runway: rwy.name,
          threshold: this.proj.toLocal(end.threshold),
          start,
          farEnd: far,
          heading: headingOf(sub(far, start)),
          length: distance(start, far),
          elevationFt: end.elevationFt,
          widthM: rwy.widthM,
        });
      }
    }

    this.areas = data.areas.map((a) => ({ name: a.name, polygon: a.polygon.map((p) => this.proj.toLocal(p)) }));
    this.buildings = data.buildings.map((a) => ({ name: a.name, polygon: a.polygon.map((p) => this.proj.toLocal(p)) }));
  }

  node(id: string): TaxiNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`Unknown taxi node ${id} at ${this.data.icao}`);
    return n;
  }

  stand(id: string): Stand | undefined {
    return this.stands.get(id.toUpperCase());
  }

  holdingPoint(name: string): TaxiNode | undefined {
    return this.holdingPoints.get(name.toUpperCase());
  }

  runwayEnd(name: string): RunwayEnd | undefined {
    return this.runwayEnds.get(name.toUpperCase());
  }

  /** The opposite end of a runway, e.g. "07" for "25". */
  oppositeEnd(name: string): RunwayEnd | undefined {
    const end = this.runwayEnd(name);
    if (!end) return undefined;
    for (const e of this.runwayEnds.values()) if (e.runway === end.runway && e.name !== end.name) return e;
    return undefined;
  }

  /** Physical runway names ("07/25") a runway end designator or full name refers to. */
  runwayNameFor(designator: string): string | undefined {
    const d = designator.toUpperCase();
    for (const e of this.runwayEnds.values()) if (e.name === d || e.runway === d) return e.runway;
    return undefined;
  }

  runwayOps(endName: string): RunwayOpsData | undefined {
    return this.data.runwayOps.find((o) => o.runway === endName);
  }

  /** Standard taxi flows for a runway end as unit vectors per taxiway. */
  flowVectors(endName: string): Map<string, Vec2> {
    const out = new Map<string, Vec2>();
    const end = this.runwayEnd(endName);
    const ops = this.runwayOps(endName);
    if (!end || !ops?.flows) return out;
    // "east" = towards the higher runway coordinate of the reference (lower-numbered) runway end.
    const ref = [...this.runwayEnds.values()].filter((e) => e.runway === end.runway).sort((a, b) => a.name.localeCompare(b.name))[0];
    const east = normalize(sub(ref.farEnd, ref.start));
    for (const f of ops.flows) out.set(f.taxiway.toUpperCase(), f.direction === 'east' ? east : { x: -east.x, y: -east.y });
    return out;
  }

  exits(endName: string): ExitData[] {
    return this.runwayOps(endName)?.exits ?? [];
  }

  station(type: StationType): StationData | undefined {
    return this.data.stations.find((s) => s.type === type);
  }

  /** Lateral distance of `p` from the runway centreline and its position along the runway (0 = start). */
  runwayCoordinates(end: RunwayEnd, p: Vec2): { along: number; lateral: number } {
    const u = normalize(sub(end.farEnd, end.start));
    const d = sub(p, end.start);
    return { along: d.x * u.x + d.y * u.y, lateral: -d.x * u.y + d.y * u.x };
  }

  /** True if `p` lies on the runway pavement (with a small margin). */
  isOnRunway(runway: string, p: Vec2, margin = 10): boolean {
    for (const end of this.runwayEnds.values()) {
      if (end.runway !== runway) continue;
      const c = this.runwayCoordinates(end, p);
      return c.along >= -margin && c.along <= end.length + margin && Math.abs(c.lateral) <= end.widthM / 2 + margin;
    }
    return false;
  }

  /** Finds the nearest routable edge to a point. */
  nearestEdge(p: Vec2, filter: (e: TaxiEdge) => boolean = (e) => e.kind !== 'runway'): {
    edge: TaxiEdge;
    t: number;
    point: Vec2;
    dist: number;
  } | null {
    let best: { edge: TaxiEdge; t: number; point: Vec2; dist: number } | null = null;
    for (const e of this.edges) {
      if (!filter(e)) continue;
      const pr = projectOnSegment(p, e.from.pos, e.to.pos);
      if (!best || pr.dist < best.dist) best = { edge: e, ...pr };
    }
    return best;
  }

  /** Taxiway names of all edges touching a node. */
  namesAt(node: TaxiNode): string[] {
    return [...new Set(node.edges.map((e) => e.name))];
  }

  /** Bounding box of the airport's geometry in local coordinates. */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const visit = (p: Vec2) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    };
    this.nodes.forEach((n) => visit(n.pos));
    this.buildings.forEach((b) => b.polygon.forEach(visit));
    return { minX, minY, maxX, maxY };
  }
}

export function otherEnd(edge: TaxiEdge, node: TaxiNode): TaxiNode {
  return edge.from === node ? edge.to : edge.from;
}
