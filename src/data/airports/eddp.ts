import type { AirportData } from '../../core/airport/types';
import { EDDP_LAYOUT } from './eddp.layout';
import { buildLayout, exitVia, layoutEdges } from './osmLayout';

/**
 * Leipzig/Halle (EDDP), the European hub of DHL.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (eddp.layout.ts). Runway data, declared distances, stand positions, taxiway names and widths, parallel runway
 * operations: DFS AIP AD 2 EDDP (AIRAC 2026OCT01) with its aerodrome chart (facts only). Procedures, frequencies,
 * runway assignment and stand use: VATSIM Germany Leipzig/Halle airport page. See docs/airports/EDDP.md.
 *
 * Two parallel runways 2.1 km apart, both used for take-offs and landings: 08L/26R in the north (passenger
 * apron 1 and apron 3), 08R/26L in the south (the DHL aprons 4 and 5, apron 2). Arrivals on the two finals are
 * dependent parallel approaches (1.5 NM diagonal), departures from the two runways are independent (AIP AD 2.22).
 *
 * Simplifications: the stands are the AIP positions with lead-in lines from OSM; apron 2 gets a taxilane along
 * its stands (OSM has none) and apron 3 lead-ins from F. The alternative positions (L / R / W / M and the
 * southerly aligned ones) are left out; stand sizes after the VATSIM Germany bays (apron 4) or estimated. The
 * orange guide line L (follow-me only) and the de-icing pads are drawn but not used; one Tower position for
 * both runways (as on VATSIM when only one is staffed: the frequencies are cross-coupled). No GA traffic.
 */

const C = 36;
/**
 * Stands: [designator, apron, largest wingspan (m), pushback, lane node(s) (taxi in, taxi out), lat, lon, use] - the
 * position is the AIP AD 2.8 checkpoint (stands at the dead end of an apron 4 taxilane push back from the node before it,
 * so the aircraft faces the exit). 101-111 are taxi-out positions (in from L, out onto N); apron 4 after the
 * VATSIM Germany bays (A 401-412 52 m, B 421-436 36 m, C 441-452 52 m, D 461-478 52 m, E 481-487 80 m).
 */
