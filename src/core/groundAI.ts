import type { Aircraft } from './aircraft';
import { blockCycle, headOnPartner, resolveOptions } from './conflicts';
import { CTOT_EARLY_S } from './delivery';
import type { TaxiDestination } from './phraseology/commands';
import { parseTransmission } from './phraseology/parser';
import { aiInstruct, previewTaxi } from './pilot';
import type { TaxiRoute } from './airport/routing';
import type { Simulation } from './simulation';
import { apronClosed } from './weather';
import { needsCurfewRoute, sendBackToStand } from './night';
import { freePads, needsDeicing } from './deicing';

/**
 * AI Ground controller, active when the user does not staff Ground (for
 * example when working Delivery alone). It approves pushbacks in a simple
 * sequence, taxis departures to the runway along the standard routes, hands
 * them to Tower at the holding point, taxis arrivals to their stands and
 * resolves head-on conflicts by re-routing. Nothing is said on the user's
 * frequency.
 */
export function updateGroundAI(sim: Simulation): void {
  const ground = sim.stationFor('ground');
  if (sim.userControls(ground)) return;
  for (const ac of sim.aircraft) {
    if (ac.frequency !== ground || !ac.onGround) continue;
    // Runway crossings are Tower's: hand the aircraft over at the runway holding point.
    if (sim.userTower && ac.stoppedAt?.kind === 'runway' && ac.speed < 0.1) {
      ac.frequency = sim.stationFor('tower');
      ac.request = null;
      continue;
    }
    // Both run by the simulator: Ground lets the aircraft cross when the AI Tower's runway is free.
    if (!sim.userTower && ac.stoppedAt?.kind === 'runway' && ac.speed < 0.1 && !sim.tower.runwayBusy() && sim.tower.nextArrivalEta() > 90) {
      aiInstruct(sim, ac, { type: 'cross', runway: sim.runway });
      continue;
    }
    if (ac.category === 'departure') departure(sim, ac);
    else if (ac.category === 'tow') tow(sim, ac);
    else arrival(sim, ac);
    resolve(sim, ac);
  }
}

function busyNearby(sim: Simulation, ac: Aircraft, radius: number): boolean {
  return sim.aircraft.some((o) => o !== ac && o.onGround && ['taxi', 'pushback'].includes(o.phase) && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < radius);
}

/** Where a departure taxis next: to a free de-icing pad first if it still needs de-icing (winter operations). */
function outbound(sim: Simulation, ac: Aircraft): TaxiDestination {
  return needsDeicing(sim, ac) ? { kind: 'deicing' } : { kind: 'runway', runway: sim.runway };
}

function departure(sim: Simulation, ac: Aircraft): void {
  // Tower asked to hold all departures, or lightning stopped the ground handling: no pushbacks (aircraft already moving continue).
  if (ac.phase === 'parked' && (sim.flow.departuresStopped || apronClosed(sim))) return;
  if (ac.phase === 'parked' && sim.time >= ac.readyAt && ac.cleared) {
    if (busyNearby(sim, ac, 250)) return; // the simplest pushback sequencing: wait for passing traffic
    if (needsDeicing(sim, ac) && !freePads(sim, ac).length) return; // all de-icing pads busy: stay on the stand
    if (headOnAhead(sim, ac)) return; // an arrival comes the other way on the taxiways out (single-lane taxiways)
    const stand = sim.airport.stand(ac.stand ?? '');
    if (stand && !stand.pushback) aiInstruct(sim, ac, { type: 'taxi', destination: outbound(sim, ac), via: [], holdShort: [], cross: [] });
    else aiInstruct(sim, ac, { type: 'pushback', startup: true });
    return;
  }
  if (ac.phase === 'startup' && sim.time >= ac.timerUntil && !ac.pendingTaxi) {
    if (headOnAhead(sim, ac) && sim.time - ac.timerUntil < HEAD_ON_WAIT_MAX_S) return;
    // Night curfew missed during the pushback: back onto a stand instead of to the runway.
    const destination: TaxiDestination = ac.returnToStand && ac.assignedStand ? { kind: 'stand', stand: ac.assignedStand } : outbound(sim, ac);
    aiInstruct(sim, ac, { type: 'taxi', destination, via: [], holdShort: [], cross: [] });
    return;
  }
  // Night curfew missed: back to a stand, not on to the runway.
  if (needsCurfewRoute(ac)) {
    sendBackToStand(sim, ac);
    return;
  }
  // De-iced on the pad: on to the runway - metered, so the queue to the runway does not fill the taxiways.
  if (ac.phase === 'taxi' && ac.deicing === 'done' && ac.routeDestination?.kind === 'deicing' && ac.stoppedAt) {
    if (runwayQueueFull(sim)) return;
    aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'runway', runway: sim.runway }, via: [], holdShort: [], cross: [] });
    return;
  }
  if (ac.phase === 'holding' || readyForTower(sim, ac)) {
    ac.frequency = sim.stationFor('tower');
    ac.request = null;
    return;
  }
  // Back from Tower without a route (e.g. after a rejected take-off): taxi to the runway, or to a stand.
  if (ac.phase === 'taxi' && !ac.route && (!ac.path || ac.stoppedAt)) {
    if (ac.returnToStand) {
      const stand = ac.assignedStand ?? sim.freeStands(ac.type.wingspanM, undefined, ac)[0]?.id;
      if (stand) aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'stand', stand }, via: [], holdShort: [], cross: [] });
    } else aiInstruct(sim, ac, { type: 'taxi', destination: outbound(sim, ac), via: [], holdShort: [], cross: [] });
  }
}

