import { approachProfile, targetSpeedKt, timeOnFinalS } from './approach';
import { M_PER_NM } from './geo';
import { aircraftType, type AircraftType } from '../data/aircraftTypes';
import { AIRLINES, type Airline } from '../data/airlines';
import type { Stand } from './airport/airport';
import { createAircraft, type Aircraft, type FlightPlan } from './aircraft';
import { CLEARANCE_LEAD_S, prepareDeparture, sidsForDestination } from './delivery';
import type { Simulation } from './simulation';
import { DENSITIES, HEAVY_SHARES, MIXES, clampLevel, densityIndex, mixIndex } from './levels';
import { NON_PRECISION_SPACING_NM } from './systems';
import { DELAYED_ARRIVAL_SHARE, NIGHT_APPROACH_ESTIMATE_S, landingStatus, nightRules, plannedReadyIn } from './night';
import { minutesToHhmm } from './time';
import { STORM_ARRIVAL_RATE, STORM_ARRIVAL_SPACING_NM } from './weather';

const SPAWN_DISTANCE_NM = 12;
/** Largest wingspan of a code D stand (m): stands up to this size are used by all aircraft up to code D. */
const NARROW_STAND_MAX_M = 52;
/** Chance that a generated arrival declares a medical emergency (with special events on). */
const ARRIVAL_MEDICAL_CHANCE = 0.02;
/** Chance that a departure declares a medical emergency while taxiing (with special events on). */
const DEPARTURE_MEDICAL_CHANCE = 0.01;

/**
 * Wake turbulence distance minima on final (NM) for leader/follower
 * categories; 3 NM radar minimum otherwise.
 */
function wakeSpacingNm(leader: string, follower: string): number {
  if (leader === 'J') return follower === 'J' ? 4 : follower === 'H' ? 6 : follower === 'M' ? 7 : 8;
  if (leader === 'H') return follower === 'H' ? 4 : follower === 'M' ? 5 : 6;
  if (leader === 'M' && follower === 'L') return 5;
  return 3;
}

/**
 * Generates traffic: departures that appear on free stands and call for
 * pushback after "boarding", and arrivals that appear on the final approach.
 */
export class TrafficGenerator {
  private nextDepartureAt = 0;
  private nextArrivalAt = 0;
  private usedCallsigns = new Set<string>();

  constructor(private readonly sim: Simulation) {}

  /** Movements per hour, adjusted by the scenario's traffic mix (and a thunderstorm: fewer arrivals). */
  get rates(): { departures: number; arrivals: number } {
    const base = DENSITIES[densityIndex(this.sim.config.density)];
    const mix = MIXES[mixIndex(this.sim.config.scenario?.mix ?? 'balanced')];
    const f = this.sim.config.airport.traffic?.rateFactor ?? 1;
    const r = { departures: base.departures * mix.departures * f, arrivals: base.arrivals * mix.arrivals * f };
    return this.sim.storm ? { departures: r.departures, arrivals: r.arrivals * STORM_ARRIVAL_RATE } : r;
  }

  /**
   * Picks operator and type. With a scenario share of heavies (10-50 %),
   * that share of the flights is a wide-body. (The extra random draw only happens
   * with that option, so plain seeds keep giving the same traffic.)
   */
  private pickSpec(): { airline: Airline; type: AircraftType } {
    const rng = this.sim.rng;
    const share = HEAVY_SHARES[clampLevel(this.sim.config.scenario?.heavyLevel ?? 0)].share;
    const heavy = (a: Airline) => a.types.some((t) => aircraftType(t).wake === 'H');
    // Airports without wide-body operators (Sylt) get their normal traffic.
    if (share > 0 && rng.chance(share) && this.operators.some(heavy)) {
      const airline = this.pickAirline(heavy);
      const type = aircraftType(rng.pick(airline.types.filter((t) => aircraftType(t).wake === 'H')));
      // Only while a stand for it is free (a few wide-body stands, as at San Diego); else the normal traffic.
      if (this.sim.freeStands(type.wingspanM).length) return { airline, type };
    }
    const airline = this.pickAirline();
    return { airline, type: aircraftType(rng.pick(airline.types)) };
  }