const STANDS: [string, string, number, boolean, string[], number, number, ('ga' | 'cargo')?][] = [
  ['101', '1', 36, false, ['L.1', 'N.33'], 51.4206083, 12.2122],
  ['102', '1', 36, false, ['L.2', 'N.32'], 51.4205861, 12.2123361],
  ['103', '1', 36, false, ['L.3', 'N.31'], 51.4205, 12.2128361],
  ['104', '1', 36, false, ['L.4', 'N.30'], 51.4204528, 12.2131],
  ['105', '1', 36, false, ['L.5', 'N.29'], 51.4204056, 12.2133778],
  ['106', '1', 36, false, ['L.6', 'N.28'], 51.4203889, 12.2134722],
  ['107', '1', 36, false, ['L.7', 'N.27'], 51.4203222, 12.2138611],
  ['108', '1', 36, false, ['L.8', 'N.26'], 51.4202778, 12.2141111],
  ['109', '1', 36, false, ['L.9', 'N.25'], 51.4202389, 12.2143472],
  ['110', '1', 36, false, ['L.10', 'N.24'], 51.4201889, 12.214625],
  ['111', '1', 36, false, ['L.11', 'N.23'], 51.4201528, 12.2148306],
  ['112', '1', 36, true, ['N.22'], 51.4199806, 12.2152778, 'ga'],
  ['113', '1', 36, true, ['N.22'], 51.4199694, 12.2153472, 'ga'],
  ['114', '1', 36, true, ['N.21'], 51.4198722, 12.2157528, 'ga'],
  ['115', '1', 36, true, ['N.20'], 51.4198139, 12.2160972, 'ga'],
  ['116', '1', 36, true, ['N.19'], 51.4197917, 12.2162361, 'ga'],
  ['117', '1', 36, true, ['N.18'], 51.4196833, 12.2167917, 'ga'],
  ['118', '1', 36, true, ['N.17'], 51.4196583, 12.2169389, 'ga'],
  ['119', '1', 36, true, ['N.16'], 51.4195861, 12.21735, 'ga'],
  ['120', '1', 36, true, ['?/N.7'], 51.4195139, 12.2177722, 'ga'],
  ['121', '1', 36, true, ['N.15'], 51.4194861, 12.217925, 'ga'],
  ['126', '1', 52, true, ['N.14'], 51.4194528, 12.2188361],
  ['128', '1', 52, true, ['N.13'], 51.4193333, 12.2196028],
  ['130', '1', 52, true, ['N.12'], 51.4192167, 12.2203722],
  ['132', '1', 52, true, ['N.11'], 51.4190917, 12.2211361],
  ['134', '1', 52, true, ['N.10'], 51.4189639, 12.2219028],
  ['136', '1', 52, true, ['N.9'], 51.4188333, 12.2226639],
  ['137', '1', 36, true, ['N.8'], 51.4186389, 12.2231778, 'ga'],
  ['138', '1', 36, true, ['N.7'], 51.4186028, 12.2233778, 'ga'],
  ['139', '1', 36, true, ['N.6'], 51.4185389, 12.2237444, 'ga'],
  ['140', '1', 36, false, ['M.1', 'N.5'], 51.4184722, 12.2241444, 'ga'],
  ['141', '1', 36, false, ['M.1', 'N.4'], 51.4185722, 12.2243528, 'ga'],
  ['142', '1', 36, false, ['M.2', 'N.3'], 51.4184667, 12.2249583, 'ga'],
  ['143', '1', 36, false, ['M.3', 'N.2'], 51.4183472, 12.2256611, 'ga'],
  ['201', '2', 65, true, ['V ORANGE.2'], 51.40785, 12.1981139, 'cargo'],
  ['202', '2', 65, true, ['A2.202'], 51.407875, 12.1986306, 'cargo'],
  ['203', '2', 65, true, ['A2.203'], 51.4079083, 12.1993667, 'cargo'],
  ['204', '2', 65, true, ['A2.204'], 51.4079417, 12.2000694, 'cargo'],
  ['205', '2', 65, true, ['A2.205'], 51.4079667, 12.2006222, 'cargo'],
  ['207', '2', 65, true, ['A2.207'], 51.4080278, 12.201875, 'cargo'],
  ['208', '2', 65, true, ['A2.208'], 51.4080528, 12.2024611, 'cargo'],
  ['209', '2', 65, true, ['A2.209'], 51.4080861, 12.2031306, 'cargo'],
  ['211', '2', 65, true, ['A2.211'], 51.4079222, 12.2046861, 'cargo'],
  ['212', '2', 65, true, ['A2.212'], 51.4081167, 12.2055111, 'cargo'],
  ['213', '2', 65, true, ['A2.213'], 51.4081389, 12.2060139, 'cargo'],
  ['214', '2', 65, true, ['A2.214'], 51.4081667, 12.2065139, 'cargo'],
  ['215', '2', 65, true, ['V ORANGE.6'], 51.4083028, 12.20745, 'cargo'],
  ['216', '2', 65, true, ['V ORANGE.7'], 51.4083111, 12.20815, 'cargo'],
  ['217', '2', 65, true, ['HP.6139515720'], 51.4083444, 12.2088472, 'cargo'],
  ['220', '2', 65, true, ['V/V ORANGE'], 51.4082722, 12.2095694, 'cargo'],
  ['221', '2', 65, true, ['V/Y'], 51.4083056, 12.2102667, 'cargo'],
  ['222', '2', 65, true, ['V/Y'], 51.4084444, 12.21095, 'cargo'],
  ['301', '3', 80, true, ['F.S301'], 51.4255306, 12.2300472, 'cargo'],
  ['302', '3', 80, true, ['F.S302'], 51.4254917, 12.2303056, 'cargo'],
  ['303', '3', 80, true, ['F.S303'], 51.4255722, 12.2309, 'cargo'],
  ['304', '3', 80, true, ['F.S304'], 51.4255528, 12.2315583, 'cargo'],
  ['305', '3', 80, true, ['F.S305'], 51.4256111, 12.2317528, 'cargo'],
  ['306', '3', 80, true, ['F.S306'], 51.4256083, 12.2328139, 'cargo'],
  ['307', '3', 80, true, ['?/F.2'], 51.4256694, 12.2340667, 'cargo'],
  ['308', '3', 80, true, ['?/F'], 51.4257278, 12.2353222, 'cargo'],
  ['401', '4', 52, true, ['Z1.1 ORANGE.5'], 51.4067278, 12.2308583, 'cargo'],
  ['402', '4', 52, true, ['Z1.2 BLUE.2'], 51.4068972, 12.2344722, 'cargo'],
  ['403', '4', 52, true, ['Z1.1 ORANGE.5'], 51.4072361, 12.2307972, 'cargo'],
  ['404', '4', 52, true, ['Z1.2 BLUE.2'], 51.4074056, 12.2344111, 'cargo'],
  ['405', '4', 52, true, ['Z1.1 ORANGE.4'], 51.4077417, 12.2307361, 'cargo'],
  ['406', '4', 52, true, ['Z1.2 BLUE.3'], 51.4079111, 12.2343528, 'cargo'],
  ['407', '4', 52, true, ['Z1.1 ORANGE.3'], 51.4082472, 12.2306778, 'cargo'],
  ['408', '4', 52, true, ['Z1.2 BLUE.4'], 51.4084167, 12.2342917, 'cargo'],
  ['409', '4', 52, true, ['Z1.1 ORANGE.2'], 51.4087556, 12.2306167, 'cargo'],
  ['410', '4', 52, true, ['Z1.2 BLUE.5'], 51.4089222, 12.2342306, 'cargo'],
  ['411', '4', 52, true, ['Z1.1 ORANGE.1'], 51.4092611, 12.2305556, 'cargo'],
  ['412', '4', 52, true, ['Z1.2 BLUE.6'], 51.4094306, 12.2341694, 'cargo'],
  ['421', '4', 36, true, ['Z2.1 ORANGE.7'], 51.4068694, 12.2354778, 'cargo'],
  ['422', '4', 36, true, ['Z2.2 BLUE.14'], 51.4070444, 12.2392556, 'cargo'],
  ['423', '4', 36, true, ['Z2.1 ORANGE.7'], 51.40725, 12.2354333, 'cargo'],
  ['424', '4', 36, true, ['Z2.2 BLUE.14'], 51.4074278, 12.2392111, 'cargo'],
  ['425', '4', 36, true, ['Z2.1 ORANGE.6'], 51.4076333, 12.2353889, 'cargo'],
  ['426', '4', 36, true, ['Z2.2 BLUE.13'], 51.4078083, 12.2391667, 'cargo'],
  ['427', '4', 36, true, ['Z2.1 ORANGE.5'], 51.4080139, 12.2353417, 'cargo'],
  ['428', '4', 36, true, ['Z2.2 BLUE.12'], 51.4081889, 12.2391194, 'cargo'],
  ['429', '4', 36, true, ['Z2.1 ORANGE.4'], 51.4083944, 12.2352972, 'cargo'],
  ['430', '4', 36, true, ['Z2.2 BLUE.11'], 51.4085722, 12.239075, 'cargo'],
  ['431', '4', 36, true, ['Z2.1 ORANGE.3'], 51.408775, 12.23525, 'cargo'],
  ['432', '4', 36, true, ['Z2.2 BLUE.10'], 51.4089528, 12.2390278, 'cargo'],
  ['433', '4', 36, true, ['Z2.1 ORANGE.2'], 51.4091583, 12.2352056, 'cargo'],
  ['434', '4', 36, true, ['Z2.2 BLUE.9'], 51.4093333, 12.2389833, 'cargo'],
  ['435', '4', 36, true, ['Z2.1 ORANGE.1'], 51.4095389, 12.2351611, 'cargo'],
  ['436', '4', 36, true, ['Z2.2 BLUE.8'], 51.4097167, 12.2389389, 'cargo'],
  ['441', '4', 52, true, ['Z3.1 ORANGE.2'], 51.4071667, 12.2402444, 'cargo'],
  ['442', '4', 52, true, ['Z3.2 BLUE.5'], 51.4073361, 12.2438583, 'cargo'],
  ['443', '4', 52, true, ['Z3.1 ORANGE.3'], 51.4076722, 12.2401861, 'cargo'],
  ['444', '4', 52, true, ['Z3.2 BLUE.5'], 51.4078417, 12.2438, 'cargo'],
  ['445', '4', 52, true, ['Z3.1 ORANGE.6'], 51.4081806, 12.240125, 'cargo'],
  ['446', '4', 52, true, ['Z3.2 BLUE.4'], 51.40835, 12.2437389, 'cargo'],
  ['447', '4', 52, true, ['Z3.1 ORANGE.8'], 51.4086861, 12.2400639, 'cargo'],
  ['448', '4', 52, true, ['Z3.2 BLUE.3'], 51.4088556, 12.2436778, 'cargo'],
  ['449', '4', 52, true, ['Z3.1 ORANGE.11'], 51.4091917, 12.2400028, 'cargo'],
  ['450', '4', 52, true, ['Z3.2 BLUE.2'], 51.4093611, 12.2436167, 'cargo'],
  ['451', '4', 52, true, ['Z3.1 ORANGE.13'], 51.4097, 12.2399444, 'cargo'],
  ['452', '4', 52, true, ['Z3.2 BLUE.1'], 51.4098694, 12.2435583, 'cargo'],
  ['461', '4', 52, true, ['Z4.1 ORANGE.2'], 51.4073917, 12.2450528, 'cargo'],
  ['462', '4', 52, true, ['Z4.3 BLUE.2'], 51.4075611, 12.2486667, 'cargo'],
  ['463', '4', 52, true, ['Z4.2.2'], 51.4076361, 12.2448667, 'cargo'],
  ['464', '4', 52, true, ['Z4.2.2'], 51.4078056, 12.2484444, 'cargo'],
  ['465', '4', 52, true, ['Z4.1 ORANGE.2'], 51.4078972, 12.2449917, 'cargo'],
  ['466', '4', 52, true, ['Z4.3 BLUE.2'], 51.4080667, 12.2486083, 'cargo'],
  ['467', '4', 52, true, ['Z4.1 ORANGE.3'], 51.4084056, 12.2449333, 'cargo'],
  ['468', '4', 52, true, ['Z4.3 BLUE.5'], 51.4085722, 12.2485472, 'cargo'],
  ['469', '4', 52, true, ['Z4.2.2'], 51.40865, 12.2447472, 'cargo'],
  ['470', '4', 52, true, ['Z4.2.2'], 51.4088167, 12.248325, 'cargo'],
  ['471', '4', 52, true, ['Z4.1 ORANGE.4'], 51.4089111, 12.2448722, 'cargo'],
  ['472', '4', 52, true, ['Z4.3 BLUE.6'], 51.4090806, 12.2484861, 'cargo'],
  ['473', '4', 52, true, ['Z4.1 ORANGE.5'], 51.4094167, 12.2448111, 'cargo'],
  ['474', '4', 52, true, ['Z4.3 BLUE.9'], 51.4095861, 12.2484278, 'cargo'],
  ['475', '4', 52, true, ['Z4.2.3'], 51.4096639, 12.244625, 'cargo'],
  ['476', '4', 52, true, ['Z4.2.3'], 51.4098306, 12.2482028, 'cargo'],
  ['477', '4', 52, true, ['Z4.1 ORANGE.6'], 51.4099222, 12.2447528, 'cargo'],
  ['478', '4', 52, true, ['Z4.3 BLUE.10'], 51.4100917, 12.2483667, 'cargo'],
  ['481', '4', 80, true, ['Z5.2.3'], 51.4077333, 12.2497944, 'cargo'],
  ['483', '4', 80, true, ['Z5.2.3'], 51.4085083, 12.2497, 'cargo'],
  ['485', '4', 80, true, ['Z5.2.2'], 51.4092861, 12.2496083, 'cargo'],
  ['487', '4', 80, true, ['Z5.2.1'], 51.4100611, 12.2495167, 'cargo'],
  ['501', '5', 65, true, ['HP.7377136515'], 51.4090528, 12.22885, 'cargo'],
  ['502', '5', 65, true, ['HP.7377136515'], 51.4090333, 12.2284472, 'cargo'],
  ['503', '5', 65, true, ['HP.7377136515'], 51.4090139, 12.2280417, 'cargo'],
  ['504', '5', 65, true, ['HP.7377136512'], 51.408975, 12.2272056, 'cargo'],
  ['505', '5', 65, true, ['HP.7377136512'], 51.4089556, 12.2268, 'cargo'],
  ['506', '5', 65, true, ['HP.7377136512'], 51.4089361, 12.2263972, 'cargo'],
];

