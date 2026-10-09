import type { AirportData, ExitData, StandData } from '../../core/airport/types';
import { RunwayFrameBuilder } from './builder';

/**
 * Stuttgart (EDDS)
 *
 * Runway end coordinates and elevation: OurAirports (public domain).
 * Frequencies, taxiway designators, holding points and stand numbers: AIP
 * Germany, AD 2 EDDS 2-5 (Aerodrome Chart) and 2-7 (Aerodrome Ground
 * Movement Chart), AMDT 10/26.
 *
 * The geometry was digitised by hand from these charts: positions were
 * measured on the charts and converted into the runway-aligned frame below
 * (accuracy roughly +-10 m). Only the network topology and approximate
 * positions are used - no chart graphics are reproduced. Simplifications:
 * de-icing pads DP1-DP4, run-up areas / holding bays P1-P2, the general
 * aviation apron, the US army airfield and the "A" stands (9A, 24A ...) are
 * not modelled; drive-through stands are modelled as "taxi in from the
 * north lane, taxi out forwards to the south lane".
 *
 * Frame: along = metres from the runway 07 end towards 25 (chart scale:
 * 3345 m runway), lateral = metres north (+) / south (-) of the centreline.
 *
 *   lateral
 *     520   stands 24-29, 30-36                     (nose north, push onto M)
 *     450   stands 9-19 (terminals 1-4)             (nose north, push onto M)
 *  376-481  taxilane M (Apron North), L2 / L3 down to O
 *     430   stands 60-65 (nose south, push onto M); 370 stands 50-56 (M -> N drive-through)
 *     364   stands 71-75 (nose north, push onto N); 311 stands 40-48 (M -> O drive-through)
 *     279   ------------------ taxiway N ------------------
 *     229   taxiway O (west of the "circle" junction)
 *     190   ------------------ taxiway S ------------------
 *      93   holding points K I H G F E D C B A (north)
 *       0   [=================== RUNWAY 07/25 ===================]
 *     -90   holding points Y, W (south)
 *    -262   taxiway R / V (Apron South, stands 100-107 at -327)
 */

const RWY_07_END = { lat: 48.685699462890625, lon: 9.200130462646484 };
const RWY_25_END = { lat: 48.694000244140625, lon: 9.243800163269043 };
// ARP from the aerodrome chart: N 48 41 23.56, E 009 13 19.07
const ARP = { lat: 48.689878, lon: 9.221964 };
const THR_07_DISPLACEMENT = 300;
const CHART_RUNWAY_LENGTH = 3345;
const RWY = '07/25';

const b = new RunwayFrameBuilder(ARP, RWY_07_END, RWY_25_END);
const L = b.length;
/** Chart metres -> builder metres (the chart and the coordinates differ by ~0.3 % in length). */
const K = L / CHART_RUNWAY_LENGTH;

const known = new Set<string>();
/** Creates a node once (later calls with the same id are ignored). */
function n(id: string, along: number, lateral: number, hp?: string): string {
  if (known.has(id)) return id;
  known.add(id);
  b.node(id, along * K, lateral, hp ? { name: hp, runway: RWY } : undefined);
  return id;
}

/** Interpolates the lateral position of a polyline (along-sorted points) at `along`. */
function latOn(pts: [number, number][], along: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, l0] = pts[i];
    const [a1, l1] = pts[i + 1];
    if (along >= a0 && along <= a1) return l0 + ((along - a0) / (a1 - a0)) * (l1 - l0);
  }
  return along < pts[0][0] ? pts[0][1] : pts[pts.length - 1][1];
}

// ======================================================================== runway
const rwy: [string, number][] = [
  ['RWY_K', 16.5],
  ['RWY_I', 325],
  ['RWY_HW', 845],
  ['RWY_G', 1142],
  ['RWY_F', 1450],
  ['RWY_E', 1956],
  ['RWY_D', 2194],
  ['RWY_C', 2464],
  ['RWY_B', 2717],
  ['RWY_A', 3324],
];
for (const [id, a] of rwy) n(id, a, 0);
b.chain(RWY, 'runway', rwy.map(([id]) => id), { widthM: 45 });

// ======================================================================== the "circle" (west junction of N, S, O, K, I, L2)
const CIRCLE = n('CIRCLE', 25, 232);

// ======================================================================== taxiway N (lat 279)
const N_LAT = 279;
const S_LAT = 190;
const nNodes: [string, number][] = [
  ['N_W', 64],
  ['N_H', 571.8],
  ['N_ME', 945],
  ['N_F', 977],
  ['N_G', 1142],
  ['N_E', 1956],
  ['N_D', 2463],
  ['N_B', 2912],
  ['N_END', 3290],
];
// ======================================================================== taxiway S (lat 190)
const sNodes: [string, number][] = [
  ['S_W', 64],
  ['S_H', 612],
  ['S_F', 1024],
  ['S_G', 1142],
  ['S_E', 1956],
  ['S_D', 2463],
  ['S_B', 2912],
];

