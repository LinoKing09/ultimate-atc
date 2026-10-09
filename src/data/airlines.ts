/**
 * Operators that generate traffic. `weight` controls how often an operator
 * is picked relative to the others. Destinations are ICAO codes.
 *
 * Callsign styles:
 *  - 'alnum'  : digit(s) + two letters, e.g. EWG7TK (common in Europe)
 *  - 'numeric': 1-4 digits, e.g. THY1734
 *  - 'reg'    : the callsign is a registration (general aviation)
 */
export interface Airline {
  icao: string;
  telephony: string;
  types: string[];
  destinations: string[];
  weight: number;
  callsignStyle: 'alnum' | 'numeric' | 'reg';
}

export const AIRLINES: Airline[] = [
  { icao: 'EWG', telephony: 'Eurowings', types: ['A319', 'A320', 'A20N', 'A21N'], destinations: ['EDDH', 'EDDL', 'EDDW', 'EDDB', 'LEPA', 'GCLP', 'LIRF', 'LEBL', 'LGAV', 'EGKK', 'LPPT', 'LHBP'], weight: 10, callsignStyle: 'alnum' },
  { icao: 'DLH', telephony: 'Lufthansa', types: ['A319', 'A320', 'A20N', 'A321'], destinations: ['EDDF', 'EDDM'], weight: 6, callsignStyle: 'alnum' },
  { icao: 'CLH', telephony: 'Hansaline', types: ['CRJ9', 'E195'], destinations: ['EDDM', 'EDDF'], weight: 3, callsignStyle: 'alnum' },
  { icao: 'CFG', telephony: 'Condor', types: ['A320', 'A321', 'A21N'], destinations: ['LEPA', 'GCTS', 'GCRR', 'HEGN', 'LTAI', 'LGKO'], weight: 4, callsignStyle: 'numeric' },
  { icao: 'TUI', telephony: 'Tuijet', types: ['B738', 'B38M'], destinations: ['LEPA', 'GCFV', 'HEGN', 'LGIR', 'LTAI'], weight: 3, callsignStyle: 'alnum' },
  { icao: 'THY', telephony: 'Turkish', types: ['A321', 'B738', 'A332'], destinations: ['LTFM'], weight: 3, callsignStyle: 'numeric' },
  { icao: 'PGT', telephony: 'Sunturk', types: ['A20N', 'B38M'], destinations: ['LTFJ', 'LTAI', 'LTBJ'], weight: 2, callsignStyle: 'numeric' },
  { icao: 'SXS', telephony: 'Sunexpress', types: ['B738', 'B38M'], destinations: ['LTAI', 'LTBJ', 'LTFE'], weight: 3, callsignStyle: 'numeric' },
  { icao: 'KLM', telephony: 'KLM', types: ['B737', 'B738'], destinations: ['EHAM'], weight: 1, callsignStyle: 'alnum' },
  { icao: 'KLC', telephony: 'City', types: ['E190', 'E295'], destinations: ['EHAM'], weight: 3, callsignStyle: 'alnum' },
  { icao: 'AFR', telephony: 'Airfrans', types: ['A319', 'A320'], destinations: ['LFPG'], weight: 2, callsignStyle: 'numeric' },
  { icao: 'BAW', telephony: 'Speedbird', types: ['A320', 'A20N'], destinations: ['EGLL'], weight: 2, callsignStyle: 'numeric' },
  { icao: 'AUA', telephony: 'Austrian', types: ['DH8D', 'E195', 'A320'], destinations: ['LOWW'], weight: 2, callsignStyle: 'numeric' },
  { icao: 'SWR', telephony: 'Swiss', types: ['A320', 'A20N'], destinations: ['LSZH'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'WZZ', telephony: 'Wizz Air', types: ['A21N', 'A320'], destinations: ['LROP', 'LHBP', 'LBSF', 'EPKT'], weight: 2, callsignStyle: 'alnum' },
  { icao: 'RYR', telephony: 'Ryanair', types: ['B738', 'B38M'], destinations: ['LEMG', 'EIDW', 'LIPE', 'LGTS'], weight: 2, callsignStyle: 'alnum' },
  { icao: 'VLG', telephony: 'Vueling', types: ['A320', 'A20N'], destinations: ['LEBL'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'ITY', telephony: 'Itarrow', types: ['A320', 'A20N'], destinations: ['LIRF'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'DCX', telephony: '', types: ['C56X', 'CL35'], destinations: ['EDDB', 'LFMN', 'LSGG', 'EGLF', 'LIML'], weight: 1, callsignStyle: 'reg' },
];

/** Vehicles that talk to ATC with a callsign prefix of their own (TUG5 = "Tug 5"). Not used for traffic generation. */
export const VEHICLE_TELEPHONY: { icao: string; telephony: string }[] = [
  { icao: 'TUG', telephony: 'Tug' },
  { icao: 'FME', telephony: 'Follow-me' },
];

/** Lookup from ICAO airline code (or vehicle prefix) to telephony designator. */
export const TELEPHONY = new Map([...AIRLINES.filter((a) => a.telephony), ...VEHICLE_TELEPHONY].map((a) => [a.icao, a.telephony]));
