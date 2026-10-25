import type { AirportData } from '../../core/airport/types';
import { NZWN_LAYOUT } from './nzwn.layout';
import { buildLayout, exitVia, type StandSpec } from './osmLayout';

/**
 * Wellington International Airport (NZWN) - the first airport in Australia / Oceania.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (nzwn.layout.ts): runway 16/34 with its displaced thresholds, the taxiways A1-A11 and A, the apron taxiways
 * B, B5-B10, R, S, T, U, the pushback holding zones Z1-Z6, the stands with their lead-in lines. Facts: runway
 * length and take-off runs (Wellington Airport, Wikipedia), the VATNZ NZWN procedures (positions and
 * frequencies, holding points by aircraft type, the SIDs and which aircraft fly them), OurAirports. The AIP
 * New Zealand was not used (its conditions of use). See docs/airports/NZWN.md.
 *
 * One runway 16/34 (1815 m between the thresholds, 130 m before the 16 threshold and 106 m before the 34
 * threshold usable for the take-off run) on the Rongotai isthmus; the parallel taxiway A on the east side, the
 * terminal piers east of it. The Western Apron (general aviation, military, helicopters) across the runway is
 * drawn, not used.
 */

/** Stand from OpenStreetMap; the sizes are estimates (regional, light, jet), not published figures. */
const STAND = (id: string, apron: string, maxWingspanM: number): StandSpec => ({ id, apron, maxWingspanM, pushback: true });
/** Light turboprops (Sounds Air C208 / PC12): the small positions inside a regional stand. */
const LIGHT = 17;
/** ATR 72. */
const REGIONAL = 30;
/** A320 / A321 / B737. */
const JET = 36;

