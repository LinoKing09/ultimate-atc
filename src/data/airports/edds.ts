import type { AirportData, ExitData, StandData } from '../../core/airport/types';
import { RunwayFrameBuilder } from './builder';

/**
 * Stuttgart (EDDS)
 *
 * Runway end coordinates, elevation and frequencies are real-world values
 * (source: OurAirports, public domain). The taxiway network, stands and
 * buildings are a SIMPLIFIED, HAND-MADE APPROXIMATION of the real layout:
 * the general arrangement (single runway 07/25, parallel taxiways N and S,
 * terminal apron north of the runway) matches the real airport, but
 * intersection names, stand numbers and positions do not necessarily match
 * the real aerodrome chart. Never use this for real-world navigation.
 *
 * Layout overview (runway frame, metres; along = from the 07 runway end
 * towards 25, lateral = positive north of the centreline):
 *
 *   lateral
 *     380  ...terminal stands 1-22 (Apron 1)...        GA/cargo stands 50-57 (Apron 3) at 350
 *     330  ======== taxilane R ========                taxilane V at 300
 *     190  -------------------- taxiway N --------------------
 *      95  A1  B1        E1    D1     C1        F1  G1          holding points (north)
 *       0  [=================== RUNWAY 07/25 ===================]
 *     -95  A2  B2              D2               F2  G2          holding points (south)
 *    -190  -------------------- taxiway S --------------------
 *    -240                stands 80-84 (Apron South / maintenance)
 */

const RWY_07_END = { lat: 48.685699462890625, lon: 9.200130462646484 };
const RWY_25_END = { lat: 48.694000244140625, lon: 9.243800163269043 };
const ARP = { lat: 48.69, lon: 9.221944 };
/** Landing threshold 07 is displaced by 984 ft (300 m). */
const THR_07_DISPLACEMENT = 300;

const b = new RunwayFrameBuilder(ARP, RWY_07_END, RWY_25_END);
const L = Math.round(b.length); // ~3340 m

const HP = 95; // lateral offset of runway holding positions
const CLR = 140; // lateral offset of the "vacated" stop point on connectors
const N = 190; // taxiway N
const S = -190; // taxiway S
const R_LANE = 330; // taxilane R (terminal apron)
const V_LANE = 300; // taxilane V (GA / cargo apron)
const RWY = '07/25';

// ---------------------------------------------------------------- runway centreline nodes
const rwyNodes: [string, number][] = [
  ['RWY_A', 0],
  ['RWY_B', 480],
  ['RWY_E', 1500],
  ['RWY_D', 1750],
  ['RWY_C', 2000],
  ['RWY_F', 2900],
  ['RWY_G', L],
];
for (const [id, x] of rwyNodes) b.node(id, x, 0);
b.chain(RWY, 'runway', rwyNodes.map(([id]) => id), { widthM: 45 });

// ---------------------------------------------------------------- perpendicular connectors
/**
 * Builds a perpendicular connector crossing the runway at `x`.
 * Adds holding points `<name>1` (north) and `<name>2` (south) when the
 * connector reaches that side.
 */
function connector(name: string, x: number, north: boolean, south: boolean): void {
  const rwy = `RWY_${name}`;
  if (north) {
    b.node(`${name}1`, x, HP, { name: `${name}1`, runway: RWY });
    b.node(`${name}_CLR1`, x, CLR);
    b.node(`N_${name}`, x, N);
    b.chain(name, 'runwayStrip', [rwy, `${name}1`]);
    b.chain(name, 'taxiway', [`${name}1`, `${name}_CLR1`, `N_${name}`]);
  }
  if (south) {
    b.node(`${name}2`, x, -HP, { name: `${name}2`, runway: RWY });
    b.node(`${name}_CLR2`, x, -CLR);
    b.node(`S_${name}`, x, S);
    b.chain(name, 'runwayStrip', [rwy, `${name}2`]);
    b.chain(name, 'taxiway', [`${name}2`, `${name}_CLR2`, `S_${name}`]);
  }
}