  /** Creates the initial traffic situation. */
  populateInitial(): void {
    const sim = this.sim;
    const r = this.rates;
    // Departures already at their stands, ready times spread over the first ~25 minutes. The square root
    // makes them denser towards the end, so the workload builds up instead of starting with a rush.
    const count = Math.round(r.departures * 0.55);
    const initial: Aircraft[] = [];
    for (let i = 0; i < count; i++) {
      const readyIn = i === 0 ? sim.rng.range(5, 20) : 30 + Math.sqrt(sim.rng.next()) * (25 * 60 - 30);
      const ac = this.spawnDeparture(readyIn);
      if (ac) initial.push(ac);
    }
    staggerInitialCalls(sim, initial);
    // A couple of arrivals already inbound (none in the landing curfew).
    const firstArrival = sim.rng.range(4, 6);
    if (landingStatus(sim, sim.time + 120) === 'open') this.spawnArrival(firstArrival);
    this.nextArrivalAt = sim.time + sim.rng.range(60, 180);
    this.nextDepartureAt = sim.time + sim.rng.exponential(3600 / r.departures);
  }

  update(): void {
    const sim = this.sim;
    const r = this.rates;
    if (sim.time >= this.nextDepartureAt) {
      this.spawnDeparture(sim.rng.range(4 * 60, 15 * 60));
      this.nextDepartureAt = sim.time + sim.rng.exponential(3600 / r.departures);
    }
    // Approach holds arrivals on your request.
    if (sim.flow.arrivalsStopped && sim.time >= this.nextArrivalAt) this.nextArrivalAt = sim.time + 10;
    // Night rules: no arrivals in the landing curfew, only some delayed ones until it is fully closed.
    if (sim.time >= this.nextArrivalAt && !this.pendingArrival && nightRules(sim)) {
      const status = landingStatus(sim, sim.time + NIGHT_APPROACH_ESTIMATE_S);
      const slot = Math.floor(this.nextArrivalAt);
      if (status === 'closed' || (status === 'delayed' && sim.variation(`night-arrival:${slot}`) >= DELAYED_ARRIVAL_SHARE)) {
        this.nextArrivalAt = status === 'closed' ? sim.time + 60 : sim.time + sim.rng.exponential(3600 / r.arrivals);
        return;
      }
    }
    if (sim.time >= this.nextArrivalAt) {
      // Pick the next arrival first: the required gap depends on its wake category.
      this.pendingArrival ??= this.pickArrivalSpec();
      const pending = this.pendingArrival;
      // Small airports (stand reserve): Approach releases an arrival only when a stand is free for it.
      const standFree = !this.standReserve || this.sim.freeStands(pending.type.wingspanM).length > 0;
      const runway = standFree ? this.arrivalRunway(pending) : undefined;
      if (runway) {
        const ac = this.spawnArrival(SPAWN_DISTANCE_NM, { airline: pending.airline, type: pending.type.icao, stand: pending.stand, runway });
        if (ac && landingStatus(sim, sim.time + NIGHT_APPROACH_ESTIMATE_S) === 'delayed') this.announceDelayed(ac);
        this.pendingArrival = undefined;
        this.nextArrivalAt = sim.time + sim.rng.exponential(3600 / r.arrivals);
      } else {
        this.nextArrivalAt = sim.time + 10;
      }
    }
  }

  /**
   * Approach spacing: the new arrival must be at least the wake turbulence
   * minimum behind the last one; when departures are waiting, Approach
   * provides wider gaps so departures can go in between (6 NM, 8 NM with a
   * long queue).
   */
  requiredArrivalSpacingNm(followerWake: string, runway = this.sim.runway): number {
    const sim = this.sim;
    const end = sim.tower.endFor(runway);
    const last = this.lastArrivalOnFinal(runway);
    const wake = last ? wakeSpacingNm(last.type.wake, followerWake) : 3;
    const demand = sim.tower.departureDemand(sim.runways.length > 1 ? end : undefined);
    const gap = demand >= 4 ? 8 : demand >= 1 ? 6 : 4;
    // Non-precision approaches (localizer only, RNP) get more room on final.
    const approach = sim.approachTypeFor(runway) === 'ILS' ? 0 : NON_PRECISION_SPACING_NM;
    // Thunderstorm: Approach spaces the arrivals out.
    const storm = sim.storm ? STORM_ARRIVAL_SPACING_NM : 0;
    // Runways used with backtracks (landing or departing aircraft taxi on the runway): more room on final.
    const ops = sim.airport.runwayOps(runway);
    const backtrack = ops?.exits.some((x) => x.backtrack) ? BACKTRACK_ARRIVAL_SPACING_NM : ops?.departureEntries.some((e) => e.backtrack) ? BACKTRACK_DEPARTURE_SPACING_NM : 0;
    return Math.max(wake, gap, approach, storm, backtrack, ops?.arrivalSpacingNm ?? 0);
  }

