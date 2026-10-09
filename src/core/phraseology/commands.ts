import type { Compass, StationType } from '../airport/types';

export type TaxiDestination =
  | { kind: 'holdingPoint'; name: string; runway?: string }
  | { kind: 'runway'; runway: string }
  | { kind: 'stand'; stand: string }
  /** Clearance limit "hold short of taxiway X" without another destination. */
  | { kind: 'holdShort'; name: string };

/** An altitude in feet or a flight level. */
export type Altitude = { feet: number } | { fl: number };

export type HoldShortTarget = { kind: 'taxiway'; name: string } | { kind: 'runway'; runway: string };

/** A single controller instruction extracted from a transmission. */
export type Command =
  | { type: 'pushback'; facing?: Compass; startup: boolean }
  | { type: 'cancelPushback' }
  | { type: 'stopPushback' }
  | { type: 'startup' }
  /** Taxi instruction; `tow` for a tow ("tow approved via N, W"). */
  | { type: 'taxi'; destination?: TaxiDestination; via: string[]; holdShort: HoldShortTarget[]; cross: string[]; tow?: boolean }
  | { type: 'holdShort'; target: HoldShortTarget }
  | { type: 'cross'; runway: string }
  | { type: 'holdPosition' }
  | { type: 'continue' }
  | { type: 'giveWay'; callsign: string }
  | { type: 'follow'; callsign: string }
  /** "Follow the follow-me": a follow-me car leads the aircraft along its route. */
  | { type: 'followMe' }
  /**
   * Vehicles: "proceed [to DCEEO | to stand 14 | to base] [via N, F]" (vehicles get "proceed",
   * aircraft "taxi"). For a tug it means the same as "tow approved".
   */
  | { type: 'proceed'; target?: string; destination?: TaxiDestination; base?: boolean; via: string[] }
  /** Vehicles: "return to base". */
  | { type: 'returnToBase' }
  | { type: 'handoff'; station?: StationType; frequency?: string }
  | { type: 'standby' }
  /** Queue position: "number 2 for pushback". */
  | { type: 'sequence'; number: number; for?: string }
  /** Expected delay: "expect pushback in 5 minutes". */
  | { type: 'expect'; what: string; minutes: number }
  | { type: 'expedite' }
  | { type: 'sayAgain' }
  /** "Are you able intersection D?" - ask whether the aircraft can depart from an intersection. */
  | { type: 'askIntersection'; name: string }
  /** IFR (en-route) clearance: "cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312". */
  | { type: 'clearance'; destination?: string; sid?: string; runway?: string; climb?: Altitude; squawk?: string; ctot?: string }
  /** Transponder code: "squawk 2312". */
  | { type: 'squawk'; code: string }
  /** "Readback correct" after an IFR clearance. */
  | { type: 'readbackCorrect' }
  /** Calculated take-off time (ATFM slot): "CTOT 1435" / "slot time 1435". */
  | { type: 'ctot'; time: string }
  /** Tower: "line up and wait runway 25" (optionally behind traffic: conditional clearance). */
  | { type: 'lineUp'; runway?: string }
  /** Tower: "runway 25, cleared for take-off". */
  | { type: 'takeoff'; runway?: string }
  /** Tower: "runway 25, cleared to land". */
  | { type: 'land'; runway?: string }
  /** Tower: "continue approach" (expect a late landing clearance). */
  | { type: 'continueApproach' }
  /** Tower: "go around". */
  | { type: 'goAround' }
  /** Tower: "hold position, cancel take-off" / "stop immediately" (rolling). */
  | { type: 'cancelTakeoff' }
  /** Tower: "vacate via E" (the exit to take after landing). */
  | { type: 'vacate'; exit: string };

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
