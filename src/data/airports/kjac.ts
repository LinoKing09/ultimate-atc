import type { AirportData } from '../../core/airport/types';
import { KJAC_LAYOUT } from './kjac.layout';
import { buildLayout, exitVia, type StandSpec } from './osmLayout';

/**
 * Jackson Hole Airport (KJAC) - the only commercial airport inside a US national park (Grand Teton), at 6451 ft
 * between the Teton Range and the Gros Ventre mountains: one runway, one parallel taxiway, a terminal ramp that
 * fills up with business jets in the ski season.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (kjac.layout.ts). Facts: FAA airport diagram (AL-504), hot spot list, departure procedures (ALPIN FIVE, DIVYD TWO
 * RNAV, the obstacle departures GEYSER SIX and TETON THREE) and the NASR airport data (runway ends, elevations,
 * declared distances, frequencies, remarks) of cycle 2611 - US government works, public domain. See
 * docs/airports/KJAC.md.
 *
 * Simplifications: the South GA ramp and the FBO ramp (part of the one apron area OpenStreetMap calls "Commercial
 * Ramp") have no parking positions in OpenStreetMap and none are published: drawn, business jets park on positions
 * 1-11; the de-icing pad at the north end of A is drawn,
 * not used; the tower hours (0700-2130 local) are not modelled.
 */

/** A position of the commercial ramp (OpenStreetMap 1-11, about 45 m apart: up to the B737-900 / A321). */
const GATE = (id: string): StandSpec => ({ id, apron: 'Commercial ramp', maxWingspanM: 36, pushback: true });

const built = buildLayout(KJAC_LAYOUT, {
  runway: '01/19',
  // US airports name no holding points: the runway holding positions carry the name of their taxiway. C forks off
  // A1 behind its holding position line (hot spot 1: aircraft miss A1 and enter the blast pad), A2 and A3 have a
  // fillet to either side behind one line each.
  holdingPoints: {
    'HP.7909040154': 'A1',
    'HP.7909040176': { name: 'A2', node: 'RWY.A2C' },
    'HP.7909040092': { name: 'A3', node: 'RWY.A3C' },
    'HP.6225417132': 'A4',
  },
  // A2 and A3 meet the runway at right angles with a fillet to either side (OpenStreetMap: one way along each
  // fillet, joined behind them): straight from the holding point to a runway node between the fillets, the fillets
  // drawn; the two connections to A behind the holding position line stay, linked at the holding point.
  addNodes: [
    ['RWY.A2C', 43.6039365, -110.7394033],
    ['RWY.A3C', 43.6093737, -110.73674],
  ],
  dropEdges: ['RWY.A2>RWY.A2.2', 'RWY.A3>RWY.A3.2', 'A2.4>HP.7909040186', 'A2.4>HP.7909040176', 'A3.5>HP.7909040206', 'HP.7909040092>A3.5'],
  addEdges: [
    ['RWY.A2', 'RWY.A2C', '01/19', 'runway'],
    ['RWY.A2C', 'RWY.A2.2', '01/19', 'runway'],
    ['RWY.A3', 'RWY.A3C', '01/19', 'runway'],
    ['RWY.A3C', 'RWY.A3.2', '01/19', 'runway'],
    ['HP.7909040186', 'HP.7909040176', 'A2', 'taxiway'],
    ['HP.7909040206', 'HP.7909040092', 'A3', 'taxiway'],
  ],
  drawOnly: [
    'RWY.A2>A2.1', 'A2.1>A2.2', 'A2.2>A2.3', 'RWY.A2.2>A2.7', 'A2.7>A2.8', 'A2.8>A2.9', 'A2.9>A2.3', 'A2.3>A2.4',
    'A3.4>RWY.A3', 'A3.3>A3.4', 'A3.2>A3.3', 'A3.1>A3.2', 'RWY.A3.2>A3.7', 'A3.7>A3.8', 'A3.8>A3.1', 'A3.5>A3.1',
  ],
  stands: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].map(GATE),
});

