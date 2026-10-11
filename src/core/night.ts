import type { AircraftType } from '../data/aircraftTypes';
import type { Aircraft } from './aircraft';
import type { NightRestrictions } from './airport/types';
import { CLEARANCE_LEAD_S, hhmm } from './delivery';
import { aiInstruct, call } from './pilot';
import type { Simulation } from './simulation';
import { inDailyWindow, minutesToHhmm } from './time';

/**
 * Night flying restrictions (scenario option "N"). Times are local airport
 * time (`sim.localMinutes()`); the airport data defines the windows. Stuttgart:
 * no jet departures 23:00-06:00, no landings 23:30-06:00, delayed landings
 * (scheduled before 23:30) until 24:00.
 *
 * - Traffic generation plans around the curfew: no jet is generated that
 *   could not be airborne before it, the morning wave is ready for 06:00,
 *   only delayed arrivals land after the landing curfew.
 * - Jets still on the ground when the departure curfew starts cannot leave:
 *   those on their stand are postponed to the morning, the others ask to
 *   taxi back to the stand. Crews refuse a take-off clearance in the curfew.
 * - A jet that was ready in time but missed the curfew costs points.
 */

/** Planned time from a departure's ready time (TOBT) to take-off (seconds), for the curfew planning. */
export const NIGHT_TAXI_ESTIMATE_S = 20 * 60;
/** Time from a new arrival appearing on final (12 NM) to touchdown, roughly (seconds). */
export const NIGHT_APPROACH_ESTIMATE_S = 5 * 60;
/** Share of the normal arrival rate that still comes as delayed flights after the landing curfew. */
export const DELAYED_ARRIVAL_SHARE = 0.35;
/** A departure ready this long before the curfew could have made it: missing it costs points (seconds). */
export const CURFEW_MARGIN_S = 15 * 60;
/** The morning departures become ready this long before the curfew ends (plus up to 10 minutes). */
const MORNING_READY_BEFORE_S = 10 * 60;

/** The night rules of the session, if the scenario applies them and the airport has any. */
export function nightRules(sim: Simulation): NightRestrictions | undefined {
  return sim.config.scenario?.nightRules ? sim.config.airport.nightRestrictions : undefined;
}

/** Jets (everything but turboprops) are subject to the departure curfew. */
export function isJet(type: AircraftType): boolean {
  return type.silhouette !== 'turboprop';
}

/** True if a jet may take off at simulation time `t`. */
export function jetDepartureAllowed(sim: Simulation, t = sim.time): boolean {
  const r = nightRules(sim);
  return !r || !inDailyWindow(sim.localMinutes(t), r.jetDepartures.from, r.jetDepartures.until);
}

/** True if this aircraft may take off now (night rules). */
export function departureAllowed(sim: Simulation, ac: Aircraft, t = sim.time): boolean {
  return !isJet(ac.type) || jetDepartureAllowed(sim, t);
}

/** Landings at simulation time `t`: open, only delayed flights, or closed. */
export function landingStatus(sim: Simulation, t = sim.time): 'open' | 'delayed' | 'closed' {
  const r = nightRules(sim);
  if (!r) return 'open';
  const m = sim.localMinutes(t);
  if (!inDailyWindow(m, r.landings.from, r.landings.until)) return 'open';
  if (r.delayedLandingsUntil !== undefined && inDailyWindow(m, r.landings.from, r.delayedLandingsUntil)) return 'delayed';
  return 'closed';
}

/** Seconds from simulation time `t` until the local clock next shows `minute` (0 if it does now). */
export function secondsUntilLocal(sim: Simulation, minute: number, t = sim.time): number {
  const now = sim.localMinutes(t);
  const diff = (((minute - now) % 1440) + 1440) % 1440;
  return diff * 60;
}

/** "2300 local (2100Z)" for a local minute of the day. */
export function localAndUtc(sim: Simulation, minute: number): string {
  const t = sim.time + secondsUntilLocal(sim, minute);
  return `${minutesToHhmm(minute)} local (${hhmm(sim, t)}Z)`;
}

/**
 * Ready time for a new departure under the night rules: unchanged if it can take off in time;
 * moved to the morning wave if the curfew ends within the next 75 minutes; undefined if no
 * departure is generated.
 */
export function plannedReadyIn(sim: Simulation, type: AircraftType, readyIn: number, key: string): number | undefined {
  const r = nightRules(sim);
  if (!r || !isJet(type) || jetDepartureAllowed(sim, sim.time + readyIn + NIGHT_TAXI_ESTIMATE_S)) return readyIn;
  const toEnd = secondsUntilLocal(sim, r.jetDepartures.until);
  if (toEnd > 75 * 60) return undefined;
  return Math.max(readyIn, toEnd - MORNING_READY_BEFORE_S + 10 * 60 * sim.variation(`${key}:morning`));
}

/** Per session: the local minute seen at the last check (to detect the curfew boundaries) and the next check time. */
interface NightState {
  lastMinute?: number;
  nextCheck: number;
}
const state = new WeakMap<Simulation, NightState>();

