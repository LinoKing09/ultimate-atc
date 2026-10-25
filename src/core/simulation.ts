import { Airport, type Stand } from './airport/airport';
import type { AirportData, ParallelRunwayData, StationData, StationType } from './airport/types';
import type { AircraftType } from '../data/aircraftTypes';
import { telephony, type Aircraft } from './aircraft';
import { M_PER_NM, distance, projectOnSegment } from './geo';
import { detectCollisions, updateMovement, updateSeparation } from './movement';
import { createVehicles, executeVehicleTransmission, updateVehicles, type Vehicle } from './vehicles';
import { parseTransmission } from './phraseology/parser';
import { faaStyle } from './phraseology/faa';
import { earliestIntersection, executeTransmission, updatePilot } from './pilot';
import { Frequency, type MessageKind, type RadioMessage } from './radio';
import { updateConflictAlerts, updateRunwayAlerts } from './conflicts';
import { updateOppositeTraffic } from './opposite';
import { scoreOf } from './debrief';
import { updateSequencer, updateDeliveryAI } from './delivery';
import { updateGroundAI } from './groundAI';
import { Rng } from './random';
import { SYSTEMS, approachType, defaultSystemStates, type ApproachType, type SystemId, type SystemStates } from './systems';
import { SCENARIO_EVENT_TEXT, type ScenarioEvent, type ScenarioSetup } from './scenario';
import { TowerAI } from './tower';
import { TrafficGenerator } from './traffic';
import { EVENT_LEVELS, clampLevel, type Density } from './levels';
import { updateNight } from './night';
import { deicingActive } from './deicing';
import { utcOffsetMinutes } from './time';
import { altimeterOf, atisDifferences, datisMet, initialMet, metWords, temperatureWords, trendWords, updateMet, updateWind, type Metar, type MetState } from './met';
import { startThunderstorm, updateWeather, windWords, type StormState, type Wind } from './weather';
import { capitalize, defaultRunwayKey, runwayEndsOf, runwayWords, usRunway } from './runways';

export type { Density } from './levels';

/** What a station does for an aircraft (independent of which station type does it at a given airport). */
export type StationRole = 'delivery' | 'ground' | 'tower';

/** Wingtip clearance between parked aircraft (ICAO Annex 14): 4.5 m for code C, 7.5 m for code D-F. */
const STAND_CLEARANCE_C = 4.5;
const STAND_CLEARANCE_D = 7.5;
/** Wingspan from which an aircraft is code D or larger. */
const CODE_D_WINGSPAN = 36;

export interface SimConfig {
  airport: AirportData;
  /** Position the user is logged in as (the primary one). Only 'GND' is implemented so far. */
  position: StationType;
  /**
   * All positions the user staffs at the same time (combined positions, e.g. GND + TWR).
   * Defaults to `[position]`. Unstaffed positions are run by the AI.
   */
  positions?: StationType[];
  /**
   * Runway end in use, e.g. "25", or several parallel ones joined with "+" ("26R+26L"). If omitted, the runway
   * is chosen from the wind (with its parallel runway where the airport has one).
   */
  runway?: string;
  density: Density;
  seed?: number;
  /** UTC start time of the session; defaults to the current time (a scenario start time sets it, see time.ts). */
  startTime?: Date;
  /** Set to false to start with an empty airport (used by tests). */
  generateTraffic?: boolean;
  /** Random special events (medical emergencies, rejected take-offs). Default: true. */
  events?: boolean;
  /** How often random special events happen: step 0-4 of EVENT_LEVELS (overrides `events`). */
  eventLevel?: number;
  /** Training scenario: traffic mix, more heavies, scheduled events (see scenario.ts). */
  scenario?: ScenarioSetup;
  /**
   * How the session starts: 'empty' (default) - departures on their stands, the first arrivals on approach; or
   * 'handover' - you take over from the controller before you: the simulator works the airport for
   * HANDOVER_S first, so aircraft are already taxiing, holding, landing and pushing back.
   */
  start?: 'empty' | 'handover';
}

/** How long the simulator works the airport before you take over ('handover' start), seconds. */
export const HANDOVER_S = 20 * 60;

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
  /** Delivery: departures cleared and handed to Ground. */
  clearancesDelivered: number;
  /** Delivery: wrong squawk readbacks that were not corrected. */
  readbackErrorsMissed: number;
  /** Delivery: wrong readbacks the controller corrected. */
  readbackErrorsCaught: number;
  /** Departures that missed their CTOT window (-5/+10 min) or took off before it. */
  slotsMissed: number;
  /** Tows brought to their stand. */
  towsCompleted: number;
  /** Tower: departures handed to Radar after take-off. */
  departuresToRadar: number;
  /** Tower: arrivals handed to Ground after vacating. */
  arrivalsToGround: number;
  /** Tower: departures that left without a frequency change. */
  handoffsMissed: number;
  /** Tower: take-offs with less than the required departure (wake / route) spacing. */
  separationLosses: number;
  /** Tower: go-arounds you instructed. */
  goAroundsInstructed: number;
  /** Minutes Approach held all arrivals on your request. */
  arrivalStopMinutes: number;
  /** Minutes Ground held all departures on your request. */
  departureStopMinutes: number;
  /** Night rules: jets ready in time that were still on the ground when the curfew started. */
  curfewMissed: number;
  /** Thunderstorm: go-arounds in windshear or tailwind (not counted against you). */
  weatherGoArounds: number;
  /** Crews that reported an old ATIS letter and left your frequency without the current one. */
  atisNotCorrected: number;
  score: number;
}

/** Current ATIS (maintained by the controller). */
export interface AtisInfo {
  letter: string;
  /** Runway(s) in use, e.g. "25" or "26R+26L". */
  runway: string;
  wind: Wind;
  qnh: number;
  /** Simulation time of the last update. */
  updatedAt: number;
  /** The METAR the information was made from (visibility, weather, clouds, temperature, trend). */
  metar: Metar;
}

export interface AtisChange {
  letter?: string;
  runway?: string;
  wind?: Wind;
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
  /** Simulated seconds summed over all simulations in this process (test and benchmark statistics). */
  static simulatedSeconds = 0;
  readonly airport: Airport;
  readonly rng: Rng;
  readonly seed: number;

