import type { AirportData } from '../../core/airport/types';
import { EDDN_LAYOUT } from './eddn.layout';
import { buildLayout, exitVia, type StandSpec } from './osmLayout';

/**
 * Nuremberg (EDDN), Albrecht Dürer Airport.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (eddn.layout.ts). Procedures, stand use and taxiway restrictions: VATSIM Germany Nürnberg SOP,
 * see docs/airports/EDDN.md.
 *
 * Simplifications: the general aviation aprons (G1-G3, U1, U2, FAI, Aerodienst) and helipads are drawn,
 * but have no parking positions (only the GA stands 81-86); the CAT II/III holding points on J, F/C and B
 * are plain junctions (no low visibility operations).
 */

const AIRLINE = (id: string, lanes: string[], maxWingspanM = 36, pushback = true): StandSpec => ({ id, apron: 'Main apron', maxWingspanM, pushback, lanes });
const THROUGH = (id: string, apron: string, lanes: [string, string], maxWingspanM = 36): StandSpec => ({ id, apron, maxWingspanM, pushback: false, lanes });

const built = buildLayout(EDDN_LAYOUT, {
  runway: '10/28',
  holdingPoints: {
    'HP.249666646': 'F',
    'HP.249666656': 'E',
    'HP.249666665': 'D',
    'HP.1868560670': 'C',
    'HP.1868560665': 'B',
    'HP.1523471664': 'A',
  },
  // The unnamed link from the east end of the apron (M1 / M2) north to A, B and N2 is M2 (ground movement chart),
  // up to the A / B junction where A begins.
  taxiwayNames: { '?': 'M2' },
  edgeNames: { 'A/B>?/B/N2': 'M2' },
  // The GA lanes end at their aprons: S3 at Apron G2 / G2A, S4 at the FAI apron, T2 at aprons U1 / U2.
  keepNodes: ['S3.5', 'S4.10', 'T2.1'],
  // SOP: B, C, E and N2 code C only, D code D. AIP AD 2.20: S3, S4 and T2 code A / B; J code C from F to M4
  // (code D / E only cross it between M3 and M4 / N4), code A / B from M4 to the GA entry.
  maxWingspanM: { B: 36, C: 36, E: 36, N2: 36, D: 52, S3: 24, S4: 24, T2: 24 },
  edgeMaxWingspanM: {
    'F/J>J.1': 36, 'J.1>J.2': 36, 'J.2>J.3': 36, 'J.3>HP.1868560660': 36,
    'F/J.2>J.4': 36, 'J.4>J.5': 36, 'J.5>J.6': 36, 'J.6>HP.1868560660': 36, 'HP.1868560660>J/M3': 36,
    'J/M4>J/M4.2': 24, 'J/M4.2>J/S3/S4': 24,
  },
  // Pavement widths: AIP AD 2.8.
  widthM: { A: 22.5, B: 22.5, C: 22.5, D: 23, E: 22.5, F: 22.5, J: 22.5, M1: 23, M2: 23, M3: 23, M4: 23, N2: 18, N4: 21, S3: 10.5, S4: 10.5, T2: 10.5 },
  taxilanes: ['M1', 'M2', 'M3', 'M4', 'N2', 'N4', 'S3', 'S4', 'T2'],
  stands: [
    // Terminal stands, nose south (jet bridges 10-13), taxi in and push back.
    AIRLINE('01', ['M1.4'], 30),
    AIRLINE('02', ['M1.3']),
    AIRLINE('03', ['M2.17']),
    AIRLINE('04', ['M2.14']),
    AIRLINE('05', ['M2.12']),
    AIRLINE('06', ['M2.10']),
    AIRLINE('09', ['M2.5']),
    AIRLINE('10', ['M2.2']),
    AIRLINE('11', ['M3.12']),
    AIRLINE('12', ['M3.10']),
    AIRLINE('13', ['M3.8']),
    AIRLINE('14', ['M3.6']),
    AIRLINE('15', ['M3.4']),
    AIRLINE('16', ['M3.2']),
    // Cargo stands 26-28 (26D, 28D code D, 27E code E): in via M1, nose north, out via A.
    { ...THROUGH('26', 'Cargo apron', ['M1.6', 'A.7']), use: 'cargo' },
    { ...THROUGH('26D', 'Cargo apron', ['M1.6', 'A.8'], 52), use: 'cargo' },
    { ...THROUGH('27', 'Cargo apron', ['M1.5', 'A.10']), use: 'cargo' },
    { ...THROUGH('27E', 'Cargo apron', ['M1.5', 'A.10'], 65), use: 'cargo' },
    { ...THROUGH('28', 'Cargo apron', ['M1.4', 'A.12']), use: 'cargo' },
    { ...THROUGH('28D', 'Cargo apron', ['M1.5', 'A.11'], 52), use: 'cargo' },
    // Remote stands 30-35: in via N2, nose south, out via M2.
    THROUGH('30', 'Main apron', ['N2.3', 'M2.17']),
    THROUGH('31', 'Main apron', ['N2.4', 'M2.14']),
    THROUGH('32', 'Main apron', ['N2.5', 'M2.11']),
    THROUGH('33', 'Main apron', ['N2.6', 'M2.9']),
    THROUGH('34', 'Main apron', ['N2.7', 'M2.8']),
    THROUGH('35', 'Main apron', ['N2.8', 'M2.5']),
    // West apron 40-44 (overnight): in via N4, nose south, out via M4; 40D/41D/43D code D, 40E code E.
    THROUGH('40', 'West apron', ['N4.1', 'M4.2']),
    THROUGH('40D', 'West apron', ['N4.1', 'M4.2'], 52),
    THROUGH('40E', 'West apron', ['N4.2', 'M4.3'], 65),
    THROUGH('41', 'West apron', ['N4.3', 'M4.4']),
    THROUGH('41D', 'West apron', ['N4.4', 'M4.5'], 52),
    THROUGH('42', 'West apron', ['N4.5', 'M4.7']),
    THROUGH('43', 'West apron', ['N4.7', 'M4.9']),
    THROUGH('43D', 'West apron', ['N4.6', 'M4.8'], 52),
    THROUGH('44', 'West apron', ['N4.8', 'M4.9']),
    // Business jets 81-86: 81, 83, 85 in from S4, nose north, out via M4; 82, 84, 86 nose south, pushback onto M4.
    { ...THROUGH('81', 'GA apron', ['S4.3', 'M4.1'], 24), use: 'ga' },
    { id: '82', apron: 'GA apron', maxWingspanM: 29, pushback: true, lanes: ['M4.3'], use: 'ga' },
    { ...THROUGH('83', 'GA apron', ['S4.5', 'M4.5'], 24), use: 'ga' },
    { id: '84', apron: 'GA apron', maxWingspanM: 29, pushback: true, lanes: ['M4.7'], use: 'ga' },
    { ...THROUGH('85', 'GA apron', ['S4.7', 'M4.9'], 24), use: 'ga' },
    { id: '86', apron: 'GA apron', maxWingspanM: 29, pushback: true, lanes: ['M4.9'], use: 'ga' },
  ],
});