const built = buildLayout(NZWN_LAYOUT, {
  runway: '16/34',
  holdingPoints: {
    // A1 is mapped as the ILS holding position (the runway holding position of A1).
    'HP.1300414866': 'A1',
    'HP.8183963929': 'A2',
    'HP.6040972673': 'A3',
    'HP.6040972686': 'A4',
    'HP.10692327376': 'A5',
    'HP.10692327375': 'A6',
    'HP.8183963925': 'A7',
    'HP.6040972699': 'A8',
    // A9 forks behind its holding line (two holding positions in OSM, one line): the branch is kept.
    'HP.8183963924': 'A9',
    'HP.8183963923': 'A10',
    'HP.6040972619': 'A11',
  },
  // Points on A 60 m south of the links A2-A4: arrivals 34 that vacate there stop on A clear of the junction
  // (OpenStreetMap has A as one straight line between them).
  addNodes: [
    ['A.S2', -41.3198365, 174.8086634],
    ['A.S3', -41.3225268, 174.8084748],
    ['A.S4', -41.3249193, 174.8083141],
  ],
  addEdges: [
    ['A/A2.2', 'A.S2', 'A', 'taxiway'],
    ['A.S2', 'A/A3', 'A', 'taxiway'],
    ['A/A3', 'A.S3', 'A', 'taxiway'],
    ['A.S3', 'HP.8971352891', 'A', 'taxiway'],
    ['A/A4', 'A.S4', 'A', 'taxiway'],
    ['A.S4', '?/A.2', 'A', 'taxiway'],
  ],
  // Crosses taxiway A without a junction in OpenStreetMap (B8 / A8 meet A at their own junctions); the long
  // straights of A that are split above.
  dropEdges: ['?/B9>?.31', 'A/A2.2>A/A3', 'A/A3>HP.8971352891', 'A/A4>?/A.2'],
  edgeNames: {
    // Fillets and links that are unnamed in OpenStreetMap carry the name of the taxiway they belong to.
    '?/B/B9>?.1': 'T',
    '?.1>?/T': 'T',
    '?/B8>?.2': 'B8',
    '?.2>?.3': 'B8',
    '?.3>?.4': 'B8',
    '?.4>?/A': 'B8',
    'HP.6040972699>?.5': 'A8',
    '?.5>?/A/B9': 'A8',
    '?/A/B9.2>?.26': 'A8',
    '?.26>?.5': 'A8',
    '?/A.9>?.30': 'A8',
    '?.30>?.31': 'A8',
    '?.31>HP.6040972699': 'A8',
    '?/B8>?/B9': 'B8',
    '?/C.4>?.6': 'S',
    '?.6>?/S': 'S',
    '?/S>?.7': 'S',
    '?.7>?/C.3': 'S',
    '?/B.2>?.27': 'S',
    '?.27>?.28': 'S',
    '?.28>?.29': 'S',
    '?.29>?/B.3': 'S',
    'HP.8967903580>?.28': 'S',
    '?.28>?/B/B9.2': 'S',
    '?/C.5>?.8': 'R',
    '?.8>?/R': 'R',
    'HP.6188414191>?.34': 'R',
    '?.34>?/B/B9.3': 'R',
    '?.44>HP.6188414191': 'R',
    '?/B.4>?.44': 'R',
    '?/T.2>?.9': 'T',
    '?.9>?/C.2': 'T',
    '?/B>?.15': 'T',
    '?.15>?/T': 'T',
    'HP.6040972363>?.10': 'U',
    '?.10>?.11': 'U',
    '?.11>?/C': 'U',
    '?.10>?/D': 'U',
    '?/C>?.12': 'C',
    '?.12>?/T.2': 'C',
    '?/D>?.13': 'D',
    '?.13>?/C': 'D',
    '?/B10>?.14': 'B',
    '?.14>?/B': 'B',
    'HP.8967915038>?.16': 'B',
    '?.16>?/B': 'B',
    '?/A.5>?.17': 'B10',
    '?.17>?/B10.2': 'B10',
    '?/B10.2>?.18': 'B10',
    '?.18>?/A.6': 'B10',
    '?.19>?/A.7': 'A5',
    '?.19>?/A5': 'A5',
    '?/A5>?.20': 'A5',
    '?.20>?.21': 'A5',
    '?.21>?/A.2': 'A5',
    'HP.8967903576>?.37': 'B5',
    '?.37>?.35': 'B5',
    '?.35>?/A.4': 'B5',
    '?/A.4>?.19': 'B5',
    '?.35>?/A.3': 'B5',
    '?/A.12>?.36': 'B5',
    '?.36>?.37': 'B5',
    '?/A.8>?.22': 'A6',
    '?.22>?.23': 'A6',
    '?.23>?/A6': 'A6',
    '?/A6>?.24': 'B6',
    '?.24>?.25': 'B6',
    '?.25>?/A/B6': 'B6',
    '?/A/A6>?.46': 'B6',
    '?.46>?/B6': 'B6',
    '?/A.8>?.47': 'B6',
    '?.47>?.46': 'B6',
    '?/B/Q>?/B7.2': 'B7',
    '?/B.6>?/Q': 'Q',
    'HP.8967903573>?.32': 'B7',
    '?.32>?/B.5': 'B7',
    '?/B7>?.33': 'B7',
    '?.33>?/A.10': 'B7',
    'HP.8183963925>?.38': 'A7',
    '?.38>?.39': 'A7',
    '?.39>?/A.11': 'A7',
    '?/A.11>?.40': 'B7',
    '?.40>?/B7': 'B7',
    '?/A.10>?.41': 'A7',
    '?.41>?.42': 'A7',
    '?.42>HP.8183963925': 'A7',
    'HP.8967903572>?.43': 'B8',
    '?.43>?/B.4': 'B8',
    '?/B/B9.3>?.45': 'B8',
    '?.45>HP.8967903572': 'B8',
  },
  // The northern fillet of A5 is drawn, not used: arrivals vacating at A5 turn south towards the terminal.
  drawOnly: [
    '?/A5>?.20', '?.20>?.21', '?.21>?/A.2',
    'HP.8971353041>M/M5', 'M/M5>HP.8183963927', 'HP.8183963927>RWY.A5/M5',
    'M/M4/N>HP.8971352803', 'HP.8971352803>RWY.M4',
    'M/M4/N>N.1', 'N.1>N.2', 'N.2>N.3', 'N.3>N.4', 'N.4>N.5',
    'M/M4/N>M.1', 'M.1>HP.8971353040', 'HP.8971353040>M/M5', 'M/M5>HP.8971353042', 'HP.8971353042>M.2', 'M.2>M.3',
  ],
  // The apron lanes along the piers.
  taxilanes: ['C', 'D', 'P', 'Q'],
  widthM: { A: 23 },
  stands: [
    // South pier and regional apron (D): ATR 72, the N / S positions for light turboprops.
    STAND('3N', 'South pier', LIGHT),
    STAND('3S', 'South pier', LIGHT),
    STAND('4N', 'South pier', LIGHT),
    STAND('4S', 'South pier', LIGHT),
    STAND('5', 'South pier', REGIONAL),
    STAND('5N', 'South pier', LIGHT),
    STAND('5S', 'South pier', LIGHT),
    STAND('6', 'South pier', REGIONAL),
    STAND('7E', 'South pier', REGIONAL),
    STAND('7W', 'South pier', REGIONAL),
    STAND('9', 'South pier', REGIONAL),
    STAND('10', 'South pier', REGIONAL),
    STAND('11', 'South pier', REGIONAL),
    STAND('12', 'South pier', REGIONAL),
    STAND('R1', 'South pier', JET),
    STAND('R2', 'South pier', JET),
    STAND('R2N', 'South pier', LIGHT),
    STAND('R2S', 'South pier', LIGHT),
    // South-west pier (C, Q): Air New Zealand domestic jets.
    STAND('13', 'South-west pier', JET),
    STAND('15', 'South-west pier', JET),
    STAND('16', 'South-west pier', JET),
    STAND('16N', 'South-west pier', REGIONAL),
    STAND('16S', 'South-west pier', REGIONAL),
    STAND('17', 'South-west pier', JET),
    // Main apron along B and C (regional).
    STAND('72N', 'Main apron', REGIONAL),
    STAND('72S', 'Main apron', REGIONAL),
    STAND('73N', 'Main apron', REGIONAL),
    STAND('73S', 'Main apron', REGIONAL),
    STAND('74N', 'Main apron', REGIONAL),
    STAND('74S', 'Main apron', REGIONAL),
    STAND('75N', 'Main apron', REGIONAL),
    STAND('75S', 'Main apron', REGIONAL),
    STAND('76N', 'Main apron', REGIONAL),
    STAND('76S', 'Main apron', REGIONAL),
    STAND('77N', 'Main apron', REGIONAL),
    STAND('77S', 'Main apron', REGIONAL),
    STAND('78N', 'Main apron', REGIONAL),
    STAND('78S', 'Main apron', REGIONAL),
    STAND('79N', 'Main apron', REGIONAL),
    STAND('79S', 'Main apron', REGIONAL),
    // North-west pier (Q, B, P): Jetstar and the international flights.
    STAND('21', 'North-west pier', JET),
    STAND('22', 'North-west pier', JET),
    STAND('23', 'North-west pier', JET),
    STAND('24', 'North-west pier', JET),
    STAND('24AN', 'North-west pier', REGIONAL),
    STAND('24AS', 'North-west pier', REGIONAL),
    STAND('25', 'North-west pier', JET),
    STAND('26', 'North-west pier', JET),
    STAND('27', 'North-west pier', JET),
    STAND('28', 'North-west pier', JET),
    STAND('29', 'North-west pier', JET),
  ],
});

