import { findRoute, isRouteError, type TaxiRoute } from './airport/routing';
import type { TaxiNode } from './airport/airport';
import type { Aircraft } from './aircraft';
import { distance, headingDiff, headingOf, sub, type Vec2 } from './geo';
import type { TaxiDestination } from './phraseology/commands';
import { formatDestination } from './phraseology/format';
import { previewTaxi, routeOptionsOf, routeStartOf } from './pilot';
import type { Simulation } from './simulation';

/**
 * Head-on conflicts on the taxiway network (the A-SMGCS "conflicting ATC
 * clearances" service, CATC) and how to resolve them the way it is done in
 * real operations: one aircraft turns off via another taxiway, the other one
 * waits. Turning around on a taxiway is only possible for small aircraft;
 * otherwise a tug is needed, which takes several minutes.
 */

/** Opposite directions: heading difference above this counts as head-on. */
const HEAD_ON_DEG = 135;
const SAMPLE_STEP = 15;
const LOOK_AHEAD = 900;

export interface HeadOnConflict {
  other: Aircraft;
  /** Taxiway where the two meet. */
  taxiway: string;
  at: Vec2;
}

interface Sample {
  p: Vec2;
  h: number;
}

/** Samples a polyline every SAMPLE_STEP metres (up to `maxLen`), with the direction of travel. */
function samplePolyline(points: Vec2[], maxLen = LOOK_AHEAD): Sample[] {
  const out: Sample[] = [];
  let travelled = 0;
  for (let i = 0; i < points.length - 1 && travelled <= maxLen; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = distance(a, b);
    if (len < 0.5) continue;
    const h = headingOf(sub(b, a));
    for (let d = 0; d < len && travelled + d <= maxLen; d += SAMPLE_STEP) {
      out.push({ p: { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len }, h });
    }
    travelled += len;
  }
  return out;
}

/** Where an aircraft is going to be: samples of its remaining path, or its position if it stands still. */
function futureOf(ac: Aircraft): Sample[] {
  if (ac.path && ['taxi', 'pushback', 'vacating'].includes(ac.phase)) {
    const out: Sample[] = [];
    const end = Math.min(ac.path.length, ac.s + LOOK_AHEAD);
    for (let s = ac.s; s <= end; s += SAMPLE_STEP) out.push({ p: ac.path.pointAt(s), h: ac.reverse ? (ac.path.headingAt(s) + 180) % 360 : ac.path.headingAt(s) });
    if (out.length) return out;
  }
  return [{ p: ac.pos, h: ac.heading }];
}

/** Aircraft that can be in a taxiway conflict (on the ground, outside stands and the runway). */
function isTaxiingTraffic(ac: Aircraft): boolean {
  return ac.onGround && ['taxi', 'pushback', 'startup', 'vacating', 'holding'].includes(ac.phase);
}

/** Finds the first point where a planned route (polyline) meets other traffic head-on. */
export function routeHeadOn(sim: Simulation, ac: Aircraft, points: Vec2[]): HeadOnConflict | undefined {
  const own = samplePolyline(points);
  if (!own.length) return undefined;
  for (const other of sim.aircraft) {
    if (other === ac || !isTaxiingTraffic(other)) continue;
    const found = firstHeadOn(own, futureOf(other), (ac.type.wingspanM + other.type.wingspanM) * 0.38 + 6);
    if (found) return { other, at: found, taxiway: sim.airport.nearestEdge(found)?.edge.name ?? '' };
  }
  return undefined;
}

function firstHeadOn(a: Sample[], b: Sample[], r: number): Vec2 | undefined {
  const r2 = r * r;
  for (const sa of a) {
    for (const sb of b) {
      const dx = sa.p.x - sb.p.x;
      const dy = sa.p.y - sb.p.y;
      if (dx * dx + dy * dy < r2 && Math.abs(headingDiff(sa.h, sb.h)) > HEAD_ON_DEG) return sa.p;
    }
  }
  return undefined;
}

/** Head-on conflicts between the cleared routes of all taxiing aircraft (pair key -> conflict). */
export function findRouteConflicts(sim: Simulation): Map<string, { a: Aircraft; b: Aircraft; taxiway: string }> {
  const out = new Map<string, { a: Aircraft; b: Aircraft; taxiway: string }>();
  const list = sim.aircraft.filter(isTaxiingTraffic);
  const fut = new Map(list.map((a) => [a, futureOf(a)]));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      // Only routes that are actually moving towards each other (at least one of them on a cleared route).
      if (!a.path && !b.path) continue;
      if (distance(a.pos, b.pos) > LOOK_AHEAD * 2) continue;
      const at = firstHeadOn(fut.get(a)!, fut.get(b)!, (a.type.wingspanM + b.type.wingspanM) * 0.38 + 6);
      if (!at) continue;
      const [x, y] = a.callsign < b.callsign ? [a, b] : [b, a];
      out.set(`${x.callsign}|${y.callsign}`, { a: x, b: y, taxiway: sim.airport.nearestEdge(at)?.edge.name ?? '' });
    }
  }
  return out;
}

