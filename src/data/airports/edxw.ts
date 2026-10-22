import type { AirportData } from '../../core/airport/types';
import { EDXW_LAYOUT } from './edxw.layout';
import { buildLayout, exitVia } from './osmLayout';

/**
 * Sylt (EDXW), Westerland.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (edxw.layout.ts), checked against the DFS AIP aerodrome chart (AD 2 EDXW 2-5, AMDT 06/26; facts only:
 * taxiway names, widths and limits, closed parts digitised by hand). Runway data, declared distances and
 * approaches: AIP AD 2 EDXW (AIRAC 2026OCT01). Procedures: VATSIM Germany Sylt SOP (runway use, SIDs,
 * frequencies), see docs/airports/EDXW.md.
 *
 * Two crossing runways: 14/32 (2120 m, the only one for airliners and business jets) and 06/24 (1696 m,
 * unlit, no instrument procedures - not used for traffic in the simulator, but crossed: departures 32 taxi
 * via D and A across it). Holding point names are the taxiway names; the ones at the 06/24 crossing near
 * the 06 end are simulator names (D2, A2).
 *
 * Simplifications: business jets below 19 m wingspan reach Apron 2 via the grass taxiway I (AIP: 2 t;
 * per the VATSIM SOP real jets taxi on runway 06/24 to M / P, which is not modelled); the larger ones park
 * on Apron 3 as the AIP requires. Light aircraft (B, Apron 4, glider site) are not simulated.
 */