/** NASR runway ends (the thresholds; none is displaced, the chevrons beyond them are blast pads). */
const THR_01 = { lat: 43 + 35 / 60 + 57.0993 / 3600, lon: -(110 + 44 / 60 + 30.1912 / 3600) };
const THR_19 = { lat: 43 + 36 / 60 + 55.7281 / 3600, lon: -(110 + 44 / 60 + 1.5977 / 3600) };

/** Salt Lake Center provides approach and departure control (Jackson RCAG). */
const CENTER = '133.250';

export const KJAC: AirportData = {
  icao: 'KJAC',
  name: 'Jackson Hole',
  city: 'Jackson',
  country: 'United States',
  fir: 'KZLC',
  phraseology: 'faa',
  // NASR: 43-36-26.414N 110-44-15.896W, 6451 ft.
  arp: { lat: 43 + 36 / 60 + 26.414 / 3600, lon: -(110 + 44 / 60 + 15.896 / 3600) },
  elevationFt: 6451,
  // 13° E in 2005, 0.1° W per year (airport diagram).
  magneticVariation: 11,
  timeZone: 'America/Denver',
  // Runway 19 is the calm-wind runway and the only one with an ILS (estimate: about 75 % of the operations).
  wind: { primaryShare: 0.75, primary: [140, 260], secondary: [320, 80] },
  transitionAltitudeFt: 18000,
  // ALPIN FIVE: cross KICNE at or above 15000, then the assigned altitude.
  initialClimbFt: 15000,
  // Long, cold winters (mean temperature of each month).
  climate: { monthlyMeanC: [-10, -8, -3, 2, 7, 11, 16, 15, 10, 3, -4, -9] },
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runway, frequencies and procedures after the FAA airport diagram, departure procedures and NASR data (public domain). South GA and FBO ramps without parking positions; de-icing pad drawn, not used. Not for real-world navigation.',
  runways: [
    {
      name: '01/19',
      widthM: 46,
      lengthM: 1920,
      ends: [
        // RNAV (GPS) X, RNAV (RNP) Y / Z and VOR RWY 1 - no ILS; runway 19: ILS Y / Z (or LOC), RNAV.
        { name: '01', threshold: THR_01, end: THR_01, elevationFt: 6413, approaches: ['RNP'], toraM: 1920 },
        { name: '19', threshold: THR_19, end: THR_19, elevationFt: 6451, approaches: ['ILS', 'LOC', 'RNP'], toraM: 1920 },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  pavement: built.pavement,
  // Clearance delivery and ground control share 124.55: Ground gives the clearances too.
  stations: [
    { callsign: 'JAC_GND', type: 'GND', name: 'Jackson Ground', frequency: '124.550' },
    { callsign: 'JAC_TWR', type: 'TWR', name: 'Jackson Tower', frequency: '118.075' },
    { callsign: 'ZLC_CTR', type: 'APP', name: 'Salt Lake Center', frequency: CENTER },
    { callsign: 'JAC_ATIS', type: 'ATIS', name: 'Jackson Hole', frequency: '120.625' },
  ],
  runwayOps: [
    {
      runway: '19',
      // Full length from A4 (TORA 6300 ft); A3 is an intersection.
      departureEntries: [
        { holdingPoint: 'A4', intersection: 'A4', fullLength: true, toraM: 1920 },
        { holdingPoint: 'A3', intersection: 'A3', fullLength: false },
      ],
      exits: [exitVia(built, 'A3', 'HP.7909040092'), exitVia(built, 'A2', 'HP.7909040176'), exitVia(built, 'A1', 'HP.7909040154')],
    },
    {
      runway: '01',
      // Full length from A1 (TORA 6300 ft); A2 is an intersection.
      departureEntries: [
        { holdingPoint: 'A1', intersection: 'A1', fullLength: true, toraM: 1920 },
        { holdingPoint: 'A2', intersection: 'A2', fullLength: false },
      ],
      exits: [exitVia(built, 'A2', 'HP.7909040176'), exitVia(built, 'A3', 'HP.7909040092'), exitVia(built, 'A4', 'HP.6225417132')],
    },
  ],
  sids: [
    // Runway 19: ALPIN FIVE south to KICNE (transitions Big Piney, Idaho Falls); TETON THREE is the obstacle departure.
    { name: 'ALPIN5', runway: '19', fix: 'KICNE', frequency: CENTER },
    { name: 'TETON3', runway: '19', fix: 'KICNE', destinations: [], frequency: CENTER },
    // Runway 1: DIVYD TWO (RNAV) north-east to DIVYD (transitions Boysen Reservoir, Dunoir, HUKET, JEDHY); GEYSER SIX is
    // the obstacle departure.
    { name: 'DIVYD2', runway: '01', fix: 'DIVYD', frequency: CENTER },
    { name: 'GEYSR6', runway: '01', fix: 'DNW', destinations: [], frequency: CENTER },
  ],
  // Not an A-CDM airport; no datalink clearances.
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'loc', 'gp'],
  traffic: {
    source: 'Jackson Hole Airport route network 2026 (Wikipedia; about 30 airline flights a day in the ski season and many business jets); operator shares estimated',
    rateFactor: 0.6,
    operators: [
      { airline: 'SKW', weight: 26, types: ['E75L', 'CRJ9'], destinations: ['KDEN', 'KSLC', 'KSFO', 'KLAX'] },
      { airline: 'UAL', weight: 16, types: ['A320', 'B738'], destinations: ['KDEN', 'KORD', 'KSFO', 'KEWR', 'KIAH', 'KLAX'] },
      { airline: 'DAL', weight: 14, types: ['A20N', 'B739', 'A321'], destinations: ['KSLC', 'KATL', 'KMSP', 'KJFK'] },
      { airline: 'AAL', weight: 14, types: ['A321', 'B738'], destinations: ['KDFW', 'KORD', 'KPHX', 'KCLT', 'KLAX'] },
      { airline: 'ASA', weight: 4, types: ['B738'], destinations: ['KSEA'] },
      { airline: 'NGA', weight: 26, types: ['C56X', 'CL35'], destinations: ['KLAS', 'KSJC', 'KSDL', 'KVNY', 'KTEB', 'KDEN', 'KDAL', 'KHOU'] },
    ],
  },
  briefing: [
    {
      title: 'Jackson Hole in short',
      items: [
        'You are **Jackson** Ground (with the clearances: delivery and ground share 124.55) or Tower - US phraseology (FAA): `runway 19, taxi via A`, `runway 19, line up and wait`, `runway 19, cleared for takeoff`, `contact Salt Lake Center 133.25`. Altimeter in inches, transition altitude 18000 ft.',
        'One runway **1/19** (6300 ft / 1920 m, 150 ft wide) at **6451 ft**: thin air, long take-off runs - "runway excursion risk due to density altitude and runway length". Runway **19** is the calm-wind runway and the only one with an **ILS**; runway 1 has RNAV and VOR approaches.',
        'Taxiway **A** runs along the east side the whole length; **A1** (south), **A2**, **A3** and **A4** (north) lead to the runway. **C** forks off A1 to the south ramps - hot spot 1: aircraft sometimes miss A1 and enter the blast pad. Pushbacks from the terminal block A2 now and then.',
        'Departures 19 from **A4** (full length) or A3; departures 1 from **A1** (full length) or A2. Arrivals 19 vacate at A3, A2 or A1; arrivals 1 at A2, A3 or A4.',
        'The **commercial ramp** (positions 1-11) in front of the terminal takes the airliners and, in the ski season, the business jets; the South GA ramp, the FBO ramp and the de-icing pad north of A (B, B1, B2) are drawn only.',
        'SIDs: runway 19 **ALPIN5** (south to KICNE, then Big Piney or Idaho Falls), runway 1 **DIVYD2** (RNAV, north-east to DIVYD). Salt Lake Center (133.25) works the departures and arrivals.',
      ],
    },
  ],
};
