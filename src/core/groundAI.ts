import type { Aircraft } from './aircraft';
import { headOnPartner, resolveOptions } from './conflicts';
import { parseTransmission } from './phraseology/parser';
import { aiInstruct } from './pilot';
import type { Simulation } from './simulation';

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
    if (ac.category === 'departure') departure(sim, ac);
    else if (ac.category === 'tow') tow(sim, ac);
    else arrival(sim, ac);
    resolve(sim, ac);
  }
}

function busyNearby(sim: Simulation, ac: Aircraft, radius: number): boolean {
  return sim.aircraft.some((o) => o !== ac && o.onGround && ['taxi', 'pushback'].includes(o.phase) && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < radius);
}

function departure(sim: Simulation, ac: Aircraft): void {
  if (ac.phase === 'parked' && sim.time >= ac.readyAt && ac.cleared) {
    if (busyNearby(sim, ac, 250)) return; // the simplest pushback sequencing: wait for passing traffic
    const stand = sim.airport.stand(ac.stand ?? '');
    if (stand && !stand.pushback) aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'runway', runway: sim.runway }, via: [], holdShort: [], cross: [] });
    else aiInstruct(sim, ac, { type: 'pushback', startup: true });
    return;
  }
  if (ac.phase === 'startup' && sim.time >= ac.timerUntil && !ac.pendingTaxi) {
    aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'runway', runway: sim.runway }, via: [], holdShort: [], cross: [] });
    return;
  }
  if (ac.phase === 'holding') {
    ac.frequency = sim.stationFor('tower');
    ac.request = null;
  }
}

/** Tows: approved when no other traffic moves nearby. */
function tow(sim: Simulation, ac: Aircraft): void {
  if (ac.phase !== 'parked' || !ac.tow || sim.time < ac.readyAt || busyNearby(sim, ac, 250)) return;
  aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'stand', stand: ac.tow.to }, via: [], holdShort: [], cross: [], tow: true });
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
  if (!ac.blockedBy || ac.blockedSince === undefined || sim.time - ac.blockedSince < 40) return;
  const other = headOnPartner(sim, ac);
  if (!other) return;
  // Resolve each conflict once: not again while a tug is coming or right after the last instruction.
  const recent = (a: Aircraft) => (a.tugUntil ?? 0) > sim.time || sim.time - (a.resolvedAt ?? -Infinity) < RESOLVE_AGAIN_S;
  if (recent(ac) || recent(other)) return;
  const opt = resolveOptions(sim, ac, other)[0];
  if (!opt) return;
  const cmd = parseTransmission(opt.instruction, { callsigns: [], taxiways: sim.airport.taxiwayNames }).commands[0];
  if (cmd && aiInstruct(sim, opt.aircraft, cmd)) ac.resolvedAt = other.resolvedAt = sim.time;
}
