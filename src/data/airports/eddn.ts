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
 * Simplifications: the general aviation aprons (G1-G3, U1, U2, FAI, Aerodienst) and helipads are
 * not modelled (only the GA stands 81-86); the CAT II/III holding points on J, F/C and B are plain
 * junctions (no low visibility operations).
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
  // The unnamed link from the east end of the apron (M1 / M2) to B and N2 is part of A.
  taxiwayNames: { '?': 'A' },
  // The short piece between A and the apron link is A as well (B starts at the A / B junction).
  edgeNames: { 'A/B>?/B/N2': 'A' },
  // GA taxiway T2 is not modelled (its dead end is pruned).
  dropEdges: ['T2.2>S4/T2'],
  // SOP: B, C, E, J and N2 code C only, D code D; GA lanes S3 / S4 code B. J is not limited here: larger
  // aircraft cross it between M3 and M4 / N4, and the simulator does not split J into parts.
  maxWingspanM: { B: 36, C: 36, E: 36, N2: 36, D: 52, S3: 24, S4: 24 },
  // Pavement widths: OSM `width` tags (A, B, C, D, F: 20 m); the others keep the default.
  widthM: { A: 20, B: 20, C: 20, D: 20, F: 20 },
  taxilanes: ['M1', 'M2', 'M3', 'M4', 'N2', 'N4', 'S3', 'S4'],
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

/** Runway ends from the OSM runway centre line (the paved stopways beyond are not part of it). */
const END_10 = { lat: 49.5005453, lon: 11.0591528 };
const END_28 = { lat: 49.4969237, lon: 11.096002 };

export const EDDN: AirportData = {
  icao: 'EDDN',
  name: 'Nuremberg',
  city: 'Nuremberg',
  country: 'Germany',
  arp: { lat: 49.498699, lon: 11.078056 },
  elevationFt: 1046,
  magneticVariation: 4.3,
  timeZone: 'Europe/Berlin',
  // Runway 28 is preferred; westerly winds prevail (estimate).
  wind: { primaryShare: 0.65, primary: [230, 310], secondary: [50, 130] },
  transitionAltitudeFt: 5000,
  // Initial climb FL70 on the RNAV SIDs (SOP).
  initialClimbFt: 7000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); general aviation aprons simplified. Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '10/28',
      widthM: 45,
      lengthM: 2700,
      ends: [
        { name: '10', threshold: END_10, end: END_10, elevationFt: 1022 },
        { name: '28', threshold: END_28, end: END_28, elevationFt: 1046 },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  stations: [
    { callsign: 'EDDN_GND', type: 'GND', name: 'Nuernberg Ground', frequency: '121.760' },
    { callsign: 'EDDN_TWR', type: 'TWR', name: 'Nuernberg Tower', frequency: '118.305' },
    { callsign: 'EDDN_APP', type: 'APP', name: 'Muenchen Radar', frequency: '129.525' },
    { callsign: 'EDDN_ATIS', type: 'ATIS', name: 'Nuernberg Information', frequency: '123.080' },
  ],
  runwayOps: [
    {
      runway: '28',
      departureEntries: [
        { holdingPoint: 'A', intersection: 'A', fullLength: true },
        { holdingPoint: 'B', intersection: 'B', fullLength: false },
      ],
      // Not earlier than C (a departure may be waiting at B).
      exits: [exitVia(built, 'C', 'HP.1868560670'), exitVia(built, 'D', 'HP.249666665'), exitVia(built, 'E', 'HP.249666656'), exitVia(built, 'F', 'HP.249666646')],
    },
    {
      runway: '10',
      departureEntries: [
        { holdingPoint: 'F', intersection: 'F', fullLength: true },
        { holdingPoint: 'E', intersection: 'E', fullLength: false },
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
        'One runway 10/28 (2700 m), **28 preferred** - the direction changes only with more than 5 kt tailwind. One parallel taxiway north of it: **F** (west part) and **A** (east part); the exits A-F run between it and the runway, J and C lead from the apron to F.',
        'Nuernberg Ground also gives the IFR clearances (datalink clearances are common); Nuremberg is not an A-CDM airport.',
        'Departures 28 at **A** (full length), small aircraft from intersection B; departures 10 at **F**, small aircraft from E. Intersection C is not used for departures.',
        'Landing aircraft vacate **not earlier than C** (a departure may be waiting at B / E); 28: C, D, E or F at the end; 10: C, B or A at the end.',
        'Stands 01-16 at the terminal are pushback stands (nose south). The remote stands 30-35 are entered via N2 and left via M2, 40-44 via N4 and M4 - taxiing behind parked aircraft on N2 / N4 is usually not possible, so fill them from the far end. Cargo 26-28 (nose north, out via A).',
        'Taxiways B, C, E, J and N2 are for code C (36 m) only, D for code D (52 m).',
      ],
    },
  ],
};
