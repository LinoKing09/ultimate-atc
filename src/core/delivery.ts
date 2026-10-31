import { faaStyle } from './phraseology/faa';
import type { Aircraft } from './aircraft';
import type { AircraftType } from '../data/aircraftTypes';
import type { AirportData, SidData } from './airport/types';
import { destinationBearing, destinationName, resolveDestination } from '../data/destinations';
import type { Altitude, Command } from './phraseology/commands';
import { formatAltitude, formatClearanceClimb, formatDepartureRoute } from './phraseology/format';
import { inSector, runwayUseWords, runwayWords } from './runways';
import type { Simulation } from './simulation';

/**
 * Clearance Delivery: IFR clearances, squawks, start-up (A-CDM: at the TSAT)
 * and CTOTs (ATFM slots of the Network Manager).
 */

/** Result of executing an instruction (same shape as in pilot.ts). */
export interface DeliveryResult {
  readback?: string;
  unable?: string;
  answers?: boolean;
  after?: () => void;
}

/** Crews ask for their IFR clearance this long before their ready time (TOBT), seconds. */
export const CLEARANCE_LEAD_S = 10 * 60;
/** Initial climb of the SIDs when the airport data gives none (feet). */
const DEFAULT_INITIAL_CLIMB_FT = 5000;
/** Chance that a crew reads back the squawk wrongly (two digits swapped) - the controller must catch it. */
const READBACK_ERROR_CHANCE = 0.04;
/** Share of departures with a CTOT (ATFM regulation). */
const CTOT_CHANCE = 0.12;
/** CTOT tolerance: take-off allowed from CTOT -5 to CTOT +10 minutes. */
export const CTOT_EARLY_S = 5 * 60;
export const CTOT_LATE_S = 10 * 60;
/** A-CDM: estimated taxi-out time used to derive the TSAT from a CTOT (seconds). */
const EXOT_S = 10 * 60;
/** Minimum spacing between two TSATs (pre-departure sequencer capacity), seconds. */
const TSAT_SPACING_S = 90;
/** Share of crews that use datalink (DCL) for the clearance when the service is on. */
const DCL_SHARE = 0.4;
/** Squawk codes the simulator assigns (octal; a simulator range, not the real ORCAM allocation). */
const SQUAWK_BLOCKS = [0o2101, 0o2201, 0o2301, 0o2401];
const SPECIAL_CODES = new Set(['7500', '7600', '7700', '7000', '2000', '1000', '0000']);

export function initialClimbFt(sim: Simulation): number {
  return sim.config.airport.initialClimbFt ?? DEFAULT_INITIAL_CLIMB_FT;
}

/** The initial climb as said in a clearance: an altitude up to the transition altitude, else a flight level. */
export function initialClimb(sim: Simulation): Altitude {
  const ft = initialClimbFt(sim);
  return ft > sim.config.airport.transitionAltitudeFt ? { fl: Math.round(ft / 100) } : { feet: ft };
}

/** Next free squawk code (not used by any aircraft in the session). */
export function allocateSquawk(sim: Simulation): string {
  const used = new Set(sim.aircraft.map((a) => a.flightPlan.squawk));
  for (const start of SQUAWK_BLOCKS) {
    for (let k = 0; k < 0o77; k++) {
      const code = (start + k).toString(8).padStart(4, '0');
      if (!used.has(code) && !code.endsWith('0')) return code;
    }
  }
  return '2000';
}

export function isValidSquawk(code: string): boolean {
  return /^[0-7]{4}$/.test(code) && !SPECIAL_CODES.has(code);
}

/** "1435" for a simulation time. */
export function hhmm(sim: Simulation, t: number): string {
  return new Date(sim.startEpochMs + t * 1000).toISOString().slice(11, 16).replace(':', '');
}

