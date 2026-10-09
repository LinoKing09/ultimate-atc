import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

function runUntil(sim: Simulation, cond: () => boolean, max = 900): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}
function last(sim: Simulation, cs: string): string {
  return sim.messages.filter((m) => m.kind === 'pilot' && m.from === cs).at(-1)?.text ?? '';
}
function towerSim(seed = 42, traffic = false) {
  return new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'medium', seed, events: false, generateTraffic: traffic });
}
const ctx = (cs: string[]) => ({ callsigns: cs, taxiways: new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'W', 'N', 'S']) });

describe('tower phraseology', () => {
  it('parses line-up, take-off and landing clearances', () => {
    const c = ctx(['DLH5AB', 'EWG7TK']);
    expect(parseTransmission('DLH5AB line up and wait runway 25', c).commands).toEqual([{ type: 'lineUp', runway: '25' }]);
    expect(parseTransmission('DLH5AB wind 250 degrees 8 knots runway 25 cleared for take-off', c).commands).toEqual([{ type: 'takeoff', runway: '25' }]);
    expect(parseTransmission('Lufthansa 5AB, cleared for takeoff runway 25', c).commands).toEqual([{ type: 'takeoff', runway: '25' }]);
    expect(parseTransmission('EWG7TK wind 240 degrees 5 knots, runway 25, cleared to land', c).commands).toEqual([{ type: 'land', runway: '25' }]);
    expect(parseTransmission('EWG7TK continue approach', c).commands).toEqual([{ type: 'continueApproach' }]);
    expect(parseTransmission('EWG7TK go around, I say again, go around', c).commands).toEqual([{ type: 'goAround' }]);
    expect(parseTransmission('DLH5AB hold position, cancel take-off, I say again, cancel take-off', c).commands.map((x) => x.type)).toEqual(['holdPosition', 'cancelTakeoff']);
    expect(parseTransmission('EWG7TK vacate via E', c).commands).toEqual([{ type: 'vacate', exit: 'E' }]);
    expect(parseTransmission('DLH5AB contact Langen Radar 119.200', c).commands[0]).toMatchObject({ type: 'handoff', station: 'APP', frequency: '119.200' });
    // Conditional line-up behind landing traffic
    const p = parseTransmission('DLH5AB behind the landing A320, line up and wait behind', c);
    expect(p.condition).toMatchObject({ type: 'A320' });
    expect(p.commands).toEqual([{ type: 'lineUp' }]);
  });
});

