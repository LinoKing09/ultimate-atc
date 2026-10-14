import type { AirportData } from '../../core/airport/types';
import { EDJA_LAYOUT } from './edja.layout';
import { buildLayout, exitVia } from './osmLayout';

/**
 * Memmingen (EDJA), Allgäu Airport.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (edja.layout.ts). Runway ends: OSM threshold nodes; the displaced part of runway 24 from OSM.
 * Procedures and restrictions: VATSIM Germany Memmingen SOP (taxiway use, backtracks, SIDs,
 * frequencies, stands), see docs/airports/EDJA.md.
 *
 * Simplifications: only the taxiways airliners may use are modelled - W (to the runway 06 end) and N
 * (Apron 1 / 2 to the middle of the runway) with the apron lanes. The south side (P, C, D, E, the GA
 * apron 3, the former military areas) is left out: P is limited to small aircraft and S is closed.
 * Departures 24 and landings 06 therefore backtrack on the runway, as in reality.
 */

const built = buildLayout(EDJA_LAYOUT, {
  runway: '06/24',
  holdingPoints: { 'HP.2892627177': 'W', 'HP.10537053378': 'N' },
  // The unnamed apron lane to Apron 2 is reached via N.
  taxiwayNames: { '?': 'N' },
  taxiways: ['N', 'W'],
  // Displaced part of runway 24 (beyond its threshold, usable for the take-off run 24).
  addNodes: [['RWY.24END', 47.9953372, 10.2559803]],
  addEdges: [['RWY.END.2', 'RWY.24END', '06/24', 'runway']],
  keepNodes: ['RWY.24END'],
  // Stands: Apron 1 (terminal, 1-2, pushback) and Apron 2 (3-6, taxi in / out; the SOP has a pushback on 6, but its lane ends there).
  stands: [
    { id: '1', apron: 'Apron 1', maxWingspanM: 36, pushback: true, lanes: ['N.7'] },
    { id: '2', apron: 'Apron 1', maxWingspanM: 36, pushback: true, lanes: ['N.8'] },
    { id: '3', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['?.3'] },
    { id: '4', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['N.12'] },
    { id: '5', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['N.13'] },
    { id: '6', apron: 'Apron 2', maxWingspanM: 36, pushback: false, lanes: ['?.5'] },
  ],
});

/** Threshold 06 (= runway end 06) and threshold 24 from OSM; runway end 24 at the end of the displaced part. */
const THR_06 = { lat: 47.9833015, lon: 10.2256626 };
const THR_24 = { lat: 47.994297, lon: 10.2533499 };
const END_24 = { lat: 47.9953372, lon: 10.2559803 };