const built = buildLayout(EDXW_LAYOUT, {
  runway: '14/32',
  holdingPoints: {
    // Runway 14/32: the holding points are named after their taxiways.
    'HP.1289503562': 'A',
    'HP.1289503526': 'B',
    'HP.8948863800': 'C',
    'HP.1084436486': 'D',
    'HP.564287104': 'G',
    'HP.564287084': 'L',
    // Runway 06/24 (crossed, not used for take-offs and landings). D2 / A2 are simulator names for the holding
    // points on D and A at the crossing (both meet the runway at one point); M and P lead onto its 06 end from
    // Apron 2, E and F onto its 24 end from the north.
    'HP.1289503156': { name: 'D2', runway: '06/24', node: 'RWY.?' },
    'HP.564286985': { name: 'A2', runway: '06/24', node: 'RWY.?' },
    'HP.1084436120': { name: 'M', runway: '06/24', node: 'RWY.A/M' },
    'HP.1289503181': { name: 'P', runway: '06/24', node: 'RWY.A/M' },
    'HP.1289503432': { name: 'E', runway: '06/24' },
    'HP.1084436837': { name: 'F', runway: '06/24' },
  },
  // D joins the runway at the 14 end where L does.
  // The southern branch of the C / D junction (towards the apron) is unnamed in OSM.
  // L1 leads to Apron 3, L3 from L along the east side of Apron 3.
  edgeNames: { 'D/L>RWY.L': 'D', '?.40>?/C': 'C', '?/D.3>?.40': 'C', '?/F/L>HP.1084436097': 'L1', '?.5>?/L.2': 'L3' },
  // Pavement inside the runway strips, drawn only (as links they would bypass the holding points): the paved area
  // at the 14 end between D, L and F, the links at the 06 end between D, M and A (aircraft cross at D2 / A2 or
  // enter at M / P), and the stub from E north to the perimeter road.
  drawOnly: [
    '?/F>RWY.F.2', 'RWY.F.2>?/F.2', '?/F.3>?/F', 'F.1>?/F.3', '?/F>?.4', '?.4>?/L', '?/D.2>?/F.2', '?/F.2>?.6', '?.6>?.7', '?.7>?.8',
    '?.2>?.3', '?.3>?/F', '?.3>?.15', '?.15>?.16', '?.16>?/F.3',
    '?/D>?.31', '?.31>?.32', '?.32>?.33', '?.33>?.34', '?.34>?.35', '?.35>?/M.2', '?/D>?.38', '?.38>?.39', '?.39>RWY.?.2',
    'M/P>?/M.2', '?/M.2>RWY.A/M', 'RWY.A/M>?/A', '?/A>?.1', '?.1>RWY.?', 'RWY.?>?/D',
    '?.10>?/E/F',
  ],
  // Dead ends to keep: the track to the glider site east of the 32 end, L1 to Apron 3, L3 and the lane on Apron 4.
  keepNodes: ['?.14', 'HP.1084436097', '?.5', '?.30'],
  // Weight limits (AIP / chart): B and Apron 4 5.7 t, I 2 t - light aircraft, which the simulator does not have.
  // Business jets below 19 m still use I and P to reach Apron 2 (VATSIM SOP: real jets taxi on runway 06/24 to
  // M / P, not modelled); the larger ones park on Apron 3. Unnamed lanes (Apron 2 west side, Apron 4, glider
  // site) are for light aircraft.
  maxWingspanM: { I: 19, P: 19, M: 19, B: 15, '': 15 },
  // AIP AD 2.8: 15 m, C 12 m (I is grass).
  widthM: { A: 15, B: 15, C: 12, D: 15, E: 15, F: 15, G: 15, I: 15, L: 15, L1: 15, L3: 15, M: 15, P: 15 },
  stands: [
    // Apron 1 at the terminal: three airliner stands, taxi in and out along D.
    { id: '01', apron: 'Apron 1', maxWingspanM: 36, pushback: false, lanes: ['D.10', 'D.6'] },
    { id: '02', apron: 'Apron 1', maxWingspanM: 36, pushback: false, lanes: ['D.7', 'D.3'] },
    { id: '03', apron: 'Apron 1', maxWingspanM: 36, pushback: false, lanes: ['D.2', 'D.4'] },
    // Apron 2 (general aviation, west): business jets below 19 m wingspan (AIP), positions estimated east of P.
    { id: 'G1', apron: 'Apron 2', maxWingspanM: 18.9, pushback: false, lanes: ['P.2'], pos: { lat: 54.9137923, lon: 8.3255 }, use: 'ga' },
    { id: 'G2', apron: 'Apron 2', maxWingspanM: 18.9, pushback: false, lanes: ['P.3'], pos: { lat: 54.9131455, lon: 8.3258 }, use: 'ga' },
    { id: 'G3', apron: 'Apron 2', maxWingspanM: 18.9, pushback: false, lanes: ['P.4'], pos: { lat: 54.9127, lon: 8.3261 }, use: 'ga' },
    { id: 'G4', apron: 'Apron 2', maxWingspanM: 18.9, pushback: false, lanes: ['P.5'], pos: { lat: 54.9122637, lon: 8.3266 }, use: 'ga' },
    // Apron 3 (north, hangar 74): general aviation from 15 t or 19 m wingspan must park here (AIP AD 2.8).
    // Simulator positions N1-N3 (the apron has no published stands), in from L1, out onto L3.
    { id: 'N1', apron: 'Apron 3', maxWingspanM: 32, pushback: false, lanes: ['HP.1084436097', '?.5'], pos: { lat: 54.92055, lon: 8.33795 }, heading: 100, use: 'ga' },
    { id: 'N2', apron: 'Apron 3', maxWingspanM: 32, pushback: false, lanes: ['HP.1084436097', '?.5'], pos: { lat: 54.92048, lon: 8.33875 }, heading: 100, use: 'ga' },
    { id: 'N3', apron: 'Apron 3', maxWingspanM: 32, pushback: false, lanes: ['HP.1084436097', '?.5'], pos: { lat: 54.92041, lon: 8.33955 }, heading: 100, use: 'ga' },
  ],
});

/**
 * Paved parts of the aerodrome chart that OpenStreetMap does not have, digitised by hand from the chart
 * (AD 2 EDXW 2-5, AMDT 06/26, georeferenced on the runway ends; approximate, about 5 m). Most of them are closed
 * (crosses on the chart): G apart from its southern stub, E south of runway 06/24, the former runway east of
 * 14/32 and the links around it. The former runway west of 14/32 (C runs on it) and the turning pad at A are open.
 * Drawn only: none of them leads anywhere the simulated traffic goes.
 */
