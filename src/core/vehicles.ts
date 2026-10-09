import { createAircraft, type Aircraft } from './aircraft';
import type { TaxiNode } from './airport/airport';
import { findRoute, isRouteError } from './airport/routing';
import { add, distance, headingVector, projectOnSegment, scale, type Vec2 } from './geo';
import { Path } from './path';
import type { ParsedTransmission } from './phraseology/commands';
import { capitalize, formatCommand } from './phraseology/format';
import { splitCallsign, telephonyCallsign } from './phraseology/speech';
import type { Simulation, TransmitResult } from './simulation';
import { TELEPHONY } from '../data/airlines';

/**
 * Ground vehicles: follow-me cars (a real entity that drives on the taxi
 * network and leads an aircraft), tugs (drawn at the nose of the aircraft
 * they push or tow) and tows - aircraft without crew moved from one stand to
 * another by a tug, which talks to Ground under the tug's callsign (TUG5).
 */

export interface Vehicle {
  /** Radio callsign, e.g. FME1 ("Follow-me 1"). */
  callsign: string;
  /** Label on the scope, e.g. "FOLLOW-ME 1". */
  name: string;
  kind: 'followMe';
  pos: Vec2;
  heading: number;
  /** Position and heading one simulation step earlier (the scope interpolates between them). */
  prevPos: Vec2;
  prevHeading: number;
  /** Current speed (m/s): the car accelerates and brakes smoothly. */
  speed: number;
  path: Path | null;
  s: number;
  /** Leading: distance along the aircraft's path where the car is. */
  leadS?: number;
  /**
   * idle: at the base. assigned: waits for "proceed" to drive to the aircraft. toAircraft: driving
   * there. leading: in front of the aircraft. done: job finished, waits for "return to base".
   * returning: driving back to the base.
   */
  state: 'idle' | 'assigned' | 'toAircraft' | 'leading' | 'done' | 'returning';
  /** Aircraft the follow-me is assigned to. */
  aircraft?: string;
  /** Stopped by "hold position" (until "continue"). */
  holding: boolean;
  /** What the driver is waiting for from Ground. */
  request?: 'proceed' | 'return';
  requestSince: number;
  lastCallAt: number;
  callCount: number;
}

/** Follow-me cars at the airport. */
const FOLLOW_ME_COUNT = 2;
/** Driving speed of a follow-me on its own (m/s, about 36 km/h). */
export const VEHICLE_SPEED = 10;
/** Acceleration and braking of a follow-me (m/s^2). */
const VEHICLE_ACCEL = 2.5;
const VEHICLE_BRAKE = 3;
/** Maximum turn rate of a follow-me (degrees per second). */
const VEHICLE_TURN_RATE = 120;
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
    callsign: `FME${i + 1}`,
    name: `FOLLOW-ME ${i + 1}`,
    kind: 'followMe' as const,
    pos: base.pos,
    heading: 0,
    prevPos: base.pos,
    prevHeading: 0,
    speed: 0,
    path: null,
    s: 0,
    state: 'idle' as const,
    holding: false,
    requestSince: 0,
    lastCallAt: 0,
    callCount: 0,
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

/** Radiotelephony callsign of a vehicle ("Follow-me 1"). */
export function vehicleTel(v: Vehicle): string {
  return telephonyCallsign(v.callsign);
}

function routeBetween(sim: Simulation, from: Vec2, heading: number | undefined, to: TaxiNode, via: string[] = []): Path | null | { error: string } {
  const r = findRoute(sim.airport, { position: from, heading }, to, via, { allowUTurn: true });
  if (isRouteError(r)) return via.length ? { error: r.error } : null;
  const pts = [...(r.startPosition ? [r.startPosition] : []), ...r.nodes.map((n) => n.pos)];
  return pts.length > 1 ? new Path(pts, [], 15) : null;
}

/** Where the follow-me meets the aircraft: the first node of its route at least the lead distance ahead. */
function meetingNode(ac: Aircraft): TaxiNode | undefined {
  const path = ac.path;
  const nodes = ac.route?.nodes ?? [];
  if (!path) return undefined;
  const ahead = ac.s + leadDistance(ac);
  return nodes.find((n) => (path.marker(n.id)?.s ?? -1) >= ahead) ?? nodes[nodes.length - 1];
}

