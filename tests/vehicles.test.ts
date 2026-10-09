import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { createVehicles, tugOf } from '../src/core/vehicles';
import { EDDS } from '../src/data/airports/edds';

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}
function last(sim: Simulation, cs: string): string {
  return sim.messages.filter((m) => m.kind === 'pilot' && m.from === cs).at(-1)?.text ?? '';
}
function makeSim(positions: ('DEL' | 'GND')[] = ['GND']) {
  return new Simulation({ airport: EDDS, position: positions[0], positions, runway: '25', density: 'medium', seed: 42, generateTraffic: false });
}
const ctx = (cs: string[]) => ({ callsigns: cs, taxiways: new Set(['M', 'N', 'S', 'H', 'L2', 'L3', 'O', 'W', 'V']) });

describe('tow phraseology', () => {
  it('parses tow approved and follow the follow-me', () => {
    expect(parseTransmission('Tug 5, tow approved via M, N', ctx(['TUG5']))).toMatchObject({
      callsign: 'TUG5',
      commands: [{ type: 'taxi', tow: true, via: ['M', 'N'] }],
    });
    expect(parseTransmission('TUG5 tow approved to stand 45', ctx(['TUG5'])).commands[0]).toMatchObject({ type: 'taxi', tow: true, destination: { kind: 'stand', stand: '45' } });
    expect(parseTransmission('EWG7TK follow the follow-me to stand 14', ctx(['EWG7TK'])).commands).toMatchObject([
      { type: 'followMe' },
      { type: 'taxi', destination: { kind: 'stand', stand: '14' } },
    ]);
    expect(parseTransmission('EWG7TK taxi to stand 14 via N, follow the follow me', ctx(['EWG7TK'])).commands.map((c) => c.type)).toEqual(['taxi', 'followMe']);
    // "follow <callsign>" still works
    expect(parseTransmission('EWG7TK follow DLH5AB', ctx(['EWG7TK', 'DLH5AB'])).commands[0]).toEqual({ type: 'follow', callsign: 'DLH5AB' });
  });
});

describe('tows', () => {
  it('requests a tow, is pushed off the stand and towed to the remote stand', () => {
    const sim = makeSim();
    const arr = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    // Turn it into a parked arrival whose turnaround ends now; force a tow.
    arr.category = 'arrival';
    arr.phase = 'arrived';
    arr.timerUntil = 0;
    let tow: Aircraft | undefined;
    for (let i = 0; i < 50 && !tow; i++) {
      arr.phase = 'arrived';
      arr.timerUntil = 0;
      sim.aircraft = sim.aircraft.filter((a) => a === arr);
      sim.tick(0.2);
      tow = sim.aircraft.find((a) => a.category === 'tow');
      if (!tow) sim.aircraft.push(arr);
    }
    expect(tow).toBeDefined();
    const t = tow!;
    expect(t.callsign).toMatch(/^TUG\d$/);
    expect(runUntil(sim, () => t.request === 'tow', 120)).toBe(true);
    expect(last(sim, t.callsign)).toMatch(/^Stuttgart Ground, Tug \d, request tow Eurowings A320 from stand 14 to stand \d+$/);
    sim.transmit(`${t.callsign} tow approved`);
    runUntil(sim, () => last(sim, t.callsign).startsWith('Tow approved'), 20);
    expect(last(sim, t.callsign)).toMatch(/^Tow approved to stand \d+/);
    expect(runUntil(sim, () => t.phase === 'pushback', 30)).toBe(true);
    expect(tugOf(sim, t)).toBeDefined();
    let maxKt = 0;
    expect(
      runUntil(sim, () => {
        maxKt = Math.max(maxKt, t.speed / 0.514444);
        return t.phase === 'arrived';
      }, 1500),
    ).toBe(true);
    expect(t.stand).toBe(t.tow!.to);
    expect(maxKt).toBeLessThanOrEqual(10.5);
    expect(sim.stats.towsCompleted).toBe(1);
    expect(tugOf(sim, t)).toBeUndefined();
  });

  it('refuses a pushback or hand-off phrase', () => {
    const sim = makeSim();
    const d = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    d.category = 'tow';
    d.callsign = 'TUG3';
    d.tow = { aircraft: 'EWG7TK', operator: 'Eurowings', from: '14', to: '45' };
    sim.transmit('TUG3 pushback approved');
    runUntil(sim, () => last(sim, 'TUG3') !== '', 20);
    expect(last(sim, 'TUG3')).toMatch(/we are a tow/i);
  });
});

describe('follow-me', () => {
  it('drives to the aircraft, leads it and peels off before the stand', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnArrival(4, { callsign: 'DCEEO', type: 'CL35' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'taxiIn', 400)).toBe(true);
    const stand = ac.assignedStand!;
    sim.transmit('DCEEO follow the follow-me');
    runUntil(sim, () => last(sim, 'DCEEO').startsWith('Follow the follow-me'), 20);
    expect(last(sim, 'DCEEO')).toMatch(new RegExp(`^Follow the follow-me to stand ${stand}`));
    expect(runUntil(sim, () => sim.vehicles.some((v) => v.state === 'toAircraft'), 20)).toBe(true);
    expect(sim.messages.some((m) => /FOLLOW-ME \d is on its way to DCEEO/.test(m.text))).toBe(true);
    // The aircraft waits until the follow-me is in front.
    expect(ac.speed).toBe(0);
    expect(runUntil(sim, () => ac.followMe?.leading === true, 600)).toBe(true);
    const v = sim.vehicles.find((x) => x.aircraft === 'DCEEO')!;
    runUntil(sim, () => ac.speed > 2, 60);
    // The follow-me drives ahead of the aircraft.
    const ahead = (v.pos.x - ac.pos.x) * Math.sin((ac.heading * Math.PI) / 180) + (v.pos.y - ac.pos.y) * Math.cos((ac.heading * Math.PI) / 180);
    expect(ahead).toBeGreaterThan(20);
    expect(runUntil(sim, () => ac.phase === 'arrived', 900)).toBe(true);
    expect(ac.stand).toBe(stand);
    expect(v.state === 'returning' || v.state === 'idle').toBe(true);
    expect(runUntil(sim, () => v.state === 'idle', 900)).toBe(true);
  });

  it('has two follow-me cars at the fire station', () => {
    expect(createVehicles(makeSim()).map((v) => v.name)).toEqual(['FOLLOW-ME 1', 'FOLLOW-ME 2']);
  });
});
