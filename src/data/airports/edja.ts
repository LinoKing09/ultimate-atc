import type { AirportData } from '../../core/airport/types';
import { EDJA_LAYOUT } from './edja.layout';
import { buildLayout, exitVia } from './osmLayout';

/**
 * Memmingen (EDJA), Allgäu Airport.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (edja.layout.ts). Runway ends: OSM threshold nodes; the displaced part of runway 24 from OSM.
 * Checked against the aerodrome chart (AIP AD 2 EDJA, used only as a reference): the OSM positions
 * of N, C, D, E and the displaced threshold match the chart's intersection take-off distances within
 * a few metres. What OSM does not have was digitised by hand from the chart (approximate positions,
 * a few tens of metres): taxiway R, the western part of P with P4 and Apron 4, the pad south of P near
 * E, and the closed parts (chart crosses) - S, P east of E, the loops around both runway ends and the
 * branches to Apron 4.
 * Procedures and restrictions: VATSIM Germany Memmingen SOP (taxiway use, backtracks, SIDs,
 * frequencies, stands), see docs/airports/EDJA.md.
 *
 * Airliners use W, N and R. The south side (P, P4, C, D, E and the GA lanes) is for small aircraft
 * only (P: outer main gear wheel span up to 6 m, modelled as a 24 m wingspan limit). Departures 24
 * and landings 06 backtrack on the runway, as in reality.
 */

/** Taxiway parts closed on the chart (crosses), unnamed unless the chart names them. */
const CLOSED: [string, string, string][] = [
  // S: from N to the runway, disused.
  ['S.N', 'S.8', 'S'],
  ['S.8', 'S.4', 'S'],
  // Loop around the runway 06 end (north and south of the stopway) and the stub at the threshold.
  ['W.2', 'X06.1', ''],
  ['X06.1', 'X06.2', ''],
  ['X06.2', 'X06.3', ''],
  ['X06.3', 'X06.4', ''],
  ['X06.4', 'X06.5', ''],
  ['X06.5', 'X06.PAD', ''],
  ['X06.PAD', 'X06.6', ''],
  ['X06.6', 'X06.7', ''],
  ['X06.7', 'X06.8', ''],
  ['X06.8', 'X06.9', ''],
  ['X06.9', 'X06.J', ''],
  ['X06.J', 'X06.R', ''],
  ['X06.J', 'P.W1', 'P'],
  // Branches from P to Apron 4.
  ['P.W3', 'A4.3', ''],
  ['P.W4', 'A4.1', ''],
  ['A4.1', 'A4.2', ''],
  ['A4.2', 'P4.3', ''],
  // P east of E and the loop around the runway 24 end with its two links to the runway.
  ['HP.1183366517', 'PE.1', 'P'],
  ['PE.1', 'PE.2', 'P'],
  ['PE.2', 'PE.3', 'P'],
  ['PE.3', 'PE.4', 'P'],
  ['PE.4', 'X24.L1', ''],
  ['PE.4', 'X24.1', ''],
  ['X24.1', 'X24.2', ''],
  ['X24.2', 'X24.L2', ''],
  ['X24.2', 'X24.3', ''],
  ['X24.3', 'X24.4', ''],
  ['X24.4', 'X24.5', ''],
  ['X24.5', 'X24.6', ''],
  ['X24.6', 'X24.7', ''],
  ['X24.7', 'X24.PAD', ''],
];

