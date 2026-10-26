import type { AirportData } from '../../core/airport/types';
import { SLLP_LAYOUT } from './sllp.layout';
import { buildLayout, exitVia, layoutEdges, type StandSpec } from './osmLayout';

/**
 * La Paz El Alto International Airport (SLLP) - 13314 ft, one of the highest airports in the world.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (sllp.layout.ts). Facts: AIP Bolivia AD 2 SLLP (an older edition, about 2015, as published by IVAO Bolivia for
 * simulation - the current AIP of NAABOL needs a login), used as a reference only: runway, thresholds and
 * elevations, declared distances, taxiway designators and widths, frequencies, the ILS, the SIDs with their end
 * fixes (area chart), the turning area at threshold 10. See docs/airports/SLLP.md.
 *
 * One runway 10/28 (4000 m, 1.55 % slope: threshold 28 lies 204 ft higher) and **no parallel taxiway**: A leads
 * from the main apron diagonally to the runway 1230 m from its east end, B to the east end. Departures 10 backtrack
 * from A to the turning area at threshold 10; arrivals 28 backtrack to A.
 *
 * Simplifications: the third taxiway C of the AIP is not named in OpenStreetMap and could not be placed (the chart
 * copy has no labels) - the unnamed link from B to the north-east is drawn. The presidential, auxiliary and air
 * force aprons north of the main apron are drawn, not used.
 */

/** Stand from OpenStreetMap; sizes estimated from the stand spacing (the AIP gives none). */
const STAND = (id: string, maxWingspanM: number): StandSpec => ({ id, apron: 'Main apron', maxWingspanM, pushback: true });

/** The presidential, auxiliary and air force aprons north of the main apron (drawn, not used). */
const NORTH: [number, number][] = [
  [-16.5075, -68.19],
  [-16.495, -68.19],
  [-16.495, -68.165],
  [-16.5075, -68.165],
];

const built = buildLayout(SLLP_LAYOUT, {
  runway: '10/28',
  holdingPoints: {
    'HP.412562691': 'A',
    'HP.412567838': 'B',
  },
  // OpenStreetMap maps the stand lead-in lines as taxiways named after the stands, and the way north as "9".
  taxiwayNames: { '1': '', '2': '', '3': '', '4': '', '5': '', '6': '', '7': '', '9': '' },
  drawOnly: [
    ...layoutEdges(SLLP_LAYOUT, { names: ['9'], inside: [NORTH] }),
    // The unnamed link from B to the north-east (perhaps C, see above).
    'HP.412567838>?.27', '?.27>?.28', '?.28>?.29',
  ],
  taxilanes: [''],
  // AIP AD 2.8: A, B and C 23 m.
  widthM: { A: 23, B: 23 },
  stands: [STAND('1', 52), STAND('2', 36), STAND('3', 36), STAND('4', 36), STAND('5', 36), STAND('6', 52), STAND('7', 52)],
});

/** AIP AD 2.12: the thresholds (no displacement). */
const THR_10 = { lat: -(16 + 30 / 60 + 45.88 / 3600), lon: -(68 + 12 / 60 + 39.51 / 3600) };
const THR_28 = { lat: -(16 + 30 / 60 + 50.14 / 3600), lon: -(68 + 10 / 60 + 24.73 / 3600) };

/** Sectors halfway between the bearings of the end fixes (area chart of the departure routes). */
const SID = (name: string, fix: string, towards: [number, number], runways = ['10', '28']) => runways.map((runway) => ({ name, runway, fix, towards }));

