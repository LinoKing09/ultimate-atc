import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { allowedApproachModes, parallelRoleChoices, runwayUseWords } from '../src/core/runways';
import { Simulation } from '../src/core/simulation';
import { EDDP } from '../src/data/airports/eddp';
import { createBot } from './bot';

/** Leipzig/Halle: runways 08L/26R and 08R/26L, 2.1 km apart. */
describe('parallel runway use set with the ATIS', () => {
  it('allows the approach modes the runway spacing permits and offers the ways to share the runways', () => {
    expect(allowedApproachModes(new Airport(EDDP), ['26R', '26L'])).toEqual(['independent', 'dependent', 'staggered']);
    expect(parallelRoleChoices(['26R', '26L']).map((c) => c.label)).toEqual([
      'Mixed: take-offs and landings on 26R and 26L',
      'Segregated: landings 26R, take-offs 26L',
      'Segregated: landings 26L, take-offs 26R',
      'Semi-mixed: 26R mixed, take-offs only 26L',
      'Semi-mixed: 26L mixed, take-offs only 26R',
    ]);
    expect(runwayUseWords(['26R', '26L'], { roles: { '26R': 'arrivals', '26L': 'departures' }, approaches: 'dependent' })).toBe('arrival runway 26R, departure runway 26L');
    expect(runwayUseWords(['26R', '26L'], { roles: { '26L': 'departures' }, approaches: 'dependent' })).toBe('arrival runway 26R, departure runways 26R and 26L');
  });

  it('announces mixed, segregated and semi-mixed operation and the approach mode in the ATIS and D-ATIS', () => {
    const sim = new Simulation({ airport: EDDP, position: 'TWR', density: 'medium', seed: 3, events: false, runway: '26R+26L', generateTraffic: false });
    // Default: both mixed, the airport's approach mode.
    expect(sim.atis.use).toEqual({ roles: {}, approaches: 'dependent' });
    sim.updateAtis({ use: { roles: {}, approaches: 'independent' } });
    expect(sim.atisText()).toMatch(/Expect ILS approach runways 26R and 26L, independent parallel approaches in progress, runways 26R and 26L in use/);
    expect(sim.atisDatis()).toContain('EXPECT INDEPENDENT ILS APCH');
    expect(sim.atisDatis()).toContain('RWYS 26R AND 26L');
    // Segregated: one runway for landings, the other for take-offs - no parallel approaches, no apron notices.
    sim.updateAtis({ use: { roles: { '26R': 'arrivals', '26L': 'departures' }, approaches: 'independent' } });
    expect(sim.atisText()).toMatch(/Expect ILS approach runway 26R, arrival runway 26R, departure runway 26L[,.]/);
    expect(sim.atisText()).not.toMatch(/parallel approaches|expect departure and arrival/);
    expect(sim.atisDatis()).toEqual(expect.arrayContaining(['EXPECT ILS APCH', 'ARR RWY 26R', 'DEP RWY 26L']));
    // Semi-mixed: 26R mixed, 26L take-offs only.
    sim.updateAtis({ use: { roles: { '26L': 'departures' }, approaches: 'dependent' } });
    expect(sim.atisText()).toMatch(/arrival runway 26R, departure runways 26R and 26L/);
    expect(sim.atisDatis()).toEqual(expect.arrayContaining(['ARR RWY 26R', 'DEP RWYS 26R AND 26L']));
  });

  it('keeps at least one runway for each role and an approach mode the spacing allows', () => {
    const sim = new Simulation({ airport: EDDP, position: 'TWR', density: 'medium', seed: 3, events: false, runway: '26R+26L', generateTraffic: false });
    expect(sim.checkedUse('26R+26L', { roles: { '26R': 'departures', '26L': 'departures' }, approaches: 'dependent' })?.roles).toEqual({});
    expect(sim.checkedUse('26R', { roles: { '26R': 'arrivals' }, approaches: 'dependent' })).toBeUndefined();
  });

  it('segregated: arrivals land on the arrival runway, departures leave from the departure runway', () => {
    const sim = new Simulation({
      airport: EDDP,
      position: 'GND',
      positions: ['GND', 'TWR'],
      density: 'medium',
      seed: 4,
      events: false,
      runway: '26R+26L',
      parallelUse: { roles: { '26R': 'departures', '26L': 'arrivals' }, approaches: 'dependent' },
    });
    expect(sim.arrivalRunways).toEqual(['26L']);
    expect(sim.departureRunways).toEqual(['26R']);
    const bot = createBot(sim);
    const landedOn = new Set<string>();
    const departedFrom = new Set<string>();
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      bot();
      for (const a of sim.aircraft) {
        if (a.phase === 'landing') landedOn.add(a.runway!);
        if (a.phase === 'takeoff') departedFrom.add(a.runway!);
      }
    }
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.departuresAirborne).toBeGreaterThan(4);
    expect(sim.stats.arrivalsParked).toBeGreaterThan(4);
    expect([...landedOn]).toEqual(['26L']);
    expect([...departedFrom]).toEqual(['26R']);
  }, 120000);

  it('a new runway use re-assigns the departures on their stands and the arrivals further out', () => {
    const sim = new Simulation({ airport: EDDP, position: 'GND', density: 'medium', seed: 5, events: false, runway: '26R+26L' });
    for (let t = 0; t < 300; t++) sim.tick(1);
    sim.updateAtis({ use: { roles: { '26R': 'arrivals', '26L': 'departures' }, approaches: 'dependent' } });
    for (const a of sim.aircraft) {
      if (a.category === 'departure' && a.phase === 'parked') expect(a.runway, a.callsign).toBe('26L');
      if (a.phase === 'approach' && sim.distanceToThresholdNm(a) > 3.5) expect(a.runway, a.callsign).toBe('26R');
    }
    expect(sim.messages.some((m) => /Arrival runway 26R, departure runway 26L/.test(m.text))).toBe(true);
  });
});
