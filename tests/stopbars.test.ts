import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { perform } from '../src/core/session';
import { Simulation } from '../src/core/simulation';
import { litStopBarAhead, stopBarLit, stopBarsInOperation, stopBarsOf } from '../src/core/stopbars';
import { EDDS } from '../src/data/airports/edds';
import { EDJA } from '../src/data/airports/edja';
import { createBot } from './bot';

/** A departure taxied to its holding point in fog, on your Tower frequency. */
function atHoldingPoint(withClearance: boolean): { sim: Simulation; ac: Aircraft } {
  const sim = new Simulation({ airport: EDDS, position: 'TWR', positions: ['TWR'], runway: '25', density: 'light', seed: 3, events: false, generateTraffic: false, scenario: { lowVisibility: true } });
  sim.stopBarsWithClearance = withClearance;
  const ac = sim.traffic.spawnDeparture(0, { type: 'A320', callsign: 'DLH4AB' })!;
  ac.cleared = true;
  // The AI Ground pushes and taxis it; at the holding point it calls you.
  for (let t = 0; t < 1500 && ac.phase !== 'holding'; t++) sim.tick(1);
  expect(ac.phase).toBe('holding');
  return { sim, ac };
}

describe('stop bars (low visibility procedures)', () => {
  it('are lit at the CAT II/III holding positions of the runway in use while LVP are in force', () => {
    const { sim } = atHoldingPoint(true);
    expect(stopBarsInOperation(sim)).toBe(true);
    const bars = stopBarsOf(sim.airport);
    // EDDS: at the CAT II/III holding positions where the chart has them.
    const cat3 = new Set([...sim.airport.lvpHoldingPoints.values()].flat().map((n) => n.id));
    expect(bars.some((b) => cat3.has(b.id))).toBe(true);
    expect(bars.filter((b) => sim.activeEndOn(b.runway)).every((b) => stopBarLit(sim, b))).toBe(true);
    // No LVP, no stop bars; an airport without CAT II/III holding positions has none.
    const clear = new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'light', seed: 3, events: false, generateTraffic: false });
    expect(stopBarsInOperation(clear)).toBe(false);
    expect(stopBarsOf(new Simulation({ airport: EDJA, position: 'TWR', density: 'light', seed: 1, events: false, generateTraffic: false }).airport)).toEqual([]);
  });

  it('your line-up clearance switches the bar off (default); it lights again once the aircraft is on the runway', () => {
    const { sim, ac } = atHoldingPoint(true);
    const bar = litStopBarAhead(sim, ac, 6)!;
    expect(bar).toBeDefined();
    sim.transmit('DLH4AB line up and wait runway 25');
    for (let t = 0; t < 20 && ac.phase === 'holding'; t++) sim.tick(1);
    expect(ac.phase).toBe('lineup');
    for (let t = 0; t < 120 && !sim.tower.isInRunwayArea(ac.pos); t++) sim.tick(1);
    sim.tick(1);
    expect(stopBarLit(sim, bar.bar)).toBe(true);
  });

  it('switched by hand: the crew never passes a lit bar, reports it, and goes when you switch it off', () => {
    const { sim, ac } = atHoldingPoint(false);
    const said: string[] = [];
    sim.on('message', (m) => said.push(m.text));
    sim.transmit('DLH4AB line up and wait runway 25');
    for (let t = 0; t < 30; t++) sim.tick(1);
    expect(ac.phase).toBe('holding');
    expect(said.some((t) => /stop bar still lit/.test(t))).toBe(true);
    const bar = litStopBarAhead(sim, ac, 6)!;
    perform(sim, { k: 'stopBar', id: bar.bar.id, lit: false });
    for (let t = 0; t < 20 && ac.phase === 'holding'; t++) sim.tick(1);
    expect(ac.phase).toBe('lineup');
  });

  it('an hour of fog with the AI Tower: the bars are switched for every line-up and crossing - no collisions, no aircraft held for good', () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'medium', seed: 2, events: false, scenario: { lowVisibility: true } });
    const bot = createBot(sim);
    let held = 0;
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      bot();
      held = Math.max(held, ...sim.aircraft.map((a) => (a.stopBarSince !== undefined ? sim.time - a.stopBarSince : 0)));
    }
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.departuresAirborne).toBeGreaterThan(4);
    expect(held).toBeLessThan(10);
  }, 300000);
});