/** CATC: alerts once per new head-on conflict between cleared routes; called every few seconds. */
export function updateConflictAlerts(sim: Simulation): void {
  if (!sim.systemOn('catc')) {
    sim.routeConflicts.clear();
    return;
  }
  const now = findRouteConflicts(sim);
  for (const [key, c] of now) {
    if (sim.routeConflicts.has(key)) continue;
    if (!sim.isOnMyFrequency(c.a) && !sim.isOnMyFrequency(c.b)) continue;
    sim.system(`CATC: ${c.a.callsign} and ${c.b.callsign} are routed head-on${c.taxiway ? ` on ${c.taxiway}` : ''}.`, 'warning', c.a.callsign);
  }
  sim.routeConflicts.clear();
  for (const [k, v] of now) sim.routeConflicts.set(k, v);
}

/** The node a destination refers to (for re-routing). */
function destinationNode(sim: Simulation, dest: TaxiDestination): TaxiNode | undefined {
  switch (dest.kind) {
    case 'holdingPoint':
      return sim.airport.holdingPoint(dest.name);
    case 'stand':
      return sim.airport.stand(dest.stand)?.node;
    case 'runway': {
      const entry = sim.airport.runwayOps(dest.runway)?.departureEntries.find((e) => e.fullLength);
      return entry ? sim.airport.holdingPoint(entry.holdingPoint) : undefined;
    }
    default:
      return undefined;
  }
}

/** Where an aircraft should go if it has no route at the moment. */
function intendedDestination(sim: Simulation, ac: Aircraft): TaxiDestination | undefined {
  if (ac.routeDestination && ac.routeDestination.kind !== 'holdShort') return ac.routeDestination;
  if (ac.category === 'arrival' || ac.returnToStand) return ac.assignedStand ? { kind: 'stand', stand: ac.assignedStand } : undefined;
  return { kind: 'runway', runway: sim.runway };
}

export interface ResolveOption {
  /** Aircraft that is re-routed. */
  aircraft: Aircraft;
  /** Aircraft it gives way to. */
  other: Aircraft;
  /** The instruction to transmit (without callsign). */
  instruction: string;
  /** The new route (none for "cancel pushback"). */
  route?: TaxiRoute;
  /** True if the aircraft has to be turned around by a tug first (several minutes). */
  tug: boolean;
}

/**
 * Ways out of a head-on conflict, as in real operations: for each of the two
 * aircraft, a route to its destination that keeps clear of the other one -
 * preferably turning off via another taxiway. If there is no junction left
 * between them, the only way is a tug that turns one of them around.
 */
export function resolveOptions(sim: Simulation, a: Aircraft, b: Aircraft): ResolveOption[] {
  const out: ResolveOption[] = [];
  const tugs: ResolveOption[] = [];
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    // An aircraft pushing back into the other's way: stop and tow it back onto the stand.
    if (x.phase === 'pushback' && !x.towingIn) {
      out.unshift({ aircraft: x, other: y, instruction: 'cancel pushback', tug: false });
      continue;
    }
    const dest = intendedDestination(sim, x);
    const node = dest && destinationNode(sim, dest);
    if (!dest || !node || x.phase === 'parked') continue;
    const radius = (x.type.wingspanM + y.type.wingspanM) * 0.38 + 10;
    // Keep clear of the other aircraft and of the first part of its path.
    const avoid = { points: futureOf(y).slice(0, 10).map((s) => s.p), radius };
    const destText = dest.kind === 'runway' ? `holding point ${node.holdingPoint?.name ?? ''}` : formatDestination(dest);
    const target: TaxiDestination = dest.kind === 'runway' ? { kind: 'holdingPoint', name: node.holdingPoint?.name ?? '' } : dest;

    const find = (allowUTurn: boolean): TaxiRoute | undefined => {
      // Turning around: y's path runs through x itself, so only y's position must be avoided.
      // (They may already stand closer together than the normal clearance: then moving away is enough.)
      const tugAvoid = { points: [y.pos], radius: Math.min(radius, distance(x.pos, y.pos) - 3) };
      const base = { ...routeOptionsOf(sim, x), allowUTurn, avoid: allowUTurn ? tugAvoid : avoid };
      let r = findRoute(sim.airport, routeStartOf(sim, x), node, [], { ...base, strictFlows: true });
      if (isRouteError(r)) r = findRoute(sim.airport, routeStartOf(sim, x), node, [], base);
      return isRouteError(r) ? undefined : r;
    };
    const viaOf = (r: TaxiRoute) => r.taxiways.filter((t) => sim.airport.taxiwayNames.has(t.toUpperCase()));

    const route = find(false);
    if (route && !route.requiresUTurn) {
      const via = viaOf(route);
      // The pilot's own interpretation of the instruction must also keep clear of the other aircraft.
      const check = previewTaxi(sim, x, { type: 'taxi', destination: target, via, holdShort: [], cross: [] });
      if (!('error' in check) && !check.route.requiresUTurn && keepsClear(check.route, avoid)) {
        out.push({ aircraft: x, other: y, instruction: `taxi to ${destText} via ${via.join(', ')}`, route: check.route, tug: false });
        continue;
      }
    }
    // No way out forwards: a tug turns the aircraft around (only big aircraft need one; small ones can turn).
    const back = find(true);
    if (back) tugs.push({ aircraft: x, other: y, instruction: `taxi to ${destText} via ${viaOf(back).join(', ')}`, route: back, tug: back.requiresUTurn && x.type.wingspanM > 25 });
  }
  return out.length ? out : tugs;
}

