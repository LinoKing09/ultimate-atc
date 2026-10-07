import { distance, headingOf, lerp, normHeading, sub, type Vec2 } from './geo';

export interface PathMarker {
  /** Arbitrary id, usually the taxi node id. */
  id: string;
  /** Distance along the path. */
  s: number;
}

/**
 * A smoothed polyline that aircraft move along.
 *
 * Sharp corners of the input polyline are replaced by circular arcs so that
 * aircraft turn realistically instead of pivoting on a node. Positions are
 * addressed by the arc length `s` from the start of the path.
 */
export class Path {
  readonly points: Vec2[];
  readonly cum: number[];
  readonly markers: PathMarker[];
  readonly length: number;

  /**
   * @param input  polyline vertices
   * @param ids    optional id per input vertex; produces a marker per vertex
   * @param maxRadius  maximum fillet radius in metres
   */
  constructor(input: Vec2[], ids: (string | null)[] = [], maxRadius = 30) {
    const pts = dedupe(input);
    const keepIds = ids.length === input.length ? dedupeIds(input, ids) : [];
    const out: Vec2[] = [];
    if (pts.length > 0) out.push(pts[0]);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const p = pts[i];
      const c = pts[i + 1];
      const h1 = headingOf(sub(p, a));
      const h2 = headingOf(sub(c, p));
      let defl = normHeading(h2 - h1);
      if (defl > 180) defl -= 360;
      const absDefl = Math.abs(defl);
      if (absDefl < 3) {
        out.push(p);
        continue;
      }
      const lin = distance(a, p);
      const lout = distance(p, c);
      const half = ((absDefl / 2) * Math.PI) / 180;
      let tangent = maxRadius * Math.tan(half);
      tangent = Math.min(tangent, lin * 0.45, lout * 0.45);
      const p1 = lerp(p, a, tangent / lin);
      const p2 = lerp(p, c, tangent / lout);
      // Quadratic Bezier through the corner approximates the arc well enough.
      const steps = Math.max(2, Math.ceil(absDefl / 10));
      out.push(p1);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const q = {
          x: (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * p.x + t * t * p2.x,
          y: (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * p.y + t * t * p2.y,
        };
        out.push(q);
      }
      out.push(p2);
    }
    if (pts.length > 1) out.push(pts[pts.length - 1]);

    this.points = dedupe(out);
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) {
      this.cum.push(this.cum[i - 1] + distance(this.points[i - 1], this.points[i]));
    }
    this.length = this.cum[this.cum.length - 1] ?? 0;

    this.markers = [];
    if (keepIds.length) {
      let from = 0;
      for (let i = 0; i < pts.length; i++) {
        const id = keepIds[i];
        const s = this.closestS(pts[i], from);
        from = s;
        if (id) this.markers.push({ id, s });
      }
    }
  }

  /** Closest arc length to `p`, searching forward from `fromS`. */
  closestS(p: Vec2, fromS = 0): number {
    let best = fromS;
    let bestD = Infinity;
    for (let i = 0; i < this.points.length - 1; i++) {
      if (this.cum[i + 1] < fromS - 1e-6) continue;
      const a = this.points[i];
      const b = this.points[i + 1];
      const segLen = this.cum[i + 1] - this.cum[i];
      const ab = sub(b, a);
      const t = segLen === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (segLen * segLen)));
      const q = lerp(a, b, t);
      const d = distance(p, q);
      const s = this.cum[i] + t * segLen;
      if (s < fromS - 1e-6) continue;
      if (d < bestD - 1e-6) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  private segmentAt(s: number): number {
    if (s <= 0) return 0;
    if (s >= this.length) return Math.max(0, this.points.length - 2);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  pointAt(s: number): Vec2 {
    if (this.points.length === 1) return this.points[0];
    const i = this.segmentAt(s);
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen === 0 ? 0 : (Math.max(0, Math.min(this.length, s)) - this.cum[i]) / segLen;
    return lerp(this.points[i], this.points[i + 1], t);
  }

  headingAt(s: number): number {
    if (this.points.length < 2) return 0;
    const i = this.segmentAt(s);
    return headingOf(sub(this.points[i + 1], this.points[i]));
  }

  /** Largest absolute heading change within the window [s, s + window]. */
  maxTurnAhead(s: number, window: number): number {
    const h0 = this.headingAt(s);
    let max = 0;
    const step = 5;
    for (let d = step; d <= window; d += step) {
      if (s + d > this.length) break;
      let diff = Math.abs(normHeading(this.headingAt(s + d) - h0));
      if (diff > 180) diff = 360 - diff;
      if (diff > max) max = diff;
    }
    return max;
  }

  marker(id: string): PathMarker | undefined {
    return this.markers.find((m) => m.id === id);
  }
}

function dedupe(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    if (out.length === 0 || distance(out[out.length - 1], p) > 0.01) out.push(p);
  }
  return out;
}

function dedupeIds(pts: Vec2[], ids: (string | null)[]): (string | null)[] {
  const out: (string | null)[] = [];
  let last: Vec2 | null = null;
  for (let i = 0; i < pts.length; i++) {
    if (last === null || distance(last, pts[i]) > 0.01) {
      out.push(ids[i]);
      last = pts[i];
    } else if (ids[i]) {
      out[out.length - 1] = ids[i];
    }
  }
  return out;
}