/** The thresholds (OpenStreetMap) and the runway ends: the take-off run starts behind the displaced thresholds. */
const THR_16 = { lat: -41.318629, lon: 174.8074633 };
const END_16 = { lat: -41.3174611, lon: 174.8075385 };
const THR_34 = { lat: -41.3349319, lon: 174.8063655 };
const END_34 = { lat: -41.3358955, lon: 174.8063034 };

export const NZWN: AirportData = {
  icao: 'NZWN',
  name: 'Wellington',
  city: 'Wellington',
  country: 'New Zealand',
  fir: 'NZZC',
  arp: { lat: -41.327222, lon: 174.805278 },
  elevationFt: 41,
  magneticVariation: 23,
  timeZone: 'Pacific/Auckland',
  // Northerlies most of the year (runway 34), southerlies with the fronts (runway 16).
  wind: { primaryShare: 0.6, primary: [320, 380], secondary: [150, 210] },
  transitionAltitudeFt: 13000,
  climate: { monthlyMeanC: [18, 18, 17, 14, 12, 10, 10, 10, 11, 13, 14, 16] },
  // Curfew midnight to 06:00 local; international arrivals may still land until 01:00 (Wellington Airport).
  nightRestrictions: {
    jetDepartures: { from: 0, until: 6 * 60 },
    landings: { from: 0, until: 6 * 60 },
    delayedLandingsUntil: 60,
    source: 'Wellington Airport noise curfew (midnight to 6 am, international arrivals until 1 am)',
  },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); positions, frequencies, holding points and SIDs after the VATNZ procedures; take-off runs after Wellington Airport. Stand sizes and intersection take-off runs estimated. Western Apron drawn, not used. Not for real-world navigation.',
  runways: [
    {
      name: '16/34',
      widthM: 45,
      lengthM: 2051,
      ends: [
        { name: '16', threshold: THR_16, end: END_16, elevationFt: 41, approaches: ['ILS', 'RNP'] },
        { name: '34', threshold: THR_34, end: END_34, elevationFt: 41, approaches: ['ILS', 'RNP'] },
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
    { callsign: 'NZWN_DEL', type: 'DEL', name: 'Wellington Delivery', frequency: '128.200' },
    { callsign: 'NZWN_GND', type: 'GND', name: 'Wellington Ground', frequency: '121.900' },
    { callsign: 'NZWN_TWR', type: 'TWR', name: 'Wellington Tower', frequency: '118.800' },
    { callsign: 'NZWN_APP', type: 'APP', name: 'Wellington Approach', frequency: '119.300' },
    { callsign: 'NZWN_ATIS', type: 'ATIS', name: 'Wellington', frequency: '126.900' },
  ],
  runwayOps: [
    {
      runway: '16',
      // Full length from A1 at the north end (1945 m to the 34 threshold); A2 and A3 for turboprops (VATNZ: large
      // jets A1, medium jets A1 or A2, turboprops A2 or A3). The intersection runs are measured on the map.
      departureEntries: [
        { holdingPoint: 'A1', intersection: 'A1', fullLength: true, toraM: 1945 },
        { holdingPoint: 'A2', intersection: 'A2', fullLength: false, toraM: 1745 },
        { holdingPoint: 'A3', intersection: 'A3', fullLength: false, toraM: 1455 },
      ],
      // Landing south, towards the terminal: A6 to A10 (from A6 on to B6 and B; A5 would put arrivals head-on with
      // the departures going north on A).
      exits: [
        exitVia(built, 'A6', 'HP.10692327375'),
        exitVia(built, 'A7', 'HP.8183963925'),
        exitVia(built, 'A8', 'HP.6040972699'),
        exitVia(built, 'A9', 'HP.8183963924'),
        exitVia(built, 'A10', 'HP.8183963923'),
      ],
    },
    {
      runway: '34',
      // Full length from A11 at the south end (1921 m to the 16 threshold); A10 at the threshold, A9 (angled) for
      // turboprops (VATNZ: jets A10, turboprops A9 or A10).
      departureEntries: [
        { holdingPoint: 'A11', intersection: 'A11', fullLength: true, toraM: 1921 },
        { holdingPoint: 'A10', intersection: 'A10', fullLength: false, toraM: 1815 },
        { holdingPoint: 'A9', intersection: 'A9', fullLength: false, toraM: 1725 },
      ],
      // Landing north, away from the terminal: A7 to A2, then back south on A.
      exits: [
        exitVia(built, 'A7', 'HP.8183963925'),
        exitVia(built, 'A6', 'HP.10692327375'),
        exitVia(built, 'A5', 'HP.10692327376'),
        exitVia(built, 'A4', 'HP.6040972686'),
        exitVia(built, 'A3', 'HP.6040972673'),
        // A2 forks behind its holding point: the southern fillet, towards the terminal.
        exitVia(built, 'A2', 'HP.8183963929', { next: 'A2.5' }),
      ],
    },
  ],
  // RNAV SIDs (VATNZ, after the 2022 airspace change): jets on ATVEV (16) and UPLUD (34), turboprops by direction.
  sids: [
    { name: 'ATVEV1Q', runway: '16', fix: 'ATVEV', aircraft: 'jet' },
    { name: 'IDVAL1Q', runway: '16', fix: 'IDVAL', aircraft: 'prop', destinations: ['NZNS', 'NZWB', 'NZPN'] },
    { name: 'AGROR1Q', runway: '16', fix: 'AGROR', aircraft: 'prop', towards: [150, 260] },
    { name: 'UPROG1Q', runway: '16', fix: 'UPROG', aircraft: 'prop', towards: [260, 150] },
    { name: 'UPLUD1P', runway: '34', fix: 'UPLUD', aircraft: 'jet' },
    { name: 'UPLUD1R', runway: '34', fix: 'UPLUD', aircraft: 'jet' },
    { name: 'IPKEP1P', runway: '34', fix: 'IPKEP', aircraft: 'prop', towards: [240, 320] },
    { name: 'URGEV1P', runway: '34', fix: 'URGEV', aircraft: 'prop', towards: [320, 240] },
  ],
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Wellington Airport route network 2026 (Wikipedia; about 100000 movements a year before 2020, 5.1 million passengers in 2025); operator shares estimated',
    rateFactor: 0.8,
    operators: [
      { airline: 'ANZ', weight: 24, types: ['A320', 'A21N'], destinations: ['NZAA', 'NZCH', 'NZQN', 'NZDN'] },
      { airline: 'ANZ', weight: 24, types: ['AT76'], destinations: ['NZAA', 'NZNS', 'NZWB', 'NZNR', 'NZGS', 'NZNP', 'NZRO', 'NZTG', 'NZHN', 'NZTU', 'NZCH'] },
      { airline: 'ANZ', weight: 4, types: ['A20N', 'A21N'], destinations: ['YSSY', 'YMML', 'YBBN'] },
      { airline: 'JST', weight: 10, types: ['A320'], destinations: ['NZAA', 'NZCH', 'NZQN', 'YBCG'] },
      { airline: 'QFA', weight: 4 },
      { airline: 'FJI', weight: 1 },
      { airline: 'SDA', weight: 10 },
      { airline: 'CVA', weight: 1 },
    ],
  },
  briefing: [
    {
      title: 'Wellington in short',
      items: [
        'One runway **16/34** on the isthmus between Lyall Bay (south) and Evans Bay (north): 1815 m between the thresholds, plus 130 m before the 16 threshold and 106 m before the 34 threshold for the take-off run - full length **1945 m** from **A1** (16) and **1921 m** from **A11** (34).',
        'Taxiway **A** runs along the east side with the links **A1-A11**; **B** is the second parallel in front of the terminal, joined to A by **B5-B10**. **R, S, T, U** lead from B to the pier lanes **C** and **D**; the yellow pushback holding zones **Z1-Z6** are on B, R, S, T and U.',
        'Holding points by type: runway 16 - jets **A1**, medium jets A1 or **A2**, turboprops A2 or **A3**; runway 34 - jets A11 / **A10**, turboprops A10 or **A9**.',
        'Arrivals 16 land towards the terminal and vacate at **A5-A10**; arrivals 34 vacate at **A7-A2** and taxi back south on A.',
        'SIDs: jets **ATVEV1Q** (16) or **UPLUD1P / UPLUD1R** (34); turboprops **IDVAL1Q** (Nelson, Blenheim, Picton), **AGROR1Q** (south) or **UPROG1Q** (north) from 16, **IPKEP1P** (west) or **URGEV1P** (other directions) from 34. Transition altitude 13000 ft.',
        'The **Western Apron** (general aviation, the air force, helicopters) across the runway is drawn, not used. Curfew midnight to 6 am.',
      ],
    },
  ],
};