/** "Taxiway F", "stand 14": where an aircraft is, for radio calls. */
export function locationOf(sim: Simulation, ac: Aircraft): string {
  if (ac.phase === 'parked' && ac.stand) return `stand ${ac.stand}`;
  let best: { name: string; d: number } | undefined;
  for (const e of sim.airport.edges) {
    if (!e.name || !sim.airport.taxiwayNames.has(e.name.toUpperCase())) continue;
    const d = projectOnSegment(ac.pos, e.from.pos, e.to.pos).dist;
    if (!best || d < best.d) best = { name: e.name, d };
  }
  return best ? `taxiway ${best.name.toUpperCase()}` : 'the apron';
}

/** Ground is run by the AI (the user does not staff it): vehicles do not call, their requests are approved. */
function aiGround(sim: Simulation): boolean {
  return !sim.userControls(sim.stationFor('ground'));
}

function vehicleCall(sim: Simulation, v: Vehicle, request: Vehicle['request'], text: string): void {
  if (sim.frequency.hasQueued(v.callsign)) return;
  v.lastCallAt = sim.time;
  sim.frequency.pilotTransmit(sim.time, v.callsign, text, {
    delay: sim.rng.range(0.5, 2),
    ttl: 45,
    onTransmit: () => {
      if (v.request !== request) {
        v.request = request;
        v.requestSince = sim.time;
        v.callCount = 0;
      }
      v.callCount++;
      v.lastCallAt = sim.time;
    },
  });
}

function vehicleReadback(sim: Simulation, v: Vehicle, text: string): void {
  sim.frequency.expectReply(v.callsign, Math.max(sim.time, sim.frequency.freeAt) + 6);
  sim.frequency.pilotTransmit(sim.time, v.callsign, text, { delay: sim.rng.range(0.6, 1.8), priority: 10, ttl: 60 });
}

/** Starts the drive to the assigned aircraft (optionally along `via`). Returns an error text if the route is impossible. */
function startToAircraft(sim: Simulation, v: Vehicle, via: string[] = []): string | undefined {
  const ac = sim.find(v.aircraft);
  const target = ac && meetingNode(ac);
  const path = target ? routeBetween(sim, v.pos, v.state === 'idle' ? undefined : v.heading, target, via) : null;
  if (path && 'error' in path) return path.error;
  v.path = path;
  v.s = 0;
  v.state = 'toAircraft';
  v.holding = false;
  return undefined;
}

/** Drives back to the base. */
function startReturn(sim: Simulation, v: Vehicle, via: string[] = []): string | undefined {
  const path = routeBetween(sim, v.pos, v.heading, vehicleBase(sim), via);
  if (path && 'error' in path) return path.error;
  const ac = sim.find(v.aircraft);
  if (ac?.followMe?.vehicle === v.callsign) ac.followMe = undefined;
  v.aircraft = undefined;
  v.leadS = undefined;
  v.path = path;
  v.s = 0;
  v.state = path ? 'returning' : 'idle';
  v.holding = false;
  return undefined;
}

/** Assigns a free follow-me to an aircraft that has a route; the driver asks Ground to proceed. */
function assign(sim: Simulation, ac: Aircraft, v: Vehicle): void {
  v.aircraft = ac.callsign;
  ac.followMe = { vehicle: v.callsign, leading: false };
  v.state = 'assigned';
  v.request = undefined;
  if (aiGround(sim)) {
    startToAircraft(sim, v);
    return;
  }
  vehicleCall(sim, v, 'proceed', `${sim.station.name}, ${vehicleTel(v)}, request proceed to ${sim.tel(ac)} at ${locationOf(sim, ac)}`);
}

/** Job done (the aircraft is at its stand entry): the driver asks to return to base. */
function finish(sim: Simulation, v: Vehicle): void {
  const ac = sim.find(v.aircraft);
  if (ac?.followMe?.vehicle === v.callsign) ac.followMe = undefined;
  v.state = 'done';
  v.path = null;
  if (aiGround(sim)) {
    startReturn(sim, v);
    return;
  }
  vehicleCall(sim, v, 'return', `${sim.station.name}, ${vehicleTel(v)}, ${ac ? `${sim.tel(ac)} is at the stand, ` : ''}request return to base`);
}