  /**
   * A stable pseudo-random number in [0, 1) for a key (e.g. "DLH5AB:pace"), derived from the
   * session seed without drawing from `rng`: small per-aircraft variations (taxi pace, braking)
   * do not shift the random sequence of the rest of the simulation.
   */
  variation(key: string): number {
    let x = 2166136261 ^ this.seed;
    for (let i = 0; i < key.length; i++) {
      x ^= key.charCodeAt(i);
      x = Math.imul(x, 16777619);
    }
    x ^= x >>> 15;
    x = Math.imul(x, 2246822507);
    x ^= x >>> 13;
    return (x >>> 0) / 2 ** 32;
  }
  readonly frequency: Frequency;
  readonly tower: TowerAI;
  readonly traffic: TrafficGenerator;
  readonly station: StationData;
  /** Stations staffed by the user. */
  /** Stations whose frequency the user is working right now (switchable in the toolbar). */
  readonly userStations: Set<StationType>;
  /** Stations the user connected as (login); each can be switched off and on again. */
  readonly loggedInStations: StationType[];
  /** On/off state of the ATC and airport systems (systems window). */
  readonly systems: SystemStates;
  /** Current head-on conflicts between cleared routes (CATC), by pair key. */
  readonly routeConflicts = new Map<string, { a: Aircraft; b: Aircraft; taxiway: string }>();
  /** CATC alerts the controller has acknowledged (pair keys); dropped once the conflict is gone. */
  readonly catcAcknowledged = new Set<string>();
  private nextConflictCheck = 0;
  private nextOppositeCheck = 0;
  /**
   * Coordination with the neighbouring positions the simulator runs: you asked Approach to send
   * no more arrivals, or Ground to hold all departures (to make room). Each costs points per minute.
   */
  readonly flow = { arrivalsStopped: false, departuresStopped: false, askIntersections: false, arrivalSeconds: 0, departureSeconds: 0 };
  /** The longest waits for an answer this session (debriefing). */
  readonly longestWaits: { callsign: string; seconds: number }[] = [];
  /** Follow-me cars (tugs are drawn with the aircraft they move). */
  readonly vehicles: Vehicle[];
  readonly startEpochMs: number;

  /** Factor on the chances of random special events (0 = never, 1 = the standard "rare" rates). */
  get eventFactor(): number {
    const c = this.config;
    if (c.eventLevel !== undefined) return EVENT_LEVELS[clampLevel(c.eventLevel)].factor;
    return c.events === false ? 0 : 1;
  }

