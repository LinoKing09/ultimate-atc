import type { LatLon } from '../geo';
import type { ApproachType, SystemId } from '../systems';

/**
 * Serializable airport description. Everything a position (Delivery, Ground,
 * Tower, ...) needs to know about an airport lives in one `AirportData`
 * object. See docs/airport-data.md for a field-by-field description.
 */
export interface AirportData {
  icao: string;
  name: string;
  city: string;
  country: string;
  /** Airport reference point; also the origin of the local metric frame. */
  arp: LatLon;
  elevationFt: number;
  /** Magnetic variation in degrees, east positive. */
  magneticVariation: number;
  transitionAltitudeFt: number;
  /** Initial climb of the SIDs (feet), used in IFR clearances. */
  initialClimbFt?: number;
  /** Short note shown in the UI about where the data comes from and how accurate it is. */
  dataNotice: string;

  runways: RunwayData[];
  taxiNodes: TaxiNodeData[];
  taxiEdges: TaxiEdgeData[];
  stands: StandData[];
  /** Filled areas drawn below the taxiway network (aprons, grass is the background). */
  areas: AreaData[];
  /** Buildings, drawn on top of aprons. */
  buildings: AreaData[];
  /**
   * Paved lines outside the taxi graph, drawn like taxiways but never used by routes: links inside a
   * runway strip that would bypass the holding points, or permanently closed taxiways (`closed`) that
   * lead nowhere in the simulator.
   */
  pavement?: PavementLineData[];

  /** ATC stations available at this airport. */
  stations: StationData[];
  /** Per runway end: where departures may enter, where arrivals may vacate. */
  runwayOps: RunwayOpsData[];
  /** Sample standard instrument departures by runway end, used for flight plans. */
  sids: SidData[];
  /**
   * Airport briefing shown in the help window: local procedures and what the
   * controller should know. Facts that are already in the data (frequencies,
   * runways, entries, exits) are added automatically and need not be repeated.
   */
  briefing?: BriefingSection[];
  /** Traffic mix of this airport. Without it, the global operator list in `data/airlines.ts` is used. */
  traffic?: AirportTraffic;
  /** ATC and airport systems available at this airport (see core/systems.ts). Omitted = all. */
  systems?: SystemId[];
  /**
   * De-icing pads (winter operations): an aircraft taxis onto the pad node and is de-iced there. The
   * lead-in and lead-out lines are edges of kind 'stand' named like the pad, so automatic routes never
   * use a pad as a short cut.
   */
  deicingPads?: DeicingPadData[];
  /**
   * Wind at session start: with chance `primaryShare` from the `primary` direction range (degrees,
   * from-to), otherwise from `secondary`. Default: Stuttgart (60 % 220-290°, else 040-110°).
   */
  wind?: { primaryShare: number; primary: [number, number]; secondary: [number, number] };
  /** IANA time zone of the airport (local time for airport rules), e.g. "Europe/Berlin". Default: UTC. */
  timeZone?: string;
  /**
   * Runway nodes where automatic routes (pilots without a `via` list, AI Ground, menu suggestions) cross a
   * runway, e.g. only between two designated holding points; elsewhere only if there is no other way (a
   * closed taxiway). Omitted = anywhere. Your own `via` lists are not restricted.
   */
  runwayCrossings?: string[];
  /**
   * Taxiways automatic routes use only if there is no other way, e.g. one reserved for military aircraft.
   * Your own `via` lists may use them.
   */
  avoidTaxiways?: string[];
  /** Night flying restrictions (applied in scenarios with night rules, see core/night.ts). */
  nightRestrictions?: NightRestrictions;
}

/** A de-icing pad. */
export interface DeicingPadData {
  /** Designator, e.g. "DP1". */
  name: string;
  /** Taxi node of the de-icing position. */
  node: string;
  /** Largest wingspan the pad takes (m). */
  maxWingspanM: number;
}

/**
 * Night flying restrictions of an airport, in local time as minutes after midnight
 * (23:00 = 1380, 24:00 = 1440, 06:00 = 360).
 */
export interface NightRestrictions {
  /** No jet departures from ... until ... (local). */
  jetDepartures: { from: number; until: number };
  /** No landings from ... until ... (local). */
  landings: { from: number; until: number };
  /** Delayed landings (scheduled before `landings.from`) are allowed until this time (local). */
  delayedLandingsUntil?: number;
  /** Where the rules come from. */
  source: string;
}

