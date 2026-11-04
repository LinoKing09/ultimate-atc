import { describe, expect, it } from 'vitest';
import { fingerprint, perform, restoreSession, saveSession } from '../src/core/session';
import { Simulation } from '../src/core/simulation';
import { AIRPORTS } from '../src/data/airports';
import { EDDS } from '../src/data/airports/edds';
import { clearedTo, shownRequest, statusCode } from '../src/ui/labels';

/** Realistic control mode: the controller keeps the lists by hand (core/strips.ts). */
describe('strip marks (realistic mode)', () => {
  const run = () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', positions: ['DEL', 'GND', 'TWR'], density: 'medium', seed: 11, events: false });
    for (let t = 0; t < 600 && !sim.aircraft.some((a) => a.category === 'departure'); t++) sim.tick(1);
    const ac = sim.aircraft.find((a) => a.category === 'departure')!;
    return { sim, ac };
  };

  it('shows only what was entered, not what the radio did', () => {
    const { sim, ac } = run();
    expect(statusCode(ac, 'euroscope', true)).toBe('');
    expect(clearedTo(ac, true)).toBe('');
    expect(shownRequest(ac, true)).toBeUndefined();
    perform(sim, { k: 'strip', callsign: ac.callsign, field: 'request', value: 'TAXI' });
    perform(sim, { k: 'strip', callsign: ac.callsign, field: 'status', value: 'PUSH' });
    perform(sim, { k: 'strip', callsign: ac.callsign, field: 'target', value: 'R07' });
    perform(sim, { k: 'strip', callsign: ac.callsign, field: 'cleared', value: true });
    expect(shownRequest(ac, true)).toEqual({ label: 'TAXI', since: sim.time, open: true });
    expect(statusCode(ac, 'euroscope', true)).toBe('PUSH');
    expect(statusCode(ac, 'phx', true)).toBe('PBG');
    expect(clearedTo(ac, true)).toBe('R07');
    expect(ac.strip?.cleared).toBe(true);
    // Cleared again.
    perform(sim, { k: 'strip', callsign: ac.callsign, field: 'request', value: undefined });
    perform(sim, { k: 'strip', callsign: ac.callsign, field: 'cleared', value: false });
    expect(shownRequest(ac, true)).toBeUndefined();
    expect(ac.strip?.cleared).toBeUndefined();
  });

  it('never changes the simulation, and a saved session shows the marks again', async () => {
    const a = run();
    const b = run();
    perform(a.sim, { k: 'strip', callsign: a.ac.callsign, field: 'status', value: 'ST-UP' });
    for (let t = 0; t < 300; t++) {
      a.sim.tick(1);
      b.sim.tick(1);
    }
    expect(fingerprint(a.sim)).toBe(fingerprint(b.sim));
    const { sim: back, matches } = await restoreSession(JSON.parse(JSON.stringify(saveSession(a.sim, 'x', 0))), AIRPORTS);
    expect(matches).toBe(true);
    expect(back.find(a.ac.callsign)?.strip?.status).toBe('ST-UP');
  }, 30000);
});
