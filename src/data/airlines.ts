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
  /** A cargo airline: parks on the cargo stands first. */
  cargo?: boolean;
  /** Registrations (callsign style 'reg'): 'D' German (D-CABC, default), 'N' United States (N512AB). */
  regPrefix?: 'D' | 'N';
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
  { icao: 'SDR', telephony: 'Sundair', types: ['A320', 'A321'], destinations: ['GCFV', 'HEGN', 'LGIR'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'CAI', telephony: 'Corendon', types: ['B738'], destinations: ['LTAI', 'LTFE'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'UPS', telephony: 'UPS', types: ['B748', 'B744', 'B763', 'A306', 'B752'], destinations: ['KSDF', 'KPHL', 'EGNX'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'FDX', telephony: 'Fedex', types: ['B77L', 'B763'], destinations: ['KMEM', 'LFPG'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'BCS', telephony: 'Eurotrans', types: ['A306', 'B752'], destinations: ['EDDP', 'EGNX'], weight: 1, callsignStyle: 'alnum', cargo: true },
  { icao: 'BOX', telephony: 'German Cargo', types: ['B77L'], destinations: ['VHHH', 'ZSPD', 'KCVG'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'DHK', telephony: 'World Express', types: ['B763', 'B752'], destinations: ['EGNX', 'EBBR', 'LEMD'], weight: 1, callsignStyle: 'alnum', cargo: true },
  { icao: 'ABR', telephony: 'Contract', types: ['B738', 'B737'], destinations: ['EIDW', 'LIMC', 'LEBL'], weight: 1, callsignStyle: 'alnum', cargo: true },
  { icao: 'CKS', telephony: 'Connie', types: ['B744', 'B77L'], destinations: ['KCVG', 'KJFK'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'GTI', telephony: 'Giant', types: ['B744', 'B748'], destinations: ['KCVG', 'VHHH', 'OMDB'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'PAC', telephony: 'Polar', types: ['B77L', 'B744'], destinations: ['KCVG', 'VHHH'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'MNB', telephony: 'Black Sea', types: ['A332'], destinations: ['LTFM', 'OBBI'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'SRR', telephony: 'Whitestar', types: ['B763'], destinations: ['EKCH', 'ESSA', 'EGNX'], weight: 1, callsignStyle: 'numeric', cargo: true },
  // United States and Canada (San Diego).
  { icao: 'SWA', telephony: 'Southwest', types: ['B737', 'B738', 'B38M'], destinations: ['KOAK', 'KSJC', 'KSMF', 'KLAS', 'KPHX', 'KDEN'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'ASA', telephony: 'Alaska', types: ['B738', 'B739', 'B39M'], destinations: ['KSEA', 'KPDX', 'KSFO', 'PHNL'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'QXE', telephony: 'Horizon', types: ['E75L'], destinations: ['KSEA', 'KPDX', 'KBOI'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'AAL', telephony: 'American', types: ['A321', 'B738'], destinations: ['KDFW', 'KPHX', 'KCLT', 'KORD'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'DAL', telephony: 'Delta', types: ['A321', 'B739', 'A20N'], destinations: ['KATL', 'KSLC', 'KMSP', 'KJFK', 'KSEA'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'UAL', telephony: 'United', types: ['B738', 'B739', 'A320'], destinations: ['KSFO', 'KDEN', 'KIAH', 'KORD', 'KEWR'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'SKW', telephony: 'Skywest', types: ['E75L', 'CRJ9'], destinations: ['KSFO', 'KDEN', 'KSLC', 'KLAX'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'NKS', telephony: 'Spirit Wings', types: ['A320', 'A20N', 'A21N'], destinations: ['KLAS', 'KDTW', 'KFLL'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'JBU', telephony: 'Jetblue', types: ['A320', 'A21N'], destinations: ['KJFK', 'KBOS'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'FFT', telephony: 'Frontier Flight', types: ['A20N', 'A21N'], destinations: ['KDEN', 'KLAS'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'SCX', telephony: 'Sun Country', types: ['B738'], destinations: ['KMSP'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'MXY', telephony: 'Moxy', types: ['A20N'], destinations: ['KPVU', 'KSJC'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'HAL', telephony: 'Hawaiian', types: ['A21N', 'A332'], destinations: ['PHNL', 'PHOG'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'ACA', telephony: 'Air Canada', types: ['A320', 'B38M'], destinations: ['CYVR', 'CYYZ'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'WJA', telephony: 'Westjet', types: ['B738', 'B38M'], destinations: ['CYYC', 'CYVR'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'JAL', telephony: 'Japanair', types: ['B788'], destinations: ['RJAA'], weight: 1, callsignStyle: 'numeric' },
  // Phuket (VTSP): Thai and Asian carriers, long-haul from the Gulf, Europe and Australia.
  { icao: 'AIQ', telephony: 'Thai Asia', types: ['A320', 'A20N', 'A21N'], destinations: ['VTBD', 'VTCC', 'VTUD', 'VTCT', 'WMKK', 'WSSS', 'VHHH', 'ZGSZ'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'THA', telephony: 'Thai', types: ['A320', 'A333', 'B788', 'A359'], destinations: ['VTBS'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'BKP', telephony: 'Bangkok Air', types: ['A319', 'A320', 'AT76'], destinations: ['VTBS', 'VTSM', 'VTCC'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'TLM', telephony: 'Mentari', types: ['B738', 'B39M'], destinations: ['VTBD', 'VTCC', 'VTUD'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'TVJ', telephony: 'Thaiviet Jet', types: ['A320', 'A321'], destinations: ['VTBS', 'VTCC', 'VTUD', 'RCTP'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'NOK', telephony: 'Nok Air', types: ['B738'], destinations: ['VTBD', 'VTCC'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'AXM', telephony: 'Red Cap', types: ['A320', 'A20N'], destinations: ['WMKK'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'SIA', telephony: 'Singapore', types: ['B38M', 'A359'], destinations: ['WSSS'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'TGW', telephony: 'Scooter', types: ['A320', 'A21N', 'B788'], destinations: ['WSSS'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'UAE', telephony: 'Emirates', types: ['B77W'], destinations: ['OMDB'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'QTR', telephony: 'Qatari', types: ['B77W', 'A359', 'B788'], destinations: ['OTHH'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'ETD', telephony: 'Etihad', types: ['B789'], destinations: ['OMAA'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'AFL', telephony: 'Aeroflot', types: ['A333', 'B77W'], destinations: ['UUEE'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'IGO', telephony: 'Ifly', types: ['A320', 'A21N'], destinations: ['VIDP', 'VABB', 'VOBL'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'KAL', telephony: 'Koreanair', types: ['A333', 'B789'], destinations: ['RKSI'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'CPA', telephony: 'Cathay', types: ['A333'], destinations: ['VHHH'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'CES', telephony: 'China Eastern', types: ['A320', 'A321'], destinations: ['ZSPD', 'ZUUU'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'MAS', telephony: 'Malaysian', types: ['B738'], destinations: ['WMKK'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'JST', telephony: 'Jetstar', types: ['A321', 'B788'], destinations: ['YPPH', 'YMML', 'YSSY'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'VJC', telephony: 'Vietjet', types: ['A321'], destinations: ['VVTS'], weight: 1, callsignStyle: 'numeric' },
  // Caribbean and St. Maarten.
  { icao: 'WIA', telephony: 'Windward', types: ['DHC6', 'AT45', 'AT76'], destinations: ['TFFJ', 'TQPF', 'TKPK', 'TNCS', 'TNCE', 'TAPA', 'TJSJ'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'BWA', telephony: 'Caribbean', types: ['B38M', 'AT76'], destinations: ['TTPP'], weight: 1, callsignStyle: 'numeric' },
  // Ecuador and Latin America (Quito).
  { icao: 'LNE', telephony: 'Aerolane', types: ['A319', 'A320', 'A321'], destinations: ['SEGU', 'SECU', 'SEGS', 'SEMT'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'GLG', telephony: 'Aerogal', types: ['A320', 'A20N'], destinations: ['SEGU', 'SECU', 'SEGS', 'SEST'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'AVA', telephony: 'Avianca', types: ['A320', 'A20N'], destinations: ['SKBO'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'CMP', telephony: 'Copa', types: ['B738', 'B38M', 'B39M'], destinations: ['MPTO'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'LPE', telephony: 'Lanperu', types: ['A320'], destinations: ['SPJC'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'IBE', telephony: 'Iberia', types: ['A332', 'A359'], destinations: ['LEMD'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'AEA', telephony: 'Europa', types: ['B788', 'B789'], destinations: ['LEMD'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'LCO', telephony: 'Lan Cargo', types: ['B763'], destinations: ['KMIA'], weight: 1, callsignStyle: 'numeric', cargo: true },
  { icao: 'CLX', telephony: 'Cargolux', types: ['B748', 'B744'], destinations: ['KMIA', 'EHAM'], weight: 1, callsignStyle: 'numeric', cargo: true },
  // New Zealand (Wellington).
  { icao: 'ANZ', telephony: 'New Zealand', types: ['A320', 'A21N', 'AT76'], destinations: ['NZAA', 'NZCH', 'NZQN', 'NZDN'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'QFA', telephony: 'Qantas', types: ['B738'], destinations: ['YSSY', 'YMML', 'YBBN'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'FJI', telephony: 'Pacific', types: ['B38M'], destinations: ['NFFN'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'SDA', telephony: 'Sounds', types: ['C208', 'PC12'], destinations: ['NZNS', 'NZWB', 'NZPN'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'CVA', telephony: 'Chatham', types: ['AT76'], destinations: ['NZCI'], weight: 1, callsignStyle: 'numeric' },
  { icao: 'NGA', telephony: '', types: ['C56X', 'CL35'], destinations: ['KLAS', 'KSJC', 'KSDL', 'KVNY', 'KTEB'], weight: 1, callsignStyle: 'reg', regPrefix: 'N' },
  { icao: 'DCX', telephony: '', types: ['C56X', 'CL35'], destinations: ['EDDB', 'LFMN', 'LSGG', 'EGLF', 'LIML'], weight: 1, callsignStyle: 'reg' },
];

/** Vehicles that talk to ATC with a callsign prefix of their own (TUG5 = "Tug 5"). Not used for traffic generation. */
export const VEHICLE_TELEPHONY: { icao: string; telephony: string }[] = [
  { icao: 'TUG', telephony: 'Tug' },
  { icao: 'FME', telephony: 'Follow-me' },
];

/** Lookup from ICAO airline code (or vehicle prefix) to telephony designator. */
export const TELEPHONY = new Map([...AIRLINES.filter((a) => a.telephony), ...VEHICLE_TELEPHONY].map((a) => [a.icao, a.telephony]));
