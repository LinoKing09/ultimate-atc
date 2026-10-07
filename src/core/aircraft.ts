import type { AircraftType } from '../data/aircraftTypes';
import type { Compass, StationType } from './airport/types';
import type { TaxiRoute } from './airport/routing';
import { KT_TO_MS, headingVector, normHeading, type Vec2 } from './geo';
import type { Path } from './path';
import type { Command, TaxiDestination } from './phraseology/commands';
import { telephonyCallsign } from './phraseology/speech';

export type FlightCategory = 'departure' | 'arrival';

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
  | 'route'; // route was unclear / taxi ended without destination

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
  /** Give-way bookkeeping: last distance to the traffic and how long it has been increasing. */
  giveWayLastDist?: number;
  giveWayOpening?: number;

  // --- pilot communication
  request: PilotRequest | null;
  /** Simulation time of the first call for the current request. */
  requestSince: number;
  lastCallAt: number;
  callCount: number;
  standbyUntil: number;
  /** Time the pilot will make the next spontaneous call (e.g. departure ready to push). */
  readyAt: number;
  startupApproved: boolean;
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
