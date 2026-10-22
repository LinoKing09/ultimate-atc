import type { AirportData } from '../../core/airport/types';
import { EDDK_LAYOUT } from './eddk.layout';
import { buildLayout, exitVia, layoutEdges } from './osmLayout';

/**
 * Cologne/Bonn (EDDK), Konrad Adenauer Airport.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (eddk.layout.ts). Runway data, declared distances, stand positions, taxiway widths and limits: DFS AIP
 * AD 2 EDDK (AIRAC 2026OCT01) with its aerodrome and ground movement charts (facts only). Procedures,
 * frequencies, stand sizes and stand use, runway use: VATSIM Germany Köln/Bonn SOP. See docs/airports/EDDK.md.
 *
 * Three runways, renamed from 14/32 for the magnetic variation: 13L/31R (3815 m, the main runway), 13R/31L
 * (1863 m, code C) and 06/24 (2459 m, crossing both). The simulator uses 13L/31R for all take-offs and
 * landings, as on a normal VATSIM day; 13R/31L and 06/24 are drawn and crossed: departures 31R and arrivals
 * vacating 13L at A2 / A1 cross runway 06/24 on A next to the reference point (hot spot 1).
 *
 * Simplifications: everything south-west of runway 13R/31L (taxiways P, C and Z1, the military ramps, the
 * maintenance apron U), taxiway D east of 13L/31R to the 24 end and apron L, and the taxilanes K1-K3 of
 * apron V (under construction, no stands) are drawn but not used. The coloured guide lines on M and TXL-N
 * (blue / orange, for parallel taxiing up to 36 m) are taxiways of their own (M BLUE, N ORANGE, ...), blue
 * outbound and orange inbound. Stands: the AIP positions of aprons A-F and W with lead-in lines from OSM; sizes
 * after the VATSIM Germany stand data. No military, GA or light aircraft traffic.
 */

/** South-west of runway 13R/31L: P, C, Z1, the military ramps and apron U (drawn only). */
const SOUTH_WEST: [number, number][] = [[50.87151, 7.1199], [50.85784, 7.1397], [50.85, 7.145], [50.845, 7.145], [50.845, 7.105], [50.88, 7.105]];
/** North-east of runway 13L/31R between the thresholds: D to the 24 end and apron L (drawn only). */
const NORTH_EAST: [number, number][] = [[50.87162, 7.14189], [50.86151, 7.15654], [50.87061, 7.17234], [50.88072, 7.15769]];
/** The guide lines for parallel taxiing on M and TXL-N (AIP AD 2.20: up to 36 m). */
const COLOURED = layoutEdges(EDDK_LAYOUT, { names: ['M BLUE', 'M ORANGE', 'TL-N BLUE', 'TL-N ORANGE'] });
/** OSM still calls P (south of 13R/31L) B. */
const P_EDGES = layoutEdges({ ...EDDK_LAYOUT, edges: EDDK_LAYOUT.edges.filter((e) => e[2] === 'B') }, { inside: [SOUTH_WEST] });

const C = 36;
/**
 * Stands of aprons A-F and W: [designator, apron, largest wingspan (m), pushback, lead-in node, lat, lon] - the
 * position is the AIP AD 2.8 checkpoint, the lead-in node the OSM taxilane node it starts from. Sizes after the
 * VATSIM Germany stand data (code C 36 m, D 52 m, E 65 m, F 80 m). A25-A35 (odd) are nose-out positions.
 */
