import { aircraftType, type AircraftType } from '../data/aircraftTypes';
import { AIRLINES, type Airline } from '../data/airlines';
import type { Stand } from './airport/airport';
import { createAircraft, type Aircraft, type FlightPlan } from './aircraft';
import type { Density, Simulation } from './simulation';

/** Movements per hour for each traffic density. */
const RATES: Record<Density, { departures: number; arrivals: number }> = {
  light: { departures: 8, arrivals: 7 },
  medium: { departures: 14, arrivals: 12 },
  heavy: { departures: 22, arrivals: 18 },
};

const SPAWN_DISTANCE_NM = 9;
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

  /** Movements per hour, adjusted by the scenario's traffic mix. */
  get rates(): { departures: number; arrivals: number } {
    const r = RATES[this.sim.config.density];
    const mix = this.sim.config.scenario?.mix;
    if (mix === 'departures') return { departures: r.departures * 1.6, arrivals: r.arrivals * 0.5 };
    if (mix === 'arrivals') return { departures: r.departures * 0.5, arrivals: r.arrivals * 1.6 };
    return r;
  }

  /**
   * Picks operator and type. With the scenario option "more heavies", about
   * one in three flights is a wide-body. (The extra random draw only happens
   * with that option, so plain seeds keep giving the same traffic.)
   */
  private pickSpec(): { airline: Airline; type: AircraftType } {
    const rng = this.sim.rng;
    if (this.sim.config.scenario?.heavies && rng.chance(0.35)) {
      const airline = this.pickAirline((a) => a.types.some((t) => aircraftType(t).wake === 'H'));
      return { airline, type: aircraftType(rng.pick(airline.types.filter((t) => aircraftType(t).wake === 'H'))) };
    }
    const airline = this.pickAirline();
    return { airline, type: aircraftType(rng.pick(airline.types)) };
  }

  /** Creates the initial traffic situation. */
  populateInitial(): void {
    const sim = this.sim;
    const r = this.rates;
    // Departures already at their stands, ready times spread over the first ~25 minutes.
    const count = Math.round(r.departures * 0.55);
    for (let i = 0; i < count; i++) {
      const readyIn = i === 0 ? sim.rng.range(5, 20) : sim.rng.range(30, 25 * 60);
      this.spawnDeparture(readyIn);
    }
    // A couple of arrivals already inbound.
    this.spawnArrival(sim.rng.range(4, 6));
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
    if (sim.time >= this.nextArrivalAt) {
      // Pick the next arrival first: the required gap depends on its wake category.
      this.pendingArrival ??= this.pickArrivalSpec();
      if (this.arrivalGapAvailable(this.pendingArrival.type.wake)) {
        this.spawnArrival(SPAWN_DISTANCE_NM, { airline: this.pendingArrival.airline, type: this.pendingArrival.type.icao });
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
  requiredArrivalSpacingNm(followerWake: string): number {
    const sim = this.sim;
    const last = this.lastArrivalOnFinal();
    const wake = last ? wakeSpacingNm(last.type.wake, followerWake) : 3;
    const demand = sim.tower.departureDemand();
    const gap = demand >= 4 ? 8 : demand >= 1 ? 6 : 4;
    return Math.max(wake, gap);
  }

  private lastArrivalOnFinal(): Aircraft | undefined {
    let best: Aircraft | undefined;
    for (const a of this.sim.aircraft) {
      if (a.phase !== 'approach') continue;
      if (!best || this.sim.distanceToThresholdNm(a) > this.sim.distanceToThresholdNm(best)) best = a;
    }
    return best;
  }

  private arrivalGapAvailable(followerWake: string): boolean {
    const last = this.lastArrivalOnFinal();
    if (!last) return true;
    return SPAWN_DISTANCE_NM - this.sim.distanceToThresholdNm(last) >= this.requiredArrivalSpacingNm(followerWake);
  }

  private pendingArrival?: { airline: Airline; type: AircraftType };

  private pickArrivalSpec(): { airline: Airline; type: AircraftType } {
    return this.pickSpec();
  }

  /** Allocates a free stand for an aircraft that needs one (arrival, returning departure). */
  allocateStand(ac: Aircraft): Stand | undefined {
    const airline = AIRLINES.find((a) => ac.callsign.startsWith(a.icao)) ?? AIRLINES.find((a) => a.callsignStyle === 'reg')!;
    return this.pickStand(ac.type, airline, ac);
  }

  // ------------------------------------------------------------------ helpers

  private pickAirline(filter?: (a: Airline) => boolean): Airline {
    const list = filter ? AIRLINES.filter(filter) : AIRLINES;
    return this.sim.rng.weighted(list, (a) => a.weight);
  }

  makeCallsign(airline: Airline): string {
    const rng = this.sim.rng;
    for (let attempt = 0; attempt < 50; attempt++) {
      let cs: string;
      if (airline.callsignStyle === 'reg') {
        const L = () => String.fromCharCode(65 + rng.int(0, 25));
        cs = `DC${L()}${L()}${L()}`;
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
    // Business jets prefer the small stands 60-65, airlines the rest of Apron North; Apron South is cargo.
    const preferred = this.sim.freeStands(type.wingspanM, (s) => s.apron === 'Apron North' && (ga ? /^6\d$/.test(s.id) : !/^6\d$/.test(s.id)), except);
    const any = preferred.length
      ? preferred
      : this.sim.freeStands(type.wingspanM, (s) => s.apron === 'Apron North', except).concat(this.sim.freeStands(type.wingspanM, (s) => s.apron === 'Apron South', except));
    if (!any.length) return undefined;
    // Smallest stand that fits, to keep large stands available.
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
    const stand = opts.stand ? sim.airport.stand(opts.stand) : this.pickStand(type, airline);
    if (!stand) return undefined;
    const callsign = opts.callsign ?? this.makeCallsign(airline);
    const rwy = sim.runway;
    const sids = sim.config.airport.sids.filter((s) => s.runway === rwy);
    const sid = sids.length ? sim.rng.pick(sids) : undefined;
    const destination = sim.rng.pick(airline.destinations);
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
      frequency: sim.config.position,
      now: sim.time,
    });
    ac.stand = stand.id;
    ac.runway = rwy;
    ac.readyAt = sim.time + readyIn;
    ac.plannedMedical = sim.config.events !== false && sim.rng.chance(DEPARTURE_MEDICAL_CHANCE);
    sim.aircraft.push(ac);
    return ac;
  }

  spawnArrival(distanceNm: number, opts: { callsign?: string; type?: string; airline?: Airline; medical?: boolean } = {}): Aircraft | undefined {
    const sim = this.sim;
    const airline = opts.airline ?? this.pickAirline();
    const type = aircraftType(opts.type ?? sim.rng.pick(airline.types));
    const stand = this.pickStand(type, airline);
    const callsign = opts.callsign ?? this.makeCallsign(airline);
    const origin = sim.rng.pick(airline.destinations);
    const fp: FlightPlan = {
      departure: origin,
      destination: sim.config.airport.icao,
      route: `DCT ${sim.config.airport.icao}`,
      runway: sim.runway,
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
      frequency: 'TWR',
      now: sim.time,
    });
    ac.assignedStand = stand?.id;
    const forced = sim.forceMedicalArrival && opts.medical === undefined;
    if (forced) sim.forceMedicalArrival = false;
    if (forced || (opts.medical ?? (sim.config.events !== false && sim.rng.chance(ARRIVAL_MEDICAL_CHANCE)))) {
      ac.emergency = 'medical';
      ac.emergencySince = sim.time;
      sim.system(`Approach: ${callsign} has declared PAN PAN (medical emergency) and will land with priority.`, 'warning', callsign);
    }
    sim.tower.setupApproach(ac, distanceNm);
    sim.aircraft.push(ac);
    return ac;
  }
}