function keepsClear(route: TaxiRoute, avoid: { points: Vec2[]; radius: number }): boolean {
  const pts = [...(route.startPosition ? [route.startPosition] : []), ...route.nodes.map((n) => n.pos)];
  // The first segment leads away from where the aircraft stands now (checked by the router); check the rest.
  return pts.every((p, i) => i <= 1 || avoid.points.every((q) => distanceToSegment(q, pts[i - 1], p) >= avoid.radius));
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * The aircraft this one is in a head-on conflict with: blocked nose to nose,
 * blocking each other (e.g. a pushback into a taxiing aircraft's way), or
 * routed head-on.
 */
export function headOnPartner(sim: Simulation, ac: Aircraft): Aircraft | undefined {
  if (ac.blockedBy) {
    const o = sim.find(ac.blockedBy);
    if (o && (Math.abs(headingDiff(ac.heading, o.heading)) > 120 || o.blockedBy === ac.callsign)) return o;
  }
  for (const c of sim.routeConflicts.values()) {
    if (c.a === ac) return c.b;
    if (c.b === ac) return c.a;
  }
  return undefined;
}

/** Seconds before an arrival reaches the threshold within which a crossing raises an RMCA alert. */
const RMCA_ARRIVAL_S = 60;
/** Distance to the runway holding position at which an RMCA alert is raised. */
const RMCA_RANGE_M = 120;
const rmcaAlerted = new WeakMap<Aircraft, string>();

/**
 * RMCA (runway monitoring and conflict alerting): alerts when an aircraft
 * with a clearance to cross or enter the runway approaches the runway
 * holding position while the runway is occupied, an aircraft is taking off
 * or landing, or an arrival is less than a minute out.
 */
export function updateRunwayAlerts(sim: Simulation): void {
  if (!sim.systemOn('rmca')) return;
  for (const ac of sim.aircraft) {
    if (!ac.onGround || ac.phase !== 'taxi' || !ac.path || ac.speed < 0.5 || !ac.route) continue;
    // Next runway holding position on the route that the aircraft is cleared through.
    let hp: TaxiNode | undefined;
    for (let i = 0; i < ac.route.edges.length; i++) {
      const from = ac.route.nodes[i];
      if (ac.route.edges[i].kind !== 'runwayStrip' || !from.holdingPoint) continue;
      const s = ac.path.marker(from.id)?.s ?? -1;
      if (s >= ac.s && s - ac.s < RMCA_RANGE_M && ac.clearedToCross.has(from.holdingPoint.runway)) {
        hp = from;
        break;
      }
    }
    if (!hp) {
      rmcaAlerted.delete(ac);
      continue;
    }
    const occupied = sim.tower.runwayBusy(ac);
    const eta = sim.tower.nextArrivalEta();
    if (!occupied && eta > RMCA_ARRIVAL_S) continue;
    const key = hp.id;
    if (rmcaAlerted.get(ac) === key) continue;
    rmcaAlerted.set(ac, key);
    const why = occupied ? 'runway occupied' : `arrival ${Math.round(eta)} s out`;
    sim.system(`RMCA: ${ac.callsign} approaching the runway at ${hp.holdingPoint?.name ?? ''} - ${why}! Stop it: "hold position".`, 'warning', ac.callsign);
  }
}
