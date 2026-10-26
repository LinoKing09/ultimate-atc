import type { AirportData } from '../../core/airport/types';
import { TNCM_LAYOUT } from './tncm.layout';
import { buildLayout, exitVia, layoutEdges, type StandSpec } from './osmLayout';

/**
 * Princess Juliana International Airport, St. Maarten (TNCM) - the landing over Maho Beach.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (tncm.layout.ts). Facts: Dutch Caribbean eAIP AD 2 TNCM (AIRAC AMDT 03-26) with its aerodrome chart and parking /
 * docking charts (facts only: runway, displaced threshold 10, declared distances and the remaining runway from
 * each taxiway, taxiway designators and widths, the stand coordinates, frequencies, the SIDs MODOR (jets) and
 * BOPAT (turboprops) of runway 10, the departure and circuit rules). See docs/airports/TNCM.md.
 *
 * One runway 10/28 (2300 m; the 10 threshold displaced 100 m) and **no parallel taxiway**: the taxiways A-F lead
 * from the aprons on the north side straight to the runway. Departures 10 enter at A (full length) or B-E;
 * departures 28 and the arrivals 10 backtrack on the runway to and from E.
 *
 * Simplifications: every taxiway joins the runway with two fillets (a "Y"); the simulator uses the eastern one
 * (towards runway 10's take-off direction and away from it for arrivals rolling west), the western one is drawn.
 * F (to the F apron), G1, G2, H (G and H aprons, helicopters), the West apron and the turning loops at both runway
 * ends are drawn, not used: general aviation is not simulated.
 */

/** AIP stand: position from the parking coordinates table (N18°02'ss.ss" W063°06'ss.ss"), lane from OpenStreetMap. */
const STAND = (id: string, apron: string, n: number, w: number, maxWingspanM: number): StandSpec => ({
  id,
  apron,
  maxWingspanM,
  pushback: true,
  pos: { lat: 18 + 2 / 60 + n / 3600, lon: -(63 + 6 / 60 + w / 3600) },
});

