import { Airport, type Stand } from './airport/airport';
import type { AirportData, StationData, StationType } from './airport/types';
import { telephony, type Aircraft } from './aircraft';
import { M_PER_NM, distance } from './geo';
import { detectCollisions, updateMovement, updateSeparation } from './movement';
import { parseTransmission } from './phraseology/parser';
import { executeTransmission, updatePilot } from './pilot';
import { Frequency, type MessageKind, type RadioMessage } from './radio';
import { Rng } from './random';
import { TowerAI } from './tower';
import { TrafficGenerator } from './traffic';

export type Density = 'light' | 'medium' | 'heavy';

export interface SimConfig {
  airport: AirportData;
  /** Position the user is logged in as. Only 'GND' is implemented so far. */
  position: StationType;
  /** Active runway end, e.g. "25". If omitted, the runway is chosen from the wind. */
  runway?: string;
  density: Density;
  seed?: number;
  /** UTC start time of the session; defaults to the current time. */
  startTime?: Date;
  /** Set to false to start with an empty airport (used by tests). */
  generateTraffic?: boolean;
  /** Special events (medical emergencies, rejected take-offs). Default: true. */
  events?: boolean;
}

export type IncidentType = 'collision' | 'incursion' | 'goAround';

export interface Incident {
  time: number;
  type: IncidentType;
  text: string;
  callsigns: string[];
}

export interface Stats {
  departuresHandedOff: number;
  arrivalsParked: number;
  departuresAirborne: number;
  /** Sum of the time pilots waited for an answer to their requests (seconds). */
  totalWaitSeconds: number;
  /** Penalty points for slow answers (1 point per 15 s beyond the first 30 s). */
  delayPenalty: number;
  answeredRequests: number;
  sayAgains: number;
  incursions: number;
  collisions: number;
  goArounds: number;
  rejectedTakeoffs: number;
  emergenciesHandled: number;
  /** Bonus points (e.g. medical emergencies handled quickly). */
  bonus: number;
  score: number;
}

/** Current ATIS (maintained by the controller). */
export interface AtisInfo {
  letter: string;
  runway: string;
  wind: { direction: number; speedKt: number };
  qnh: number;
  /** Simulation time of the last update. */
  updatedAt: number;
}

export interface AtisChange {
  letter?: string;
  runway?: string;
  wind?: { direction: number; speedKt: number };
  qnh?: number;
}

export interface TransmitResult {
  ok: boolean;
  callsign?: string;
  /** Hint for the controller (not part of the radio exchange), e.g. "unknown callsign". */
  hint?: string;
}

type Listener<T> = (payload: T) => void;

interface Events {
  message: RadioMessage;
  incident: Incident;
  aircraftRemoved: Aircraft;
}

/** Simulation sub-step in seconds. */
const STEP = 0.2;

/**
 * The simulation world: airport, traffic, AI pilots, AI tower and the radio
 * frequency of the controller position. Completely independent of the DOM so
 * that it can be unit tested and, later, run on a server for multiplayer.
 */
export class Simulation {
  readonly airport: Airport;
  readonly rng: Rng;
  readonly frequency: Frequency;
  readonly tower: TowerAI;
  readonly traffic: TrafficGenerator;
  readonly station: StationData;
  readonly startEpochMs: number;

  /** Simulation time in seconds since session start. */
  time = 0;
  aircraft: Aircraft[] = [];
  readonly messages: RadioMessage[] = [];
  readonly incidents: Incident[] = [];
  readonly stats: Stats = {
    departuresHandedOff: 0,
    arrivalsParked: 0,
    departuresAirborne: 0,
    totalWaitSeconds: 0,
    delayPenalty: 0,
    answeredRequests: 0,
    sayAgains: 0,
    incursions: 0,
    collisions: 0,
    goArounds: 0,
    rejectedTakeoffs: 0,
    emergenciesHandled: 0,
    bonus: 0,
    score: 0,
  };

  readonly atis: AtisInfo;

  private listeners: { [K in keyof Events]: Listener<Events[K]>[] } = {
    message: [],
    incident: [],
    aircraftRemoved: [],
  };
  private nextSystemId = 1_000_000;
  private accumulator = 0;

  constructor(readonly config: SimConfig) {
    this.airport = new Airport(config.airport);
    this.rng = new Rng(config.seed ?? Math.floor(Math.random() * 2 ** 31));
    const station = this.airport.station(config.position);
    if (!station) throw new Error(`${config.airport.icao} has no ${config.position} station`);
    this.station = station;
    this.startEpochMs = (config.startTime ?? new Date()).getTime();
    this.frequency = new Frequency(station.frequency, (m) => this.pushMessage(m));
    this.tower = new TowerAI(this);
    this.traffic = new TrafficGenerator(this);

    // Wind first; the active runway is the one with the most headwind unless given.
    const westerly = this.rng.chance(0.7);
    const wind = {
      direction: Math.round((westerly ? this.rng.range(220, 290) : this.rng.range(40, 110)) / 10) * 10,
      speedKt: this.rng.int(3, 14),
    };
    const runway = config.runway ?? this.bestRunwayForWind(wind);
    if (!this.airport.runwayEnd(runway)) throw new Error(`Unknown runway ${runway}`);
    this.config.runway = runway;
    this.atis = {
      letter: String.fromCharCode(65 + this.rng.int(0, 25)),
      runway,
      wind,
      qnh: this.rng.int(1003, 1028),
      updatedAt: 0,
    };

    if (config.generateTraffic !== false) this.traffic.populateInitial();
  }