const built = buildLayout(EDDP_LAYOUT, {
  runway: '08L/26R',
  // The charts give no holding point designators: they are named after their taxiways (VATSIM). North runway: A1-A9
  // from C; south runway: S1-S10 from T (south side), H1, H5, H7 and H8 from the north. H1 is the CAT II/III position
  // far from the runway (hot spot 1).
  holdingPoints: {
    'HP.6139515886': 'A1',
    // A2 joins A1 before the runway.
    'HP.6139515885': { name: 'A2', node: 'RWY.A1' },
    'HP.6139515775': 'A3',
    'HP.6139515887': 'A4',
    'HP.6139515910': 'A5',
    'HP.6139515909': 'A6',
    'HP.6139515903': 'A7',
    'HP.2704441362': 'A8',
    'HP.6139515899': 'A9',
    'HP.6139515715': { name: 'S1', runway: '08R/26L' },
    'HP.6139515278': { name: 'S2', runway: '08R/26L' },
    'HP.2694400171': { name: 'S3', runway: '08R/26L' },
    'HP.6139515727': { name: 'S4', runway: '08R/26L' },
    'HP.6139515751': { name: 'S5', runway: '08R/26L' },
    'HP.6139515740': { name: 'S6', runway: '08R/26L' },
    'HP.6139515739': { name: 'S7', runway: '08R/26L' },
    'HP.6139515738': { name: 'S8', runway: '08R/26L' },
    'HP.6139515737': { name: 'S9', runway: '08R/26L' },
    'HP.6139515736': { name: 'S10', runway: '08R/26L' },
    'HP.6139515279': { name: 'H1', runway: '08R/26L' },
    'HP.6139515753': { name: 'H5', runway: '08R/26L' },
    'HP.6139515755': { name: 'H7', runway: '08R/26L' },
    'HP.6139515757': { name: 'H8', runway: '08R/26L' },
  },
  // The guide lines of apron 4 (orange / blue) are named after their taxilanes.
  taxiwayNames: {
    'Z1.1 ORANGE': 'Z1.1',
    'Z1.2 BLUE': 'Z1.2',
    'Z2.1 ORANGE': 'Z2.1',
    'Z2.2 BLUE': 'Z2.2',
    'Z3.1 ORANGE': 'Z3.1',
    'Z3.2 BLUE': 'Z3.2',
    'Z4.1 ORANGE': 'Z4.1',
    'Z4.3 BLUE': 'Z4.3',
    'Z5.1 ORANGE': 'Z5.1',
  },
  // Apron 3: F gets a node above every stand (OSM has one straight line); apron 2: a taxilane along the stands.
  addNodes: [
    ['F.S301', 51.4265918, 12.2300472],
    ['F.S302', 51.4266038, 12.2303056],
    ['F.S303', 51.4266313, 12.2309],
    ['F.S304', 51.4266618, 12.2315583],
    ['F.S305', 51.4266708, 12.2317528],
    ['F.S306', 51.42672, 12.2328139],
    ['A2.202', 51.4088406, 12.1986306],
    ['A2.203', 51.4088408, 12.1993667],
    ['A2.204', 51.4088409, 12.2000694],
    ['A2.205', 51.408841, 12.2006222],
    ['A2.207', 51.4088413, 12.201875],
    ['A2.208', 51.4088414, 12.2024611],
    ['A2.209', 51.4088415, 12.2031306],
    ['A2.211', 51.4088419, 12.2046861],
    ['A2.212', 51.408842, 12.2055111],
    ['A2.213', 51.4088421, 12.2060139],
    ['A2.214', 51.4088422, 12.2065139],
  ],
  addEdges: [
    ['F.1', 'F.S301', 'F', 'taxiway'],
    ['F.S301', 'F.S302', 'F', 'taxiway'],
    ['F.S302', 'F.S303', 'F', 'taxiway'],
    ['F.S303', 'F.S304', 'F', 'taxiway'],
    ['F.S304', 'F.S305', 'F', 'taxiway'],
    ['F.S305', 'F.S306', 'F', 'taxiway'],
    ['F.S306', '?/F.2', 'F', 'taxiway'],
    ['V ORANGE.2', 'A2.202', 'V ORANGE', 'taxilane'],
    ['A2.202', 'A2.203', 'V ORANGE', 'taxilane'],
    ['A2.203', 'A2.204', 'V ORANGE', 'taxilane'],
    ['A2.204', 'A2.205', 'V ORANGE', 'taxilane'],
    ['A2.205', 'A2.207', 'V ORANGE', 'taxilane'],
    ['A2.207', 'A2.208', 'V ORANGE', 'taxilane'],
    ['A2.208', 'A2.209', 'V ORANGE', 'taxilane'],
    ['A2.209', 'A2.211', 'V ORANGE', 'taxilane'],
    ['A2.211', 'A2.212', 'V ORANGE', 'taxilane'],
    ['A2.212', 'A2.213', 'V ORANGE', 'taxilane'],
    ['A2.213', 'A2.214', 'V ORANGE', 'taxilane'],
    ['A2.214', 'V ORANGE.5', 'V ORANGE', 'taxilane'],
  ],
  dropEdges: ['?/F.2>F.1'],
  // The dead ends of the apron 4 taxilanes, room for the pushbacks from the last stands.
  keepNodes: ['Z1.1 ORANGE.6', 'Z1.2 BLUE.1', 'Z2.1 ORANGE.8', 'Z2.2 BLUE.15', 'Z3.1 ORANGE.1', 'Z3.2 BLUE.6', 'Z4.1 ORANGE.1', 'Z4.3 BLUE.1', 'Z4.2.1', 'Z5.2.4'],
  // The orange guide line between stands 101-111 is for follow-me guidance only (AIP AD 2.20 8).
  drawOnly: layoutEdges(EDDP_LAYOUT, { names: ['L ORANGE'] }),
  maxWingspanM: { L: C, M: C },
  // AIP AD 2.8: 30 m.
  widthM: Object.fromEntries(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'B', 'C', 'E7', 'E8', 'F', 'G1', 'G2', 'H1', 'H2', 'H5', 'H7', 'H8', 'K', 'L', 'M', 'N', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'T', 'V', 'W1', 'Y'].map((t) => [t, 30])),
  taxilanes: ['L', 'M', 'V ORANGE', 'Z1.1', 'Z1.2', 'Z2.1', 'Z2.2', 'Z3.1', 'Z3.2', 'Z4.1', 'Z4.2', 'Z4.3', 'Z5.1', 'Z5.2'],
  stands: STANDS.map(([id, apron, maxWingspanM, pushback, lanes, lat, lon, use]) => ({
    id,
    apron: `Apron ${apron}`,
    maxWingspanM,
    pushback,
    lanes,
    pos: { lat, lon },
    ...(use ? { use } : {}),
  })),
});

