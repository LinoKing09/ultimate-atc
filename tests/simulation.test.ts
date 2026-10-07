import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

function makeSim(runway = '25') {
  return new Simulation({ airport: EDDS, position: 'GND', runway, density: 'medium', seed: 42, generateTraffic: false });
}

/** Runs the simulation until `cond` is true or `maxSeconds` elapse. */
function runUntil(sim: Simulation, cond: () => boolean, maxSeconds = 900): boolean {
  for (let t = 0; t < maxSeconds; t += 1) {
    if (cond()) return true;
    sim.tick(1);
  }
  return cond();
}

function lastPilotMessage(sim: Simulation, callsign: string): string {
  const msgs = sim.messages.filter((m) => m.kind === 'pilot' && m.from === callsign);
  return msgs[msgs.length - 1]?.text ?? '';
}

describe('departure flow', () => {
  it('push, taxi, handoff and take-off', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '10', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    expect(ac).toBeDefined();

    expect(runUntil(sim, () => ac.request === 'pushback')).toBe(true);
    expect(lastPilotMessage(sim, 'DLH5AB')).toMatch(/Stuttgart Ground, Lufthansa 5AB, stand 10, information [A-Z], request (pushback|push and start)/);

    sim.transmit('DLH5AB pushback approved facing east');
    expect(runUntil(sim, () => lastPilotMessage(sim, 'DLH5AB').startsWith('Pushback approved'), 10)).toBe(true);
    expect(runUntil(sim, () => ac.phase === 'startup')).toBe(true);
    // nose roughly east after pushback (runway heading ~074)
    expect(Math.abs(((ac.heading - 74 + 540) % 360) - 180)).toBeLessThan(15);

    expect(runUntil(sim, () => ac.request === 'taxi')).toBe(true);
    sim.transmit('DLH5AB taxi to holding point G1 via R N G');
    expect(runUntil(sim, () => /Taxi to holding point G1 via R, N, G, Lufthansa 5AB/.test(lastPilotMessage(sim, 'DLH5AB')), 10)).toBe(true);
    expect(runUntil(sim, () => ac.phase === 'holding', 900)).toBe(true);

    expect(runUntil(sim, () => ac.request === 'handoff', 60)).toBe(true);
    sim.transmit('DLH5AB contact tower 118.805');
    expect(runUntil(sim, () => ac.frequency === 'TWR', 15)).toBe(true);
    expect(sim.stats.departuresHandedOff).toBe(1);

    expect(runUntil(sim, () => !sim.aircraft.includes(ac), 600)).toBe(true);
    expect(sim.stats.departuresAirborne).toBe(1);
    expect(sim.incidents).toEqual([]);
  });

  it('pilot rejects a route that does not exist', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '10', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB push and start approved');
    runUntil(sim, () => ac.request === 'taxi');
    sim.transmit('DLH5AB taxi to holding point G1 via S');
    runUntil(sim, () => lastPilotMessage(sim, 'DLH5AB').includes('unable'), 10);
    expect(lastPilotMessage(sim, 'DLH5AB')).toMatch(/unable to follow route via S/i);
  });

  it('pilot says again on gibberish', () => {
    const sim = makeSim();
    sim.traffic.spawnDeparture(200, { stand: '10', callsign: 'DLH5AB', type: 'A320' });
    sim.transmit('DLH5AB banana split');
    runUntil(sim, () => lastPilotMessage(sim, 'DLH5AB') !== '', 10);
    expect(lastPilotMessage(sim, 'DLH5AB')).toBe('Say again, Lufthansa 5AB?');
  });
});

describe('arrival flow', () => {
  it('lands, vacates, calls ground and parks', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnArrival(4, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    expect(ac.phase).toBe('approach');
    expect(runUntil(sim, () => ac.request === 'taxiIn', 400)).toBe(true);
    expect(lastPilotMessage(sim, 'EWG7TK')).toMatch(/vacated runway 25 via [A-G]/);
    const stand = ac.assignedStand!;
    expect(stand).toBeDefined();
    sim.transmit(`EWG7TK taxi to stand ${stand}`);
    expect(runUntil(sim, () => ac.phase === 'arrived', 900)).toBe(true);
    expect(sim.stats.arrivalsParked).toBe(1);
  });
});

describe('runway crossing', () => {
  it('stops at the runway holding point until cleared to cross', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '82', callsign: 'THY1734', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('THY1734 push and start approved facing east');
    runUntil(sim, () => ac.request === 'taxi');
    sim.transmit('THY1734 taxi to holding point F1 via S F');
    expect(runUntil(sim, () => ac.request === 'crossing', 600)).toBe(true);
    expect(ac.stoppedAt?.holdingPoint).toBe('F2');
    expect(lastPilotMessage(sim, 'THY1734')).toMatch(/holding short runway 25 at F2/);
    sim.tick(30);
    expect(ac.speed).toBe(0);
    sim.transmit('THY1734 cross runway 25');
    expect(runUntil(sim, () => ac.phase === 'holding', 300)).toBe(true);
    expect(sim.incidents).toEqual([]);
  });
});

describe('separation', () => {
  it('a taxiing aircraft stops behind another one', () => {
    const sim = makeSim();
    const a = sim.traffic.spawnDeparture(2, { stand: '12', callsign: 'DLH1AA', type: 'A320' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH2BB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => a.request === 'pushback' && b.request === 'pushback');
    sim.transmit('DLH1AA push and start approved facing east');
    sim.transmit('DLH2BB push and start approved facing east');
    runUntil(sim, () => a.request === 'taxi' && b.request === 'taxi', 400);
    sim.transmit('DLH2BB taxi to holding point G1 via R N G');
    sim.tick(5);
    sim.transmit('DLH1AA taxi to holding point G1 via R N G');
    runUntil(sim, () => a.phase === 'holding' || b.phase === 'holding', 900);
    runUntil(sim, () => false, 120);
    expect(sim.incidents.filter((i) => i.type === 'collision')).toEqual([]);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan(35);
  });
});

describe('full traffic smoke test', () => {
  it('runs an hour of unattended traffic without throwing', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '07', density: 'heavy', seed: 7 });
    for (let t = 0; t < 3600; t++) sim.tick(1);
    expect(sim.aircraft.length).toBeGreaterThan(0);
    // unattended pilots keep calling
    expect(sim.messages.filter((m) => m.kind === 'pilot').length).toBeGreaterThan(10);
  });
});