const built = buildLayout(EDJA_LAYOUT, {
  runway: '06/24',
  holdingPoints: { 'HP.2892627177': 'W', 'HP.10537053378': 'N', 'HP.R': 'R', 'HP.11510849061': 'C', 'HP.11510869169': 'D', 'HP.1183366517': 'E' },
  edgeNames: {
    // The unnamed lanes on Apron 2 are reached via N.
    '?/N>?.1': 'N',
    '?.1>?.2': 'N',
    '?.2>?.3': 'N',
    '?.3>?.4': 'N',
    '?.4>?.5': 'N',
    '?.5>?.6': 'N',
    '?.2>?.7': 'N',
    '?.7>?/N.2': 'N',
    // C from P (two fillets in OSM) and the start of P4.
    '?/C>HP.11510849061': 'C',
    'HP.11510849061>?/P.7': 'C',
    '?/C>HP.11510849065': 'C',
    'HP.11510849065>?/P.6': 'C',
    '?.8>?/P': 'P4',
  },
  // The other unnamed lanes are the GA lanes on the south side.
  taxilanes: [''],
  // South side: small aircraft only (P: outer main gear wheel span up to 6 m).
  maxWingspanM: { P: 24, P4: 24, C: 24, D: 24, E: 24, '': 24 },
  // Pavement widths estimated from the proportions on the aerodrome chart: R wider than N / W, the south
  // side and S about two thirds of N, the GA lanes narrower still.
  widthM: { N: 23, W: 23, R: 27, S: 15, P: 15, P4: 15, C: 15, D: 15, E: 15, '': 12 },
  dropEdges: [
    // The western part of S (OSM) is gone on the current chart (R was built there).
    'S.4>HP.1183356701',
    'HP.1183356701>S.5',
    'S.5>S.6',
    'S.6>N/S',
    // S ends at the runway edge (closed, no holding point).
    'RWY.S.2>S.1',
    'S.7>RWY.S',
    'S.2>S.1',
    'S.2>S.7',
    // Split for R and the pad south of P.
    'RWY.W>RWY.S',
    'D/P.2>P.1',
  ],
  closedEdges: ['S.4>S.3', 'S.3>S.2'],
  addNodes: [
    // Displaced part of runway 24 (beyond its threshold, usable for the take-off run 24).
    ['RWY.24END', 47.9953372, 10.2559803],
    // Digitised from the aerodrome chart (approximate).
    // R: runway node 455 m from the 06 end (chart: take-off run 06 from R 2175 m).
    ['RWY.R', 47.985389, 10.230921],
    ['R.1', 47.9867993, 10.2297394],
    ['HP.R', 47.9861157, 10.2302681],
    ['S.N', 47.9885516, 10.2339606],
    ['S.8', 47.9881258, 10.2341257],
    ['X06.1', 47.9840037, 10.2245724],
    ['X06.2', 47.9836354, 10.2235509],
    ['X06.3', 47.9832952, 10.2226378],
    ['X06.4', 47.9829231, 10.2221131],
    ['X06.5', 47.9825024, 10.2223005],
    ['X06.PAD', 47.9820945, 10.2227042],
    ['X06.6', 47.9816583, 10.223021],
    ['X06.7', 47.9814514, 10.2236225],
    ['X06.8', 47.981778, 10.2244273],
    ['X06.9', 47.9819767, 10.2249276],
    ['X06.J', 47.9822313, 10.225688],
    ['X06.R', 47.983069, 10.22581],
    ['P.W1', 47.9825587, 10.2263848],
    ['P.W2', 47.9830698, 10.2276464],
    ['P.W3', 47.9835954, 10.2289082],
    ['P.W4', 47.9840355, 10.2299958],
    ['A4.1', 47.9835292, 10.2300306],
    ['A4.2', 47.983119, 10.2307367],
    ['A4.3', 47.9829408, 10.2294374],
    ['P4.1', 47.9837213, 10.2314165],
    ['P4.2', 47.9833616, 10.2311728],
    ['P4.3', 47.9830745, 10.2308872],
    ['P4.4', 47.9827308, 10.2304494],
    ['P4.5', 47.9825015, 10.2301647],
    ['P.PAD', 47.9913658, 10.2485253],
    ['PAD.1', 47.9909105, 10.2484961],
    ['PE.1', 47.9921558, 10.250202],
    ['PE.2', 47.9926531, 10.251377],
    ['PE.3', 47.9931215, 10.2525514],
    ['PE.4', 47.9935759, 10.2536608],
    ['X24.L1', 47.9941774, 10.2536909],
    ['X24.1', 47.9938315, 10.2542916],
    ['X24.2', 47.9941038, 10.2546203],
    ['X24.L2', 47.994494, 10.2544884],
    ['X24.3', 47.9940585, 10.2548788],
    ['X24.4', 47.9943141, 10.2555096],
    ['X24.5', 47.9945552, 10.2561401],
    ['X24.6', 47.9948699, 10.2565991],
    ['X24.7', 47.9952175, 10.2565184],
    ['X24.PAD', 47.9954651, 10.2562849],
  ],
  addEdges: [
    ['RWY.END.2', 'RWY.24END', '06/24', 'runway'],
    ['RWY.W', 'RWY.R', '06/24', 'runway'],
    ['RWY.R', 'RWY.S', '06/24', 'runway'],
    ['N.10', 'R.1', 'R', 'taxiway'],
    ['R.1', 'HP.R', 'R', 'taxiway'],
    ['HP.R', 'RWY.R', 'R', 'taxiway'],
    // P west of the OSM part, P4 to Apron 4, the pad south of P.
    ['?/P', 'P.W4', 'P', 'taxiway'],
    ['P.W4', 'P.W3', 'P', 'taxiway'],
    ['P.W3', 'P.W2', 'P', 'taxiway'],
    ['P.W2', 'P.W1', 'P', 'taxiway'],
    ['?.8', 'P4.1', 'P4', 'taxiway'],
    ['P4.1', 'P4.2', 'P4', 'taxiway'],
    ['P4.2', 'P4.3', 'P4', 'taxiway'],
    ['P4.3', 'P4.4', 'P4', 'taxiway'],
    ['P4.4', 'P4.5', 'P4', 'taxiway'],
    ['D/P.2', 'P.PAD', 'P', 'taxiway'],
    ['P.PAD', 'P.1', 'P', 'taxiway'],
    ['P.PAD', 'PAD.1', '', 'taxilane'],
    ...CLOSED.map(([from, to, name]): [string, string, string, 'taxiway', boolean] => [from, to, name, 'taxiway', true]),
  ],
  keepNodes: ['RWY.24END', 'P.W1', 'P4.5', 'PAD.1', '?.12', '?.16'],
  // Stands: Apron 1 (terminal, P11 / P12 after the AIP ground movement chart, OSM refs 1 / 2; pushback) and
  // Apron 2 (3-6, taxi in / out; the SOP has a pushback on 6, but its lane ends there).
  stands: [
    { id: 'P11', osm: '1', apron: 'Apron 1', maxWingspanM: 36, pushback: true, lanes: ['N.7'] },
    { id: 'P12', osm: '2', apron: 'Apron 1', maxWingspanM: 36, pushback: true, lanes: ['N.8'] },
    { id: '3', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['?.3'] },
    { id: '4', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['N.12'] },
    { id: '5', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['N.13'] },
    { id: '6', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['?.5'] },
  ],
});

