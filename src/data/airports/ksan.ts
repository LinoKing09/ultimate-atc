import type { AirportData } from '../../core/airport/types';
import { KSAN_LAYOUT } from './ksan.layout';
import { buildLayout, exitVia, type StandSpec } from './osmLayout';

/**
 * San Diego International Airport (KSAN), Lindbergh Field - the first airport outside Europe, with US (FAA)
 * phraseology.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (ksan.layout.ts). Facts: FAA Chart Supplement data (runway, displaced thresholds, declared distances,
 * frequencies, procedures) read by hand from public listings; facility identification "Lindbergh", runway
 * use, SID assignment, initial altitudes and intersection distances after the VATSIM Los Angeles ARTCC San
 * Diego Tower SOP (rev. 4.40). See docs/airports/KSAN.md.
 *
 * Simplifications: the new Terminal 1 (opened in 2025) has no parking positions in OpenStreetMap yet - ten
 * gates are placed approximately along its airside front (numbering and positions approximate); the cargo
 * ramp and the general aviation (FBO) aprons on the north side are drawn but have no parking positions; the
 * north apron N1-N10 takes the cargo flights and business jets.
 */

/** A Terminal 2 / west gate from OpenStreetMap: its size from the spacing of the gates (wide-bodies where there is room). */
const GATE = (id: string, apron: string, maxWingspanM = 36, osm?: string): StandSpec => ({ id, apron, maxWingspanM, pushback: true, ...(osm ? { osm } : {}) });

/**
 * Terminal 1 (opened 2025): not in OpenStreetMap yet. Ten gates placed 41 m apart along the airside front of the
 * building (OSM outline), the aircraft nose-in 30 m from it, pushback onto taxiway A (the lane nodes T1.n are
 * added to A abeam each gate). Approximate.
 */
const T1: [string, number, number, number, number][] = [
  // [gate, lat, lon, lane lat, lane lon]
  ['1', 32.7323846, -117.19454, 32.7329628, -117.1943409],
  ['2', 32.7322827, -117.194119, 32.7328589, -117.1939206],
  ['3', 32.7321808, -117.193698, 32.7327551, -117.1935003],
  ['4', 32.7320788, -117.1932771, 32.7326512, -117.19308],
  ['5', 32.7319769, -117.1928561, 32.7325474, -117.1926597],
  ['6', 32.731875, -117.1924351, 32.7324435, -117.1922393],
  ['7', 32.7317731, -117.1920141, 32.7323397, -117.191819],
  ['8', 32.7316712, -117.1915931, 32.7322358, -117.1913987],
  ['9', 32.7315693, -117.1911721, 32.732132, -117.1909784],
  ['10', 32.7314674, -117.1907511, 32.7320281, -117.1905581],
];
/** Taxiway A from its west end to A4 with the Terminal 1 lane nodes, in order. */
const A_CHAIN = ['?/A', 'T1.1', 'T1.2', 'T1.3', 'T1.4', 'A/A6', 'T1.5', 'A/A6.2', 'T1.6', 'T1.7', 'T1.8', 'A/A5', 'T1.9', 'A/A5.2', 'T1.10', 'A/A4'];

