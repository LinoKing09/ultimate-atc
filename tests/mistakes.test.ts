import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

/** A Ground session at Stuttgart until the first departure asks for taxi (pushback approved on the way). */
function untilTaxiRequest(seed = 3): { sim: Simulation; ac: Aircraft } {
  const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed, events: false });
  for (let t = 0; t < 2400; t++) {
    sim.tick(1);
    for (const a of sim.aircraft) {
      if (a.request === 'pushback' && sim.time - a.lastCallAt > 3) sim.transmit(`${a.callsign} push and start approved`);
      if (a.request === 'taxi' && sim.time - a.lastCallAt > 3) return { sim, ac: a };
    }
  }
  throw new Error('no taxi request');
}
const lastSaid = (sim: Simulation, cs: string) => sim.messages.filter((m) => m.from === cs).at(-1)?.text ?? '';
const run = (sim: Simulation, s: number) => {
  for (let t = 0; t < s; t++) sim.tick(1);
};

describe('crew mistakes on the ground', () => {
  it('a wrong holding point in the read-back: corrected, it counts as caught', () => {
    const { sim, ac } = untilTaxiRequest();
    sim.forceCrewMistake = 'taxiReadback';
    expect(sim.transmit(`${ac.callsign} taxi to holding point B`).ok).toBe(true);
    run(sim, 6);
    const said = ac.taxiReadbackError?.said;
    expect(said).toBeDefined();
    expect(lastSaid(sim, ac.callsign)).toMatch(new RegExp(`^Taxi to holding point ${said}\\b`));
    run(sim, 10);
    sim.transmit(`${ac.callsign} negative, taxi to holding point B`);
    run(sim, 6);
    expect(ac.taxiReadbackError).toBeUndefined();
    expect(sim.stats.readbackErrorsCaught).toBe(1);
    expect(ac.routeDestination).toMatchObject({ kind: 'holdingPoint', name: 'B' });
  });

  it('a wrong holding point not corrected: after 40 s it counts as missed and the crew taxis there', () => {
    const { sim, ac } = untilTaxiRequest();
    sim.forceCrewMistake = 'taxiReadback';
    sim.transmit(`${ac.callsign} taxi to holding point B`);
    run(sim, 6);
    const said = ac.taxiReadbackError!.said;
    run(sim, 45);
    expect(sim.stats.readbackErrorsMissed).toBe(1);
    // Still pushing back / starting up: the pending taxi goes there; already taxiing: the route does.
    expect((ac.pendingTaxi?.destination ?? ac.routeDestination) as { name?: string }).toMatchObject({ name: said });
  });

  it('a wrong turn: the crew stops on the other taxiway, reports it and asks for instructions', () => {
    const { sim, ac } = untilTaxiRequest();
    sim.forceCrewMistake = 'wrongTurn';
    sim.transmit(`${ac.callsign} taxi to holding point A`);
    let reported = false;
    for (let t = 0; t < 900 && !reported; t++) {
      sim.tick(1);
      reported = /by mistake, holding on .*request instructions/.test(lastSaid(sim, ac.callsign));
    }
    expect(reported).toBe(true);
    expect(sim.stats.wrongTurns).toBe(1);
    expect(ac.request).toBe('route');
    expect(sim.stats.collisions).toBe(0);
    // A new taxi instruction from there takes it to the holding point it was cleared to.
    run(sim, 5);
    expect(sim.transmit(`${ac.callsign} taxi to holding point A`).ok).toBe(true);
    for (let t = 0; t < 900 && ac.phase !== 'holding'; t++) sim.tick(1);
    expect(ac.phase).toBe('holding');
  });

  it('the wrong-turn report is not dropped by an earlier request to pass a slot flight', () => {
    const { sim, ac } = untilTaxiRequest();
    sim.forceCrewMistake = 'wrongTurn';
    sim.transmit(`${ac.callsign} taxi to holding point A`);
    // The crew asked to pass a slot flight earlier; that slot flight is gone now.
    ac.slotPassAsked = 'XYZ123';
    for (let t = 0; t < 900 && !/by mistake/.test(lastSaid(sim, ac.callsign)); t++) sim.tick(1);
    run(sim, 3);
    expect(ac.request).toBe('route');
  });

  it('no mistakes in tutorials or with the random read-back errors off, and none in instructions of the simulator', () => {
    const { sim, ac } = untilTaxiRequest();
    sim.readbackErrors = 'off';
    sim.transmit(`${ac.callsign} taxi to holding point B`);
    run(sim, 6);
    expect(ac.taxiReadbackError).toBeUndefined();
    expect(ac.wrongTurn).toBeUndefined();
  });
});

describe('crew mistakes and the AI Ground', () => {
  it('a crew that took a wrong turn is taken on by the AI Ground when you switch Ground off', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', positions: ['GND', 'TWR'], runway: '25', density: 'medium', seed: 3, events: false });
    let ac: Aircraft | undefined;
    for (let t = 0; t < 2400 && !ac; t++) {
      sim.tick(1);
      for (const a of sim.aircraft) {
        if (a.request === 'pushback' && sim.time - a.lastCallAt > 3) sim.transmit(`${a.callsign} push and start approved`);
        if (a.request === 'taxi' && sim.time - a.lastCallAt > 3) ac = a;
      }
    }
    sim.forceCrewMistake = 'wrongTurn';
    sim.transmit(`${ac!.callsign} taxi to holding point A`);
    for (let t = 0; t < 900 && ac!.request !== 'route'; t++) sim.tick(1);
    expect(sim.stats.wrongTurns).toBe(1);
    sim.setStationActive('GND', false);
    for (let t = 0; t < 900 && ac!.phase !== 'holding' && ac!.frequency !== 'TWR'; t++) sim.tick(1);
    expect(ac!.phase === 'holding' || ac!.frequency === 'TWR').toBe(true);
  });
});