/** Simulation time of the next "hhmm" (today, or tomorrow if it is long past). */
export function fromHhmm(sim: Simulation, s: string): number | undefined {
  if (!/^\d{4}$/.test(s)) return undefined;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2));
  if (h > 23 || m > 59) return undefined;
  const now = new Date(sim.startEpochMs + sim.time * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  let t = (d.getTime() - sim.startEpochMs) / 1000;
  if (t < sim.time - 12 * 3600) t += 24 * 3600;
  return t;
}

/**
 * The SIDs of a runway a flight to `destination` is planned on: those filed for that destination by
 * name, else those whose sector contains the direction of the destination, else the SID whose sector
 * lies closest to it. SIDs restricted to other destinations are never chosen for it. Airports without
 * sectors in their data (or unknown destinations) get all SIDs of the runway.
 */
export function sidsForDestination(airport: AirportData, runway: string, destination: string, type?: AircraftType): SidData[] {
  const prop = type?.silhouette === 'turboprop';
  const sids = airport.sids.filter((s) => s.runway === runway && (!type || !s.aircraft || (s.aircraft === 'prop') === prop));
  const dest = destination.toUpperCase();
  const named = sids.filter((s) => s.destinations?.includes(dest));
  if (named.length) return named;
  const open = sids.filter((s) => !s.destinations);
  const bearing = destinationBearing(airport.arp, dest);
  const sectored = open.filter((s) => s.towards);
  if (bearing === undefined || !sectored.length) return open.length ? open : sids;
  const inside = sectored.filter((s) => inSector(bearing, s.towards!));
  if (inside.length) return inside;
  const off = (s: SidData) => Math.min(...s.towards!.map((b) => Math.abs(((bearing - b + 540) % 360) - 180)));
  const best = Math.min(...sectored.map(off));
  return sectored.filter((s) => off(s) === best);
}

/** Radar frequency a departure contacts after take-off: its SID's departure frequency, else Approach. */
export function departureFrequency(sim: Simulation, ac: Aircraft): string | undefined {
  const sid = sim.config.airport.sids.find((s) => s.name === ac.flightPlan.sid);
  return sid?.frequency ?? sim.airport.station('APP')?.frequency;
}

/** First fix of the flight plan route (the SID must lead there). */
function routeFix(ac: Aircraft): string {
  return ac.flightPlan.route.split(' ')[0];
}

/**
 * The SID the flight plan suggests for the aircraft's runway in use: the one to the same first fix, else (the
 * runways have SIDs to different fixes, Wellington) the one the traffic generator would file for the destination.
 */
export function suggestedSid(sim: Simulation, ac: Aircraft): string | undefined {
  const fix = routeFix(ac);
  const runway = sim.departureRunwayOf(ac);
  const sameFix = sim.config.airport.sids.find((s) => s.runway === runway && s.fix === fix);
  if (sameFix) return sameFix.name;
  const current = sim.config.airport.sids.find((s) => s.name === ac.flightPlan.sid);
  if (runway && current && current.runway !== runway) {
    return sidsForDestination(sim.config.airport, runway, ac.flightPlan.destination, ac.type)[0]?.name ?? ac.flightPlan.sid;
  }
  return ac.flightPlan.sid;
}

/** The SID leads where the flight plan goes: to its first fix, or the runway in use has no SID to that fix and this one is filed for the destination. */
function sidFitsRoute(sim: Simulation, ac: Aircraft, sid: SidData): boolean {
  if (sid.vectors) return true;
  const fix = routeFix(ac);
  if (sid.fix === fix) return true;
  const airport = sim.config.airport;
  if (airport.sids.some((s) => s.runway === sid.runway && s.fix === fix) || !airport.sids.some((s) => s.fix === fix)) return false;
  return sidsForDestination(airport, sid.runway, ac.flightPlan.destination, ac.type).includes(sid);
}

/** "runway 25" / "runways 26R and 26L" in use, for the crews' queries. */
/** "runway 25 in use", "runways 26R and 26L in use", "arrival runway 26R, departure runway 26L". */
function inUseWords(sim: Simulation): string {
  const ends = sim.runways;
  return sim.departureRunways.length === ends.length && sim.arrivalRunways.length === ends.length ? `${runwayWords(ends)} in use` : runwayUseWords(ends, sim.parallelUse);
}