/** Periodic night-rule logic: announcements and jets that missed the departure curfew. */
export function updateNight(sim: Simulation): void {
  const r = nightRules(sim);
  if (!r) return;
  let st = state.get(sim);
  if (!st) {
    st = { nextCheck: 0 };
    state.set(sim, st);
    sim.system(
      `Night flying restrictions: no jet departures ${localAndUtc(sim, r.jetDepartures.from)} - ${minutesToHhmm(r.jetDepartures.until)} local, no landings from ${localAndUtc(sim, r.landings.from)}` +
        (r.delayedLandingsUntil !== undefined ? ` (delayed flights scheduled before ${minutesToHhmm(r.landings.from)} until ${minutesToHhmm(r.delayedLandingsUntil)} local)` : '') +
        '. Local time is shown next to UTC.',
    );
  }
  if (sim.time < st.nextCheck) return;
  st.nextCheck = sim.time + 5;
  const m = sim.localMinutes();
  const prev = st.lastMinute ?? m;
  st.lastMinute = m;
  const crossed = (b: number) => {
    const bb = b % 1440;
    return prev !== m && (prev < m ? prev < bb && bb <= m : prev < bb || bb <= m);
  };
  const warn = r.jetDepartures.from - 15;
  if (crossed(warn)) sim.system(`Night curfew in 15 minutes: jets must be airborne by ${localAndUtc(sim, r.jetDepartures.from)}. Departures that miss it go back to their stand.`, 'warning');
  if (crossed(r.jetDepartures.from)) sim.system(`Night curfew: no more jet departures until ${minutesToHhmm(r.jetDepartures.until)} local.`, 'warning');
  if (crossed(r.landings.from)) {
    sim.system(
      r.delayedLandingsUntil !== undefined
        ? `Landing curfew: only delayed flights (scheduled before ${minutesToHhmm(r.landings.from)} local) may land until ${minutesToHhmm(r.delayedLandingsUntil)} local.`
        : `Landing curfew: no landings until ${minutesToHhmm(r.landings.until)} local.`,
    );
  }
  if (r.delayedLandingsUntil !== undefined && crossed(r.delayedLandingsUntil)) sim.system(`The airport is closed for landings until ${minutesToHhmm(r.landings.until)} local.`);
  if (crossed(Math.min(r.jetDepartures.until, r.landings.until))) sim.system('Night flying restrictions end: departures and landings resume.');

  if (jetDepartureAllowed(sim)) return;
  const curfewStart = sim.time - (((m - r.jetDepartures.from) % 1440) + 1440) % 1440 * 60;
  for (const ac of sim.aircraft) {
    if (ac.category !== 'departure' || !ac.onGround || !isJet(ac.type) || ac.missedCurfew || ac.returnToStand) continue;
    if (!['parked', 'pushback', 'startup', 'taxi', 'holding'].includes(ac.phase)) continue;
    missCurfew(sim, ac, curfewStart);
  }
}

/** A jet still on the ground in the departure curfew: postponed (on its stand) or back to the stand. */
function missCurfew(sim: Simulation, ac: Aircraft, curfewStart: number): void {
  const r = nightRules(sim)!;
  ac.missedCurfew = true;
  // Ready in time but not airborne: that is on the controllers.
  const late = ac.readyAt <= curfewStart - CURFEW_MARGIN_S;
  if (late) {
    sim.stats.curfewMissed++;
    sim.updateScore();
  }
  if (ac.phase === 'parked') {
    // Not off-block yet: the flight is postponed to the morning wave.
    ac.readyAt = sim.time + secondsUntilLocal(sim, r.jetDepartures.until) - MORNING_READY_BEFORE_S + 10 * 60 * sim.variation(`${ac.callsign}:morning`);
    ac.clearanceAt = ac.readyAt - CLEARANCE_LEAD_S;
    ac.ctot = undefined;
    ac.tsat = undefined;
    ac.startupApproved = false;
    if (ac.request) {
      ac.request = null;
      sim.frequency.cancel(ac.callsign);
    }
    sim.system(`${ac.callsign} missed the night curfew and is postponed to the morning (new TOBT ${hhmm(sim, ac.readyAt)}Z).`, late ? 'warning' : 'system', ac.callsign);
    return;
  }
  ac.returnToStand = true;
  ac.lineUpCleared = ac.takeoffCleared = false;
  ac.assignedStand = sim.traffic.allocateStand(ac)?.id;
  ac.request = null;
  sim.frequency.cancel(ac.callsign);
  sim.system(`${ac.callsign} missed the night curfew and returns to the stand${ac.assignedStand ? ` (stand ${ac.assignedStand})` : ''}.`, late ? 'warning' : 'system', ac.callsign);
  // Off the runway's frequency: a departure with the AI Tower goes back to Ground.
  const tower = sim.stationFor('tower');
  if (ac.frequency === tower && !sim.userControls(tower)) ac.frequency = sim.stationFor('ground');
  // On your frequency the crew calls (curfewCall, from the pilot logic); the AI Ground re-routes it (sendBackToStand).
  if (!sim.isOnMyFrequency(ac)) sendBackToStand(sim, ac);
}

/** True while a jet that missed the curfew still has a route to the runway (it asks to go back to the stand). */
export function needsCurfewRoute(ac: Aircraft): boolean {
  return !!ac.missedCurfew && !!ac.returnToStand && ['taxi', 'holding', 'startup'].includes(ac.phase) && ac.routeDestination?.kind !== 'stand';
}

/** The crew's call after missing the curfew (repeated by the pilot logic until it has an answer). */
export function curfewCall(sim: Simulation, ac: Aircraft): void {
  call(sim, ac, 'taxiIn', `${sim.stationName(ac.frequency)}, ${sim.tel(ac)}, we have missed the night curfew, request taxi back to ${ac.assignedStand ? `stand ${ac.assignedStand}` : 'the stand'}`);
}

/** AI Ground: taxis a jet that missed the curfew back to a stand. */
export function sendBackToStand(sim: Simulation, ac: Aircraft): void {
  if (!needsCurfewRoute(ac) || ac.phase === 'startup') return;
  ac.assignedStand ??= sim.traffic.allocateStand(ac)?.id;
  if (ac.assignedStand) aiInstruct(sim, ac, { type: 'taxi', destination: { kind: 'stand', stand: ac.assignedStand }, via: [], holdShort: [], cross: [] });
}