// ======================================================================== stands
const NORTH = b.frameHeading(-90);
const SOUTH = b.frameHeading(90);
const stands: StandData[] = [];

/** Polyline of taxilane M (Apron North). */
const M_LINE: [number, number][] = [
  [-569, 376],
  [-33, 376],
  [150.6, 437],
  [437, 437],
  [524.6, 481],
  [813.4, 481],
  [936, 445],
];
const mNodes: [string, number][] = [
  ['M_L3', -569],
  ['M_W', -33],
  ['M_L2', -1],
  ['M_D1', 150.6],
  ['M_H', 437],
  ['M_D2', 524.6],
  ['M_D3', 813.4],
  ['M_E', 936],
];
const oNodes: [string, number][] = [
  ['O_L3', -569],
  ['O_E', -33],
];
const vNodes: [string, number][] = [
  ['RV', 16.5],
  ['V_W', 833],
];
const V_LAT = -262;

interface StandSpec {
  id: string;
  along: number;
  span: number;
}

/** Nose-in stand with pushback onto a lane. */
function pushStand(s: StandSpec, apron: string, standLat: number, heading: number, lane: 'M' | 'N' | 'V'): void {
  const laneLat = lane === 'M' ? latOn(M_LINE, s.along) : lane === 'N' ? N_LAT : V_LAT;
  const laneId = `${lane}_${s.id}`;
  n(laneId, s.along, laneLat);
  (lane === 'M' ? mNodes : lane === 'N' ? nNodes : vNodes).push([laneId, s.along]);
  n(`STAND_${s.id}`, s.along, standLat);
  b.chain(s.id, 'stand', [laneId, `STAND_${s.id}`]);
  stands.push({ id: s.id, apron, pos: b.ll(s.along * K, standLat), heading, laneNode: laneId, maxWingspanM: s.span, pushback: true });
}

/** Drive-through stand: taxi in from the north lane, taxi out forwards (nose south) to the south lane. */
function throughStand(s: StandSpec, apron: string, standLat: number, inLane: 'M', outLane: 'O' | 'N'): void {
  const inId = `M_${s.id}`;
  const outId = `${outLane}_${s.id}`;
  n(inId, s.along, latOn(M_LINE, s.along));
  mNodes.push([inId, s.along]);
  n(outId, s.along, outLane === 'O' ? 229 : N_LAT);
  (outLane === 'O' ? oNodes : nNodes).push([outId, s.along]);
  n(`STAND_${s.id}`, s.along, standLat);
  b.chain(s.id, 'stand', [inId, `STAND_${s.id}`], { oneWay: true });
  b.chain(s.id, 'stand', [`STAND_${s.id}`, outId], { oneWay: true });
  void inLane;
  stands.push({ id: s.id, apron, pos: b.ll(s.along * K, standLat), heading: SOUTH, laneNode: inId, maxWingspanM: s.span, pushback: false });
}

// Terminal stands 9-19 (terminals 1-4), nose north
const terminal: StandSpec[] = [
  { id: '9', along: -481.3, span: 36 },
  { id: '10', along: -421.1, span: 36 },
  { id: '11', along: -367.2, span: 36 },
  { id: '12', along: -313.9, span: 36 },
  { id: '13', along: -248.4, span: 36 },
  { id: '14', along: -197.6, span: 36 },
  { id: '15', along: -146.6, span: 36 },
  { id: '16', along: -93.8, span: 36 },
  { id: '17', along: -45.8, span: 36 },
  { id: '18', along: 1.7, span: 36 },
  { id: '19', along: 47.2, span: 36 },
];
for (const s of terminal) pushStand(s, 'Apron North', 453.6, NORTH, 'M');

// Stands 24-29 and 30-36, nose north
const north2: StandSpec[] = [
  { id: '24', along: 121.9, span: 36 },
  { id: '25', along: 176.6, span: 36 },
  { id: '26', along: 223.8, span: 36 },
  { id: '27', along: 270.7, span: 36 },
  { id: '28', along: 318.8, span: 36 },
  { id: '29', along: 389.8, span: 36 },
];
for (const s of north2) pushStand(s, 'Apron North', 517.2, NORTH, 'M');
const north3: StandSpec[] = [
  { id: '30', along: 474.2, span: 36 },
  { id: '31', along: 522.4, span: 36 },
  { id: '32', along: 569.6, span: 36 },
  { id: '33', along: 617.7, span: 36 },
  { id: '34', along: 664.6, span: 36 },
  { id: '35', along: 709.6, span: 36 },
  { id: '36', along: 755.6, span: 36 },
];
for (const s of north3) pushStand(s, 'Apron North', 521.6, NORTH, 'M');