const built = buildLayout(TNCM_LAYOUT, {
  runway: '10/28',
  // The holding points are not mapped in OpenStreetMap (except C, G1, G2): they are put on the taxiways 77-92 m from
  // the runway centre line (outside the runway area of the simulator, 70 m), before the fork into the two fillets;
  // the strip runs to the eastern fillet.
  holdingPoints: {
    'A.3': 'A',
    'B.4': { name: 'B', node: 'RWY.?.2' },
    'HP.8214354500': { name: 'C', node: 'RWY.?.4' },
    '?/D.2': { name: 'D', node: 'RWY.?.6' },
    '?/E.2': { name: 'E', node: 'RWY.?.8' },
  },
  edgeNames: {
    // C: from the C apron to its holding point.
    '?.19>?/C.2': 'C',
    '?.51>?/C.2': 'C',
    // A at the west end, B on to the B and A aprons.
    '?/A.2>?.77': 'B',
    '?.77>?/B.2': 'B',
  },
  drawOnly: [
    // The western fillets (and A's link to the runway east of its end) - drawn.
    '?/A>?.14', '?.14>RWY.?',
    'RWY.B>B.1', 'B.1>B.2', 'B.2>B.3', 'B.3>?/B', '?/B>?.75', '?.75>?.76', '?.76>RWY.?.2', 'B.4>A/B', 'A/B>?/B',
    // A's link to B inside the runway strip: A is reached via the link north of it.
    'A/B>A.1', 'A.1>?/A.2',
    '?/C>?.1', '?.1>?.2', '?.2>?.3', '?.3>RWY.?.3', '?/C>?.58', '?.58>?.59', '?.59>?.60', '?.60>RWY.?.4', 'HP.8214354500>?/C',
    'RWY.?.5>?.4', '?.4>?.5', '?.5>?.6', '?.6>?/D', '?/D.2>?/D', '?/D>?.7', '?.7>?.8', '?.8>?.9', '?.9>RWY.?.6',
    'RWY.?.7>?.10', '?.10>?.11', '?.11>?/E', '?/E>?/E.2', '?/E>?.12', '?.12>?.13', '?.13>RWY.?.8',
    // The turning loop at the west end.
    'RWY.A>A.7', 'A.7>A.8', 'A.8>RWY.A.2',
    // F to the F apron, the turning loop at the east end, G1, G2 (G apron).
    '?.52>?.53', '?.53>?.54', '?.54>RWY.?.9', '?.53>?.85', '?.85>RWY.?.10',
    'RWY.?.11>?.61', '?.61>?.62', '?.62>?.63', '?.63>?.64', '?.64>?.65', '?.65>RWY.?.14', 'RWY.?.14>?.66', '?.66>?.67', '?.67>?.68', '?.68>RWY.?.13',
    'RWY.?.12>?.69', '?.69>HP.9672013473', 'HP.9672013473>?.70', 'RWY.?.11>?.71', '?.71>HP.9672013474', 'HP.9672013474>?.72',
  ],
  // The apron lanes (unnamed on the charts).
  taxilanes: [''],
  // The southern lane of Apron C, Apron E and the taxiways D and E from them: up to 36 m wingspan in the simulator -
  // larger aircraft use A, B and C (the lanes are lined with regional turboprops).
  edgeMaxWingspanM: Object.fromEntries(
    layoutEdges(TNCM_LAYOUT, {
      inside: [
        [
          [18.041, -63.1126],
          [18.0419, -63.1126],
          [18.0419, -63.109],
          [18.041, -63.109],
        ],
      ],
    }).map((k) => [k, 36]),
  ),
  // AIP AD 2.8.
  widthM: { A: 16.5, B: 32, C: 27.5, D: 18, E: 21.5 },
  // Stand sizes are not published: estimated from the apron strength (AD 2.8) - Apron A and B2 / B3 rigid and
  // strong (wide-bodies), B4 / B5 narrow-bodies, C light turboprops.
  stands: [
    STAND('A1', 'Apron A', 36.04, 51.58, 65),
    STAND('A2', 'Apron A', 36.4, 49.13, 65),
    // A3: OpenStreetMap leads it in from the short link south of the A apron lane; the lane node straight below it.
    { ...STAND('A3', 'Apron A', 36.76, 46.68, 65), lanes: ['?.44'] },
    STAND('A4', 'Apron A', 36.97, 44.2, 52),
    STAND('B1', 'Apron B', 35.61, 54.03, 52),
    STAND('B2', 'Apron B', 33.88, 56.2, 65),
    STAND('B3', 'Apron B', 32.73, 57.3, 65),
    // B4 / B5 and C1-C6: the AIP coordinates lie on or next to the apron lane (68 m and about 20 m from the stand
    // markings mapped in OpenStreetMap - the lead-in points, it seems): the OpenStreetMap positions are used.
    { id: 'B4', apron: 'Apron B', maxWingspanM: 36, pushback: true },
    { id: 'B5', apron: 'Apron B', maxWingspanM: 36, pushback: true },
    { id: 'C1', apron: 'Apron C', maxWingspanM: 25, pushback: true },
    { id: 'C2', apron: 'Apron C', maxWingspanM: 25, pushback: true },
    { id: 'C3', apron: 'Apron C', maxWingspanM: 25, pushback: true },
    { id: 'C4', apron: 'Apron C', maxWingspanM: 25, pushback: true },
    { id: 'C5', apron: 'Apron C', maxWingspanM: 25, pushback: true },
    { id: 'C6', apron: 'Apron C', maxWingspanM: 25, pushback: true },
    STAND('C7', 'Apron C', 30.12, 44.57, 25),
    STAND('C8', 'Apron C', 30.28, 43.46, 25),
    STAND('C9', 'Apron C', 30.44, 42.36, 25),
    STAND('C10', 'Apron C', 30.6, 41.25, 25),
    STAND('C11', 'Apron E', 31.72, 38.12, 30),
    STAND('C12', 'Apron E', 31.86, 37.0, 30),
  ],
});

