import type { AirportData } from '../../core/airport/types';
import { VTSP_LAYOUT } from './vtsp.layout';
import { buildLayout, exitVia, type StandSpec } from './osmLayout';

/**
 * Phuket International Airport (VTSP) - the first airport in Asia.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (vtsp.layout.ts). Facts: AIP Thailand AD 2 VTSP (AIRAC 2026-10-01) with its aerodrome, ground movement and
 * parking / docking charts (facts only: runway, thresholds, displacement area, declared distances, taxiway
 * designators and widths, the closed taxiways C and D, the stand coordinates and sizes, frequencies, the RNAV
 * SIDs with their end fixes, the initial climb). See docs/airports/VTSP.md.
 *
 * One runway 09/27 (3000 m, 100 m displacement area before the 27 threshold: 3100 m take-off run from J) with
 * the parallel taxiway P on the south side; the terminal aprons A, B and D at the west end.
 *
 * Simplifications: the stands are the AIP positions, their lane nodes on T1 / T2 / P (OSM has no lead-in
 * lines); the taxilane names T5, T6 and T7 come from the parking chart (OSM has the X between the islands as
 * T3 / T4); Apron E (private jets, reached via K across the runway) and the Royal Thai Navy apron are drawn,
 * not used; intersection departures only where the AIP gives the distance (G).
 */

/** AIP stand: position from the stand coordinates table, lane on `snap`. Code C 36 m, D 52 m, E 65 m. */
const STAND = (id: string, apron: string, snap: string, lat: [number, number, number], lon: [number, number, number], maxWingspanM: number): StandSpec => ({
  id,
  apron,
  maxWingspanM,
  pushback: true,
  snap: [snap],
  pos: { lat: lat[0] + lat[1] / 60 + lat[2] / 3600, lon: lon[0] + lon[1] / 60 + lon[2] / 3600 },
});
const C = 36;
const D = 52;
const E = 65;
const N = (s: number): [number, number, number] => [8, 6, s];
const W = (m: number, s: number): [number, number, number] => [98, m, s];

/** Where the taxilanes T3 and T4 of OpenStreetMap cross between the islands of Aprons A and D. */
const X = 'T3/T4';

// Every holding position of OpenStreetMap here is a runway holding position (untyped in OSM): so the second
// fillet of F behind its own holding line is kept as a branch of F.
const LAYOUT = { ...VTSP_LAYOUT, holdingPositions: VTSP_LAYOUT.holdingPositions.map((h) => ({ ...h, type: h.type || 'runway' })) };

