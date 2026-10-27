import type { AirportData } from '../../core/airport/types';
import { SEQM_LAYOUT } from './seqm.layout';
import { buildLayout, exitVia, type StandSpec } from './osmLayout';

/**
 * Quito Mariscal Sucre International Airport (SEQM) - the first airport in South America, 7910 ft above sea level.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (seqm.layout.ts). Facts: AIP Ecuador AD 2 SEQM (AIRAC AMDT 01/26) with its aerodrome, ground movement and
 * parking / docking charts and the RNAV SID tables (facts only: runway, thresholds, declared distances, taxiway
 * designators and widths, the standard taxi routes of AD 2.20, the stand coordinates and their critical aircraft,
 * frequencies, ILS, the SIDs with their end fixes, the climb restriction to 17000 ft). See docs/airports/SEQM.md.
 *
 * One runway 18/36 (4098 m) with the parallel taxiway A on the west side; the second parallel B in front of the
 * aprons, joined to A by J, H, G, F and E; the commercial apron along the apron lane C.
 *
 * OpenStreetMap names some taxiways differently from the AIP: its "H" along the terminal is C, its "F" west of A
 * is B; they are renamed here. The commercial apron has grown north since OpenStreetMap was drawn: C is extended
 * to the stands 13-16 and 57-60.
 */

/** AIP stand: position from the stand coordinates table (00°07'ss.ss"S 078°21'ss.ss"W), lane on `snap`. */
const STAND = (id: string, apron: string, snap: string, s: number, w: number, maxWingspanM: number, use?: StandSpec['use']): StandSpec => ({
  id,
  apron,
  maxWingspanM,
  pushback: true,
  snap: [snap],
  pos: { lat: -(7 / 60 + s / 3600), lon: -(78 + 21 / 60 + w / 3600) },
  ...(use ? { use } : {}),
});
/** Critical aircraft of the AIP table: code C (A320, B737), D (B767, B757), E (B747-400, A350, A330), F (B747-8). */
const C = 36;
const D = 52;
const E = 65;
const F = 80;

