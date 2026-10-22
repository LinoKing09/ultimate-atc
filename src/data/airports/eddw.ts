import type { AirportData } from '../../core/airport/types';
import { EDDW_LAYOUT } from './eddw.layout';
import { buildLayout, exitVia, type StandSpec } from './osmLayout';

/**
 * Bremen (EDDW), Hans Koschnick Airport.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (eddw.layout.ts). Runway data, declared distances, stand positions, taxiway widths and limits: DFS AIP
 * AD 2 EDDW (AIRAC 2026OCT01) with its aerodrome and ground movement charts (facts only). Procedures,
 * frequencies, stand use and runway use: VATSIM Germany Bremen SOP. See docs/airports/EDDW.md.
 *
 * One runway 08/26 (2040 m); the runway was renamed from 09/27 (magnetic variation). No full parallel
 * taxiway: A leads from the north-west corner of Apron 1 to the 08 end, F from C to the 26 end.
 *
 * Simplifications: the stands are the AIP positions with lead-in lines from OSM (OSM numbers them
 * differently); 12A and 18A (wide-body positions) are pushback stands here; the paved sections beyond both
 * thresholds (special take-off runways of the Airbus Beluga), runway 23 (light aircraft, take-off only),
 * the Airbus taxiways F1 / F2 and the GA lanes are drawn but not used; Beluga flights, light aircraft and
 * helicopters are not simulated.
 */

/** Pushback stand at its AIP position, lead-in from `lane`. */
const PUSH = (id: string, apron: string, lane: string, lat: number, lon: number, maxWingspanM = 36): StandSpec => ({ id, apron, maxWingspanM, pushback: true, lanes: [lane], pos: { lat, lon } });
/** Taxi-in / taxi-out stand between the taxilanes N (in) and S (out), AIP position. */
const THROUGH = (id: string, osm: string, lat: number, lon: number, use?: StandSpec['use']): StandSpec => ({ id, osm, apron: 'Apron 1', maxWingspanM: 36, pushback: false, pos: { lat, lon }, ...(use ? { use } : {}) });

