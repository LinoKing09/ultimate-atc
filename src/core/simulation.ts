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
  /** Active runway end, e.g. "25". */
  runway: string;
  density: Density;
  seed?: number;
  /** UTC start time of the session; defaults to the current time. */
  startTime?: Date;
  /** Set to false to start with an empty airport (used by tests). */
  generateTraffic?: boolean;
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
  score: number;
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
    score: 0,
  };

  atisLetter: string;
  private atisChangedAt = 0;
  wind: { direction: number; speedKt: number };
  qnh: number;

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
    if (!this.airport.runwayEnd(config.runway)) throw new Error(`Unknown runway ${config.runway}`);
    this.station = station;
    this.startEpochMs = (config.startTime ?? new Date()).getTime();
    this.frequency = new Frequency(station.frequency, (m) => this.pushMessage(m));
    this.tower = new TowerAI(this);
    this.traffic = new TrafficGenerator(this);

    this.atisLetter = String.fromCharCode(65 + this.rng.int(0, 25));
    const rwyHeading = this.airport.runwayEnd(config.runway)!.heading - config.airport.magneticVariation;
    this.wind = {
      direction: Math.round((rwyHeading + this.rng.range(-30, 30) + 360) % 360 / 10) * 10 || 360,
      speedKt: this.rng.int(3, 14),
    };
    this.qnh = this.rng.int(1003, 1028);

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
    if (this.time - this.atisChangedAt > 1800) {
      this.atisChangedAt = this.time;
      this.atisLetter = this.atisLetter === 'Z' ? 'A' : String.fromCharCode(this.atisLetter.charCodeAt(0) + 1);
      this.system(`ATIS information ${this.atisLetter} is now current.`);
    }
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
  transmit(text: string, selected?: string): TransmitResult {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false };
    const parsed = parseTransmission(trimmed, {
      callsigns: this.aircraft.map((a) => a.callsign),
      taxiways: this.airport.taxiwayNames,
      selected,
    });
    return executeTransmission(this, parsed, trimmed);
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
    const end = this.airport.runwayEnd(ac.runway ?? this.config.runway);
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
      s.arrivalsParked * 10 -
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