  /** Night rules: a delayed arrival after the landing curfew (its schedule was before it). */
  private announceDelayed(ac: Aircraft): void {
    const r = nightRules(this.sim);
    if (!r) return;
    const scheduled = minutesToHhmm(r.landings.from - 5 - Math.round(40 * this.sim.variation(`${ac.callsign}:sta`)));
    this.sim.system(`Approach: ${ac.callsign} is a delayed flight (scheduled arrival ${scheduled} local) - landing permitted until ${minutesToHhmm(r.delayedLandingsUntil ?? r.landings.from)} local.`, 'system', ac.callsign);
  }

  /** The arrival furthest out on the final of a runway (any runway when not given). */
  private lastArrivalOnFinal(runway?: string): Aircraft | undefined {
    const physical = runway ? this.sim.airport.runwayEnd(runway)?.runway : undefined;
    let best: Aircraft | undefined;
    for (const a of this.sim.aircraft) {
      if (a.phase !== 'approach') continue;
      if (physical && this.sim.airport.runwayEnd(a.runway ?? this.sim.runway)?.runway !== physical) continue;
      if (!best || this.sim.distanceToThresholdNm(a) > this.sim.distanceToThresholdNm(best)) best = a;
    }
    return best;
  }

  /**
   * The spacing applies when the last arrival crosses the threshold: the follower, flying its speed
   * profile from the spawn point, must not reach the spacing distance before that (the leader slows
   * down to its final approach speed first, which compresses the spacing on final).
   */
  private arrivalGapAvailable(follower: AircraftType, runway = this.sim.runway): boolean {
    const sim = this.sim;
    const behind = (last: Aircraft | undefined, required: number): boolean => {
      if (!last) return true;
      if (SPAWN_DISTANCE_NM - sim.distanceToThresholdNm(last) < required) return false;
      const p = approachProfile(follower.approachSpeedKt);
      const followerTime = timeOnFinalS(p, SPAWN_DISTANCE_NM, required, targetSpeedKt(p, SPAWN_DISTANCE_NM));
      return followerTime >= sim.tower.timeToThreshold(last);
    };
    if (!behind(this.lastArrivalOnFinal(runway), this.requiredArrivalSpacingNm(follower.wake, runway))) return false;
    // Parallel runways: the diagonal radar separation to the arrivals on the adjacent finals (dependent 1.5 NM,
    // staggered 3 NM; none for independent approaches). Far enough apart, there is no wake turbulence between them.
    const mode = sim.parallelOps?.approaches;
    if (!mode || mode === 'independent') return true;
    const diagonal = mode === 'dependent' ? DEPENDENT_DIAGONAL_NM : STAGGERED_DIAGONAL_NM;
    const end = sim.airport.runwayEnd(runway)!;
    for (const other of sim.runways) {
      const o = sim.airport.runwayEnd(other)!;
      if (o.runway === end.runway) continue;
      const lateralNm = Math.abs(sim.airport.runwayCoordinates(end, o.threshold).lateral) / M_PER_NM;
      if (!behind(this.lastArrivalOnFinal(other), Math.sqrt(Math.max(0, diagonal * diagonal - lateralNm * lateralNm)))) return false;
    }
    return true;
  }

