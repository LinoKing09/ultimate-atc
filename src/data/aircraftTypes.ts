/**
 * Aircraft performance and dimension data used by the simulation.
 * Values are rounded public figures - good enough for a simulator, not for
 * engineering.
 */
export type WakeCategory = 'L' | 'M' | 'H' | 'J';
export type Silhouette = 'jet' | 'widebody' | 'turboprop' | 'bizjet' | 'regional';

export interface AircraftType {
  icao: string;
  name: string;
  wake: WakeCategory;
  wingspanM: number;
  lengthM: number;
  silhouette: Silhouette;
  /** Normal straight-line taxi speed in knots. */
  taxiSpeedKt: number;
  /** Rotation speed in knots. */
  vrKt: number;
  /** Final approach speed in knots. */
  approachSpeedKt: number;
  /** Initial climb rate in ft/min. */
  climbFpm: number;
}

const types: AircraftType[] = [
  { icao: 'A319', name: 'Airbus A319', wake: 'M', wingspanM: 35.8, lengthM: 33.8, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 135, approachSpeedKt: 128, climbFpm: 2800 },
  { icao: 'A320', name: 'Airbus A320', wake: 'M', wingspanM: 35.8, lengthM: 37.6, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 145, approachSpeedKt: 135, climbFpm: 2500 },
  { icao: 'A20N', name: 'Airbus A320neo', wake: 'M', wingspanM: 35.8, lengthM: 37.6, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 143, approachSpeedKt: 134, climbFpm: 2600 },
  { icao: 'A321', name: 'Airbus A321', wake: 'M', wingspanM: 35.8, lengthM: 44.5, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 155, approachSpeedKt: 142, climbFpm: 2300 },
  { icao: 'A21N', name: 'Airbus A321neo', wake: 'M', wingspanM: 35.8, lengthM: 44.5, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 153, approachSpeedKt: 140, climbFpm: 2400 },
  { icao: 'B737', name: 'Boeing 737-700', wake: 'M', wingspanM: 35.8, lengthM: 33.6, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 140, approachSpeedKt: 132, climbFpm: 2800 },
  { icao: 'B738', name: 'Boeing 737-800', wake: 'M', wingspanM: 35.8, lengthM: 39.5, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 150, approachSpeedKt: 142, climbFpm: 2500 },
  { icao: 'B38M', name: 'Boeing 737 MAX 8', wake: 'M', wingspanM: 35.9, lengthM: 39.5, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 150, approachSpeedKt: 142, climbFpm: 2600 },
  { icao: 'B752', name: 'Boeing 757-200', wake: 'M', wingspanM: 38.1, lengthM: 47.3, silhouette: 'jet', taxiSpeedKt: 18, vrKt: 145, approachSpeedKt: 135, climbFpm: 3000 },
  { icao: 'E190', name: 'Embraer E190', wake: 'M', wingspanM: 28.7, lengthM: 36.2, silhouette: 'regional', taxiSpeedKt: 17, vrKt: 135, approachSpeedKt: 128, climbFpm: 2600 },
  { icao: 'E195', name: 'Embraer E195', wake: 'M', wingspanM: 28.7, lengthM: 38.7, silhouette: 'regional', taxiSpeedKt: 17, vrKt: 138, approachSpeedKt: 130, climbFpm: 2500 },
  { icao: 'E295', name: 'Embraer E195-E2', wake: 'M', wingspanM: 35.1, lengthM: 41.5, silhouette: 'regional', taxiSpeedKt: 17, vrKt: 138, approachSpeedKt: 130, climbFpm: 2500 },
  { icao: 'CRJ9', name: 'Bombardier CRJ900', wake: 'M', wingspanM: 24.9, lengthM: 36.2, silhouette: 'regional', taxiSpeedKt: 17, vrKt: 140, approachSpeedKt: 135, climbFpm: 2800 },
  { icao: 'DH8D', name: 'Dash 8 Q400', wake: 'M', wingspanM: 28.4, lengthM: 32.8, silhouette: 'turboprop', taxiSpeedKt: 15, vrKt: 115, approachSpeedKt: 120, climbFpm: 2200 },
  { icao: 'AT76', name: 'ATR 72-600', wake: 'M', wingspanM: 27.1, lengthM: 27.2, silhouette: 'turboprop', taxiSpeedKt: 14, vrKt: 105, approachSpeedKt: 112, climbFpm: 1600 },
  { icao: 'A332', name: 'Airbus A330-200', wake: 'H', wingspanM: 60.3, lengthM: 58.8, silhouette: 'widebody', taxiSpeedKt: 16, vrKt: 150, approachSpeedKt: 140, climbFpm: 2200 },
  { icao: 'B763', name: 'Boeing 767-300', wake: 'H', wingspanM: 47.6, lengthM: 54.9, silhouette: 'widebody', taxiSpeedKt: 16, vrKt: 150, approachSpeedKt: 140, climbFpm: 2200 },
  { icao: 'B788', name: 'Boeing 787-8', wake: 'H', wingspanM: 60.1, lengthM: 56.7, silhouette: 'widebody', taxiSpeedKt: 16, vrKt: 150, approachSpeedKt: 140, climbFpm: 2300 },
  { icao: 'C56X', name: 'Cessna Citation Excel', wake: 'L', wingspanM: 17.2, lengthM: 16.0, silhouette: 'bizjet', taxiSpeedKt: 15, vrKt: 105, approachSpeedKt: 115, climbFpm: 3500 },
  { icao: 'CL35', name: 'Bombardier Challenger 350', wake: 'M', wingspanM: 21.0, lengthM: 20.9, silhouette: 'bizjet', taxiSpeedKt: 15, vrKt: 115, approachSpeedKt: 120, climbFpm: 3500 },
];

export const AIRCRAFT_TYPES = new Map(types.map((t) => [t.icao, t]));

export function aircraftType(icao: string): AircraftType {
  const t = AIRCRAFT_TYPES.get(icao);
  if (!t) throw new Error(`Unknown aircraft type ${icao}`);
  return t;
}