// Thresholds: AIP AD 2.12 (no displaced thresholds).
const THR_08L = { lat: 51.4312403, lon: 12.2158178 };
const THR_26R = { lat: 51.4336475, lon: 12.2674394 };
const THR_08R = { lat: 51.4116081, lon: 12.2046483 };
const THR_26L = { lat: 51.4140203, lon: 12.2562472 };

/** Muenchen Radar South: the departures via NEVKO, GOLAT and DRN (AIP SID charts, VATSIM Germany). */
const RADAR_SOUTH = '126.175';
/**
 * SIDs (AIP AD 2 EDDP 5-7): the letter names the runway - Q 08L, E 08R, S 26L, N 26R. Exit fixes: PENEM north,
 * ORTAG west, NEVKO south-west, GOLAT south, DRN (Dresden) east. All climb to FL70. Numbers change with the AIRAC cycle.
 */
const SID_FIXES: [string, string, string, string, string, [number, number], string?][] = [
  ['PENEM2Q', 'PENEM2E', 'PENEM2S', 'PENEM2N', 'PENEM', [320, 40]],
  ['ORTAG6Q', 'ORTAG6E', 'ORTAG6S', 'ORTAG6N', 'ORTAG', [245, 320]],
  ['NEVKO3Q', 'NEVKO3E', 'NEVKO3S', 'NEVKO3N', 'NEVKO', [205, 245], RADAR_SOUTH],
  ['GOLAT3Q', 'GOLAT3E', 'GOLAT3S', 'GOLAT3N', 'GOLAT', [150, 205], RADAR_SOUTH],
  ['DRN3Q', 'DRN3E', 'DRN3S', 'DRN3N', 'DRN', [40, 150], RADAR_SOUTH],
];

