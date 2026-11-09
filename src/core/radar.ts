import type { ApproachProfile } from './approach';
import type { Aircraft } from './aircraft';
import type { AirspaceData, ArrivalEntryData, CenterSectorData, FixData, HoldingData } from './airport/types';
import type { RunwayEnd } from './airport/airport';
import { KT_TO_MS, M_PER_FT, M_PER_NM, add, distance, dot, headingDiff, headingOf, headingVector, length, normHeading, scale, sub, type LocalProjection, type Vec2 } from './geo';
import type { Simulation } from './simulation';
import type { Command } from './phraseology/commands';

/**
 * Approach / Departure position (radar): the terminal airspace around the airport and how the aircraft fly in it
 * while you work them on the radar scope - vectors (headings), altitudes and flight levels, speeds, direct-to,
 * holdings, the localizer intercept for an ILS / RNP clearance, the departures' climb towards their SID exit fix,
 * the hand-offs between Center, Approach and Tower, and the radar alerts (STCA, MSAW).
 *
 * Simplified flight model (see docs/simulation.md#approach--departure-radar): no wind aloft (ground speed =
 * indicated airspeed), standard rate turns (3 degrees per second), one climb and descent rate per type.
 *
 * Only DOM-free state; per-flight variation comes from `sim.variation`, never from Math.random.
 */

/** Standard rate turn (degrees per second). */
export const TURN_RATE_DEG_S = 3;
/** Descent rate of the arrivals (ft/min) and the go-around climb. */
export const DESCENT_FPM = 1800;
export const GO_AROUND_FPM = 2000;
/** Speed changes (kt per second): acceleration, deceleration. */
const ACCEL_KT_S = 1.5;
const DECEL_KT_S = 1;
/** Speed limit below FL100 (airspace C / D) and the crews' own speeds. */
export const SPEED_LIMIT_FL100_KT = 250;
const ARRIVAL_HIGH_KT = 280;
const DEPARTURE_HIGH_KT = 290;
/** Arrivals slow to this speed on their own within this distance of the airport (NM) without a speed instruction. */
const OWN_APPROACH_KT = 220;
const OWN_APPROACH_NM = 15;
/** Holding speed and the time of a leg (s). */
const HOLDING_KT = 220;
const HOLDING_LEG_S = 60;
/** A fix counts as reached within this distance (NM). */
const FIX_REACHED_NM = 1.2;
/** The localizer is captured at most this far from the threshold (NM) and with at most this intercept angle (degrees). */
const LOC_RANGE_NM = 25;
const LOC_MAX_INTERCEPT = 100;
/** Tracking the localizer: degrees of heading correction per metre off the centreline, and the largest one. */
const LOC_GAIN_DEG_PER_M = 1 / 25;
const LOC_MAX_CORRECTION = 30;
/** Established: this close to the centreline (m) and aligned within this many degrees. */
const ESTABLISHED_M = 60;
const ESTABLISHED_DEG = 5;
/** Departures turn towards their SID exit fix from this height above the aerodrome (ft). */
const SID_TURN_AGL_FT = 1000;
/** The AI Tower hands a departure or a go-around to you passing this height above the aerodrome (ft). */
const AI_TOWER_HANDOFF_AGL_FT = 1500;
/** You staff Tower too: a go-around not handed to you by this height is taken over anyway (ft, a missed hand-off). */
const LATE_GO_AROUND_HANDOFF_AGL_FT = 3500;
/** Separation minima of the terminal area (radar): 3 NM or 1000 ft. */
export const RADAR_SEPARATION_NM = 3;
export const VERTICAL_SEPARATION_FT = 1000;
/** STCA looks this far ahead (s) along the current tracks. */
const STCA_LOOKAHEAD_S = 60;
/** Aircraft further than this from the airport (NM) have left the radar picture and are removed. */
const RADAR_COVERAGE_NM = 60;
/** Arrivals appear this far (NM) before their entry fix, on the side of their origin. */
export const ENTRY_SPAWN_NM = 12;
/** Two arrivals over the same entry fix: at least this many seconds apart (Center delivers them separated). */
export const ENTRY_INTERVAL_S = 240;
/** The crew asks for the frequency change at this distance from the threshold (NM) if you have not handed it to Tower. */
const HANDOFF_REQUEST_NM = 5;
/** Still with you at this distance: the crew changes to Tower itself (a missed hand-off). */
const HANDOFF_SELF_NM = 2.5;
/** Glide slope (3 degrees). */
const GLIDE_SLOPE = Math.tan((3 * Math.PI) / 180);

/** A holding in progress: the leg the crew is on and when the timed leg ends. */
export interface HoldState {
  fix: string;
  /** Inbound course, degrees true. */
  inboundTrue: number;
  turn: 'left' | 'right';
  leg: 'toFix' | 'outboundTurn' | 'outbound' | 'inboundTurn';
  legUntil: number;
  /** Entered the hold (first time over the fix), for the "entering the hold" call. */
  entered: boolean;
}

/** What a crew has been told by Approach / Departure and what it flies (radar). */
export interface RadarState {
  /** Assigned heading (degrees magnetic) and the turn direction if one was given; undefined = own navigation. */
  heading?: number;
  turn?: 'left' | 'right';
  /** Own navigation: the fixes still to fly to, in order (STAR, SID exit fix, "proceed direct"). */
  route: string[];
  /** Hold at the last fix of the route when reaching it ("hold at LBU", or the end of the STAR without a clearance). */
  holdAtEnd?: string;
  hold?: HoldState;
  /** Cleared altitude in feet (flight levels as feet: FL100 = 10000) and whether it was a flight level. */
  clearedFt: number;
  clearedFl: boolean;
  /** Assigned indicated airspeed (kt); undefined: the crew's own speed. */
  speedKt?: number;
  /** Indicated airspeed flown now (kt). Without wind aloft it is the ground speed. */
  ias: number;
  /** Approach clearance: the runway end and the procedure. */
  approach?: { runway: string; kind: 'ILS' | 'RNP' | 'LOC' };
  /** Turning onto / tracking the final approach course. */
  locCaptured?: boolean;
  established?: boolean;
  /** "Report established": the crew reports once it is established. */
  reportEstablished?: boolean;
  /** The crew made its first call to you / you answered it. */
  checkedIn?: boolean;
  identified?: boolean;
  /** Departures: the Center sector they go to. */
  sector?: CenterSectorData;
  /** Departures: handed to Center (or left your airspace). */
  toCenter?: boolean;
  /** MSAW warning given for this aircraft (once until it climbs above the MVA again). */
  msaw?: boolean;
  /** The crew asked for the frequency change to Tower on final. */
  askedTower?: boolean;
  /** The RNAV transition to final the crew flies (its route is in `route`), e.g. "LBU 25". */
  transition?: string;
  /** Own navigation to the final: the gate before the intercept point is passed (or not needed). */
  gatePassed?: boolean;
  /** Flying the missed approach (a go-around taken over by the radar). */
  missedApproach?: boolean;
}