/** Who flies to and from an airport, and how often. */
export interface AirportTraffic {
  /** Where the figures come from (shown in the airport documentation). */
  source?: string;
  /** Traffic level relative to the density steps (1 = the Stuttgart figures in levels.ts; a smaller airport less). */
  rateFactor?: number;
  /**
   * Small airports: new departures are not placed on the last this many free stands, and Approach
   * releases an arrival only when a stand is free for it. Default 0.
   */
  standReserve?: number;
  operators: TrafficOperator[];
}

/**
 * An operator at this airport. `weight` is its relative share of the
 * movements; `types` and `destinations` override the operator's global
 * defaults. Repeating an entry makes it more frequent.
 */
export interface TrafficOperator {
  /** ICAO airline code from `data/airlines.ts`. */
  airline: string;
  weight: number;
  types?: string[];
  destinations?: string[];
}

/** One section of an airport briefing. Text may mark instructions with `backticks`. */
export interface BriefingSection {
  title: string;
  /** Positions this section is relevant for; omitted = all positions. */
  positions?: StationType[];
  /** Paragraphs or bullet points. */
  items?: string[];
  /** Optional two-column table, e.g. [from, instruction]. */
  table?: { head?: [string, string]; rows: [string, string][] };
}

export interface RunwayEndData {
  /** Designator, e.g. "25" or "07L". */
  name: string;
  /** Threshold position (landing threshold, displaced if applicable). */
  threshold: LatLon;
  /** Physical runway end (start of take-off run). Equals `threshold` if not displaced. */
  end: LatLon;
  elevationFt: number;
  /**
   * Published instrument approaches to this runway end that airliners may fly. Without 'ILS' arrivals fly
   * the RNP (or localizer) approach whatever the ILS switches say; with the glide path off they fly the
   * localizer approach only if 'LOC' is listed. Omitted = ILS, LOC and RNP.
   */
  approaches?: ApproachType[];
  /**
   * Published take-off run available from the runway end (metres), when it is shorter than the runway:
   * the last part of the runway (in the take-off direction) does not count for take-offs in this direction.
   */
  toraM?: number;
}

export interface RunwayData {
  /** e.g. "07/25" */
  name: string;
  widthM: number;
  /** Published runway length (metres), for display. The geometry may differ slightly. */
  lengthM?: number;
  ends: [RunwayEndData, RunwayEndData];
}

export interface TaxiNodeData {
  id: string;
  pos: LatLon;
  /**
   * Present if this node is a runway-holding position. Aircraft that taxi
   * through this node towards the runway need a clearance (line-up,
   * crossing, ...) from the controller.
   */
  holdingPoint?: {
    /** Published name, e.g. "A1". */
    name: string;
    /** Runway it protects, e.g. "07/25". */
    runway: string;
  };
}

export type TaxiEdgeKind =
  /** Regular taxiway. */
  | 'taxiway'
  /** Apron taxilane. */
  | 'taxilane'
  /** Lead-in line between a taxilane and a stand. */
  | 'stand'
  /** Part of a connector between the runway holding position and the runway centreline. */
  | 'runwayStrip'
  /** Runway centreline (used by the runway logic, never for taxi routing). */
  | 'runway';

export interface TaxiEdgeData {
  from: string;
  to: string;
  /** Taxiway designator ("N", "D"), runway name for runway edges, stand id for stand edges. */
  name: string;
  kind: TaxiEdgeKind;
  /** Optional one-way restriction: only `from` -> `to` is allowed. */
  oneWay?: boolean;
  /** Width in metres (drawing only). */
  widthM?: number;
  /** Largest wingspan allowed on this edge (e.g. 36 for a code C taxilane). */
  maxWingspanM?: number;
  /**
   * Permanently closed (marked with crosses on the aerodrome chart, e.g. disused parts of a former
   * military airfield): drawn with crosses, never used by routes. Closed edges need no holding point
   * and must not touch runway nodes.
   */
  closed?: boolean;
  /**
   * Shape points between `from` and `to` (in that order) for a curved edge, e.g. a runway strip that
   * turns towards the runway behind its holding point. Aircraft follow them; routing and the runway
   * logic still treat the edge as one connection.
   */
  shape?: LatLon[];
}