// Stands 60-65, nose south, push onto M
const north4: StandSpec[] = [
  { id: '60', along: 546.4, span: 36 },
  { id: '61', along: 595.5, span: 36 },
  { id: '62', along: 644, span: 36 },
  { id: '63', along: 693.5, span: 36 },
  { id: '64', along: 742.9, span: 36 },
  { id: '65', along: 804.7, span: 36 },
];
for (const s of north4) pushStand(s, 'Apron North', 429.7, SOUTH, 'M');

// Stands 71-75, nose north, push onto N
const north5: StandSpec[] = [
  { id: '71', along: 595.5, span: 36 },
  { id: '72', along: 644, span: 36 },
  { id: '73', along: 693.5, span: 36 },
  { id: '74', along: 742.9, span: 36 },
  { id: '75', along: 792.8, span: 36 },
];
for (const s of north5) pushStand(s, 'Apron North', 364, NORTH, 'N');
// Wide-body positions 71A / 74A overlap 71+72 / 74+75 (multi-aircraft ramp system). The wingtip clearance
// check blocks the overlapped stands automatically while a wide-body is on an A position and vice versa.
pushStand({ id: '71A', along: 619.8, span: 65 }, 'Apron North', 364, NORTH, 'N');
pushStand({ id: '74A', along: 767.9, span: 65 }, 'Apron North', 364, NORTH, 'N');

// Drive-through stands 40-48 (M -> O) and 50-56 (M -> N)
const west: StandSpec[] = [
  { id: '40', along: -485, span: 36 },
  { id: '41', along: -435.3, span: 36 },
  { id: '42', along: -384.9, span: 36 },
  { id: '43', along: -335, span: 36 },
  { id: '45', along: -214, span: 36 },
  { id: '46', along: -165.4, span: 36 },
  { id: '47', along: -116.8, span: 36 },
  { id: '48', along: -68.5, span: 36 },
];
for (const s of west) throughStand(s, 'Apron North', 311.5, 'M', 'O');
const mid: StandSpec[] = [
  { id: '50', along: 111, span: 36 },
  { id: '51', along: 160, span: 36 },
  { id: '52', along: 210.7, span: 36 },
  { id: '53', along: 261.9, span: 36 },
  { id: '54', along: 313.2, span: 36 },
  { id: '55', along: 363.9, span: 36 },
  { id: '56', along: 412.9, span: 36 },
];
for (const s of mid) throughStand(s, 'Apron North', 372.8, 'M', 'N');

// Apron South (cargo) stands 100-107, nose south, push onto V
const south: StandSpec[] = [
  { id: '100', along: 100.6, span: 36 },
  { id: '101', along: 148.9, span: 36 },
  { id: '102', along: 196.8, span: 36 },
  { id: '103', along: 248.3, span: 36 },
  { id: '104', along: 304.6, span: 36 },
  { id: '105', along: 362.3, span: 65 },
  { id: '106', along: 420.9, span: 65 },
  { id: '107', along: 480.5, span: 65 },
];
for (const s of south) pushStand(s, 'Apron South', -327, SOUTH, 'V');

// ======================================================================== lanes
function chainSorted(name: string, kind: 'taxiway' | 'taxilane', list: [string, number][], lat: (a: number) => number, prefix: string[] = [], suffix: string[] = []): void {
  for (const [id, a] of list) n(id, a, lat(a));
  const ids = [...list].sort((p, q) => p[1] - q[1]).map(([id]) => id);
  b.chain(name, kind, [...prefix, ...ids, ...suffix]);
}

chainSorted('N', 'taxiway', nNodes, () => N_LAT, [CIRCLE]);
n('A_TOP', 3324, S_LAT);
b.chain('N', 'taxiway', ['N_END', 'A_TOP']);
chainSorted('S', 'taxiway', sNodes, () => S_LAT, [CIRCLE], ['A_TOP']);
chainSorted('M', 'taxilane', mNodes, (a) => latOn(M_LINE, a));
// Taxilane M east of the H junction (stands 30-36, 60-65) is limited to code C (chart: max. code letter C).
{
  const east = new Set(mNodes.filter(([, a]) => a >= 437).map(([id]) => id));
  for (const e of b.edges) if (e.name === 'M' && east.has(e.from) && east.has(e.to)) e.maxWingspanM = 36;
}
chainSorted('O', 'taxiway', oNodes, () => 229, [], [CIRCLE]);

// L3: west end of O up to M; L2: from M down into the circle
b.chain('L3', 'taxiway', ['O_L3', 'M_L3']);
n('L2_B', -1, 300);
b.chain('L2', 'taxiway', ['M_L2', 'L2_B', CIRCLE]);
// M east end down to N (towards the GA area / exits)
b.chain('M', 'taxilane', ['M_E', 'N_ME'], { maxWingspanM: 36 });