/** The departure gets the runway of its SID (with parallel runways the SID designator names the runway). */
function assignSidRunway(ac: Aircraft, sidRunway: string): void {
  ac.runway = sidRunway;
  ac.flightPlan.runway = sidRunway;
}

/** Called for every new departure: CTOT, DCL equipment, and the clearance if Delivery is run by the AI. */
export function prepareDeparture(sim: Simulation, ac: Aircraft): void {
  if (sim.rng.chance(CTOT_CHANCE)) ac.ctot = Math.round((ac.readyAt + EXOT_S + sim.rng.range(5 * 60, 25 * 60)) / 60) * 60;
  ac.dcl = sim.rng.chance(DCL_SHARE) && ac.callsign.length > 0 && !/^D[A-Z]{4}$/.test(ac.callsign);
  const delivery = sim.stationFor('delivery');
  if (sim.airport.station(delivery) && sim.userControls(delivery)) {
    ac.frequency = delivery;
    ac.flightPlan.squawk = '';
    ac.cleared = false;
  } else {
    // AI Delivery: the crew already has its clearance (and start-up is given by Ground).
    ac.cleared = true;
    ac.clearance = { sid: ac.flightPlan.sid, climb: formatAltitude(initialClimb(sim)), squawk: ac.flightPlan.squawk };
  }
}

/** IFR clearance read-back, or what the crew queries. */
export function execClearance(sim: Simulation, ac: Aircraft, c: Extract<Command, { type: 'clearance' }>): DeliveryResult {
  if (ac.category !== 'departure' || !ac.onGround) return { unable: 'say again' };
  if (!['parked', 'pushback', 'startup', 'taxi', 'holding'].includes(ac.phase)) return { unable: 'say again' };
  const fp = ac.flightPlan;
  const queries: string[] = [];
  if (c.destination) {
    const icao = resolveDestination(c.destination);
    if (!icao) queries.push('say again clearance limit');
    else if (icao !== fp.destination) queries.push(`confirm clearance limit, our destination is ${destinationName(fp.destination)}`);
  } else queries.push('say again clearance limit');
  const sid = c.sid ? sim.config.airport.sids.find((s) => s.name === c.sid) : undefined;
  if (!c.sid) queries.push('request departure route');
  else if (!sid) queries.push(`confirm ${c.sid} departure`);
  else if (!sim.isDepartureRunway(sid.runway)) queries.push(`confirm ${sid.name} departure, information ${sim.atisLetter} says ${inUseWords(sim)}`);
  else if (!sidFitsRoute(sim, ac, sid)) queries.push(`confirm ${sid.name} departure, our flight plan is via ${routeFix(ac)}`);
  if (c.runway && sim.airport.runwayEnd(c.runway) && !sim.isDepartureRunway(c.runway)) queries.push(`confirm runway ${c.runway}, information ${sim.atisLetter} says ${inUseWords(sim)}`);
  if (!c.climb) queries.push('confirm initial climb');
  if (!c.squawk) queries.push('request squawk');
  else if (!isValidSquawk(c.squawk)) queries.push(`confirm squawk ${c.squawk}`);
  if (queries.length) return { unable: queries.join(', ') };

  const squawk = c.squawk!;
  ac.clearance = { sid: sid!.name, climb: formatAltitude(c.climb!), squawk };
  fp.sid = sid!.name;
  assignSidRunway(ac, sid!.runway);
  fp.squawk = squawk;
  ac.cleared = true;
  // A new clearance: its readback is still to be checked.
  ac.readbackConfirmed = false;
  let said = squawk;
  // Tutorials switch the random readback errors off, or force one for the next clearance.
  const mode = sim.readbackErrors;
  if (mode === 'next') sim.readbackErrors = 'off';
  if (mode === 'next' || (mode === 'random' && sim.rng.chance(READBACK_ERROR_CHANCE))) {
    // Two digits swapped - the classic readback error the controller has to catch.
    const d = squawk.split('');
    const i = d[1] !== d[2] ? 1 : d[2] !== d[3] ? 2 : 0;
    [d[i], d[i + 1]] = [d[i + 1], d[i]];
    said = d.join('');
    if (said !== squawk) ac.readbackError = { squawk, said };
  }
  if (c.ctot) {
    const t = fromHhmm(sim, c.ctot);
    if (t !== undefined) ac.ctot = t;
  }
  const parts = [`cleared to ${destinationName(fp.destination)}, ${formatDepartureRoute(sid!.name)}`, formatClearanceClimb(sid!.name, c.climb!), `squawk ${said}`];
  if (ac.ctot) parts.push(`CTOT ${hhmm(sim, ac.ctot)}`);
  return { readback: parts.join(', '), answers: ac.request === 'clearance' };
}

