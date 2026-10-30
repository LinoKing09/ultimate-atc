import type { AirportData } from '../../core/airport/types';
import { EGKK_LAYOUT } from './egkk.layout';
import { buildLayout, exitVia, layoutEdges, type StandSpec } from './osmLayout';

/**
 * London Gatwick (EGKK) - the busiest single-runway airport in the world.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (egkk.layout.ts). Facts: UK AIP AD 2 EGKK (NATS, AIRAC 2026-10-29) with its aerodrome chart, ground movement /
 * parking / docking charts and SID coding tables, used as a reference only: runways, thresholds, declared
 * distances with the intersection take-offs, taxiway designators and limits, holding points, the rapid exits,
 * the stand list with its coordinates, frequencies, the RNAV SIDs with their end fixes. See docs/airports/EGKK.md.
 *
 * Runway 08R/26L (3317 m, both thresholds displaced) is the one in use; 08L/26R north of it is the standby runway,
 * used only while 08R/26L is closed - drawn, not used. Arrivals vacating 08R/26L cross it without a clearance
 * (AIP AD 2.20), so in the simulator it is not part of the taxi graph; only its pre-threshold area 08L, the way
 * from J (J4 / J7) to H, and the stretch between ER and E are kept as unnamed taxiway links.
 *
 * Simplifications: stand sizes estimated (the centre stands of the MARS groups code E, their L / R positions code
 * C, the others by their spacing); Y and W south of the runway (Maintenance Area 1) drawn, not used; the stands
 * OpenStreetMap still has in the work-in-progress area at Pier 6 (691-698) left out.
 */

/** A stand of the AIP stand list: position and lead-in line from OpenStreetMap unless given. */
const S = (id: string, maxWingspanM: number, more: Partial<StandSpec> = {}): StandSpec => ({ id, apron: apronOf(id), maxWingspanM, pushback: true, ...more });

/** Apron of a stand (aerodrome and parking / docking charts). */
function apronOf(id: string): string {
  const n = parseInt(id, 10);
  if (n <= 5) return 'Pier 1';
  if (n <= 28) return 'Pier 2';
  if (n <= 38) return 'Pier 3';
  if (n <= 43) return 'Remote holding';
  if (n <= 54) return 'Pier 4';
  if (n <= 68) return 'North apron';
  if (n === 153 || n === 154 || n === 158 || n === 159) return 'Cargo apron';
  if (n < 500) return 'Remote stands';
  if (n < 600) return 'Pier 5';
  return 'Pier 6';
}

/** The standby runway 08L/26R: not part of the taxi graph (see above). */
const STANDBY = EGKK_LAYOUT.edges.filter(([, , name, kind]) => kind === 'runway' && name === '08L/26R').map(([from, to]) => `${from}>${to}`);
/** Its pre-threshold area 08L from J (J4 / J7) to H: the way to the holding points H3-H1. */
const PRE_THRESHOLD_08L = ['RWY.J>HP.7235256576', 'HP.7235256576>RWY.?.10', 'RWY.?.10>RWY.?.11', 'RWY.?.11>RWY.H'];
/** The standby runway between ER and E: traffic vacating via ER crosses it onto J via E (AIP AD 2.20). */
const ER_TO_E = 'RWY.ER>RWY.E';

/** South of runway 08R/26L: C, Y and W to Maintenance Area 1 (drawn, not used). */
const SOUTH: [number, number][] = [
  [51.1447, -0.214],
  [51.15095, -0.165],
  [51.153, -0.156],
  [51.135, -0.156],
  [51.135, -0.214],
];