const built = buildLayout(KSAN_LAYOUT, {
  runway: '09/27',
  // US airports name no holding points: the runway holding positions carry the name of their taxiway (as
  // controllers use them: "runway 27 at B4"). The other holding position lines on the aprons (ramp boundaries)
  // are plain nodes.
  holdingPoints: {
    'HP.9098843217': 'B1',
    'HP.2802573451': 'B2',
    'HP.4781970865': 'B4',
    'HP.10314075308': 'B5',
    'HP.10314138034': 'B6',
    'HP.4781971178': 'B7',
    'HP.10314138521': 'B8',
    'HP.2792117072': 'B9',
    'HP.10314138226': 'B10',
    'HP.250937898': 'C1',
    'HP.2792117624': 'C2',
    'HP.4781970815': 'C3',
    'HP.4781970908': 'C4',
    'HP.4781971018': 'C5',
    'HP.250937899': 'C6',
  },
  addNodes: T1.map(([g, , , lat, lon]) => [`T1.${g}`, lat, lon] as [string, number, number]),
  dropEdges: ['?/A>A/A6', 'A/A6>A/A6.2', 'A/A6.2>A/A5', 'A/A5>A/A5.2', 'A/A5.2>A/A4'],
  addEdges: A_CHAIN.slice(1).map((id, i) => [A_CHAIN[i], id, 'A', 'taxiway'] as [string, string, string, 'taxiway']),
  // The ramps of the terminals (unnamed lanes in OSM) are apron taxilanes.
  taxilanes: ['', 'X', 'P', 'F'],
  stands: [
    // Terminal 1 (approximate, see above).
    ...T1.map(([g, lat, lon]): StandSpec => ({ id: g, apron: 'Terminal 1', maxWingspanM: 36, pushback: true, lanes: [`T1.${g}`], pos: { lat, lon }, heading: 196 })),
    // Terminal 2 East (20-32) and West (33-51): OpenStreetMap gates; 40-43 regional jets.
    ...['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32'].map((g) => GATE(g, 'Terminal 2 East')),
    ...['33', '34', '35', '36', '37', '38', '39', '44', '45', '46', '47', '49', '50', '50A'].map((g) => GATE(g, 'Terminal 2 West')),
    ...['40', '41', '42', '43'].map((g) => GATE(g, 'Terminal 2 West', 26)),
    // The international gates at the west end take wide-bodies.
    GATE('48', 'Terminal 2 West', 65),
    GATE('51', 'Terminal 2 West', 65),
    // West remote positions: 11-14 and W2-W4.
    ...['11', '12', '13', '14'].map((g) => GATE(g, 'West remote')),
    GATE('W2', 'West remote', 52),
    GATE('W3', 'West remote', 52),
    GATE('W4', 'West remote', 65),
    // North apron: remote positions; cargo flights and business jets park here.
    ...['N1', 'N2', 'N3', 'N4', 'N5'].map((g): StandSpec => ({ ...GATE(g, 'North apron'), use: 'ga' })),
    { ...GATE('N6', 'North apron', 36, 'n6'), use: 'cargo' },
    ...['N7', 'N8', 'N9', 'N10'].map((g): StandSpec => ({ ...GATE(g, 'North apron', 52), use: 'cargo' })),
  ],
});

// Internally the runway is "09/27" like everywhere else; FAA phraseology says and shows "9" (no leading zero).
const RWY = '09/27';
for (const n of built.taxiNodes) if (n.holdingPoint) n.holdingPoint.runway = RWY;

/**
 * Runway ends: Chart Supplement coordinates of the physical ends; the thresholds are displaced (9: 1000 ft,
 * 27: 1810 ft) - placed along the centre line.
 */
const END_9 = { lat: 32.7371224, lon: -117.2043565 };
const END_27 = { lat: 32.7300015, lon: -117.1749716 };
const along = (from: { lat: number; lon: number }, to: { lat: number; lon: number }, m: number) => {
  const k = Math.cos((from.lat * Math.PI) / 180);
  const dx = (to.lon - from.lon) * 111320 * k;
  const dy = (to.lat - from.lat) * 110540;
  const d = Math.hypot(dx, dy);
  return { lat: from.lat + ((dy / d) * m) / 110540, lon: from.lon + ((dx / d) * m) / (111320 * k) };
};
const THR_9 = along(END_9, END_27, 305);
const THR_27 = along(END_27, END_9, 552);