  /**
   * The runway Approach puts the next arrival on: the one of its stand (parallel runways), else the other if
   * only that one has a gap; undefined while there is no gap.
   */
  private arrivalRunway(pending: { airline: Airline; type: AircraftType; stand?: string }): string | undefined {
    const sim = this.sim;
    if (sim.runways.length === 1) return this.arrivalGapAvailable(pending.type) ? sim.runway : undefined;
    // With parallel runways the stand decides the runway: allocate it now.
    pending.stand ??= this.pickStand(pending.type, pending.airline)?.id ?? '';
    const preferred = sim.runwayFor(pending.stand || undefined, pending.type);
    const p = sim.parallelOps;
    // Aircraft bound to a runway by their size (e.g. the B747-8) wait for a gap there.
    const fixed = !!p?.largeAircraft && pending.type.wingspanM >= p.largeAircraft.minWingspanM;
    const order = fixed ? [preferred] : [preferred, ...sim.runways.filter((r) => r !== preferred)];
    return order.find((r) => this.arrivalGapAvailable(pending.type, r));
  }

  private pendingArrival?: { airline: Airline; type: AircraftType; stand?: string };

  private pickArrivalSpec(): { airline: Airline; type: AircraftType } {
    return this.pickSpec();
  }

  /** Allocates a free stand for an aircraft that needs one (arrival, returning departure). */
  allocateStand(ac: Aircraft): Stand | undefined {
    const airline = this.operators.find((a) => ac.callsign.startsWith(a.icao)) ?? AIRLINES.find((a) => ac.callsign.startsWith(a.icao)) ?? AIRLINES.find((a) => a.callsignStyle === 'reg')!;
    return this.pickStand(ac.type, airline, ac);
  }

  // ------------------------------------------------------------------ helpers

  /** Stands kept free for arrivals (airport traffic data, default none). */
  private get standReserve(): number {
    return this.sim.config.airport.traffic?.standReserve ?? 0;
  }

  /** Operators of this airport (airport traffic data merged with the global operator table). */
  private get operators(): Airline[] {
    if (!this.operatorCache) {
      const traffic = this.sim.config.airport.traffic;
      this.operatorCache = traffic
        ? traffic.operators.map((o) => {
            const base = AIRLINES.find((a) => a.icao === o.airline);
            if (!base) throw new Error(`Unknown operator ${o.airline} in the traffic of ${this.sim.config.airport.icao}`);
            return { ...base, weight: o.weight, types: o.types ?? base.types, destinations: o.destinations ?? base.destinations };
          })
        : AIRLINES;
    }
    return this.operatorCache;
  }
  private operatorCache?: Airline[];

  private pickAirline(filter?: (a: Airline) => boolean): Airline {
    const list = filter ? this.operators.filter(filter) : this.operators;
    return this.sim.rng.weighted(list, (a) => a.weight);
  }

  makeCallsign(airline: Airline): string {
    const rng = this.sim.rng;
    for (let attempt = 0; attempt < 50; attempt++) {
      let cs: string;
      if (airline.callsignStyle === 'reg') {
        const L = () => String.fromCharCode(65 + rng.int(0, 25));
        // US registrations: N, three digits and two letters (no I or O).
        const N = () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[rng.int(0, 23)];
        cs = airline.regPrefix === 'N' ? `N${rng.int(1, 9)}${rng.int(0, 9)}${rng.int(0, 9)}${N()}${N()}` : `DC${L()}${L()}${L()}`;
      } else if (airline.callsignStyle === 'numeric') {
        cs = `${airline.icao}${rng.int(1, 9)}${rng.int(0, 9)}${rng.chance(0.6) ? rng.int(0, 9) : ''}${rng.chance(0.3) ? rng.int(0, 9) : ''}`;
      } else {
        const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
        const L = () => letters[rng.int(0, letters.length - 1)];
        cs = `${airline.icao}${rng.int(1, 9)}${rng.chance(0.4) ? rng.int(0, 9) : ''}${L()}${L()}`;
      }
      if (!this.usedCallsigns.has(cs) && !this.sim.find(cs)) {
        this.usedCallsigns.add(cs);
        return cs;
      }
    }
    throw new Error('Could not generate a unique callsign');
  }

  private squawk(): string {
    const rng = this.sim.rng;
    let s: string;
    do {
      s = `${rng.int(1, 6)}${rng.int(0, 7)}${rng.int(0, 7)}${rng.int(1, 7)}`;
    } while (['7500', '7600', '7700', '2000', '1000'].includes(s));
    return s;
  }