const built = buildLayout(EGKK_LAYOUT, {
  runway: '08R/26L',
  // Aerodrome chart. The rapid exits GR and BR share the holding position lines of G1 and B1; they carry their
  // taxiway names here (one name per holding point), as FR and ER. The CAT III holding points (J2 / J3, H2 / H3,
  // G2 / G3, C3, A3, M3), A2 on AS and the holding points of the standby runway are plain nodes.
  holdingPoints: {
    'HP.7235256580': 'J1',
    'HP.409041776': 'H1',
    'HP.7235256553': 'G1',
    'HP.7235256567': 'GR',
    'HP.7235256572': { name: 'FR', node: 'RWY.FR' },
    'HP.11809314206': { name: 'ER', node: 'ER.1' },
    'HP.7235218249': 'D1',
    'HP.736393505': 'C1',
    'HP.7235256550': 'BR',
    'HP.7235256551': 'B1',
    'HP.7235218257': 'A1',
    'HP.7235218254': 'M1',
  },
  // ER meets the runway centre line between FR and D without a common node in OpenStreetMap.
  // The guide lines of S for the stands on either side (OpenStreetMap: S EAST RED / S WEST BLUE) are part of S.
  taxiwayNames: { 'S EAST RED': 'S', 'S WEST BLUE': 'S' },
  // The rapid exit BR from the runway to its holding point (OpenStreetMap: part of P).
  edgeNames: { 'HP.7235256550>B/BR/P': 'BR' },
  dropEdges: [...STANDBY, 'RWY.FR>RWY.D'],
  addEdges: [
    ...[...PRE_THRESHOLD_08L, ER_TO_E].map((k) => {
      const [from, to] = k.split('>');
      return [from, to, '', 'taxiway'] as [string, string, string, 'taxiway'];
    }),
    ['RWY.FR', 'ER.1', '08R/26L', 'runway'],
    ['ER.1', 'RWY.D', '08R/26L', 'runway'],
  ],
  // Y and C south of the runway; the fork of E off ER before its holding point and the stub of ER north of the
  // standby runway (vacating traffic follows ER across it, then E onto J - E is one way north).
  drawOnly: [...layoutEdges(EGKK_LAYOUT, { names: ['Y'], inside: [SOUTH] }), 'E/ER>HP.14280035716', 'HP.14280035716>RWY.E', 'RWY.ER>ER.6', 'ER.6>ER.7',
    // The eastern fillet of B onto the runway and the link from B to P behind B1 (the rapid exit BR leads on to P
    // on its own; with the link its holding point would find the shorter way to the runway along B).
    '?/B>?.255', '?.255>?.256', '?.256>?.257', '?.257>?.258', '?.258>RWY.?.19', 'B.4>B.5', 'B.5>?/B', '?/B>B/BR/P'],
  // AIP AD 2.20: Whiskey not available to code D and larger.
  edgeMaxWingspanM: Object.fromEntries(layoutEdges(EGKK_LAYOUT, { names: ['W'] }).map((k) => [k, 36])),
  // AIP AD 2.8: every taxiway 23 m.
  stands: [
    S('1', 36, { osm: '1M' }), S('2', 36, { osm: '2M' }), S('3', 36, { osm: '3M' }), S('4', 36, { osm: '4M' }),
    S('5', 36, { osm: '5M' }), S('10', 36), S('11', 36), S('12', 36), S('13', 65), S('13L', 36), S('13R', 36),
    S('14', 36), S('15', 36), S('16', 36), S('17', 52), S('18', 36), S('19', 36), S('20', 36), S('21', 36),
    S('22', 36), S('23', 36), S('24', 36), S('25', 36), S('27', 36), S('28', 36), S('31', 65), S('31L', 36),
    S('31R', 36), S('32', 65), S('32L', 36), S('32R', 36), S('33', 65), S('33L', 36), S('33R', 36), S('34', 65),
    S('34L', 36), S('34R', 36), S('35', 65), S('35L', 36), S('35R', 36), S('36', 65), S('36L', 36), S('36R', 36),
    S('37', 36), S('38', 36),
    // Remote holding / drive-through (AIP AD 2.20); 42 nose-in.
    S('41', 36, { pushback: false }), S('41E', 36), S('41W', 36), S('42', 36), S('43', 36, { pushback: false }), S('43E', 36),
    S('43W', 36), S('46', 36), S('47', 65), S('47L', 36), S('47R', 36), S('48', 65), S('48L', 36), S('48R', 36),
    S('49', 65), S('49L', 36), S('49R', 36), S('50', 36), S('51', 65), S('51L', 36), S('51R', 36), S('52', 65),
    S('52L', 36), S('52R', 36), S('53', 36), S('54', 65), S('54L', 36), S('54R', 36),
    // Not in OpenStreetMap: AIP stand coordinates, lane on the nearest taxiway.
    S('64', 65, { snap: ['QA'], pos: { lat: 51.1625917, lon: -0.18395 } }),
    S('64L', 36, { snap: ['QA'], pos: { lat: 51.1623556, lon: -0.1835528 } }),
    S('64R', 36, { snap: ['QA'], pos: { lat: 51.1627861, lon: -0.18385 } }), S('65', 36), S('66', 65),
    S('66L', 36), S('66R', 36), S('67', 36), S('68', 36), S('130', 52), S('131', 36), S('132', 36), S('133', 36),
    S('134', 52), S('135', 36), S('136', 36), S('140', 36), S('141', 65), S('141L', 36), S('141R', 36),
    S('142', 65), S('142R', 36), S('143', 65), S('143L', 36), S('143R', 36), S('144', 65), S('144L', 36),
    S('144R', 36), S('145', 36), S('150', 65), S('150L', 36), S('150R', 36), S('151', 36), S('152', 65),
    S('152L', 36), S('152R', 36), S('153', 36), S('154', 36), S('158', 36), S('159', 36), S('160', 65),
    S('160L', 36), S('160R', 36), S('161', 65), S('170', 36), S('171', 65), S('171L', 36), S('171R', 36),
    S('172', 65), S('172L', 36), S('172R', 36), S('173', 36), S('174', 36), S('175', 65), S('175L', 36),
    S('175R', 36), S('176', 65), S('176L', 36), S('176R', 36), S('177', 36), S('178', 65),
    S('178L', 36, { snap: ['S'], pos: { lat: 51.1546278, lon: -0.1894889 } }),
    S('178R', 36, { snap: ['S'], pos: { lat: 51.1550167, lon: -0.1895361 } }),
    S('180', 65, { snap: ['S'], pos: { lat: 51.1552944, lon: -0.1896861 } }),
    S('180R', 36, { snap: ['S'], pos: { lat: 51.1554361, lon: -0.1895722 } }), S('230', 65), S('230L', 36),
    S('230R', 36), S('231', 65), S('231L', 36), S('231R', 36), S('232', 65), S('232L', 36), S('232R', 36),
    S('233', 65), S('233L', 36), S('233R', 36), S('234', 65), S('234L', 36), S('234R', 36), S('235', 65),
    S('235L', 36), S('235R', 36), S('552', 36), S('553', 36), S('554', 36), S('555', 36), S('557', 36),
    S('558', 36), S('559', 36), S('560', 36), S('561', 36), S('562', 36), S('563', 36), S('564', 36), S('565', 36),
    S('566', 36), S('567', 36), S('568', 36), S('569', 36),
    S('570', 36, { snap: ['QA'], pos: { lat: 51.1624056, lon: -0.1804 } }),
    S('571', 36, { snap: ['QA'], pos: { lat: 51.1625, lon: -0.1803694 } }),
    S('572', 36, { snap: ['QA'], pos: { lat: 51.1627944, lon: -0.1806889 } }),
    S('573', 36, { snap: ['QA'], pos: { lat: 51.1631278, lon: -0.1805889 } }),
    S('574', 36, { snap: ['QA'], pos: { lat: 51.1631722, lon: -0.18095 } }), S('681', 36), S('682', 36),
    S('683', 36), S('684', 36), S('685', 36), S('687', 36), S('688', 36), S('689', 36), S('690', 36),
  ],
});