const built = buildLayout(LAYOUT, {
  runway: '09/27',
  // The chart gives no holding point designators: they carry the names of their taxiways.
  holdingPoints: {
    'HP.11460274146': 'A',
    'HP.11460274147': 'B',
    'HP.11460274148': 'E',
    'HP.11460274149': 'F',
    'HP.2666761770': 'G',
    'HP.13370111740': 'H',
    'HP.13370111757': 'J',
  },
  addNodes: [
    // End of the 100 m displacement area before the 27 threshold: J meets the runway there (take-off run 3100 m).
    ['RWY.J', 8.1145933, 98.3313089],
    [X, 8.107417, 98.3037319],
  ],
  addEdges: [
    ['RWY.END.2', 'RWY.J', '09/27', 'runway'],
    ['J.8', 'RWY.J', 'J', 'taxiway'],
    // The X between the islands (parking chart): T5 and T3 from T1 to T2, T4 and T6 from T2 to T1.
    ['T3.3', X, 'T5', 'taxilane'],
    [X, 'T3.2', 'T3', 'taxilane'],
    ['T4.2', X, 'T4', 'taxilane'],
    [X, 'T4.3', 'T6', 'taxilane'],
  ],
  dropEdges: ['T3.3>T3.2', 'T4.2>T4.3'],
  edgeNames: {
    'T1/T3>T3.3': 'T5',
    'T4.3>T4.4': 'T6',
    'T4.4>T1/T4': 'T6',
    // T7: the south end of the loop between T1 and T2.
    'T1.1>T1.2': 'T7',
    'T1/T2>T1.1': 'T7',
    'T2.2>T1/T2': 'T7',
    // The fillets of B onto P, and P on to H and J (unnamed in OSM).
    '?/B.2>?.2': 'B',
    '?.2>?/P.2': 'B',
    '?/B>?.6': 'B',
    '?.6>?.7': 'B',
    '?.7>?.8': 'B',
    '?.8>?/P.4': 'B',
    '?/G/P>?/H.2': 'P',
    '?/H.2>?/J': 'P',
    // K: from the runway north to Apron E (private jet terminal).
    'RWY.?>?.11': 'K',
    '?.11>?.12': 'K',
    '?.12>?.13': 'K',
    '?.11>?.14': 'K',
  },
  // Drawn, not used: K and the lane to the navy apron (both north of the runway), the second fillet of G, the
  // turn pad and the fillets of H at the 27 threshold.
  drawOnly: [
    'RWY.?>?.11', '?.11>?.12', '?.12>?.13', '?.11>?.14', 'RWY.?.2>?.10',
    '?/G>?.22', '?.22>?.23', '?.23>?.24', '?.24>?.25', '?.25>RWY.?.3',
    'RWY.?.4>?.15', '?.15>?.16', '?.16>?.17', '?.17>?.18', '?.18>?.19', '?.19>RWY.?.5',
    'RWY.?.5>?.20', '?.20>?/H', '?/H>?.21', '?.21>RWY.?/H',
  ],
  // The apron lanes: T1-T7 and the unnamed links from P.
  taxilanes: ['', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  widthM: { A: 30, B: 30, E: 30, F: 30, G: 30, H: 29.5, J: 29.5, P: 23 },
  stands: [
    // Apron B along P (stand 6 up to a B747).
    STAND('1', 'Apron B', 'P', N(35.67), W(18, 29.75), D),
    STAND('2', 'Apron B', 'P', N(35.51), W(18, 28.05), D),
    STAND('3', 'Apron B', 'P', N(35.35), W(18, 26.36), D),
    STAND('4', 'Apron B', 'P', N(34.77), W(18, 24.69), D),
    STAND('5', 'Apron B', 'P', N(34.68), W(18, 22.97), D),
    STAND('6', 'Apron B', 'P', N(34.23), W(18, 20.97), E),
    // Apron A along T2 (the terminal); 12L / 12R and 14L / 14R are code C positions inside 12 and 14 (MARS).
    STAND('7', 'Apron A', 'T2', N(32.39), W(18, 20.42), E),
    STAND('8', 'Apron A', 'T2', N(30.13), W(18, 19.81), E),
    STAND('9', 'Apron A', 'T2', N(27.86), W(18, 19.21), E),
    STAND('10', 'Apron A', 'T2', N(25.6), W(18, 18.62), E),
    STAND('11', 'Apron A', 'T2', N(23.3), W(18, 18.02), E),
    STAND('12L', 'Apron A', 'T2', N(21.7), W(18, 16.58), C),
    STAND('12', 'Apron A', 'T2', N(20.83), W(18, 17.39), E),
    STAND('12R', 'Apron A', 'T2', N(20.59), W(18, 17.07), C),
    STAND('14L', 'Apron A', 'T2', N(19.24), W(18, 15.93), C),
    STAND('14', 'Apron A', 'T2', N(18.37), W(18, 16.75), E),
    STAND('14R', 'Apron A', 'T2', N(18.13), W(18, 16.42), C),
    STAND('15', 'Apron A', 'T2', N(16.14), W(18, 16.23), D),
    STAND('16', 'Apron A', 'T2', N(14.27), W(18, 15.74), D),
    // Apron D along T1; 32L / 32R, 33L / 33R and 34L / 34R are code C positions inside 32-34 (MARS).
    STAND('31', 'Apron D', 'T1', N(35.59), W(18, 10.53), E),
    STAND('32L', 'Apron D', 'T1', N(32.42), W(18, 9.97), C),
    STAND('32', 'Apron D', 'T1', N(33.12), W(18, 9.89), E),
    STAND('32R', 'Apron D', 'T1', N(33.69), W(18, 10.31), C),
    STAND('33L', 'Apron D', 'T1', N(29.87), W(18, 9.3), C),
    STAND('33', 'Apron D', 'T1', N(30.57), W(18, 9.21), E),
    STAND('33R', 'Apron D', 'T1', N(31.14), W(18, 9.63), C),
    STAND('34L', 'Apron D', 'T1', N(27.32), W(18, 8.63), C),
    STAND('34', 'Apron D', 'T1', N(28.02), W(18, 8.54), E),
    STAND('34R', 'Apron D', 'T1', N(28.59), W(18, 8.96), C),
    STAND('35', 'Apron D', 'T1', N(25.95), W(18, 8.64), C),
    STAND('36', 'Apron D', 'T1', N(24.68), W(18, 8.31), C),
    STAND('37', 'Apron D', 'T1', N(23.11), W(18, 7.66), D),
    STAND('38', 'Apron D', 'T1', N(21.24), W(18, 7.17), D),
    STAND('39', 'Apron D', 'T1', N(19.37), W(18, 6.67), D),
    STAND('40', 'Apron D', 'T1', N(17.49), W(18, 6.18), D),
  ],
});

/**
 * The apron lanes as a loop (simulator convention, not published): in on T2 (south), round T7 and out on T1
 * (north), so arrivals and departures do not meet head-on between the stands.
 */
const APRON_FLOWS: { taxiway: string; direction: 'north' | 'south' }[] = [
  { taxiway: 'T2', direction: 'south' },
  { taxiway: 'T1', direction: 'north' },
];

/** AIP AD 2.12: the thresholds; 100 m displacement area before the 27 threshold. */
const THR_09 = { lat: 8.1119583, lon: 98.3033056 };
const THR_27 = { lat: 8.1145083, lon: 98.3304056 };
const DISP_27 = { lat: 8.1145933, lon: 98.3313089 };

export const VTSP: AirportData = {
  icao: 'VTSP',
  name: 'Phuket',
  city: 'Phuket',
  country: 'Thailand',
  fir: 'VTBB',
  arp: { lat: 8.1125, lon: 98.3091667 },
  elevationFt: 84,
  magneticVariation: -0.5,
  timeZone: 'Asia/Bangkok',
  // South-west monsoon (May-October): westerly winds, runway 27; north-east monsoon: easterly, runway 09.
  wind: { primaryShare: 0.55, primary: [220, 300], secondary: [30, 110] },
  transitionAltitudeFt: 11000,
  // RNAV SIDs: "initial climb clearance 5000 ft, further climb when instructed by ATC".
  initialClimbFt: 5000,
  climate: { monthlyMeanC: [27, 28, 29, 29, 29, 28, 28, 28, 27, 27, 27, 27] },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway, stand positions, frequencies and procedures after the AIP Thailand (AIRAC 2026-10-01, facts only). Taxilanes T5-T7 named after the parking chart; Apron E (private jets) and the navy apron drawn, not used. Not for real-world navigation.',
  runways: [
    {
      name: '09/27',
      widthM: 45,
      lengthM: 3100,
      ends: [
        // RNP and VOR approaches to 09 (no ILS); ILS or LLZ, RNP and VOR to 27.
        { name: '09', threshold: THR_09, end: THR_09, elevationFt: 22, approaches: ['RNP'] },
        { name: '27', threshold: THR_27, end: DISP_27, elevationFt: 84, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  pavement: [
    ...built.pavement,
    // C and D south of the runway: closed (aerodrome chart), not in OpenStreetMap.
    { name: 'C', closed: true, widthM: 30, points: [{ lat: 8.1121601, lon: 98.3076704 }, { lat: 8.1111063, lon: 98.3077701 }] },
    { name: 'D', closed: true, widthM: 23, points: [{ lat: 8.1123122, lon: 98.3092874 }, { lat: 8.1112585, lon: 98.3093872 }] },
  ],
  stations: [
    { callsign: 'VTSP_DEL', type: 'DEL', name: 'Phuket Delivery', frequency: '118.550' },
    { callsign: 'VTSP_GND', type: 'GND', name: 'Phuket Ground', frequency: '121.900' },
    { callsign: 'VTSP_TWR', type: 'TWR', name: 'Phuket Tower', frequency: '118.100' },
    { callsign: 'VTSP_APP', type: 'APP', name: 'Phuket Approach', frequency: '124.700' },
    { callsign: 'VTSP_ATIS', type: 'ATIS', name: 'Phuket International', frequency: '128.000' },
  ],
  runwayOps: [
    {
      runway: '27',
      // Full length from J at the end of the displacement area (3100 m), from H at the threshold (3000 m), from G
      // 2500 m (AIP AD 2.23).
      departureEntries: [
        { holdingPoint: 'J', intersection: 'J', fullLength: true, toraM: 3100 },
        { holdingPoint: 'H', intersection: 'H', fullLength: false, toraM: 3000 },
        { holdingPoint: 'G', intersection: 'G', fullLength: false, toraM: 2500 },
      ],
      // Landing west: the aprons are at the west end and P carries the departures east to J, so arrivals roll on
      // to B or A at the end (the rapid exit E would put them head-on with the departures on P; C and D are closed).
      exits: [exitVia(built, 'A', 'HP.11460274146')],
      flows: APRON_FLOWS,
    },
    {
      runway: '09',
      departureEntries: [{ holdingPoint: 'A', intersection: 'A', fullLength: true, toraM: 3000 }],
      // Landing east (AIP AD 2.23: "vacate via F, G or H"): the rapid exit F onto its western fillet (the aprons are
      // in the west; the eastern fillet would leave the aircraft facing away from them), then G, H, J.
      exits: [
        ...built.branches.filter((b) => b.of === 'HP.11460274149').map((b) => exitVia(built, 'F', 'HP.11460274149', { rapid: true, next: b.node })),
        exitVia(built, 'G', 'HP.2666761770'),
        exitVia(built, 'H', 'HP.13370111740'),
        exitVia(built, 'J', 'HP.13370111757'),
      ],
      flows: APRON_FLOWS,
    },
  ],
  // RNAV SIDs (AIP AD 2.24): 1A from runway 09, 1B from runway 27, to fixes 30 NM out; picked by the bearing of
  // the destination.
  sids: [
    ...([
      ['SUSID', [351, 4]],
      ['IGEVI', [4, 24]],
      ['SAVSA', [24, 53]],
      ['ONETI', [53, 80]],
      ['EMRIT', [80, 103]],
      ['EPGOT', [103, 128]],
      ['REBED', [128, 190]],
      ['ANPUB', [190, 253]],
      ['UBNEN', [253, 292]],
      ['SATVA', [292, 325]],
      ['UPSAB', [325, 351]],
    ] as [string, [number, number]][]).flatMap(([fix, towards]) => [
      { name: `${fix}1A`, runway: '09', fix, towards },
      { name: `${fix}1B`, runway: '27', fix, towards },
    ]),
  ],
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Phuket International Airport route network 2026 (Wikipedia), AOT traffic statistics (about 280 movements a day); operator shares estimated',
    rateFactor: 0.9,
    operators: [
      { airline: 'AIQ', weight: 30 },
      { airline: 'TLM', weight: 8 },
      { airline: 'TVJ', weight: 6 },
      { airline: 'BKP', weight: 6 },
      { airline: 'THA', weight: 6 },
      { airline: 'NOK', weight: 3 },
      { airline: 'AXM', weight: 4 },
      { airline: 'SIA', weight: 2 },
      { airline: 'TGW', weight: 3 },
      { airline: 'MAS', weight: 1 },
      { airline: 'UAE', weight: 2 },
      { airline: 'QTR', weight: 3 },
      { airline: 'ETD', weight: 1 },
      { airline: 'THY', weight: 1, types: ['A332'], destinations: ['LTFM'] },
      { airline: 'AFL', weight: 3 },
      { airline: 'IGO', weight: 3 },
      { airline: 'KAL', weight: 1 },
      { airline: 'CPA', weight: 1 },
      { airline: 'CES', weight: 2 },
      { airline: 'JST', weight: 2 },
      { airline: 'VJC', weight: 1 },
    ],
  },
  briefing: [
    {
      title: 'Phuket in short',
      items: [
        'One runway **09/27** (3000 m x 45 m) between the Andaman Sea (west) and the hills (east). A **100 m displacement area** lies before the 27 threshold: departures 27 from **J** have 3100 m, from **H** (at the threshold) 3000 m, from **G** 2500 m; departures 09 from **A** (3000 m).',
        'Parallel taxiway **P** south of the runway, only 150 m from its centre line. The terminal aprons are at the west end: **B** (stands 1-6) along P, **A** (7-16, at the terminal) along taxilane **T2**, **D** (31-40) along **T1**; T3-T7 link T1 and T2.',
        'Arrivals 27 vacate via the rapid exit **E**, then **B** or **A**; arrivals 09 via the rapid exit **F**, then **G**, **H** or **J** - and taxi the whole length of P back to the aprons. **C** and **D** are closed.',
        'Only runway 27 has an ILS (offset 1.4°, glide path 3.2°); runway 09 is flown as an RNP approach. Transition altitude 11000 ft.',
        'RNAV SIDs to fixes 30 NM out: 1A from runway 09, 1B from runway 27 (SUSID / IGEVI north, SAVSA / ONETI north-east to Bangkok and China, EMRIT / EPGOT east, REBED south-east to Kuala Lumpur and Singapore, ANPUB / UBNEN west, SATVA / UPSAB north-west to India and the Gulf). Initial climb 5000 ft.',
      ],
    },
  ],
};
