import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { inDepartureSequence } from '../src/core/pilot';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';
import { KSAN } from '../src/data/airports/ksan';
import { distance } from '../src/core/geo';

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

  it('a crew lined up without a take-off clearance says so only after 2-3 minutes on the runway', () => {
    const sim = towerSim();
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    ac.ctot = undefined;
    expect(runUntil(sim, () => ac.request === 'departure', 2400)).toBe(true);
    sim.transmit('DLH5AB line up and wait runway 25');
    expect(runUntil(sim, () => ac.phase === 'lineup' && !!ac.stoppedAt && ac.speed < 0.1, 300)).toBe(true);
    const linedUp = sim.time;
    const lined = () => sim.messages.filter((m) => m.from === 'DLH5AB' && /lined up runway 25, ready for departure/.test(m.text));
    expect(runUntil(sim, () => lined().length > 0, 400)).toBe(true);
    const waited = sim.time - linedUp;
    expect(waited).toBeGreaterThanOrEqual(120);
    expect(waited).toBeLessThan(195);
  });

  it('crossing the runway while a departure is lined up and waiting is no incursion; while it rolls it is', () => {
    const sim = towerSim();
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const arr = sim.traffic.spawnDeparture(0, { stand: '13', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    ac.ctot = undefined;
    arr.readyAt = 1e9;
    expect(runUntil(sim, () => ac.request === 'departure', 2400)).toBe(true);
    sim.transmit('DLH5AB line up and wait runway 25');
    expect(runUntil(sim, () => ac.phase === 'lineup' && !!ac.stoppedAt && ac.speed < 0.1, 300)).toBe(true);
    // Another aircraft enters the runway half-way down (as a crossing would).
    const end = sim.tower.endFor('25');
    const mid = { x: (end.start.x + end.farEnd.x) / 2, y: (end.start.y + end.farEnd.y) / 2 };
    arr.phase = 'taxi';
    arr.onGround = true;
    arr.pos = mid;
    sim.tick(1);
    expect(sim.stats.incursions).toBe(0);
    // Off the runway again; the departure now cleared and rolling: entering is an incursion.
    arr.pos = { x: mid.x + 5000, y: mid.y + 5000 };
    sim.tick(1);
    ac.takeoffCleared = true;
    arr.pos = mid;
    sim.tick(1);
    expect(sim.stats.incursions).toBe(1);
  });

  it('the AI Ground takes on a departure Tower left at a clearance limit (KSAN: taxi via B, hold short of B4)', () => {
    const sim = new Simulation({ airport: KSAN, position: 'TWR', runway: '27', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(0, { callsign: 'SWA123', type: 'B738' }) as Aircraft;
    ac.ctot = undefined;
    expect(runUntil(sim, () => ac.request === 'departure', 1500)).toBe(true);
    sim.transmit('SWA123 taxi via B, hold short of taxiway B4');
    expect(runUntil(sim, () => ac.routeDestination?.kind === 'holdShort' && !!ac.stoppedAt && ac.speed < 0.1, 400)).toBe(true);
    sim.transmit('SWA123 contact ground');
    // Before, it stood there for good; now Ground taxis it on to the runway, where it calls Tower again.
    expect(runUntil(sim, () => ac.phase === 'holding', 900)).toBe(true);
  });

  it('coordination: Ground sends departures to the earliest intersection they accept', () => {
    const sim = towerSim();
    expect(sim.setSendIntersections(true)).toBeUndefined();
    expect(sim.flow.askIntersections).toBe(true);
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    ac.ctot = undefined;
    expect(runUntil(sim, () => ac.phase === 'holding', 2400)).toBe(true);
    expect(ac.earliestIntersection).toBeDefined();
    if (ac.earliestIntersection !== 'FULL') expect(ac.stoppedAt?.holdingPoint?.toUpperCase()).toBe(ac.earliestIntersection);
    // Switching the asking off stops the sending too.
    sim.setAskIntersections(false);
    expect(sim.flow.sendIntersections).toBe(false);
  });

  it('KSAN: a departure cleared at the intersection B2 lines up in front of one waiting at B1, which waits for it', () => {
    const sim = new Simulation({ airport: KSAN, position: 'TWR', runway: '27', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const a = sim.traffic.spawnDeparture(0, { callsign: 'SWA253', type: 'B38M' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(0, { callsign: 'DAL854', type: 'A20N' }) as Aircraft;
    a.ctot = b.ctot = undefined;
    b.readyAt = 200;
    expect(runUntil(sim, () => a.request === 'departure', 1500)).toBe(true);
    sim.transmit('SWA253 line up and wait runway 27');
    expect(runUntil(sim, () => a.phase === 'lineup' && !!a.stoppedAt, 300)).toBe(true);
    expect(runUntil(sim, () => b.request === 'departure', 1500)).toBe(true);
    sim.transmit('DAL854 taxi to holding point B2');
    expect(runUntil(sim, () => b.phase === 'holding', 600)).toBe(true);
    sim.transmit('DAL854 runway 27, cleared for take-off');
    expect(runUntil(sim, () => b.phase === 'lineup', 120)).toBe(true);
    // Cleared for take-off now as well: it may not roll while DAL854 is on the runway in front of it.
    sim.transmit('SWA253 runway 27, cleared for take-off');
    expect(runUntil(sim, () => b.phase === 'takeoff', 180)).toBe(true);
    expect(a.phase).toBe('lineup');
    expect(runUntil(sim, () => b.phase === 'climb' || b.phase === 'gone', 180)).toBe(true);
    expect(sim.stats.collisions).toBe(0);
  });

  it('KSAN: a departure cleared at B2 does not enter while the one from B1 is cleared for take-off and rolls towards it', () => {
    const sim = new Simulation({ airport: KSAN, position: 'TWR', runway: '27', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const a = sim.traffic.spawnDeparture(0, { callsign: 'SWA253', type: 'B38M' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(0, { callsign: 'DAL854', type: 'A20N' }) as Aircraft;
    a.ctot = b.ctot = undefined;
    b.readyAt = 200;
    expect(runUntil(sim, () => a.request === 'departure', 1500)).toBe(true);
    sim.transmit('SWA253 line up and wait runway 27');
    expect(runUntil(sim, () => a.phase === 'lineup' && !!a.stoppedAt, 300)).toBe(true);
    expect(runUntil(sim, () => b.request === 'departure', 1500)).toBe(true);
    sim.transmit('DAL854 taxi to holding point B2');
    expect(runUntil(sim, () => b.phase === 'holding', 600)).toBe(true);
    sim.transmit('SWA253 runway 27, cleared for take-off');
    sim.tick(1);
    sim.transmit('DAL854 runway 27, cleared for take-off');
    expect(runUntil(sim, () => a.phase === 'climb', 180)).toBe(true);
    expect(runUntil(sim, () => b.phase === 'climb', 300)).toBe(true);
    expect(sim.stats.collisions).toBe(0);
  });

  it('"number 2 for pushback" / "expect ... in N minutes" stop the flashing like "standby"', () => {
    for (const instr of ['number 2 for pushback', 'expect pushback in 3 minutes']) {
      const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
      const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
      ac.ctot = undefined;
      expect(runUntil(sim, () => ac.request === 'pushback', 900)).toBe(true);
      expect(ac.requestAck).toBeFalsy();
      sim.transmit(`DLH5AB ${instr}`);
      for (let t = 0; t < 5; t++) sim.tick(1);
      expect(ac.requestAck).toBe(true);
    }
  });

  for (const text of ['behind landing EWG7TK, line up and wait behind', 'behind the landing A320, line up and wait'])
    it(`conditional line-up behind landing traffic on final: "${text}"`, () => {
      const sim = towerSim();
      const d = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
      d.ctot = undefined;
      expect(runUntil(sim, () => d.phase === 'holding', 2000)).toBe(true);
      const a = sim.traffic.spawnArrival(4, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
      expect(runUntil(sim, () => a.request === 'landing', 300)).toBe(true);
      sim.transmit('EWG7TK runway 25, cleared to land');
      const n = sim.messages.length;
      sim.transmit(`DLH5AB ${text}`);
      expect(runUntil(sim, () => sim.messages.slice(n).some((m) => m.from === 'DLH5AB'), 30)).toBe(true);
      expect(sim.messages.slice(n).find((m) => m.from === 'DLH5AB')?.text).toMatch(/^Behind (landing Eurowings 7TK|the landing A320), line up and wait runway 25/);
      expect(d.giveWayTo).toBe('EWG7TK');
      // It enters the runway only once the arrival has landed and rolled past it.
      expect(runUntil(sim, () => d.phase === 'lineup', 400)).toBe(true);
      expect(a.onGround).toBe(true);
      expect(sim.stats.incursions + sim.stats.goArounds + sim.stats.collisions).toBe(0);
    });

  it('conditional pushback: "behind DLH5AB, push and start approved" waits until it has passed', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, events: false, generateTraffic: false });
    const a = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(0, { stand: '13', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    a.ctot = b.ctot = undefined;
    expect(runUntil(sim, () => a.request === 'pushback', 900)).toBe(true);
    sim.transmit('DLH5AB push and start approved');
    expect(runUntil(sim, () => a.request === 'taxi', 600)).toBe(true);
    sim.transmit('DLH5AB taxi to holding point A');
    expect(runUntil(sim, () => b.request === 'pushback', 900)).toBe(true);
    sim.transmit('EWG7TK behind DLH5AB, push and start approved');
    sim.tick(1);
    expect(b.giveWayTo).toBe('DLH5AB');
    const start = distance(a.pos, b.pos);
    expect(runUntil(sim, () => !b.giveWayTo, 400)).toBe(true);
    expect(distance(a.pos, b.pos)).toBeGreaterThan(start);
    expect(runUntil(sim, () => b.phase === 'startup' || b.phase === 'taxi', 300)).toBe(true);
    expect(sim.stats.collisions).toBe(0);
  });
});