  /** Simulation time in seconds since the start of the simulation (with a 'handover' start, HANDOVER_S before yours). */
  time = 0;
  /** Simulation time when you took over (0, or HANDOVER_S with a 'handover' start). */
  sessionStart = 0;
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
    clearancesDelivered: 0,
    readbackErrorsMissed: 0,
    readbackErrorsCaught: 0,
    towsCompleted: 0,
    departuresToRadar: 0,
    arrivalsToGround: 0,
    handoffsMissed: 0,
    separationLosses: 0,
    arrivalStopMinutes: 0,
    departureStopMinutes: 0,
    goAroundsInstructed: 0,
    slotsMissed: 0,
    curfewMissed: 0,
    weatherGoArounds: 0,
    atisNotCorrected: 0,
    score: 0,
  };

  readonly atis: AtisInfo;
  /** Weather observations (METAR), see met.ts. */
  readonly met: MetState;
  /** The ATIS letters broadcast in this session with their times (the first one from the start). */
  private atisHistory: { letter: string; at: number }[] = [];
  /** Actual surface wind. Changes with a scenario wind shift or thunderstorm; broadcasting an ATIS wind sets it too. */
  observedWind: Wind;
  /** Active thunderstorm (scenario event), see weather.ts. */
  storm?: StormState;
  /** Offset of the airport's local time from UTC at the session start (minutes). */
  readonly utcOffsetMin: number;
  /** Scheduled scenario events not yet due, earliest first. */
  private scenarioPending: ScenarioEvent[];
  /** Set by a scenario event: the next arrival declares a medical emergency. */
  forceMedicalArrival = false;
  /** Set by a scenario event: the next take-off is rejected. */
  forceRejectedTakeoff = false;
  /** Squawk readback errors in voice clearances: at random (4 %), never, or for the next clearance only (tutorials). */
  readbackErrors: 'random' | 'off' | 'next' = 'random';

  private listeners: { [K in keyof Events]: Listener<Events[K]>[] } = {
    message: [],
    incident: [],
    aircraftRemoved: [],
  };
  private nextSystemId = 1_000_000;
  private accumulator = 0;

  constructor(readonly config: SimConfig) {
    this.airport = new Airport(config.airport);
    this.seed = config.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = new Rng(this.seed);
    const station = this.airport.station(config.position);
    if (!station) throw new Error(`${config.airport.icao} has no ${config.position} station`);
    this.station = station;
    this.userStations = new Set([config.position, ...(config.positions ?? [])]);
    this.loggedInStations = [...this.userStations];
    this.systems = defaultSystemStates(config.airport.systems);
    this.vehicles = createVehicles(this);
    // With a hand-over, the simulator starts working the airport HANDOVER_S before your start time.
    this.startEpochMs = (config.startTime ?? new Date()).getTime() - (config.start === 'handover' ? HANDOVER_S * 1000 : 0);
    this.utcOffsetMin = config.airport.timeZone ? utcOffsetMinutes(new Date(this.startEpochMs), config.airport.timeZone) : 0;
    for (const t of config.scenario?.closedTaxiways ?? []) {
      if (this.airport.taxiwayNames.has(t.toUpperCase())) this.airport.closedTaxiways.add(t.toUpperCase());
    }
    this.frequency = new Frequency(station.frequency, (m) => this.pushMessage(m), config.airport.phraseology === 'faa' ? faaStyle : undefined, config.airport.phraseology === 'faa');
    this.tower = new TowerAI(this);
    this.traffic = new TrafficGenerator(this);

    // Wind first; the active runway is the one with the most headwind unless given.
    // Stuttgart: about 60 % of the operations on runway 25 (long-term average, RP Stuttgart noise report).
    const wm = config.airport.wind ?? { primaryShare: 0.6, primary: [220, 290], secondary: [40, 110] };
    const primary = this.rng.chance(wm.primaryShare);
    const [from, to] = primary ? wm.primary : wm.secondary;
    const wind = {
      direction: ((Math.round(this.rng.range(from, to) / 10) * 10) % 360) || 360,
      speedKt: this.rng.int(3, 14),
    };
    const runway = config.runway?.toUpperCase() ?? this.defaultRunwayKey(this.bestRunwayForWind(wind));
    for (const end of runwayEndsOf(runway)) if (!this.airport.runwayEnd(end)) throw new Error(`Unknown runway ${end}`);
    this.config.runway = runway;
    const letter = String.fromCharCode(65 + this.rng.int(0, 25));
    const qnh = this.rng.int(1003, 1028);
    this.observedWind = { ...wind };
    this.met = initialMet(this, qnh);
    this.atis = { letter, runway, wind, qnh, updatedAt: 0, metar: this.met.metar };
    this.atisHistory.push({ letter, at: -Infinity });
    this.scenarioPending = (config.scenario?.events ?? []).map((e) => ({ ...e })).sort((a, b) => a.atMin - b.atMin);

    if (config.generateTraffic !== false) this.traffic.populateInitial();
    if (config.start === 'handover' && config.generateTraffic !== false) this.takeOver();
  }

  /**
   * 'handover' start: the simulator runs every position for HANDOVER_S (as it does for positions you don't staff),
   * then hands the airport over to you with its traffic in progress. Scores, statistics and messages start from
   * there; scheduled scenario events are shifted by the same time.
   */
  private takeOver(): void {
    const staffed = [...this.userStations];
    this.userStations.clear();
    for (const e of this.scenarioPending) e.atMin += HANDOVER_S / 60;
    for (let t = 0; t < HANDOVER_S; t++) this.tick(1);
    for (const st of staffed) this.userStations.add(st);
    // What the simulator still had to answer is yours now: those crews call you again within the next half minute.
    for (const a of this.aircraft) {
      if (!this.userStations.has(a.frequency) || !a.request) continue;
      a.requestSince = this.time;
      a.callCount = 0;
      a.lastCallAt = this.time - 90 + 30 * this.variation(`${a.callsign}:takeover`);
    }
    this.sessionStart = this.time;
    this.messages.length = 0;
    this.incidents.length = 0;
    this.longestWaits.length = 0;
    for (const k of Object.keys(this.stats) as (keyof Stats)[]) this.stats[k] = 0;
    this.flow.arrivalSeconds = this.flow.departureSeconds = 0;
    const moving = this.aircraft.filter((a) => a.onGround && ['pushback', 'taxi', 'holding', 'lineup', 'vacating'].includes(a.phase)).length;
    const airborne = this.aircraft.filter((a) => !a.onGround && a.category === 'arrival').length;
    this.system(`You take over from the controller before you: ${moving} aircraft ${moving === 1 ? 'is' : 'are'} moving on the ground, ${airborne} ${airborne === 1 ? 'arrival is' : 'arrivals are'} on approach. Check the lists and the scope - the crews call you with their next request.`);
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

  /**
   * Local airport time at simulation time `t` as minutes after midnight (0-1439). The UTC offset
   * of the session start is used for the whole session (no daylight saving change mid-session).
   */
  localMinutes(t = this.time): number {
    const utcMin = (this.startEpochMs + t * 1000) / 60000;
    return ((Math.floor(utcMin + this.utcOffsetMin) % 1440) + 1440) % 1440;
  }

  /** Advances the simulation by `dt` seconds (already multiplied by the sim rate). */
  /** How far the next simulation step is (0-1): the scope interpolates vehicle positions with it. */
  get stepFraction(): number {
    return this.accumulator / STEP;
  }

  tick(dt: number): void {
    this.accumulator += Math.min(dt, 5);
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.step(STEP);
    }
  }

  private step(dt: number): void {
    this.time += dt;
    Simulation.simulatedSeconds += dt;
    this.updateScenario();
    updateWeather(this);
    updateWind(this);
    updateMet(this);
    updateNight(this);
    if (this.config.generateTraffic !== false) this.traffic.update();
    this.tower.update(dt);
    this.updateFlow(dt);
    this.updateHandoffs();
    updateSeparation(this);
    if (this.time >= this.nextOppositeCheck) {
      this.nextOppositeCheck = this.time + 2;
      updateOppositeTraffic(this);
    }
    for (const ac of this.aircraft) {
      updatePilot(this, ac);
      updateMovement(this, ac, dt);
    }
    updateVehicles(this, dt);
    detectCollisions(this);
    updateRunwayAlerts(this);
    if (this.time >= this.nextConflictCheck) {
      this.nextConflictCheck = this.time + 5;
      updateConflictAlerts(this);
      updateSequencer(this);
      updateDeliveryAI(this);
      updateGroundAI(this);
      this.checkAtisCorrections();
    }
    this.frequency.update(this.time);

    const gone = this.aircraft.filter((a) => a.phase === 'gone');
    if (gone.length) {
      this.aircraft = this.aircraft.filter((a) => a.phase !== 'gone');
      for (const g of gone) {
        this.missAtisCorrection(g);
        this.frequency.release(g.callsign);
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
    if (/^all stations\b/i.test(trimmed)) return this.broadcast(trimmed);
    const callsigns = this.radioCallsigns;
    let parsed = parseTransmission(trimmed, { callsigns, taxiways: this.airport.taxiwayNames, selected, sids: this.sidNames });
    // Voice-only operation: without callsign and selection, address the pilot who called last.
    if (!parsed.callsign && opts.fallbackToLastCaller) {
      const last = this.lastCaller();
      if (last) parsed = parseTransmission(trimmed, { callsigns, taxiways: this.airport.taxiwayNames, selected: last.callsign, sids: this.sidNames });
    }
    const vehicle = this.vehicles.find((v) => v.callsign === parsed.callsign);
    if (vehicle) return executeVehicleTransmission(this, vehicle, parsed, trimmed);
    return executeTransmission(this, parsed, trimmed);
  }

  /**
   * A broadcast to all stations on your frequencies ("all stations, information Bravo is now
   * current"). Nobody reads it back. "All stations, standby" puts every open request on hold.
   */
  private broadcast(text: string): TransmitResult {
    const body = text.replace(/^all stations[,\s]*/i, '');
    const clean = body.replace(/^stuttgart (delivery|ground|tower)[,\s]*/i, '');
    this.frequency.controllerTransmit(this.time, `All stations, ${this.station.name}, ${clean}`);
    // "Information K is now current": every crew on your frequencies has the current ATIS now.
    const info = parseTransmission(clean, { callsigns: [], taxiways: this.airport.taxiwayNames, sids: [] }).commands.find((c) => c.type === 'information');
    if (info?.type === 'information' && info.letter === this.atis.letter) {
      for (const ac of this.aircraft) if (this.isOnMyFrequency(ac)) this.tellAtis(ac);
    }
    if (/^standby\b/i.test(clean)) {
      for (const ac of this.aircraft) {
        if (!this.isOnMyFrequency(ac)) continue;
        ac.standbyUntil = this.time + 120;
        if (ac.request) {
          this.recordAnswer(ac);
          ac.requestSince = this.time;
        }
      }
    }
    return { ok: true };
  }

  /** Callsigns that can be addressed by radio: aircraft and tows, and the follow-me cars. */
  get radioCallsigns(): string[] {
    return [...this.aircraft.map((a) => a.callsign), ...this.vehicles.map((v) => v.callsign)];
  }

  /** A follow-me car by callsign. */
  findVehicle(callsign: string | undefined): Vehicle | undefined {
    return callsign ? this.vehicles.find((v) => v.callsign === callsign.toUpperCase()) : undefined;
  }

  /** The pilot on my frequency who most recently made a request that is still open. */
  lastCaller(): Aircraft | undefined {
    return this.aircraft
      .filter((a) => a.request && this.isOnMyFrequency(a))
      .sort((a, b) => b.lastCallAt - a.lastCallAt)[0];
  }

  // ------------------------------------------------------------------ scenario

  private scenarioNoticePosted = false;

  /** Fires scheduled scenario events that are due. */
  private updateScenario(): void {
    if (!this.scenarioNoticePosted) {
      this.scenarioNoticePosted = true;
      const closed = [...this.airport.closedTaxiways].sort();
      if (closed.length) {
        this.system(`NOTAM: taxiway${closed.length > 1 ? 's' : ''} ${closed.join(', ')} closed (construction works), including runway entries and exits there. Crews refuse routes over closed taxiways.`, 'warning');
      }
    }
    const next = this.scenarioPending[0];
    if (!next || this.time < next.atMin * 60) return;
    if (this.fireScenarioEvent(next)) this.scenarioPending.shift();
    else next.atMin += 0.5; // nobody suitable yet: try again in 30 s
  }

  private fireScenarioEvent(e: ScenarioEvent): boolean {
    switch (e.kind) {
      case 'thunderstorm':
        return startThunderstorm(this);
      case 'medicalArrival':
        this.forceMedicalArrival = true;
        return true;
      case 'rejectedTakeoff':
        this.forceRejectedTakeoff = true;
        return true;
      case 'medicalDeparture': {
        // A departure on your frequency that has not started to taxi yet; the emergency starts 40 s after it does.
        const ac = this.aircraft
          .filter((a) => a.category === 'departure' && this.isOnMyFrequency(a) && ['parked', 'pushback', 'startup'].includes(a.phase) && !a.emergency && !a.returnToStand)
          .sort((a, b) => a.readyAt - b.readyAt)[0];
        if (!ac) return false;
        ac.plannedMedical = true;
        return true;
      }
      case 'windShift': {
        const old = this.observedWind;
        const wind = { direction: (Math.round((old.direction + 180) / 10) * 10) % 360 || 360, speedKt: this.rng.int(9, 15) };
        this.observedWind = wind;
        const tail = -Math.round(this.windComponents(this.runway, wind).headwind);
        const best = this.bestRunwayForWind(wind);
        const w = `${String(wind.direction).padStart(3, '0')}/${String(wind.speedKt).padStart(2, '0')} KT`;
        this.system(
          `${SCENARIO_EVENT_TEXT.windShift}: the surface wind is now ${w}${tail > 0 ? `, ${tail} kt tailwind on runway ${this.runway}` : ''}. ${!this.isRunwayInUse(best) ? `Broadcast a new ATIS with ${runwayWords(runwayEndsOf(this.defaultRunwayKey(best)))} and re-route the traffic.` : 'Broadcast a new ATIS.'}`,
          'warning',
        );
        return true;
      }
    }
  }

  // ------------------------------------------------------------------ ATIS / runway

  /** Runway end in use (with parallel runways: the first one, which the ATIS names first). */
  get runway(): string {
    return this.runways[0];
  }

  /** All runway ends in use, e.g. ["26R", "26L"]. */
  get runways(): string[] {
    return runwayEndsOf(this.config.runway!);
  }

  /** The runway(s) in use as one key, e.g. "25" or "26R+26L" (ATIS, scenario codes). */
  get runwayKey(): string {
    return this.config.runway!;
  }

  /** True if this runway end is in use. */
  isRunwayInUse(end: string | undefined): boolean {
    return !!end && this.runways.includes(end.toUpperCase());
  }

  /** The runway end in use on a physical runway (e.g. "08L/26R" -> "26R"), if that runway is in use. */
  activeEndOn(runway: string | undefined): string | undefined {
    return this.runways.find((e) => this.airport.runwayEnd(e)?.runway === runway);
  }

  /** The parallel runway set that is in use, if more than one runway is. */
  get parallelOps(): ParallelRunwayData | undefined {
    const ends = this.runways;
    if (ends.length < 2) return undefined;
    return this.config.airport.parallelRunways?.find((p) => p.ends.length === ends.length && p.ends.every((e) => ends.includes(e)));
  }

  /** The runway a departure taxis to: its assigned one if that is in use, else the one of its stand. */
  departureRunwayOf(ac: Aircraft): string {
    return this.isRunwayInUse(ac.runway) ? ac.runway!.toUpperCase() : this.runwayFor(ac.stand, ac.type);
  }

  /** Runway key for a direction of operation: the parallel runways of this end where the airport has them. */
  defaultRunwayKey(end: string): string {
    return defaultRunwayKey(this.config.airport, end);
  }

  /**
   * The runway in use an aircraft of this stand and type departs from or lands on: the runway of its apron or
   * size (parallel runway data), else the one nearest to the stand.
   */
  runwayFor(standId: string | undefined, type: AircraftType): string {
    const ends = this.runways;
    if (ends.length === 1) return ends[0];
    const p = this.parallelOps;
    const onRunway = (runway: string | undefined) => this.activeEndOn(runway);
    if (p?.largeAircraft && type.wingspanM >= p.largeAircraft.minWingspanM) {
      const e = onRunway(p.largeAircraft.runway);
      if (e) return e;
    }
    const stand = standId ? this.airport.stand(standId) : undefined;
    if (!stand) return ends[0];
    const byApron = onRunway(p?.aprons?.[stand.apron]);
    if (byApron) return byApron;
    const lateral = (e: string) => Math.abs(this.airport.runwayCoordinates(this.airport.runwayEnd(e)!, stand.pos).lateral);
    return ends.reduce((a, b) => (lateral(b) < lateral(a) ? b : a));
  }

  get atisLetter(): string {
    return this.atis.letter;
  }

  /** The latest weather observation. */
  get metar(): Metar {
    return this.met.metar;
  }

  /**
   * The ATIS letter a crew reports: the information that was current when they listened to the ATIS,
   * 2-8 minutes before their first call (or the one you told them). An old letter on your frequency
   * has to be corrected ("information K is current, QNH 1018") before the aircraft leaves it.
   */
  atisLetterOf(ac: Aircraft): string {
    if (!ac.atisHeard) {
      const at = this.time - 120 - 360 * this.variation(`${ac.callsign}:atis`);
      ac.atisHeard = [...this.atisHistory].reverse().find((h) => h.at <= at)?.letter ?? this.atis.letter;
    }
    ac.atisOutdated = ac.atisHeard !== this.atis.letter && this.isOnMyFrequency(ac);
    return ac.atisHeard;
  }

  /** The crew has the current ATIS (you told them, or a broadcast). */
  tellAtis(ac: Aircraft): void {
    ac.atisHeard = this.atis.letter;
    ac.atisOutdated = false;
  }

  /** Crews with an old ATIS letter that left your frequencies uncorrected cost points. */
  private checkAtisCorrections(): void {
    for (const ac of this.aircraft) if (ac.atisOutdated && !this.isOnMyFrequency(ac)) this.missAtisCorrection(ac);
  }

  private missAtisCorrection(ac: Aircraft): void {
    if (!ac.atisOutdated) return;
    ac.atisOutdated = false;
    this.stats.atisNotCorrected++;
    this.system(`${ac.callsign} left your frequency with information ${ac.atisHeard} - information ${this.atis.letter} is current. Tell crews with an old letter "information ${this.atis.letter} is current, ${this.pressurePhrase()}".`, 'warning', ac.callsign);
    this.updateScore();
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
    const runwayChanged = change.runway !== undefined && change.runway.toUpperCase() !== a.runway;
    if (change.wind) {
      a.wind = { ...change.wind };
      this.observedWind = { ...change.wind };
    }
    // Without a QNH the latest METAR's.
    a.qnh = change.qnh ?? this.met.metar.qnh;
    a.metar = this.met.metar;
    if (runwayChanged) {
      const key = change.runway!.toUpperCase();
      for (const end of runwayEndsOf(key)) if (!this.airport.runwayEnd(end)) throw new Error(`Unknown runway ${end}`);
      a.runway = key;
      this.changeRunway(key);
    }
    a.letter = change.letter ?? nextLetter(a.letter);
    a.updatedAt = this.time;
    this.atisHistory.push({ letter: a.letter, at: this.time });
    this.system(`ATIS information ${a.letter} is now current: ${this.atisText()}`);
  }

  /** Approach procedure flown to the runway in use with the navigation aids that are on. */
  get approachType(): ApproachType {
    return this.approachTypeFor(this.runway);
  }

  /** Approach procedure flown to a runway end: the published ones (airport data) with the navigation aids that are on. */
  approachTypeFor(runway: string): ApproachType {
    const end = this.config.airport.runways.flatMap((r) => r.ends).find((e) => e.name === runway);
    return approachType(this.systems, end?.approaches);
  }

  /** Whether a runway end has a published ILS (omitted in the airport data: yes). */
  hasIls(runway = this.runway): boolean {
    const end = this.config.airport.runways.flatMap((r) => r.ends).find((e) => e.name === runway);
    return !end?.approaches || end.approaches.includes('ILS');
  }

  /** "ILS approach runway 25", "localizer approach runway 25", "RNP approach runway 25". */
  approachName(runway = this.runway): string {
    const t = this.approachTypeFor(runway);
    return `${t === 'ILS' ? 'ILS' : t === 'LOC' ? 'localizer' : 'RNP'} approach runway ${runway}`;
  }

  /**
   * Transition level (flight level) for a QNH: the lowest flight level at least 1000 ft above the
   * transition altitude (Germany: 5000 ft gives FL60 from QNH 1013 hPa, FL70 below, FL80 below 978).
   */
  transitionLevel(qnh: number): number {
    const ftPerHpa = 27.3;
    // Tables use whole hPa with 1013 as standard.
    const pressureAltitude = this.config.airport.transitionAltitudeFt + 1000 + (1013 - qnh) * ftPerHpa;
    return Math.ceil(pressureAltitude / 1000) * 10;
  }

  /**
   * The approaches of the runways in use for the ATIS: "ILS approach runway 25", "ILS approach runways 26R and
   * 26L" (the same procedure on both), or each runway's own.
   */
  approachesText(ends = this.runways): string {
    if (ends.length === 1) return this.approachName(ends[0]);
    const types = new Set(ends.map((e) => this.approachTypeFor(e)));
    if (types.size > 1) return ends.map((e) => this.approachName(e)).join(', ');
    const t = this.approachTypeFor(ends[0]);
    return `${t === 'ILS' ? 'ILS' : t === 'LOC' ? 'localizer' : 'RNP'} approach ${runwayWords(ends)}`;
  }

  /**
   * The notices of an ATIS after the runway in use, as D-ATIS text and spoken: runway assignment of parallel
   * runways, closed taxiways, de-icing, A-CDM, datalink clearances out of service, windshear.
   */
  private atisNotices(ends: string[]): { text: string; spoken: string }[] {
    const out: { text: string; spoken: string }[] = [];
    const p = ends.length > 1 ? this.parallelOps : undefined;
    if (p?.aprons) {
      const byRunway = new Map<string, string[]>();
      for (const [apron, runway] of Object.entries(p.aprons)) {
        const end = ends.find((e) => this.airport.runwayEnd(e)?.runway === runway);
        if (end) byRunway.set(end, [...(byRunway.get(end) ?? []), apron]);
      }
      for (const [end, aprons] of byRunway) {
        // "apron 2, 4 or 5"
        const names = aprons.every((x) => /^apron /i.test(x)) ? `apron ${aprons.map((x) => x.slice(6)).join(', ')}` : aprons.join(', ');
        const list = names.replace(/, ([^,]*)$/, ' or $1');
        out.push({ text: `A/C ON ${list.toUpperCase()} EXPECT DEP AND ARR RWY ${end}`, spoken: `aircraft on ${list.toLowerCase()} expect departure and arrival runway ${end}` });
      }
    }
    const large = p?.largeAircraft && ends.find((e) => this.airport.runwayEnd(e)?.runway === p.largeAircraft!.runway);
    if (p?.largeAircraft && large) {
      const m = p.largeAircraft.minWingspanM;
      out.push({ text: `A/C WITH WINGSPAN ${m}M OR MORE EXPECT RWY ${large}`, spoken: `aircraft with a wingspan of ${m} metres or more expect runway ${large}` });
    }
    const closed = [...this.airport.closedTaxiways].sort();
    if (closed.length) out.push({ text: `TWY ${closed.join(' AND ')} CLSD`, spoken: `taxiway${closed.length > 1 ? 's' : ''} ${closed.join(' and ')} closed` });
    if (deicingActive(this)) out.push({ text: 'DE-ICING IN PROGRESS ON DE-ICING PADS', spoken: 'de-icing in progress on the de-icing pads' });
    const has = (id: SystemId) => !this.config.airport.systems || this.config.airport.systems.includes(id);
    if (has('acdm') && this.systemOn('acdm')) out.push({ text: 'A-CDM IN PROGRESS', spoken: 'A-CDM in progress' });
    if (has('dcl') && !this.systemOn('dcl')) out.push({ text: 'DCL U/S', spoken: 'departure clearance via datalink not available' });
    if (this.storm?.phase === 'overhead') out.push({ text: 'CAUTION WINDSHEAR REPORTED ON FINAL', spoken: 'caution, windshear reported on final' });
    return out;
  }

  /** The approach type in ATIS words ("ILS", "localizer", "RNP") and abbreviations ("ILS", "LOC", "RNP"). */
  private approachAbbr(end: string): string {
    const t = this.approachTypeFor(end);
    return t === 'ILS' ? 'ILS' : t === 'LOC' ? 'LOC' : 'RNP';
  }

  /** The airport uses FAA phraseology (US): runways without a leading zero, altimeter in inches, US ATIS. */
  get faa(): boolean {
    return this.config.airport.phraseology === 'faa';
  }

  /** "QNH 1018", at FAA airports "altimeter 3006" (default: the ATIS value). */
  pressurePhrase(qnh = this.atis.qnh): string {
    return this.faa ? `altimeter ${altimeterOf(qnh)}` : `QNH ${qnh}`;
  }

  /** Name of the ATIS station ("San Diego International"), else the first word of the controller station. */
  private atisStation(): string {
    return this.config.airport.stations.find((s) => s.type === 'ATIS')?.name ?? this.station.name.split(' ')[0];
  }

  /** Navigation aids out of service, as text ("ILS RWY 25 U/S") and spoken ("ILS runway 25 out of service"). */
  private navaidNotice(ends: string[]): { text: string; spoken: string } | undefined {
    const ils = ends.filter((e) => this.hasIls(e));
    if (!ils.length || (this.systems.loc && this.systems.gp)) return undefined;
    const what = !this.systems.loc ? 'ILS' : 'glide path';
    return { text: `${!this.systems.loc ? 'ILS' : 'GP'} RWY ${ils.join(' AND ')} U/S`, spoken: `${what} ${runwayWords(ils)} out of service` };
  }

  /**
   * Spoken ATIS: "Stuttgart information K, time 1220. Expect ILS approach runway 25, runway in use 25, A-CDM in
   * progress. Transition level 70. Wind 250 degrees 8 knots, CAVOK, temperature 12, dew point 6, QNH 1018.
   * Trend nosig. Information K out." `info` defaults to the ATIS that is broadcast (the editor previews others).
   */
  atisText(info: AtisInfo = this.atis): string {
    const ends = runwayEndsOf(info.runway);
    const navaids = this.navaidNotice(ends);
    // Independent and dependent parallel approaches are announced (ICAO Doc 4444, 6.7.3.2.4).
    const mode = ends.length > 1 ? this.parallelOpsOf(ends)?.approaches : undefined;
    const parallel = mode === 'independent' || mode === 'dependent' ? `, ${mode} parallel approaches in progress` : '';
    const inUse = ends.length > 1 ? `${runwayWords(ends)} in use` : `runway in use ${ends[0]}`;
    const notices = this.atisNotices(ends).map((n) => `, ${n.spoken}`).join('');
    const m = info.metar;
    const L = info.letter;
    if (this.faa) {
      // FAA ATIS (JO 7110.65 2-9-3): weather first, altimeter in inches, runways without a leading zero.
      const us = ends.map(usRunway);
      return (
        `${this.atisStation()} information ${L}, ${m.time.slice(2)} Zulu. ` +
        `Wind ${windWords(info.wind)}, ${metWords(m, true)}, ${temperatureWords(m)}, altimeter ${altimeterOf(info.qnh)}. ` +
        `${capitalize(this.approachesText(ends).replace(/\b0(\d)/g, '$1'))} in use, departing ${runwayWords(us)}` +
        `${navaids ? `, ${navaids.spoken}` : ''}${notices}. ` +
        `Advise on initial contact you have information ${L}.`
      );
    }
    return (
      `${this.station.name.split(' ')[0]} information ${L}, time ${m.time.slice(2)}. ` +
      `Expect ${this.approachesText(ends)}${navaids ? `, ${navaids.spoken}` : ''}${parallel}, ${inUse}${notices}. ` +
      `Transition level ${this.transitionLevel(info.qnh)}. ` +
      `Wind ${windWords(info.wind)}, ${metWords(m)}, ${temperatureWords(m)}, QNH ${info.qnh}. ` +
      `Trend ${trendWords(m.trend)}. Information ${L} out.`
    );
  }

  /**
   * D-ATIS text, one line per item: "ATIS EDDS K 1220", "EXPECT ILS APCH", "RWY 25", notices, "TRL 70",
   * "25008KT CAVOK T12 DP06 QNH1018", "TREND NOSIG".
   */
  atisDatis(info: AtisInfo = this.atis): string[] {
    const ends = runwayEndsOf(info.runway);
    const types = new Set(ends.map((e) => this.approachAbbr(e)));
    const mode = ends.length > 1 ? this.parallelOpsOf(ends)?.approaches : undefined;
    const kind = mode === 'independent' || mode === 'dependent' ? `${mode.toUpperCase()} ` : '';
    const approach = types.size > 1 ? ends.map((e) => `${this.approachAbbr(e)} APCH RWY ${e}`).join(', ') : `${kind}${[...types][0]} APCH`;
    const m = info.metar;
    if (this.faa) {
      const us = ends.map(usRunway).join(' AND ');
      return [
        `${this.config.airport.icao} ATIS INFO ${info.letter} ${m.time.slice(2)}Z`,
        datisMet(m, info.wind, info.qnh, true),
        `${[...types].join(', ')} APCH RWY ${us} IN USE. DEPG RWY ${us}`,
        ...(this.navaidNotice(ends) ? [this.navaidNotice(ends)!.text] : []),
        ...this.atisNotices(ends).map((n) => n.text),
        `ADVS YOU HAVE INFO ${info.letter}`,
      ];
    }
    return [
      `ATIS ${this.config.airport.icao} ${info.letter} ${m.time.slice(2)}`,
      `EXPECT ${approach}`,
      ...(this.navaidNotice(ends) ? [this.navaidNotice(ends)!.text] : []),
      ends.length > 1 ? `RWYS ${ends.join(' AND ')}` : `RWY ${ends[0]}`,
      ...this.atisNotices(ends).map((n) => n.text),
      `TRL ${this.transitionLevel(info.qnh)}`,
      datisMet(m, info.wind, info.qnh),
      `TREND ${m.trend}`,
    ];
  }

  /** What the latest METAR says differently from the ATIS (empty: up to date). */
  get atisDifferences(): string[] {
    return atisDifferences(this);
  }

  /** The parallel runway set of these runway ends. */
  private parallelOpsOf(ends: string[]): ParallelRunwayData | undefined {
    return this.config.airport.parallelRunways?.find((p) => p.ends.length === ends.length && p.ends.every((e) => ends.includes(e)));
  }

  private changeRunway(key: string): void {
    this.config.runway = key;
    const sids = this.config.airport.sids;
    for (const ac of this.aircraft) {
      // Intersection answers were for the old runway.
      ac.earliestIntersection = undefined;
      ac.ableIntersection = undefined;
      // Aircraft whose runway is still in use keep it (e.g. one of two parallel runways closed).
      if (ac.category === 'departure' && ['parked', 'pushback', 'startup'].includes(ac.phase) && !ac.pendingTaxi && !this.isRunwayInUse(ac.runway)) {
        const end = this.runwayFor(ac.stand, ac.type);
        ac.runway = end;
        ac.flightPlan.runway = end;
        const fix = sids.find((x) => x.name === ac.flightPlan.sid)?.fix;
        const sid = sids.find((x) => x.runway === end && x.fix === fix) ?? sids.find((x) => x.runway === end);
        ac.flightPlan.sid = sid?.name;
      }
      // Approach re-sequences arrivals that are not yet on short final onto the new runway.
      if (ac.phase === 'approach' && this.distanceToThresholdNm(ac) > 3.5 && !this.isRunwayInUse(ac.runway)) {
        const freq = ac.frequency;
        this.tower.setupApproach(ac, Math.max(6, this.distanceToThresholdNm(ac)), this.runwayFor(ac.assignedStand, ac.type));
        if (freq !== 'APP') ac.frequency = freq; // already talking to Tower: it stays there
      }
    }
    const ends = this.runways;
    this.system(`${ends.length > 1 ? `${capitalize(runwayWords(ends))} are` : `Runway in use is`} now ${ends.length > 1 ? 'in use' : ends[0]}. Taxiing departures keep their clearance - re-route them if needed.`);
  }

  // ------------------------------------------------------------------ queries

  find(callsign: string | undefined): Aircraft | undefined {
    if (!callsign) return undefined;
    const c = callsign.toUpperCase();
    return this.aircraft.find((a) => a.callsign === c);
  }

  /** True if the aircraft talks to one of the user's positions. */
  isOnMyFrequency(ac: Aircraft): boolean {
    return this.userStations.has(ac.frequency);
  }

  /** SID designators of the airport (for the parser). */
  get sidNames(): string[] {
    return this.config.airport.sids.map((s) => s.name.toUpperCase());
  }

  /** True if a system is available at this airport and switched on. */
  systemOn(id: SystemId): boolean {
    return this.systems[id];
  }

  /** Switches a system on or off (systems window). Systems the airport does not have stay off. */
  setSystem(id: SystemId, on: boolean): void {
    const available = !this.config.airport.systems || this.config.airport.systems.includes(id);
    if (!available || this.systems[id] === on) return;
    this.systems[id] = on;
    const info = SYSTEMS.find((s) => s.id === id)!;
    this.system(`${info.group}: ${info.name} switched ${on ? 'on' : 'off'}.${on ? '' : ` ${info.whenOff}`}`, on ? 'system' : 'warning');
    if (id === 'loc' || id === 'gp') this.system(`Approach procedure now: ${this.approachName()}. Broadcast a new ATIS (click ATIS in the toolbar) so the crews know.`);
  }

  /** True if the user staffs Tower: the AI Tower then only flies the aircraft, all clearances are yours. */
  get userTower(): boolean {
    const tower = this.stationFor('tower');
    // An airport without a Tower station has its runway run by Ground (and the AI Tower flies the aircraft).
    return this.userControls(tower) && (!!this.airport.station('TWR') || tower !== this.stationFor('ground'));
  }

  /**
   * Switches one of your frequencies off (the simulator takes the position over) or on again
   * (you take it back). At least one frequency stays on. Returns an error text if not possible.
   */
  setStationActive(type: StationType, on: boolean): string | undefined {
    if (!this.loggedInStations.includes(type)) return `You are not connected as ${type}.`;
    if (this.userStations.has(type) === on) return undefined;
    if (!on && this.userStations.size === 1) return 'At least one frequency must stay on.';
    const st = this.airport.station(type);
    if (on) this.userStations.add(type);
    else {
      this.userStations.delete(type);
      // Pilots on that frequency stop waiting for you: the AI answers them from now on.
      for (const a of this.aircraft) {
        if (a.frequency !== type) continue;
        this.frequency.release(a.callsign);
        a.request = null;
      }
    }
    this.system(
      on
        ? `${st?.callsign ?? type} ${st?.frequency ?? ''} switched on - you work ${st?.name ?? type} again.`
        : `${st?.callsign ?? type} ${st?.frequency ?? ''} switched off - the simulator takes over ${st?.name ?? type}.`,
    );
    return undefined;
  }

  /**
   * The position of yours that may ask the simulator-run position for this aircraft now
   * ("request hand-off"), or undefined.
   */
  handoffTarget(ac: Aircraft): StationType | undefined {
    if (this.userControls(ac.frequency) || ac.phase === 'gone') return undefined;
    const del = this.stationFor('delivery');
    const gnd = this.stationFor('ground');
    const twr = this.stationFor('tower');
    if (ac.frequency === del && ac.cleared && ac.phase === 'parked' && this.userControls(gnd)) return gnd;
    if (ac.frequency === gnd && ac.category === 'departure' && ['taxi', 'holding'].includes(ac.phase) && this.userControls(twr)) return twr;
    if (ac.frequency === twr && ac.category === 'arrival' && ac.onGround && ['landing', 'vacating', 'taxi'].includes(ac.phase) && this.userControls(gnd)) return gnd;
    if (ac.frequency === 'APP' && ac.phase === 'approach' && this.userControls(twr)) return twr;
    return undefined;
  }

  /** Hand-offs you asked for, carried out after a short coordination delay. */
  private readonly pendingHandoffs: { callsign: string; at: number }[] = [];

  /**
   * Asks the simulator-run position to hand an aircraft over to you. The position needs a few
   * seconds (4-10 s) before it tells the crew. Returns an error text if not possible.
   */
  requestHandoff(ac: Aircraft): string | undefined {
    const to = this.handoffTarget(ac);
    if (!to) return `${ac.callsign} cannot be handed over to you now.`;
    if (this.pendingHandoffs.some((p) => p.callsign === ac.callsign)) return undefined;
    this.pendingHandoffs.push({ callsign: ac.callsign, at: this.time + 4 + 6 * this.variation(`${ac.callsign}:ho:${Math.round(this.time)}`) });
    return undefined;
  }

  /** True while a hand-off you asked for is still being coordinated. */
  handoffPending(ac: Aircraft): boolean {
    return this.pendingHandoffs.some((p) => p.callsign === ac.callsign);
  }

  private updateHandoffs(): void {
    for (let i = this.pendingHandoffs.length - 1; i >= 0; i--) {
      const p = this.pendingHandoffs[i];
      if (this.time < p.at) continue;
      this.pendingHandoffs.splice(i, 1);
      const ac = this.find(p.callsign);
      if (ac) this.handOverNow(ac);
    }
  }

  private handOverNow(ac: Aircraft): void {
    const to = this.handoffTarget(ac);
    if (!to) return;
    const from = this.airport.station(ac.frequency);
    this.frequency.release(ac.callsign);
    ac.frequency = to;
    ac.request = null;
    ac.requestAck = false;
    this.system(`${from?.name ?? ac.frequency} hands ${ac.callsign} over to you (${this.airport.station(to)?.callsign ?? to}).`);
    // A vacated arrival calls Ground at once; the others call when they are ready (holding point, final, pushback).
    if (to === this.stationFor('ground') && ac.category === 'arrival' && ac.phase === 'taxi' && !ac.route) this.tower.callGround(ac);
    return undefined;
  }

  /** True if you can ask Ground (run by the simulator) to hold departures. */
  get canHoldDepartures(): boolean {
    return !this.userControls(this.stationFor('ground'));
  }

  /**
   * Asks Approach to stop (or resume) sending arrivals, or Ground to hold (or release) departures.
   * Returns an error text if not possible.
   */
  setFlow(kind: 'arrivals' | 'departures', stop: boolean): string | undefined {
    if (kind === 'departures' && !this.canHoldDepartures) return 'You staff Ground yourself.';
    const key = kind === 'arrivals' ? 'arrivalsStopped' : 'departuresStopped';
    if (this.flow[key] === stop) return undefined;
    this.flow[key] = stop;
    const who = kind === 'arrivals' ? this.stationName('APP') : this.stationName(this.stationFor('ground'));
    const text =
      kind === 'arrivals'
        ? stop
          ? 'roger, no further arrivals until you call - aircraft already on final continue'
          : 'roger, arrivals resume'
        : stop
          ? 'roger, holding all departures on the ground - aircraft already taxiing continue'
          : 'roger, departures resume';
    this.system(`${who} (landline): ${text}.`, stop ? 'warning' : 'system');
    return undefined;
  }

  /** Asks Ground (run by the simulator) to ask every departure for the earliest intersection it accepts (or stops it). */
  setAskIntersections(on: boolean): string | undefined {
    if (on && !this.canHoldDepartures) return 'You staff Ground yourself - ask the crews ("advise able for departure from intersection B").';
    if (this.flow.askIntersections === on) return undefined;
    this.flow.askIntersections = on;
    this.system(`${this.stationName(this.stationFor('ground'))} (landline): roger, ${on ? 'we ask all departures for the earliest intersection they accept' : 'no more intersection checks'}.`);
    return undefined;
  }

  private updateFlow(dt: number): void {
    const f = this.flow;
    // Ground asks each departure once (it shows in the list and the tag).
    if (f.askIntersections && Math.floor(this.time) % 5 === 0 && Math.floor(this.time - dt) % 5 !== 0) {
      for (const a of this.aircraft) {
        if (a.category === 'departure' && a.onGround && a.cleared && a.earliestIntersection === undefined && !['lineup', 'takeoff'].includes(a.phase)) {
          a.earliestIntersection = earliestIntersection(this, a);
        }
      }
    }
    if (f.arrivalsStopped && (f.arrivalSeconds += dt) >= 60) {
      f.arrivalSeconds -= 60;
      this.stats.arrivalStopMinutes++;
      this.updateScore();
    }
    if (f.departuresStopped && (f.departureSeconds += dt) >= 60) {
      f.departureSeconds -= 60;
      this.stats.departureStopMinutes++;
      this.updateScore();
    }
  }

  /** Radio name of a station ("Stuttgart Ground"); the primary station's name if the airport has none. */
  stationName(type: StationType): string {
    return this.airport.station(type)?.name ?? this.station.name;
  }

  /** True if the user staffs this station (otherwise the AI runs it). */
  userControls(type: StationType): boolean {
    return this.userStations.has(type);
  }

  /**
   * The station that handles a role at this airport. If the airport has no
   * such station, the next higher one takes over (delivery -> ground -> tower),
   * like an unstaffed position being covered from above.
   */
  stationFor(role: StationRole): StationType {
    const order: StationType[] = ['DEL', 'GND', 'TWR'];
    const start = role === 'delivery' ? 0 : role === 'ground' ? 1 : 2;
    for (let i = start; i < order.length; i++) if (this.airport.station(order[i])) return order[i];
    return 'TWR';
  }

  /**
   * Aircraft occupying or holding a reservation for a stand. With `visible`
   * only what a crew taxiing in can see: an aircraft standing on the stand,
   * leaving it, or just entering it (no reservations, no aircraft still on its
   * way there or taxiing past).
   */
  standOccupant(standId: string, except?: Aircraft, visible = false): Aircraft | undefined {
    const id = standId.toUpperCase();
    const stand = this.airport.stand(id);
    return this.aircraft.find((a) => {
      if (a === except || a.phase === 'gone') return false;
      if (visible) {
        if (a.stand === id && ['parked', 'arrived', 'pushback', 'startup'].includes(a.phase)) return true;
        return !!stand && a.phase === 'taxi' && a.routeDestination?.kind === 'stand' && a.routeDestination.stand === id && distance(a.pos, stand.pos) < 40;
      }
      if (a.assignedStand === id && a.phase !== 'arrived') return true;
      if (a.stand === id && (a.phase === 'parked' || a.phase === 'arrived' || (a.phase === 'pushback' && a.s < 30))) return true;
      // A departure taxiing out of a drive-through stand is still on it for a while.
      if (a.stand === id && a.phase === 'taxi' && !!stand && distance(a.pos, stand.pos) < 60) return true;
      if (a.phase === 'taxi' && a.routeDestination?.kind === 'stand' && a.routeDestination.stand === id) return true;
      // physically on the stand
      return !!stand && a.onGround && distance(a.pos, stand.pos) < 15;
    });
  }

  /**
   * Aircraft on (or heading for) a neighbouring stand that leaves too little
   * wingtip clearance for an aircraft of `wingspanM` on this stand. Stands
   * are only rated for their own maximum wingspan; a wide-body on a large
   * stand can block the smaller stand next to it.
   */
  standNeighbourConflict(standId: string, wingspanM: number, except?: Aircraft, visible = false): { aircraft: Aircraft; stand: Stand } | undefined {
    const stand = this.airport.stand(standId);
    if (!stand) return undefined;
    for (const other of this.airport.stands.values()) {
      if (other === stand) continue;
      const d = distance(stand.pos, other.pos);
      if (d > 120) continue;
      const occ = this.standOccupant(other.id, except, visible);
      if (!occ) continue;
      const span = occ.type.wingspanM;
      const clearance = Math.max(span, wingspanM) >= CODE_D_WINGSPAN ? STAND_CLEARANCE_D : STAND_CLEARANCE_C;
      if (d < (span + wingspanM) / 2 + clearance) return { aircraft: occ, stand: other };
      // Fanned lead-in lines (one stand behind another): the way in passes the parked neighbour.
      if (projectOnSegment(occ.pos, stand.lane.pos, stand.pos).dist < Math.max(span, wingspanM) / 2 + clearance) return { aircraft: occ, stand: other };
    }
    return undefined;
  }

  /** Stands that are free and usable for an aircraft of `minWingspan` (size and neighbours). */
  freeStands(minWingspan: number, filter?: (s: Stand) => boolean, except?: Aircraft): Stand[] {
    return [...this.airport.stands.values()].filter(
      (s) =>
        s.maxWingspanM >= minWingspan &&
        !this.standOccupant(s.id, except) &&
        (!filter || filter(s)) &&
        !this.standNeighbourConflict(s.id, minWingspan, except),
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
    // The five longest waits of the session, for the debriefing.
    if (wait > 30) {
      this.longestWaits.push({ callsign: ac.callsign, seconds: Math.round(wait) });
      this.longestWaits.sort((a, b) => b.seconds - a.seconds);
      this.longestWaits.length = Math.min(this.longestWaits.length, 5);
    }
    this.updateScore();
  }

  updateScore(): void {
    this.stats.score = scoreOf(this.stats);
  }

  /** Display name of an aircraft for messages. */
  tel(ac: Aircraft): string {
    return telephony(ac);
  }
}

function nextLetter(l: string): string {
  return l === 'Z' ? 'A' : String.fromCharCode(l.charCodeAt(0) + 1);
}

