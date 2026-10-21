import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { Airport } from '../src/core/airport/airport';
import { findRoute, isRouteError } from '../src/core/airport/routing';
import { departureFrequency, sidsForDestination } from '../src/core/delivery';
import { takeoffRunAvailable } from '../src/core/pilot';
import { Simulation } from '../src/core/simulation';
import { EDDN } from '../src/data/airports/eddn';
import { EDDS } from '../src/data/airports/edds';
import { EDJA } from '../src/data/airports/edja';
import { destinationBearing } from '../src/data/destinations';

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}
const fixFor = (data: typeof EDDS, runway: string, dest: string) => sidsForDestination(data, runway, dest).map((s) => s.fix);

describe('SIDs by destination', () => {
  it('computes the bearing to a destination', () => {
    expect(destinationBearing(EDDS.arp, 'EDDH')).toBeGreaterThan(0);
    expect(destinationBearing(EDDS.arp, 'EDDH')).toBeLessThan(10);
    expect(Math.round(destinationBearing(EDDS.arp, 'LEPA')!)).toBe(209);
    expect(destinationBearing(EDDS.arp, 'XXXX')).toBeUndefined();
  });

  it('Stuttgart: the exit fix towards the destination, restricted fixes only for their destinations', () => {
    for (const runway of ['25', '07']) {
      expect(fixFor(EDDS, runway, 'EDDF')).toEqual(['ETASA']);
      expect(fixFor(EDDS, runway, 'EGLL')).toEqual(['VESID']);
      expect(fixFor(EDDS, runway, 'LFPG')).toEqual(['VESID']);
      expect(fixFor(EDDS, runway, 'EDDH')).toEqual(['OKIBA']);
      expect(fixFor(EDDS, runway, 'EDDL')).toEqual(['TAGIK']);
      expect(fixFor(EDDS, runway, 'LOWW')).toEqual(['ABTAL']);
      expect(fixFor(EDDS, runway, 'LTFM')).toEqual(['KUNOD']);
      expect(fixFor(EDDS, runway, 'LEPA')).toEqual(['ROTWE']);
      expect(fixFor(EDDS, runway, 'LSZH')).toEqual(['SUL']);
      // Destinations without a position fall back to the SIDs open to everyone.
      expect(fixFor(EDDS, runway, 'ZZZZ')).not.toContain('ETASA');
    }
    expect(sidsForDestination(EDDS, '25', 'LEPA')[0].name).toBe('ROTWE5B');
    expect(sidsForDestination(EDDS, '07', 'LEPA')[0].name).toBe('ROTWE7H');
  });

  it('Nuremberg and Memmingen: SIDs by direction', () => {
    expect(fixFor(EDDN, '28', 'LEPA')).toEqual(['BOLSI']);
    expect(fixFor(EDDN, '28', 'EDDB')).toEqual(['ERETO']);
    expect(fixFor(EDDN, '28', 'LTAI')).toEqual(['RODIS']);
    expect(fixFor(EDDN, '10', 'EGLL')).toEqual(['SUKAD']);
    expect(fixFor(EDDN, '10', 'EDDH')).toEqual(['SULUS']);
    expect(fixFor(EDJA, '24', 'LEPA')).toEqual(['UMTEX']);
    expect(fixFor(EDJA, '24', 'LBSF')).toEqual(['KPT']);
    expect(fixFor(EDJA, '06', 'EIDW')).toEqual(['LUPOL']);
  });

  it('generated departures are planned via the SID towards their destination', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'heavy', seed: 11 });
    const deps = sim.aircraft.filter((a) => a.category === 'departure');
    expect(deps.length).toBeGreaterThan(5);
    for (const a of deps) {
      const fix = EDDS.sids.find((s) => s.name === a.flightPlan.sid)?.fix;
      expect(fixFor(EDDS, '25', a.flightPlan.destination)).toContain(fix);
      expect(a.flightPlan.route.startsWith(`${fix} `)).toBe(true);
    }
  });
});