/**
 * Paved areas OpenStreetMap does not have, digitised by hand from the AIP ground movement chart (AD 2 EDDN 2-7,
 * AMDT 01/26, georeferenced on its graticule; approximate, a few metres): the parts of the GA aprons and the J
 * corridor between the aprons that the OSM apron polygons leave out, the terminal frontage, the Hangar A
 * forecourt, and the FAI and Aero-Dienst aprons (the outlines of their areas of responsibility; the chart does
 * not shade them, their paving is inferred).
 */
const CHART_AREAS: [string, [number, number][]][] = [
  ['Apron G2 / G2A', [[49.4953276, 11.0727706], [49.4951511, 11.0745654], [49.4945082, 11.0744164], [49.4947208, 11.0722537], [49.4951124, 11.0723445], [49.4951086, 11.0724445], [49.4951284, 11.0724859], [49.4951816, 11.0725532], [49.4952365, 11.0726027], [49.4952879, 11.072688]]],
  ['Apron (S3 east)', [[49.4947496, 11.074454], [49.4945987, 11.0759885], [49.4947098, 11.0760142], [49.4946614, 11.0766272], [49.494299, 11.0765432], [49.4945099, 11.0743985]]],
  ['Apron (J)', [[49.4968446, 11.0719345], [49.4967913, 11.0724765], [49.4966735, 11.0724584], [49.4965999, 11.072478], [49.4965294, 11.072526], [49.4964756, 11.0725869], [49.4964685, 11.0726587], [49.4947208, 11.0722537], [49.4947988, 11.0714605]]],
  ['Apron (Hangar 8)', [[49.4959053, 11.0687192], [49.495855, 11.0692307], [49.4953389, 11.0691295], [49.4953362, 11.0691564], [49.4950907, 11.0690995], [49.4951516, 11.0684803], [49.4954848, 11.0685575], [49.4954903, 11.0686231]]],
  ['Apron (S4)', [[49.4953433, 11.0690846], [49.4950998, 11.0715614], [49.4947958, 11.071491], [49.4949017, 11.0704141], [49.494814, 11.0703938], [49.4949393, 11.0691195], [49.4950855, 11.0691534], [49.4950978, 11.0690277]]],
  ['Apron (west edge)', [[49.4970855, 11.0684512], [49.4970581, 11.0687294], [49.4960703, 11.0685005], [49.4960977, 11.0682223], [49.4962789, 11.0682643], [49.4962992, 11.0680579], [49.4963752, 11.0680755], [49.4963549, 11.0682819]]],
  ['FAI apron', [[49.4956649, 11.0670298], [49.4955211, 11.0684925], [49.4950652, 11.0683869], [49.4949991, 11.0686451], [49.4947174, 11.0685798], [49.4948875, 11.0668497]]],
  ['Aero-Dienst apron', [[49.4943249, 11.0729972], [49.4943037, 11.0732126], [49.4943388, 11.0732207], [49.4943211, 11.0734002], [49.4942993, 11.0737439], [49.4943354, 11.0738147], [49.4941644, 11.0755538], [49.4941141, 11.0755421], [49.49408, 11.0758885], [49.4938708, 11.07584], [49.4940748, 11.0737653], [49.4937007, 11.0736786], [49.4937801, 11.072871]]],
  ['Apron (terminal frontage)', [[49.4953925, 11.074603], [49.4950073, 11.0784604], [49.4948904, 11.0784333], [49.4952698, 11.0745745]]],
  ['Apron (Hangar A)', [[49.4945148, 11.0846242], [49.4943911, 11.0855776], [49.4942684, 11.0855491], [49.4943628, 11.0845889]]],
];

