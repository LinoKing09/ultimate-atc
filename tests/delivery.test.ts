import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { allocateSquawk, hhmm, sendDcl, suggestedSid, updateSequencer } from '../src/core/delivery';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

const SIDS = EDDS.sids.map((s) => s.name);

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}
function last(sim: Simulation, cs: string): string {
  return sim.messages.filter((m) => m.kind === 'pilot' && m.from === cs).at(-1)?.text ?? '';
}
function delSim(positions: ('DEL' | 'GND')[] = ['DEL'], seed = 42) {
  return new Simulation({ airport: EDDS, position: positions[0], positions, runway: '25', density: 'medium', seed, generateTraffic: false });
}

describe('delivery phraseology', () => {
  const ctx = { callsigns: ['DLH5AB'], taxiways: new Set(['A', 'N']), sids: SIDS };
  it('parses an IFR clearance in typed and spoken form', () => {
    for (const text of [
      'DLH5AB cleared to Frankfurt via KRH2W departure, climb 5000 feet, squawk 2312',
      'Lufthansa five alpha bravo cleared to EDDF kilo romeo hotel two whiskey departure climb five thousand feet squawk two three one two',
    ]) {
      const p = parseTransmission(text, ctx);
      expect(p.commands).toEqual([{ type: 'clearance', destination: text.includes('EDDF') ? 'eddf' : 'frankfurt', sid: 'KRH2W', climb: { feet: 5000 }, squawk: '2312' }]);
    }
    expect(parseTransmission('DLH5AB cleared to Palma via SUL2W departure, runway 25, climb flight level 70, squawk 2301, CTOT 1435', ctx).commands[0]).toMatchObject({
      sid: 'SUL2W', runway: '25', climb: { fl: 70 }, squawk: '2301', ctot: '1435',
    });
    expect(parseTransmission('DLH5AB readback correct', ctx).commands).toEqual([{ type: 'readbackCorrect' }]);
    expect(parseTransmission('DLH5AB negative, squawk 2 3 1 2', ctx).commands).toEqual([{ type: 'squawk', code: '2312' }]);
    expect(parseTransmission('DLH5AB slot time 1435', ctx).commands).toEqual([{ type: 'ctot', time: '1435' }]);
    expect(parseTransmission('DLH5AB cleared to cross runway 25', ctx).commands).toEqual([{ type: 'cross', runway: '25' }]);
  });
});