describe('Stuttgart departure frequencies', () => {
  function airborne(destination: string): { sim: Simulation; ac: Aircraft } {
    const sim = new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const sid = sidsForDestination(EDDS, '25', destination)[0];
    Object.assign(ac.flightPlan, { destination, sid: sid.name, route: `${sid.fix} DCT ${destination}` });
    return { sim, ac };
  }

  it('southern departures contact sector Reutlingen 119.200, the others Langen Radar 125.050', () => {
    const south = airborne('LEPA');
    expect(departureFrequency(south.sim, south.ac)).toBe('119.200');
    const north = airborne('EGLL');
    expect(departureFrequency(north.sim, north.ac)).toBe('125.050');
  });

  it('the crew reads back the frequency of its sector and accepts either Langen Radar frequency', () => {
    const { sim, ac } = airborne('LEPA');
    expect(runUntil(sim, () => ac.request === 'departure', 2400)).toBe(true);
    expect(runUntil(sim, () => ac.phase === 'holding', 600)).toBe(true);
    sim.transmit('DLH5AB cleared for take-off');
    expect(runUntil(sim, () => ac.request === 'radar', 300)).toBe(true);
    sim.transmit('DLH5AB contact radar');
    expect(runUntil(sim, () => /119\.200, goodbye/.test(sim.messages.at(-1)?.text ?? ''), 20)).toBe(true);
    expect(ac.frequency).toBe('APP');
  }, 30000);
});

describe('Stuttgart runway data', () => {
  it('take-off run available as published', () => {
    const sim = new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'medium', seed: 1, generateTraffic: false });
    expect(takeoffRunAvailable(sim, 'A')).toBe(3045);
    expect(takeoffRunAvailable(sim, 'C')).toBe(2175);
    expect(takeoffRunAvailable(sim, 'E')).toBe(1665);
    // The runway end itself: TORA 25 is 3045 m (the part behind the threshold 07 does not count).
    expect(Math.round(sim.airport.runwayEnd('25')!.tora)).toBe(3045);
    const s07 = new Simulation({ airport: EDDS, position: 'TWR', runway: '07', density: 'medium', seed: 1, generateTraffic: false });
    expect(takeoffRunAvailable(s07, 'G')).toBe(2210);
    expect(takeoffRunAvailable(s07, 'K')).toBe(3345);
  });

  it('automatic routes cross the runway only between K and Y and keep off the military taxiway Z', () => {
    const ap = new Airport(EDDS);
    const from206 = findRoute(ap, { node: ap.node('STAND_206'), heading: 0 }, ap.holdingPoint('A')!, [], { wingspanM: 35.8 });
    expect(isRouteError(from206)).toBe(false);
    if (!isRouteError(from206)) {
      expect(from206.taxiways).toContain('Y');
      expect(from206.taxiways).not.toContain('Z');
      expect(from206.taxiways).not.toContain('H');
    }
    const fromW = findRoute(ap, { node: ap.node('W_CLR') }, ap.node('STAND_14'), [], { wingspanM: 35.8 });
    expect(isRouteError(fromW)).toBe(false);
    if (!isRouteError(fromW)) expect(fromW.nodes.map((n) => n.id)).toContain('RWY_K');
    // Your own instruction may still cross elsewhere.
    expect(isRouteError(findRoute(ap, { node: ap.node('W_CLR') }, ap.node('STAND_33'), ['W', 'H', 'M'], { wingspanM: 35.8 }))).toBe(false);
  });

  it('de-icing pads are entered from N and left onto S in their direction', () => {
    const ap = new Airport(EDDS);
    // DP1 / DP3 lead west onto S, DP2 / DP4 east: from the pad, the way to K (west) or A (east) follows that.
    const k1 = findRoute(ap, { node: ap.node('DP1') }, ap.holdingPoint('K')!, [], { wingspanM: 35.8 });
    const a2 = findRoute(ap, { node: ap.node('DP2') }, ap.holdingPoint('A')!, [], { wingspanM: 35.8 });
    expect(!isRouteError(k1) && k1.taxiways).toEqual(['S', 'K']);
    expect(!isRouteError(a2) && a2.taxiways).toEqual(['S', 'A']);
    // Eastbound on N (from the circle) DP2 is ahead to the right; DP1 cannot be entered that way.
    expect(isRouteError(findRoute(ap, { node: ap.node('L2_B') }, ap.node('DP2'), ['L2', 'N'], { wingspanM: 35.8 }))).toBe(false);
    expect(isRouteError(findRoute(ap, { node: ap.node('L2_B') }, ap.node('DP1'), ['L2', 'N'], { wingspanM: 35.8 }))).toBe(true);
    expect(ap.deicingPads.map((p) => `${p.name}:${p.maxWingspanM}`)).toEqual(['DP1:65', 'DP2:80', 'DP3:36', 'DP4:36']);
  });
});
