import { createAircraft, type Aircraft } from './aircraft';
import type { TaxiNode } from './airport/airport';
import { findRoute, isRouteError } from './airport/routing';
import { add, distance, headingVector, scale, type Vec2 } from './geo';
import { Path } from './path';
import { splitCallsign } from './phraseology/speech';
import type { Simulation } from './simulation';
import { TELEPHONY } from '../data/airlines';

/**
 * Ground vehicles: follow-me cars (a real entity that drives on the taxi
 * network and leads an aircraft), tugs (drawn at the nose of the aircraft
 * they push or tow) and tows - aircraft without crew moved from one stand to
 * another by a tug, which talks to Ground under the tug's callsign (TUG5).
 */

export interface Vehicle {
  callsign: string;
  /** Label on the scope, e.g. "FOLLOW-ME 1". */
  name: string;
  kind: 'followMe';
  pos: Vec2;
  heading: number;
  path: Path | null;
  s: number;
  state: 'idle' | 'toAircraft' | 'leading' | 'returning';
  /** Aircraft the follow-me is assigned to. */
  aircraft?: string;
}

/** Follow-me cars at the airport. */
const FOLLOW_ME_COUNT = 2;
/** Driving speed of a follow-me on its own (m/s, about 36 km/h). */
export const VEHICLE_SPEED = 10;
/** Distance the follow-me keeps ahead of the aircraft's nose (metres). */
const LEAD_M = 35;
/** Towing speed (knots). */
export const TOW_SPEED_KT = 10;
/** Share of arrivals on a stand that needs a pushback that are towed to a remote stand after the turnaround. */
const TOW_CHANCE = 0.15;
/** A towed aircraft stays parked on the remote stand this long (seconds). */
export const TOW_PARK_MIN_S = 20 * 60;
export const TOW_PARK_MAX_S = 40 * 60;
/** Share of crews that ask for a follow-me: business aviation (registration callsigns) / airlines. */
const FOLLOW_ME_CHANCE_GA = 0.2;
const FOLLOW_ME_CHANCE_AIRLINE = 0.03;

export function createVehicles(sim: Simulation): Vehicle[] {
  const base = vehicleBase(sim);
  return Array.from({ length: FOLLOW_ME_COUNT }, (_, i) => ({
    callsign: `FOLLOWME${i + 1}`,
    name: `FOLLOW-ME ${i + 1}`,
    kind: 'followMe' as const,
    pos: base.pos,
    heading: 0,
    path: null,
    s: 0,
    state: 'idle' as const,
  }));
}

/** Where the follow-me cars wait: the taxi node next to the fire station (or the first stand). */
export function vehicleBase(sim: Simulation): TaxiNode {
  const station = sim.airport.buildings.find((b) => /fire/i.test(b.name));
  const nodes = [...sim.airport.nodes.values()];
  if (!station) return [...sim.airport.stands.values()][0]?.node ?? nodes[0];
  const c = station.polygon.reduce((acc, p) => ({ x: acc.x + p.x / station.polygon.length, y: acc.y + p.y / station.polygon.length }), { x: 0, y: 0 });
  return nodes.reduce((best, n) => (distance(n.pos, c) < distance(best.pos, c) ? n : best));
}

/** Position and heading of the tug attached to an aircraft (pushback, tow, turnaround), if any. */
export function tugOf(sim: Simulation, ac: Aircraft): { pos: Vec2; heading: number } | undefined {
  const towing = ac.category === 'tow' && (ac.phase === 'startup' || ac.phase === 'taxi');
  const turning = ac.tugUntil !== undefined && ac.tugUntil > sim.time;
  if (ac.phase !== 'pushback' && !towing && !turning) return undefined;
  return { pos: add(ac.pos, scale(headingVector(ac.heading), ac.type.lengthM / 2 + 3)), heading: ac.heading };
}

/** Telephony of the tug ("Tug 5") is the standard one; the operator of a towed aircraft, for the tow request. */
function operatorName(callsign: string): string {
  const { prefix } = splitCallsign(callsign);
  return (prefix && TELEPHONY.get(prefix)) || '';
}

/**
 * After the turnaround of an arrival on a stand that needs a pushback (a
 * contact stand), the aircraft may be towed to a remote stand to free the
 * contact stand. Returns the tow (a new entity with the tug's callsign).
 */
export function maybeStartTow(sim: Simulation, ac: Aircraft): Aircraft | undefined {
  const stand = sim.airport.stand(ac.stand ?? '');
  if (!stand?.pushback || !sim.rng.chance(TOW_CHANCE)) return undefined;
  const used = new Set(sim.aircraft.map((a) => a.callsign));
  const n = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((k) => !used.has(`TUG${k}`));
  if (!n) return undefined;
  const remote = sim.freeStands(ac.type.wingspanM, (s) => !s.pushback && s.id !== stand.id, ac);
  if (!remote.length) return undefined;
  const dest = sim.rng.pick(remote);
  const tow = createAircraft({
    callsign: `TUG${n}`,
    type: ac.type,
    category: 'tow',
    flightPlan: { ...ac.flightPlan },
    pos: stand.pos,
    heading: stand.heading,
    altitudeFt: sim.config.airport.elevationFt,
    phase: 'parked',
    frequency: sim.stationFor('ground'),
    now: sim.time,
  });
  tow.stand = stand.id;
  tow.assignedStand = dest.id;
  tow.cleared = true;
  tow.tow = { aircraft: ac.callsign, operator: operatorName(ac.callsign), from: stand.id, to: dest.id };
  tow.readyAt = sim.time + sim.rng.range(10, 60);
  sim.aircraft.push(tow);
  return tow;
}