connector('A', 0, true, true);
connector('B', 480, true, true);
connector('D', 1750, true, true);
connector('F', 2900, true, true);
connector('G', L, true, true);

/** Angled one-way rapid exit from the runway node at `xRwy` to taxiway N at `xN`. */
function rapidExit(name: string, xRwy: number, xN: number): void {
  const at = (lat: number) => xRwy + ((xN - xRwy) * lat) / N;
  b.node(`${name}1`, at(HP), HP, { name: `${name}1`, runway: RWY });
  b.node(`${name}_CLR1`, at(CLR), CLR);
  b.node(`N_${name}`, xN, N);
  b.chain(name, 'runwayStrip', [`RWY_${name}`, `${name}1`], { oneWay: true });
  b.chain(name, 'taxiway', [`${name}1`, `${name}_CLR1`, `N_${name}`], { oneWay: true });
}

rapidExit('E', 1500, 1250); // for runway 25 arrivals (rolling west)
rapidExit('C', 2000, 2250); // for runway 07 arrivals (rolling east)

// ---------------------------------------------------------------- taxiway N
b.node('N_V', 1150, N);
b.node('N_RW', 1500, N);
b.node('N_RE', 3100, N);
b.chain('N', 'taxiway', ['N_A', 'N_B', 'N_V', 'N_E', 'N_RW', 'N_D', 'N_C', 'N_F', 'N_RE', 'N_G']);

// ---------------------------------------------------------------- taxilane R + Apron 1 (terminal)
const standsNorth = b.frameHeading(-90); // nose towards the terminal (north side)
const standsSouth = b.frameHeading(90);

interface StandSpec {
  id: string;
  x: number;
  span: number;
}
const terminalStands: StandSpec[] = [
  { id: '1', x: 1590, span: 65 },
  { id: '2', x: 1670, span: 65 },
];
for (let i = 0; i < 16; i++) terminalStands.push({ id: String(3 + i), x: 1750 + 60 * i, span: 36 });
terminalStands.push({ id: '19', x: 2735, span: 65 }, { id: '20', x: 2815, span: 65 });
terminalStands.push({ id: '21', x: 2965, span: 36 }, { id: '22', x: 3030, span: 36 });

const rLane: [string, number][] = [
  ['R_W', 1500],
  ['R_D', 1750 - 1], // D joins R right next to stand 3's lead-in
  ['R_F', 2900],
  ['R_E', 3100],
];

const stands: StandData[] = [];

function addStands(specs: StandSpec[], apron: string, laneY: number, standY: number, laneName: string, lane: [string, number][], heading: number): void {
  for (const s of specs) {
    const laneNode = `${laneName}_${s.id}`;
    b.node(laneNode, s.x, laneY);
    b.node(`STAND_${s.id}`, s.x, standY);
    b.chain(s.id, 'stand', [laneNode, `STAND_${s.id}`]);
    lane.push([laneNode, s.x]);
    stands.push({
      id: s.id,
      apron,
      pos: b.ll(s.x, standY),
      heading,
      laneNode,
      maxWingspanM: s.span,
      pushback: true,
    });
  }
}

addStands(terminalStands, 'Apron 1', R_LANE, 380, 'R', rLane, standsNorth);
b.node('R_W', 1500, R_LANE);
b.node('R_D', 1749, R_LANE);
b.node('R_F', 2900, R_LANE);
b.node('R_E', 3100, R_LANE);
rLane.sort((p, q) => p[1] - q[1]);
b.chain('R', 'taxilane', ['N_RW', ...rLane.map(([id]) => id), 'N_RE']);
// D and F continue north from N to taxilane R
b.chain('D', 'taxiway', ['N_D', 'R_D']);
b.chain('F', 'taxiway', ['N_F', 'R_F']);