/** AIP AD 2.13 / aerodrome chart: start of the take-off run 10 (b), threshold 10 (d, displaced 100 m), threshold 28 (e). */
const START_10 = { lat: 18 + 2 / 60 + 21.84 / 3600, lon: -(63 + 7 / 60 + 10.85 / 3600) };
const THR_10 = { lat: 18 + 2 / 60 + 22.32 / 3600, lon: -(63 + 7 / 60 + 7.49 / 3600) };
const THR_28 = { lat: 18 + 2 / 60 + 32.87 / 3600, lon: -(63 + 5 / 60 + 53.54 / 3600) };

export const TNCM: AirportData = {
  icao: 'TNCM',
  name: 'St. Maarten',
  city: 'Philipsburg',
  country: 'Sint Maarten',
  fir: 'TJZS',
  arp: { lat: 18 + 2 / 60 + 27.34 / 3600, lon: -(63 + 6 / 60 + 32.25 / 3600) },
  elevationFt: 14,
  magneticVariation: -14,
  timeZone: 'America/Lower_Princes',
  // The trade wind blows from the east most of the year: runway 10.
  wind: { primaryShare: 0.93, primary: [50, 130], secondary: [230, 300] },
  transitionAltitudeFt: 5000,
  climate: { monthlyMeanC: [26, 26, 26, 27, 28, 29, 29, 29, 29, 28, 28, 27] },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway, stand positions, frequencies and procedures after the Dutch Caribbean eAIP (AIRAC AMDT 03-26, facts only). Stand sizes estimated; GA aprons drawn, not used. Runway 28: radar vectors. Not for real-world navigation.',
  runways: [
    {
      name: '10/28',
      widthM: 45,
      lengthM: 2300,
      ends: [
        // RNAV (GNSS) and VOR approaches to runway 10; runway 28 is a visual approach (flown as RNP here).
        { name: '10', threshold: THR_10, end: START_10, elevationFt: 12, approaches: ['RNP'] },
        // The pre-threshold area of runway 10 does not count for take-offs on 28 (TORA 2200 m).
        { name: '28', threshold: THR_28, end: THR_28, elevationFt: 9, approaches: ['RNP'], toraM: 2200 },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  // Only the terminal is labelled: OpenStreetMap names shops and bars just outside the airport fence.
  buildings: built.buildings.map((b) => (/airport/i.test(b.name ?? '') ? b : { ...b, name: '' })),
  pavement: built.pavement,
  stations: [
    { callsign: 'TNCM_DEL', type: 'DEL', name: 'Juliana Delivery', frequency: '121.650' },
    { callsign: 'TNCM_TWR', type: 'TWR', name: 'Juliana Tower', frequency: '118.700' },
    { callsign: 'TNCM_APP', type: 'APP', name: 'Juliana Approach', frequency: '128.950' },
    { callsign: 'TNCM_ATIS', type: 'ATIS', name: 'Juliana', frequency: '127.650' },
  ],
  runwayOps: [
    {
      runway: '10',
      // Remaining runway from each taxiway (aerodrome chart): A full length 2300 m, B 1968, C 1576, D 1432, E 1258.
      departureEntries: [
        { holdingPoint: 'A', intersection: 'A', fullLength: true, toraM: 2300 },
        { holdingPoint: 'B', intersection: 'B', fullLength: false, toraM: 1968 },
        { holdingPoint: 'C', intersection: 'C', fullLength: false, toraM: 1576 },
        { holdingPoint: 'D', intersection: 'D', fullLength: false, toraM: 1432 },
        { holdingPoint: 'E', intersection: 'E', fullLength: false, toraM: 1258 },
      ],
      // Landing east: the runway ends at the sea, there is no taxiway beyond F - arrivals turn around at the end
      // (to the right, AIP note 2) and backtrack to E, D or C (wide-bodies to C, the way to Aprons A and B).
      exits: [
        { ...exitVia(built, 'E', '?/E.2'), backtrack: true },
        { ...exitVia(built, 'D', '?/D.2'), backtrack: true },
        { ...exitVia(built, 'C', 'HP.8214354500'), backtrack: true },
      ],
    },
    {
      runway: '28',
      // From E, D or C with a backtrack to the runway end 28 (the one nearest the stand); without the backtrack
      // 962, 785 and 651 m remain (aerodrome chart) - enough for the light turboprops.
      departureEntries: [
        { holdingPoint: 'E', intersection: 'E', fullLength: true, backtrack: true, toraM: 962 },
        { holdingPoint: 'D', intersection: 'D', fullLength: true, backtrack: true, toraM: 785 },
        { holdingPoint: 'C', intersection: 'C', fullLength: true, backtrack: true, toraM: 651 },
      ],
      // Landing west: E, D, C, B, or to the end at A.
      exits: [exitVia(built, 'E', '?/E.2'), exitVia(built, 'D', '?/D.2'), exitVia(built, 'C', 'HP.8214354500'), exitVia(built, 'B', 'B.4'), exitVia(built, 'A', 'A.3')],
    },
  ],
  // AIP AD 2.22: runway 10 jets MODOR TWO, turboprops BOPAT TWO; runway 28 a clearance to intercept the route
  // (radar vectors here).
  sids: [
    { name: 'MODOR2', runway: '10', fix: 'MODOR', aircraft: 'jet' },
    { name: 'BOPAT2', runway: '10', fix: 'BOPAT', aircraft: 'prop' },
    { name: 'RV', runway: '28', fix: '', vectors: true },
  ],
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Princess Juliana International Airport route network 2026 (Wikipedia); operator shares estimated',
    rateFactor: 0.45,
    standReserve: 1,
    operators: [
      { airline: 'WIA', weight: 30 },
      { airline: 'AAL', weight: 14, types: ['A321', 'B738'], destinations: ['KMIA', 'KCLT', 'KPHL', 'KJFK'] },
      { airline: 'DAL', weight: 6, types: ['A321', 'B739'], destinations: ['KATL', 'KJFK'] },
      { airline: 'UAL', weight: 6, types: ['B738', 'B739'], destinations: ['KEWR', 'KIAD', 'KORD'] },
      { airline: 'JBU', weight: 8, types: ['A320', 'A21N'], destinations: ['KJFK', 'KBOS'] },
      { airline: 'AFR', weight: 3, types: ['A359'], destinations: ['LFPG'] },
      { airline: 'KLM', weight: 3, types: ['B789'], destinations: ['EHAM'] },
      { airline: 'ACA', weight: 4 },
      { airline: 'CMP', weight: 3, types: ['B738'], destinations: ['MPTO'] },
      { airline: 'BWA', weight: 2, types: ['AT76'], destinations: ['TTPP'] },
    ],
  },
  briefing: [
    {
      title: 'St. Maarten in short',
      items: [
        'One runway **10/28**, 2300 m, between Maho Beach (west) and Simpson Bay (east). The 10 threshold is **displaced 100 m**: take-off 10 from A has 2300 m, landing 2200 m. **No parallel taxiway** - the taxiways **A-E** lead from the aprons straight to the runway.',
        'Runway **10** (trade wind, most of the time): departures enter at **A** (full length) or B 1968 m, C 1576 m, D 1432 m, E 1258 m; arrivals roll to the end, **turn right** and **backtrack** to E. Right turn after take-off is mandatory.',
        'Runway **28**: departures enter at **E** and **backtrack** to the runway end; arrivals vacate at E, D, C, B or A. Runway 28 has only a visual approach.',
        'Aprons: **A** at the terminal (A1-A4, wide-bodies), **B** (B1-B5), **C** and **E** (C1-C12, regional turboprops). The F, G, H and West aprons (general aviation, helicopters) are drawn, not used.',
        'There is no Ground: Juliana Tower handles the taxiing, Juliana Delivery gives the clearances (jets **MODOR2**, turboprops **BOPAT2** from runway 10; from runway 28 **radar vectors**).',
        'Every backtrack occupies the runway for a long time - plan the landings with space.',
      ],
    },
  ],
};