const built = buildLayout(SEQM_LAYOUT, {
  runway: '18/36',
  holdingPoints: {
    // The AIP calls the holding points at both runway ends "TWY A THR 18" / "TWY A THR 36" (AD 2.9): A18 and A36.
    'HP.5769870833': 'A18',
    'HP.3330072209': 'A36',
    'HP.3329399338': 'A3',
    // A2 forks behind its holding point: the rapid exit for runway 36 is used, the branch to the north is drawn.
    'HP.5769871374': { name: 'A2', node: 'RWY.A2' },
    'HP.3332491173': 'A1',
  },
  // C is extended north to the stands of the enlarged commercial apron (13-16, 57-60).
  addNodes: [
    ['C.N1', -0.1219, -78.35845],
    ['C.N2', -0.1213, -78.35847],
  ],
  addEdges: [
    ['H.1', 'C.N1', 'C', 'taxilane'],
    ['C.N1', 'C.N2', 'C', 'taxilane'],
  ],
  taxiwayNames: { 'TAXIWAY 18 A': 'A', 'TAXIWAY 36 A': 'A', 'TAXIWAY T': 'T' },
  edgeNames: {
    // OpenStreetMap "H" along the terminal is the apron lane C; H is the link from C across B to A.
    'H.1>?/H': 'C',
    '?/H>?/H.2': 'C',
    '?/H.2>H.2': 'C',
    'H.2>H.3': 'C',
    '?/A.10>?.10': 'H',
    '?.10>?.11': 'H',
    '?.11>?/H.8': 'H',
    '?/H.8>?.12': 'H',
    '?.12>?/A.9': 'H',
    // B: the fillets onto H and J.
    '?/B.2>?.34': 'B',
    '?.34>?.35': 'B',
    '?.35>?/H.6': 'B',
    '?/H.3>?.36': 'B',
    '?.36>?/B.2': 'B',
    '?/B.4>?.37': 'B',
    '?.37>?/H.4': 'B',
    '?/B.4>?.38': 'B',
    '?.38>?/H.7': 'B',
    '?/B.2>?.39': 'B',
    '?.39>?/H.5': 'B',
    '?/H.5>?.40': 'B',
    '?.40>?/B.4': 'B',
    '?/B.3>?.64': 'B',
    '?.64>?/J.2': 'B',
    // J: the fillets onto C and A.
    '?/H>?.61': 'J',
    '?.61>?/J': 'J',
    '?/H.2>?.62': 'J',
    '?.62>?.63': 'J',
    '?.63>?/J': 'J',
    '?/A.13>?.54': 'J',
    '?.54>?/J.3': 'J',
    '?/J.3>?.55': 'J',
    '?.55>?/A.12': 'J',
    // A2: the fillets onto A.
    '?/A.11>?.50': 'A2',
    '?.50>?.51': 'A2',
    '?.51>?.52': 'A2',
    '?.52>?/A2.2': 'A2',
    '?/A2>?.53': 'A2',
    '?.53>?/A.14': 'A2',
    // OpenStreetMap "F" west of A is B (from H south to E); G, F and E link it to A.
    '?.41>?/B': 'B',
    '?/F.2>?.41': 'B',
    'F.1>?/F.2': 'B',
    '?/F>F.1': 'B',
    '?/F>?/F.4': 'B',
    '?/F.4>?/F.5': 'B',
    '?/F.5>?/F.6': 'B',
    '?/F.6>?/F.7': 'B',
    '?/F.7>?/F.8': 'B',
    '?/F.8>?/F.9': 'B',
    '?/F.9>?/F.10': 'B',
    '?/F.10>F.7': 'B',
    'F.7>F.8': 'B',
    'F.8>?/E/F': 'B',
    'A/A1/F>?/F.12': 'G',
    '?/F.12>?/F.11': 'G',
    '?/F.11>F.5': 'G',
    'F.5>F.9': 'G',
    'F.9>F.1': 'G',
    'F.5>F.6': 'G',
    'F.6>?/F.4': 'G',
    '?/F.11>?.13': 'G',
    '?.13>?/A.8': 'G',
    '?/F.12>?.14': 'G',
    '?.14>?/A.6': 'G',
    '?/A.7>?.15': 'A1',
    '?.15>?/A1': 'A1',
    '?/A.5>?.16': 'A1',
    '?.16>?/A1.2': 'A1',
    '?.8>?.9': 'F',
    '?.9>?/F.8': 'F',
    '?.8>?.17': 'F',
    '?.17>?/A.4': 'F',
    '?.8>?.18': 'F',
    '?.18>?/A.3': 'F',
    '?/F.7>?.23': 'F',
    '?.23>?.9': 'F',
    '?.9>?.24': 'F',
    '?.24>?/F.10': 'F',
    '?/E>?.19': 'E',
    '?.19>?/A.2': 'E',
    '?/E>?.20': 'E',
    '?.20>?/A': 'E',
    '?/TAXIWAY 18 A.2>?.46': 'A',
    '?.46>?.47': 'A',
    '?.47>?/A.15': 'A',
    // The GA apron lane D (Delta Norte / Sur).
    '?.1>?.2': 'D',
    '?.2>?.3': 'D',
    '?.3>?.4': 'D',
    '?.4>?.5': 'D',
    '?.5>?.6': 'D',
    '?.6>?.7': 'D',
    '?.7>?/F.8': 'D',
    '?.1>?.21': 'D',
    '?.21>?/F.6': 'D',
    '?.1>?.22': 'D',
    '?.22>?/F.5': 'D',
    '?.7>?/F.9': 'D',
    '?.7>?.25': 'D',
    '?.25>?/F.7': 'D',
  },
  // Drawn, not used: the general aviation apron (D), the maintenance apron, the way south to the helicopter
  // stand H3, the isolated stand Z with T, and the northern branch of A2.
  drawOnly: [
    '?.1>?.2', '?.2>?.3', '?.3>?.4', '?.4>?.5', '?.5>?.6', '?.6>?.7', '?.7>?/F.8', '?.1>?.21', '?.21>?/F.6', '?.1>?.22', '?.22>?/F.5', '?.7>?/F.9', '?.7>?.25', '?.25>?/F.7',
    'F.2>F.3', 'F.3>?/F.3', '?/F.3>F.4', '?/F.3>?.42', '?.42>?.43', '?.43>?.41', '?/F.2>F.2',
    '?/E/F>?.26', '?.26>?.27', '?.27>?.28', '?.28>?.29', '?.29>?.30', '?.30>?.31', '?.31>?.32', '?.32>?.33',
    'A/TAXIWAY 18 A/TAXIWAY T>?/TAXIWAY T', '?/TAXIWAY T>?/TAXIWAY T.2', '?/TAXIWAY T.2>TAXIWAY T.1', 'TAXIWAY T.1>TAXIWAY T.2', 'TAXIWAY T.2>TAXIWAY T.3',
    'TAXIWAY T.3>TAXIWAY T.4', 'TAXIWAY T.4>TAXIWAY T.5', 'TAXIWAY T.5>TAXIWAY T.6', 'TAXIWAY T.6>TAXIWAY T.7', 'TAXIWAY T.7>TAXIWAY T.8',
    '?/TAXIWAY T.2>?.44', '?.44>?.45', '?.45>?/A.15', '?/TAXIWAY T>?.48', '?.48>?/TAXIWAY T.3', '?/TAXIWAY T.3>?.49', '?.49>?/TAXIWAY 18 A',
    'A/TAXIWAY 18 A/TAXIWAY T>?/TAXIWAY T.3', '?/TAXIWAY T.3>TAXIWAY T.8',
    '?/A2.3>?.56', '?.56>?.57', '?.57>?.58', '?.58>?.59', '?.59>?.60', '?.60>RWY.?',
  ],
  taxilanes: ['C'],
  // AIP AD 2.8: B is 18 m wide between H and J and between G and E, 23 m between G and H; G 42 m.
  widthM: { A: 23, A1: 23, A2: 23, A3: 23, B: 18, C: 23, E: 18, F: 25, G: 42, H: 23, J: 23 },
  stands: [
    // West row along C, at the terminal (boarding bridges); 6 is towed in from C.
    STAND('6', 'Commercial apron', 'C', 39.79, 33.42, E),
    STAND('7', 'Commercial apron', 'C', 37.32, 33.36, D),
    STAND('8', 'Commercial apron', 'C', 35.66, 33.48, D),
    STAND('9', 'Commercial apron', 'C', 34.15, 33.18, C),
    STAND('10', 'Commercial apron', 'C', 31.84, 33.62, D),
    STAND('11', 'Commercial apron', 'C', 29.77, 34.0, E),
    STAND('12', 'Commercial apron', 'C', 27.65, 33.83, D),
    STAND('13', 'Commercial apron', 'C', 25.68, 33.89, E),
    STAND('14', 'Commercial apron', 'C', 23.4, 34.4, E),
    STAND('15', 'Commercial apron', 'C', 21.34, 34.23, D),
    STAND('16', 'Commercial apron', 'C', 18.32, 34.52, E),
    // East side of C; 51A, 53A and 56A are larger positions over 51 / 52, 53 / 54 and 56 (towed in from C).
    STAND('51', 'Commercial apron', 'C', 34.94, 27.21, C),
    STAND('51A', 'Commercial apron', 'C', 34.29, 26.29, E),
    STAND('52', 'Commercial apron', 'C', 33.7, 27.44, C),
    STAND('53', 'Commercial apron', 'C', 31.77, 27.11, C),
    STAND('53A', 'Commercial apron', 'C', 31.34, 26.95, D),
    STAND('54', 'Commercial apron', 'C', 30.18, 27.18, C),
    STAND('55', 'Commercial apron', 'C', 28.69, 27.37, C),
    STAND('56', 'Commercial apron', 'C', 27.37, 27.42, C),
    STAND('56A', 'Commercial apron', 'C', 26.94, 27.43, D),
    STAND('57', 'Commercial apron', 'C', 22.21, 27.24, C),
    STAND('58', 'Commercial apron', 'C', 20.75, 27.8, C),
    STAND('59', 'Commercial apron', 'C', 19.09, 27.87, C),
    STAND('60', 'Commercial apron', 'C', 17.7, 27.93, C),
    // Along B (AD 2.20: via H or J and B, code C).
    STAND('61', 'Commercial apron', 'B', 34.96, 25.79, C),
    STAND('62', 'Commercial apron', 'B', 33.83, 25.84, C),
    STAND('63', 'Commercial apron', 'B', 32.7, 25.88, C),
    STAND('64', 'Commercial apron', 'B', 31.46, 26.17, C),
    STAND('65', 'Commercial apron', 'B', 30.09, 26.23, C),
    STAND('66', 'Commercial apron', 'B', 28.73, 26.29, C),
    STAND('67', 'Commercial apron', 'B', 27.36, 26.35, C),
    // South of H (AD 2.20: in via J, C and H).
    STAND('3', 'Commercial apron', 'H', 39.57, 27.1, C),
    STAND('4', 'Commercial apron', 'H', 39.63, 28.54, C),
    STAND('5', 'Commercial apron', 'H', 39.68, 30.17, C),
    // Cargo apron along B (the flower freighters, up to the B747-8).
    STAND('80', 'Cargo apron', 'B', 41.8, 28.05, E, 'cargo'),
    STAND('81', 'Cargo apron', 'B', 44.21, 27.71, F, 'cargo'),
    STAND('82', 'Cargo apron', 'B', 46.62, 27.84, E, 'cargo'),
    STAND('83', 'Cargo apron', 'B', 48.98, 27.74, E, 'cargo'),
    STAND('84A', 'Cargo apron', 'B', 50.73, 27.67, F, 'cargo'),
    STAND('84', 'Cargo apron', 'B', 51.76, 27.65, E, 'cargo'),
    STAND('85', 'Cargo apron', 'B', 54.65, 27.72, F, 'cargo'),
  ],
});

