import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { acknowledgeCatc, catcAlert, findRouteConflicts, resolveOptions, routeHeadOn } from '../src/core/conflicts';
import { previewTaxi } from '../src/core/pilot';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}

/** A departure from stand 72 eastbound on N and an "arrival" westbound on N towards it. */
function headOnSetup(): { sim: Simulation; dep: Aircraft; arr: Aircraft } {
  const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'light', seed: 3, generateTraffic: false });
  const dep = sim.traffic.spawnDeparture(1, { stand: '72', callsign: 'DLH1AB', type: 'A320' }) as Aircraft;
  const arr = sim.traffic.spawnDeparture(9999, { stand: '105', callsign: 'EWG2CD', type: 'A320' }) as Aircraft;
  const node = sim.airport.node('N_E');
  Object.assign(arr, { pos: { ...node.pos }, heading: 254, phase: 'taxi', category: 'arrival', stand: undefined, assignedStand: '14' });
  runUntil(sim, () => dep.request === 'pushback');
  sim.transmit('DLH1AB push and start approved facing east');
  runUntil(sim, () => dep.request === 'taxi', 400);
  return { sim, dep, arr };
}

describe('head-on conflicts (CATC)', () => {
  it('warns before a route is transmitted and alerts on conflicting cleared routes', () => {
    const { sim, dep, arr } = headOnSetup();
    sim.transmit('DLH1AB taxi to holding point A via N');
    runUntil(sim, () => /Taxi to holding point A/.test(sim.messages.at(-1)?.text ?? ''), 20);
    // Preview of the opposite route for the arrival: CATC sees the departure on N.
    const p = previewTaxi(sim, arr, { type: 'taxi', destination: { kind: 'stand', stand: '14' }, via: ['N', 'L2'], holdShort: [], cross: [] });
    expect('error' in p).toBe(false);
    if ('error' in p) return;
    const c = routeHeadOn(sim, arr, [arr.pos, ...p.route.nodes.map((n) => n.pos)]);
    expect(c?.other.callsign).toBe('DLH1AB');
    expect(c?.taxiway).toBe('N');
    // Once both are cleared, the alert fires.
    sim.transmit('EWG2CD taxi to stand 14 via N, L2');
    for (let t = 0; t < 15; t++) sim.tick(1);
    expect(findRouteConflicts(sim).size).toBe(1);
    expect(sim.messages.some((m) => /CATC: DLH1AB and EWG2CD are routed head-on on N/.test(m.text))).toBe(true);
    void dep;
  });

  it('acknowledged CATC alerts stop flashing until the conflict ends', () => {
    const { sim, dep, arr } = headOnSetup();
    sim.transmit('DLH1AB taxi to holding point A via N');
    sim.transmit('EWG2CD taxi to stand 14 via N, L2');
    runUntil(sim, () => sim.routeConflicts.size > 0, 30);
    expect(catcAlert(sim, dep)?.b.callsign).toBe('EWG2CD');
    expect(acknowledgeCatc(sim, arr)).toBe(1);
    expect(catcAlert(sim, dep)).toBeUndefined();
    expect(catcAlert(sim, arr)).toBeUndefined();
    for (let t = 0; t < 10; t++) sim.tick(1);
    expect(catcAlert(sim, dep)).toBeUndefined();
  });

  it('offers a way out before they meet: one aircraft turns off via another taxiway', () => {
    const { sim, dep, arr } = headOnSetup();
    sim.transmit('DLH1AB taxi to holding point A via N');
    sim.transmit('EWG2CD taxi to stand 14 via N, L2');
    runUntil(sim, () => sim.routeConflicts.size > 0, 30);
    const options = resolveOptions(sim, dep, arr);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => !o.tug)).toBe(true);
    const opt = options[0];
    sim.transmit(`${opt.aircraft.callsign} ${opt.instruction}`);
    expect(runUntil(sim, () => dep.phase === 'holding' && arr.phase === 'arrived', 1500)).toBe(true);
    expect(sim.stats.collisions).toBe(0);
  });

  it('needs a tug when they already stand nose to nose with no junction between them', () => {
    const { sim, dep, arr } = headOnSetup();
    sim.transmit('DLH1AB taxi to holding point A via N');
    sim.transmit('EWG2CD taxi to stand 14 via N, L2');
    runUntil(sim, () => !!arr.blockedBy && !!dep.blockedBy && arr.speed === 0 && dep.speed === 0, 400);
    for (let t = 0; t < 40; t++) sim.tick(1); // stuck for a while: pilots accept a tug
    const options = resolveOptions(sim, dep, arr);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.tug)).toBe(true);
    const opt = options[0];
    sim.transmit(`${opt.aircraft.callsign} ${opt.instruction}`);
    expect(runUntil(sim, () => /we need a tug to turn around, expect about \d+ minutes/.test(sim.messages.filter((m) => m.from === opt.aircraft.callsign).at(-1)?.text ?? ''), 20)).toBe(true);
    const waitedFrom = sim.time;
    runUntil(sim, () => opt.aircraft.speed > 1, 900);
    expect(sim.time - waitedFrom).toBeGreaterThan(290);
    expect(runUntil(sim, () => dep.phase === 'holding' && arr.phase === 'arrived', 1800)).toBe(true);
    expect(sim.stats.collisions).toBe(0);
  });
});
