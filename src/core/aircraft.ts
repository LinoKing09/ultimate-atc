import type { AircraftType } from '../data/aircraftTypes';
import type { Compass, StationType } from './airport/types';
import type { TaxiRoute } from './airport/routing';
import { KT_TO_MS, headingVector, normHeading, type Vec2 } from './geo';
import type { Path } from './path';
import type { Command, TaxiDestination } from './phraseology/commands';
import { telephonyCallsign } from './phraseology/speech';

/** `tow`: an aircraft without crew towed by a tug (callsign of the tug, e.g. TUG5). */
export type FlightCategory = 'departure' | 'arrival' | 'tow';

export type Phase =
  // departures
  | 'parked' // on stand, not ready yet or waiting for push approval
  | 'pushback' // being pushed back
  | 'startup' // starting engines after pushback
  | 'taxi' // on a taxi route (moving or holding)
  | 'holding' // stopped at the runway holding point, waiting for line-up
  | 'lineup'
  | 'takeoff'
  | 'climb'
  // arrivals
  | 'approach'
  | 'landing'
  | 'vacating'
  | 'arrived' // parked on stand after arrival, shutting down
  // both
  | 'goAround'
  | 'gone';

export interface FlightPlan {
  departure: string;
  destination: string;
  route: string;
  sid?: string;
  runway?: string;
  cruiseFl: number;
  squawk: string;
}

/** Points along the current path where the aircraft has to stop. */
export interface PathStop {
  s: number;
  kind: 'runway' | 'holdShort' | 'destination';
  /** Runway name for runway stops ("07/25"), taxiway name for hold-short stops. */
  target: string;
  /** Holding point name, if the stop is at one. */
  holdingPoint?: string;
  /** Node id the stop belongs to. */
  nodeId?: string;
}

/** What the pilot is currently waiting for from ATC. */
export type PilotRequest =
  | 'pushback'
  | 'taxi' // ready for taxi after pushback / start-up
  | 'taxiIn' // arrival vacated, needs taxi to stand
  | 'handoff' // at the holding point, expects to be handed to tower
  | 'crossing' // holding short of a runway on the route
  | 'blocked' // stuck behind traffic for a long time
  | 'route' // route was unclear / taxi ended without destination
  | 'clearance' // departure on Delivery asks for its IFR clearance (voice or DCL)
  | 'startup' // cleared departure ready, asks for start-up (A-CDM: at its TSAT)
  | 'frequency' // start-up approved, waits for "contact Ground"
  | 'tow' // tug driver asks to tow an aircraft from one stand to another
  | 'departure' // Tower: at the holding point, ready for departure
  | 'landing' // Tower: arrival on final, expects a landing clearance
  | 'vacated' // Tower: runway vacated (after landing or crossing), expects "contact ground"
  | 'radar'; // Tower: departure airborne, expects "contact radar"

export interface Aircraft {
  callsign: string;
  type: AircraftType;
  category: FlightCategory;
  flightPlan: FlightPlan;

  // --- kinematics
  pos: Vec2;
  heading: number;
  /** Ground speed in m/s (always >= 0, see `reverse`). */
  speed: number;
  /** True while being pushed back (moving tail first). */
  reverse: boolean;
  altitudeFt: number;
  verticalSpeedFpm: number;
  onGround: boolean;

  // --- state
  phase: Phase;
  /** Station the pilot is currently listening to. */
  frequency: StationType;
  stand?: string;
  /** Stand allocated to an arrival (suggestion shown to the controller). */
  assignedStand?: string;
  /**
   * The crew saw on approach that its destination stand is not usable
   * (occupied, or a neighbour too close) and stopped: `reported` once it has
   * asked for another stand, otherwise it waits for an aircraft leaving it.
   */
  standBlocked?: { stand: string; reported: boolean };
  /** Departure runway end / landing runway end. */
  runway?: string;