/** The AI Ground releases a de-iced aircraft from its pad only while fewer departures than this taxi to the runway. */
const PAD_RELEASE_TAXIING = 3;

/** True when enough departures are already on the way to the runway (they would fill the taxiways). */
function runwayQueueFull(sim: Simulation): boolean {
  return sim.aircraft.filter((o) => o.category === 'departure' && o.phase === 'taxi' && o.routeDestination?.kind === 'holdingPoint').length >= PAD_RELEASE_TAXIING;
}

/** Longest time the AI Ground keeps a departure that has started up waiting for opposite traffic (seconds). */
const HEAD_ON_WAIT_MAX_S = 240;
/** Arrivals on final closer than this (seconds to the threshold) count as coming the other way on their exits. */
const ARRIVAL_LOOKAHEAD_S = 240;

/**
 * The departure's way out would meet traffic coming the other way on a taxiway: an aircraft taxiing or
 * vacating along one of its taxiway segments in the opposite direction, or an arrival about to land
 * whose exits run against it. Where taxiways are one-way by flow this never happens; on a single
 * taxiway between apron and runway (Memmingen N) Ground keeps the departure on its stand meanwhile.
 */
function headOnAhead(sim: Simulation, ac: Aircraft): boolean {
  const r = previewTaxi(sim, ac, { type: 'taxi', destination: outbound(sim, ac), via: [], holdShort: [], cross: [] });
  if ('error' in r) return false;
  const ours = directedTaxiwayPairs(sim, r.route);
  if (!ours.size) return false;
  const against = (ids: string[]) => ids.some((id, i) => i > 0 && ours.has(`${id}>${ids[i - 1]}`));
  for (const o of sim.aircraft) {
    if (o === ac) continue;
    if (o.onGround && o.path && ['taxi', 'landing', 'vacating'].includes(o.phase)) {
      if (against(o.path.markers.filter((m) => m.s >= o.s - 1).map((m) => m.id))) return true;
    } else if (o.phase === 'approach' && o.category === 'arrival') {
      const eta = sim.distanceToThresholdNm(o) * 1852 / Math.max(o.speed, 1);
      if (eta < ARRIVAL_LOOKAHEAD_S && sim.airport.exits(o.runway ?? sim.runway).some((x) => against(x.path))) return true;
    }
  }
  return false;
}

/** "a>b" for every taxiway / runway strip segment of a route (apron taxilanes and stand lines are two-way anyway). */
function directedTaxiwayPairs(sim: Simulation, route: TaxiRoute): Set<string> {
  const out = new Set<string>();
  route.edges.forEach((e, i) => {
    if (e.kind !== 'taxiway' && e.kind !== 'runwayStrip') return;
    out.add(`${route.nodes[i].id}>${route.nodes[i + 1].id}`);
  });
  void sim;
  return out;
}

/** Tows: approved when no other traffic moves nearby. */
function tow(sim: Simulation, ac: Aircraft): void {
  if (ac.phase !== 'parked' || !ac.tow || sim.time < ac.readyAt || busyNearby(sim, ac, 250) || apronClosed(sim)) return;
  aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'stand', stand: ac.tow.to }, via: [], holdShort: [], cross: [], tow: true });
}

/** Distance before the holding point from which Ground hands a departure to Tower (metres along the route; each flight differently). */
const HANDOFF_MIN_M = 700;
const HANDOFF_MAX_M = 1400;
/** A departure is only handed over early when its CTOT window opens within this time (seconds). */
const HANDOFF_SLOT_MARGIN_S = 120;