/** The terminal airspace in local coordinates. */
export class Airspace {
  readonly fixes = new Map<string, { pos: Vec2; kind: FixData['kind'] }>();
  readonly entries: ArrivalEntryData[];
  readonly holdings: HoldingData[];
  readonly sectors: CenterSectorData[];

  constructor(
    readonly data: AirspaceData,
    proj: LocalProjection,
  ) {
    for (const f of data.fixes) this.fixes.set(f.name.toUpperCase(), { pos: proj.toLocal(f.pos), kind: f.kind });
    this.entries = data.entries;
    this.holdings = data.holdings;
    this.sectors = data.centerSectors;
  }

  fix(name: string | undefined): Vec2 | undefined {
    return name ? this.fixes.get(name.toUpperCase())?.pos : undefined;
  }

  /** Fix names (for the parser and the menus). */
  get fixNames(): string[] {
    return [...this.fixes.keys()];
  }

  /** The entry an arrival from this bearing (degrees true from the airport to its origin) uses. */
  entryFor(bearing: number): ArrivalEntryData {
    return this.entries.find((e) => inSectorDeg(bearing, e.from)) ?? this.entries[0];
  }

  /** The Center sector a departure via this exit fix goes to (the first one takes every fix not listed). */
  sectorFor(fix: string | undefined): CenterSectorData {
    return this.sectors.find((s) => !!fix && s.fixes.includes(fix.toUpperCase())) ?? this.sectors[0];
  }

  /** All Center frequencies. */
  get centerFrequencies(): string[] {
    return [...new Set(this.sectors.map((s) => s.frequency))];
  }

  /** Minimum vectoring altitude at a position (feet). */
  mvaAt(p: Vec2): number {
    const nm = length(p) / M_PER_NM;
    const brg = headingOf(p);
    let mva = this.data.mvaFt;
    for (const a of this.data.mvaAreas ?? []) if (nm > a.beyondNm && inSectorDeg(brg, a.from)) mva = Math.max(mva, a.altFt);
    return mva;
  }

  /** The published holding over a fix, if any. */
  holding(fix: string): HoldingData | undefined {
    return this.holdings.find((h) => h.fix === fix.toUpperCase());
  }
}

/** True if `deg` lies in the sector clockwise from `range[0]` to `range[1]` (degrees). */
export function inSectorDeg(deg: number, range: [number, number]): boolean {
  const [a, b] = range;
  if (b - a >= 360) return true;
  const d = normHeading(deg - a);
  return d <= normHeading(b - a);
}

/** Magnetic heading (what the crew and the scope show) from a true one, and back. */
export function toMagnetic(sim: Simulation, trueHdg: number): number {
  return normHeading(trueHdg - sim.config.airport.magneticVariation);
}
export function toTrue(sim: Simulation, magHdg: number): number {
  return normHeading(magHdg + sim.config.airport.magneticVariation);
}

/** "090", "250", "360". */
export function headingText(h: number): string {
  const r = Math.round(normHeading(h)) || 360;
  return String(r).padStart(3, '0');
}

/** Flight level or altitude in words as said on the radio: "flight level 100", "altitude 5000 feet". */
export function levelText(ft: number, fl: boolean): string {
  return fl ? `flight level ${String(Math.round(ft / 100)).padStart(2, '0')}` : `${Math.round(ft)} feet`;
}

/** True if the user works the Approach / Departure position (the radar) at an airport that has the airspace data. */
export function radarActive(sim: Simulation): boolean {
  return !!sim.airspace && sim.userControls('APP');
}

/** Initial radar state of an airborne aircraft. */
function newState(ac: Aircraft, clearedFt: number, clearedFl: boolean, route: string[]): RadarState {
  return { route, clearedFt, clearedFl, ias: ac.speed / KT_TO_MS };
}

/** Altitude above which a level is a flight level (the transition level). */
export function isFlightLevel(sim: Simulation, ft: number): boolean {
  return ft >= sim.transitionLevel(sim.atis.qnh) * 100;
}

// ====================================================================== spawning

/**
 * An arrival handed over by Center: before its entry fix, on the side of its origin, descending to the hand-over
 * level, flying the STAR (entry fix, then the IAF). It calls you right away.
 */
export function setupInbound(sim: Simulation, ac: Aircraft, origin: string): void {
  const as = sim.airspace!;
  const entry = as.entryFor(sim.bearingTo(origin) ?? 0);
  const fix = as.fix(entry.fix)!;
  const out = length(fix) > 1 ? scale(fix, 1 / length(fix)) : headingVector(sim.bearingTo(origin) ?? 0);
  // Slightly to the side of the straight line, each flight differently.
  const side = (sim.variation(`${ac.callsign}:entry`) - 0.5) * 4 * M_PER_NM;
  const across = { x: out.y, y: -out.x };
  ac.pos = add(add(fix, scale(out, ENTRY_SPAWN_NM * M_PER_NM)), scale(across, side));
  ac.heading = headingOf(sub(fix, ac.pos));
  ac.altitudeFt = entry.levelFt + 2000 + Math.round(sim.variation(`${ac.callsign}:lvl`) * 2) * 1000;
  ac.onGround = false;
  ac.phase = 'inbound';
  ac.frequency = 'APP';
  const ias = ac.altitudeFt > 10000 ? ARRIVAL_HIGH_KT : SPEED_LIMIT_FL100_KT;
  ac.speed = ias * KT_TO_MS;
  ac.verticalSpeedFpm = -DESCENT_FPM;
  const route = [...new Set([entry.fix, ...(entry.via ?? []), entry.iaf])].filter((f) => as.fix(f));
  ac.radar = { ...newState(ac, entry.levelFt, isFlightLevel(sim, entry.levelFt), route), holdAtEnd: entry.iaf };
  ac.flightPlan.route = `${route.join(' ')} ${sim.config.airport.icao}`;
  // The first call a few seconds after the hand-over from Center.
  ac.standbyUntil = sim.time + 3 + 8 * sim.variation(`${ac.callsign}:ci`);
}

// ====================================================================== the per-step update

export function updateRadar(sim: Simulation, dt: number): void {
  const as = sim.airspace;
  if (!as) return;
  const active = radarActive(sim);
  for (const ac of sim.aircraft) {
    if (ac.onGround || ac.phase === 'gone') continue;
    // A go-around starts afresh: straight ahead, missed approach altitude (also one that was under your vectors).
    if (ac.phase === 'goAround' && ac.radar && !ac.radar.missedApproach) ac.radar = undefined;
    if (active && !ac.radar) adoptAirborne(sim, ac);
    if (!ac.radar) continue;
    if (ac.phase === 'inbound') {
      // Nobody works Approach any more (you switched the frequency off): the simulator's Approach takes the arrival
      // and puts it on final, as it does when it re-sequences arrivals after a runway change.
      if (!active) {
        ac.radar = undefined;
        sim.tower.setupApproach(ac, Math.min(16, Math.max(9, sim.distanceToThresholdNm(ac))), sim.runwayFor(ac.assignedStand, ac.type, 'arrival', sim.bearingTo(ac.flightPlan.departure)));
        continue;
      }
      arrivalCheckIn(sim, ac);
      fly(sim, ac, dt);
      checkLocalizer(sim, ac);
    } else if (ac.phase === 'climb' || ac.phase === 'goAround') {
      fly(sim, ac, dt);
      departureChecks(sim, ac, active);
    } else if (ac.phase === 'approach') {
      finalChecks(sim, ac, active);
    }
    if (ac.radar && length(ac.pos) > RADAR_COVERAGE_NM * M_PER_NM && ac.phase !== 'approach') {
      if (ac.phase === 'climb') sim.stats.departuresAirborne++;
      ac.phase = 'gone';
    }
  }
  updateRadarAlerts(sim, active);
}

