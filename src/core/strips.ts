import type { Aircraft } from './aircraft';
import type { Simulation } from './simulation';

/**
 * Realistic control mode: the controller keeps the lists by hand, as on a real strip board or in EuroScope.
 * What the crew asked for, the ground state, the clearance flag, where the aircraft is cleared to and the
 * landing clearance are entered by the controller and are not filled in from the radio. The marks are only
 * notes: they never change what the simulation does. They are set through `perform()` (session action
 * `strip`), so a saved session shows them again.
 */
export interface StripMarks {
  /** Ground state as a EuroScope code (e.g. ST-UP, PUSH, TAXI, L/U, T/O); the lists show it in the scope's style. */
  status?: string;
  /** What the crew asked for (e.g. TAXI, RDY), as the REQ column shows it. */
  request?: string;
  /** When the request was entered (simulation time). */
  requestAt?: number;
  /** IFR clearance given (the C flag). */
  cleared?: boolean;
  /** Where the aircraft is cleared to (holding point, runway, stand, de-icing pad). */
  target?: string;
  /** Cleared to land (the LND column). */
  landing?: boolean;
}

export type StripField = 'status' | 'request' | 'cleared' | 'target' | 'landing';

/** Ground states the controller can enter, in the order of a flight (EuroScope codes). */
export const DEPARTURE_STATES = ['CLRD', 'ST-UP', 'PUSH', 'TAXI', 'H/P', 'L/U', 'T/O', 'DEPA'];
export const ARRIVAL_STATES = ['APP', 'LAND', 'VAC', 'TAXI', 'PARK'];
export const TOW_STATES = ['PUSH', 'TAXI', 'PARK'];

/** Requests the controller can note (as the REQ column shows them). */
export const DEPARTURE_REQUESTS = ['CLR', 'STUP', 'PUSH', 'TAXI', 'RDY', 'XRWY'];
export const ARRIVAL_REQUESTS = ['LDG', 'VACD', 'TXIN', 'XRWY'];
export const TOW_REQUESTS = ['TOW', 'TAXI', 'XRWY'];

/** What the states mean (menu hints). */
export const STATE_HINTS: Record<string, string> = {
  CLRD: 'clearance given',
  'ST-UP': 'start-up approved',
  PUSH: 'pushback approved',
  TAXI: 'taxiing',
  'H/P': 'at the holding point',
  'L/U': 'line up',
  'T/O': 'cleared for take-off',
  DEPA: 'departed',
  APP: 'on approach',
  LAND: 'landing',
  VAC: 'vacating',
  PARK: 'on blocks',
};

/** What the requests mean (menu hints). */
export const REQUEST_HINTS: Record<string, string> = {
  CLR: 'asks for the IFR clearance',
  STUP: 'ready for start-up',
  PUSH: 'ready for pushback',
  TAXI: 'ready for taxi',
  RDY: 'ready for departure',
  XRWY: 'asks to cross a runway',
  LDG: 'on final, expects landing clearance',
  VACD: 'runway vacated',
  TXIN: 'asks for taxi to the stand',
  TOW: 'asks to tow',
};

/** Sets (or with an empty value clears) one mark of an aircraft's strip. */
export function setStripMark(sim: Simulation, ac: Aircraft, field: StripField, value: string | boolean | undefined): void {
  const strip = (ac.strip ??= {});
  switch (field) {
    case 'cleared':
    case 'landing':
      strip[field] = value === true || undefined;
      break;
    case 'request':
      strip.request = typeof value === 'string' && value ? value : undefined;
      strip.requestAt = strip.request ? sim.time : undefined;
      break;
    case 'status':
    case 'target':
      strip[field] = typeof value === 'string' && value ? value : undefined;
      break;
  }
}
