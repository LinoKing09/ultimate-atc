import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { inDepartureSequence } from '../src/core/pilot';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}
function towerSim() {
  return new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
}

describe('slots and the departure sequence', () => {
  it('the AI Ground keeps a slot flight on its stand until CTOT - taxi time (without A-CDM)', () => {
    const sim = towerSim();
    sim.systems.acdm = false;
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    ac.ctot = sim.time + 30 * 60;
    for (let t = 0; t < 15 * 60; t++) sim.tick(1);
    expect(ac.phase).toBe('parked');
    expect(runUntil(sim, () => ac.phase !== 'parked', 10 * 60)).toBe(true);
    // It reaches the holding point when its window is open, or shortly before.
    expect(runUntil(sim, () => ac.phase === 'holding', 20 * 60)).toBe(true);
    expect(sim.time).toBeGreaterThan(ac.ctot - 10 * 60);
  });

  it('a departure heard by Tower does not remind it while another one is ahead of it', () => {
    const sim = towerSim();
    const a = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(0, { stand: '13', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    for (const ac of [a, b]) ac.ctot = undefined;
    expect(runUntil(sim, () => a.request === 'departure' && b.request === 'departure' && (a.phase === 'holding' || b.phase === 'holding'), 2400)).toBe(true);
    const [first, second] = (a.holdingSince ?? Infinity) <= (b.holdingSince ?? Infinity) ? [a, b] : [b, a];
    expect(inDepartureSequence(sim, second)).toBe(true);
    expect(inDepartureSequence(sim, first)).toBe(false);
    sim.transmit(`${second.callsign} roger`);
    for (let t = 0; t < 8; t++) sim.tick(1);
    const n = sim.messages.filter((m) => m.from === second.callsign).length;
    // Far beyond the 4 minutes of a "roger": no reminder while the other one waits ahead of it.
    for (let t = 0; t < 8 * 60; t++) sim.tick(1);
    expect(sim.messages.filter((m) => m.from === second.callsign).length).toBe(n);
  });

  it('crews without A-CDM say their CTOT when they ask for pushback', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
    sim.systems.acdm = false;
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    ac.ctot = sim.time + 40 * 60;
    expect(runUntil(sim, () => ac.request === 'pushback', 900)).toBe(true);
    expect(sim.messages.filter((m) => m.from === 'DLH5AB').at(-1)?.text).toMatch(/request (pushback|push and start), CTOT \d{4}$/);
  });

  it('the simulator sends a departure heading for the holding point of an early slot flight to another one', () => {
    const sim = new Simulation({ airport: EDDS, position: 'DEL', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const a = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(0, { stand: '13', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    for (const ac of [a, b]) {
      ac.ctot = undefined;
      ac.cleared = true;
      ac.frequency = 'GND';
    }
    b.readyAt = 60;
    // A new slot for the first one once it taxis, far ahead: it waits at the holding point.
    expect(runUntil(sim, () => a.phase === 'taxi', 600)).toBe(true);
    a.ctot = sim.time + 40 * 60;
    expect(runUntil(sim, () => a.phase === 'holding', 1200)).toBe(true);
    const taken = a.stoppedAt?.holdingPoint;
    // The one behind does not queue behind it.
    expect(runUntil(sim, () => b.phase === 'holding' || b.phase === 'takeoff' || b.phase === 'climb', 1200)).toBe(true);
    expect(a.phase).toBe('holding');
    expect(b.flightPlan.runway === '25' && b.stoppedAt?.holdingPoint === taken).toBe(false);
  });

  it('on your frequency the crew heading for the holding point of an early slot flight asks for another one', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const a = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(0, { stand: '13', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    for (const ac of [a, b]) ac.ctot = undefined;
    expect(runUntil(sim, () => a.request === 'pushback', 900)).toBe(true);
    sim.transmit('DLH5AB push and start approved');
    expect(runUntil(sim, () => a.request === 'taxi', 600)).toBe(true);
    sim.transmit('DLH5AB taxi to holding point A');
    expect(runUntil(sim, () => a.phase === 'holding', 1200)).toBe(true);
    a.ctot = sim.time + 40 * 60;
    expect(runUntil(sim, () => b.request === 'pushback', 900)).toBe(true);
    sim.transmit('EWG7TK push and start approved');
    expect(runUntil(sim, () => b.request === 'taxi', 600)).toBe(true);
    sim.transmit('EWG7TK taxi to holding point A');
    expect(runUntil(sim, () => b.request === 'route', 900)).toBe(true);
    const text = sim.messages.filter((m) => m.from === 'EWG7TK').at(-1)?.text ?? '';
    expect(text).toMatch(/waiting for its slot at holding point A, request taxi to holding point \S+$/);
    const hp = /request taxi to holding point (\S+)$/.exec(text)![1];
    sim.transmit(`EWG7TK taxi to holding point ${hp}`);
    expect(runUntil(sim, () => b.phase === 'holding', 900)).toBe(true);
    expect(b.stoppedAt?.holdingPoint).toBe(hp);
  });
});