/**
 * Takes an airborne aircraft into the radar picture once you work Approach: departures after take-off (they fly
 * their SID climb towards the exit fix), go-arounds (straight ahead to the missed approach altitude).
 */
function adoptAirborne(sim: Simulation, ac: Aircraft): void {
  const as = sim.airspace!;
  if (ac.category === 'departure' && ac.phase === 'climb') {
    const sid = sim.config.airport.sids.find((s) => s.name === ac.flightPlan.sid);
    const climb = sim.config.airport.initialClimbFt ?? 5000;
    // The SID's waypoints (or direct to its exit fix).
    const sidRoute = (sid?.route ?? (sid?.fix ? [sid.fix] : [])).filter((f) => as.fix(f));
    ac.radar = newState(ac, climb, isFlightLevel(sim, climb), sidRoute);
    ac.radar.sector = as.sectorFor(sid?.fix);
    ac.radar.ias = Math.max(ac.radar.ias, ac.type.vrKt + 20);
    return;
  }
  // Already on final when you take over (e.g. a hand-over start): established, cleared for the approach.
  if (ac.phase === 'approach' && ac.category === 'arrival') {
    const end = sim.tower.endFor(ac.runway);
    const alt = Math.round(ac.altitudeFt / 100) * 100;
    ac.radar = { ...newState(ac, Math.max(alt, sim.airport.data.elevationFt), false, []), approach: { runway: end.name, kind: approachKind(sim, end.name) }, locCaptured: true, established: true, checkedIn: true, identified: true };
    return;
  }
  if (ac.phase === 'goAround') {
    const end = sim.tower.endFor(ac.runway);
    ac.radar = { ...newState(ac, as.data.missedApproachFt, false, []), missedApproach: true };
    ac.radar.heading = Math.round(toMagnetic(sim, end.heading));
    ac.radar.ias = Math.max(ac.radar.ias, ac.type.approachSpeedKt);
    ac.radar.speedKt = Math.max(180, ac.type.approachSpeedKt + 30);
    ac.verticalSpeedFpm = GO_AROUND_FPM;
    ac.landingCleared = false;
    ac.continueApproachGiven = false;
    ac.towerContact = false;
    ac.shortFinalCall = false;
    ac.landingAsked = false;
    ac.weatherChecked = false;
    // Already talking to you (you work Tower and Approach, or it was still with you on final).
    if (ac.frequency === 'APP') {
      ac.radar.checkedIn = true;
      ac.phase = 'inbound';
    }
  }
}

/** The approach procedure in use on a runway (ATIS): ILS, localizer or RNP. */
export function approachKind(sim: Simulation, runway: string): 'ILS' | 'RNP' | 'LOC' {
  return sim.approachTypeFor(runway) as 'ILS' | 'RNP' | 'LOC';
}

/** The first call of an arrival Center has handed over: level, cleared level and the ATIS letter. */
function arrivalCheckIn(sim: Simulation, ac: Aircraft): void {
  const r = ac.radar!;
  if (r.checkedIn || ac.frequency !== 'APP' || sim.time < ac.standbyUntil) return;
  r.checkedIn = true;
  sim.radarCall(ac, 'checkIn', checkInText(sim, ac));
}

/** Present level and the cleared one: "flight level 128, descending flight level 100" / "passing 3000 feet, climbing ...". */
function levelReport(sim: Simulation, ac: Aircraft): string {
  const r = ac.radar!;
  const now = Math.round(ac.altitudeFt / 100) * 100;
  if (Math.abs(now - r.clearedFt) < 200) return levelText(r.clearedFt, r.clearedFl);
  const verb = r.clearedFt > now ? 'climbing' : 'descending';
  return `${ac.category === 'departure' ? 'passing ' : ''}${levelText(now, isFlightLevel(sim, now))}, ${verb} ${levelText(r.clearedFt, r.clearedFl)}`;
}

/** The first call on your radar frequency (also its reminder): arrivals with the ATIS letter, departures with the SID. */
export function checkInText(sim: Simulation, ac: Aircraft): string {
  const r = ac.radar!;
  const station = sim.stationName('APP');
  if (r.missedApproach) return `${station}, ${sim.tel(ac)}, missed approach, ${levelReport(sim, ac)}, heading ${headingText(r.heading ?? toMagnetic(sim, ac.heading))}`;
  if (ac.category === 'departure') return `${station}, ${sim.tel(ac)}, ${ac.flightPlan.sid ? `${ac.flightPlan.sid} departure, ` : ''}${levelReport(sim, ac)}`;
  return `${station}, ${sim.tel(ac)}, ${levelReport(sim, ac)}, information ${sim.atisLetterOf(ac)}`;
}

// ====================================================================== flying

function targetIas(ac: Aircraft, r: RadarState): number {
  const minKt = ac.type.approachSpeedKt + (r.locCaptured ? 5 : 15);
  let kt: number;
  if (r.speedKt !== undefined) kt = r.speedKt;
  else if (r.hold) kt = HOLDING_KT;
  else if (ac.category === 'departure' && ac.phase === 'climb') kt = ac.altitudeFt >= 10000 ? DEPARTURE_HIGH_KT : SPEED_LIMIT_FL100_KT;
  else if (r.locCaptured) kt = 180;
  else if (ac.altitudeFt > 10000) kt = ARRIVAL_HIGH_KT;
  else kt = length(ac.pos) < OWN_APPROACH_NM * M_PER_NM ? OWN_APPROACH_KT : SPEED_LIMIT_FL100_KT;
  return Math.max(minKt, kt);
}