// ======================================================================== connectors to the runway
// K (north) / Y (south) at the 07 end
n('K_CLR', 16.5, 140);
n('K', 16.5, 93, 'K');
n('Y', 16.5, -91, 'Y');
n('Y_CLR', 16.5, -140);
b.chain('K', 'taxiway', [CIRCLE, 'K_CLR', 'K']);
b.chain('K', 'runwayStrip', ['K', 'RWY_K']);
b.chain('Y', 'runwayStrip', ['RWY_K', 'Y']);
b.chain('Y', 'taxiway', ['Y', 'Y_CLR', 'RV']);

// I: angled from the circle to the runway (exit for 25, entry for 07)
n('I_CLR', 128.9, 140);
n('I', 165, 108, 'I');
b.chain('I', 'taxiway', [CIRCLE, 'I_CLR', 'I']);
b.chain('I', 'runwayStrip', ['I', 'RWY_I']);

// H: from Apron North (M) across N and S to the runway; W continues south to V
n('H1', 511, 365);
n('H_CLR', 680.3, 140);
n('H', 724, 108, 'H');
n('W', 840, -89, 'W');
n('W_CLR', 835, -140);
b.chain('H', 'taxiway', ['M_H', 'H1', 'N_H', 'S_H', 'H_CLR', 'H']);
b.chain('H', 'runwayStrip', ['H', 'RWY_HW']);
b.chain('W', 'runwayStrip', ['RWY_HW', 'W']);
b.chain('W', 'taxiway', ['W', 'W_CLR', 'V_W']);

// G (perpendicular) and F (angled exit for 25) cross between S and the runway
// Vacate points sit between the holding point and the F/G crossing, clear of taxiway S.
n('FG_X', 1142, 141);
n('G', 1142, 93, 'G');
n('G_CLR', 1142, 118);
n('F', 1240, 100, 'F');
n('F_CLR', 1187.4, 122);
b.chain('G', 'taxiway', ['N_G', 'S_G', 'FG_X', 'G_CLR', 'G']);
b.chain('G', 'runwayStrip', ['G', 'RWY_G']);
b.chain('F', 'taxiway', ['N_F', 'S_F', 'FG_X', 'F_CLR', 'F']);
b.chain('F', 'runwayStrip', ['F', 'RWY_F']);

// E (perpendicular)
n('E_CLR', 1956, 140);
n('E', 1956, 93, 'E');
b.chain('E', 'taxiway', ['N_E', 'S_E', 'E_CLR', 'E']);
b.chain('E', 'runwayStrip', ['E', 'RWY_E']);

// D (angled exit for 07 / entry for 25) and C (perpendicular) both start at S_D
n('D_CLR', 2413.6, 140);
n('D', 2379, 105, 'D');
n('C_CLR', 2464, 140);
n('C', 2464, 93, 'C');
b.chain('D', 'taxiway', ['N_D', 'S_D', 'D_CLR', 'D']);
b.chain('D', 'runwayStrip', ['D', 'RWY_D']);
b.chain('C', 'taxiway', ['S_D', 'C_CLR', 'C']);
b.chain('C', 'runwayStrip', ['C', 'RWY_C']);

// B (angled exit for 07 / entry for 25)
n('B_CLR', 2859, 140);
n('B', 2822, 105, 'B');
b.chain('B', 'taxiway', ['N_B', 'S_B', 'B_CLR', 'B']);
b.chain('B', 'runwayStrip', ['B', 'RWY_B']);

// A at the 25 end
n('A_CLR', 3324, 140);
n('A', 3324, 93, 'A');
b.chain('A', 'taxiway', ['A_TOP', 'A_CLR', 'A']);
b.chain('A', 'runwayStrip', ['A', 'RWY_A']);

// ======================================================================== south: Z, R, V
n('Z_A', -567, -150);
n('Z_B', -500, -230);
n('R_W', -429, -258);
n('R_1', -200, -258);
b.chain('Z', 'taxiway', ['O_L3', 'Z_A', 'Z_B', 'R_W']);
b.chain('R', 'taxiway', ['R_W', 'R_1', 'RV']);
chainSorted('V', 'taxilane', vNodes, () => V_LAT);

// ======================================================================== runway operations
function exit(name: string, path: string[], rapid = false): ExitData {
  return { name, path, rapid };
}