/** AIP AD 2.12: the thresholds (no displacement). */
const THR_18 = { lat: -(6 / 60 + 20.22 / 3600), lon: -(78 + 21 / 60 + 18.75 / 3600) };
const THR_36 = { lat: -(8 / 60 + 33.54 / 3600), lon: -(78 + 21 / 60 + 13.05 / 3600) };

export const SEQM: AirportData = {
  icao: 'SEQM',
  name: 'Quito',
  city: 'Quito',
  country: 'Ecuador',
  fir: 'SEFG',
  arp: { lat: -(7 / 60 + 27 / 3600), lon: -(78 + 21 / 60 + 16 / 3600) },
  elevationFt: 7910,
  magneticVariation: -5,
  timeZone: 'America/Guayaquil',
  // AIP AD 2.22: runway 36 normally; runway 18 with wind from SSW to SSE of 8 kt or more.
  wind: { primaryShare: 0.85, primary: [300, 420], secondary: [160, 200] },
  transitionAltitudeFt: 18000,
  // AIP AD 2.22: every departure is restricted to 17000 ft.
  initialClimbFt: 17000,
  // Quito valley at 2400 m: about 14 °C all year.
  climate: { monthlyMeanC: [14, 14, 14, 14, 14, 14, 14, 15, 15, 14, 14, 14] },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway, taxiway names, stand positions, frequencies and SIDs after the AIP Ecuador (AIRAC AMDT 01/26, facts only). C extended north to the new stands; GA and maintenance aprons drawn, not used. Runway 18: radar vectors. Not for real-world navigation.',
  runways: [
    {
      name: '18/36',
      widthM: 45,
      lengthM: 4098,
      ends: [
        { name: '18', threshold: THR_18, end: THR_18, elevationFt: 7776, approaches: ['ILS'] },
        { name: '36', threshold: THR_36, end: THR_36, elevationFt: 7910, approaches: ['ILS'] },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: [
    ...built.areas,
    // The commercial apron north of the area OpenStreetMap has (stands 13-16, 57-60).
    { name: 'Apron', polygon: [{ lat: -0.12242, lon: -78.3597 }, { lat: -0.12242, lon: -78.3571 }, { lat: -0.121, lon: -78.3571 }, { lat: -0.121, lon: -78.3597 }] },
  ],
  buildings: built.buildings,
  pavement: built.pavement,
  stations: [
    { callsign: 'SEQM_GND', type: 'GND', name: 'Quito Ground', frequency: '121.900' },
    { callsign: 'SEQM_TWR', type: 'TWR', name: 'Quito Tower', frequency: '118.350' },
    { callsign: 'SEQM_APP', type: 'APP', name: 'Quito Approach', frequency: '121.200' },
    { callsign: 'SEQM_ATIS', type: 'ATIS', name: 'Quito', frequency: '118.900' },
  ],
  runwayOps: [
    {
      runway: '36',
      // Intersections: the AIP publishes no take-off runs from them - measured on the map.
      departureEntries: [
        { holdingPoint: 'A36', intersection: 'A', fullLength: true, toraM: 4098 },
        { holdingPoint: 'A1', intersection: 'A1', fullLength: false, toraM: 3010 },
      ],
      // Landing north: the rapid exits A2 and A3, else to the end.
      exits: [exitVia(built, 'A2', 'HP.5769871374'), exitVia(built, 'A3', 'HP.3329399338'), exitVia(built, 'A', 'HP.5769870833')],
    },
    {
      runway: '18',
      departureEntries: [
        { holdingPoint: 'A18', intersection: 'A', fullLength: true, toraM: 4098 },
        { holdingPoint: 'A3', intersection: 'A3', fullLength: false, toraM: 2600 },
        { holdingPoint: 'A2', intersection: 'A2', fullLength: false, toraM: 1680 },
      ],
      // Landing south: the rapid exit A1, else to the end.
      exits: [exitVia(built, 'A1', 'HP.3332491173'), exitVia(built, 'A', 'HP.3330072209')],
    },
  ],
  // RNAV SIDs of runway 36 (AIP AD 2 SEQM 28.1-28.15), picked by the bearing of the destination (sectors halfway
  // between the bearings of the end fixes from the AIP tables); the A and B
  // versions of a fix are both offered. Runway 18 has no SID available here: radar vectors (AD 2.22).
  sids: [
    { name: 'ARNOK3A', runway: '36', fix: 'ARNOK', towards: [0, 45] },
    { name: 'SIMOG1B', runway: '36', fix: 'SIMOG', towards: [45, 119] },
    { name: 'VURIS3', runway: '36', fix: 'VURIS', towards: [119, 178] },
    { name: 'KETOM3A', runway: '36', fix: 'KETOM', towards: [178, 192] },
    { name: 'KETOM3B', runway: '36', fix: 'KETOM', towards: [178, 192] },
    { name: 'REBEK3A', runway: '36', fix: 'REBEK', towards: [192, 218] },
    { name: 'REBEK3B', runway: '36', fix: 'REBEK', towards: [192, 218] },
    { name: 'TEMOX3A', runway: '36', fix: 'TEMOX', towards: [218, 248] },
    { name: 'TEMOX3B', runway: '36', fix: 'TEMOX', towards: [218, 248] },
    { name: 'ORETA3A', runway: '36', fix: 'ORETA', towards: [248, 266] },
    { name: 'ORETA3B', runway: '36', fix: 'ORETA', towards: [248, 266] },
    { name: 'MIDEX4A', runway: '36', fix: 'MIDEX', towards: [266, 292] },
    { name: 'MIDEX4B', runway: '36', fix: 'MIDEX', towards: [266, 292] },
    { name: 'PALAD5A', runway: '36', fix: 'PALAD', towards: [292, 325] },
    { name: 'NEGAL3A', runway: '36', fix: 'NEGAL', towards: [325, 0] },
    { name: 'RV', runway: '18', fix: '', vectors: true },
  ],
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Quito airport route network 2026 (Wikipedia; about 5 million passengers a year), flower exports by freighter; operator shares estimated',
    rateFactor: 0.6,
    operators: [
      { airline: 'LNE', weight: 22 },
      { airline: 'GLG', weight: 16 },
      { airline: 'AVA', weight: 6 },
      { airline: 'CMP', weight: 8 },
      { airline: 'LPE', weight: 3 },
      { airline: 'AAL', weight: 4, types: ['B738'], destinations: ['KMIA', 'KDFW'] },
      { airline: 'UAL', weight: 2, types: ['B738'], destinations: ['KIAH'] },
      { airline: 'DAL', weight: 2, types: ['A321'], destinations: ['KATL'] },
      { airline: 'JBU', weight: 2, types: ['A320'], destinations: ['KFLL', 'KJFK'] },
      { airline: 'NKS', weight: 2, types: ['A320'], destinations: ['KFLL'] },
      { airline: 'KLM', weight: 1, types: ['B789'], destinations: ['EHAM'] },
      { airline: 'IBE', weight: 2 },
      { airline: 'AEA', weight: 2 },
      { airline: 'LCO', weight: 3 },
      { airline: 'CLX', weight: 2 },
      { airline: 'GTI', weight: 2, types: ['B748'], destinations: ['KMIA'] },
      { airline: 'CKS', weight: 1, types: ['B744'], destinations: ['KMIA'] },
    ],
  },
  briefing: [
    {
      title: 'Quito in short',
      items: [
        'One runway **18/36**, 4098 m x 45 m, **7910 ft** above sea level in the Andes. Runway **36** is in use normally; **18** only with wind from the south of 8 kt or more (AIP AD 2.22).',
        'Taxiway **A** runs the whole length on the west side; full-length departures from **A36** (south end) or **A18** (north end); intersections **A1** (36), **A3** and **A2** (18). Rapid exits **A2** and **A3** for runway 36, **A1** for runway 18.',
        'The second parallel **B** runs in front of the aprons, joined to A by **J**, **H**, **G**, **F** and **E**. The commercial apron lies along the apron lane **C** (stands 6-16 at the terminal, 51-60 opposite), stands 61-67 along B, 3-5 south of H; the cargo apron (80-85, up to the B747-8) along B further south.',
        'No 180-degree turns on the taxiways (AD 2.20). Every departure climbs to **17000 ft** at first; transition altitude 18000 ft. RNAV SIDs only from runway 36 (ARNOK, SIMOG, VURIS, KETOM, REBEK, TEMOX, ORETA, MIDEX, PALAD, NEGAL); from runway 18 departures get **radar vectors** ("cleared to Guayaquil, radar vectors, flight planned route, climb 17000 feet").',
        'Quito Ground also gives the clearances (no Delivery). Flower freighters to Miami and Amsterdam park on the cargo apron.',
      ],
    },
  ],
};
