import { nextStop, noseHeading, type Aircraft } from './aircraft';
import { KT_TO_MS, distance, dot, headingVector, sub } from './geo';
import { onStopReached } from './pilot';
import type { Simulation } from './simulation';

/** Phases in which an aircraft follows its path on the ground. */
const PATH_PHASES = new Set(['pushback', 'taxi', 'vacating', 'landing', 'lineup']);

const ACCEL = 0.6; // m/s^2 taxi acceleration
const BRAKE = 1.0; // m/s^2 comfortable braking used to plan stops
const MAX_DECEL = 2.5; // m/s^2 hardest braking
const PUSH_SPEED = 1.3; // m/s (~2.5 kt)

function turnSpeedLimit(turnDeg: number): number {
  if (turnDeg > 70) return 7 * KT_TO_MS;
  if (turnDeg > 35) return 11 * KT_TO_MS;
  if (turnDeg > 15) return 14 * KT_TO_MS;
  return Infinity;
}

/** Advances an aircraft along its path, respecting stops, turns and traffic. */
export function updateMovement(sim: Simulation, ac: Aircraft, dt: number): void {
  if (!ac.onGround || !ac.path || !PATH_PHASES.has(ac.phase)) return;
  if (ac.phase === 'pushback' && sim.time < ac.timerUntil) return; // tug not connected yet
  if (ac.tugUntil !== undefined) {
    if (sim.time < ac.tugUntil) {
      ac.speed = 0;
      return; // waiting for the tug that turns the aircraft around
    }
    ac.tugUntil = undefined;
  }
  if (ac.incident === 'collision') {
    ac.speed = 0;
    return;
  }

  const path = ac.path;
  let vTarget: number;
  if (ac.phase === 'pushback') {
    vTarget = PUSH_SPEED;
  } else {
    vTarget = (ac.type.taxiSpeedKt + (ac.expedite ? 5 : 0)) * KT_TO_MS;
    if (ac.speedLimit) vTarget = ac.speedLimit(ac.s);
    vTarget = Math.min(vTarget, turnSpeedLimit(path.maxTurnAhead(ac.s, 25 + ac.speed * 3)));
  }

  // Stops ahead (holding points, hold-short, destination) and the path end.
  const stop = nextStop(ac);
  const stopS = Math.min(stop ? stop.s : path.length, path.length);
  const toStop = stopS - ac.s;
  vTarget = Math.min(vTarget, Math.sqrt(2 * BRAKE * Math.max(0, toStop - 0.2)));

  // Hard holds
  if (ac.stoppedAt || ac.holdPosition || ac.giveWayTo) vTarget = 0;

  // Traffic ahead
  if (ac.blockDistance !== undefined) {
    vTarget = Math.min(vTarget, Math.sqrt(2 * 1.2 * Math.max(0, ac.blockDistance)));
  }

  // Integrate speed
  if (ac.speed < vTarget) ac.speed = Math.min(vTarget, ac.speed + ACCEL * dt);
  else ac.speed = Math.max(vTarget, ac.speed - MAX_DECEL * dt);
  if (ac.speed < 0.05 && vTarget === 0) ac.speed = 0;

  ac.s = Math.min(path.length, ac.s + ac.speed * dt);
  ac.pos = path.pointAt(ac.s);
  if (path.length > 0.5) ac.heading = noseHeading(path.headingAt(ac.s), ac.reverse);

  // Stop reached?
  if (!ac.stoppedAt && toStop - ac.speed * dt <= 0.6 && ac.speed < 1.5) {
    if (stop) {
      ac.s = Math.max(ac.s, Math.min(stop.s, path.length));
      ac.pos = path.pointAt(ac.s);
      ac.speed = 0;
      ac.stoppedAt = stop;
      ac.stops = ac.stops.filter((st) => st !== stop);
      onStopReached(sim, ac, stop);
    } else if (ac.s >= path.length - 0.6) {
      ac.speed = 0;
      const end = { s: path.length, kind: 'destination' as const, target: 'end' };
      ac.stoppedAt = end;
      onStopReached(sim, ac, end);
    }
  }
}

/**
 * Pilot "see and avoid": every aircraft looks along its own path and slows
 * down / stops behind traffic. Mutual conflicts (two aircraft converging on
 * the same point) are resolved by letting the one closer to the conflict go
 * first.
 */