export function execSquawk(sim: Simulation, ac: Aircraft, code: string): DeliveryResult {
  if (!isValidSquawk(code)) return { unable: `confirm squawk ${code}` };
  ac.flightPlan.squawk = code;
  if (ac.clearance) ac.clearance.squawk = code;
  if (ac.readbackError && ac.readbackError.squawk === code) ac.readbackError = undefined;
  void sim;
  return { readback: `squawk ${code}` };
}

/** "Readback correct": if the readback was wrong, the error went unnoticed. */
export function execReadbackCorrect(sim: Simulation, ac: Aircraft): DeliveryResult {
  missReadbackError(sim, ac);
  ac.readbackConfirmed = true;
  return {};
}

/** A readback error that was not corrected: the crew sets the wrong code. */
export function missReadbackError(sim: Simulation, ac: Aircraft): void {
  if (!ac.readbackError) return;
  const e = ac.readbackError;
  ac.readbackError = undefined;
  ac.flightPlan.squawk = e.said;
  if (ac.clearance) ac.clearance.squawk = e.said;
  sim.stats.readbackErrorsMissed++;
  sim.system(`Readback error not caught: ${ac.callsign} read back squawk ${e.said} instead of ${e.squawk} and has set ${e.said}.`, 'warning', ac.callsign);
  sim.updateScore();
}

export function execCtot(sim: Simulation, ac: Aircraft, time: string): DeliveryResult {
  const t = fromHhmm(sim, time);
  if (t === undefined) return { unable: `say again CTOT` };
  ac.ctot = t;
  return { readback: `CTOT ${time}` };
}

/**
 * DCL: the clearance is sent by datalink - no voice transmission, no
 * readback error. The crew confirms with WILCO.
 */
export function sendDcl(sim: Simulation, ac: Aircraft, sidName: string, squawk: string): string | undefined {
  const sid = sim.config.airport.sids.find((s) => s.name === sidName);
  if (!sid) return `Unknown SID ${sidName}`;
  if (!isValidSquawk(squawk)) return `Invalid squawk ${squawk}`;
  ac.clearance = { sid: sid.name, climb: formatAltitude(initialClimb(sim)), squawk };
  ac.flightPlan.sid = sid.name;
  assignSidRunway(ac, sid.runway);
  ac.flightPlan.squawk = squawk;
  ac.cleared = true;
  if (ac.request === 'clearance') {
    sim.recordAnswer(ac);
    ac.request = null;
  }
  const text = `DCL to ${ac.callsign}: cleared to ${destinationName(ac.flightPlan.destination)}, ${formatDepartureRoute(sid.name)}, ${formatClearanceClimb(sid.name, initialClimb(sim))}, squawk ${squawk}${ac.ctot ? `, CTOT ${hhmm(sim, ac.ctot)}` : ''} - WILCO.`;
  sim.system(
    // US: pre-departure clearance (PDC), in FAA wording.
    sim.faa ? faaStyle(text).replace(/^DCL/, 'PDC') : text,
    'system',
    ac.callsign,
  );
  return undefined;
}

