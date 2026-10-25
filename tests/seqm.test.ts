import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { sidsForDestination } from '../src/core/delivery';
import { formatClearance } from '../src/core/phraseology/format';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { SEQM } from '../src/data/airports/seqm';
import { createBot } from './bot';

describe('Quito (SEQM) after the AIP Ecuador', () => {
  it('has runway 18/36, the taxiways of the charts (renamed from OpenStreetMap), holding points and stands', () => {
    const ap = new Airport(SEQM);
    expect(SEQM.runways.map((r) => [r.name, r.lengthM])).toEqual([['18/36', 4098]]);
    for (const t of ['A', 'A1', 'A2', 'A3', 'B', 'C', 'E', 'F', 'G', 'H', 'J']) expect(ap.taxiwayNames.has(t), t).toBe(true);
    expect(SEQM.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort()).toEqual(['A1', 'A18', 'A2', 'A3', 'A36']);
    const aprons = new Map<string, number>();
    for (const s of ap.stands.values()) aprons.set(s.apron, (aprons.get(s.apron) ?? 0) + 1);
    expect(Object.fromEntries(aprons)).toEqual({ 'Commercial apron': 34, 'Cargo apron': 7 });
    // The B747-8 freighters (code F) on the stands the AIP gives them.
    expect([...ap.stands.values()].filter((s) => s.maxWingspanM >= 80).map((s) => s.id).sort()).toEqual(['81', '84A', '85']);
  });

  it('files the RNAV SIDs of runway 36 by direction and gives radar vectors from runway 18', () => {
    expect(sidsForDestination(SEQM, '36', 'SKBO').map((s) => s.name)).toEqual(['ARNOK3A']);
    expect(sidsForDestination(SEQM, '36', 'SEGU').map((s) => s.name)).toEqual(['REBEK3A', 'REBEK3B']);
    expect(sidsForDestination(SEQM, '36', 'KMIA').map((s) => s.name)).toEqual(['NEGAL3A']);
    expect(sidsForDestination(SEQM, '18', 'KMIA').map((s) => s.name)).toEqual(['RV']);
    const parsed = parseTransmission('LNE123 cleared to Guayaquil, radar vectors, flight planned route, climb 17000 feet, squawk 4321', { callsigns: ['LNE123'], taxiways: new Set(), sids: SEQM.sids.map((s) => s.name) });
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.commands[0]).toMatchObject({ type: 'clearance', sid: 'RV', climb: { feet: 17000 }, squawk: '4321' });
    expect(formatClearance({ type: 'clearance', destination: 'segu', sid: 'RV', climb: { feet: 17000 }, squawk: '4321' })).toBe(
      'cleared to Guayaquil, radar vectors, flight planned route, climb 17000 feet, squawk 4321',
    );
  });

  it('a crew cleared with radar vectors on runway 18 reads it back', () => {
    const sim = new Simulation({ airport: SEQM, position: 'GND', runway: '18', density: 'medium', seed: 2, events: false });
    let ac = sim.aircraft.find((a) => a.category === 'departure' && a.onGround && !a.cleared);
    for (let t = 0; t < 1800 && !ac; t++) {
      sim.tick(1);
      ac = sim.aircraft.find((a) => a.category === 'departure' && a.onGround && !a.cleared);
    }
    expect(ac, 'a departure waiting for its clearance').toBeDefined();
    expect(ac!.flightPlan.sid).toBe('RV');
    sim.transmit(`${ac!.callsign} cleared to ${ac!.flightPlan.destination}, radar vectors, flight planned route, climb 17000 feet, squawk 4321`);
    for (let t = 0; t < 10; t++) sim.tick(1);
    expect(ac!.clearance).toMatchObject({ sid: 'RV', squawk: '4321' });
  });

  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['36', '18']) {
      const sim = new Simulation({ airport: SEQM, position: 'GND', runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(5);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(3);
    }
  }, 120000);
});