/** Lateral, vertical and speed changes of one step. */
function fly(sim: Simulation, ac: Aircraft, dt: number): void {
  const r = ac.radar!;
  // Speed.
  const target = targetIas(ac, r);
  r.ias = r.ias < target ? Math.min(target, r.ias + ACCEL_KT_S * dt) : Math.max(target, r.ias - DECEL_KT_S * dt);
  ac.speed = r.ias * KT_TO_MS;

  // Vertical: towards the cleared level, slowing the rate in the last few hundred feet.
  const diff = r.clearedFt - ac.altitudeFt;
  const climbRate = ac.phase === 'goAround' ? GO_AROUND_FPM : Math.max(800, ac.type.climbFpm * (1 - Math.min(0.6, ac.altitudeFt / 40000)));
  const rate = diff > 0 ? climbRate : DESCENT_FPM;
  const fpm = Math.sign(diff) * Math.min(rate, Math.abs(diff) * 6);
  ac.verticalSpeedFpm = Math.abs(diff) < 1 ? 0 : fpm;
  ac.altitudeFt += (ac.verticalSpeedFpm / 60) * dt;
  if (Math.abs(r.clearedFt - ac.altitudeFt) < 1) ac.altitudeFt = r.clearedFt;

  // Lateral.
  const desired = desiredHeading(sim, ac, r);
  if (desired !== undefined) turnTowards(ac, desired, r.locCaptured || r.heading === undefined ? undefined : r.turn, dt);
  const v = headingVector(ac.heading);
  ac.pos = { x: ac.pos.x + v.x * ac.speed * dt, y: ac.pos.y + v.y * ac.speed * dt };
}

function turnTowards(ac: Aircraft, desired: number, turn: 'left' | 'right' | undefined, dt: number): void {
  let d = headingDiff(ac.heading, desired);
  // A turn direction given with the heading is kept until the aircraft is nearly there.
  if (turn === 'left' && d > 5) d -= 360;
  if (turn === 'right' && d < -5) d += 360;
  const step = TURN_RATE_DEG_S * dt;
  ac.heading = normHeading(Math.abs(d) <= step ? desired : ac.heading + Math.sign(d) * step);
}

/** The heading the crew wants to fly now (degrees true), or undefined to keep the present one. */
function desiredHeading(sim: Simulation, ac: Aircraft, r: RadarState): number | undefined {
  const as = sim.airspace!;
  if (r.locCaptured && r.approach) {
    const end = sim.tower.endFor(r.approach.runway);
    const { cross } = finalCoordinates(end, ac.pos);
    return normHeading(end.heading - clamp(cross * LOC_GAIN_DEG_PER_M, -LOC_MAX_CORRECTION, LOC_MAX_CORRECTION));
  }
  if (r.heading !== undefined) {
    // The turn direction only matters at the start of the turn.
    if (r.turn && Math.abs(headingDiff(ac.heading, toTrue(sim, r.heading))) < 5) r.turn = undefined;
    return toTrue(sim, r.heading);
  }
  if (r.hold) return holdHeading(sim, ac, r.hold);
  // Cleared for the approach on its own navigation (no vectors, the route flown): to the intercept point on the
  // extended centre line, then onto the final course (a simplified transition to final).
  if (r.approach && !r.route.length && ac.category === 'arrival') {
    const end = sim.tower.endFor(r.approach.runway);
    const ip = sub(end.threshold, scale(headingVector(end.heading), INTERCEPT_POINT_NM * M_PER_NM));
    const { along, cross } = finalCoordinates(end, ac.pos);
    // A direct to the intercept point that would meet the final at more than 70 degrees (e.g. from the airport side):
    // first to a gate 4 NM further out and 3 NM to the side, then to the intercept point (a 37 degree intercept).
    if (!r.gatePassed) {
      const toIp = headingOf(sub(ip, ac.pos));
      const side = cross >= 0 ? 1 : -1;
      const gate = add(sub(ip, scale(headingVector(end.heading), 4 * M_PER_NM)), scale(headingVector(end.heading + 90), side * 3 * M_PER_NM));
      if (Math.abs(headingDiff(end.heading, toIp)) <= 70 || distance(ac.pos, gate) < 1.5 * M_PER_NM || -along > (INTERCEPT_POINT_NM + 3) * M_PER_NM) r.gatePassed = true;
      else return headingOf(sub(gate, ac.pos));
    }
    // Near the intercept point, or already on the extended centre line inside it: onto the final course.
    const inbound = Math.abs(headingDiff(end.heading, ac.heading)) < 90;
    if (distance(ac.pos, ip) < 2 * M_PER_NM || (inbound && along < 0 && -along < INTERCEPT_POINT_NM * M_PER_NM && Math.abs(cross) < 1.5 * M_PER_NM)) {
      return normHeading(end.heading - clamp(cross * LOC_GAIN_DEG_PER_M, -LOC_MAX_CORRECTION, LOC_MAX_CORRECTION));
    }
    return headingOf(sub(ip, ac.pos));
  }
  // Departures fly the runway heading until they are high enough to turn towards the SID exit fix.
  if (ac.category === 'departure' && ac.altitudeFt - sim.airport.data.elevationFt < SID_TURN_AGL_FT) return undefined;
  const next = r.route[0];
  const p = as.fix(next);
  if (!p) return undefined;
  if (distance(ac.pos, p) < FIX_REACHED_NM * M_PER_NM) {
    r.route.shift();
    if (!r.route.length && r.holdAtEnd === next && ac.category === 'arrival') {
      enterHold(sim, ac, r, next);
      return holdHeading(sim, ac, r.hold!);
    }
    return desiredHeading(sim, ac, r);
  }
  return headingOf(sub(p, ac.pos));
}

function enterHold(sim: Simulation, ac: Aircraft, r: RadarState, fix: string): void {
  const as = sim.airspace!;
  const pub = as.holding(fix);
  const p = as.fix(fix)!;
  const inbound = pub ? toTrue(sim, pub.inboundCourse) : headingOf(sub({ x: 0, y: 0 }, p));
  r.hold = { fix, inboundTrue: inbound, turn: pub?.turn ?? 'right', leg: 'outboundTurn', legUntil: 0, entered: true };
  r.holdAtEnd = undefined;
  // Without a clearance beyond the IAF the crew holds there and asks for instructions.
  if (sim.isOnMyFrequency(ac)) {
    ac.request = null;
    sim.radarCall(ac, 'vectors', `${sim.stationName('APP')}, ${sim.tel(ac)}, entering the hold over ${fix}, ${levelText(ac.radar!.clearedFt, ac.radar!.clearedFl)}, request further instructions`);
  }
}

/** Racetrack over the fix: turn outbound, one minute outbound, turn inbound, back to the fix. */
function holdHeading(sim: Simulation, ac: Aircraft, h: HoldState): number {
  const p = sim.airspace!.fix(h.fix)!;
  const outbound = normHeading(h.inboundTrue + 180);
  switch (h.leg) {
    case 'toFix':
      if (distance(ac.pos, p) < 0.8 * M_PER_NM) h.leg = 'outboundTurn';
      return headingOf(sub(p, ac.pos));
    case 'outboundTurn':
      if (Math.abs(headingDiff(ac.heading, outbound)) < 5) {
        h.leg = 'outbound';
        h.legUntil = sim.time + HOLDING_LEG_S;
      }
      return turnDirTarget(ac.heading, outbound, h.turn);
    case 'outbound':
      if (sim.time >= h.legUntil) h.leg = 'inboundTurn';
      return outbound;
    case 'inboundTurn': {
      const toFix = headingOf(sub(p, ac.pos));
      if (Math.abs(headingDiff(ac.heading, toFix)) < 10) h.leg = 'toFix';
      return turnDirTarget(ac.heading, toFix, h.turn);
    }
  }
}