/**
 * Ground hands a departure to Tower before the holding point once there is
 * nothing left to coordinate on the ground: on the last stretch to the
 * holding point (and on one of the last two taxiways of the route), no runway crossing ahead, no conflict, and no other ground
 * traffic close by (except departures queuing for the same holding point),
 * and no slot (CTOT) to wait for.
 */
function readyForTower(sim: Simulation, ac: Aircraft): boolean {
  const dest = ac.routeDestination;
  if (ac.phase !== 'taxi' || dest?.kind !== 'holdingPoint' || !ac.path) return false;
  const from = HANDOFF_MIN_M + (HANDOFF_MAX_M - HANDOFF_MIN_M) * sim.variation(`${ac.callsign}:handoff`);
  if (ac.path.length - ac.s > from) return false;
  // Only on the last two taxiways of the route (EDDS runway 07: from L2 on, not yet on M).
  const twys = ac.route?.taxiways.filter((t) => sim.airport.taxiwayNames.has(t.toUpperCase())) ?? [];
  const here = sim.airport.nearestEdge(ac.pos)?.edge.name ?? '';
  if (twys.length > 2 && !twys.slice(-2).includes(here)) return false;
  // A departure that will have to wait for its slot stays with Ground until the holding point.
  if (ac.ctot !== undefined && sim.time + HANDOFF_SLOT_MARGIN_S < ac.ctot - CTOT_EARLY_S) return false;
  if (ac.stoppedAt?.kind === 'runway' || ac.stops.some((s) => s.kind === 'runway' || s.kind === 'holdShort')) return false;
  if (headOnPartner(sim, ac)) return false;
  return !sim.aircraft.some((o) => {
    if (o === ac || !o.onGround || !['taxi', 'pushback'].includes(o.phase)) return false;
    const queuing = o.category === 'departure' && o.routeDestination?.kind === 'holdingPoint' && o.routeDestination.name === dest.name;
    return !queuing && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 200;
  });
}

function arrival(sim: Simulation, ac: Aircraft): void {
  if (ac.phase !== 'taxi') return;
  const blocked = ac.standBlocked?.reported ? ac.standBlocked.stand : undefined;
  if (blocked) {
    // The crew found its stand occupied: give it another one.
    if (ac.assignedStand === blocked) ac.assignedStand = undefined;
  } else {
    if (ac.routeDestination?.kind === 'stand') return;
    if (!ac.stoppedAt && ac.path) return;
  }
  const stand = ac.assignedStand ?? sim.freeStands(ac.type.wingspanM, (s) => s.id !== blocked, ac)[0]?.id;
  if (stand) aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'stand', stand }, via: [], holdShort: [], cross: [] });
}

/** Time after a resolution before the AI Ground resolves a conflict of the same aircraft again (seconds). */
const RESOLVE_AGAIN_S = 120;

/** Head-on: re-route one of the two (as a real Ground controller would). */
function resolve(sim: Simulation, ac: Aircraft): void {
  // Stopped for opposite traffic at a junction (the crew asks), or stuck behind traffic for 40 s.
  const waitingOpposite = !!ac.oppositeStop && ac.speed < 0.1 && sim.time - ac.oppositeStop.since > 20;
  if (!waitingOpposite && (!ac.blockedBy || ac.blockedSince === undefined || sim.time - ac.blockedSince < 40)) return;
  const other = headOnPartner(sim, ac);
  if (!other) return;
  // Resolve each conflict once: not again while a tug is coming or right after the last instruction.
  const recent = (a: Aircraft) => (a.tugUntil ?? 0) > sim.time || sim.time - (a.resolvedAt ?? -Infinity) < RESOLVE_AGAIN_S;
  if (recent(ac) || recent(other)) return;
  // A circle of aircraft waiting for each other with a pushback in it: the tug pulls that one back onto its stand.
  const pusher = blockCycle(sim, ac)?.find((a) => a.phase === 'pushback' && !a.towingIn);
  if (pusher) {
    if (aiInstruct(sim, pusher, { type: 'cancelPushback' })) ac.resolvedAt = other.resolvedAt = pusher.resolvedAt = sim.time;
    return;
  }
  // The AI Ground never sends an aircraft across the runway to get out of a conflict.
  const opt = resolveOptions(sim, ac, other).find((o) => !o.crossesRunway);
  if (!opt) return;
  const cmd = parseTransmission(opt.instruction, { callsigns: [], taxiways: sim.airport.taxiwayNames }).commands[0];
  if (cmd && aiInstruct(sim, opt.aircraft, cmd)) ac.resolvedAt = other.resolvedAt = sim.time;
}
