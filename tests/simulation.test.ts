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
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    expect(ac).toBeDefined();

    expect(runUntil(sim, () => ac.request === 'pushback')).toBe(true);
    expect(lastPilotMessage(sim, 'DLH5AB')).toMatch(/Stuttgart Ground, Lufthansa 5AB, stand 14, information [A-Z], request (pushback|push and start)/);

    sim.transmit('DLH5AB pushback approved facing east');
    expect(runUntil(sim, () => lastPilotMessage(sim, 'DLH5AB').startsWith('Pushback approved'), 10)).toBe(true);
    expect(runUntil(sim, () => ac.phase === 'startup')).toBe(true);
    // nose roughly east after pushback (runway heading ~074)
    expect(Math.abs(((ac.heading - 74 + 540) % 360) - 180)).toBeLessThan(15);

    expect(runUntil(sim, () => ac.request === 'taxi')).toBe(true);
    sim.transmit('DLH5AB taxi to holding point A via M H N');
    expect(runUntil(sim, () => /Taxi to holding point A via M, H, N, Lufthansa 5AB/.test(lastPilotMessage(sim, 'DLH5AB')), 10)).toBe(true);
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
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB push and start approved');
    runUntil(sim, () => ac.request === 'taxi');
    sim.transmit('DLH5AB taxi to holding point A via S');
    runUntil(sim, () => lastPilotMessage(sim, 'DLH5AB').includes('unable'), 10);
    expect(lastPilotMessage(sim, 'DLH5AB')).toMatch(/unable to follow route via S/i);
  });

  it('pilot says again on gibberish', () => {
    const sim = makeSim();
    sim.traffic.spawnDeparture(200, { stand: '14', callsign: 'DLH5AB', type: 'A320' });
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
    const ac = sim.traffic.spawnDeparture(2, { stand: '102', callsign: 'THY1734', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('THY1734 push and start approved facing east');
    runUntil(sim, () => ac.request === 'taxi');
    sim.transmit('THY1734 taxi to holding point H via V W');
    expect(runUntil(sim, () => ac.request === 'crossing', 600)).toBe(true);
    expect(ac.stoppedAt?.holdingPoint).toBe('W');
    expect(lastPilotMessage(sim, 'THY1734')).toMatch(/holding short runway 25 at W/);
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
    const b = sim.traffic.spawnDeparture(2, { stand: '15', callsign: 'DLH2BB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => a.request === 'pushback' && b.request === 'pushback');
    sim.transmit('DLH1AA push and start approved facing east');
    sim.transmit('DLH2BB push and start approved facing east');
    runUntil(sim, () => a.request === 'taxi' && b.request === 'taxi', 400);
    sim.transmit('DLH2BB taxi to holding point A via M H N');
    sim.tick(5);
    sim.transmit('DLH1AA taxi to holding point A via M H N');
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

describe('routing realism (feedback round 1)', () => {
  it('arrivals never turn back towards the runway when taxi starts', () => {
    for (const rwy of ['25', '07']) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const sim = new Simulation({ airport: EDDS, position: 'GND', runway: rwy, density: 'medium', seed, generateTraffic: false, events: false });
        const ac = sim.traffic.spawnArrival(4, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
        runUntil(sim, () => ac.request === 'taxiIn', 400);
        sim.transmit(`EWG7TK taxi to stand ${ac.assignedStand}`);
        let last = ac.heading;
        for (let i = 0; i < 150; i++) {
          sim.tick(0.2);
          const d = Math.abs(((ac.heading - last + 540) % 360) - 180);
          expect(d, `${rwy}/${seed} heading jump`).toBeLessThan(60);
          last = ac.heading;
        }
      }
    }
  });

  it('after pushing facing west the aircraft taxis west and never plans a U-turn', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB push and start approved facing west');
    runUntil(sim, () => ac.request === 'taxi', 400);
    sim.transmit('DLH5AB taxi to holding point K via L3, O');
    sim.tick(5);
    expect(ac.route?.taxiways).toEqual(['M', 'L3', 'O', 'K']);
    expect(ac.route?.requiresUTurn).toBe(false);
    sim.transmit('DLH5AB taxi to runway 25');
    sim.tick(5);
    expect(ac.route?.requiresUTurn).toBe(false);
    expect(ac.route?.taxiways.slice(0, 2)).toEqual(['M', 'L3']);
    expect(ac.route?.taxiways).not.toContain('L2');
  });
});

describe('extended phraseology', () => {
  it('cancels a pushback before the tug moves', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB pushback approved');
    sim.tick(2);
    sim.transmit('DLH5AB cancel pushback');
    runUntil(sim, () => lastPilotMessage(sim, 'DLH5AB').startsWith('Pushback cancelled'), 10);
    expect(ac.phase).toBe('parked');
  });

  it('stops and continues a pushback', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB pushback approved');
    runUntil(sim, () => ac.speed > 1, 60);
    sim.transmit('DLH5AB stop pushback');
    sim.tick(8);
    expect(ac.speed).toBe(0);
    sim.transmit('DLH5AB continue pushback');
    runUntil(sim, () => ac.phase === 'startup', 200);
    expect(ac.phase).toBe('startup');
  });

  it('assigns queue numbers and suppresses reminders', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'CFG11', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('CFG11 number 2 for pushback');
    runUntil(sim, () => lastPilotMessage(sim, 'CFG11').startsWith('Number 2 for pushback'), 10);
    const calls = sim.messages.filter((m) => m.from === 'CFG11').length;
    sim.tick(140);
    expect(sim.messages.filter((m) => m.from === 'CFG11').length).toBe(calls);
    expect(ac.sequence?.number).toBe(2);
  });

  it('accepts an incomplete taxi instruction with a clearance limit', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB push and start approved facing east');
    runUntil(sim, () => ac.request === 'taxi', 400);
    sim.transmit('DLH5AB taxi via M, L2, N, hold short of H');
    runUntil(sim, () => /Taxi via M, L2, N, hold short of taxiway H/.test(lastPilotMessage(sim, 'DLH5AB')), 10);
    runUntil(sim, () => ac.stoppedAt?.kind === 'destination', 400);
    const nH = sim.airport.node('N_H').pos;
    const d = Math.hypot(ac.pos.x - nH.x, ac.pos.y - nH.y);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(60);
    sim.transmit('DLH5AB taxi to holding point A via N');
    runUntil(sim, () => ac.phase === 'holding', 600);
    expect(ac.stoppedAt?.holdingPoint).toBe('A');
  });

  it('refuses a route that needs an airliner to turn around', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB push and start approved facing west');
    runUntil(sim, () => ac.request === 'taxi', 400);
    sim.transmit('DLH5AB taxi via M, L2, N, hold short of H');
    expect(runUntil(sim, () => /cannot turn around/.test(lastPilotMessage(sim, 'DLH5AB')), 30)).toBe(true);
    expect(ac.phase).not.toBe('taxi');
  });

  it('answers whether it is able for an intersection departure', () => {
    const sim = makeSim();
    const jet = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DCMGB', type: 'C56X' }) as Aircraft;
    const heavy = sim.traffic.spawnDeparture(2, { stand: '12', callsign: 'THY1734', type: 'A332' }) as Aircraft;
    void jet;
    void heavy;
    sim.transmit('DCMGB advise able for departure from intersection D');
    expect(runUntil(sim, () => /^Affirm, able intersection D/.test(lastPilotMessage(sim, 'DCMGB')), 20)).toBe(true);
    sim.transmit('THY1734 are you able intersection D');
    expect(runUntil(sim, () => /^Negative, we require full length/.test(lastPilotMessage(sim, 'THY1734')), 20)).toBe(true);
  });

  it('refuses taxi to an intersection that is too short', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'THY1734', type: 'A332' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('THY1734 push and start approved facing east');
    runUntil(sim, () => ac.request === 'taxi', 400);
    sim.transmit('THY1734 taxi to holding point D via M, H, N');
    expect(runUntil(sim, () => /Unable intersection D, we require full length/.test(lastPilotMessage(sim, 'THY1734')), 20)).toBe(true);
  });

  it('lets the AI Tower move on a departure stranded short of the holding point', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB push and start approved facing east');
    runUntil(sim, () => ac.request === 'taxi', 400);
    sim.transmit('DLH5AB taxi via M, H, N, hold short of A');
    runUntil(sim, () => ac.stoppedAt?.kind === 'destination', 900);
    sim.transmit('DLH5AB contact tower');
    runUntil(sim, () => ac.frequency === 'TWR', 20);
    // Tower either taxis it on to the holding point or sends it back to Ground - it never stays stuck.
    expect(runUntil(sim, () => ac.phase === 'holding' || ac.frequency === 'GND' || !sim.aircraft.includes(ac), 400)).toBe(true);
  });

  it('tows the aircraft back onto the stand when a moving pushback is cancelled', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB pushback approved facing east');
    runUntil(sim, () => ac.phase === 'pushback' && ac.speed > 0.5, 200);
    sim.transmit('DLH5AB cancel pushback');
    expect(runUntil(sim, () => ac.phase === 'parked', 300)).toBe(true);
    expect(ac.stand).toBe('14');
  });

  it('executes conditional clearances behind traffic described by type', () => {
    const sim = makeSim();
    const a = sim.traffic.spawnDeparture(2, { stand: '12', callsign: 'DLH1AA', type: 'A321' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(2, { stand: '10', callsign: 'EWG2BB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => a.request === 'pushback' && b.request === 'pushback');
    sim.transmit('EWG2BB push and start approved facing east');
    runUntil(sim, () => b.request === 'taxi', 400);
    sim.transmit('EWG2BB taxi to holding point A via M, H, N');
    runUntil(sim, () => b.speed > 3, 60);
    sim.transmit('DLH1AA behind the A320 passing from left to right, push and start approved facing east');
    runUntil(sim, () => /^Behind the A320 passing from left to right, push and start approved, facing east/.test(lastPilotMessage(sim, 'DLH1AA')), 10);
    expect(a.giveWayTo).toBe('EWG2BB');
    runUntil(sim, () => a.phase === 'startup', 400);
    expect(sim.incidents).toEqual([]);
  });
});

describe('ATIS and runway change', () => {
  it('chooses the runway from the wind and changes it via the ATIS', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', density: 'light', seed: 5, generateTraffic: false });
    expect(['25', '07']).toContain(sim.runway);
    const dep = sim.traffic.spawnDeparture(600, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const before = sim.atis.letter;
    const other = sim.runway === '25' ? '07' : '25';
    sim.updateAtis({ runway: other, wind: { direction: other === '25' ? 250 : 70, speedKt: 10 } });
    expect(sim.runway).toBe(other);
    expect(sim.atis.letter).not.toBe(before);
    expect(dep.flightPlan.runway).toBe(other);
    expect(dep.flightPlan.sid?.endsWith(other === '25' ? 'W' : 'E')).toBe(true);
  });
});

describe('special events', () => {
  it('medical arrival: parked quickly earns a bonus', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnArrival(4, { callsign: 'EWG7TK', type: 'A320', medical: true }) as Aircraft;
    runUntil(sim, () => ac.request === 'taxiIn', 400);
    expect(lastPilotMessage(sim, 'EWG7TK')).toMatch(/PAN PAN, medical emergency/);
    sim.transmit(`EWG7TK taxi to stand ${ac.assignedStand}`);
    runUntil(sim, () => ac.phase === 'arrived', 600);
    expect(sim.stats.emergenciesHandled).toBe(1);
    expect(sim.stats.bonus).toBe(15);
  });

  it('rejected take-off: aircraft vacates and calls Ground', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnDeparture(2, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'pushback');
    sim.transmit('DLH5AB push and start approved facing east');
    runUntil(sim, () => ac.request === 'taxi', 400);
    sim.transmit('DLH5AB taxi to holding point A via M, H, N');
    runUntil(sim, () => ac.request === 'handoff', 900);
    sim.transmit('DLH5AB contact tower');
    runUntil(sim, () => ac.phase === 'takeoff', 400);
    ac.rejectAtSpeed = 40; // force the event
    runUntil(sim, () => ac.request !== null && ac.frequency === 'GND', 400);
    expect(ac.rejectedTakeoff).toBe(true);
    expect(sim.stats.rejectedTakeoffs).toBe(1);
    expect(lastPilotMessage(sim, 'DLH5AB')).toMatch(/rejected take-off/);
  });
});