/**
 * A-CDM pre-departure sequencer: gives every departure that has not started
 * up yet a TSAT - not before its TOBT, matching its CTOT (CTOT - taxi time),
 * and at least TSAT_SPACING_S after the previous one.
 */
export function updateSequencer(sim: Simulation): void {
  const waiting = sim.aircraft
    .filter((a) => a.category === 'departure' && a.phase === 'parked' && !a.startupApproved)
    .map((a) => ({ a, earliest: Math.max(a.readyAt, a.ctot !== undefined ? a.ctot - EXOT_S : -Infinity) }))
    .sort((x, y) => x.earliest - y.earliest);
  if (!sim.systemOn('acdm')) {
    for (const w of waiting) w.a.tsat = undefined;
    return;
  }
  // Start-ups already approved (or flights already off-block) occupy their slots.
  const taken = sim.aircraft
    .filter((a) => a.category === 'departure' && a.tsat !== undefined && (a.startupApproved || a.phase !== 'parked'))
    .map((a) => a.tsat!);
  const free = (t: number) => !taken.some((x) => Math.abs(x - t) < TSAT_SPACING_S);
  // Flights keep an issued TSAT while it is still valid. Only then do the others (new flights, or
  // flights that missed their TSAT) get the earliest free slot - a late flight never bumps one on time.
  const slotStart = (w: (typeof waiting)[number]) => Math.ceil(Math.max(w.earliest, sim.time) / 60) * 60;
  const keep: typeof waiting = [];
  const reslot: typeof waiting = [];
  for (const w of waiting) {
    const t = w.a.tsat;
    if (t !== undefined && t >= slotStart(w) && free(t)) {
      keep.push(w);
      taken.push(t);
    } else reslot.push(w);
  }
  reslot.sort((x, y) => slotStart(x) - slotStart(y));
  for (const w of reslot) {
    let t = slotStart(w);
    while (!free(t)) t += 60;
    w.a.tsat = t;
    taken.push(t);
  }
}

/**
 * AI Delivery for departures still on Delivery frequency when you do not (or
 * no longer) work Delivery: they get their clearance and go to Ground.
 */
export function updateDeliveryAI(sim: Simulation): void {
  const delivery = sim.stationFor('delivery');
  if (delivery === sim.stationFor('ground') || sim.userControls(delivery)) return;
  for (const ac of sim.aircraft) {
    if (ac.frequency !== delivery) continue;
    if (!ac.cleared) {
      ac.flightPlan.squawk ||= allocateSquawk(sim);
      ac.flightPlan.sid = suggestedSid(sim, ac) ?? ac.flightPlan.sid;
      ac.clearance = { sid: ac.flightPlan.sid, climb: formatAltitude(initialClimb(sim)), squawk: ac.flightPlan.squawk };
      ac.cleared = true;
    }
    ac.frequency = sim.stationFor('ground');
    ac.request = null;
    sim.frequency.release(ac.callsign);
  }
}

/** Time the crew asks for start-up: at the TSAT with A-CDM, otherwise when ready (TOBT). */
/**
 * When a departure may leave its stand: at its TSAT with A-CDM; without, not before CTOT - taxi time,
 * so that it reaches the runway when its slot window opens and does not wait at the holding point.
 */
export function offBlockDue(sim: Simulation, ac: Aircraft): number {
  // From 2 minutes before the TSAT, like the crews' start-up call (the sequencer moves a TSAT that has passed).
  if (sim.systemOn('acdm') && ac.tsat !== undefined) return ac.tsat - 120;
  return ac.ctot !== undefined ? Math.max(ac.readyAt, ac.ctot - EXOT_S) : ac.readyAt;
}

export function startupDue(sim: Simulation, ac: Aircraft): number {
  return sim.systemOn('acdm') && ac.tsat !== undefined ? ac.tsat - 120 : ac.readyAt;
}