/** AIP AD 2.12: the landing thresholds (08R displaced 395 m, 26L 425 m, 08L 321 m, 26R 415 m). */
const DMS = (lat: number, lon: number) => ({ lat, lon });
const THR_08R = DMS(51 + 8 / 60 + 45.12 / 3600, -(12 / 60 + 24.52 / 3600));
const THR_26L = DMS(51 + 9 / 60 + 2.42 / 3600, -(10 / 60 + 19.0 / 3600));
const THR_08L = DMS(51 + 8 / 60 + 51.04 / 3600, -(12 / 60 + 29.17 / 3600));
const THR_26R = DMS(51 + 9 / 60 + 3.69 / 3600, -(10 / 60 + 57.4 / 3600));
/** The runway ends (start of the take-off runs) from OpenStreetMap. */
const node = (id: string) => {
  const n = EGKK_LAYOUT.nodes.find(([nid]) => nid === id)!;
  return { lat: n[1], lon: n[2] };
};

/** RNAV SIDs (AIP SID coding tables): Z from runway 08R, X from 26L, planned by the bearing of the destination. */
const SID = (name: string, runway: string, fix: string, towards: [number, number]) => ({ name, runway, fix, towards });

export const EGKK: AirportData = {
  icao: 'EGKK',
  name: 'London Gatwick',
  city: 'London',
  country: 'United Kingdom',
  fir: 'EGTT',
  arp: { lat: 51 + 8 / 60 + 53 / 3600, lon: -(11 / 60 + 25 / 3600) },
  elevationFt: 203,
  magneticVariation: 1.3,
  timeZone: 'Europe/London',
  // Westerly winds most of the year: runway 26L about 70 % of the time.
  wind: { primaryShare: 0.7, primary: [190, 320], secondary: [20, 130] },
  transitionAltitudeFt: 6000,
  // The SIDs climb to 6000 ft (NOVMA and IMVUR 4000 ft - not modelled).
  initialClimbFt: 6000,
  climate: { monthlyMeanC: [5, 5, 7, 9, 13, 16, 18, 18, 15, 12, 8, 6] },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runways, holding points, stand list, frequencies and SIDs after the UK AIP (NATS, AIRAC 2026-10-29, facts only). Stand sizes estimated; standby runway 08L/26R and Maintenance Area 1 drawn, not used. Not for real-world navigation.',
  runways: [
    {
      name: '08R/26L',
      widthM: 45,
      lengthM: 3317,
      ends: [
        // ILS CAT III and RNP both ways. TORA 08R 3159 m (the starter extension at the 26L end does not count).
        { name: '08R', threshold: THR_08R, end: node('RWY.END.4'), elevationFt: 196, approaches: ['ILS', 'LOC', 'RNP'], toraM: 3159 },
        { name: '26L', threshold: THR_26L, end: node('RWY.END.5'), elevationFt: 196, approaches: ['ILS', 'LOC', 'RNP'], toraM: 3255 },
      ],
    },
    {
      // The standby runway (non-instrument), only in use while 08R/26L is closed: drawn, not used.
      name: '08L/26R',
      widthM: 45,
      lengthM: 2561,
      ends: [
        { name: '08L', threshold: THR_08L, end: node('RWY.J'), elevationFt: 195, approaches: ['RNP'] },
        { name: '26R', threshold: THR_26R, end: node('RWY.AN'), elevationFt: 195, approaches: ['RNP'] },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  pavement: built.pavement,
  stations: [
    { callsign: 'EGKK_DEL', type: 'DEL', name: 'Gatwick Delivery', frequency: '121.955' },
    { callsign: 'EGKK_GND', type: 'GND', name: 'Gatwick Ground', frequency: '121.805' },
    { callsign: 'EGKK_TWR', type: 'TWR', name: 'Gatwick Tower', frequency: '124.230' },
    { callsign: 'EGKK_APP', type: 'APP', name: 'Gatwick Director', frequency: '126.825' },
    { callsign: 'EGKK_ATIS', type: 'ATIS', name: 'Gatwick Information', frequency: '136.525' },
  ],
  runwayOps: [
    {
      runway: '26L',
      // AIP AD 2.13: full length from M1 (3255 m), intersections A1 3146 m, B1 2891 m, C1 2460 m.
      departureEntries: [
        { holdingPoint: 'M1', intersection: 'M', fullLength: true, toraM: 3255 },
        { holdingPoint: 'A1', intersection: 'A1', fullLength: false, toraM: 3146 },
        { holdingPoint: 'B1', intersection: 'B1', fullLength: false, toraM: 2891 },
        { holdingPoint: 'C1', intersection: 'C1', fullLength: false, toraM: 2460 },
      ],
      // AIP AD 2.20: the rapid exits ER (1480 m from the threshold), FR (1835 m) and GR (2126 m), across the standby
      // runway onto J; then G, H and J at the end. D is not available for vacating 26L.
      exits: [
        exitVia(built, 'ER', 'HP.11809314206', { rapid: true }),
        exitVia(built, 'FR', 'HP.7235256572', { rapid: true }),
        exitVia(built, 'GR', 'HP.7235256567', { rapid: true }),
        exitVia(built, 'G', 'HP.7235256553'),
        exitVia(built, 'H', 'HP.409041776'),
        exitVia(built, 'J', 'HP.7235256580'),
      ],
    },
    {
      runway: '08R',
      // AIP AD 2.13: full length from J1 (3159 m), intersections H1 2937 m and G1 2772 m.
      departureEntries: [
        { holdingPoint: 'J1', intersection: 'J', fullLength: true, toraM: 3159 },
        { holdingPoint: 'H1', intersection: 'H1', fullLength: false, toraM: 2937 },
        { holdingPoint: 'G1', intersection: 'G1', fullLength: false, toraM: 2772 },
      ],
      // AIP AD 2.20: the rapid exits D (1376 m), CR (1796 m) and BR (2251 m); then B and A. ER and M are not
      // available for vacating 08R.
      exits: [
        exitVia(built, 'D', 'HP.7235218249', { rapid: true }),
        exitVia(built, 'CR', 'HP.736393505', { rapid: true }),
        exitVia(built, 'BR', 'HP.7235256550', { rapid: true }),
        exitVia(built, 'B', 'HP.7235256551'),
        exitVia(built, 'A', 'HP.7235218257'),
      ],
    },
  ],
  sids: [
    // Runway 26L.
    SID('NOVMA1X', '26L', 'NOVMA', [215, 320]),
    SID('TIGER1X', '26L', 'TIGER', [320, 40]),
    SID('DAGGA1X', '26L', 'DAGGA', [40, 75]),
    SID('WIZAD1X', '26L', 'WIZAD', [75, 120]),
    SID('HARDY1X', '26L', 'HARDY', [120, 145]),
    SID('SFD1X', '26L', 'SFD', [145, 165]),
    SID('BOGNA1X', '26L', 'BOGNA', [165, 215]),
    // Runway 08R.
    SID('IMVUR1Z', '08R', 'IMVUR', [215, 330]),
    SID('LAM1Z', '08R', 'LAM', [330, 45]),
    SID('FRANE1Z', '08R', 'FRANE', [45, 78]),
    SID('ODVIK2Z', '08R', 'ODVIK', [78, 120]),
    SID('SFD4Z', '08R', 'SFD', [120, 215]),
  ],
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'London Gatwick route network 2026 (Wikipedia; about 43 million passengers and 280000 movements a year, up to 55 an hour); operator shares estimated',
    rateFactor: 1.4,
    operators: [
      { airline: 'EZY', weight: 45 },
      { airline: 'BAW', weight: 10, types: ['A320', 'A20N', 'A21N'], destinations: ['LEMG', 'LPFR', 'LEPA', 'LIRF', 'LPPT', 'GCTS', 'LGAV', 'LEIB', 'LXGB', 'EGJJ'] },
      { airline: 'BAW', weight: 3, types: ['B77W'], destinations: ['KMCO', 'TBPB', 'TAPA', 'KTPA', 'MMUN'] },
      { airline: 'WUK', weight: 6 },
      { airline: 'VLG', weight: 3, destinations: ['LEBL', 'LEMG'] },
      { airline: 'TOM', weight: 5 },
      { airline: 'EXS', weight: 3 },
      { airline: 'RYR', weight: 2, destinations: ['EIDW'] },
      { airline: 'UAE', weight: 2 },
      { airline: 'QTR', weight: 2 },
      { airline: 'THY', weight: 2, types: ['A321'] },
      { airline: 'WJA', weight: 1, types: ['B789'], destinations: ['CYYC'] },
      { airline: 'CPA', weight: 1, types: ['A359'] },
      { airline: 'JBU', weight: 1, types: ['A21N'] },
      { airline: 'ICE', weight: 1 },
      { airline: 'TAP', weight: 1 },
      { airline: 'RAM', weight: 1 },
      { airline: 'PGT', weight: 1, destinations: ['LTFJ', 'LTAI'] },
      { airline: 'AEA', weight: 1, types: ['B738'] },
    ],
  },
  briefing: [
    {
      title: 'London Gatwick in short',
      items: [
        'The busiest single runway in the world: **08R/26L** (3317 m), both thresholds displaced - departures start in the pre-threshold area. Westerly winds: runway **26L** about 70 % of the time. Up to 55 movements an hour: keep the runway busy, landings and departures alternating.',
        '**08L/26R** north of it is the standby runway, used only while 08R/26L is closed: drawn, not used. Arrivals cross it without a clearance when vacating.',
        'Runway **26L**: departures from **M1** (full length 3255 m) or the intersections **A1** (3146 m), **B1** (2891 m), **C1** (2460 m); arrivals vacate via the rapid exits **ER**, **FR**, **GR** onto **J**. Runway **08R**: departures from **J1** (3159 m), **H1** (2937 m) or **G1** (2772 m); arrivals vacate via **D**, **CR** or **BR**.',
        '**J** runs along the north side of the runways, **K** and **L** between the piers. North Terminal: Piers 4-6 and the north apron; South Terminal: Piers 1-3 (Pier 3 the satellite). Remote stands along R, S and U; cargo north of L.',
        'Gatwick Delivery gives the clearances, Gatwick Ground taxis, Gatwick Tower runs the runway, Gatwick Director the approaches. RNAV SIDs - **X** from 26L (NOVMA, TIGER, DAGGA, WIZAD, HARDY, SFD, BOGNA), **Z** from 08R (IMVUR, LAM, FRANE, ODVIK, SFD) - climb to 6000 ft; transition altitude 6000 ft.',
      ],
    },
  ],
};