  // --- path following
  path: Path | null;
  s: number;
  stops: PathStop[];
  route: TaxiRoute | null;
  routeDestination?: TaxiDestination;
  /** Taxi instruction received during pushback/start-up, executed once the aircraft is ready. */
  pendingTaxi?: Extract<Command, { type: 'taxi' }>;
  /** Runways the aircraft is cleared to cross on its current route. */
  clearedToCross: Set<string>;
  holdPosition: boolean;
  giveWayTo?: string;
  giveWaySince?: number;
  expedite: boolean;
  /** Speed limit for the current path segment (m/s), e.g. landing roll-out profile. */
  speedLimit?: (s: number) => number;
  /** The node the aircraft stopped at (holding point, stand...). */
  stoppedAt?: PathStop;
  /** Callsign of the aircraft currently blocking the path, if any. */
  blockedBy?: string;
  blockedSince?: number;
  /** Distance along the path the aircraft may still move before reaching traffic ahead. */
  blockDistance?: number;
  /** Give-way bookkeeping: last and smallest distance to the traffic so far. */
  giveWayLastDist?: number;
  giveWayMinDist?: number;

  // --- pilot communication
  request: PilotRequest | null;
  /** Simulation time of the first call for the current request. */
  requestSince: number;
  lastCallAt: number;
  callCount: number;
  standbyUntil: number;
  /** Time the pilot will make the next spontaneous call (e.g. departure ready to push). */
  readyAt: number;
  /** Time the crew asks Delivery for its IFR clearance (default: 10 minutes before `readyAt`). */
  clearanceAt?: number;
  startupApproved: boolean;
  /** IFR clearance (Delivery). `cleared` = the crew has it and read it back. */
  cleared: boolean;
  clearance?: { sid?: string; climb?: string; squawk?: string };
  /** A wrong readback the controller still has to catch (squawk digits swapped). */
  readbackError?: { squawk: string; said: string };
  /** The crew requests the clearance by datalink (DCL) instead of voice. */
  dcl?: boolean;
  /** A-CDM: target start-up approval time (sim seconds). */
  tsat?: number;
  /** Calculated take-off time from the Network Manager (ATFM slot), sim seconds. */
  ctot?: number;
  pushFacing?: Compass;
  /** Time at which a timed activity (engine start, shutdown, pushback tug) finishes. */
  timerUntil: number;
  /** Last transmission of this pilot, for "say again". */
  lastTransmission?: string;
  /** Exit chosen by the tower for an arrival. */
  exitName?: string;
  /** Simulation time the aircraft reached the holding point. */
  holdingSince?: number;
  /** Simulation time at which the aircraft entered the simulation. */
  spawnedAt: number;
  /** Incident flags. */
  incident?: 'collision';
  /** Emergency declared by the crew (PAN PAN medical). */
  emergency?: 'medical';
  /** Simulation time the emergency was declared. */
  emergencySince?: number;
  /** Special situation: the take-off was rejected (aborted) on the runway. */
  rejectedTakeoff?: boolean;
  /** Speed (m/s) at which a planned take-off rejection happens. */
  rejectAtSpeed?: number;
  /** Departure that wants to return to a stand (technical problem or medical emergency). */
  returnToStand?: boolean;
  /** Being towed back onto the stand after "cancel pushback" during the push. */
  towingIn?: boolean;
  /** Waiting for a tug to turn the aircraft around (until this simulation time). */
  tugUntil?: number;
  /** Tow (category 'tow'): the towed aircraft and the requested stands. */
  tow?: { aircraft: string; operator: string; from: string; to: string };
  /** The crew asked for a follow-me (unfamiliar with the airport). */
  wantsFollowMe?: boolean;
  /** Tower (user): line-up clearance received (lines up on reaching the holding point). */
  lineUpCleared?: boolean;
  /** Tower (user): take-off clearance received. */
  takeoffCleared?: boolean;
  /** Tower (user): landing clearance received. */
  landingCleared?: boolean;
  /** Tower (user): "cleared for immediate take-off" / "no delay": line up briskly and roll at once. */
  immediateTakeoff?: boolean;
  /** Speed control on final: fly `kt` until `untilNm` from the threshold, then slow to the approach speed. */
  speedRestriction?: { kt: number; untilNm: number };
  /** Tower: exit to vacate by ("vacate via E"). */
  requestedExit?: string;
  /** Tower: after a runway crossing on Tower frequency, the aircraft reports vacated. */
  crossingWithTower?: 'cleared' | 'crossing';
  /** Tower: first contact on final made / short-final call made. */
  towerContact?: boolean;
  shortFinalCall?: boolean;
  /** Last time a head-on conflict involving this aircraft was resolved (AI Ground), to resolve each pair once. */
  resolvedAt?: number;
  /** Follow-me ordered: `vehicle` once one is assigned, `leading` once it is in front of the aircraft. */
  followMe?: { vehicle?: string; leading: boolean };
  /** Time since when the AI Tower sees this departure stranded short of the holding point. */
  towerStuckSince?: number;
  /** Pre-rolled special event: medical emergency while taxiing out. */
  plannedMedical?: boolean;
  /** Simulation time the current taxi route was started. */
  taxiStartedAt?: number;
  /** Queue position given by the controller ("number 2 for pushback"). */
  sequence?: { number: number; for: string };
  /** Simulation time the aircraft became airborne (departures). */
  airborneAt?: number;
  /** True if the take-off started from an intersection (not full length). */
  intersectionDeparture?: boolean;
  /** Take-off run the crew needs today (metres), decided on first use. */
  requiredRunwayM?: number;
  /** Answers given to "are you able intersection X?" (intersection name -> able). */
  ableIntersection?: Record<string, boolean>;
  /** Tag offset on screen in pixels (UI state kept with the aircraft for convenience). */
  tagOffset?: { x: number; y: number };
}