const STANDS: [string, string, number, boolean, string, number, number][] = [
  ['A01', 'A', 65, true, 'TWB.1', 50.874878, 7.122372],
  ['A03', 'A', 65, true, 'TL-L.15', 50.875214, 7.121356],
  ['A05', 'A', 65, true, 'TL-L.11', 50.875567, 7.120286],
  ['A07', 'A', 65, true, 'TL-L.7', 50.875897, 7.119294],
  ['A10', 'A', 36, true, 'TL-L.20', 50.874811, 7.122883],
  ['A11', 'A', 65, true, 'TL-L.19', 50.874775, 7.122639],
  ['A12', 'A', 36, true, 'TL-L.18', 50.874911, 7.122317],
  ['A14', 'A', 36, true, 'TL-L.17', 50.875058, 7.121789],
  ['A16', 'A', 36, true, 'TL-L.15', 50.875253, 7.121297],
  ['A17', 'A', 65, true, 'TL-L.14', 50.875344, 7.120936],
  ['A18', 'A', 36, true, 'TL-L.13', 50.875492, 7.120847],
  ['A20', 'A', 36, true, 'TL-L.11', 50.875597, 7.120256],
  ['A21', 'A', 65, true, 'TL-L.10', 50.875633, 7.120072],
  ['A22', 'A', 36, true, 'TL-L.9', 50.875839, 7.119808],
  ['A23', 'A', 65, true, 'TL-L.8', 50.876053, 7.119247],
  ['A24', 'A', 36, true, 'TL-L.7', 50.876083, 7.119361],
  ['A25', 'A', 36, false, 'TL-L.7', 50.876331, 7.119681],
  ['A26', 'A', 36, true, 'TL-L.4', 50.876117, 7.118917],
  ['A27', 'A', 36, false, 'TL-L.5', 50.876461, 7.1192],
  ['A28', 'A', 36, true, 'TL-L.2', 50.876189, 7.118442],
  ['A29', 'A', 36, false, 'TL-L.4', 50.876469, 7.11865],
  ['A30', 'A', 36, true, 'TL-L.2', 50.877281, 7.118092],
  ['A31', 'A', 36, false, 'TL-L.2', 50.876994, 7.118394],
  ['A32', 'A', 36, true, 'TL-L.3', 50.877328, 7.118708],
  ['A33', 'A', 36, false, 'TL-L.4', 50.877003, 7.118964],
  ['A34', 'A', 36, true, 'TL-L.5', 50.877331, 7.119325],
  ['A35', 'A', 36, false, 'TL-L.6', 50.877003, 7.119539],
  ['B10', 'B', 36, true, '?/A7', 50.878356, 7.124408],
  ['B11', 'B', 65, true, '?.14', 50.878286, 7.124189],
  ['B12', 'B', 36, true, '?.13', 50.878056, 7.124014],
  ['B14', 'B', 36, true, '?.12', 50.877697, 7.123886],
  ['B16', 'B', 36, true, 'TWB.6', 50.877342, 7.123767],
  ['B17', 'B', 65, true, 'TWB.5', 50.877111, 7.123586],
  ['B18', 'B', 36, true, '?/TWB', 50.876969, 7.123717],
  ['B20', 'B', 36, true, 'TWB.4', 50.876497, 7.123458],
  ['B21', 'B', 65, true, 'TWB.3', 50.876686, 7.123286],
  ['B22', 'B', 36, true, 'TWB.2', 50.876139, 7.123275],
  ['B23', 'B', 65, true, 'TL-L.17', 50.876589, 7.123086],
  ['B24', 'B', 36, true, 'TL-L.16', 50.876428, 7.123042],
  ['B26', 'B', 36, true, 'TL-L.14', 50.876617, 7.122444],
  ['B27', 'B', 52, true, 'TL-L.14', 50.876708, 7.122497],
  ['B28', 'B', 36, true, 'TL-L.13', 50.876914, 7.122033],
  ['B29', 'B', 52, true, 'TL-L.14', 50.877194, 7.121839],
  ['B30', 'B', 36, true, 'TL-L.12', 50.87725, 7.1217],
  ['C01', 'C', 36, true, '?.17', 50.879239, 7.123056],
  ['C02', 'C', 36, true, 'M BLUE.1', 50.879717, 7.123611],
  ['C03', 'C', 36, true, 'M BLUE.2', 50.879592, 7.12405],
  ['C04', 'C', 36, true, 'M BLUE.4', 50.879314, 7.124422],
  ['C05', 'C', 36, true, 'M BLUE.3', 50.879092, 7.124786],
  ['C06', 'C', 36, true, 'A7.6', 50.878753, 7.124456],
  ['C10', 'C', 36, true, '?.17', 50.8798, 7.121886],
  ['C12', 'C', 36, true, '?.17', 50.880233, 7.1222],
  ['C14', 'C', 36, true, '?.18', 50.880428, 7.122464],
  ['C50', 'C', 65, true, 'A7.7', 50.878725, 7.124483],
  ['D10', 'D', 36, true, 'TL-N BLUE.11', 50.880503, 7.1218],
  ['D11', 'D', 52, true, 'M.3', 50.880419, 7.121428],
  ['D12', 'D', 36, true, 'TL-N BLUE.10', 50.880692, 7.121269],
  ['D14', 'D', 36, true, 'TL-N BLUE.9', 50.880983, 7.120864],
  ['D15', 'D', 65, true, 'M/TL-N CENTER', 50.880889, 7.120483],
  ['D16', 'D', 36, true, 'TL-N BLUE.8', 50.881136, 7.120297],
  ['D18', 'D', 36, true, '?/TL-N BLUE.2', 50.881436, 7.1199],
  ['D19', 'D', 65, true, 'TL-N CENTER.1', 50.881347, 7.119514],
  ['D20', 'D', 36, true, 'TL-N BLUE.7', 50.881633, 7.119383],
  ['D22', 'D', 36, true, 'TL-N BLUE.6', 50.881911, 7.118958],
  ['D23', 'D', 65, true, 'TL-N CENTER.3', 50.881864, 7.118631],
  ['D24', 'D', 36, true, 'TL-N BLUE.5', 50.882133, 7.118472],
  ['D26', 'D', 36, true, 'TL-N BLUE.4', 50.882319, 7.118122],
  ['D28', 'D', 36, true, 'TL-N BLUE.2', 50.882206, 7.117706],
  ['D30', 'D', 36, true, '?.30', 50.882686, 7.1159],
  ['D32', 'D', 36, true, '?.31', 50.883164, 7.116044],
  ['D34', 'D', 36, true, 'TL-N BLUE.1', 50.883425, 7.116744],
  ['D36', 'D', 36, true, 'TL-N BLUE.3', 50.883478, 7.117319],
  ['D38', 'D', 36, true, 'TL-N ORANGE.9', 50.883647, 7.117839],
  ['D40', 'D', 36, true, 'M/TL-N ORANGE', 50.883697, 7.118417],
  ['D42', 'D', 36, true, 'TL-N ORANGE.6', 50.883881, 7.118931],
  ['D50', 'D', 36, true, 'TL-N ORANGE.5', 50.883831, 7.119831],
  ['D51', 'D', 52, true, 'TL-N CENTER.4', 50.883736, 7.119972],
  ['D52', 'D', 36, true, 'TL-N ORANGE.4', 50.883536, 7.120225],
  ['D53', 'D', 52, true, 'TL-N CENTER.2', 50.883353, 7.120567],
  ['D54', 'D', 36, true, 'TL-N ORANGE.3', 50.883236, 7.120619],
  ['D56', 'D', 36, true, 'TL-N ORANGE.2', 50.883011, 7.121114],
  ['D57', 'D', 52, true, '?/TL-N CENTER', 50.883031, 7.121242],
  ['D58', 'D', 36, true, 'TL-N ORANGE.1', 50.882847, 7.121678],
  ['D60', 'D', 36, true, 'M ORANGE/TL-N ORANGE', 50.882558, 7.122103],
  ['D62', 'D', 36, true, 'M ORANGE.1', 50.882294, 7.122553],
  ['D64', 'D', 36, true, 'M ORANGE.2', 50.882156, 7.123117],
  ['E09', 'E', 65, true, 'A.1', 50.876628, 7.125981],
  ['E10', 'E', 52, true, 'A.2', 50.876708, 7.126258],
  ['E12', 'E', 52, true, 'A.3', 50.876314, 7.126831],
  ['E13', 'E', 65, true, 'A.4', 50.876172, 7.126719],
  ['E14', 'E', 52, true, 'A.5', 50.875883, 7.127456],
  ['E15', 'E', 65, true, 'A.6', 50.875692, 7.127417],
  ['E16', 'E', 52, true, 'A.7', 50.875489, 7.128025],
  ['E17', 'E', 65, true, 'A.8', 50.875211, 7.128111],
  ['E20', 'E', 52, true, 'A.9', 50.875094, 7.128597],
  ['E21', 'E', 65, true, 'A.10', 50.874731, 7.128808],
  ['E22', 'E', 52, true, 'A.11', 50.8747, 7.129167],
  ['E23', 'E', 65, true, 'A.12', 50.87425, 7.129503],
  ['E24', 'E', 52, true, 'A.13', 50.874308, 7.129739],
  ['E30', 'E', 52, true, 'A.14', 50.873914, 7.130311],
  ['E31', 'E', 80, true, 'A.15', 50.873719, 7.130272],
  ['E32', 'E', 52, true, 'A.16', 50.873519, 7.130881],
  ['E33', 'E', 80, true, 'A.17', 50.873172, 7.131067],
  ['E34', 'E', 52, true, 'A/A4', 50.873125, 7.131453],
  ['E35', 'E', 80, true, 'A.18', 50.872675, 7.131789],
  ['E36', 'E', 52, true, 'A.19', 50.872731, 7.132025],
  ['E40', 'E', 52, true, 'A.20', 50.872336, 7.132594],
  ['E41', 'E', 80, true, 'A.21', 50.872144, 7.132558],
  ['E42', 'E', 52, true, 'A.22', 50.871942, 7.133167],
  ['E43', 'E', 80, true, 'A.23', 50.871594, 7.13335],
  ['E44', 'E', 52, true, 'A.24', 50.871547, 7.133739],
  ['E45', 'E', 80, true, 'A.25', 50.871097, 7.134072],
  ['E46', 'E', 52, true, 'A.26', 50.871153, 7.134308],
  ['F17', 'F', 80, true, 'A.26', 50.870492, 7.134964],
  ['F19', 'F', 80, true, 'A.27', 50.870003, 7.135678],
  ['F20', 'F', 52, true, 'A.27', 50.86965, 7.136461],
  ['F21', 'F', 80, true, 'A.28', 50.869461, 7.136431],
  ['F22', 'F', 52, true, 'A.29', 50.869256, 7.137031],
  ['F23', 'F', 80, true, 'A.30', 50.868922, 7.137239],
  ['F24', 'F', 52, true, 'A.30', 50.868861, 7.137603],
  ['F25', 'F', 80, true, 'A.31', 50.868425, 7.137958],
  ['F26', 'F', 52, true, 'A.32', 50.868467, 7.138172],
  ['F31', 'F', 80, true, 'A.33', 50.867886, 7.138853],
  ['F32', 'F', 52, true, 'A.34', 50.867525, 7.139658],
  ['F34', 'F', 36, true, 'D.4', 50.867567, 7.138758],
  ['W10', 'W', 52, true, 'T.6', 50.869522, 7.128881],
  ['W12', 'W', 52, true, 'T.7', 50.869175, 7.129436],
  ['W14', 'W', 52, true, 'T.8', 50.868783, 7.129961],
  ['W16', 'W', 52, true, 'T.9', 50.868414, 7.130556],
  ['W18', 'W', 52, true, 'T.10', 50.867969, 7.131111],
  ['W20', 'W', 52, true, 'T.11', 50.867583, 7.131669],
  ['W22', 'W', 52, true, 'T.12', 50.867197, 7.132231],
  ['W24', 'W', 52, true, 'T.13', 50.866808, 7.132792],
  ['W26', 'W', 52, true, 'T.14', 50.866422, 7.133353],
  ['W28', 'W', 52, true, 'D.8', 50.86585, 7.133311],
  ['W30', 'W', 52, true, 'D.7', 50.866261, 7.133825],
  ['W32', 'W', 52, true, 'D.6', 50.866492, 7.134586],
  ['W34', 'W', 52, true, 'D.5', 50.866722, 7.13535],
];