export const KSAN: AirportData = {
  icao: 'KSAN',
  name: 'San Diego',
  city: 'San Diego',
  country: 'United States',
  fir: 'KZLA',
  phraseology: 'faa',
  arp: { lat: 32.7335628, lon: -117.1896633 },
  elevationFt: 17,
  magneticVariation: 11,
  timeZone: 'America/Los_Angeles',
  // West traffic (runway 27) is preferred; east traffic only with more than 10 kt tailwind on 27 (SOP 1-3).
  wind: { primaryShare: 0.92, primary: [230, 310], secondary: [50, 130] },
  transitionAltitudeFt: 18000,
  // "Maintain 5000" without a SID; the RNAV SIDs are "climb via SID".
  initialClimbFt: 5000,
  climate: { monthlyMeanC: [14, 15, 16, 17, 18, 20, 22, 23, 22, 20, 17, 14] },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway, thresholds and frequencies after the FAA Chart Supplement, procedures after the VATSIM Los Angeles ARTCC San Diego Tower SOP. Terminal 1 gates approximate (not yet mapped); cargo and FBO ramps without parking positions. Not for real-world navigation.',
  runways: [
    {
      name: RWY,
      widthM: 61,
      lengthM: 2865,
      ends: [
        // ILS or LOC Y / Z RWY 9 (also RNAV (GPS)); runway 27: LOC, RNAV (GPS) Y, RNAV (RNP) Z - no ILS.
        { name: '09', threshold: THR_9, end: END_9, elevationFt: 14, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '27', threshold: THR_27, end: END_27, elevationFt: 16, approaches: ['LOC', 'RNP'] },
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
    { callsign: 'SAN_DEL', type: 'DEL', name: 'Lindbergh Clearance Delivery', frequency: '125.900' },
    { callsign: 'SAN_GND', type: 'GND', name: 'Lindbergh Ground', frequency: '123.900' },
    { callsign: 'SAN_TWR', type: 'TWR', name: 'Lindbergh Tower', frequency: '118.300' },
    { callsign: 'SCT_APP', type: 'APP', name: 'SoCal Departure', frequency: '125.150' },
    { callsign: 'SAN_ATIS', type: 'ATIS', name: 'San Diego International', frequency: '134.800' },
  ],
  runwayOps: [
    {
      runway: '27',
      // Full length from B1 (south) or C1 (north), 9401 ft; intersection distances remaining after the SOP
      // (C2 8790 ft, C3 7110 ft, C4 / B4 6350 ft).
      departureEntries: [
        { holdingPoint: 'B1', intersection: 'B1', fullLength: true, toraM: 2865 },
        { holdingPoint: 'C1', intersection: 'C1', fullLength: true, toraM: 2865 },
        { holdingPoint: 'C2', intersection: 'C2', fullLength: false, toraM: 2679 },
        { holdingPoint: 'C3', intersection: 'C3', fullLength: false, toraM: 2167 },
        { holdingPoint: 'C4', intersection: 'C4', fullLength: false, toraM: 1935 },
        { holdingPoint: 'B4', intersection: 'B4', fullLength: false, toraM: 1935 },
      ],
      // Landing behind the displaced threshold: to the south (terminals) B5-B10, to the north C5 / C6.
      exits: [
        exitVia(built, 'C5', 'HP.4781971018'),
        exitVia(built, 'B5', 'HP.10314075308'),
        exitVia(built, 'C6', 'HP.250937899'),
        exitVia(built, 'B6', 'HP.10314138034'),
        exitVia(built, 'B7', 'HP.4781971178'),
        exitVia(built, 'B8', 'HP.10314138521'),
        exitVia(built, 'B9', 'HP.2792117072'),
        exitVia(built, 'B10', 'HP.10314138226'),
      ],
      // West traffic (simulator convention): departures east on B (to B1) and C (to C1); A both ways (Terminal 1
      // departures leave it east via A4, arrivals come in from the west via A7).
      flows: [
        { taxiway: 'B', direction: 'east' },
        { taxiway: 'C', direction: 'east' },
      ],
    },
    {
      runway: '09',
      // Chart Supplement: TORA 8280 ft; from B9 the SOP gives 8545 ft - both used as full length here.
      // Intersections B8 7430 ft, B7 6325 ft, B6 5201 ft (SOP).
      departureEntries: [
        { holdingPoint: 'B10', intersection: 'B10', fullLength: true, toraM: 2524 },
        { holdingPoint: 'B9', intersection: 'B9', fullLength: true, toraM: 2524 },
        { holdingPoint: 'B8', intersection: 'B8', fullLength: false, toraM: 2265 },
        { holdingPoint: 'B7', intersection: 'B7', fullLength: false, toraM: 1928 },
        { holdingPoint: 'B6', intersection: 'B6', fullLength: false, toraM: 1585 },
      ],
      // B2, C2 and C3 fork behind the holding point: both branches (west towards the terminals, east).
      exits: [
        exitVia(built, 'B4', 'HP.4781970865'),
        exitVia(built, 'C4', 'HP.4781970908'),
        exitVia(built, 'C3', 'HP.4781970815'),
        exitVia(built, 'C3', 'HP.4781970815', { next: 'C3.11' }),
        exitVia(built, 'B2', 'HP.2802573451'),
        exitVia(built, 'B2', 'HP.2802573451', { next: 'B2.4' }),
        exitVia(built, 'C2', 'HP.2792117624'),
        exitVia(built, 'C2', 'HP.2792117624', { next: 'C2.6' }),
        exitVia(built, 'B1', 'HP.9098843217'),
        exitVia(built, 'C1', 'HP.250937898'),
      ],
      flows: [
        { taxiway: 'B', direction: 'west' },
        { taxiway: 'C', direction: 'west' },
      ],
    },
  ],
  // RNAV SIDs after the SOP (2-2): west traffic PADRZ (north, west, north-west) and ZZOOO (east, north-east,
  // south; CLSSY at night, not modelled); east traffic ECHHO (north, north-west), MMOTO (oceanic, west) and
  // SAYOW (east, north-east, south). The conventional BRDR, FALCC and PEBLE and the TEC routes are not modelled.
  sids: [
    { name: 'PADRZ2', runway: '27', fix: 'PADRZ', towards: [240, 20], frequency: '119.600' },
    { name: 'ZZOOO4', runway: '27', fix: 'ZZOOO', towards: [20, 240] },
    { name: 'ECHHO2', runway: '09', fix: 'ECHHO', towards: [290, 20], frequency: '124.350' },
    { name: 'MMOTO2', runway: '09', fix: 'MMOTO', towards: [200, 290], frequency: '124.350' },
    { name: 'SAYOW2', runway: '09', fix: 'SAYOW', towards: [20, 200], frequency: '124.350' },
  ],
  // Not an A-CDM airport; US pre-departure clearances (PDC) are like datalink clearances.
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'dcl', 'loc', 'gp'],
  traffic: {
    source: 'San Diego International Airport route network 2026 (Wikipedia), FAA traffic counts (about 600 movements a day); operator shares estimated',
    rateFactor: 1,
    operators: [
      { airline: 'SWA', weight: 38, destinations: ['KOAK', 'KSJC', 'KSMF', 'KLAS', 'KPHX', 'KDEN', 'KDAL', 'KHOU', 'KBWI', 'KSTL'] },
      { airline: 'ASA', weight: 10 },
      { airline: 'QXE', weight: 3 },
      { airline: 'UAL', weight: 8 },
      { airline: 'AAL', weight: 7 },
      { airline: 'DAL', weight: 7 },
      { airline: 'SKW', weight: 5 },
      { airline: 'NKS', weight: 3 },
      { airline: 'JBU', weight: 2 },
      { airline: 'FFT', weight: 2 },
      { airline: 'SCX', weight: 1 },
      { airline: 'MXY', weight: 1 },
      { airline: 'HAL', weight: 2 },
      { airline: 'ACA', weight: 1 },
      { airline: 'WJA', weight: 1 },
      { airline: 'BAW', weight: 1, types: ['B788'], destinations: ['EGLL'] },
      { airline: 'JAL', weight: 1 },
      { airline: 'DLH', weight: 1, types: ['A359'], destinations: ['EDDF'] },
      { airline: 'FDX', weight: 1, types: ['B763'], destinations: ['KMEM', 'KONT'] },
      { airline: 'UPS', weight: 1, types: ['B763', 'B752'], destinations: ['KSDF', 'KONT'] },
      { airline: 'NGA', weight: 4 },
    ],
  },
  briefing: [
    {
      title: 'San Diego in short',
      items: [
        'You are **Lindbergh** Clearance Delivery, Ground or Tower - US phraseology (FAA): `runway 27, taxi via B`, `push approved, tail east`, `runway 27, line up and wait`, `runway 27, cleared for takeoff`, `contact SoCal Departure`. Altimeter in inches (`altimeter 2992`), transition altitude 18000 ft.',
        'One runway **9/27** (9401 ft / 2865 m, 200 ft wide), both thresholds displaced (9: 1000 ft, 27: 1810 ft). **West traffic (27) is preferred**; east traffic (9) only with more than 10 kt tailwind on 27. Runway 27 has no ILS: LOC and RNAV approaches over downtown.',
        'Taxiways: **B** along the south side of the runway (terminals), **C** along the north side, **A** in front of Terminal 1. Connectors B1-B10 and C1-C6 carry the names of the holding positions: `hold short of runway 27 at B4`; B4 / C4 and B6 / C6 are crossings.',
        'Departures 27 from **B1** (south) or **C1** (north) - full length - or the intersections C2, C3, C4 / B4; departures 9 from **B10** / **B9**, intersections B8, B7, B6. West traffic: departures east on B and C (simulator convention); A both ways.',
        'Arrivals 27 vacate to the south at B5-B10 (Terminal 2 at the west end, Terminal 1 via A), to the north at C5 / C6 (north apron).',
        'SIDs: runway 27 **PADRZ2** (north, west) or **ZZOOO4** (east, south); runway 9 **ECHHO2** (north-west), **MMOTO2** (oceanic) or **SAYOW2** (east). All "climb via SID"; SoCal Departure 119.6 (PADRZ), 125.15 (ZZOOO) or 124.35 (east traffic).',
      ],
    },
  ],
};