export const EDJA: AirportData = {
  icao: 'EDJA',
  name: 'Memmingen',
  city: 'Memmingen',
  country: 'Germany',
  arp: { lat: 47.988092, lon: 10.238248 },
  elevationFt: 2077,
  magneticVariation: 3.9,
  timeZone: 'Europe/Berlin',
  // Westerly winds prevail (runway 24); estimate.
  wind: { primaryShare: 0.65, primary: [200, 280], secondary: [20, 100] },
  transitionAltitudeFt: 5000,
  // Initial climb FL70 (SOP), said as a flight level above the transition altitude.
  initialClimbFt: 7000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); only the taxiways airliners use (W, N). Procedures after the VATSIM Germany SOP. Not for real-world navigation.',
  runways: [
    {
      name: '06/24',
      widthM: 45,
      lengthM: 2943,
      ends: [
        { name: '06', threshold: THR_06, end: THR_06, elevationFt: 2077 },
        { name: '24', threshold: THR_24, end: END_24, elevationFt: 2077 },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  stations: [
    { callsign: 'EDJA_GND', type: 'GND', name: 'Memmingen Ground', frequency: '121.680' },
    { callsign: 'EDJA_TWR', type: 'TWR', name: 'Memmingen Tower', frequency: '126.855' },
    { callsign: 'EDJA_APP', type: 'APP', name: 'Muenchen Radar', frequency: '129.450' },
    { callsign: 'EDJA_ATIS', type: 'ATIS', name: 'Memmingen Information', frequency: '118.855' },
  ],
  runwayOps: [
    {
      runway: '24',
      // From N with a backtrack to the runway end 24 (no taxiway to it for airliners).
      departureEntries: [{ holdingPoint: 'N', intersection: 'N', fullLength: true, backtrack: true }],
      exits: [exitVia(built, 'N', 'HP.10537053378'), exitVia(built, 'W', 'HP.2892627177')],
    },
    {
      runway: '06',
      departureEntries: [
        { holdingPoint: 'W', intersection: 'W', fullLength: true },
        { holdingPoint: 'N', intersection: 'N', fullLength: false },
      ],
      // Landing 06: vacate via N - most aircraft roll past it, turn around on the runway and backtrack.
      exits: [{ ...exitVia(built, 'N', 'HP.10537053378'), backtrack: true }],
    },
  ],
  // SIDs: designators from the VATSIM Germany SOP (A = runway 24, B = runway 06); numbers change with the AIRAC cycle.
  sids: [
    { name: 'KPT4A', runway: '24', fix: 'KPT' },
    { name: 'LUPOL5A', runway: '24', fix: 'LUPOL' },
    { name: 'UMTEX1A', runway: '24', fix: 'UMTEX' },
    { name: 'KPT4B', runway: '06', fix: 'KPT' },
    { name: 'LUPOL5B', runway: '06', fix: 'LUPOL' },
    { name: 'UMTEX2B', runway: '06', fix: 'UMTEX' },
  ],
  // No A-CDM and no datalink clearances at Memmingen.
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Memmingen Airport route network (Ryanair and Wizz Air bases), operator shares estimated',
    rateFactor: 0.35,
    operators: [
      { airline: 'RYR', weight: 60, types: ['B738', 'B738', 'B38M'], destinations: ['LEPA', 'LEPA', 'EGSS', 'EIDW', 'LIRA', 'LPPR', 'LEMG', 'LEAL', 'LGTS', 'LEVC', 'LIME', 'GMMX', 'LCLK', 'LGKR', 'LDZD'] },
      { airline: 'WZZ', weight: 30, types: ['A320', 'A21N', 'A21N'], destinations: ['LWSK', 'LBSF', 'LROP', 'UGKO', 'LQTZ', 'LRCL', 'LRIA', 'LYPG', 'LYBE'] },
      { airline: 'SXS', weight: 5, types: ['B738', 'B38M'], destinations: ['LTAI', 'LTBJ'] },
      { airline: 'DCX', weight: 5 },
    ],
  },
  briefing: [
    {
      title: 'Memmingen in short',
      items: [
        'A former air force base: one runway 06/24, and only two taxiways airliners may use - **W** to the runway 06 end and **N** from the aprons to the middle of the runway. Taxiway P (south side) is for small aircraft only and S is closed; they are not in the simulator.',
        'Runway 24 departures enter at N and **backtrack** to the runway end: `backtrack runway 24, line up and wait`, then `cleared for take-off`. There is no turn pad - the aircraft turns on the runway. Runway 06 departures line up at W (full length) or N (intersection).',
        'Landing 06, aircraft roll past N, **turn around on the runway** and backtrack to N (`backtrack, vacate via N`). Landing 24, they vacate via N or roll to the end and vacate via W.',
        'During a backtrack the runway is occupied for a long time - plan landings with more space.',
        'Memmingen Ground also gives the IFR clearances (there is no Delivery). De-icing is done on the stands.',
        'Stands 1-2 (Apron 1, terminal) and 6 need a pushback; 3-5 on Apron 2 are taxi-in / taxi-out positions.',
      ],
    },
  ],
};