/** Thresholds: AIP AD 2.12 (not displaced; the paved areas beyond them are tagged stopway in OSM, the AIP lists none). */
const END_10 = { lat: 49.5005506, lon: 11.05917 };
const END_28 = { lat: 49.4969253, lon: 11.0960247 };

export const EDDN: AirportData = {
  icao: 'EDDN',
  name: 'Nuremberg',
  city: 'Nuremberg',
  country: 'Germany',
  arp: { lat: 49.4987, lon: 11.078008 },
  elevationFt: 1044,
  magneticVariation: 4.3,
  timeZone: 'Europe/Berlin',
  // Runway 28 is preferred; westerly winds prevail (estimate).
  wind: { primaryShare: 0.65, primary: [230, 310], secondary: [50, 130] },
  transitionAltitudeFt: 5000,
  // Initial climb FL70 on the RNAV SIDs (SOP).
  initialClimbFt: 7000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL), checked against the AIP charts; general aviation aprons without parking positions. Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '10/28',
      widthM: 45,
      lengthM: 2700,
      ends: [
        // AIP: ILS CAT I or LOC 10 (also VOR, RNP), ILS CAT II / III or LOC Z 28 (also LOC Y, RNP).
        { name: '10', threshold: END_10, end: END_10, elevationFt: 1020, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '28', threshold: END_28, end: END_28, elevationFt: 1044, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: [...built.areas, ...CHART_AREAS.map(([name, polygon]) => ({ name, polygon: polygon.map(([lat, lon]) => ({ lat, lon })) }))],
  buildings: built.buildings,
  pavement: [
    ...built.pavement,
    // Unnamed lane from S3 south between Hangar 4 and Hangar 3 into the Aero-Dienst apron (ground movement chart).
    { points: [[49.4946759, 11.0742773], [49.4946134, 11.0742462], [49.4944806, 11.07421], [49.4943698, 11.0741824], [49.4942879, 11.0741635]].map(([lat, lon]) => ({ lat, lon })), widthM: 10.5 },
  ],
  stations: [
    { callsign: 'EDDN_GND', type: 'GND', name: 'Nuernberg Ground', frequency: '121.760' },
    { callsign: 'EDDN_TWR', type: 'TWR', name: 'Nuernberg Tower', frequency: '118.305' },
    { callsign: 'EDDN_APP', type: 'APP', name: 'Muenchen Radar', frequency: '129.525' },
    { callsign: 'EDDN_ATIS', type: 'ATIS', name: 'Nuernberg Information', frequency: '123.080' },
  ],
  runwayOps: [
    {
      runway: '28',
      // Declared distances (AIP AD 2.13). C (1289 m) is published but not used for departures (SOP).
      departureEntries: [
        { holdingPoint: 'A', intersection: 'A', fullLength: true, toraM: 2700 },
        { holdingPoint: 'B', intersection: 'B', fullLength: false, toraM: 1962 },
      ],
      // Not earlier than C (a departure may be waiting at B).
      exits: [exitVia(built, 'C', 'HP.1868560670'), exitVia(built, 'D', 'HP.249666665'), exitVia(built, 'E', 'HP.249666656'), exitVia(built, 'F', 'HP.249666646')],
    },
    {
      runway: '10',
      // Declared distances (AIP AD 2.13). D on request (SOP); C (1461 m) is published but not used for departures.
      departureEntries: [
        { holdingPoint: 'F', intersection: 'F', fullLength: true, toraM: 2700 },
        { holdingPoint: 'E', intersection: 'E', fullLength: false, toraM: 2300 },
        { holdingPoint: 'D', intersection: 'D', fullLength: false, toraM: 1900 },
      ],
      exits: [exitVia(built, 'C', 'HP.1868560670'), exitVia(built, 'B', 'HP.1868560665'), exitVia(built, 'A', 'HP.1523471664')],
    },
  ],
  // RNAV SIDs (G = runway 28, C = runway 10; VATSIM Germany SOP and the chart index): each flight is planned via
  // the exit fix towards its destination - ERETO north-east, RODIS east / south-east, BOLSI south-west, SUKAD
  // west, SULUS north-west (only for flights continuing on L604). Numbers change with the AIRAC cycle. The local
  // training SID ERL and the conventional NUB SIDs (non-RNAV aircraft) are not modelled.
  sids: (['28', '10'] as const).flatMap((runway) =>
    (
      [
        ['BOLSI', [150, 250]],
        ['ERETO', [0, 60]],
        ['RODIS', [60, 150]],
        ['SUKAD', [250, 320]],
        ['SULUS', [320, 360]],
      ] as [string, [number, number]][]
    ).map(([fix, towards]) => ({ name: `${fix}1${runway === '28' ? 'G' : 'C'}`, runway, fix, towards })),
  ),
  // Not an A-CDM airport; datalink clearances are offered.
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'dcl', 'loc', 'gp'],
  traffic: {
    source: 'Nuremberg Airport route network, operator shares estimated',
    rateFactor: 0.6,
    operators: [
      { airline: 'EWG', weight: 22, types: ['A319', 'A320', 'A20N'], destinations: ['LEPA', 'LEPA', 'EDDH', 'EDDB', 'EDDL', 'GCLP', 'LGIR', 'LTAI', 'LIRF'] },
      { airline: 'RYR', weight: 15, types: ['B738', 'B38M'], destinations: ['EGSS', 'LEPA', 'LEMG', 'LEAL', 'EIDW', 'LPPR', 'LIME', 'LGTS'] },
      { airline: 'DLH', weight: 10, types: ['A319', 'A320', 'A20N'], destinations: ['EDDF'] },
      { airline: 'CLH', weight: 6, types: ['CRJ9', 'E195'], destinations: ['EDDF', 'EDDM'] },
      { airline: 'TUI', weight: 9, types: ['B738', 'B38M'], destinations: ['LEPA', 'GCFV', 'GCTS', 'HEGN', 'LGKO', 'LTAI'] },
      { airline: 'CFG', weight: 8, types: ['A320', 'A321', 'A21N'], destinations: ['LEPA', 'GCRR', 'HEGN', 'LTAI', 'LGRP'] },
      { airline: 'SXS', weight: 8, types: ['B738', 'B38M'], destinations: ['LTAI', 'LTAI', 'LTBJ', 'LTFE'] },
      { airline: 'PGT', weight: 3, types: ['A20N', 'B38M'], destinations: ['LTFJ', 'LTAI'] },
      { airline: 'THY', weight: 4, types: ['A321', 'B738'], destinations: ['LTFM'] },
      { airline: 'KLC', weight: 4, types: ['E190', 'E295'], destinations: ['EHAM'] },
      { airline: 'AFR', weight: 3, types: ['A319', 'A320'], destinations: ['LFPG'] },
      { airline: 'WZZ', weight: 3, types: ['A320', 'A21N'], destinations: ['LROP', 'LBSF', 'LWSK'] },
      { airline: 'DCX', weight: 5 },
    ],
  },
  briefing: [
    {
      title: 'Nuremberg in short',
      items: [
        'One runway 10/28 (2700 m), **28 preferred** - the direction changes only with more than 5 kt tailwind. One parallel taxiway south of it, between the runway and the aprons: **F** (west part, up to the C / M2 / N2 junction) and **A** (east part, from the M2 / B junction); the exits A-F run between it and the runway, J and C lead from the apron to F, M2 from the east end of the apron to A and B.',
        'Approaches: **ILS 28** (CAT II / III) and **ILS 10** (CAT I). Hot spot: the junction where M3 joins M2 (C, F, H4) - check the taxi clearance.',
        'Nuernberg Ground also gives the IFR clearances (datalink clearances are common); Nuremberg is not an A-CDM airport.',
        'Departures 28 at **A** (full length, 2700 m) or intersection **B** (1962 m); departures 10 at **F** (2700 m), intersection **E** (2300 m) or **D** (1900 m). Aircraft up to 2 t are normally cleared from B / E. Intersection C is not used for departures.',
        'Landing aircraft vacate **not earlier than C** (a departure may be waiting at B / E); 28: C, D, E or F at the end; 10: C, B or A at the end.',
        'Stands 01-16 at the terminal are pushback stands (nose south). The remote stands 30-35 are entered via N2 and left via M2, 40-44 via N4 and M4 - taxiing behind parked aircraft on N2 / N4 is usually not possible, so fill them from the far end. Cargo 26-28 (nose north, out via A).',
        'Taxiways B, C, E and N2 are for code C (36 m) only, D for code D (52 m); J is code C from F to M4 (code D / E only cross it between M3 and M4 / N4) and code B south of M4. The GA lanes S3, S4 and T2 are code B.',
      ],
    },
  ],
};