describe('delivery position', () => {
  it('clearance, start-up and hand-off to Ground', () => {
    const sim = delSim(['DEL']);
    sim.systems.dcl = false;
    const ac = sim.traffic.spawnDeparture(60, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    expect(ac.frequency).toBe('DEL');
    expect(runUntil(sim, () => ac.request === 'clearance', 60)).toBe(true);
    expect(last(sim, 'DLH5AB')).toMatch(/Stuttgart Delivery, Lufthansa 5AB, A320, stand 14, information [A-Z], request clearance to [A-Z]/);
    const sid = suggestedSid(sim, ac)!;
    const sq = allocateSquawk(sim);
    // Start-up before the clearance is refused.
    sim.transmit('DLH5AB start-up approved');
    expect(runUntil(sim, () => /no clearance yet/.test(last(sim, 'DLH5AB')), 20)).toBe(true);
    sim.transmit(`DLH5AB cleared to ${ac.flightPlan.destination} via ${sid} departure, climb 5000 feet, squawk ${sq}`);
    expect(runUntil(sim, () => /^Cleared to .*departure, climb 5000 feet, squawk \d{4}/.test(last(sim, 'DLH5AB')), 20)).toBe(true);
    expect(ac.cleared).toBe(true);
    if (ac.readbackError) sim.transmit(`DLH5AB negative, squawk ${sq}`);
    else sim.transmit('DLH5AB readback correct');
    for (let t = 0; t < 10; t++) sim.tick(1);
    expect(ac.flightPlan.squawk).toBe(sq);
    expect(runUntil(sim, () => ac.request === 'startup', 1200)).toBe(true);
    sim.transmit('DLH5AB start-up approved');
    expect(runUntil(sim, () => ac.request === 'frequency', 90)).toBe(true);
    sim.transmit('DLH5AB contact ground 118.605');
    expect(runUntil(sim, () => ac.frequency === 'GND', 20)).toBe(true);
    expect(sim.stats.clearancesDelivered).toBe(1);
    // Ground is AI: the departure gets to the runway on its own.
    expect(runUntil(sim, () => ac.phase === 'holding' || ac.frequency === 'TWR', 1500)).toBe(true);
  });

  it('queries a SID for the wrong runway and a wrong destination', () => {
    const sim = delSim(['DEL']);
    sim.systems.dcl = false;
    const ac = sim.traffic.spawnDeparture(60, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'clearance', 60);
    const wrongRwy = EDDS.sids.find((s) => s.runway === '07')!.name;
    sim.transmit(`DLH5AB cleared to ${ac.flightPlan.destination} via ${wrongRwy} departure, climb 5000 feet, squawk 2301`);
    expect(runUntil(sim, () => /information [A-Z] says runway 25 in use/i.test(last(sim, 'DLH5AB')), 20)).toBe(true);
    expect(ac.cleared).toBe(false);
    sim.transmit(`DLH5AB cleared to LIRF via ${suggestedSid(sim, ac)} departure, climb 5000 feet, squawk 2301`);
    if (ac.flightPlan.destination !== 'LIRF') expect(runUntil(sim, () => /confirm clearance limit, our destination is/i.test(last(sim, 'DLH5AB')), 20), last(sim, 'DLH5AB')).toBe(true);
  });

  it('catches or misses readback errors', () => {
    const sim = delSim(['DEL', 'GND']);
    sim.systems.dcl = false;
    const ac = sim.traffic.spawnDeparture(60, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    runUntil(sim, () => ac.request === 'clearance', 60);
    sim.transmit(`DLH5AB cleared to ${ac.flightPlan.destination} via ${suggestedSid(sim, ac)} departure, climb 5000 feet, squawk 2312`);
    runUntil(sim, () => ac.cleared, 20);
    ac.readbackError = { squawk: '2312', said: '2132' }; // force the error for the test
    sim.transmit('DLH5AB readback correct');
    for (let t = 0; t < 10; t++) sim.tick(1);
    expect(sim.stats.readbackErrorsMissed).toBe(1);
    expect(ac.flightPlan.squawk).toBe('2132');
    ac.readbackError = { squawk: '2312', said: '2132' };
    sim.transmit('DLH5AB negative, squawk 2312');
    runUntil(sim, () => /^Squawk 2312/.test(last(sim, 'DLH5AB')), 20);
    expect(ac.readbackError).toBeUndefined();
    expect(sim.stats.readbackErrorsCaught).toBe(1);
  });

  it('datalink clearance (DCL) without voice', () => {
    const sim = delSim(['DEL']);
    const ac = sim.traffic.spawnDeparture(60, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    ac.dcl = true;
    expect(runUntil(sim, () => ac.request === 'clearance', 60)).toBe(true);
    expect(sim.messages.filter((m) => m.from === 'DLH5AB').length).toBe(0);
    expect(sendDcl(sim, ac, suggestedSid(sim, ac)!, allocateSquawk(sim))).toBeUndefined();
    expect(ac.cleared).toBe(true);
    expect(sim.messages.some((m) => /^DCL to DLH5AB: cleared to/.test(m.text))).toBe(true);
  });

  it('A-CDM gives TSATs at least 90 s apart and pilots call for start-up at their TSAT', () => {
    const sim = delSim(['GND']);
    const a = sim.traffic.spawnDeparture(300, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(300, { stand: '16', callsign: 'EWG1CD', type: 'A320' }) as Aircraft;
    sim.tick(6);
    expect(a.tsat).toBeDefined();
    expect(Math.abs(a.tsat! - b.tsat!)).toBeGreaterThanOrEqual(90);
    const later = a.tsat! > b.tsat! ? a : b;
    runUntil(sim, () => later.request === 'pushback', 1200);
    expect(sim.time).toBeGreaterThanOrEqual(later.tsat! - 125);
    expect(hhmm(sim, later.tsat!)).toMatch(/^\d{4}$/);
  });

  it('the Tower keeps a CTOT window (-5/+10 min)', () => {
    const sim = delSim(['GND']);
    const ac = sim.traffic.spawnDeparture(5, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    ac.ctot = 1800;
    ac.tsat = undefined;
    sim.systems.acdm = false;
    runUntil(sim, () => ac.request === 'pushback', 120);
    sim.transmit('DLH5AB push and start approved facing east');
    runUntil(sim, () => ac.request === 'taxi', 400);
    sim.transmit('DLH5AB taxi to holding point A via M, H, N');
    runUntil(sim, () => ac.request === 'handoff', 900);
    sim.transmit('DLH5AB contact tower');
    let tookOffAt = -1;
    runUntil(sim, () => {
      if (tookOffAt < 0 && ac.phase === 'takeoff') tookOffAt = sim.time;
      return tookOffAt > 0;
    }, 3000);
    expect(tookOffAt).toBeGreaterThanOrEqual(1800 - 300 - 60);
    expect(tookOffAt).toBeLessThanOrEqual(1800 + 600);
  });
});

describe('session start', () => {
  it('staggers the first clearance requests instead of a rush', () => {
    for (const seed of [1, 2, 3]) {
      const sim = new Simulation({ airport: EDDS, position: 'DEL', positions: ['DEL'], runway: '25', density: 'medium', seed });
      const first: number[] = [];
      const seen = new Set<string>();
      for (let t = 0; t < 300; t++) {
        sim.tick(1);
        for (const a of sim.aircraft) {
          if (a.request === 'clearance' && !seen.has(a.callsign) && a.spawnedAt === 0) {
            seen.add(a.callsign);
            first.push(sim.time);
          }
        }
      }
      expect(first[0]).toBeGreaterThanOrEqual(10);
      for (let i = 1; i < first.length; i++) expect(first[i] - first[i - 1]).toBeGreaterThanOrEqual(85);
    }
  });
});

describe('A-CDM sequencer', () => {
  it('keeps valid TSATs when an earlier flight misses its own', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 42, generateTraffic: false });
    const a = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const b = sim.traffic.spawnDeparture(0, { stand: '16', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    for (let t = 0; t < 600; t++) sim.tick(1);
    a.ctot = b.ctot = undefined;
    // DLH5AB missed its TSAT; EWG7TK's TSAT is due in a minute and still valid.
    const now = Math.ceil(sim.time / 60) * 60;
    a.tsat = now - 300;
    b.tsat = now + 60;
    updateSequencer(sim);
    expect(b.tsat).toBe(now + 60);
    expect(a.tsat).toBeGreaterThanOrEqual(now);
    expect(Math.abs(a.tsat! - b.tsat!)).toBeGreaterThanOrEqual(90);
  });
});

describe('switching frequencies off and on', () => {
  it('hands a switched-off position to the simulator and back', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', positions: ['DEL', 'GND'], runway: '25', density: 'medium', seed: 42, generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(900, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    expect(ac.frequency).toBe('DEL');
    expect(runUntil(sim, () => ac.request === 'clearance', 900)).toBe(true);
    // Delivery off: the AI clears the waiting crew and sends it to Ground.
    expect(sim.setStationActive('DEL', false)).toBeUndefined();
    expect(sim.userControls('DEL')).toBe(false);
    expect(runUntil(sim, () => ac.frequency === 'GND', 10)).toBe(true);
    expect(ac.cleared).toBe(true);
    expect(ac.flightPlan.squawk).toMatch(/^[0-7]{4}$/);
    expect(sim.messages.some((m) => /EDDS_DEL 121.915 switched off - the simulator takes over Stuttgart Delivery/.test(m.text))).toBe(true);
    // The last frequency cannot be switched off.
    expect(sim.setStationActive('GND', false)).toMatch(/At least one frequency/);
    // Not connected as Tower.
    expect(sim.setStationActive('TWR', true)).toMatch(/not connected/);
    // Back on.
    expect(sim.setStationActive('DEL', true)).toBeUndefined();
    expect(sim.userControls('DEL')).toBe(true);
  });

  it('lets the AI Ground take over from you', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', positions: ['DEL', 'GND'], runway: '25', density: 'medium', seed: 42, generateTraffic: false });
    const arr = sim.traffic.spawnArrival(4, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => arr.request === 'taxiIn', 400)).toBe(true);
    sim.setStationActive('GND', false);
    expect(arr.request).toBeNull();
    expect(runUntil(sim, () => arr.phase === 'arrived', 900)).toBe(true);
  });
});
