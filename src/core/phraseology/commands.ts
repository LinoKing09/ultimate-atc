import type { Compass, StationType } from '../airport/types';

export type TaxiDestination =
  | { kind: 'holdingPoint'; name: string; runway?: string }
  | { kind: 'runway'; runway: string }
  | { kind: 'stand'; stand: string };

export type HoldShortTarget = { kind: 'taxiway'; name: string } | { kind: 'runway'; runway: string };

/** A single controller instruction extracted from a transmission. */
export type Command =
  | { type: 'pushback'; facing?: Compass; startup: boolean }
  | { type: 'startup' }
  | { type: 'taxi'; destination?: TaxiDestination; via: string[]; holdShort: HoldShortTarget[]; cross: string[] }
  | { type: 'holdShort'; target: HoldShortTarget }
  | { type: 'cross'; runway: string }
  | { type: 'holdPosition' }
  | { type: 'continue' }
  | { type: 'giveWay'; callsign: string }
  | { type: 'follow'; callsign: string }
  | { type: 'handoff'; station?: StationType; frequency?: string }
  | { type: 'standby' }
  | { type: 'expedite' }
  | { type: 'sayAgain' }
  | { type: 'lineUp' }
  | { type: 'takeoff' };

export interface ParsedTransmission {
  /** Callsign as resolved against the traffic list, if any. */
  callsign?: string;
  /** True if the callsign was given explicitly in the text (as opposed to taken from the selection). */
  explicitCallsign: boolean;
  commands: Command[];
  /** Words the parser could not make sense of. */
  unparsed: string[];
}
