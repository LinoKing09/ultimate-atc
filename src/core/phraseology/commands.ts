import type { Compass, StationType } from '../airport/types';

export type TaxiDestination =
  | { kind: 'holdingPoint'; name: string; runway?: string }
  | { kind: 'runway'; runway: string }
  | { kind: 'stand'; stand: string }
  /** Clearance limit "hold short of taxiway X" without another destination. */
  | { kind: 'holdShort'; name: string };

export type HoldShortTarget = { kind: 'taxiway'; name: string } | { kind: 'runway'; runway: string };

/** A single controller instruction extracted from a transmission. */
export type Command =
  | { type: 'pushback'; facing?: Compass; startup: boolean }
  | { type: 'cancelPushback' }
  | { type: 'stopPushback' }
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
  /** Queue position: "number 2 for pushback". */
  | { type: 'sequence'; number: number; for?: string }
  /** Expected delay: "expect pushback in 5 minutes". */
  | { type: 'expect'; what: string; minutes: number }
  | { type: 'expedite' }
  | { type: 'sayAgain' }
  | { type: 'lineUp' }
  | { type: 'takeoff' };

/** Conditional clearance: "behind the A320 passing left to right, ...". */
export interface Condition {
  /** Traffic named by callsign. */
  callsign?: string;
  /** Traffic described by aircraft type (ICAO designator or manufacturer). */
  type?: string;
  /** The condition as it should be read back, e.g. "behind the A320 passing from left to right". */
  text: string;
}

export interface ParsedTransmission {
  /** Callsign as resolved against the traffic list, if any. */
  callsign?: string;
  /** True if the callsign was given explicitly in the text (as opposed to taken from the selection). */
  explicitCallsign: boolean;
  commands: Command[];
  /** Conditional clearance that applies to the movement instructions. */
  condition?: Condition;
  /** Words the parser could not make sense of. */
  unparsed: string[];
}
