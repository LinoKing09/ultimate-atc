/**
 * Geometry helpers.
 *
 * The simulation works in a flat, local Cartesian frame measured in metres:
 * `x` points east, `y` points north, with the origin at the airport reference
 * point (ARP). Within the few kilometres that matter for ground and tower
 * control an equirectangular projection is accurate to well below a metre.
 *
 * Headings are in degrees true, 0 = north, increasing clockwise.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export const EARTH_RADIUS_M = 6_371_000;
export const M_PER_NM = 1852;
export const M_PER_FT = 0.3048;
export const KT_TO_MS = M_PER_NM / 3600;
export const MS_TO_KT = 1 / KT_TO_MS;

const DEG = Math.PI / 180;

export class LocalProjection {
  private readonly cosLat: number;

  constructor(public readonly origin: LatLon) {
    this.cosLat = Math.cos(origin.lat * DEG);
  }

  toLocal(p: LatLon): Vec2 {
    return {
      x: (p.lon - this.origin.lon) * DEG * EARTH_RADIUS_M * this.cosLat,
      y: (p.lat - this.origin.lat) * DEG * EARTH_RADIUS_M,
    };
  }

  toLatLon(v: Vec2): LatLon {
    return {
      lat: this.origin.lat + v.y / EARTH_RADIUS_M / DEG,
      lon: this.origin.lon + v.x / (EARTH_RADIUS_M * this.cosLat) / DEG,
    };
  }
}

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Normalises an angle to the range [0, 360). */
export function normHeading(h: number): number {
  const r = h % 360;
  return r < 0 ? r + 360 : r;
}

/** Signed smallest difference `b - a` in degrees, in the range (-180, 180]. */
export function headingDiff(a: number, b: number): number {
  let d = normHeading(b - a);
  if (d > 180) d -= 360;
  return d;
}

/** Heading (degrees true) of the vector `v`. */
export function headingOf(v: Vec2): number {
  return normHeading(Math.atan2(v.x, v.y) / DEG);
}

/** Unit vector pointing along heading `h`. */
export function headingVector(h: number): Vec2 {
  return { x: Math.sin(h * DEG), y: Math.cos(h * DEG) };
}

/** Projects point `p` onto segment `a`-`b`; returns the parameter t in [0,1] and the closest point. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; dist: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  const point = lerp(a, b, t);
  return { t, point, dist: distance(p, point) };
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