/** Stopway beyond the runway 06 end (chart: 200 m, ASDA 24 = 2830 m), 45 m wide. */
const STOPWAY_06 = [
  [47.9834755, 10.2255084],
  [47.9825579, 10.223197],
  [47.9822099, 10.2235054],
  [47.9831275, 10.2258168],
].map(([lat, lon]) => ({ lat, lon }));

/** Apron 4 (south-west, GA), digitised from the aerodrome chart (not in OSM). */
const APRON_4 = [
  [47.9824899, 10.2278528],
  [47.9829862, 10.2291573],
  [47.9830802, 10.2301311],
  [47.9825417, 10.2305975],
  [47.9821701, 10.2300079],
  [47.9820979, 10.2280623],
].map(([lat, lon]) => ({ lat, lon }));

/** Threshold 06 (= runway end 06) and threshold 24 from OSM; runway end 24 at the end of the displaced part. */
const THR_06 = { lat: 47.9833015, lon: 10.2256626 };
const THR_24 = { lat: 47.994297, lon: 10.2533499 };
const END_24 = { lat: 47.9953372, lon: 10.2559803 };

export const EDJA: AirportData = {
  icao: 'EDJA',
  name: 'Memmingen',
  city: 'Memmingen',
  country: 'Germany',
  arp: { lat: 47.988092, lon: 10.238248 },
  elevationFt: 2077,
  magneticVariation: 3.9,
  timeZone: 'Europe/Berlin',
  // Westerly winds prevail (runway 24); estimate.
  wind: { primaryShare: 0.65, primary: [200, 280], secondary: [20, 100] },
  transitionAltitudeFt: 5000,
  // Initial climb FL70 (SOP), said as a flight level above the transition altitude.
  initialClimbFt: 7000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL), checked against the AIP aerodrome chart; taxiway R, the western part of P, P4, Apron 4 and the closed taxiways (crosses) digitised by hand from the chart (approximate). Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '06/24',
      widthM: 45,
      lengthM: 2630,
      ends: [
        { name: '06', threshold: THR_06, end: THR_06, elevationFt: 2077 },
        { name: '24', threshold: THR_24, end: END_24, elevationFt: 2077 },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  // The closed loops (unnamed) are as wide as P, not like the GA lanes.
  taxiEdges: built.taxiEdges.map((e) => (e.closed && !e.name ? { ...e, widthM: 15 } : e)),
  stands: built.stands,
  areas: [...built.areas, { name: 'Apron 4', polygon: APRON_4 }, { name: 'Stopway 06', polygon: STOPWAY_06 }],
  buildings: built.buildings,
  stations: [
    { callsign: 'EDJA_GND', type: 'GND', name: 'Memmingen Ground', frequency: '121.680' },
    { callsign: 'EDJA_TWR', type: 'TWR', name: 'Memmingen Tower', frequency: '126.855' },
    { callsign: 'EDJA_APP', type: 'APP', name: 'Muenchen Radar', frequency: '129.450' },
    { callsign: 'EDJA_ATIS', type: 'ATIS', name: 'Memmingen Information', frequency: '118.855' },
  ],
  runwayOps: [
    {
      runway: '24',
      // From N with a backtrack to the runway end 24 (no taxiway to it for airliners).
      departureEntries: [{ holdingPoint: 'N', intersection: 'N', fullLength: true, backtrack: true }],
      // R (on pilot request, SOP) lies between N and the runway end.
      exits: [exitVia(built, 'N', 'HP.10537053378'), exitVia(built, 'R', 'HP.R'), exitVia(built, 'W', 'HP.2892627177')],
    },
    {
      runway: '06',
      departureEntries: [
        { holdingPoint: 'W', intersection: 'W', fullLength: true },
        // Chart: take-off run from R 2175 m, from N 1570 m.
        { holdingPoint: 'R', intersection: 'R', fullLength: false },
        { holdingPoint: 'N', intersection: 'N', fullLength: false },
      ],
      // Landing 06: vacate via N - most aircraft roll past it, turn around on the runway and backtrack.
      exits: [{ ...exitVia(built, 'N', 'HP.10537053378'), backtrack: true }],
    },
  ],
  // SIDs: designators from the VATSIM Germany SOP (A = runway 24, B = runway 06); numbers change with the AIRAC cycle.
  sids: [
    { name: 'KPT4A', runway: '24', fix: 'KPT' },
    { name: 'LUPOL5A', runway: '24', fix: 'LUPOL' },
    { name: 'UMTEX1A', runway: '24', fix: 'UMTEX' },
    { name: 'KPT4B', runway: '06', fix: 'KPT' },
    { name: 'LUPOL5B', runway: '06', fix: 'LUPOL' },
    { name: 'UMTEX2B', runway: '06', fix: 'UMTEX' },
  ],
  // No A-CDM and no datalink clearances at Memmingen.
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Memmingen Airport route network (Ryanair and Wizz Air bases), operator shares estimated',
    rateFactor: 0.35,
    standReserve: 1,
    operators: [
      { airline: 'RYR', weight: 60, types: ['B738', 'B738', 'B38M'], destinations: ['LEPA', 'LEPA', 'EGSS', 'EIDW', 'LIRA', 'LPPR', 'LEMG', 'LEAL', 'LGTS', 'LEVC', 'LIME', 'GMMX', 'LCLK', 'LGKR', 'LDZD'] },
      { airline: 'WZZ', weight: 30, types: ['A320', 'A21N', 'A21N'], destinations: ['LWSK', 'LBSF', 'LROP', 'UGKO', 'LQTZ', 'LRCL', 'LRIA', 'LYPG', 'LYBE'] },
      { airline: 'SXS', weight: 5, types: ['B738', 'B38M'], destinations: ['LTAI', 'LTBJ'] },
      { airline: 'DCX', weight: 5 },
    ],
  },
  briefing: [
    {
      title: 'Memmingen in short',
      items: [
        'A former air force base: one runway 06/24. Airliners use **W** (to the runway 06 end), **N** (from the aprons to the middle of the runway) and **R** (between them, on pilot request). The south side - P, P4, C, D, E, Apron 3 (GA) and Apron 4 - is for small aircraft only (24 m wingspan in the simulator). Parts marked with crosses are closed: S, P east of E and the loops around both runway ends.',
        'Runway 24 departures enter at N and **backtrack** to the runway end: `backtrack runway 24, line up and wait`, then `cleared for take-off`. The turn loops at the runway ends are closed - the aircraft turns on the runway. Runway 06 departures line up at W (full length), R (2175 m) or N (1570 m).',
        'Landing 06, aircraft roll past N, **turn around on the runway** and backtrack to N (`backtrack, vacate via N`). Landing 24, they vacate via N, R or at the end via W.',
        'Holding point W lies before the turn towards the runway, in a hot spot: check that aircraft hold there.',
        'During a backtrack the runway is occupied for a long time - plan landings with more space.',
        'Memmingen Ground also gives the IFR clearances (there is no Delivery). De-icing is done on the stands.',
        'Stands P11 / P12 (Apron 1, terminal) and 6 need a pushback; 3-5 on Apron 2 are taxi-in / taxi-out positions.',
      ],
    },
  ],
};