const built = buildLayout(EDDK_LAYOUT, {
  runway: '13L/31R',
  // The charts give no holding point designators; these are the taxiway names used by VATSIM Germany (CAT I
  // positions on 13L/31R). AN / AS are simulator names for the holding points on A north and south of runway
  // 06/24 (hot spot 1), E is the holding point of E at 06/24, T the one of T at the 06 end, B and T2 those at 13R.
  holdingPoints: {
    'HP.2399124700': 'A7',
    'HP.7736951276': 'A5',
    'HP.7735120839': 'A4',
    'HP.321773634': 'A3',
    'HP.7736951247': 'A2',
    'HP.2399129045': 'A1',
    'HP.517017730': 'A',
    'HP.7736951271': { name: 'AN', runway: '06/24' },
    'HP.2399257252': { name: 'AS', runway: '06/24' },
    'HP.7736951272': { name: 'E', runway: '06/24' },
    'HP.7736951108': { name: 'T', runway: '06/24' },
    'HP.1611111802': { name: 'B', runway: '13R/31L' },
    'HP.7737265205': { name: 'T2', runway: '13R/31L' },
  },
  // Chart names: TXL-N is N (its blue / orange guide lines N BLUE / N ORANGE), TXL-L is L, the B bridge
  // (OSM "TWB") is B; TXL-S on apron C is unnamed in OSM.
  taxiwayNames: { 'TL-N CENTER': 'N', 'TL-N BLUE': 'N BLUE', 'TL-N ORANGE': 'N ORANGE', 'TL-L': 'L', TWB: 'B' },
  edgeNames: { '?.17>?.18': 'S', '?.18>?/M BLUE': 'S', ...Object.fromEntries(P_EDGES.map((k) => [k, 'P'])) },
  drawOnly: [...layoutEdges(EDDK_LAYOUT, { inside: [SOUTH_WEST, NORTH_EAST], names: ['K1', 'K2', 'K3', 'L'] })],
  // AIP AD 2.20: B, T and D code E, T2 and S code C, the guide lines up to 36 m; the B bridge north of the T junction
  // up to 52 m (larger aircraft are towed).
  maxWingspanM: { B: 65, T: 65, D: 65, T2: C, S: C },
  edgeMaxWingspanM: { ...Object.fromEntries(COLOURED.map((k) => [k, C])), 'HP.7737265192>TL-L/TWB': 52 },
  // AIP AD 2.8 (the widest value where a taxiway changes).
  widthM: { 'M BLUE': 23, 'M ORANGE': 23, 'N BLUE': 23, 'N ORANGE': 23, A: 23, A1: 22.5, A2: 22.5, A3: 22.5, A4: 30, A5: 22.5, A7: 22.5, B: 23, D: 30, E: 22.5, M: 23, N: 23, L: 23, S: 23, T: 22.5, T2: 22.5 },
  taxilanes: ['N', 'N BLUE', 'N ORANGE', 'L', 'S'],
  stands: STANDS.map(([id, apron, maxWingspanM, pushback, lane, lat, lon]) => ({
    id,
    apron: `Apron ${apron}`,
    maxWingspanM,
    pushback,
    lanes: [lane],
    pos: { lat, lon },
    // Aprons E and F: cargo hub (UPS, FedEx, DHL); W: cargo feeders.
    ...('EFW'.includes(apron) ? { use: 'cargo' as const } : {}),
  })),
});