const CHART_PAVEMENT: { name?: string; closed?: boolean; widthM: number; points: [number, number][] }[] = [
  // G north of the junction near the 32 end, along the east side to the 24 end
  { name: 'G', closed: true, widthM: 15, points: [[54.9072426, 8.3543708], [54.9074088, 8.3545865], [54.9080852, 8.3545757], [54.9087560, 8.3545690], [54.9094268, 8.3545736], [54.9100976, 8.3545720], [54.9107694, 8.3545750], [54.9114412, 8.3545771], [54.9121125, 8.3545631], [54.9124932, 8.3545733], [54.9128372, 8.3545527], [54.9133122, 8.3543591], [54.9137956, 8.3541470], [54.9142785, 8.3539281], [54.9146125, 8.3537615], [54.9149611, 8.3535843], [54.9153405, 8.3533767], [54.9157101, 8.3531614], [54.9161184, 8.3528149], [54.9165205, 8.3524616]] },
  // G into the 24 end
  { name: 'G', closed: true, widthM: 15, points: [[54.9164730, 8.3525161], [54.9167058, 8.3523262], [54.9170807, 8.3518871]] },
  // G from the junction near the 32 end west to runway 14/32 at the glide path antenna
  { name: 'G', closed: true, widthM: 15, points: [[54.9072426, 8.3543708], [54.9072043, 8.3536086], [54.9071395, 8.3530168], [54.9070651, 8.3525544], [54.9069345, 8.3519428], [54.9068078, 8.3514407], [54.9066750, 8.3509909], [54.9063733, 8.3501845], [54.9060612, 8.3493561]] },
  // E south of runway 06/24 to the former runway
  { name: 'E', closed: true, widthM: 15, points: [[54.9162655, 8.3494707], [54.9158725, 8.3496114], [54.9154750, 8.3497596], [54.9150003, 8.3498395], [54.9145357, 8.3499070], [54.9140598, 8.3499618], [54.9136658, 8.3499518], [54.9132627, 8.3499419]] },
  // from the former runway east to G
  { closed: true, widthM: 12, points: [[54.9132627, 8.3499419], [54.9130764, 8.3506906], [54.9130408, 8.3508855], [54.9128330, 8.3517253], [54.9126268, 8.3525782], [54.9124170, 8.3534445], [54.9122643, 8.3541284], [54.9121125, 8.3545631]] },
  // from runway 14/32 (east side) north-east to the former runway
  { closed: true, widthM: 15, points: [[54.9101890, 8.3442430], [54.9105264, 8.3446779], [54.9108731, 8.3451309], [54.9113577, 8.3457312], [54.9118417, 8.3463293], [54.9123318, 8.3469349], [54.9128089, 8.3475243], [54.9132935, 8.3481377], [54.9134444, 8.3484099], [54.9135479, 8.3486681], [54.9136451, 8.3489789], [54.9137396, 8.3493958], [54.9138308, 8.3496718], [54.9139384, 8.3498751], [54.9140161, 8.3499480], [54.9140631, 8.3499596]] },
  // narrow link from the runway intersection area north-east to the former runway
  { closed: true, widthM: 6, points: [[54.9093941, 8.3452276], [54.9097573, 8.3457726], [54.9101111, 8.3463037], [54.9106148, 8.3470389], [54.9110958, 8.3477518], [54.9115882, 8.3484848], [54.9120808, 8.3492219], [54.9125763, 8.3499546], [54.9130764, 8.3506906]] },
  // narrow loop east of runway 14/32
  { closed: true, widthM: 6, points: [[54.9101111, 8.3463037], [54.9102828, 8.3468697], [54.9104567, 8.3474500], [54.9104692, 8.3475304], [54.9104487, 8.3478655], [54.9103790, 8.3480593], [54.9103228, 8.3480610], [54.9101379, 8.3479981], [54.9100299, 8.3477215], [54.9097831, 8.3469280], [54.9095352, 8.3461292], [54.9092925, 8.3453536]] },
  // narrow link from A at the 06 end east along runway 06/24
  { closed: true, widthM: 6, points: [[54.9098810, 8.3315902], [54.9098092, 8.3317729], [54.9095906, 8.3328211], [54.9093697, 8.3338900], [54.9091443, 8.3349747], [54.9089242, 8.3360384], [54.9087078, 8.3370834], [54.9084906, 8.3381314], [54.9082678, 8.3392053], [54.9080443, 8.3402802], [54.9078568, 8.3411893], [54.9078013, 8.3416604], [54.9078039, 8.3420912], [54.9078753, 8.3426524], [54.9079787, 8.3430434], [54.9081312, 8.3434333], [54.9083531, 8.3438025], [54.9088798, 8.3445165], [54.9093941, 8.3452276]] },
  // the former runway east of runway 14/32
  { closed: true, widthM: 80, points: [[54.9166852, 8.3361962], [54.9164236, 8.3372468], [54.9161560, 8.3383214], [54.9158980, 8.3393580], [54.9156331, 8.3404218], [54.9153682, 8.3414857], [54.9151033, 8.3425495], [54.9148452, 8.3435861], [54.9145804, 8.3446500], [54.9143155, 8.3457138], [54.9140506, 8.3467777], [54.9137925, 8.3478142], [54.9135276, 8.3488781], [54.9132627, 8.3499419]] },
  // stub west of the D / C junction
  { closed: true, widthM: 12, points: [[54.9184866, 8.3289665], [54.9182790, 8.3298014], [54.9180795, 8.3306041], [54.9178721, 8.3314369], [54.9178053, 8.3317824]] },
  // the former runway west of runway 14/32 (C runs on it)
  { widthM: 80, points: [[54.9178053, 8.3317824], [54.9175823, 8.3325930], [54.9173580, 8.3334938], [54.9171337, 8.3343946], [54.9169095, 8.3352954], [54.9166852, 8.3361962]] },
  // turning pad west of A (south part)
  { widthM: 16.5, points: [[54.9052627, 8.3325366], [54.9054072, 8.3331626], [54.9054739, 8.3335351]] },
];
/** The turning pad at the end of the stub west of A (chart). */
const CHART_PAD: [number, number][] = [[54.9054739, 8.3338145], [54.9055355, 8.3337932], [54.9055877, 8.3337326], [54.9056226, 8.3336420], [54.9056348, 8.3335351], [54.9056226, 8.3334282], [54.9055877, 8.3333376], [54.9055355, 8.3332770], [54.9054739, 8.3332558], [54.9054123, 8.3332770], [54.9053601, 8.3333376], [54.9053252, 8.3334282], [54.9053129, 8.3335351], [54.9053252, 8.3336420], [54.9053601, 8.3337326], [54.9054123, 8.3337932]];