  // ------------------------------------------------------------------ events

  on<K extends keyof Events>(event: K, cb: Listener<Events[K]>): () => void {
    this.listeners[event].push(cb);
    return () => {
      const l = this.listeners[event];
      l.splice(l.indexOf(cb), 1);
    };
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const cb of this.listeners[event]) cb(payload);
  }

  private pushMessage(m: RadioMessage): void {
    this.messages.push(m);
    if (this.messages.length > 500) this.messages.shift();
    this.emit('message', m);
  }

  system(text: string, kind: MessageKind = 'system', callsign?: string): void {
    this.pushMessage({ id: this.nextSystemId++, time: this.time, kind, from: 'SYSTEM', text, spoken: '', callsign });
  }

  incident(type: IncidentType, text: string, callsigns: string[]): void {
    const inc: Incident = { time: this.time, type, text, callsigns };
    this.incidents.push(inc);
    if (type === 'collision') this.stats.collisions++;
    if (type === 'incursion') this.stats.incursions++;
    if (type === 'goAround') this.stats.goArounds++;
    this.updateScore();
    this.system(text, 'warning', callsigns[0]);
    this.emit('incident', inc);
  }

  // ------------------------------------------------------------------ time

  /** Current simulated UTC time. */
  utc(): Date {
    return new Date(this.startEpochMs + this.time * 1000);
  }

  /** Advances the simulation by `dt` seconds (already multiplied by the sim rate). */
  tick(dt: number): void {
    this.accumulator += Math.min(dt, 5);
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.step(STEP);
    }
  }

  private step(dt: number): void {
    this.time += dt;
    if (this.config.generateTraffic !== false) this.traffic.update();
    this.tower.update(dt);
    updateSeparation(this);
    for (const ac of this.aircraft) {
      updatePilot(this, ac);
      updateMovement(this, ac, dt);
    }
    detectCollisions(this);
    this.frequency.update(this.time);

    const gone = this.aircraft.filter((a) => a.phase === 'gone');
    if (gone.length) {
      this.aircraft = this.aircraft.filter((a) => a.phase !== 'gone');
      for (const g of gone) {
        this.frequency.cancel(g.callsign);
        this.emit('aircraftRemoved', g);
      }
    }
  }

  // ------------------------------------------------------------------ controller input

  /**
   * Transmits a controller message. The text is parsed as ICAO phraseology,
   * the addressed pilot executes the instructions and reads them back.
   */
  transmit(text: string, selected?: string, opts: { fallbackToLastCaller?: boolean } = {}): TransmitResult {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false };
    const callsigns = this.aircraft.map((a) => a.callsign);
    let parsed = parseTransmission(trimmed, { callsigns, taxiways: this.airport.taxiwayNames, selected });
    // Voice-only operation: without callsign and selection, address the pilot who called last.
    if (!parsed.callsign && opts.fallbackToLastCaller) {
      const last = this.lastCaller();
      if (last) parsed = parseTransmission(trimmed, { callsigns, taxiways: this.airport.taxiwayNames, selected: last.callsign });
    }
    return executeTransmission(this, parsed, trimmed);
  }

  /** The pilot on my frequency who most recently made a request that is still open. */
  lastCaller(): Aircraft | undefined {
    return this.aircraft
      .filter((a) => a.request && this.isOnMyFrequency(a))
      .sort((a, b) => b.lastCallAt - a.lastCallAt)[0];
  }

  // ------------------------------------------------------------------ ATIS / runway

  /** Active runway end designator. */
  get runway(): string {
    return this.config.runway!;
  }

  get atisLetter(): string {
    return this.atis.letter;
  }

  /** Headwind (positive) / tailwind (negative) and crosswind components in knots for a runway end. */
  windComponents(runwayEnd: string, wind = this.atis.wind): { headwind: number; crosswind: number } {
    const end = this.airport.runwayEnd(runwayEnd);
    if (!end) return { headwind: 0, crosswind: 0 };
    const magHeading = end.heading - this.config.airport.magneticVariation;
    const diff = ((wind.direction - magHeading) * Math.PI) / 180;
    return { headwind: wind.speedKt * Math.cos(diff), crosswind: wind.speedKt * Math.sin(diff) };
  }

  bestRunwayForWind(wind: { direction: number; speedKt: number }): string {
    const ends = this.config.airport.runwayOps.map((o) => o.runway);
    // Calm or light wind: keep the first (preferred) runway unless it has more than 3 kt tailwind.
    const pref = ends[0];
    if (this.windComponents(pref, wind).headwind >= -3) return pref;
    return ends.reduce((b, e) => (this.windComponents(e, wind).headwind > this.windComponents(b, wind).headwind ? e : b));
  }

  /**
   * Updates the ATIS. A new information letter is issued automatically
   * (unless one is given) and a runway change is applied to the traffic.
   */
  updateAtis(change: AtisChange): void {
    const a = this.atis;
    const runwayChanged = change.runway !== undefined && change.runway !== a.runway;
    if (change.wind) a.wind = { ...change.wind };
    if (change.qnh !== undefined) a.qnh = change.qnh;
    if (runwayChanged) {
      if (!this.airport.runwayEnd(change.runway!)) throw new Error(`Unknown runway ${change.runway}`);
      a.runway = change.runway!;
      this.changeRunway(change.runway!);
    }
    a.letter = change.letter ?? nextLetter(a.letter);
    a.updatedAt = this.time;
    this.system(`ATIS information ${a.letter} is now current: ${this.atisText()}`);
  }

  /** ATIS broadcast text (abbreviated). */
  atisText(): string {
    const a = this.atis;
    const hhmm = this.utc().toISOString().slice(11, 16).replace(':', '');
    const w = a.wind.speedKt === 0 ? 'calm' : `${String(a.wind.direction).padStart(3, '0')} degrees ${a.wind.speedKt} knots`;
    return `${this.station.name.split(' ')[0]} information ${a.letter}, time ${hhmm}, runway in use ${a.runway}, wind ${w}, QNH ${a.qnh}, transition level 70.`;
  }

  private changeRunway(newEnd: string): void {
    this.config.runway = newEnd;
    const sids = this.config.airport.sids;
    for (const ac of this.aircraft) {
      if (ac.category === 'departure' && ['parked', 'pushback', 'startup'].includes(ac.phase) && !ac.pendingTaxi) {
        ac.runway = newEnd;
        ac.flightPlan.runway = newEnd;
        const fix = sids.find((x) => x.name === ac.flightPlan.sid)?.fix;
        const sid = sids.find((x) => x.runway === newEnd && x.fix === fix) ?? sids.find((x) => x.runway === newEnd);
        ac.flightPlan.sid = sid?.name;
      }
      // Approach re-sequences arrivals that are not yet on short final onto the new runway.
      if (ac.phase === 'approach' && this.distanceToThresholdNm(ac) > 3.5) {
        this.tower.setupApproach(ac, Math.max(6, this.distanceToThresholdNm(ac)), newEnd);
      }
    }
    this.system(`Runway in use is now ${newEnd}. Taxiing departures keep their clearance - re-route them if needed.`);
  }

  // ------------------------------------------------------------------ queries

  find(callsign: string | undefined): Aircraft | undefined {
    if (!callsign) return undefined;
    const c = callsign.toUpperCase();
    return this.aircraft.find((a) => a.callsign === c);
  }

  /** True if the aircraft talks to the user's position. */
  isOnMyFrequency(ac: Aircraft): boolean {
    return ac.frequency === this.config.position;
  }

  /** Aircraft occupying or holding a reservation for a stand. */
  standOccupant(standId: string, except?: Aircraft): Aircraft | undefined {
    const id = standId.toUpperCase();
    const stand = this.airport.stand(id);
    return this.aircraft.find((a) => {
      if (a === except || a.phase === 'gone') return false;
      if (a.assignedStand === id && a.phase !== 'arrived') return true;
      if (a.stand === id && (a.phase === 'parked' || a.phase === 'arrived' || (a.phase === 'pushback' && a.s < 30))) return true;
      // physically on the stand
      return !!stand && a.onGround && distance(a.pos, stand.pos) < 15 && a.phase !== 'taxi';
    });
  }

  freeStands(minWingspan: number, filter?: (s: Stand) => boolean): Stand[] {
    return [...this.airport.stands.values()].filter(
      (s) => s.maxWingspanM >= minWingspan && !this.standOccupant(s.id) && (!filter || filter(s)),
    );
  }

  /** Distance of an airborne arrival to the active runway threshold in NM (Infinity if none). */
  distanceToThresholdNm(ac: Aircraft): number {
    const end = this.airport.runwayEnd(ac.runway ?? this.runway);
    if (!end) return Infinity;
    return distance(ac.pos, end.threshold) / M_PER_NM;
  }

  // ------------------------------------------------------------------ stats

  recordAnswer(ac: Aircraft): void {
    if (ac.request === null) return;
    const wait = Math.max(0, this.time - ac.requestSince);
    this.stats.totalWaitSeconds += wait;
    this.stats.delayPenalty += Math.floor(Math.max(0, wait - 30) / 15);
    this.stats.answeredRequests++;
    this.updateScore();
  }

  updateScore(): void {
    const s = this.stats;
    s.score =
      s.departuresHandedOff * 10 +
      s.arrivalsParked * 10 +
      s.bonus -
      s.sayAgains * 2 -
      s.delayPenalty -
      s.incursions * 50 -
      s.collisions * 100 -
      s.goArounds * 15;
  }

  /** Display name of an aircraft for messages. */
  tel(ac: Aircraft): string {
    return telephony(ac);
  }
}

function nextLetter(l: string): string {
  return l === 'Z' ? 'A' : String.fromCharCode(l.charCodeAt(0) + 1);
}