// Thresholds: AIP AD 2.12 (no displaced thresholds).
const THR_13L = { lat: 50.8804689, lon: 7.1290744 };
const THR_31R = { lat: 50.8551942, lon: 7.1656919 };
const THR_13R = { lat: 50.8708453, lon: 7.1208614 };
const THR_31L = { lat: 50.8585042, lon: 7.1387411 };
const THR_06 = { lat: 50.8601217, lon: 7.1237792 };
const THR_24 = { lat: 50.8696697, lon: 7.1552711 };

/** SIDs of one runway: [name, exit fix, towards (bearing range to the destination), filed only for these destinations]. */
type Sid = [string, string, [number, number] | undefined, string[]?];
// Exit fixes (AIP SID charts, VATSIM Germany SOP): WIPUR north, PODIP north-east, KUMIK east (also the south-bound
// traffic, e.g. to Palma), NVO west; COL only for Frankfurt. Runway 13L: the F SIDs; runway 31R: R for aircraft
// up to 98 t (the RNP NVO 2R), B for heavier ones - filed here for the long-haul freighters.
const LONG_HAUL_WEST = ['KSDF', 'KPHL', 'KMEM'];
const LONG_HAUL_EAST = ['VOBL', 'ZGGG'];
const SIDS: Record<string, Sid[]> = {
  '13L': [
    ['WIPUR1F', 'WIPUR', [330, 15]],
    ['PODIP9F', 'PODIP', [15, 70]],
    ['KUMIK8F', 'KUMIK', [70, 205]],
    ['NVO3F', 'NVO', [205, 330]],
    ['COL4F', 'COL', undefined, ['EDDF']],
  ],
  '31R': [
    ['WIPUR1R', 'WIPUR', [330, 15]],
    ['PODIP1R', 'PODIP', [15, 70]],
    ['KUMIK1R', 'KUMIK', [70, 205]],
    ['NVO2R', 'NVO', [205, 330]],
    ['COL1R', 'COL', undefined, ['EDDF']],
    ['NVO3B', 'NVO', undefined, LONG_HAUL_WEST],
    ['KUMIK1B', 'KUMIK', undefined, LONG_HAUL_EAST],
  ],
};

