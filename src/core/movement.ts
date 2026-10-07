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

    for (let d = 4; d <= look && !best; d += 5) {
      const p = a.path.pointAt(a.s + d);
      for (const b of ground) {
        if (b === a) continue;
        const r = (a.type.wingspanM + b.type.wingspanM) * 0.38 + 6;
        let hit = distance(p, b.pos) < r;
        if (!hit && b.speed > 1 && b.phase !== 'pushback') {
          const v = headingVector(b.heading);
          const pred = { x: b.pos.x + v.x * b.speed * 4, y: b.pos.y + v.y * b.speed * 4 };
          hit = distance(p, pred) < r && dot(sub(b.pos, a.pos), headingVector(a.heading)) > -10;
        }
        if (hit) {
          const margin = Math.max(5, (a.type.lengthM + b.type.lengthM) / 2 + 12 - r);
          best = { by: b, dist: Math.max(0, d - margin) };
          break;
        }
      }
    }
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
