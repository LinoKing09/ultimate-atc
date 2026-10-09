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

describe('vehicle phraseology', () => {
  it('parses proceed and return to base', () => {
    const c = ctx(['FME1', 'DCEEO', 'TUG5']);
    expect(parseTransmission('Follow-me 1, proceed to DCEEO via N, H', c)).toMatchObject({ callsign: 'FME1', commands: [{ type: 'proceed', target: 'DCEEO', via: ['N', 'H'] }] });
    expect(parseTransmission('follow me 1 proceed to base', c).commands).toEqual([{ type: 'proceed', base: true, via: [] }]);
    expect(parseTransmission('FME1 return to the fire station', c).commands).toEqual([{ type: 'returnToBase' }]);
    expect(parseTransmission('Tug 5, proceed via M, N', c).commands[0]).toMatchObject({ type: 'proceed', via: ['M', 'N'] });
  });
});

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
  it('asks Ground to proceed, leads the aircraft and asks to return to base', () => {
    const sim = makeSim();
    const ac = sim.traffic.spawnArrival(4, { callsign: 'DCEEO', type: 'CL35' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'taxiIn', 400)).toBe(true);
    const stand = ac.assignedStand!;
    sim.transmit('DCEEO follow the follow-me');
    runUntil(sim, () => last(sim, 'DCEEO').startsWith('Follow the follow-me'), 20);
    expect(last(sim, 'DCEEO')).toMatch(new RegExp(`^Follow the follow-me to stand ${stand}`));
    // The driver asks Ground before driving onto the taxiways.
    expect(runUntil(sim, () => /^Stuttgart Ground, Follow-me 1, request proceed to DCEEO at taxiway [A-Z0-9]+$/.test(last(sim, 'FME1')), 30)).toBe(true);
    const v = sim.findVehicle('FME1')!;
    expect(v.state).toBe('assigned');
    sim.transmit('Follow-me 1, proceed to DCEEO');
    expect(runUntil(sim, () => last(sim, 'FME1') === 'Proceeding to DCEEO, Follow-me 1', 20)).toBe(true);
    expect(v.state).toBe('toAircraft');
    // The aircraft waits until the follow-me is in front.
    expect(ac.speed).toBe(0);
    expect(runUntil(sim, () => ac.followMe?.leading === true, 600)).toBe(true);
    runUntil(sim, () => ac.speed > 2, 60);
    const ahead = (v.pos.x - ac.pos.x) * Math.sin((ac.heading * Math.PI) / 180) + (v.pos.y - ac.pos.y) * Math.cos((ac.heading * Math.PI) / 180);
    expect(ahead).toBeGreaterThan(20);
    // "hold position" to the follow-me stops the car and the aircraft behind it.
    sim.transmit('FME1 hold position');
    runUntil(sim, () => last(sim, 'FME1').startsWith('Holding position'), 20);
    runUntil(sim, () => ac.speed === 0, 30);
    expect(ac.speed).toBe(0);
    sim.transmit('Follow-me 1, continue');
    expect(runUntil(sim, () => ac.phase === 'arrived', 900)).toBe(true);
    expect(ac.stand).toBe(stand);
    expect(runUntil(sim, () => /request return to base$/.test(last(sim, 'FME1')), 60)).toBe(true);
    expect(v.state).toBe('done');
    sim.transmit('Follow-me 1, return to base');
    expect(runUntil(sim, () => last(sim, 'FME1') === 'Returning to base, Follow-me 1', 20)).toBe(true);
    expect(runUntil(sim, () => v.state === 'idle', 900)).toBe(true);
  });

  it('is sent without radio calls when the AI runs Ground', () => {
    const sim = makeSim(['DEL']);
    const ac = sim.traffic.spawnArrival(4, { callsign: 'DCEEO', type: 'CL35' }) as Aircraft;
    runUntil(sim, () => ac.phase === 'taxi' && !!ac.route, 600);
    ac.followMe = { leading: false };
    expect(runUntil(sim, () => ac.phase === 'arrived', 1500)).toBe(true);
    expect(sim.messages.some((m) => m.from === 'FME1' || m.from === 'FME2')).toBe(false);
  });

  it('has two follow-me cars at the fire station', () => {
    expect(createVehicles(makeSim()).map((v) => v.name)).toEqual(['FOLLOW-ME 1', 'FOLLOW-ME 2']);
  });
});

describe('radio discipline', () => {
  it('nobody calls between an instruction and its read-back', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'heavy', seed: 7, events: false });
    let expecting: { callsign: string; until: number } | undefined;
    let violations = 0;
    let checked = 0;
    sim.on('message', (m) => {
      if (m.kind !== 'pilot' || !expecting) return;
      if (m.time < expecting.until) {
        checked++;
        if (m.from !== expecting.callsign) violations++;
      }
      if (m.from === expecting.callsign) expecting = undefined;
    });
    for (let t = 0; t < 1800; t++) {
      sim.tick(1);
      for (const ac of sim.aircraft) {
        if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
        const say = (text: string) => {
          const r = sim.transmit(`${ac.callsign} ${text}`);
          if (r.ok) expecting = { callsign: ac.callsign, until: sim.time + 12 };
        };
        if (ac.request === 'pushback') say('push and start approved');
        else if (ac.request === 'taxi') say('taxi to runway 25');
        else if (ac.request === 'taxiIn') say(`taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
        else if (ac.request === 'handoff') say('contact tower');
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(violations).toBe(0);
  });
});