export function updateSeparation(sim: Simulation): void {
  const ground = sim.aircraft.filter((a) => a.onGround && a.phase !== 'gone');
  const blocks = new Map<Aircraft, { by: Aircraft; dist: number }>();

  for (const a of ground) {
    a.blockDistance = undefined;
    if (!a.path || !PATH_PHASES.has(a.phase)) continue;
    const remaining = a.path.length - a.s;
    if (remaining < 1) continue;
    const look = Math.min(remaining, (a.speed * a.speed) / (2 * 1.2) + 55 + a.type.lengthM);
    let best: { by: Aircraft; dist: number } | undefined;

    // Direction of travel (the path direction; for a pushback that is tail first).
    const moveDir = headingVector(a.path.headingAt(a.s));
    for (let d = 4; d <= look && !best; d += 5) {
      const p = a.path.pointAt(a.s + d);
      for (const b of ground) {
        if (b === a) continue;
        // Traffic behind or beside us doesn't block: moving on increases the distance.
        if (dot(sub(b.pos, a.pos), moveDir) < 0) continue;
        const r = (a.type.wingspanM + b.type.wingspanM) * 0.38 + 6;
        let hit = distance(p, b.pos) < r;
        if (!hit && b.speed > 1 && b.phase !== 'pushback') {
          const v = headingVector(b.heading);
          const pred = { x: b.pos.x + v.x * b.speed * 4, y: b.pos.y + v.y * b.speed * 4 };
          hit = distance(p, pred) < r;
        }
        if (hit) {
          const margin = Math.max(5, (a.type.lengthM + b.type.lengthM) / 2 + 12 - r);
          best = { by: b, dist: Math.max(0, d - margin) };
          break;
        }
      }
    }
    const crossing = crossingConflict(sim, a, ground, look);
    if (crossing) yielding.set(a, crossing.by.callsign);
    else yielding.delete(a);
    if (crossing && (!best || crossing.dist < best.dist)) best = crossing;
    if (best) blocks.set(a, best);
  }

  // Resolve mutual blocks.
  for (const [a, ba] of blocks) {
    const bb = blocks.get(ba.by);
    if (bb && bb.by === a) {
      const aMoving = a.speed > 0.3;
      const bMoving = ba.by.speed > 0.3;
      if (!aMoving && !bMoving) continue; // real deadlock - both stay put
      // the one further away from the conflict yields
      if (ba.dist < bb.dist) blocks.delete(a);
    }
  }

  for (const a of ground) {
    const blk = blocks.get(a);
    if (blk) {
      a.blockDistance = blk.dist;
      if (a.blockedBy !== blk.by.callsign) {
        a.blockedBy = blk.by.callsign;
        a.blockedSince = sim.time;
      }
    } else {
      a.blockedBy = undefined;
      a.blockedSince = undefined;
    }
  }
}

const collided = new WeakMap<Aircraft, Set<string>>();

/** Detects aircraft that overlap on the ground. */
export function detectCollisions(sim: Simulation): void {
  const ground = sim.aircraft.filter((a) => a.onGround && a.phase !== 'gone');
  for (let i = 0; i < ground.length; i++) {
    for (let j = i + 1; j < ground.length; j++) {
      const a = ground[i];
      const b = ground[j];
      if (a.speed < 0.2 && b.speed < 0.2) continue;
      const lim = (a.type.wingspanM + b.type.wingspanM) * 0.25;
      if (distance(a.pos, b.pos) >= lim) continue;
      const seen = collided.get(a) ?? new Set<string>();
      if (seen.has(b.callsign)) continue;
      seen.add(b.callsign);
      collided.set(a, seen);
      a.incident = 'collision';
      b.incident = 'collision';
      a.speed = 0;
      b.speed = 0;
      sim.incident('collision', `COLLISION between ${a.callsign} and ${b.callsign}!`, [a.callsign, b.callsign]);
    }
  }
}

/** True if the aircraft intends to move along its path (not holding, not stopped at a stop). */
function intendsToMove(sim: Simulation, b: Aircraft): boolean {
  if (!b.path || !PATH_PHASES.has(b.phase) || b.phase === 'landing') return false;
  if (b.stoppedAt || b.holdPosition || b.giveWayTo || b.incident) return false;
  if (b.phase === 'pushback' && sim.time < b.timerUntil) return false;
  return b.path.length - b.s > 1;
}

/**
 * Intersection rule: if our path crosses or joins (at 20 degrees or more) the
 * path another aircraft is about to use, the one that would arrive at the
 * conflict point later waits *before* entering the other one's lane, keeping
 * wingtip clearance. In-trail traffic is handled by the position check.
 */
/** Crossing priority decisions: aircraft -> callsign of the traffic it currently yields to. */
const yielding = new WeakMap<Aircraft, string>();

function crossingConflict(sim: Simulation, a: Aircraft, ground: Aircraft[], look: number): { by: Aircraft; dist: number } | undefined {
  const path = a.path!;
  let best: { by: Aircraft; dist: number } | undefined;
  for (const b of ground) {
    if (b === a || !intendsToMove(sim, b) || distance(a.pos, b.pos) > 600) continue;
    const bp = b.path!;
    const r = (a.type.wingspanM + b.type.wingspanM) * 0.38 + 6;
    const bLook = Math.min(bp.length - b.s, 150);
    // Traffic whose path runs through our current position is behind us in the same lane: it follows us.
    let follower = false;
    for (let dB = 0; dB <= bLook && !follower; dB += 6) follower = distance(bp.pointAt(b.s + dB), a.pos) < r * 0.6;
    if (follower) continue;
    let found: { dA: number; dB: number } | undefined;
    for (let dA = 4; dA <= look && !found; dA += 5) {
      const pa = path.pointAt(a.s + dA);
      for (let dB = 0; dB <= bLook; dB += 6) {
        if (distance(pa, bp.pointAt(b.s + dB)) >= r) continue;
        // In-trail traffic (same direction on the same line) is followed, not yielded to.
        const angle = Math.abs(((path.headingAt(a.s + dA) - bp.headingAt(b.s + dB) + 540) % 360) - 180);
        if (angle < 20) break;
        found = { dA, dB };
        break;
      }
    }
    if (!found) continue;
    // Priority: a decision, once made, is kept until the conflict is over (no flip-flopping as speeds change).
    let aYields: boolean;
    if (yielding.get(a) === b.callsign) aYields = true;
    else if (yielding.get(b) === a.callsign) aYields = false;
    else {
      const tA = found.dA / Math.max(a.speed, 2);
      const tB = found.dB / Math.max(b.speed, 2);
      aYields = tA > tB || (tA === tB && a.callsign > b.callsign);
    }
    if (!aYields) continue;
    const dist = Math.max(0, found.dA - (a.type.lengthM / 2 + 10));
    if (!best || dist < best.dist) best = { by: b, dist };
  }
  return best;
}