export function createAircraft(init: {
  callsign: string;
  type: AircraftType;
  category: FlightCategory;
  flightPlan: FlightPlan;
  pos: Vec2;
  heading: number;
  altitudeFt: number;
  phase: Phase;
  frequency: StationType;
  now: number;
}): Aircraft {
  return {
    ...init,
    speed: 0,
    reverse: false,
    verticalSpeedFpm: 0,
    onGround: init.phase !== 'approach',
    path: null,
    s: 0,
    stops: [],
    route: null,
    clearedToCross: new Set(),
    holdPosition: false,
    expedite: false,
    request: null,
    requestSince: 0,
    lastCallAt: -Infinity,
    callCount: 0,
    standbyUntil: 0,
    readyAt: Infinity,
    startupApproved: false,
    cleared: false,
    timerUntil: 0,
    spawnedAt: init.now,
  };
}

export function telephony(ac: Aircraft): string {
  return telephonyCallsign(ac.callsign);
}

export function groundSpeedKt(ac: Aircraft): number {
  return ac.speed / KT_TO_MS;
}

export function isOnTaxiPath(ac: Aircraft): boolean {
  return ac.path !== null && ac.onGround;
}

/** Remaining distance to the next stop on the path (or to the end of the path). */
export function nextStop(ac: Aircraft): PathStop | undefined {
  return ac.stops.find((st) => st.s >= ac.s - 0.5);
}

/** Moves an aircraft that is not on a path (airborne) in a straight line. */
export function moveFree(ac: Aircraft, dt: number): void {
  const v = headingVector(ac.heading);
  ac.pos = { x: ac.pos.x + v.x * ac.speed * dt, y: ac.pos.y + v.y * ac.speed * dt };
  ac.altitudeFt += (ac.verticalSpeedFpm / 60) * dt;
}

/** Heading of the aircraft's nose given the path direction. */
export function noseHeading(pathHeading: number, reverse: boolean): number {
  return reverse ? normHeading(pathHeading + 180) : pathHeading;
}
