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

/** Minimum spacing between two arrivals on final, in seconds. */
const MIN_ARRIVAL_SPACING = 150;
const SPAWN_DISTANCE_NM = 9;

/**
 * Generates traffic: departures that appear on free stands and call for
 * pushback after "boarding", and arrivals that appear on the final approach.
 */
export class TrafficGenerator {
  private nextDepartureAt = 0;
  private nextArrivalAt = 0;
  private lastArrivalAt = -Infinity;
  private usedCallsigns = new Set<string>();

  constructor(private readonly sim: Simulation) {}

  get rates() {
    return RATES[this.sim.config.density];
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
    this.nextArrivalAt = sim.time + sim.rng.range(120, 240);
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
      if (sim.time - this.lastArrivalAt >= MIN_ARRIVAL_SPACING && !this.finalCongested()) {
        this.spawnArrival(SPAWN_DISTANCE_NM);
        this.nextArrivalAt = sim.time + Math.max(MIN_ARRIVAL_SPACING, sim.rng.exponential(3600 / r.arrivals));
      } else {
        this.nextArrivalAt = sim.time + 20;
      }
    }
  }

  private finalCongested(): boolean {
    return this.sim.aircraft.some((a) => a.phase === 'approach' && this.sim.distanceToThresholdNm(a) > SPAWN_DISTANCE_NM - 3);
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

  private pickStand(type: AircraftType, airline: Airline): Stand | undefined {
    const ga = airline.callsignStyle === 'reg';
    const preferred = this.sim.freeStands(type.wingspanM, (s) => (ga ? s.apron === 'Apron 3' : s.apron === 'Apron 1'));
    const any = preferred.length ? preferred : this.sim.freeStands(type.wingspanM, (s) => s.apron !== 'Apron South');
    if (!any.length) return undefined;
    // Smallest stand that fits, to keep large stands available.
    const minSpan = Math.min(...any.map((s) => s.maxWingspanM));
    return this.sim.rng.pick(any.filter((s) => s.maxWingspanM === minSpan));
  }

  // ------------------------------------------------------------------ spawning

  spawnDeparture(readyIn: number, opts: { stand?: string; callsign?: string; type?: string } = {}): Aircraft | undefined {
    const sim = this.sim;
    const airline = this.pickAirline();
    const type = aircraftType(opts.type ?? sim.rng.pick(airline.types));
    const stand = opts.stand ? sim.airport.stand(opts.stand) : this.pickStand(type, airline);
    if (!stand) return undefined;
    const callsign = opts.callsign ?? this.makeCallsign(airline);
    const rwy = sim.config.runway;
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
    sim.aircraft.push(ac);
    return ac;
  }

  spawnArrival(distanceNm: number, opts: { callsign?: string; type?: string } = {}): Aircraft | undefined {
    const sim = this.sim;
    const airline = this.pickAirline();
    const type = aircraftType(opts.type ?? sim.rng.pick(airline.types));
    const stand = this.pickStand(type, airline);
    const callsign = opts.callsign ?? this.makeCallsign(airline);
    const origin = sim.rng.pick(airline.destinations);
    const fp: FlightPlan = {
      departure: origin,
      destination: sim.config.airport.icao,
      route: `DCT ${sim.config.airport.icao}`,
      runway: sim.config.runway,
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
    sim.tower.setupApproach(ac, distanceNm);
    sim.aircraft.push(ac);
    this.lastArrivalAt = sim.time;
    return ac;
  }
}
