import type { Aircraft } from './aircraft';
import type { TaxiNode } from './airport/airport';
import { distance, headingDiff } from './geo';
import { call } from './pilot';
import type { Simulation } from './simulation';

/**
 * Pilots who see opposite traffic on the same taxiway in time do what real
 * crews do: both stop short of the last junction between them - keeping the
 * junction free, so that one of them can turn off there - and ask Ground for
 * instructions. Without this they would meet nose to nose, and only a tug
 * could separate them.
 */

/** How far ahead along the route a crew looks for opposite traffic (metres). */
const LOOK_AHEAD_M = 800;
/** Closer than this the normal see-and-avoid takes over (metres between the aircraft). */
const MIN_GAP_M = 110;
/** Clearance kept from the junction (metres from the nose). */
const JUNCTION_CLEARANCE_M = 15;
const SAMPLE_M = 6;

function lane(a: Aircraft, b: Aircraft): number {
  return (a.type.wingspanM + b.type.wingspanM) * 0.38 + 6;
}

/** Distance along `a`'s path to the point where `b` stands, if `b` stands on it ahead (within `look`). */
function onPathAhead(a: Aircraft, b: Aircraft, look: number): number | undefined {
  const path = a.path!;
  const end = Math.min(path.length, a.s + look);
  const r = lane(a, b);
  for (let s = a.s + SAMPLE_M; s <= end; s += SAMPLE_M) if (distance(path.pointAt(s), b.pos) < r) return s - a.s;
  return undefined;
}

function candidate(ac: Aircraft): boolean {
  return ac.onGround && ac.phase === 'taxi' && !!ac.path && !!ac.route && !ac.stoppedAt && !ac.holdPosition && !ac.giveWayTo && ac.category !== 'tow';
}

/** Distance from the junction at which a crew stops: far enough for the other to turn off there with wingtip clearance. */
function holdBack(ac: Aircraft, other: Aircraft): number {
  return Math.max(ac.type.lengthM / 2, lane(ac, other) + 10) + JUNCTION_CLEARANCE_M;
}

/** Braking distance at the current speed plus the hold-back distance (metres). */
function stopNeed(ac: Aircraft, other: Aircraft): number {
  return (ac.speed * ac.speed) / 2 + holdBack(ac, other);
}

/** Junctions (nodes where three or more taxiway segments meet) on `a`'s route between the two aircraft. */
function junctionBetween(sim: Simulation, a: Aircraft, b: Aircraft, gap: number): { node: TaxiNode; sA: number; sB: number } | undefined {
  let best: { node: TaxiNode; sA: number; sB: number; margin: number } | undefined;
  for (const n of a.route!.nodes) {
    if (n.edges.length < 3) continue;
    const mA = a.path!.marker(n.id);
    const mB = b.path!.marker(n.id);
    if (!mA || !mB) continue;
    const toA = mA.s - a.s;
    const toB = mB.s - b.s;
    if (toA <= 0 || toA >= gap || toB <= 0) continue;
    const margin = Math.min(toA - stopNeed(a, b), toB - stopNeed(b, a));
    if (margin < 5) continue;
    if (!best || margin > best.margin) best = { node: n, sA: mA.s, sB: mB.s, margin };
  }
  void sim;
  return best;
}

function holdFor(sim: Simulation, ac: Aircraft, other: Aircraft, node: TaxiNode, sJ: number): void {
  const here = sim.airport.nearestEdge(ac.pos)?.edge.name ?? '';
  const branch = sim.airport.namesAt(node).find((t) => t && t !== here && sim.airport.taxiwayNames.has(t.toUpperCase())) ?? here;
  ac.oppositeStop = { s: sJ - holdBack(ac, other), path: ac.path!, other: other.callsign, junction: branch, taxiway: here, since: sim.time };
}

/** Called every 2 s: detects opposite traffic, makes the crews stop and call, and releases them when it is over. */
export function updateOppositeTraffic(sim: Simulation): void {
  // Release: the other aircraft is gone, re-routed, or no longer in our way.
  for (const ac of sim.aircraft) {
    const st = ac.oppositeStop;
    if (!st) continue;
    const other = sim.find(st.other);
    const still = other && ac.path === st.path && other.path && ac.phase === 'taxi' && other.phase === 'taxi' && onPathAhead(ac, other, LOOK_AHEAD_M) !== undefined && onPathAhead(other, ac, LOOK_AHEAD_M) !== undefined;
    if (still) {
      // Stopped: tell Ground once (not if the other one has already been given a way out).
      const otherWaits = other!.oppositeStop?.other === ac.callsign && other!.oppositeStop.path === other!.path;
      // The other one got its way out while our call was still waiting for a gap on the frequency: drop it.
      if (st.called && !otherWaits && ac.request !== 'blocked') sim.frequency.cancel(ac.callsign);
      if (!st.called && otherWaits && ac.speed < 0.1 && st.s - ac.s < 3) {
        st.called = true;
        if (sim.isOnMyFrequency(ac)) {
          call(sim, ac, 'blocked', `${sim.tel(ac)}, opposite traffic on taxiway ${st.taxiway.toUpperCase()}, ${sim.tel(other!)}, holding short of ${st.junction.toUpperCase()}, request instructions`);
        }
      }
      continue;
    }
    ac.oppositeStop = undefined;
    if (ac.request === 'blocked') ac.request = null;
  }
  // Detection.
  const list = sim.aircraft.filter(candidate);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.oppositeStop) continue;
    for (let j = 0; j < list.length; j++) {
      const b = list[j];
      if (b === a || b.oppositeStop || distance(a.pos, b.pos) > LOOK_AHEAD_M + 50) continue;
      const gap = onPathAhead(a, b, LOOK_AHEAD_M);
      if (gap === undefined || gap < MIN_GAP_M) continue;
      // Really opposite: b heads towards us on our lane, and we stand on b's path ahead.
      if (Math.abs(headingDiff(a.path!.headingAt(a.s + gap), b.heading)) < 135) continue;
      if (onPathAhead(b, a, LOOK_AHEAD_M) === undefined) continue;
      const j1 = junctionBetween(sim, a, b, gap);
      if (!j1) continue;
      holdFor(sim, a, b, j1.node, j1.sA);
      holdFor(sim, b, a, j1.node, j1.sB);
      break;
    }
  }
}
