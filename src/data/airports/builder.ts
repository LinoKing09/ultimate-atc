import {
  LocalProjection,
  add,
  distance,
  headingOf,
  normalize,
  scale,
  sub,
  type LatLon,
  type Vec2,
} from '../../core/geo';
import type {
  AreaData,
  StandData,
  TaxiEdgeData,
  TaxiEdgeKind,
  TaxiNodeData,
} from '../../core/airport/types';

/**
 * Helper for hand-authoring airport layouts in a runway-aligned frame.
 *
 * Coordinates are given as `(along, lateral)` in metres: `along` is the
 * distance from the reference runway end measured along the runway, `lateral`
 * is the perpendicular offset (positive = left of the runway direction).
 * The builder converts everything to latitude/longitude so the output looks
 * exactly like data imported from a real source would.
 */
export class RunwayFrameBuilder {
  readonly proj: LocalProjection;
  private readonly origin: Vec2;
  private readonly u: Vec2;
  private readonly n: Vec2;
  /** Runway length between the two reference points in metres. */
  readonly length: number;
  /** True heading of the reference direction (from end A towards end B). */
  readonly heading: number;

  readonly nodes: TaxiNodeData[] = [];
  readonly edges: TaxiEdgeData[] = [];
  readonly stands: StandData[] = [];
  private readonly nodeIndex = new Map<string, TaxiNodeData>();

  constructor(arp: LatLon, endA: LatLon, endB: LatLon) {
    this.proj = new LocalProjection(arp);
    const a = this.proj.toLocal(endA);
    const b = this.proj.toLocal(endB);
    this.origin = a;
    this.u = normalize(sub(b, a));
    this.n = { x: -this.u.y, y: this.u.x };
    this.length = distance(a, b);
    this.heading = headingOf(sub(b, a));
  }

  local(along: number, lateral: number): Vec2 {
    return add(this.origin, add(scale(this.u, along), scale(this.n, lateral)));
  }

  ll(along: number, lateral: number): LatLon {
    return this.proj.toLatLon(this.local(along, lateral));
  }

  node(id: string, along: number, lateral: number, holdingPoint?: TaxiNodeData['holdingPoint']): string {
    if (this.nodeIndex.has(id)) throw new Error(`Duplicate node ${id}`);
    const n: TaxiNodeData = { id, pos: this.ll(along, lateral) };
    if (holdingPoint) n.holdingPoint = holdingPoint;
    this.nodes.push(n);
    this.nodeIndex.set(id, n);
    return id;
  }

  /** Adds edges between consecutive nodes of `chain`. */
  chain(name: string, kind: TaxiEdgeKind, ids: string[], opts: { oneWay?: boolean; widthM?: number } = {}): void {
    for (let i = 0; i < ids.length - 1; i++) {
      const e: TaxiEdgeData = { from: ids[i], to: ids[i + 1], name, kind };
      if (opts.oneWay) e.oneWay = true;
      if (opts.widthM) e.widthM = opts.widthM;
      this.edges.push(e);
    }
  }

  area(name: string, corners: [number, number][]): AreaData {
    return { name, polygon: corners.map(([a, l]) => this.ll(a, l)) };
  }

  /** Heading (true) of a direction expressed in the runway frame (0 = along the runway). */
  frameHeading(relative: number): number {
    return (this.heading + relative + 360) % 360;
  }

  has(id: string): boolean {
    return this.nodeIndex.has(id);
  }
}