/** A heading 90 degrees further in the turn direction until the target is within reach (keeps the turn going one way). */
function turnDirTarget(current: number, target: number, turn: 'left' | 'right'): number {
  const d = headingDiff(current, target);
  if (turn === 'right' && d < -5) return normHeading(current + 90);
  if (turn === 'left' && d > 5) return normHeading(current - 90);
  return target;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Position relative to the final approach course: `along` (negative before the threshold), `cross` (right of it positive). */
export function finalCoordinates(end: RunwayEnd, p: Vec2): { along: number; cross: number } {
  const d = sub(p, end.threshold);
  return { along: dot(d, headingVector(end.heading)), cross: dot(d, headingVector(end.heading + 90)) };
}

/** Glide path altitude (feet) at a distance before the threshold (m). */
export function glidePathFt(end: RunwayEnd, beforeThresholdM: number): number {
  return end.elevationFt + 50 + (Math.max(0, beforeThresholdM) * GLIDE_SLOPE) / M_PER_FT;
}

/** Localizer capture and the change to the final approach (the Tower's part: 'approach' phase). */
function checkLocalizer(sim: Simulation, ac: Aircraft): void {
  const r = ac.radar!;
  if (!r.approach) return;
  const end = sim.tower.endFor(r.approach.runway);
  const { along, cross } = finalCoordinates(end, ac.pos);
  if (along > 0 || -along > LOC_RANGE_NM * M_PER_NM) {
    r.locCaptured = false;
    return;
  }
  const angle = headingDiff(end.heading, ac.heading);
  if (!r.locCaptured) {
    if (Math.abs(angle) > LOC_MAX_INTERCEPT) return;
    // Still on the STAR or a direct-to: the localizer is armed only outside 6 NM (crossing the final course near
    // the airport on the way to the IAF is not an intercept).
    if (-along < (r.route.length ? LOC_ARM_ON_ROUTE_NM : LOC_MIN_CAPTURE_NM) * M_PER_NM) return;
    // Closing in on the centreline (or already on it): capture with the lead of a standard rate turn.
    const closing = Math.abs(cross) < 150 || Math.sign(cross) === -Math.sign(Math.sin((angle * Math.PI) / 180));
    const radius = ac.speed / ((TURN_RATE_DEG_S * Math.PI) / 180);
    const lead = radius * (1 - Math.cos((Math.abs(angle) * Math.PI) / 180)) + 100;
    if (!closing || Math.abs(cross) > lead) return;
    r.locCaptured = true;
    r.heading = undefined;
    r.turn = undefined;
    r.route = [];
    r.hold = undefined;
    r.holdAtEnd = undefined;
  }
  if (!r.established && Math.abs(cross) < ESTABLISHED_M && Math.abs(angle) < ESTABLISHED_DEG) {
    r.established = true;
    if (r.reportEstablished && sim.isOnMyFrequency(ac)) {
      r.reportEstablished = false;
      sim.radarInform(ac, `${sim.tel(ac)}, established ${r.approach.kind === 'ILS' || r.approach.kind === 'LOC' ? 'localizer' : 'on final approach course'} runway ${r.approach.runway}`);
    }
  }
  // Far above the glide path when established: the crew cannot make the approach and asks for vectors.
  if (r.established && ac.altitudeFt > glidePathFt(end, -along) + TOO_HIGH_FT) {
    tooHigh(sim, ac);
    return;
  }
  // On the glide path (from below or at it): the final approach starts - flown like the arrivals of the simulator's
  // Approach (speed profile, landing), still on your frequency until you hand it to Tower.
  if (r.established && ac.altitudeFt >= glidePathFt(end, -along) - 150) startFinal(sim, ac, end, along);
}

/** On a route (STAR, direct-to) the localizer is captured only this far from the threshold or further (NM). */
const LOC_ARM_ON_ROUTE_NM = 6;
/** Closer than this (NM) the localizer is not captured any more (too late for a stable approach). */
const LOC_MIN_CAPTURE_NM = 4;
/** Established this far above the glide path (ft): too high for a stable approach. */
const TOO_HIGH_FT = 1200;

function tooHigh(sim: Simulation, ac: Aircraft): void {
  const r = ac.radar!;
  const level = Math.round(ac.altitudeFt / 100) * 100;
  r.approach = undefined;
  r.locCaptured = false;
  r.established = false;
  r.heading = Math.round(toMagnetic(sim, ac.heading)) || 360;
  r.clearedFt = Math.max(level, sim.airspace!.mvaAt(ac.pos));
  r.clearedFl = false;
  if (sim.isOnMyFrequency(ac)) {
    ac.request = null;
    sim.radarCall(ac, 'vectors', `${sim.stationName(ac.frequency)}, ${sim.tel(ac)}, too high for the approach, maintaining ${levelText(r.clearedFt, false)}, heading ${headingText(r.heading)}, request vectors for a new approach`);
  }
}

function startFinal(sim: Simulation, ac: Aircraft, end: RunwayEnd, along: number): void {
  const r = ac.radar!;
  ac.pos = add(end.threshold, scale(headingVector(end.heading), along));
  ac.heading = end.heading;
  ac.runway = end.name;
  ac.flightPlan.runway = end.name;
  ac.phase = 'approach';
  r.missedApproach = false;
  // A speed instruction holds until 4 NM (as on final); otherwise the profile from the present speed.
  ac.speedRestriction = r.speedKt !== undefined ? { kt: Math.max(r.speedKt, ac.type.approachSpeedKt), untilNm: 4 } : undefined;
  ac.approachProfile = profileFrom(sim, ac);
  ac.approachHandoffNm = sim.airspace!.data.towerHandoffNm;
}

/** The approach profile of the Tower (180 kt intercept, 160 kt to 4 NM) starting at the present speed if it is lower. */
function profileFrom(sim: Simulation, ac: Aircraft): ApproachProfile {
  const p = sim.tower.profileOf(ac);
  const ias = ac.speed / KT_TO_MS;
  return { ...p, interceptKt: Math.max(p.finalKt, Math.min(p.interceptKt, Math.round(ias))) };
}

/** On final with you: the crew asks for Tower if you forget, and changes over itself at the latest at 2.5 NM. */
function finalChecks(sim: Simulation, ac: Aircraft, active: boolean): void {
  const r = ac.radar!;
  if (ac.frequency !== 'APP' || !active) return;
  const nm = sim.distanceToThresholdNm(ac);
  // Asked again if the call was lost on a busy frequency.
  if (nm < HANDOFF_REQUEST_NM && ac.request !== 'radar' && !sim.frequency.hasQueued(ac.callsign) && (!r.askedTower || sim.time - ac.lastCallAt > 25)) {
    r.askedTower = true;
    sim.radarCall(ac, 'radar', `${sim.stationName('APP')}, ${sim.tel(ac)}, ${Math.round(nm)} miles final runway ${ac.runway}, request frequency change`);
  }
  if (nm < HANDOFF_SELF_NM) {
    sim.stats.radarHandoffsMissed++;
    sim.updateScore();
    sim.system(`${ac.callsign} changed to Tower on its own at ${nm.toFixed(1)} NM - hand arrivals to Tower by ${sim.airspace!.data.towerHandoffNm} NM final.`, 'warning', ac.callsign);
    sim.frequency.release(ac.callsign);
    ac.request = null;
    ac.frequency = sim.stationFor('tower');
  }
}

/**
 * Departures and go-arounds: taken over from the AI Tower passing 1500 ft, hand-off to Center at the edge of your
 * airspace (or a missed hand-off), and the go-around back into the arrival flow.
 */
function departureChecks(sim: Simulation, ac: Aircraft, active: boolean): void {
  const r = ac.radar!;
  const tower = sim.stationFor('tower');
  const agl = ac.altitudeFt - sim.airport.data.elevationFt;
  if (active && ac.frequency === tower && !sim.userTower && agl > AI_TOWER_HANDOFF_AGL_FT && !r.toCenter) {
    ac.frequency = 'APP';
    ac.request = null;
  }
  // You staff Tower too and forgot the go-around: the crew calls Radar anyway (a missed hand-off).
  if (active && ac.phase === 'goAround' && ac.frequency === tower && sim.userTower && agl > LATE_GO_AROUND_HANDOFF_AGL_FT) {
    sim.stats.handoffsMissed++;
    sim.updateScore();
    sim.system(`${ac.callsign} (go-around) changed to Radar on its own - hand go-arounds to Radar early.`, 'warning', ac.callsign);
    sim.frequency.release(ac.callsign);
    ac.frequency = 'APP';
    ac.request = null;
  }
  // First call on your frequency.
  if (ac.frequency === 'APP' && active && !r.checkedIn) {
    r.checkedIn = true;
    if (ac.phase === 'goAround') {
      ac.phase = 'inbound';
      sim.radarCall(ac, 'checkIn', `${sim.stationName('APP')}, ${sim.tel(ac)}, going around, climbing ${levelText(r.clearedFt, r.clearedFl)}, heading ${headingText(r.heading ?? toMagnetic(sim, ac.heading))}`);
      return;
    }
    sim.radarCall(ac, 'checkIn', checkInText(sim, ac));
  }
  if (ac.phase === 'goAround' && ac.frequency !== 'APP') return;
  // Leaving your airspace still on your frequency: Center takes it over (a missed hand-off).
  if (ac.category === 'departure' && !r.toCenter && length(ac.pos) > sim.airspace!.data.radiusNm * M_PER_NM) {
    r.toCenter = true;
    if (ac.frequency === 'APP' && active) {
      sim.stats.radarHandoffsMissed++;
      sim.updateScore();
      sim.system(`${ac.callsign} left your airspace without a hand-off to ${r.sector?.callsign ?? 'Center'} ${r.sector?.frequency ?? ''}.`, 'warning', ac.callsign);
      sim.frequency.release(ac.callsign);
      ac.request = null;
      ac.frequency = 'CTR';
    }
  }
  // With Center: it climbs on towards its cruising level.
  if (r.toCenter && ac.frequency === 'CTR') {
    r.clearedFt = Math.max(r.clearedFt, ac.flightPlan.cruiseFl * 100);
    r.clearedFl = true;
    r.speedKt = undefined;
    r.heading = undefined;
  }
}

// ====================================================================== alerts

/** Pairs in conflict now (STCA), by key "A|B". */
const STCA_PAIRS = new WeakMap<Simulation, Set<string>>();

/** Current STCA conflicts (pair keys), for the scope. */
export function stcaPairs(sim: Simulation): Set<string> {
  let s = STCA_PAIRS.get(sim);
  if (!s) STCA_PAIRS.set(sim, (s = new Set()));
  return s;
}

/** True if the aircraft is part of an STCA conflict. */
export function inConflict(sim: Simulation, callsign: string): boolean {
  for (const k of stcaPairs(sim)) if (k.split('|').includes(callsign)) return true;
  return false;
}

function updateRadarAlerts(sim: Simulation, active: boolean): void {
  // Once per second is enough.
  if (Math.floor(sim.time) === Math.floor(sim.time - 0.2 + 1e-9)) return;
  const pairs = stcaPairs(sim);
  if (!active) {
    pairs.clear();
    return;
  }
  const elev = sim.airport.data.elevationFt;
  const air = sim.aircraft.filter((a) => !a.onGround && a.phase !== 'gone' && a.altitudeFt - elev > 1000 && a.phase !== 'landing');
  const now = new Set<string>();
  for (let i = 0; i < air.length; i++) {
    for (let j = i + 1; j < air.length; j++) {
      const a = air[i];
      const b = air[j];
      if (!a.radar && !b.radar) continue;
      if (Math.abs(a.altitudeFt - b.altitudeFt) >= VERTICAL_SEPARATION_FT - 50) continue;
      const d = distance(a.pos, b.pos) / M_PER_NM;
      // Close now, or closing to it within the look-ahead (straight lines).
      let conflict = d < RADAR_SEPARATION_NM - 0.05;
      if (!conflict && d < 8) {
        const va = scale(headingVector(a.heading), a.speed);
        const vb = scale(headingVector(b.heading), b.speed);
        const rel = sub(b.pos, a.pos);
        const dv = sub(vb, va);
        const t = Math.min(STCA_LOOKAHEAD_S, Math.max(0, -dot(rel, dv) / Math.max(1e-6, dot(dv, dv))));
        const closest = length(add(rel, scale(dv, t))) / M_PER_NM;
        const vNow = Math.abs(a.altitudeFt + (a.verticalSpeedFpm * t) / 60 - (b.altitudeFt + (b.verticalSpeedFpm * t) / 60));
        conflict = closest < RADAR_SEPARATION_NM - 0.5 && vNow < VERTICAL_SEPARATION_FT && t > 0;
      }
      if (!conflict) continue;
      const key = [a.callsign, b.callsign].sort().join('|');
      now.add(key);
      // A loss of separation (not only predicted) counts once per pair and encounter.
      if (!pairs.has(key) && d < RADAR_SEPARATION_NM - 0.05) {
        sim.stats.radarSeparationLosses++;
        sim.updateScore();
        sim.system(`STCA: ${a.callsign} and ${b.callsign} - ${d.toFixed(1)} NM, ${Math.round(Math.abs(a.altitudeFt - b.altitudeFt) / 100) * 100} ft (minimum ${RADAR_SEPARATION_NM} NM / ${VERTICAL_SEPARATION_FT} ft).`, 'warning', a.callsign);
      }
    }
  }
  pairs.clear();
  for (const k of now) pairs.add(k);

  // MSAW: an aircraft under your vectors below the minimum vectoring altitude (not on the final approach).
  const as = sim.airspace!;
  for (const ac of sim.aircraft) {
    const r = ac.radar;
    if (!r || ac.phase !== 'inbound' || ac.frequency !== 'APP' || r.locCaptured) continue;
    const mva = as.mvaAt(ac.pos);
    if (ac.altitudeFt < mva - 100 && ac.verticalSpeedFpm <= 0 && r.clearedFt < mva) {
      if (!r.msaw) {
        r.msaw = true;
        sim.stats.mvaViolations++;
        sim.updateScore();
        sim.system(`MSAW: ${ac.callsign} at ${Math.round(ac.altitudeFt / 100) * 100} ft is below the minimum vectoring altitude ${mva} ft.`, 'warning', ac.callsign);
      }
    } else if (ac.altitudeFt >= mva) r.msaw = false;
  }
}

/** Distance (NM) between two aircraft along the final, for the spacing readout of the scope; undefined if not both on it. */
export function finalSpacingNm(sim: Simulation, a: Aircraft, b: Aircraft): number | undefined {
  if (a.runway !== b.runway) return undefined;
  const end = sim.airport.runwayEnd(a.runway ?? '');
  if (!end) return undefined;
  return Math.abs(finalCoordinates(end, a.pos).along - finalCoordinates(end, b.pos).along) / M_PER_NM;
}

// ====================================================================== instructions (pilot side)

export interface RadarResult {
  readback?: string;
  unable?: string;
  answers?: boolean;
  after?: () => void;
}

/** Requests a radar instruction answers: the first call, the call from the hold, the question for Tower. */
function answersRequest(ac: Aircraft): boolean {
  return ac.request === 'checkIn' || ac.request === 'vectors' || ac.request === 'radar';
}

/**
 * Executes a radar instruction (you staff Approach / Departure and the aircraft is on your frequency): heading,
 * level, speed, direct-to, holding, approach clearance, "identified", "report established". Returns the read-back
 * or why the crew cannot comply.
 */
export function execRadar(sim: Simulation, ac: Aircraft, c: Command): RadarResult {
  const r = ac.radar;
  if (!r || ac.onGround || ac.frequency !== 'APP' || !radarActive(sim)) {
    return { unable: ac.onGround ? 'say again, we are on the ground' : 'say again' };
  }
  const answers = answersRequest(ac);
  const onFinal = ac.phase === 'approach';
  switch (c.type) {
    case 'identified':
      r.identified = true;
      return { answers };
    case 'reportEstablished':
      if (!r.approach) return { unable: 'say again, we have no approach clearance' };
      if (r.established) return { readback: `established ${r.approach.kind === 'RNP' ? 'on final approach course' : 'localizer'} runway ${r.approach.runway}`, answers };
      r.reportEstablished = true;
      return { readback: 'wilco', answers };
    case 'heading': {
      const mag = c.present ? Math.round(toMagnetic(sim, ac.heading)) : c.heading!;
      // A vector off the final: the approach is broken off, the clearance stays for the next intercept.
      if (onFinal) breakOffFinal(sim, ac);
      r.heading = normHeading(mag) || 360;
      r.transition = undefined;
      r.turn = c.present ? undefined : c.turn;
      r.route = [];
      r.hold = undefined;
      r.holdAtEnd = undefined;
      r.locCaptured = false;
      r.established = false;
      if (c.present) return { readback: `continue present heading ${headingText(mag)}`, answers };
      return { readback: `${c.turn ? `${c.turn} ` : ''}heading ${headingText(mag)}`, answers };
    }
    case 'level': {
      const ft = 'fl' in c.altitude ? c.altitude.fl * 100 : c.altitude.feet;
      const fl = 'fl' in c.altitude;
      const ta = sim.config.airport.transitionAltitudeFt;
      const tl = sim.transitionLevel(sim.atis.qnh) * 100;
      if (onFinal) return { unable: `unable, we are established on final runway ${ac.runway}` };
      if (ft < 1000 || ft > 45000) return { unable: `say again level` };
      // Levels in the transition layer, or an altitude above the transition altitude: the crew asks.
      if (!fl && ft > ta) return { unable: `confirm flight level ${Math.round(ft / 100)}` };
      if (fl && ft < tl) return { unable: `confirm altitude ${ft} feet, the transition level is flight level ${tl / 100}` };
      if (ac.category === 'departure' && ft > ac.flightPlan.cruiseFl * 100) return { unable: `unable, our requested cruising level is flight level ${ac.flightPlan.cruiseFl}` };
      const dir = ft > ac.altitudeFt + 50 ? 'climb' : ft < ac.altitudeFt - 50 ? 'descend' : 'maintain';
      if (c.verb !== 'maintain' && dir !== c.verb && dir !== 'maintain') return { unable: `confirm ${c.verb}, we are at ${levelText(Math.round(ac.altitudeFt / 100) * 100, isFlightLevel(sim, ac.altitudeFt))}` };
      r.clearedFt = ft;
      r.clearedFl = fl;
      const verb = dir === 'climb' ? 'climbing' : dir === 'descend' ? 'descending' : 'maintaining';
      return { readback: `${verb} ${levelText(ft, fl)}`, answers };
    }
    case 'speed': {
      if (onFinal) return finalSpeed(sim, ac, c, answers);
      if (c.resume) {
        r.speedKt = undefined;
        return { readback: 'no speed restrictions', answers };
      }
      if (c.final) {
        r.speedKt = ac.type.approachSpeedKt + 10;
        return { readback: 'reducing to final approach speed', answers };
      }
      const kt = c.kt ?? 0;
      const min = ac.type.approachSpeedKt + (r.locCaptured ? 5 : 15);
      if (kt < min) return { unable: `unable ${kt} knots, our minimum speed is ${min} knots` };
      if (kt > 340) return { unable: `unable ${kt} knots` };
      r.speedKt = kt;
      return { readback: `speed ${kt} knots`, answers };
    }
    case 'direct': {
      if (!sim.airspace!.fix(c.fix)) return { unable: `unable, confirm fix ${c.fix}` };
      if (onFinal) return { unable: `unable, we are established on final runway ${ac.runway}` };
      r.route = [c.fix];
      r.transition = undefined;
      r.heading = undefined;
      r.turn = undefined;
      r.hold = undefined;
      r.holdAtEnd = undefined;
      r.locCaptured = false;
      r.established = false;
      return { readback: `direct ${c.fix}`, answers };
    }
    case 'holdAt': {
      if (!sim.airspace!.fix(c.fix)) return { unable: `unable, confirm fix ${c.fix}` };
      if (onFinal) return { unable: `unable, we are established on final runway ${ac.runway}` };
      r.route = [c.fix];
      r.transition = undefined;
      r.heading = undefined;
      r.turn = undefined;
      r.hold = undefined;
      r.holdAtEnd = c.fix;
      return { readback: `hold over ${c.fix}`, answers };
    }
    case 'approachClearance': {
      if (ac.category !== 'arrival') return { unable: 'say again, we are a departure' };
      const runway = c.runway ?? (sim.isArrivalRunway(ac.runway) ? ac.runway : sim.arrivalRunways[0]);
      const end = runway ? sim.airport.runwayEnd(runway) : undefined;
      if (!end || !runway) return { unable: `unable, confirm runway` };
      // The crew knows the runway in use from the ATIS.
      if (!sim.isArrivalRunway(runway)) return { unable: `confirm runway ${runway}, the ATIS gives ${sim.arrivalRunways.length > 1 ? 'runways' : 'runway'} ${sim.arrivalRunways.join(' and ')} for landing` };
      const published = sim.config.airport.runways.flatMap((rw) => rw.ends).find((e) => e.name === runway)?.approaches ?? ['ILS'];
      const ok = c.kind === 'LOC' ? published.includes('LOC') || published.includes('ILS') : published.includes(c.kind);
      if (!ok) return { unable: `unable, there is no ${approachWordOf(c.kind)} approach runway ${runway}` };
      const now = approachKind(sim, runway);
      if (c.kind === 'ILS' && now !== 'ILS') return { unable: `unable ILS, the ILS runway ${runway} is not available, we can accept the ${approachWordOf(now)} approach` };
      if (onFinal && ac.runway === runway) return { readback: `cleared ${approachWordOf(c.kind)} approach runway ${runway}`, answers };
      r.approach = { runway, kind: c.kind };
      r.gatePassed = false;
      r.hold = undefined;
      r.holdAtEnd = undefined;
      ac.runway = runway;
      ac.flightPlan.runway = runway;
      // On its own navigation (no vectors): it flies the RNAV transition to final of that runway.
      if (r.heading === undefined && !r.locCaptured && (!r.transition || !r.transition.endsWith(runway))) joinTransition(sim, ac, runway);
      return { readback: `cleared ${approachWordOf(c.kind)} approach runway ${runway}`, answers };
    }
    case 'transition': {
      if (ac.category !== 'arrival') return { unable: 'say again, we are a departure' };
      if (onFinal) return { unable: `unable, we are established on final runway ${ac.runway}` };
      const t = sim.airspace!.data.transitions?.find((x) => x.name.replace(/\s/g, '') === c.name.replace(/\s/g, ''));
      if (!t) return { unable: `unable, confirm transition ${c.name}` };
      if (!sim.isArrivalRunway(t.runway)) return { unable: `confirm ${t.name} transition, the ATIS gives runway ${sim.arrivalRunways.join(' and ')} for landing` };
      joinTransition(sim, ac, t.runway, t.name);
      ac.runway = t.runway;
      ac.flightPlan.runway = t.runway;
      return { readback: `via ${t.name} transition`, answers };
    }
    default:
      return { unable: 'say again' };
  }
}

function approachWordOf(kind: 'ILS' | 'RNP' | 'LOC'): string {
  return kind === 'LOC' ? 'localizer' : kind;
}

/** A vector off the final approach: back under radar vectors (the Tower no longer flies it). */
function breakOffFinal(sim: Simulation, ac: Aircraft): void {
  const r = ac.radar!;
  ac.phase = 'inbound';
  ac.landingCleared = false;
  ac.speedRestriction = undefined;
  r.locCaptured = false;
  r.established = false;
  r.askedTower = false;
  r.clearedFt = Math.max(sim.airspace!.mvaAt(ac.pos), Math.round(ac.altitudeFt / 100) * 100);
  r.clearedFl = false;
  ac.verticalSpeedFpm = 0;
}

/** Speed control on final (also for Approach): "160 knots until 4 miles", as Tower gives it. */
function finalSpeed(sim: Simulation, ac: Aircraft, c: Extract<Command, { type: 'speed' }>, answers: boolean): RadarResult {
  if (c.resume) {
    ac.speedRestriction = undefined;
    return { readback: 'resuming normal speed', answers };
  }
  if (c.final) {
    ac.speedRestriction = { kt: ac.type.approachSpeedKt, untilNm: 0 };
    return { readback: 'reducing to final approach speed', answers };
  }
  const kt = c.kt ?? 0;
  const min = ac.type.approachSpeedKt;
  if (kt < min) return { unable: `unable, our minimum speed is ${min} knots` };
  if (kt > 210) return { unable: `unable ${kt} knots on final` };
  const untilNm = c.untilNm ?? 4;
  if (sim.distanceToThresholdNm(ac) < untilNm + 0.5) return { unable: `unable, we are inside ${untilNm} miles` };
  ac.speedRestriction = { kt, untilNm };
  return { readback: `${kt} knots until ${untilNm} miles`, answers };
}

/** The approach intercept point the crew flies to after an approach clearance without vectors (NM before the threshold). */
export const INTERCEPT_POINT_NM = 11;

/**
 * Puts an arrival on an RNAV transition to final: the one named, or the one whose start is still ahead on its STAR,
 * or - already past it - the transition fix nearest ahead (no turn of more than 90 degrees to it). It flies there
 * directly, then along the transition to the FAF.
 */
export function joinTransition(sim: Simulation, ac: Aircraft, runway: string, name?: string): boolean {
  const as = sim.airspace!;
  const r = ac.radar!;
  const all = (as.data.transitions ?? []).filter((t) => t.runway === runway && (!name || t.name === name));
  if (!all.length) return false;
  let pick: { t: (typeof all)[number]; from: number; keep: string[] } | undefined;
  // The start of a transition still ahead on the route (STAR): keep the route up to it.
  for (const t of all) {
    const i = r.route.indexOf(t.route[0]);
    if (i >= 0 && (!pick || i < pick.keep.length)) pick = { t, from: 0, keep: r.route.slice(0, i) };
  }
  // At (or holding over) the start of a transition: from there.
  if (!pick) {
    for (const t of all) {
      const p = as.fix(t.route[0]);
      if (p && distance(ac.pos, p) < 6 * M_PER_NM) pick = { t, from: 0, keep: [] };
    }
  }
  if (!pick) {
    let best = Infinity;
    for (const t of all) {
      // Not onto the final part (the last four fixes): the crew joins the downwind or the base.
      t.route.slice(0, Math.max(1, t.route.length - 4)).forEach((f, i) => {
        const p = as.fix(f);
        if (!p) return;
        const d = distance(ac.pos, p);
        const ahead = d < 3 * M_PER_NM || Math.abs(headingDiff(ac.heading, headingOf(sub(p, ac.pos)))) <= 90;
        const cost = d + (ahead ? 0 : 1e6);
        if (cost < best) {
          best = cost;
          pick = { t, from: i, keep: [] };
        }
      });
    }
  }
  if (!pick) return false;
  r.route = [...pick.keep, ...pick.t.route.slice(pick.from)].filter((f) => as.fix(f));
  r.transition = pick.t.name;
  r.heading = undefined;
  r.turn = undefined;
  r.hold = undefined;
  r.holdAtEnd = undefined;
  r.gatePassed = true;
  return true;
}
