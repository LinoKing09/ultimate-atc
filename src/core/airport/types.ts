import type { LatLon } from '../geo';

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
}

/** Who flies to and from an airport, and how often. */
export interface AirportTraffic {
  /** Where the figures come from (shown in the airport documentation). */
  source?: string;
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
}

export type Compass = 'north' | 'east' | 'south' | 'west';

export interface AreaData {
  name: string;
  polygon: LatLon[];
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
  departureEntries: { holdingPoint: string; intersection: string; fullLength: boolean }[];
  /** Exits arrivals may use, ordered by distance from the threshold. */
  exits: ExitData[];
  /**
   * Standard taxi flows while this runway is in use: the preferred direction
   * of travel on a taxiway ('east' / 'west' are along the runway axis, towards
   * the higher / lower runway coordinate). Automatic routes avoid taxiing
   * against these directions.
   */
  flows?: { taxiway: string; direction: 'east' | 'west' }[];
}

export interface ExitData {
  /** Taxiway name of the exit as used in phraseology ("vacated via E"). */
  name: string;
  /** Node ids from the runway centreline node to the point where the aircraft stops after vacating. */
  path: string[];
  /** Rapid exit taxiways can be taken at higher speed. */
  rapid: boolean;
}

export interface SidData {
  name: string;
  runway: string;
  /** First fix / exit point, used in the flight plan route. */
  fix: string;
}