/** Speed towards `target` (m/s), braking in time for a stop `toGo` metres ahead. */
function approachSpeed(v: Vehicle, target: number, toGo: number, dt: number): number {
  const brakeLimit = Math.sqrt(Math.max(0, 2 * VEHICLE_BRAKE * Math.max(0, toGo - 0.3)));
  const want = Math.min(target, brakeLimit);
  return want > v.speed ? Math.min(want, v.speed + VEHICLE_ACCEL * dt) : Math.max(want, v.speed - VEHICLE_BRAKE * dt);
}

/** Turns the car towards a heading at a limited rate (no jumps at corners). */
function steer(v: Vehicle, heading: number, dt: number): void {
  const diff = ((heading - v.heading + 540) % 360) - 180;
  const max = VEHICLE_TURN_RATE * dt;
  v.heading = (v.heading + Math.max(-max, Math.min(max, diff)) + 360) % 360;
}

function drive(v: Vehicle, dt: number): boolean {
  if (!v.path) return true;
  const toGo = v.path.length - v.s;
  v.speed = approachSpeed(v, v.holding ? 0 : VEHICLE_SPEED, v.holding ? 0 : toGo, dt);
  if (v.holding) return false;
  v.s = Math.min(v.path.length, v.s + v.speed * dt);
  v.pos = v.path.pointAt(v.s);
  if (v.path.length > 0.5) steer(v, v.path.headingAt(v.s), dt);
  return v.s >= v.path.length - 0.1;
}

/** Moves the follow-me cars and makes their calls; called every simulation step. */
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
    if (free) assign(sim, ac, free);
  }
  for (const v of sim.vehicles) {
    v.prevPos = v.pos;
    v.prevHeading = v.heading;
    remind(sim, v);
    if (v.state === 'idle' || v.state === 'done') continue;
    if (v.state === 'returning') {
      if (drive(v, dt)) {
        v.state = 'idle';
        v.path = null;
        v.speed = 0;
      }
      continue;
    }
    const ac = sim.find(v.aircraft);
    if (!ac || ac.followMe?.vehicle !== v.callsign || !ac.path || ac.phase !== 'taxi') {
      // The aircraft no longer needs the follow-me (other instruction, parked, gone).
      if (ac?.followMe?.vehicle === v.callsign) ac.followMe = undefined;
      finish(sim, v);
      continue;
    }
    if (v.state === 'assigned') continue;
    if (v.state === 'toAircraft') {
      if (drive(v, dt) || !v.path) {
        v.state = 'leading';
        ac.followMe.leading = !v.holding;
        // Where on the aircraft's path the car waits: the meeting point (it waits there until the aircraft is close).
        const meet = meetingNode(ac);
        v.leadS = (meet && ac.path.marker(meet.id)?.s) ?? ac.s + leadDistance(ac);
      }
      continue;
    }
    // Leading: stay ahead of the aircraft on its path (it stops while the car holds); peel off before the stand.
    ac.followMe.leading = !v.holding;
    const lead = leadDistance(ac);
    if (!v.holding && ac.path.length - ac.s < lead + 25) {
      finish(sim, v);
      continue;
    }
    // The car drives along the aircraft's path towards its lead position - smoothly, never backwards.
    const ahead = Math.min(ac.s + lead, ac.path.length);
    const at = v.leadS ?? ahead;
    v.speed = approachSpeed(v, v.holding ? 0 : Math.max(ac.speed + 2, 3), v.holding ? 0 : Math.max(0, ahead - at), dt);
    v.leadS = Math.min(ac.path.length, at + v.speed * dt);
    v.pos = ac.path.pointAt(v.leadS);
    steer(v, ac.path.headingAt(v.leadS), dt);
  }
}

/** "Report position": where the car is and what it is doing. */
function vehiclePosition(sim: Simulation, v: Vehicle): string {
  if (v.state === 'idle') return 'at the base';
  const ac = sim.find(v.aircraft);
  let best: { name: string; d: number } | undefined;
  for (const e of sim.airport.edges) {
    if (!e.name || !sim.airport.taxiwayNames.has(e.name.toUpperCase())) continue;
    const d = projectOnSegment(v.pos, e.from.pos, e.to.pos).dist;
    if (!best || d < best.d) best = { name: e.name, d };
  }
  const where = best && best.d < 60 ? `on taxiway ${best.name.toUpperCase()}` : 'on the apron';
  const doing =
    v.holding ? ', holding position'
    : v.state === 'leading' && ac ? `, leading ${sim.tel(ac)}`
    : v.state === 'toAircraft' && ac ? `, proceeding to ${sim.tel(ac)}`
    : v.state === 'returning' ? ', returning to base'
    : '';
  return `${where}${doing}`;
}