export const SLLP: AirportData = {
  icao: 'SLLP',
  name: 'La Paz',
  city: 'El Alto',
  country: 'Bolivia',
  fir: 'SLLF',
  arp: { lat: -(16 + 30 / 60 + 45 / 3600), lon: -(68 + 11 / 60 + 32 / 3600) },
  elevationFt: 13314,
  magneticVariation: -7,
  timeZone: 'America/La_Paz',
  // Westerly winds most of the year (runway 28), easterlies otherwise.
  wind: { primaryShare: 0.6, primary: [230, 320], secondary: [50, 130] },
  transitionAltitudeFt: 18000,
  initialClimbFt: 17000,
  // The Altiplano at 4000 m: cold all year.
  climate: { monthlyMeanC: [9, 9, 9, 8, 6, 4, 4, 5, 7, 8, 9, 9] },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway, frequencies and SIDs after an older edition of the AIP Bolivia (facts only). Taxiway C not identified; stand sizes estimated; northern aprons drawn, not used. Not for real-world navigation.',
  runways: [
    {
      name: '10/28',
      widthM: 46,
      lengthM: 4000,
      ends: [
        // ILS CAT I, VOR and NDB approaches to runway 10; runway 28 is a visual approach (flown as RNP here).
        { name: '10', threshold: THR_10, end: THR_10, elevationFt: 13110, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '28', threshold: THR_28, end: THR_28, elevationFt: 13314, approaches: ['RNP'] },
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
    { callsign: 'SLLP_GND', type: 'GND', name: 'La Paz Ground', frequency: '121.900' },
    { callsign: 'SLLP_TWR', type: 'TWR', name: 'La Paz Tower', frequency: '118.300' },
    { callsign: 'SLLP_APP', type: 'APP', name: 'La Paz Approach', frequency: '119.500' },
  ],
  runwayOps: [
    {
      runway: '28',
      // Full length from B at the east end.
      departureEntries: [{ holdingPoint: 'B', intersection: 'B', fullLength: true, toraM: 4000 }],
      // Landing west: A leads back towards the apron - arrivals turn around on the runway and backtrack to it.
      exits: [{ ...exitVia(built, 'A', 'HP.412562691'), backtrack: true }],
    },
    {
      runway: '10',
      // From A with a backtrack to the turning area at threshold 10 (AIP AD 2.23); 1230 m remain from A without it
      // (measured on the map).
      departureEntries: [{ holdingPoint: 'A', intersection: 'A', fullLength: true, backtrack: true, toraM: 1230 }],
      // Landing east, uphill: to the end and off via B - A is the way of the departures backtracking to threshold 10
      // (a simulator convention: arrivals vacating at A would meet them head-on).
      exits: [exitVia(built, 'B', 'HP.412567838')],
    },
  ],
  // SIDs of AD 2.24, planned by the direction of the destination; KIGAX, RENEP, REDIR and SALKO from runway 28 only.
  sids: [
    ...SID('ELAMU1', 'ELAMU', [348, 52]),
    ...SID('ELAMU2', 'ELAMU', [348, 52]),
    ...SID('RENEP1', 'RENEP', [17, 40], ['28']),
    ...SID('REDIR1', 'REDIR', [40, 52], ['28']),
    ...SID('SALKO1', 'SALKO', [52, 59], ['28']),
    ...SID('KIGAX1', 'KIGAX', [59, 82], ['28']),
    ...SID('TERAX1', 'TERAX', [52, 110]),
    ...SID('DAKOG1', 'DAKOG', [110, 124]),
    ...SID('UREMA1', 'UREMA', [124, 140]),
    ...SID('ARPIS7', 'ARPIS', [140, 155]),
    ...SID('LONAB1', 'LONAB', [155, 175]),
    ...SID('IROBO1', 'IROBO', [175, 208]),
    ...SID('TEGUM1', 'TEGUM', [208, 235]),
    ...SID('KOVIS1', 'KOVIS', [235, 257]),
    ...SID('KOMPA6', 'KOMPA', [257, 286]),
    ...SID('KOMPA7', 'KOMPA', [257, 286]),
    ...SID('ELAKO6', 'ELAKO', [286, 317]),
    ...SID('ELAKO7', 'ELAKO', [286, 317]),
    ...SID('KIBUX1', 'KIBUX', [317, 348]),
  ],
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'El Alto International Airport route network 2026 (Wikipedia); operator shares estimated',
    rateFactor: 0.3,
    standReserve: 1,
    operators: [
      { airline: 'BOV', weight: 50 },
      { airline: 'AVA', weight: 6, types: ['A320'], destinations: ['SKBO'] },
      { airline: 'CMP', weight: 6, types: ['B738'], destinations: ['MPTO'] },
      { airline: 'LPE', weight: 6, types: ['A320'], destinations: ['SPJC'] },
      { airline: 'AAL', weight: 3, types: ['B738'], destinations: ['KMIA'] },
    ],
  },
  briefing: [
    {
      title: 'La Paz in short',
      items: [
        'One runway **10/28**, 4000 m, at **13314 ft** on the Altiplano - the thin air means long take-off runs and fast landings. The runway slopes 1.55 %: threshold 28 lies 204 ft higher than threshold 10.',
        '**No parallel taxiway**: **A** leads diagonally from the main apron to the runway, 1230 m from its east end; **B** to the east end. There is a turning area at threshold 10.',
        'Runway **28**: departures from **B** (full length); arrivals roll west, turn around and **backtrack** to A. Runway **10**: departures enter at **A** and **backtrack** to threshold 10; arrivals roll uphill to the end and vacate via B.',
        'ILS only to runway 10. La Paz Ground gives the clearances (no Delivery). SIDs to the fixes of the area chart, every departure climbs to 17000 ft first; transition altitude 18000 ft. Runway 10: no piston aircraft for take-off (AIP).',
        'The presidential, auxiliary and air force aprons north of the main apron are drawn, not used.',
      ],
    },
  ],
};