export const EDDK: AirportData = {
  icao: 'EDDK',
  name: 'Cologne/Bonn',
  city: 'Cologne',
  country: 'Germany',
  fir: 'EDGG',
  // AIP AD 2.2: 4 m north of the 06/24 centre line, 1469 m from threshold 06.
  arp: { lat: 50.865917, lon: 7.142744 },
  elevationFt: 300,
  // AIP: 3.2° E (2024.04), +0.2° per year.
  magneticVariation: 3.7,
  timeZone: 'Europe/Berlin',
  // Runway 31 is preferred (up to 5 kt tailwind, VATSIM SOP); westerly winds prevail (estimate).
  wind: { primaryShare: 0.65, primary: [200, 340], secondary: [20, 160] },
  // Open 24 hours (cargo hub); the night rules of AIP AD 2.20 limit noisy aircraft and the runways 13R / 31L, 06
  // and 24 - not modelled.
  transitionAltitudeFt: 5000,
  // Every SID climbs to 5000 ft (VATSIM SOP, AIP SID charts).
  initialClimbFt: 5000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway data, declared distances, stand positions, taxiway widths and limits from the DFS AIP (facts only), stand sizes after the VATSIM Germany stand data. Runways 13R/31L and 06/24, the military and maintenance areas and apron V drawn but not used. Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '13L/31R',
      widthM: 60,
      lengthM: 3815,
      ends: [
        // AIP: ILS CAT II / III or LOC and RNP for both directions.
        { name: '13L', threshold: THR_13L, end: THR_13L, elevationFt: 229, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '31R', threshold: THR_31R, end: THR_31R, elevationFt: 300, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
    {
      name: '06/24',
      widthM: 45,
      lengthM: 2459,
      ends: [
        { name: '06', threshold: THR_06, end: THR_06, elevationFt: 229, approaches: ['RNP'] },
        { name: '24', threshold: THR_24, end: THR_24, elevationFt: 271, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
    {
      name: '13R/31L',
      widthM: 45,
      lengthM: 1863,
      ends: [
        { name: '13R', threshold: THR_13R, end: THR_13R, elevationFt: 220, approaches: ['RNP'] },
        { name: '31L', threshold: THR_31L, end: THR_31L, elevationFt: 258, approaches: ['RNP'] },
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
    { callsign: 'EDDK_DEL', type: 'DEL', name: 'Koeln/Bonn Delivery', frequency: '121.855' },
    { callsign: 'EDDK_GND', type: 'GND', name: 'Koeln/Bonn Ground', frequency: '121.730' },
    { callsign: 'EDDK_TWR', type: 'TWR', name: 'Koeln/Bonn Tower', frequency: '124.980' },
    { callsign: 'EDDK_APP', type: 'APP', name: 'Langen Radar', frequency: '135.350' },
    { callsign: 'EDDK_ATIS', type: 'ATIS', name: 'Koeln/Bonn Information', frequency: '132.130' },
  ],
  runwayOps: [
    {
      runway: '31R',
      // Declared distances (AIP AD 2.13).
      departureEntries: [
        { holdingPoint: 'A', intersection: 'A', fullLength: true, toraM: 3815 },
        { holdingPoint: 'A1', intersection: 'A1', fullLength: false, toraM: 3586 },
        { holdingPoint: 'A2', intersection: 'A2', fullLength: false, toraM: 2562 },
        { holdingPoint: 'A3', intersection: 'A3', fullLength: false, toraM: 1781 },
      ],
      // A3 is the first rapid exit; vacated aircraft continue on E (VATSIM SOP).
      exits: [exitVia(built, 'A3', 'HP.321773634', { rapid: true }), exitVia(built, 'A4', 'HP.7735120839'), exitVia(built, 'A5', 'HP.7736951276'), exitVia(built, 'A7', 'HP.2399124700')],
      // A outbound (south-east), E inbound (north-west) (VATSIM SOP; "east" = towards the 31R threshold).
      flows: [
        { taxiway: 'A', direction: 'east' },
        { taxiway: 'E', direction: 'west' },
        // Parallel taxiing on the guide lines between Terminal 2 and A7: blue outbound, orange inbound.
        { taxiway: 'N BLUE', direction: 'east' },
        { taxiway: 'M BLUE', direction: 'east' },
        { taxiway: 'N ORANGE', direction: 'west' },
        { taxiway: 'M ORANGE', direction: 'west' },
      ],
    },
    {
      runway: '13L',
      departureEntries: [
        { holdingPoint: 'A7', intersection: 'A7', fullLength: true, toraM: 3815 },
        { holdingPoint: 'A5', intersection: 'A5', fullLength: false, toraM: 3587 },
        { holdingPoint: 'A4', intersection: 'A4', fullLength: false, toraM: 2743 },
        { holdingPoint: 'A3', intersection: 'A3', fullLength: false, toraM: 2121 },
      ],
      // A2 is the rapid exit, A1 and A at the end; then north on A, across runway 06/24.
      exits: [exitVia(built, 'A2', 'HP.7736951247', { rapid: true }), exitVia(built, 'A1', 'HP.2399129045'), exitVia(built, 'A', 'HP.517017730')],
      // Departures and arrivals both taxi north-west on A, E is the alternative (VATSIM SOP).
      flows: [
        { taxiway: 'A', direction: 'west' },
        { taxiway: 'E', direction: 'west' },
        // Parallel taxiing on the guide lines between Terminal 2 and A7: blue outbound, orange inbound.
        { taxiway: 'N BLUE', direction: 'east' },
        { taxiway: 'M BLUE', direction: 'east' },
        { taxiway: 'N ORANGE', direction: 'west' },
        { taxiway: 'M ORANGE', direction: 'west' },
      ],
    },
  ],
  sids: Object.entries(SIDS).flatMap(([runway, list]) =>
    list.map(([name, fix, towards, destinations]) => ({ name, runway, fix, ...(towards ? { towards } : {}), ...(destinations ? { destinations } : {}) })),
  ),
  // A-CDM and datalink clearances as on VATSIM (CDM plugin, Hoppie DCL).
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'acdm', 'dcl', 'loc', 'gp'],
  traffic: {
    source: 'Cologne/Bonn Airport route network 2026 (Wikipedia, ADV statistics: 116,000 movements, 842,000 t freight in 2025); operator shares and the cargo share (about a quarter of the movements) estimated',
    rateFactor: 1,
    operators: [
      { airline: 'EWG', weight: 26, types: ['A319', 'A320', 'A20N'], destinations: ['EDDB', 'EDDH', 'LEPA', 'GCLP', 'GCTS', 'LGAV', 'LIRF', 'LPPT', 'LEBL', 'LHBP'] },
      { airline: 'RYR', weight: 14, types: ['B738', 'B38M'], destinations: ['LEMG', 'LEAL', 'LIPE', 'LPPR', 'GMMX', 'LIME'] },
      { airline: 'CAI', weight: 6, types: ['B738'], destinations: ['LTAI', 'HEGN', 'GCTS'] },
      { airline: 'PGT', weight: 4, types: ['A20N', 'B38M'], destinations: ['LTFJ', 'LTAI'] },
      { airline: 'SXS', weight: 4, types: ['B738', 'B38M'], destinations: ['LTAI', 'LTBJ', 'LTFE'] },
      { airline: 'THY', weight: 3, types: ['A321', 'B738'], destinations: ['LTFM'] },
      { airline: 'DLH', weight: 3, types: ['A320'], destinations: ['EDDM'] },
      { airline: 'AUA', weight: 2, types: ['E195', 'A320'], destinations: ['LOWW'] },
      { airline: 'WZZ', weight: 3, types: ['A320', 'A21N'], destinations: ['LBSF', 'LROP', 'LHBP'] },
      { airline: 'BAW', weight: 2, types: ['A320', 'A20N'], destinations: ['EGLL'] },
      { airline: 'CFG', weight: 2, types: ['A320'], destinations: ['LEPA'] },
      // Cargo: UPS European hub, FedEx hub, DHL (European Air Transport).
      { airline: 'UPS', weight: 13, types: ['B748', 'B744', 'B763', 'A306', 'B752'], destinations: ['KSDF', 'KPHL', 'EGNX', 'LEMD', 'LIMC', 'EPWA'] },
      { airline: 'FDX', weight: 6, types: ['B77L', 'B763'], destinations: ['KMEM', 'LFPG', 'VOBL', 'ZGGG'] },
      { airline: 'BCS', weight: 4, types: ['A306', 'B752'], destinations: ['EDDP', 'EGNX', 'LIMC'] },
    ],
  },
  briefing: [
    {
      title: 'Cologne/Bonn in short',
      items: [
        'Three runways: **13L/31R** (3815 m) for all take-offs and landings in the simulator, **13R/31L** (1863 m, code C, between the aprons and the military area) and **06/24** (2459 m) crossing both - drawn, not used. Runway **31R** is preferred (up to 5 kt tailwind). The runways were renamed from 14/32 for the magnetic variation.',
        'All civil aprons lie between the two parallel runways, north of 06/24: A, B and C at Terminal 1, D at Terminal 2, E and F (cargo hub: UPS, FedEx, DHL) along taxiway A, W (cargo feeders) along T. **A** is the parallel taxiway, **E** a second one between A and the runway.',
        '**Departures 31R** taxi south on A and **cross runway 06/24** next to the reference point (holding points AN / AS - hot spot 1: explicit crossing clearance, `cross runway 24`), then line up at **A** (3815 m) or **A1** (3586 m); intersections A2 (2562 m) and A3 (1781 m). **Departures 13L** line up at **A7** (3815 m) or A5 (3587 m), A4 (2743 m), A3 (2121 m).',
        'Arrivals 31R vacate at **A3** (rapid exit), A4, A5 or A7 and continue north on E (A is outbound, E inbound). Arrivals 13L vacate at **A2** (rapid exit), A1 or A at the end and taxi north on A - across runway 06/24.',
        'Taxilanes: **N** on apron D and **M** from there to A7, each with a yellow centre line (all sizes) and a blue and an orange guide line for two aircraft up to 36 m side by side: **N BLUE / M BLUE** outbound, **N ORANGE / M ORANGE** inbound (`via mike blue`). **L** on apron A, **S** on apron C, **B** over the bridge (up to 52 m) to T. T2 and S are code C.',
        'SIDs climb to 5000 ft: WIPUR (north), PODIP (north-east), KUMIK (east, also south-bound traffic), NVO (west); COL only for Frankfurt. 13L: F SIDs; 31R: R for aircraft up to 98 t, B for heavier ones.',
        'Taxi-in to a stand only behind a follow-me car (AIP; not enforced in the simulator). De-icing on the stand. Open 24 hours - heavy freighters (B747-8, B777F) on the cargo aprons E and F, especially at night.',
      ],
    },
  ],
};