// ---------------------------------------------------------------- taxilane V + Apron 3 (GA / cargo)
const gaStands: StandSpec[] = [{ id: '50', x: 360, span: 65 }];
for (let i = 0; i < 7; i++) gaStands.push({ id: String(51 + i), x: 580 + 80 * i, span: 52 });
const vLane: [string, number][] = [
  ['V_W', 300],
  ['V_B', 480],
];
addStands(gaStands, 'Apron 3', V_LANE, 350, 'V', vLane, standsNorth);
b.node('V_W', 300, V_LANE);
b.node('V_B', 480, V_LANE);
b.node('V_E', 1150, V_LANE);
vLane.push(['V_E', 1150]);
vLane.sort((p, q) => p[1] - q[1]);
b.chain('V', 'taxilane', [...vLane.map(([id]) => id), 'N_V']);
b.chain('B', 'taxiway', ['N_B', 'V_B']);

// ---------------------------------------------------------------- taxiway S + Apron South (maintenance)
const southStands: StandSpec[] = [];
for (let i = 0; i < 5; i++) southStands.push({ id: String(80 + i), x: 1000 + 80 * i, span: 52 });
const sLane: [string, number][] = [
  ['S_A', 0],
  ['S_B', 480],
  ['S_D', 1750],
  ['S_F', 2900],
  ['S_G', L],
];
addStands(southStands, 'Apron South', S, -240, 'S', sLane, standsSouth);
sLane.sort((p, q) => p[1] - q[1]);
b.chain('S', 'taxiway', sLane.map(([id]) => id));

// ---------------------------------------------------------------- arrival exits
function exit(name: string, side: 1 | 2, rapid = false): ExitData {
  return { name, path: [`RWY_${name}`, `${name}${side}`, `${name}_CLR${side}`], rapid };
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
  dataNotice:
    'Runway coordinates and frequencies are real-world values. Taxiways, stands and buildings are a simplified approximation - not for real-world navigation.',
  runways: [
    {
      name: RWY,
      widthM: 45,
      ends: [
        { name: '07', threshold: b.ll(THR_07_DISPLACEMENT, 0), end: b.ll(0, 0), elevationFt: 1267 },
        { name: '25', threshold: b.ll(L, 0), end: b.ll(L, 0), elevationFt: 1181 },
      ],
    },
  ],
  taxiNodes: b.nodes,
  taxiEdges: b.edges,
  stands,
  areas: [
    b.area('Apron 1', [
      [1460, 280],
      [3150, 280],
      [3150, 425],
      [1460, 425],
    ]),
    b.area('Apron 3', [
      [260, 255],
      [1190, 255],
      [1190, 395],
      [260, 395],
    ]),
    b.area('Apron South', [
      [950, -210],
      [1370, -210],
      [1370, -285],
      [950, -285],
    ]),
  ],
  buildings: [
    b.area('Terminal 1', [
      [1560, 420],
      [2300, 420],
      [2300, 495],
      [1560, 495],
    ]),
    b.area('Terminal 3', [
      [2310, 420],
      [3080, 420],
      [3080, 485],
      [2310, 485],
    ]),
    b.area('Cargo / GA', [
      [290, 392],
      [1100, 392],
      [1100, 450],
      [290, 450],
    ]),
    b.area('Maintenance hangar', [
      [960, -288],
      [1360, -288],
      [1360, -380],
      [960, -380],
    ]),
    b.area('Tower', [
      [1380, 430],
      [1410, 430],
      [1410, 460],
      [1380, 460],
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
        { holdingPoint: 'G1', intersection: 'G', fullLength: true },
        { holdingPoint: 'G2', intersection: 'G', fullLength: true },
        { holdingPoint: 'F1', intersection: 'F', fullLength: false },
        { holdingPoint: 'F2', intersection: 'F', fullLength: false },
      ],
      exits: [exit('E', 1, true), exit('D', 1), exit('D', 2), exit('B', 1), exit('B', 2), exit('A', 1)],
    },
    {
      runway: '07',
      departureEntries: [
        { holdingPoint: 'A1', intersection: 'A', fullLength: true },
        { holdingPoint: 'A2', intersection: 'A', fullLength: true },
        { holdingPoint: 'B1', intersection: 'B', fullLength: false },
        { holdingPoint: 'B2', intersection: 'B', fullLength: false },
      ],
      exits: [exit('D', 1), exit('D', 2), exit('C', 1, true), exit('F', 1), exit('F', 2), exit('G', 1)],
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
};