/** Reminders like a pilot's: every 60-89 s, up to five calls. */
function remind(sim: Simulation, v: Vehicle): void {
  if (!v.request || aiGround(sim)) return;
  const interval = 60 + (v.callsign.charCodeAt(v.callsign.length - 1) % 30);
  if (sim.time - v.lastCallAt < interval || v.callCount >= 5 || sim.frequency.hasQueued(v.callsign)) return;
  const ac = sim.find(v.aircraft);
  const text =
    v.request === 'proceed' && ac
      ? `${sim.station.name}, ${vehicleTel(v)}, request proceed to ${sim.tel(ac)}`
      : `${sim.station.name}, ${vehicleTel(v)}, request return to base`;
  vehicleCall(sim, v, v.request, text);
}

/**
 * A controller transmission to a vehicle: "Follow-me 1, proceed to DCEEO via N, F",
 * "... hold position", "... continue", "... return to base".
 */
export function executeVehicleTransmission(sim: Simulation, v: Vehicle, parsed: ParsedTransmission, raw: string): TransmitResult {
  const canonical = parsed.commands.length && parsed.unparsed.length === 0 ? `${vehicleTel(v)}, ${parsed.commands.map(formatCommand).join(', ')}` : raw;
  sim.frequency.controllerTransmit(sim.time, canonical, v.callsign);
  if (!sim.userControls(sim.stationFor('ground'))) return { ok: false, callsign: v.callsign, hint: `${v.name} is on Ground frequency.` };
  sim.frequency.cancel(v.callsign);
  if (!parsed.commands.length) {
    vehicleReadback(sim, v, `Say again, ${vehicleTel(v)}?`);
    return { ok: false, callsign: v.callsign, hint: 'Instruction not understood.' };
  }
  const parts: string[] = [];
  let ok = true;
  const unable = (t: string) => {
    parts.push(t);
    ok = false;
  };
  for (const c of parsed.commands) {
    switch (c.type) {
      case 'proceed': {
        const back = c.base || v.state === 'done';
        if (back) {
          if (v.state === 'idle') {
            unable('we are at the base');
            break;
          }
          const err = startReturn(sim, v, c.via);
          if (err) unable(`unable, ${err}, say again route`);
          else {
            parts.push(`proceeding to base${c.via.length ? ` via ${c.via.join(', ')}` : ''}`);
            v.request = undefined;
          }
          break;
        }
        const ac = sim.find(v.aircraft);
        if (!ac || v.state === 'idle') {
          unable('negative, we have no job, say again');
          break;
        }
        if (c.target && c.target !== ac.callsign) {
          unable(`negative, we are assigned to ${sim.tel(ac)}`);
          break;
        }
        if (v.state === 'assigned' || c.via.length) {
          const err = startToAircraft(sim, v, c.via);
          if (err) {
            unable(`unable, ${err}, say again route`);
            break;
          }
        }
        v.holding = false;
        v.request = undefined;
        parts.push(`proceeding to ${sim.tel(ac)}${c.via.length ? ` via ${c.via.join(', ')}` : ''}`);
        break;
      }
      case 'returnToBase': {
        if (v.state === 'idle') {
          unable('we are at the base');
          break;
        }
        startReturn(sim, v);
        v.request = undefined;
        parts.push('returning to base');
        break;
      }
      case 'holdPosition':
        v.holding = true;
        parts.push('holding position');
        break;
      case 'continue':
        v.holding = false;
        parts.push('continuing');
        break;
      case 'standby':
        v.lastCallAt = sim.time + 60;
        break;
      case 'reportPosition':
        parts.push(vehiclePosition(sim, v));
        break;
      default:
        unable(`unable, ${formatCommand(c)}`);
    }
  }
  if (parts.length) vehicleReadback(sim, v, `${capitalize(parts.join(', '))}, ${vehicleTel(v)}`);
  return { ok, callsign: v.callsign };
}