// Thresholds: AIP AD 2.12 (no displaced thresholds).
const THR_14 = { lat: 54.9193483, lon: 8.3328822 };
const THR_32 = { lat: 54.9038508, lon: 8.3520942 };
const END_06 = { lat: 54.9094172, lon: 8.3291714 };
const END_24 = { lat: 54.9171169, lon: 8.3519947 };

export const EDXW: AirportData = {
  icao: 'EDXW',
  name: 'Sylt',
  city: 'Westerland',
  country: 'Germany',
  // AIP AD 2.2: on the 14/32 centre line, 180 m SSE of the runway intersection.
  arp: { lat: 54.911636, lon: 8.342386 },
  elevationFt: 52,
  magneticVariation: 3.9,
  timeZone: 'Europe/Berlin',
  // Westerly winds prevail at the North Sea coast (estimate): runway 32 most of the time.
  wind: { primaryShare: 0.65, primary: [250, 340], secondary: [70, 160] },
  transitionAltitudeFt: 5000,
  // Initial climb 4000 ft on the SIDs (SOP).
  initialClimbFt: 4000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway data, declared distances, approaches and taxiway limits from the DFS AIP (facts only), closed taxiways digitised by hand from the aerodrome chart (approximate). Runway 06/24 not used. Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '14/32',
      widthM: 45,
      lengthM: 2120,
      ends: [
        // AIP: RNP approach only for 14; ILS CAT I (and RNP) for 32.
        { name: '14', threshold: THR_14, end: THR_14, elevationFt: 32, approaches: ['RNP'] },
        { name: '32', threshold: THR_32, end: THR_32, elevationFt: 31, approaches: ['ILS', 'RNP'] },
      ],
    },
    {
      name: '06/24',
      widthM: 45,
      lengthM: 1696,
      ends: [
        { name: '06', threshold: END_06, end: END_06, elevationFt: 29 },
        { name: '24', threshold: END_24, end: END_24, elevationFt: 52 },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: [...built.areas, { name: 'Turning pad', polygon: CHART_PAD.map(([lat, lon]) => ({ lat, lon })) }],
  buildings: built.buildings,
  pavement: [...built.pavement, ...CHART_PAVEMENT.map((l) => ({ ...l, points: l.points.map(([lat, lon]) => ({ lat, lon })) }))],
  // Sylt Tower only (it also gives the clearances on VATSIM; in reality Bremen Radar does).
  stations: [
    { callsign: 'EDXW_TWR', type: 'TWR', name: 'Sylt Tower', frequency: '119.750' },
    { callsign: 'EDXW_APP', type: 'APP', name: 'Bremen Radar', frequency: '124.075' },
    { callsign: 'EDXW_ATIS', type: 'ATIS', name: 'Sylt Information', frequency: '118.400' },
  ],
  runwayOps: [
    {
      runway: '32',
      // From the apron via D, across runway 06/24 (D2 / A2) and the long way round on A.
      // B (TORA 1826) is limited to 5.7 t: light aircraft only.
      departureEntries: [{ holdingPoint: 'A', intersection: 'A', fullLength: true, toraM: 2120 }],
      // At the end: C or D to the west (Apron 1 / 2), L to the north (Apron 3).
      exits: [exitVia(built, 'C', 'HP.8948863800'), exitVia(built, 'D', 'HP.1084436486'), exitVia(built, 'L', 'HP.564287084')],
      // Arrivals vacate only at the far end: Approach spaces them at least 6 NM.
      arrivalSpacingNm: 6,
    },
    {
      runway: '14',
      // Full length from D (Apron 1 / 2) or L (Apron 3); C is an intersection (TORA 1748).
      departureEntries: [
        { holdingPoint: 'D', intersection: 'D', fullLength: true, toraM: 2120 },
        { holdingPoint: 'L', intersection: 'L', fullLength: true, toraM: 2120 },
        { holdingPoint: 'C', intersection: 'C', fullLength: false, toraM: 1748 },
      ],
      // "Vacate to the right": at the end via A (runway 06/24 as a taxiway is not modelled).
      exits: [exitVia(built, 'A', 'HP.1289503562')],
      arrivalSpacingNm: 6,
    },
  ],
  // One SID per runway (SOP): OLDIP1A (14), OLDIP1B (32).
  sids: [
    { name: 'OLDIP1A', runway: '14', fix: 'OLDIP' },
    { name: 'OLDIP1B', runway: '32', fix: 'OLDIP' },
  ],
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Sylt Airport summer schedule (Lufthansa, Eurowings, Swiss) and business aviation, shares estimated',
    rateFactor: 0.25,
    standReserve: 1,
    operators: [
      { airline: 'DLH', weight: 25, types: ['A319', 'A320'], destinations: ['EDDF', 'EDDM'] },
      { airline: 'CLH', weight: 10, types: ['CRJ9', 'E195'], destinations: ['EDDM'] },
      { airline: 'EWG', weight: 25, types: ['A319', 'A320'], destinations: ['EDDL', 'EDDS', 'EDDK', 'EDDH', 'EDDB'] },
      { airline: 'SWR', weight: 5, types: ['A320'], destinations: ['LSZH'] },
      { airline: 'DCX', weight: 25, destinations: ['EDDB', 'EDDF', 'EDDM', 'EDDL', 'LSZH', 'EDDS', 'EDDH'] },
    ],
  },
  briefing: [
    {
      title: 'Sylt in short',
      items: [
        'You are **Sylt Tower** - the only position (ground movements and clearances included). Bremen Radar brings the arrivals and takes the departures.',
        'Two crossing runways: **14/32** (2120 m) for all traffic in the simulator, **06/24** (unlit, no instrument procedures) is not used but must be crossed: departures 32 taxi via D, **cross runway 24** between D2 and A2 near the 06 end, and follow A round the south of the airfield to the 32 end (`taxi to holding point A via D, A, cross runway 24`).',
        'Approaches: **ILS 32**; runway 14 has an **RNP approach** only (`RNP approach runway 14`).',
        'Runway 14 departures line up at D or L (full length) or C (TORA 1748 m). Landing 32, aircraft vacate at the end via C or D (west) or L (north, Apron 3); landing 14, they **vacate to the right** at the end via A and taxi back via A, across 06/24, and D.',
        'One SID per runway (OLDIP1A / OLDIP1B), initial climb 4000 ft: space departures at least 5 NM (2 minutes).',
        'Apron 1 (terminal) has three airliner stands on D, taxi in and out. Business jets below 19 m park on Apron 2 in the west (via I and P), larger ones on Apron 3 in the north (via L and L1). Hot spot at the 06 end: the holding points M and P of Apron 2 are right at runway 06/24.',
        'Light aircraft only (not simulated): B (5.7 t, intersection 32 with 1826 m), I (2 t, grass), Apron 4 (5.7 t). G is closed except its southern stub to the glider site.',
      ],
    },
  ],
};