/** Aprons by runway (VATSIM Germany): passengers and apron 3 north, the cargo aprons 2, 4 and 5 south. */
const APRONS = { 'Apron 1': '08L/26R', 'Apron 3': '08L/26R', 'Apron 2': '08R/26L', 'Apron 4': '08R/26L', 'Apron 5': '08R/26L' };
/** A340-600, B777-300, B747 and A380 use the southern runway (60 m wide). */
const LARGE = { runway: '08R/26L', minWingspanM: 63 };

export const EDDP: AirportData = {
  icao: 'EDDP',
  name: 'Leipzig/Halle',
  city: 'Leipzig',
  country: 'Germany',
  fir: 'EDMM',
  // AIP AD 2.2.
  arp: { lat: 51.4239917, lon: 12.2363833 },
  elevationFt: 469,
  // AIP: 4.9° E (2026.01), +0.2° per year.
  magneticVariation: 5.0,
  timeZone: 'Europe/Berlin',
  // Runway 26 is preferred (up to 5 kt tailwind, VATSIM SOP); westerly winds prevail (estimate).
  wind: { primaryShare: 0.65, primary: [200, 330], secondary: [20, 150] },
  // Open 24 hours for the cargo hub; the night rules of AIP AD 2.20 restrict passenger flights only - not modelled.
  transitionAltitudeFt: 5000,
  // Every SID climbs to FL70 (AIP SID charts).
  initialClimbFt: 7000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway data, declared distances, stand positions and taxiway widths from the DFS AIP (facts only); stand sizes after the VATSIM Germany data or estimated. Alternative stand positions and the de-icing pads not used. Procedures after the VATSIM Germany airport page. Not for real-world navigation.',
  runways: [
    {
      name: '08L/26R',
      widthM: 45,
      lengthM: 3600,
      ends: [
        // AIP: ILS CAT II / III (Z and Y) or LOC and RNP on all four runway ends.
        { name: '08L', threshold: THR_08L, end: THR_08L, elevationFt: 417, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '26R', threshold: THR_26R, end: THR_26R, elevationFt: 447, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
    {
      name: '08R/26L',
      widthM: 60,
      lengthM: 3600,
      ends: [
        { name: '08R', threshold: THR_08R, end: THR_08R, elevationFt: 427, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '26L', threshold: THR_26L, end: THR_26L, elevationFt: 469, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  pavement: built.pavement,
  // One Tower for both runways (AIP: 121.105 south, 125.955 north; cross-coupled when one controller works both).
  stations: [
    { callsign: 'EDDP_DEL', type: 'DEL', name: 'Leipzig Delivery', frequency: '121.680' },
    { callsign: 'EDDP_GND', type: 'GND', name: 'Leipzig Ground', frequency: '121.805' },
    { callsign: 'EDDP_TWR', type: 'TWR', name: 'Leipzig Tower', frequency: '121.105' },
    { callsign: 'EDDP_APP', type: 'APP', name: 'Muenchen Radar', frequency: '126.065' },
    { callsign: 'EDDP_ATIS', type: 'ATIS', name: 'Leipzig Information', frequency: '123.955' },
  ],
  // Declared distances: AIP AD 2.13. Exits: rapid where the AIP has rapid exit indicator lights (RETIL).
  runwayOps: [
    {
      runway: '26R',
      departureEntries: [
        { holdingPoint: 'A9', intersection: 'A9', fullLength: true, toraM: 3600 },
        { holdingPoint: 'A8', intersection: 'A8', fullLength: true, toraM: 3600 },
        { holdingPoint: 'A7', intersection: 'A7', fullLength: false, toraM: 2450 },
        { holdingPoint: 'A6', intersection: 'A6', fullLength: false, toraM: 1850 },
        { holdingPoint: 'A5', intersection: 'A5', fullLength: false, toraM: 1745 },
      ],
      exits: [
        exitVia(built, 'A5', 'HP.6139515910'),
        exitVia(built, 'A4', 'HP.6139515887', { rapid: true }),
        exitVia(built, 'A3', 'HP.6139515775'),
        exitVia(built, 'A2', 'HP.6139515885'),
        exitVia(built, 'A1', 'HP.6139515886'),
      ],
      // Departures from apron 1 east on N to the bridges E7 / E8, arrivals from the west on W1 (VATSIM); on the south
      // side departures east on T.
      flows: [
        { taxiway: 'N', direction: 'east' },
        { taxiway: 'T', direction: 'east' },
      ],
    },
    {
      runway: '26L',
      departureEntries: [
        { holdingPoint: 'S10', intersection: 'S10', fullLength: true, toraM: 3600 },
        { holdingPoint: 'S9', intersection: 'S9', fullLength: false, toraM: 3270 },
        { holdingPoint: 'H8', intersection: 'H8', fullLength: false, toraM: 2885 },
        { holdingPoint: 'S8', intersection: 'S8', fullLength: false, toraM: 2850 },
        { holdingPoint: 'H7', intersection: 'H7', fullLength: false, toraM: 2760 },
        { holdingPoint: 'S7', intersection: 'S7', fullLength: false, toraM: 2725 },
        { holdingPoint: 'S6', intersection: 'S6', fullLength: false, toraM: 2250 },
        { holdingPoint: 'H5', intersection: 'H5', fullLength: false, toraM: 1895 },
        { holdingPoint: 'S5', intersection: 'S5', fullLength: false, toraM: 1895 },
      ],
      exits: [
        exitVia(built, 'S5', 'HP.6139515751'),
        exitVia(built, 'H5', 'HP.6139515753'),
        exitVia(built, 'S4', 'HP.6139515727', { rapid: true }),
        exitVia(built, 'S3', 'HP.2694400171', { rapid: true }),
        exitVia(built, 'S2', 'HP.6139515278'),
        exitVia(built, 'S1', 'HP.6139515715'),
      ],
      // Departures from apron 1 east on N to the bridges E7 / E8, arrivals from the west on W1 (VATSIM); on the south
      // side departures east on T.
      flows: [
        { taxiway: 'N', direction: 'east' },
        { taxiway: 'T', direction: 'east' },
      ],
    },
    {
      runway: '08L',
      departureEntries: [
        { holdingPoint: 'A1', intersection: 'A1', fullLength: true, toraM: 3600 },
        { holdingPoint: 'A2', intersection: 'A2', fullLength: true, toraM: 3600 },
        { holdingPoint: 'A3', intersection: 'A3', fullLength: false, toraM: 2450 },
        { holdingPoint: 'A4', intersection: 'A4', fullLength: false, toraM: 1850 },
        { holdingPoint: 'A5', intersection: 'A5', fullLength: false, toraM: 1745 },
      ],
      exits: [
        exitVia(built, 'A5', 'HP.6139515910'),
        exitVia(built, 'A6', 'HP.6139515909', { rapid: true }),
        exitVia(built, 'A7', 'HP.6139515903'),
        exitVia(built, 'A8', 'HP.2704441362'),
        exitVia(built, 'A9', 'HP.6139515899'),
      ],
      // Departures from apron 1 west on N to W1, arrivals from the bridges E7 / E8; departures west on T.
      flows: [
        { taxiway: 'N', direction: 'west' },
        { taxiway: 'T', direction: 'west' },
      ],
    },
    {
      runway: '08R',
      departureEntries: [
        { holdingPoint: 'S1', intersection: 'S1', fullLength: true, toraM: 3600 },
        { holdingPoint: 'H1', intersection: 'H1', fullLength: true, toraM: 3600 },
        { holdingPoint: 'S2', intersection: 'S2', fullLength: false, toraM: 3270 },
        { holdingPoint: 'S3', intersection: 'S3', fullLength: false, toraM: 2450 },
        { holdingPoint: 'S4', intersection: 'S4', fullLength: false, toraM: 1850 },
        { holdingPoint: 'H5', intersection: 'H5', fullLength: false, toraM: 1595 },
        { holdingPoint: 'S5', intersection: 'S5', fullLength: false, toraM: 1595 },
      ],
      exits: [
        exitVia(built, 'H5', 'HP.6139515753'),
        exitVia(built, 'S5', 'HP.6139515751'),
        exitVia(built, 'S6', 'HP.6139515740', { rapid: true }),
        exitVia(built, 'S7', 'HP.6139515739'),
        exitVia(built, 'H7', 'HP.6139515755'),
        exitVia(built, 'S8', 'HP.6139515738'),
        exitVia(built, 'H8', 'HP.6139515757'),
        exitVia(built, 'S9', 'HP.6139515737'),
        exitVia(built, 'S10', 'HP.6139515736'),
      ],
      // Departures from apron 1 west on N to W1, arrivals from the bridges E7 / E8; departures west on T.
      flows: [
        { taxiway: 'N', direction: 'west' },
        { taxiway: 'T', direction: 'west' },
      ],
    },
  ],
  // Both runways for take-offs and landings; dependent parallel approaches, independent departures (AIP AD 2.22).
  parallelRunways: [
    { ends: ['26R', '26L'], approaches: 'dependent', aprons: APRONS, largeAircraft: LARGE },
    { ends: ['08L', '08R'], approaches: 'dependent', aprons: APRONS, largeAircraft: LARGE },
  ],
  sids: SID_FIXES.flatMap(([q, e, s, n, fix, towards, frequency]) =>
    (
      [
        [q, '08L'],
        [e, '08R'],
        [s, '26L'],
        [n, '26R'],
      ] as [string, string][]
    ).map(([name, runway]) => ({ name, runway, fix, towards, ...(frequency ? { frequency } : {}) })),
  ),
  // A-CDM and datalink clearances (AIP AD 2.20 11, VATSIM).
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'acdm', 'dcl', 'loc', 'gp'],
  traffic: {
    source: 'Leipzig/Halle Airport route network 2026 (Wikipedia, ADV statistics: about 85,000 movements, 1.4 million t of freight in 2024); operator shares and the cargo share (about two thirds of the movements) estimated',
    rateFactor: 1.1,
    operators: [
      // DHL: European Air Transport (the hub airline), DHL Air UK, AeroLogic; ASL Ireland and Star Air for the network.
      { airline: 'BCS', weight: 30, types: ['A306', 'B752', 'B763', 'A332'], destinations: ['EGNX', 'LEMD', 'LIMC', 'EBBR', 'LFPG', 'EPWA', 'LOWW', 'EKCH', 'ESSA', 'LHBP', 'LROP', 'LTFM', 'OBBI'] },
      { airline: 'DHK', weight: 8 },
      { airline: 'BOX', weight: 6 },
      { airline: 'ABR', weight: 5 },
      { airline: 'SRR', weight: 2 },
      { airline: 'CKS', weight: 2 },
      { airline: 'GTI', weight: 3 },
      { airline: 'PAC', weight: 2 },
      { airline: 'MNB', weight: 2 },
      // Passengers.
      { airline: 'EWG', weight: 6, types: ['A319', 'A320'], destinations: ['LEPA', 'LTAI', 'GCTS', 'LGIR'] },
      { airline: 'RYR', weight: 6, types: ['B738', 'B38M'], destinations: ['EGSS', 'LEPA', 'LEMG', 'LIME'] },
      { airline: 'CFG', weight: 4, types: ['A320', 'A321'], destinations: ['LEPA', 'GCLP', 'HEGN'] },
      { airline: 'SXS', weight: 4, types: ['B738', 'B38M'], destinations: ['LTAI', 'LTBJ'] },
      { airline: 'CAI', weight: 3, types: ['B738'], destinations: ['LTAI', 'HEGN'] },
      { airline: 'PGT', weight: 2, types: ['A20N'], destinations: ['LTFJ'] },
      { airline: 'DLH', weight: 5, types: ['CRJ9', 'A320'], destinations: ['EDDF', 'EDDM'] },
      { airline: 'AUA', weight: 2, types: ['E195', 'DH8D'], destinations: ['LOWW'] },
      { airline: 'THY', weight: 2, types: ['A321', 'B738'], destinations: ['LTFM'] },
      { airline: 'SDR', weight: 2, types: ['A320'], destinations: ['GCFV', 'HEGN'] },
      { airline: 'DCX', weight: 3 },
    ],
  },
  briefing: [
    {
      title: 'Leipzig/Halle in short',
      items: [
        'Two parallel runways 2.1 km apart, **both used for take-offs and landings**: **08L/26R** in the north (45 m wide) and **08R/26L** in the south (60 m). Direction **26** is preferred (up to 5 kt tailwind). The ATIS can also put a single runway in use.',
        'Each aircraft gets the runway of its apron: **apron 1** (terminal) and **apron 3** the northern runway, the cargo aprons **2**, **4** and **5** (DHL hub) the southern one; aircraft of 63 m and more (B747, B777) always the southern one. The SID letter names the runway: N 26R, S 26L, Q 08L, E 08R.',
        'North runway: **C** is the parallel taxiway, **A1-A9** link it to the runway (full length 26R: A9 / A8, 08L: A1 / A2; A4 and A6 rapid exits). **W1** (west) and the bridges **E7 / E8** (east) connect C with apron 1 and taxiway **N** along the terminal.',
        'South runway: **T** and **V** run along its south side, **S1-S10** link them to the runway (full length 26L: S10, 08R: S1; S3 / S4 and S6 rapid exits); from the north **H5, H7, H8** and **H1** (08R, CAT II/III holding point far from the runway - hot spot 1). Apron 4 lies south of V with the taxilanes Z1-Z5.',
        'Approach runs **dependent parallel approaches**: 1.5 NM diagonal between the two finals, departures from the two runways are independent. Arrivals to the other apron cross the other runway: `cross runway 26L`.',
        'SIDs climb to **FL70**: PENEM (north) and ORTAG (west) - Muenchen Radar 126.065; NEVKO, GOLAT (south) and DRN (east) - Muenchen Radar South 126.175.',
      ],
    },
  ],
};