export const EDDS: AirportData = {
  icao: 'EDDS',
  name: 'Stuttgart',
  city: 'Stuttgart',
  country: 'Germany',
  arp: ARP,
  elevationFt: 1276,
  magneticVariation: 3.5,
  transitionAltitudeFt: 5000,
  // Initial climb used in clearances (simulator value, equal to the transition altitude).
  initialClimbFt: 5000,
  // Stand sizes: code C on Apron North except the wide-body positions 71A / 74A; Apron South 105-107 wide-body.
  dataNotice:
    'Layout digitised by hand from the AIP Germany aerodrome charts (AD 2 EDDS 2-5 / 2-7, AMDT 10/26), accuracy about +-10 m; some areas simplified. Not for real-world navigation.',
  runways: [
    {
      name: RWY,
      widthM: 45,
      lengthM: 3345,
      ends: [
        { name: '07', threshold: b.ll(THR_07_DISPLACEMENT * K, 0), end: b.ll(0, 0), elevationFt: 1267 },
        { name: '25', threshold: b.ll(L, 0), end: b.ll(L, 0), elevationFt: 1181 },
      ],
    },
  ],
  taxiNodes: b.nodes,
  taxiEdges: b.edges,
  stands,
  areas: [
    b.area('Apron North', [
      [-610 * K, 210],
      [60 * K, 210],
      [60 * K, 290],
      [960 * K, 290],
      [960 * K, 545],
      [-610 * K, 545],
    ].map(([a, l]) => [a, l] as [number, number])),
    b.area('General aviation', [
      [960 * K, 300],
      [1260 * K, 300],
      [1260 * K, 430],
      [960 * K, 430],
    ]),
    b.area('Apron South', [
      [-30 * K, -215],
      [560 * K, -215],
      [560 * K, -375],
      [-30 * K, -375],
    ]),
  ],
  buildings: [
    b.area('Terminal 1-3', [
      [-560 * K, 495],
      [-170 * K, 495],
      [-170 * K, 600],
      [-560 * K, 600],
    ]),
    b.area('Terminal 4', [
      [-150 * K, 495],
      [70 * K, 495],
      [70 * K, 590],
      [-150 * K, 590],
    ]),
    b.area('Handling / hangars', [
      [100 * K, 565],
      [790 * K, 565],
      [790 * K, 640],
      [100 * K, 640],
    ]),
    b.area('GA hangars', [
      [990 * K, 440],
      [1250 * K, 440],
      [1250 * K, 500],
      [990 * K, 500],
    ]),
    b.area('Fire station', [
      [1300 * K, 300],
      [1400 * K, 300],
      [1400 * K, 360],
      [1300 * K, 360],
    ]),
    b.area('Airfreight', [
      [60 * K, -390],
      [300 * K, -390],
      [300 * K, -480],
      [60 * K, -480],
    ]),
    b.area('Airfreight 2', [
      [340 * K, -390],
      [560 * K, -390],
      [560 * K, -480],
      [340 * K, -480],
    ]),
    b.area('Tower', [
      [1350 * K, -480],
      [1385 * K, -480],
      [1385 * K, -520],
      [1350 * K, -520],
    ]),
  ],
  stations: [
    { callsign: 'EDDS_DEL', type: 'DEL', name: 'Stuttgart Delivery', frequency: '121.915' },
    { callsign: 'EDDS_GND', type: 'GND', name: 'Stuttgart Ground', frequency: '118.605' },
    { callsign: 'EDDS_TWR', type: 'TWR', name: 'Stuttgart Tower', frequency: '118.805' },
    { callsign: 'EDDS_APP', type: 'APP', name: 'Langen Radar', frequency: '119.200' },
    { callsign: 'EDDS_ATIS', type: 'ATIS', name: 'Stuttgart Information', frequency: '126.130' },
  ],
  runwayOps: [
    {
      runway: '25',
      departureEntries: [
        { holdingPoint: 'A', intersection: 'A', fullLength: true },
        { holdingPoint: 'B', intersection: 'B', fullLength: false },
        { holdingPoint: 'C', intersection: 'C', fullLength: false },
        { holdingPoint: 'D', intersection: 'D', fullLength: false },
      ],
      exits: [
        exit('F', ['RWY_F', 'F', 'F_CLR'], true),
        exit('E', ['RWY_E', 'E', 'E_CLR']),
        exit('G', ['RWY_G', 'G', 'G_CLR']),
        exit('H', ['RWY_HW', 'H', 'H_CLR'], true),
        exit('W', ['RWY_HW', 'W', 'W_CLR']),
        exit('I', ['RWY_I', 'I', 'I_CLR'], true),
        exit('K', ['RWY_K', 'K', 'K_CLR']),
        exit('Y', ['RWY_K', 'Y', 'Y_CLR']),
      ],
      // N eastbound (departures from the aprons to A), S westbound (arrivals from the exits to the aprons):
      // departures never cross S and arrivals never cross N.
      flows: [
        { taxiway: 'N', direction: 'east' },
        { taxiway: 'S', direction: 'west' },
      ],
    },
    {
      runway: '07',
      departureEntries: [
        { holdingPoint: 'K', intersection: 'K', fullLength: true },
        { holdingPoint: 'Y', intersection: 'Y', fullLength: true },
        { holdingPoint: 'I', intersection: 'I', fullLength: false },
        { holdingPoint: 'H', intersection: 'H', fullLength: false },
        { holdingPoint: 'W', intersection: 'W', fullLength: false },
      ],
      exits: [
        exit('G', ['RWY_G', 'G', 'G_CLR']),
        exit('E', ['RWY_E', 'E', 'E_CLR']),
        exit('D', ['RWY_D', 'D', 'D_CLR'], true),
        exit('C', ['RWY_C', 'C', 'C_CLR']),
        exit('B', ['RWY_B', 'B', 'B_CLR'], true),
        exit('A', ['RWY_A', 'A', 'A_CLR']),
      ],
      // Same rule as for 25: N eastbound, S westbound. Departures to K use S (or M / L2 / the circle),
      // arrivals from the eastern exits taxi west on S.
      flows: [
        { taxiway: 'N', direction: 'east' },
        { taxiway: 'S', direction: 'west' },
      ],
    },
  ],
  // Sample SIDs (placeholders, not the published procedures).
  sids: [
    { name: 'LBU2W', runway: '25', fix: 'LBU' },
    { name: 'SUL2W', runway: '25', fix: 'SUL' },
    { name: 'RIXED2W', runway: '25', fix: 'RIXED' },
    { name: 'KRH2W', runway: '25', fix: 'KRH' },
    { name: 'LBU2E', runway: '07', fix: 'LBU' },
    { name: 'SUL2E', runway: '07', fix: 'SUL' },
    { name: 'RIXED2E', runway: '07', fix: 'RIXED' },
    { name: 'KRH2E', runway: '07', fix: 'KRH' },
  ],
  // Traffic mix: shares of the operators at Stuttgart (passengers in scheduled and charter traffic, airport annual
  // report 2024 as quoted in the press; Eurowings about 40 % in 2025 as well) and the busiest destinations of 2025.
  // Passenger shares are used as movement shares. Smaller operators (Corendon, AJet, Croatia ...) are not modelled.
  traffic: {
    source: 'Stuttgart Airport annual report 2024 (airline passenger shares, via press reports) and top destinations 2025',
    operators: [
      {
        airline: 'EWG',
        weight: 39.7,
        types: ['A319', 'A320', 'A320', 'A20N', 'A21N'],
        destinations: ['LEPA', 'LEPA', 'LEPA', 'BKPR', 'BKPR', 'LEBL', 'LEBL', 'EDDB', 'EDDB', 'EDDH', 'EDDH', 'EDDL', 'LTAI', 'EIDW', 'EGCC', 'ESSA', 'LMML', 'LQMO', 'LDSP', 'LDZA', 'LYBE', 'LGAV', 'LPPT', 'LHBP', 'EKCH', 'GCLP', 'LIRF'],
      },
      { airline: 'SXS', weight: 8.3, types: ['B738', 'B38M', 'B38M'], destinations: ['LTAI', 'LTAI', 'LTAI', 'LTBJ', 'LTBS', 'LTAU', 'LTFE'] },
      { airline: 'TUI', weight: 5.8, types: ['B738', 'B38M'], destinations: ['LEPA', 'LEPA', 'GCFV', 'GCTS', 'GCRR', 'GCLP', 'HEGN', 'LGIR', 'LTAI'] },
      { airline: 'PGT', weight: 5.4, types: ['A20N', 'A21N', 'B38M'], destinations: ['LTFJ', 'LTFJ', 'LTFJ', 'LTAI', 'LTBJ'] },
      { airline: 'DLH', weight: 2.4, types: ['A319', 'A320', 'A20N'], destinations: ['EDDF', 'EDDM'] },
      { airline: 'CLH', weight: 3.0, types: ['CRJ9', 'E195'], destinations: ['EDDM', 'EDDF'] },
      { airline: 'THY', weight: 4.7, types: ['A321', 'A321', 'A21N', 'B738', 'A332'], destinations: ['LTFM'] },
      { airline: 'CFG', weight: 3.9, types: ['A320', 'A321', 'A21N'], destinations: ['LEPA', 'LEPA', 'GCTS', 'GCRR', 'GCFV', 'HEGN', 'LTAI', 'LGKO', 'LGIR'] },
      { airline: 'BAW', weight: 3.7, types: ['A319', 'A320', 'A20N'], destinations: ['EGLL'] },
      { airline: 'KLC', weight: 2.2, types: ['E190', 'E295'], destinations: ['EHAM'] },
      { airline: 'AFR', weight: 1.2, types: ['A319', 'A320'], destinations: ['LFPG'] },
      { airline: 'AUA', weight: 1.0, types: ['DH8D', 'E195'], destinations: ['LOWW'] },
      // Business aviation (registration callsigns).
      { airline: 'DCX', weight: 3.0 },
    ],
  },
  // Local procedures as modelled in the simulator (see docs/airports/EDDS.md).
  // Flows and planning tips are simulator conventions, not published procedures.
  briefing: [
    {
      title: 'Your job as Stuttgart Ground',
      positions: ['GND'],
      items: [
        'You own the aprons and taxiways: pushback and start-up, taxi out to the runway holding points, taxi in to the stands.',
        'Departures get their IFR clearance and start-up from Delivery 121.915 (run by the simulator unless you staff it too). They call you for pushback (or taxi from a drive-through stand); with A-CDM on, at their TSAT.',
        'Hand departures over to Tower 118.805 at or shortly before the holding point: `contact tower 118.805`. Tower lines them up and clears them for take-off.',
        'Arrivals are with Tower until they have vacated the runway. They call you from the vacate point: give them a stand and a route.',
        'The runway belongs to Tower. Nobody enters it without a clearance; aircraft that must cross (south side) stop at the runway holding point and ask you: `cross runway 25`.',
      ],
    },
    {
      title: 'Your job as Stuttgart Tower',
      positions: ['TWR'],
      items: [
        'You own the runway 07/25 and its protected area. Ground (run by the simulator) brings departures to the holding points and hands them to you; Approach (Langen Radar) brings arrivals onto final about 9 NM out.',
        'Departures call `ready for departure` at the holding point. `line up and wait runway 25` (also as soon as a landing aircraft has passed: `behind landing EWG7TK, line up and wait behind`), then `wind 250 degrees 8 knots, runway 25, cleared for take-off`. Only one aircraft may use the runway at a time.',
        'Departure spacing (measured from airborne to start of roll): 2 minutes behind a heavy (3 from an intersection), 2 minutes on the same SID fix, 1 minute on diverging SIDs. The take-off menu shows how long you still have to wait.',
        'After take-off the crew asks for a frequency change: `contact Langen Radar 119.200`. A departure that leaves the control zone on your frequency costs points.',
        'Arrivals call on final (`ILS approach runway 25`). Clear them to land in time: `wind 250 degrees 8 knots, runway 25, cleared to land` - without a clearance they go around at 0.5 NM. `continue approach` if the runway is not free yet, `go around` if it will not be. `vacate via E` asks for a particular exit.',
        'After vacating, arrivals report `runway vacated`: hand them to Ground with `contact ground 118.605`. Keep the vacate points free - Tower cannot use an exit whose vacate point is still occupied.',
        'Runway crossings (aircraft from or to the south apron) are yours: Ground hands them over at the runway holding point; `cross runway 25` only when nobody is landing or taking off, then `contact ground` once they report the runway vacated.',
      ],
    },
    {
      title: 'Your job as Stuttgart Delivery',
      positions: ['DEL'],
      items: [
        'Every departure calls you about 10 minutes before off-block for its IFR clearance (about 4 in 10 crews request it by datalink instead - DCL in the request column). Phraseology: `cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312`.',
        'Clearance limit is the destination; the SID is the one of the runway in use that leads to the first fix of the flight plan (the aircraft menu lists it first). Initial climb 5000 ft (simulator value). Squawk: the next free code (the menu picks one).',
        'Listen to the readback: now and then a crew reads back a wrong squawk. Correct it (`negative, squawk 2312`) - a missed error costs points; otherwise `readback correct`.',
        'Start-up: with A-CDM (Stuttgart has been a full A-CDM airport since 2014) the crew calls at its TSAT. `start-up approved`, then `contact ground 118.605` when it asks for the pushback frequency.',
        'CTOT: flights with an ATFM slot show it in the CTOT column; include it in the clearance (`..., CTOT 1435`). Take-off must be between CTOT -5 and +10 minutes; the TSAT already accounts for the taxi time.',
      ],
      table: {
        head: ['Runway / first fix', 'SID (simulator placeholders, not the published procedures)'],
        rows: [
          ['25: LBU / SUL / RIXED / KRH', 'LBU2W / SUL2W / RIXED2W / KRH2W'],
          ['07: LBU / SUL / RIXED / KRH', 'LBU2E / SUL2E / RIXED2E / KRH2E'],
        ],
      },
    },
    {
      title: 'Standard taxi flows',
      items: [
        'The two parallel taxiways are used one-way, so traffic does not meet head-on: **N (outer) eastbound, S (inner) westbound**, whichever runway is in use. Departures from the aprons reach N first and never cross S; arrivals vacating the runway reach S first and never cross N.',
        'Automatic routes (the pilot\'s choice and the suggestions in the Taxi to menu and the quick-action bar) follow the flows; they only go against a flow when there is no other way without turning around. Your own `via` lists are always followed as given.',
      ],
      table: {
        head: ['Runway in use', 'Flows'],
        rows: [
          ['25', 'N eastbound (departures to A), S westbound (arrivals from F, G, E, H to the aprons)'],
          ['07', 'N eastbound, S westbound (departures to K via the circle or S, arrivals from D, B, C, A west on S)'],
        ],
      },
    },
    {
      title: 'Departures',
      positions: ['GND', 'TWR'],
      items: [
        'Full length: holding point A (runway 25), K north or Y south (runway 07).',
        'Intersections: B, C, D (25) and I, H, W (07). Ask first: `advise able for departure from intersection D`. Wide-bodies normally need full length.',
        'Push so the aircraft ends up facing the way it will taxi: airliners cannot turn around on a taxiway (only with a tug when stuck). For runway 25 most departures from stands 9-19 push facing east.',
        'Drive-through stands 40-48 and 50-56 need no pushback: the aircraft calls `request taxi` and leaves forwards (40-48 to O, 50-56 to N).',
        'Mix the SIDs in the queue: two departures on the same first fix need 2 minutes, diverging ones 1 minute. Keep heavies apart (2 minutes behind a heavy).',
      ],
      table: {
        head: ['From (runway 25)', 'Typical instruction'],
        rows: [
          ['Stands 9-36, 60-65, pushed facing east', '`taxi to holding point A via M, H, N`'],
          ['Stands 71-75 (pushed onto N facing east)', '`taxi to holding point A via N`'],
          ['Stands 40-48 / 50-56', '`taxi to holding point A via O, N` / `via N`'],
          ['Apron South, pushed facing east', '`taxi to holding point A via V, W, H, N, cross runway 25`'],
          ['Stands 9-19 (runway 07)', '`taxi to holding point K via M, L2` (facing east) / `via M, L3, O` (facing west)'],
          ['Stands 24-29 (runway 07), pushed facing east', '`taxi to holding point K via M, H, S`'],
        ],
      },
    },
    {
      title: 'Arrivals',
      positions: ['GND', 'TWR'],
      items: [
        'Runway 25 exits: F and H (rapid), E, G, I (rapid), K; to the south W and Y. Runway 07 exits: D and B (rapid), G, E, C, A.',
        'Arrivals stop at the vacate point behind the exit and call you. Answer quickly: Tower will not use an exit whose vacate point is still occupied.',
        'About 85 % vacate to the north. Aircraft vacating south (W, Y) need a runway crossing at W/H or Y/K to reach Apron North, unless they park on Apron South.',
        'The suggested stand is shown in brackets in the arrival list; business jets go to 60-65, Apron South (100-107) is for cargo or overflow.',
      ],
      table: {
        head: ['From', 'Typical instruction'],
        rows: [
          ['Vacated via F, G or E (25)', '`taxi to stand 14 via S, H, M` / `taxi to stand 72 via S, H, N`'],
          ['Vacated via H (25)', '`taxi to stand 33 via H, M`'],
          ['Vacated via D, B or C (07)', '`taxi to stand 30 via S, H, M`'],
          ['Vacated via W (south)', '`taxi to stand 105 via V`'],
        ],
      },
    },
    {
      title: 'Stands',
      table: {
        head: ['Stands', 'Notes'],
        rows: [
          ['9-19, 24-36', 'Terminal and handling stands on taxilane M, pushback, up to code C (wingspan below 36 m)'],
          ['40-48, 50-56', 'Drive-through: in from M, out forwards (to O / to N)'],
          ['60-65', 'Business jets, nose south, pushback onto M'],
          ['71-75', 'Pushback onto taxiway N'],
          ['71A, 74A', 'Wide-body positions overlapping 71+72 and 74+75: a wide-body there blocks both, and either of them blocks the A position'],
          ['100-107', 'Apron South (cargo), lane V; 105-107 take wide-bodies, but only every other one at a time'],
          ['Taxilane M east of H', 'Code C only (stands 30-36 and 60-65): wide-bodies use N to 71A / 74A'],
        ],
      },
    },
    {
      title: 'Hot spots and pitfalls',
      items: [
        'The circle west of N/S (hot spot) joins N, S, O, K, I and L2. Do not send two aircraft through it at the same time.',
        'Taxilane M is a single lane used in both directions. Use `give way` or a conditional clearance (`behind the A320 passing left to right, push and start approved`) when arrivals are coming in on M.',
        'H crosses both N and S on its way from the apron to the runway: watch traffic on the parallels.',
        'F and G cross each other just north of the holding points; a waiting arrival there can block the other exit.',
        'Two airliners nose to nose cannot sort it out themselves. Re-route one of them before it happens - after 30 s stuck they accept a tug turnaround.',
      ],
    },
  ],
};