const built = buildLayout(EDDW_LAYOUT, {
  runway: '08/26',
  // The holding points are named after their taxiways (the charts give no designators). F: runway 26 departures
  // are cleared only up to the CAT II/III holding position on F (noise, AIP AD 2.20); the others are the CAT I
  // positions. M is the holding point south of the runway (maintenance area, not used by the simulated traffic).
  holdingPoints: {
    'HP.3482241449': 'A',
    'HP.3482241456': 'C',
    'HP.3482241462': 'D',
    'HP.3482241465': 'E',
    'HP.25679250': 'F',
    'HP.12480282708': 'M',
  },
  // F1 (Airbus factory traffic only) is unnamed in OSM; N reaches A at the north-west corner of Apron 1.
  edgeNames: {
    'A/S>N/S': 'N',
    '?.23>?.24': 'F1', '?.24>?.25': 'F1', '?.25>?.26': 'F1', '?.26>?.27': 'F1', '?.27>?/F.7': 'F1', '?.27>?/F.4': 'F1',
    '?.26>?.28': 'F1', '?.28>?.29': 'F1', '?.29>?/F.6': 'F1', '?.26>?.30': 'F1', '?.30>?.31': 'F1', '?.31>?/F.5': 'F1',
  },
  // Drawn, not used: F1 to the Airbus apron, the links to the Beluga take-off runways beyond both thresholds,
  // the lane to the LH parking, the helicopter lane and the inner GA lane of Apron 2. C, D and E meet the
  // runway in a Y: the simulator keeps the fillet that suits its traffic - the eastern one for C (departures 08),
  // the western ones for D and E (exits landing 08, departures 26) - and draws the other one; D continues south
  // across the runway to runway 23 (drawn).
  drawOnly: [
    'C.2>C.3', 'C.3>C.4', 'C.4>C.5', 'C.5>RWY.C',
    'D.3>D.4', 'D.4>D.12', 'D.12>D.13', 'D.13>RWY.D.2', 'D.4>D.5', 'D.5>D.6', 'D.6>D.7',
    'E.3>E.7', 'E.7>E.8', 'E.8>RWY.E.2',
    '?.23>?.24', '?.24>?.25', '?.25>?.26', '?.26>?.27', '?.27>?/F.7', '?.27>?/F.4', '?.26>?.28', '?.28>?.29', '?.29>?/F.6', '?.26>?.30', '?.30>?.31', '?.31>?/F.5',
    '?/A.3>?.11', '?.11>RWY.?', 'RWY.?>?.12', '?.12>?.13', '?.13>?.14',
    '?/F.8>?.18', '?.18>RWY.?.2', 'RWY.?.2>?.19', '?.19>?.20',
    '?/H.2>?.21', '?.1>?/H', '?.22>?.3', '?.3>?/A.2', '?/A.2>?.2', '?.2>?.3',
  ],
  // M ends at the maintenance area south of the runway, L at Apron 3 (hangars).
  keepNodes: ['M.4', 'L.2'],
  // AIP AD 2.20: D, E, H and S below 36 m, N and G below 52 m, K below 24 m, L up to 31 m, R code B.
  maxWingspanM: { D: 36, E: 36, H: 36, S: 36, N: 52, G: 52, K: 23.9, L: 31, R: 24 },
  // AIP AD 2.8.
  widthM: { A: 23, C: 23, D: 23, E: 23, F: 23, G: 23, H: 23, N: 23, S: 15, R: 15, K: 10.5, L: 15, M: 15, F1: 25 },
  taxilanes: ['N', 'S', 'R'],
  stands: [
    // Apron 1, terminal: pushback stands 01-11 on N (nose towards the terminal); AIP positions.
    { ...PUSH('01', 'Apron 1', 'C/H', 53.050747, 8.786789), osm: '01A' },
    PUSH('02', 'Apron 1', 'N.16', 53.051022, 8.786392),
    PUSH('03', 'Apron 1', 'N.14', 53.051411, 8.785931),
    PUSH('04', 'Apron 1', 'N.12', 53.051764, 8.785406),
    PUSH('05', 'Apron 1', 'N.9', 53.052094, 8.784706),
    PUSH('06', 'Apron 1', 'N.7', 53.052267, 8.784089),
    PUSH('07', 'Apron 1', 'N.4', 53.052522, 8.782897),
    PUSH('08', 'Apron 1', 'N.3', 53.052617, 8.782311),
    PUSH('09', 'Apron 1', 'N.2', 53.0527, 8.781725),
    PUSH('10', 'Apron 1', 'A/S', 53.052831, 8.780786),
    PUSH('11', 'Apron 1', '?/A', 53.052514, 8.779953),
    // Between N and S: taxi in from N, out onto S (no pushback, ground movement chart); 14-16 also for larger
    // business jets (VATSIM SOP). 12A takes wide-bodies up to 52 m: a pushback stand onto N in the simulator.
    THROUGH('12', '10', 53.049933, 8.784614),
    PUSH('12A', 'Apron 1', 'N.16', 53.049986, 8.784275, 52),
    THROUGH('13', '11', 53.050178, 8.784261),
    THROUGH('14', '12', 53.050419, 8.783911, 'ga'),
    THROUGH('15', '13', 53.050672, 8.783572, 'ga'),
    THROUGH('16', '14', 53.050914, 8.783217, 'ga'),
    THROUGH('17', '15', 53.051119, 8.782872),
    // Apron 2: pushback stands onto S; 18A (up to 52 m) onto the junction with G.
    PUSH('18', 'Apron 2', 'S.8', 53.049161, 8.78355),
    PUSH('18A', 'Apron 2', 'G/S', 53.049322, 8.783319, 52),
    PUSH('19', 'Apron 2', 'S.7', 53.049461, 8.783119),
  ],
});

// Thresholds: AIP AD 2.12 (no displaced thresholds).
const THR_08 = { lat: 53.046574, lon: 8.774452 };
const THR_26 = { lat: 53.047264, lon: 8.804849 };

/**
 * Drawn only: the paved sections beyond both thresholds (stopways, used as special take-off runways by the
 * Airbus Beluga; AIP AD 2.12 / 2.20) and runway 23 (700 m, take-off only, VFR aircraft up to 5.7 t), from
 * OpenStreetMap.
 */
const PAVEMENT: { widthM: number; points: [number, number][] }[] = [
  { widthM: 45, points: [[53.0464762, 8.770079], [53.0464935, 8.7708422], [53.0465144, 8.7717629], [53.0465479, 8.7732358], [53.046576, 8.774473]] },
  { widthM: 45, points: [[53.0472661, 8.8048426], [53.047286, 8.8057184], [53.047329, 8.8076103], [53.0473533, 8.8086798], [53.0473679, 8.8093237]] },
  { widthM: 23, points: [[53.0426094, 8.7842277], [53.0439649, 8.787075], [53.0455026, 8.7902844], [53.0460632, 8.7914545], [53.0465194, 8.7924019]] },
];