  private pickStand(type: AircraftType, airline: Airline, except?: Aircraft): Stand | undefined {
    const ga = airline.callsignStyle === 'reg';
    // Business jets prefer the GA stands, cargo airlines the cargo stands, airlines the airline stands; others
    // take cargo stands only when nothing else is free (cargo airlines the other way round).
    const use = (s: Stand) => s.use ?? 'airline';
    const kind = ga ? 'ga' : airline.cargo ? 'cargo' : 'airline';
    const preferred = this.sim.freeStands(type.wingspanM, (s) => use(s) === kind, except);
    const notCargo = () => this.sim.freeStands(type.wingspanM, (s) => use(s) !== 'cargo', except);
    const cargo = () => this.sim.freeStands(type.wingspanM, (s) => use(s) === 'cargo', except);
    const any = preferred.length ? preferred : kind === 'cargo' ? notCargo() : notCargo().concat(cargo());
    if (!any.length) return undefined;
    // Keep the wide-body stands (code E-F) and the alternative positions (e.g. 40D over 40) available:
    // aircraft up to code D take any other stand up to code D, larger ones the smallest stand that fits.
    const narrow = any.filter((s) => s.maxWingspanM <= NARROW_STAND_MAX_M && !this.sim.airport.alternativeStands.has(s.id.toUpperCase()));
    if (type.wingspanM <= NARROW_STAND_MAX_M && narrow.length) return this.sim.rng.pick(narrow);
    const minSpan = Math.min(...any.map((s) => s.maxWingspanM));
    return this.sim.rng.pick(any.filter((s) => s.maxWingspanM === minSpan));
  }

  // ------------------------------------------------------------------ spawning

  spawnDeparture(readyIn: number, opts: { stand?: string; callsign?: string; type?: string } = {}): Aircraft | undefined {
    const sim = this.sim;
    let airline: Airline;
    let type: AircraftType;
    if (opts.type) {
      airline = this.pickAirline();
      type = aircraftType(opts.type);
    } else {
      ({ airline, type } = this.pickSpec());
    }
    // Night rules: no jet that could not be airborne before the curfew; the morning wave is ready for its end.
    const planned = plannedReadyIn(sim, type, readyIn, `dep${Math.round(sim.time)}:${this.usedCallsigns.size}`);
    if (planned === undefined) return undefined;
    readyIn = planned;
    // Small airports: the last free stands are kept for arrivals.
    if (!opts.stand && this.standReserve && sim.freeStands(type.wingspanM).length <= this.standReserve) return undefined;
    const stand = opts.stand ? sim.airport.stand(opts.stand) : this.pickStand(type, airline);
    if (!stand) return undefined;
    const callsign = opts.callsign ?? this.makeCallsign(airline);
    // Parallel runways: the runway of the stand's apron (or the nearest one).
    const rwy = sim.runwayFor(stand.id, type);
    const destination = sim.rng.pick(airline.destinations);
    // The SID towards the destination (exit fix by direction, or a SID filed for this destination only).
    const sids = sidsForDestination(sim.config.airport, rwy, destination, type);
    const sid = sids.length ? sim.rng.pick(sids) : undefined;
    const fp: FlightPlan = {
      departure: sim.config.airport.icao,
      destination,
      route: sid ? `${sid.fix} DCT ${destination}` : `DCT ${destination}`,
      sid: sid?.name,
      runway: rwy,
      cruiseFl: type.silhouette === 'turboprop' ? sim.rng.int(17, 25) * 10 : sim.rng.int(28, 39) * 10,
      squawk: this.squawk(),
    };
    const ac = createAircraft({
      callsign,
      type,
      category: 'departure',
      flightPlan: fp,
      pos: stand.pos,
      heading: stand.heading,
      altitudeFt: sim.config.airport.elevationFt,
      phase: 'parked',
      frequency: sim.stationFor('ground'),
      now: sim.time,
    });
    ac.stand = stand.id;
    ac.runway = rwy;
    ac.readyAt = sim.time + readyIn;
    ac.plannedMedical = sim.eventFactor > 0 && sim.rng.chance(DEPARTURE_MEDICAL_CHANCE * sim.eventFactor);
    prepareDeparture(sim, ac);
    ac.taxiPace = 0.85 + 0.3 * sim.variation(`${ac.callsign}:pace`);
    sim.aircraft.push(ac);
    return ac;
  }