describe('tower position', () => {
  it('departure: ready for departure, line up, take-off, frequency change to Radar', () => {
    const sim = towerSim();
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    // The AI Ground pushes, taxis and hands the departure over at the holding point.
    expect(runUntil(sim, () => ac.request === 'departure', 1500)).toBe(true);
    expect(last(sim, 'DLH5AB')).toMatch(/^Stuttgart Tower, Lufthansa 5AB, holding point [A-Z0-9]+, ready for departure$/);
    sim.transmit('DLH5AB line up and wait runway 25');
    runUntil(sim, () => last(sim, 'DLH5AB').startsWith('Line up and wait'), 20);
    expect(last(sim, 'DLH5AB')).toBe('Line up and wait runway 25, Lufthansa 5AB');
    expect(runUntil(sim, () => ac.phase === 'lineup' && !!ac.stoppedAt, 120)).toBe(true);
    // Lined up, it waits for the take-off clearance.
    for (let t = 0; t < 30; t++) sim.tick(1);
    expect(ac.phase).toBe('lineup');
    sim.transmit('DLH5AB wind 250 degrees 8 knots, runway 25, cleared for take-off');
    expect(runUntil(sim, () => ac.phase === 'climb', 120)).toBe(true);
    expect(runUntil(sim, () => ac.request === 'radar', 120)).toBe(true);
    expect(last(sim, 'DLH5AB')).toMatch(/request frequency change$/);
    sim.transmit('DLH5AB contact Langen Radar 119.200');
    expect(runUntil(sim, () => ac.frequency === 'APP', 20)).toBe(true);
    expect(sim.stats.departuresToRadar).toBe(1);
    expect(sim.stats.separationLosses).toBe(0);
  });

  it('arrival: first contact, landing clearance, vacated, contact ground', () => {
    const sim = towerSim();
    const ac = sim.traffic.spawnArrival(6, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => ac.request === 'landing', 30)).toBe(true);
    expect(last(sim, 'EWG7TK')).toBe('Stuttgart Tower, Eurowings 7TK, ILS approach runway 25');
    sim.transmit('EWG7TK wind 250 degrees 8 knots, runway 25, cleared to land');
    runUntil(sim, () => last(sim, 'EWG7TK').startsWith('Cleared to land'), 20);
    expect(last(sim, 'EWG7TK')).toBe('Cleared to land runway 25, Eurowings 7TK');
    expect(runUntil(sim, () => ac.request === 'vacated', 600)).toBe(true);
    expect(last(sim, 'EWG7TK')).toMatch(/runway 25 vacated via [A-Z0-9]+$/);
    sim.transmit('EWG7TK contact ground 118.605');
    expect(runUntil(sim, () => ac.frequency === 'GND', 20)).toBe(true);
    expect(sim.stats.arrivalsToGround).toBe(1);
    // The AI Ground takes it to a stand.
    expect(runUntil(sim, () => ac.phase === 'arrived', 900)).toBe(true);
    expect(sim.stats.goArounds).toBe(0);
  });

  it('goes around without a landing clearance', () => {
    const sim = towerSim();
    const ac = sim.traffic.spawnArrival(5, { callsign: 'EWG7TK', type: 'A320' }) as Aircraft;
    expect(runUntil(sim, () => ac.phase === 'goAround', 400)).toBe(true);
    expect(sim.stats.goArounds).toBe(1);
    expect(sim.messages.some((m) => /(short|\d miles) final runway 25/.test(m.text))).toBe(true);
  });

  it('flags a take-off with too little spacing behind a heavy', () => {
    const sim = towerSim();
    const ac = sim.traffic.spawnDeparture(0, { stand: '14', callsign: 'EWG8LM', type: 'A320' }) as Aircraft;
    ac.ctot = undefined;
    expect(runUntil(sim, () => ac.request === 'departure', 1500)).toBe(true);
    // A heavy became airborne 30 s ago: 2 minutes of wake turbulence spacing are required.
    (sim.tower as unknown as { lastDeparture: { airborneAt: number; wake: string } }).lastDeparture = { airborneAt: sim.time - 30, wake: 'H' };
    sim.transmit('EWG8LM cleared for take-off');
    expect(runUntil(sim, () => ac.phase === 'takeoff', 120)).toBe(true);
    expect(sim.stats.separationLosses).toBe(1);
    expect(sim.messages.some((m) => /EWG8LM started its take-off \d+ s too early/.test(m.text))).toBe(true);
  });

  it('runs an hour of traffic with a simple scripted Tower controller', () => {
    const sim = towerSim(3, true);
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      for (const ac of sim.aircraft) {
        if (ac.frequency !== 'TWR') continue;
        const eta = sim.tower.nextArrivalEta();
        // Aircraft cleared to cross count as runway traffic too.
        const busy = sim.tower.runwayBusy(ac) || sim.aircraft.some((o) => o !== ac && o.clearedToCross.size > 0 && o.crossingWithTower);
        if (ac.phase === 'approach' && !ac.landingCleared && sim.distanceToThresholdNm(ac) < 4 && !sim.aircraft.some((o) => o.phase === 'lineup')) sim.transmit(`${ac.callsign} cleared to land`);
        if (!ac.request || sim.time - ac.lastCallAt < 3) continue;
        const slotOk = ac.ctot === undefined || sim.time >= ac.ctot - 300;
        if (ac.request === 'departure' && !ac.lineUpCleared && slotOk && !busy && eta > 110 && sim.tower.spacingRemaining(ac) <= 0) sim.transmit(`${ac.callsign} cleared for take-off`);
        if (ac.request === 'radar') sim.transmit(`${ac.callsign} contact radar`);
        if (ac.request === 'vacated') sim.transmit(`${ac.callsign} contact ground`);
        if (ac.request === 'crossing' && !busy && eta > 90) sim.transmit(`${ac.callsign} cross runway 25`);
      }
    }
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.incursions).toBe(0);
    expect(sim.stats.departuresToRadar).toBeGreaterThan(6);
    expect(sim.stats.arrivalsToGround).toBeGreaterThan(4);
    expect(sim.stats.goArounds).toBeLessThanOrEqual(2);
  }, 60000);
});