export interface StandData {
  id: string;
  apron: string;
  pos: LatLon;
  /** Heading (true) of a parked aircraft's nose. */
  heading: number;
  /** Node on the taxilane where the stand's lead-in line starts. */
  laneNode: string;
  /** Largest wingspan the stand can take, in metres. */
  maxWingspanM: number;
  /** Stands with `pushback: false` are taxi-out positions. */
  pushback: boolean;
  /** Preferred facing after pushback if the controller does not specify one. */
  defaultPushFacing?: Compass;
  /**
   * Who parks here first: 'airline' (default), 'ga' (business jets prefer these) or 'cargo' (used by
   * the traffic generator only when no other stand is free).
   */
  use?: 'airline' | 'ga' | 'cargo';
}

export type Compass = 'north' | 'east' | 'south' | 'west';

export interface AreaData {
  /** Shown on the scope for buildings (empty: no label). */
  name: string;
  polygon: LatLon[];
}

/** A paved line drawn on the scope only (see AirportData.pavement). */
export interface PavementLineData {
  /** Taxiway designator (labelled when closed and not part of the taxi graph); omitted = unnamed. */
  name?: string;
  points: LatLon[];
  /** Pavement width in metres (default 15). */
  widthM?: number;
  /** Permanently closed: drawn with crosses; crews refuse instructions via it. */
  closed?: boolean;
}

export type StationType = 'DEL' | 'GND' | 'TWR' | 'APP' | 'DEP' | 'CTR' | 'ATIS';

export interface StationData {
  callsign: string;
  type: StationType;
  /** Radio telephony name, e.g. "Stuttgart Ground". */
  name: string;
  frequency: string;
}

export interface RunwayOpsData {
  /** Runway end designator this applies to, e.g. "25". */
  runway: string;
  /** Holding points usable for departures, most preferred (usually full length) first. */
  departureEntries: {
    holdingPoint: string;
    intersection: string;
    fullLength: boolean;
    /** Published take-off run available from this entry (metres); default: measured on the runway geometry. */
    toraM?: number;
    /**
     * The entry is used with a backtrack: the departure enters the runway, taxis on it to the runway
     * end, turns around there and departs from the full length (airports without a taxiway to the end).
     */
    backtrack?: boolean;
  }[];
  /** Exits arrivals may use, ordered by distance from the threshold. */
  exits: ExitData[];
  /**
   * Standard taxi flows while this runway is in use: the preferred direction
   * of travel on a taxiway ('east' / 'west' are along the runway axis, towards
   * the higher / lower runway coordinate). Automatic routes avoid taxiing
   * against these directions.
   */
  flows?: { taxiway: string; direction: 'east' | 'west' }[];
  /**
   * Minimum spacing Approach provides between arrivals on this runway in NM (e.g. when arrivals can
   * only vacate at the far end and occupy the runway for long).
   */
  arrivalSpacingNm?: number;
}

export interface ExitData {
  /** Taxiway name of the exit as used in phraseology ("vacated via E"). */
  name: string;
  /** Node ids from the runway centreline node to the point where the aircraft stops after vacating. */
  path: string[];
  /** Rapid exit taxiways can be taken at higher speed. */
  rapid: boolean;
  /**
   * Arrivals that cannot vacate ahead of them (no exit left, or none they may use) turn around on the
   * runway and backtrack to this exit.
   */
  backtrack?: boolean;
}

export interface SidData {
  name: string;
  runway: string;
  /** First fix / exit point, used in the flight plan route. */
  fix: string;
  /**
   * Destinations this SID is filed for, as a range of initial great-circle bearings from the airport to
   * the destination (degrees true, clockwise from the first to the second value, e.g. [190, 255] for the
   * south-west). The traffic generator plans each flight via the SID towards its destination.
   */
  towards?: [number, number];
  /**
   * The SID is filed only for these destinations (ICAO codes), e.g. a fix that serves one nearby airport.
   * Takes precedence over `towards`; an empty list means it is never planned automatically.
   */
  destinations?: string[];
  /** Radar frequency departures on this SID contact after take-off (default: the APP station's frequency). */
  frequency?: string;
}
