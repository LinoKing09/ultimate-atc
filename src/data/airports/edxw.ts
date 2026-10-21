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
  areas: built.areas,
  buildings: built.buildings,
  pavement: built.pavement,
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