  spawnArrival(distanceNm: number, opts: { callsign?: string; type?: string; airline?: Airline; medical?: boolean; stand?: string; runway?: string } = {}): Aircraft | undefined {
    const sim = this.sim;
    const airline = opts.airline ?? this.pickAirline();
    const type = aircraftType(opts.type ?? sim.rng.pick(airline.types));
    // The stand allocated when Approach picked the runway (parallel runways), if it is still free; else a new one.
    const reserved = opts.stand ? sim.airport.stand(opts.stand) : undefined;
    const stand = reserved && sim.freeStands(type.wingspanM, (s) => s === reserved).length ? reserved : this.pickStand(type, airline);
    const runway = opts.runway ?? sim.runwayFor(stand?.id, type);
    const callsign = opts.callsign ?? this.makeCallsign(airline);
    const origin = sim.rng.pick(airline.destinations);
    const fp: FlightPlan = {
      departure: origin,
      destination: sim.config.airport.icao,
      route: `DCT ${sim.config.airport.icao}`,
      runway,
      cruiseFl: sim.rng.int(28, 39) * 10,
      squawk: this.squawk(),
    };
    const ac = createAircraft({
      callsign,
      type,
      category: 'arrival',
      flightPlan: fp,
      pos: { x: 0, y: 0 },
      heading: 0,
      altitudeFt: 3000,
      phase: 'approach',
      frequency: sim.stationFor('tower'),
      now: sim.time,
    });
    ac.assignedStand = stand?.id;
    const forced = sim.forceMedicalArrival && opts.medical === undefined;
    if (forced) sim.forceMedicalArrival = false;
    if (forced || (opts.medical ?? (sim.eventFactor > 0 && sim.rng.chance(ARRIVAL_MEDICAL_CHANCE * sim.eventFactor)))) {
      ac.emergency = 'medical';
      ac.emergencySince = sim.time;
      sim.system(`Approach: ${callsign} has declared PAN PAN (medical emergency) and will land with priority.`, 'warning', callsign);
    }
    sim.tower.setupApproach(ac, distanceNm, runway);
    ac.taxiPace = 0.85 + 0.3 * sim.variation(`${ac.callsign}:pace`);
    sim.aircraft.push(ac);
    return ac;
  }
}

/** Minimum time between the first calls of the initial departures at session start (seconds). */
const INITIAL_CALL_SPACING_S = 90;
/** Diagonal radar separation between arrivals on adjacent finals to parallel runways (NM): dependent / staggered. */
export const DEPENDENT_DIAGONAL_NM = 1.5;
export const STAGGERED_DIAGONAL_NM = 3;
/** Minimum spacing on final when arrivals backtrack after landing / departures backtrack before take-off (NM). */
export const BACKTRACK_ARRIVAL_SPACING_NM = 10;
export const BACKTRACK_DEPARTURE_SPACING_NM = 8;
/** The first initial departure calls this long after the session starts. */
const INITIAL_FIRST_CALL_S = 15;
/** Time a crew needs between its clearance and being ready for start-up / pushback (seconds). */
const CLEARANCE_TO_READY_S = 4 * 60;

/**
 * At session start the initial departures would all ask for their clearance
 * (or pushback) at once, because many are due within the first minutes. Their
 * first calls are staggered: at least 90 s apart, in the order of their ready
 * times; ready times move back where needed.
 */
function staggerInitialCalls(sim: Simulation, initial: Aircraft[]): void {
  const delivery = sim.stationFor('delivery');
  const onDelivery = !!sim.airport.station(delivery) && sim.userControls(delivery);
  let next = sim.time + INITIAL_FIRST_CALL_S;
  for (const ac of [...initial].sort((a, b) => a.readyAt - b.readyAt)) {
    if (onDelivery) {
      ac.clearanceAt = Math.max(ac.readyAt - CLEARANCE_LEAD_S, next);
      ac.readyAt = Math.max(ac.readyAt, ac.clearanceAt + CLEARANCE_TO_READY_S);
      next = ac.clearanceAt + INITIAL_CALL_SPACING_S;
    } else {
      ac.readyAt = Math.max(ac.readyAt, next);
      next = ac.readyAt + INITIAL_CALL_SPACING_S;
    }
  }
}
