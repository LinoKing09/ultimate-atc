import type { AirportData } from '../../core/airport/types';
import { EDXW_LAYOUT } from './edxw.layout';
import { buildLayout, exitVia } from './osmLayout';

/**
 * Sylt (EDXW), Westerland.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (edxw.layout.ts). Procedures: VATSIM Germany Sylt SOP (runway use, taxiway restrictions, SIDs,
 * frequencies), see docs/airports/EDXW.md.
 *
 * Two crossing runways: 14/32 (2120 m, the only one for airliners and business jets) and 06/24
 * (1696 m, light aircraft only - not used for traffic in the simulator, but crossed: departures 32
 * taxi via D and A across it). Holding point names on 14/32 are the taxiway names; the ones at the
 * 06/24 crossing are simulator names (D2, A2).
 *
 * Simplifications: only taxiways A, C, D, I and P; the north aprons (3, 4), L, E, F, M, the glider
 * area and the closed taxiway G are left out; B (5.7 t) is not used. Business jets reach Apron 2 via
 * the grass taxiway I (real: up to 2 t; larger aircraft use runway 06/24 as a taxiway).
 */

const built = buildLayout(EDXW_LAYOUT, {
  runway: '14/32',
  holdingPoints: {
    'HP.1289503562': 'A',
    'HP.8948863800': 'C',
    'HP.1084436486': 'D',
    // Crossing runway 06/24 between D and A (both holding points meet the runway at one point).
    'HP.1289503156': { name: 'D2', runway: '06/24', node: 'RWY.?' },
    'HP.564286985': { name: 'A2', runway: '06/24', node: 'RWY.?' },
  },
  // D joins the runway at the 14 end where L does.
  // The southern branch of the C / D junction (towards the apron) is unnamed in OSM.
  edgeNames: { 'D/L>RWY.L': 'D', '?.40>?/C': 'C', '?/D.3>?.40': 'C' },
  taxiways: ['A', 'C', 'D', 'I', 'P'],
  // I is a grass strip (light aircraft); business jets only in the simulator.
  maxWingspanM: { I: 22, P: 22 },
  stands: [
    // Apron 1 at the terminal: three airliner stands, taxi in and out along D.
    { id: '01', apron: 'Apron 1', maxWingspanM: 36, pushback: false, lanes: ['D.10', 'D.6'] },
    { id: '02', apron: 'Apron 1', maxWingspanM: 36, pushback: false, lanes: ['D.7', 'D.3'] },
    { id: '03', apron: 'Apron 1', maxWingspanM: 36, pushback: false, lanes: ['D.2', 'D.4'] },
    // Apron 2 (general aviation, west): business jets, positions estimated on the apron east of P.
    { id: 'G1', apron: 'Apron 2', maxWingspanM: 22, pushback: false, lanes: ['P.2'], pos: { lat: 54.9137923, lon: 8.3255 }, use: 'ga' },
    { id: 'G2', apron: 'Apron 2', maxWingspanM: 22, pushback: false, lanes: ['P.3'], pos: { lat: 54.9131455, lon: 8.3258 }, use: 'ga' },
    { id: 'G3', apron: 'Apron 2', maxWingspanM: 22, pushback: false, lanes: ['P.4'], pos: { lat: 54.9127, lon: 8.3261 }, use: 'ga' },
    { id: 'G4', apron: 'Apron 2', maxWingspanM: 22, pushback: false, lanes: ['P.5'], pos: { lat: 54.9122637, lon: 8.3266 }, use: 'ga' },
  ],
});

const THR_14 = { lat: 54.9193515, lon: 8.3328934 };
const THR_32 = { lat: 54.9038508, lon: 8.3520942 };
const END_06 = { lat: 54.9094172, lon: 8.3291714 };
const END_24 = { lat: 54.9171169, lon: 8.3519947 };

export const EDXW: AirportData = {
  icao: 'EDXW',
  name: 'Sylt',
  city: 'Westerland',
  country: 'Germany',
  arp: { lat: 54.9132, lon: 8.34047 },
  elevationFt: 51,
  magneticVariation: 3.6,
  timeZone: 'Europe/Berlin',
  // Westerly winds prevail at the North Sea coast (estimate): runway 32 most of the time.
  wind: { primaryShare: 0.65, primary: [250, 340], secondary: [70, 160] },
  transitionAltitudeFt: 5000,
  // Initial climb 4000 ft on the SIDs (SOP).
  initialClimbFt: 4000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); north aprons and light-aircraft taxiways left out, runway 06/24 not used. Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '14/32',
      widthM: 45,
      lengthM: 2120,
      ends: [
        { name: '14', threshold: THR_14, end: THR_14, elevationFt: 31 },
        { name: '32', threshold: THR_32, end: THR_32, elevationFt: 32 },
      ],
    },
    {
      name: '06/24',
      widthM: 30,
      lengthM: 1696,
      ends: [
        { name: '06', threshold: END_06, end: END_06, elevationFt: 27 },
        { name: '24', threshold: END_24, end: END_24, elevationFt: 51 },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
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
      departureEntries: [{ holdingPoint: 'A', intersection: 'A', fullLength: true }],
      exits: [exitVia(built, 'C', 'HP.8948863800'), exitVia(built, 'D', 'HP.1084436486')],
      // Arrivals vacate only at the far end: Approach spaces them at least 6 NM.
      arrivalSpacingNm: 6,
    },
    {
      runway: '14',
      departureEntries: [
        { holdingPoint: 'D', intersection: 'D', fullLength: true },
        { holdingPoint: 'C', intersection: 'C', fullLength: false },
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
        'Two crossing runways: **14/32** (2120 m) for all traffic in the simulator, **06/24** (light aircraft only) is not used but must be crossed: departures 32 taxi via D, **cross runway 24** between D2 and A2, and follow A round the south of the airfield to the 32 end (`taxi to holding point A via D, A, cross runway 24`).',
        'Runway 14 departures line up at D (full length) or C. Landing 32, aircraft vacate via C or D at the end; landing 14, they **vacate to the right** at the end via A and taxi back via A, across 06/24, and D.',
        'One SID per runway (OLDIP1A / OLDIP1B), initial climb 4000 ft: space departures at least 5 NM (2 minutes).',
        'Apron 1 (terminal) has three airliner stands on D, taxi in and out. Business jets park on Apron 2 in the west, reached via I and P.',
      ],
    },
  ],
};