describe('tower flow', () => {
  it('keeps departures moving with arrivals mixed in (no go-arounds with sensible Ground work)', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 3, events: false });
    const waits: number[] = [];
    const reached = new Map<string, number>();
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      for (const ac of sim.aircraft) {
        if (ac.phase === 'holding' && !reached.has(ac.callsign)) reached.set(ac.callsign, sim.time);
        if (ac.phase === 'lineup' && (reached.get(ac.callsign) ?? -1) > 0) {
          waits.push(sim.time - reached.get(ac.callsign)!);
          reached.set(ac.callsign, -1);
        }
        if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
        if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) {
          sim.transmit(`${ac.callsign} push and start approved`);
        }
        if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway 25`);
        if (ac.request === 'taxiIn') sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
        if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
      }
    }
    const avg = waits.reduce((a, b) => a + b, 0) / Math.max(1, waits.length);
    expect(sim.stats.departuresAirborne).toBeGreaterThan(8);
    expect(avg).toBeLessThan(150);
    expect(sim.stats.goArounds).toBeLessThanOrEqual(1);
  }, 30000);
});

describe('stand allocation', () => {
  it('keeps wide-bodies off code C taxilanes and stands', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, generateTraffic: false });
    const wide = sim.freeStands(60.3).map((s) => s.id).sort();
    expect(wide).toEqual(['105', '106', '107', '71A', '74A']);
  });

  it('keeps the stand next to a wide-body free (wingtip clearance)', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, generateTraffic: false });
    sim.traffic.spawnDeparture(600, { stand: '71A', callsign: 'THY635', type: 'A332' });
    const free = sim.freeStands(35.8).map((s) => s.id);
    expect(free).not.toContain('71');
    expect(free).not.toContain('72');
    expect(free).toContain('73');
    expect(sim.standNeighbourConflict('72', 35.8)?.stand.id).toBe('71A');
    // ... and a narrow-body on 74 blocks the wide-body position 74A
    sim.traffic.spawnDeparture(600, { stand: '74', callsign: 'DLH5AB', type: 'A320' });
    expect(sim.freeStands(60.3).map((s) => s.id)).not.toContain('74A');
  });

  it('never parks aircraft with overlapping wings', () => {
    for (const seed of [1, 2, 3, 4]) {
      const sim = new Simulation({ airport: EDDS, position: 'GND', density: 'heavy', seed, scenario: { heavies: true } });
      for (let t = 0; t < 900; t++) {
        sim.tick(1);
        const parked = sim.aircraft.filter((a) => (a.phase === 'parked' || a.phase === 'arrived') && a.stand);
        for (const a of parked) {
          expect(a.type.wingspanM).toBeLessThanOrEqual(sim.airport.stand(a.stand!)!.maxWingspanM);
          for (const b of parked) {
            if (a !== b) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan((a.type.wingspanM + b.type.wingspanM) / 2 + 4);
          }
        }
      }
    }
  }, 60000);
});