/** Whether a crew that has just vacated asks for a follow-me (unfamiliar with the airport). */
export function wantsFollowMe(sim: Simulation, ac: Aircraft): boolean {
  const ga = !/^[A-Z]{3}\d/.test(ac.callsign);
  return sim.rng.chance(ga ? FOLLOW_ME_CHANCE_GA : FOLLOW_ME_CHANCE_AIRLINE);
}

function leadDistance(ac: Aircraft): number {
  return ac.type.lengthM / 2 + LEAD_M;
}

function routeBetween(sim: Simulation, from: Vec2, heading: number | undefined, to: TaxiNode): Path | null {
  const r = findRoute(sim.airport, { position: from, heading }, to, [], { allowUTurn: true });
  if (isRouteError(r)) return null;
  const pts = [...(r.startPosition ? [r.startPosition] : []), ...r.nodes.map((n) => n.pos)];
  return pts.length > 1 ? new Path(pts, [], 15) : null;
}

/** Sends a free follow-me to an aircraft that has a route: it drives to a point ahead of the aircraft. */
function dispatch(sim: Simulation, ac: Aircraft, v: Vehicle): void {
  const path = ac.path!;
  const ahead = ac.s + leadDistance(ac);
  const nodes = ac.route?.nodes ?? [];
  const target = nodes.find((n) => (path.marker(n.id)?.s ?? -1) >= ahead) ?? nodes[nodes.length - 1];
  v.aircraft = ac.callsign;
  ac.followMe = { vehicle: v.callsign, leading: false };
  v.path = target ? routeBetween(sim, v.pos, undefined, target) : null;
  v.s = 0;
  v.state = 'toAircraft';
  const eta = v.path ? Math.max(1, Math.round(v.path.length / VEHICLE_SPEED / 60)) : 1;
  sim.system(`${v.name} is on its way to ${ac.callsign}, about ${eta} min. ${ac.callsign} waits for it.`, 'system', ac.callsign);
}

/** Releases the follow-me: it drives back to its base. */
function release(sim: Simulation, v: Vehicle): void {
  const ac = sim.find(v.aircraft);
  if (ac?.followMe?.vehicle === v.callsign) ac.followMe = undefined;
  v.aircraft = undefined;
  v.state = 'returning';
  v.path = routeBetween(sim, v.pos, v.heading, vehicleBase(sim));
  v.s = 0;
  if (!v.path) v.state = 'idle';
}

function drive(v: Vehicle, dt: number): boolean {
  if (!v.path) return true;
  v.s = Math.min(v.path.length, v.s + VEHICLE_SPEED * dt);
  v.pos = v.path.pointAt(v.s);
  if (v.path.length > 0.5) v.heading = v.path.headingAt(v.s);
  return v.s >= v.path.length - 0.1;
}

/** Moves the follow-me cars; called every simulation step. */
export function updateVehicles(sim: Simulation, dt: number): void {
  // Aircraft waiting for a follow-me get the next free one once they have a route.
  for (const ac of sim.aircraft) {
    if (!ac.followMe || ac.followMe.vehicle) continue;
    if (!ac.onGround || ac.phase === 'arrived' || ac.phase === 'gone') {
      ac.followMe = undefined;
      continue;
    }
    if (ac.phase !== 'taxi' || !ac.path || !ac.route) continue;
    if (ac.path.length - ac.s < 80) {
      ac.followMe = undefined; // almost there: no follow-me needed
      continue;
    }
    const free = sim.vehicles.find((v) => v.state === 'idle');
    if (free) dispatch(sim, ac, free);
  }
  for (const v of sim.vehicles) {
    if (v.state === 'idle') continue;
    if (v.state === 'returning') {
      if (drive(v, dt)) {
        v.state = 'idle';
        v.path = null;
      }
      continue;
    }
    const ac = sim.find(v.aircraft);
    if (!ac || ac.followMe?.vehicle !== v.callsign || !ac.path || ac.phase !== 'taxi') {
      release(sim, v);
      continue;
    }
    if (v.state === 'toAircraft') {
      if (drive(v, dt) || !v.path) {
        v.state = 'leading';
        ac.followMe.leading = true;
      }
      continue;
    }
    // Leading: stay ahead of the aircraft on its path; peel off before the stand.
    const lead = leadDistance(ac);
    const ahead = ac.s + lead;
    if (ac.path.length - ac.s < lead + 25) {
      release(sim, v);
      continue;
    }
    v.pos = ac.path.pointAt(ahead);
    v.heading = ac.path.headingAt(ahead);
  }
}
