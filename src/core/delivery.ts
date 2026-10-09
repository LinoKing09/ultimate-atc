import type { Aircraft } from './aircraft';
import { destinationName, resolveDestination } from '../data/destinations';
import type { Command } from './phraseology/commands';
import { formatAltitude } from './phraseology/format';
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

/** First fix of the flight plan route (the SID must lead there). */
function routeFix(ac: Aircraft): string {
  return ac.flightPlan.route.split(' ')[0];
}

/** The SID the flight plan suggests for the runway in use (same first fix). */
export function suggestedSid(sim: Simulation, ac: Aircraft): string | undefined {
  const fix = routeFix(ac);
  return sim.config.airport.sids.find((s) => s.runway === sim.runway && s.fix === fix)?.name ?? ac.flightPlan.sid;
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
    ac.clearance = { sid: ac.flightPlan.sid, climb: `${initialClimbFt(sim)} feet`, squawk: ac.flightPlan.squawk };
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
  else if (sid.runway !== sim.runway) queries.push(`confirm ${sid.name} departure, information ${sim.atisLetter} says runway ${sim.runway} in use`);
  else if (sid.fix !== routeFix(ac)) queries.push(`confirm ${sid.name} departure, our flight plan is via ${routeFix(ac)}`);
  if (c.runway && sim.airport.runwayEnd(c.runway) && c.runway !== sim.runway) queries.push(`confirm runway ${c.runway}, information ${sim.atisLetter} says runway ${sim.runway}`);
  if (!c.climb) queries.push('confirm initial climb');
  if (!c.squawk) queries.push('request squawk');
  else if (!isValidSquawk(c.squawk)) queries.push(`confirm squawk ${c.squawk}`);
  if (queries.length) return { unable: queries.join(', ') };

  const squawk = c.squawk!;
  ac.clearance = { sid: sid!.name, climb: formatAltitude(c.climb!), squawk };
  fp.sid = sid!.name;
  fp.runway = sim.runway;
  fp.squawk = squawk;
  ac.cleared = true;
  let said = squawk;
  if (sim.rng.chance(READBACK_ERROR_CHANCE)) {
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
  const parts = [`cleared to ${destinationName(fp.destination)}, ${sid!.name} departure`, `climb ${formatAltitude(c.climb!)}`, `squawk ${said}`];
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
  ac.clearance = { sid: sid.name, climb: `${initialClimbFt(sim)} feet`, squawk };
  ac.flightPlan.sid = sid.name;
  ac.flightPlan.runway = sim.runway;
  ac.flightPlan.squawk = squawk;
  ac.cleared = true;
  if (ac.request === 'clearance') {
    sim.recordAnswer(ac);
    ac.request = null;
  }
  sim.system(
    `DCL to ${ac.callsign}: cleared to ${destinationName(ac.flightPlan.destination)} via ${sid.name} departure, climb ${initialClimbFt(sim)} feet, squawk ${squawk}${ac.ctot ? `, CTOT ${hhmm(sim, ac.ctot)}` : ''} - WILCO.`,
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
  // Flights keep an issued TSAT if it is still valid; the others get the earliest free slot.
  waiting.sort((x, y) => (x.a.tsat ?? x.earliest) - (y.a.tsat ?? y.earliest));
  for (const w of waiting) {
    const earliest = Math.ceil(Math.max(w.earliest, sim.time) / 60) * 60;
    let t: number;
    if (w.a.tsat !== undefined && w.a.tsat >= earliest && free(w.a.tsat)) t = w.a.tsat;
    else {
      t = earliest;
      while (!free(t)) t += 60;
    }
    w.a.tsat = t;
    taken.push(t);
  }
}

/** Time the crew asks for start-up: at the TSAT with A-CDM, otherwise when ready (TOBT). */
export function startupDue(sim: Simulation, ac: Aircraft): number {
  return sim.systemOn('acdm') && ac.tsat !== undefined ? ac.tsat - 120 : ac.readyAt;
}