export const EDDW: AirportData = {
  icao: 'EDDW',
  name: 'Bremen',
  city: 'Bremen',
  country: 'Germany',
  fir: 'EDWW',
  // AIP AD 2.2: 35 m north of the runway near C.
  arp: { lat: 53.0474, lon: 8.786747 },
  elevationFt: 14,
  magneticVariation: 3.9,
  timeZone: 'Europe/Berlin',
  // Westerly winds prevail (estimate): runway 26 more often.
  wind: { primaryShare: 0.65, primary: [200, 320], secondary: [20, 140] },
  // AIP AD 2.20: no take-offs and landings 22:00-07:00 local, except quieter jets (ICAO Chapter 3 / 4 / 14)
  // until 22:30 and from 06:00, home carriers landing until 23:00, delayed landings until 24:00.
  nightRestrictions: {
    jetDepartures: { from: 22 * 60 + 30, until: 6 * 60 },
    landings: { from: 22 * 60 + 30, until: 6 * 60 },
    delayedLandingsUntil: 24 * 60,
    source: 'AIP Germany AD 2 EDDW 2.20 (2)',
  },
  transitionAltitudeFt: 5000,
  // Every SID climbs to 4000 ft (AIP SID charts).
  initialClimbFt: 4000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway data, declared distances, stand positions, taxiway widths and limits from the DFS AIP (facts only). Beluga take-off runways, runway 23 and the Airbus taxiways drawn but not used. Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '08/26',
      widthM: 45,
      lengthM: 2040,
      ends: [
        // AIP: ILS Z (CAT II / III) or LOC, ILS Y, VOR and RNP for both directions.
        { name: '08', threshold: THR_08, end: THR_08, elevationFt: 13, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '26', threshold: THR_26, end: THR_26, elevationFt: 14, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  pavement: [...built.pavement, ...PAVEMENT.map((l) => ({ ...l, points: l.points.map(([lat, lon]) => ({ lat, lon })) }))],
  // No Delivery: Bremen Ground gives the IFR clearances (VATSIM SOP).
  stations: [
    { callsign: 'EDDW_GND', type: 'GND', name: 'Bremen Ground', frequency: '121.755' },
    { callsign: 'EDDW_TWR', type: 'TWR', name: 'Bremen Tower', frequency: '120.330' },
    { callsign: 'EDDW_APP', type: 'APP', name: 'Bremen Radar', frequency: '124.800' },
    { callsign: 'EDDW_ATIS', type: 'ATIS', name: 'Bremen Information', frequency: '132.380' },
  ],
  runwayOps: [
    {
      runway: '26',
      // Declared distances (AIP AD 2.13 / aerodrome chart). C (836 m) is published but not used (VATSIM SOP).
      departureEntries: [
        { holdingPoint: 'F', intersection: 'F', fullLength: true, toraM: 2040 },
        { holdingPoint: 'E', intersection: 'E', fullLength: false, toraM: 1714 },
        { holdingPoint: 'D', intersection: 'D', fullLength: false, toraM: 1255 },
      ],
      // Jets above 20 t vacate at the end via A (AIP AD 2.20; C only after coordination).
      exits: [exitVia(built, 'A', 'HP.3482241449')],
      // Target spacing on final (VATSIM SOP).
      arrivalSpacingNm: 6,
    },
    {
      runway: '08',
      departureEntries: [
        { holdingPoint: 'A', intersection: 'A', fullLength: true, toraM: 2040 },
        { holdingPoint: 'C', intersection: 'C', fullLength: false, toraM: 1235 },
      ],
      // D and E (below 36 m) or F at the end.
      // D: up to the fork behind the holding point, where traffic to the apron turns west.
      exits: [exitVia(built, 'D', 'HP.3482241462', { clearM: 25 }), exitVia(built, 'E', 'HP.3482241465'), exitVia(built, 'F', 'HP.25679250')],
      arrivalSpacingNm: 6,
    },
  ],
  // SIDs (AIP AD 2 EDDW 5-7; M = runway 08, on 26 the Z variants where they exist - VATSIM default - else L), all
  // climbing to 4000 ft; each flight is planned via the exit fix towards its destination. Numbers change with
  // the AIRAC cycle.
  sids: [
    ...(
      [
        ['ABDIM1M', 'ABDIM1L', 'ABDIM', [205, 280]],
        ['OKWEL2M', 'OKWEL2L', 'OKWEL', [280, 340]],
        ['WSN2M', 'WSN2L', 'WSN', [340, 40]],
        ['GESTO9M', 'GESTO2Z', 'GESTO', [40, 115]],
        ['NIE3M', 'NIE7Z', 'NIE', [115, 150]],
        ['WIMCI2M', 'WIMCI2Z', 'WIMCI', [150, 205]],
      ] as [string, string, string, [number, number]][]
    ).flatMap(([on08, on26, fix, towards]) => [
      { name: on08, runway: '08', fix, towards },
      { name: on26, runway: '26', fix, towards },
    ]),
  ],
  // Not an A-CDM airport; no datalink clearances (VATSIM SOP).
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Bremen Airport route network 2026 (Wikipedia, ADV statistics: 28,000 movements in 2024), operator shares estimated',
    rateFactor: 0.4,
    operators: [
      { airline: 'RYR', weight: 20, types: ['B738', 'B38M'], destinations: ['EGSS', 'LEAL', 'LEMG', 'LEPA', 'LDZD'] },
      { airline: 'DLH', weight: 10, types: ['A319', 'A320'], destinations: ['EDDM'] },
      { airline: 'CLH', weight: 6, types: ['CRJ9', 'E195'], destinations: ['EDDM'] },
      { airline: 'KLC', weight: 8, types: ['E190', 'E295'], destinations: ['EHAM'] },
      { airline: 'EWG', weight: 6, types: ['A319', 'A320'], destinations: ['EDDS', 'LEPA'] },
      { airline: 'AUA', weight: 5, types: ['E195', 'DH8D'], destinations: ['LOWW'] },
      { airline: 'SWR', weight: 4, types: ['E295', 'E190'], destinations: ['LSZH'] },
      { airline: 'THY', weight: 6, types: ['A321', 'B738'], destinations: ['LTFM'] },
      { airline: 'PGT', weight: 5, types: ['A20N', 'B38M'], destinations: ['LTFJ', 'LTAI'] },
      { airline: 'SXS', weight: 6, types: ['B738', 'B38M'], destinations: ['LTAI', 'LTBJ'] },
      { airline: 'SDR', weight: 6, types: ['A320', 'A321'], destinations: ['GCFV', 'HEGN', 'LGIR'] },
      { airline: 'CAI', weight: 4, types: ['B738'], destinations: ['LTAI', 'LTFE'] },
      { airline: 'DCX', weight: 6 },
    ],
  },
  briefing: [
    {
      title: 'Bremen in short',
      items: [
        'One runway **08/26** (2040 m; renamed from 09/27), direction by the wind - **26** more often. No full parallel taxiway: **A** runs from the north-west corner of Apron 1 to the 08 end, **F** from C along the runway to the 26 end; C, D and E link F and the runway.',
        'Bremen Ground also gives the IFR clearances (no Delivery). Departures go to **A** (runway 08, 2040 m) or **F** (runway 26, 2040 m) by default; intersections on request: 08 from **C** (1235 m), 26 from **E** (1714 m) or **D** (1255 m). Runway 26: taxi via F only up to the CAT II/III holding point (noise) - that is holding point F in the simulator.',
        'Landing 26: jets vacate at the end via **A** (C only after coordination) and taxi back along A to the apron. Landing 08: **D** or **E** (below 36 m) or **F** at the end.',
        'Stands 01-11 at the terminal are pushback stands onto taxilane N; 12-17 are taxi in from N, taxi out onto S; 18, 18A and 19 push back onto S. Wide-bodies (up to 52 m) only on 12A and 18A; S, D, E and H are for less than 36 m, K for less than 24 m.',
        'One SID per exit fix and runway, all to 4000 ft: ABDIM and OKWEL (west), WSN (north), GESTO (east), NIE (south-east), WIMCI (south). Approach spaces arrivals 6 NM.',
        'The paved areas beyond both thresholds are special take-off runways for the Airbus Beluga; F1 / F2 lead to the Airbus factory; runway 23 is for light aircraft (take-off only) - none of them is used in the simulator.',
      ],
    },
  ],
};
