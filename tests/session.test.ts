import { describe, expect, it } from 'vitest';
import { fingerprint, perform, restoreSession, saveSession } from '../src/core/session';
import { Simulation } from '../src/core/simulation';
import { AIRPORTS } from '../src/data/airports';
import { EDDS } from '../src/data/airports/edds';
import { createBot } from './bot';

/** The scripted controller, with every transmission logged like the UI does it. */
function loggedBot(sim: Simulation): () => void {
  const transmit = sim.transmit.bind(sim);
  sim.transmit = (text, selected, opts = {}) => {
    sim.actionLog.push([sim.steps, { k: 'transmit', text, selected, fallback: opts.fallbackToLastCaller }]);
    return transmit(text, selected, opts);
  };
  return createBot(sim);
}

describe('saved sessions', () => {
  it('a session restored from its log is the same as the one saved (frame-sized ticks, UI actions)', async () => {
    const sim = new Simulation({ airport: EDDS, position: 'GND', positions: ['GND', 'TWR'], density: 'medium', seed: 7, events: false });
    const bot = loggedBot(sim);
    let k = 0;
    for (let t = 0; t < 1800; t += 0.37) {
      sim.tick(0.37 * (1 + (k++ % 3)));
      if (k % 5 === 0) bot();
      if (k === 400) perform(sim, { k: 'atis', change: { letter: 'K', qnh: 1009 } });
      if (k === 900) perform(sim, { k: 'flow', kind: 'arrivals', stop: true });
      if (k === 1300) perform(sim, { k: 'flow', kind: 'arrivals', stop: false });
      if (k === 1500) perform(sim, { k: 'density', density: 'heavy' });
    }
    const saved = JSON.parse(JSON.stringify(saveSession(sim, 'test', 1234)));
    expect(saved.actions.length).toBeGreaterThan(20);
    const { sim: back, matches } = await restoreSession(saved, AIRPORTS);
    expect(matches).toBe(true);
    expect(back.steps).toBe(sim.steps);
    expect(back.stats.score).toBe(sim.stats.score);
    expect(back.atis.letter).toBe('K');
    expect(back.config.density).toBe('heavy');
    expect(back.actionLog.length).toBe(sim.actionLog.length);
    // And it runs on the same way.
    for (let t = 0; t < 300; t++) {
      sim.tick(1);
      back.tick(1);
    }
    expect(fingerprint(back)).toBe(fingerprint(sim));
  }, 60000);

  it('restores a take-over start with its clock', async () => {
    const sim = new Simulation({ airport: EDDS, position: 'TWR', density: 'light', seed: 3, start: 'handover', startTime: new Date('2026-07-01T10:00:00Z') });
    for (let t = 0; t < 120; t++) sim.tick(1);
    const { sim: back, matches } = await restoreSession(saveSession(sim, 'x', 0), AIRPORTS);
    expect(matches).toBe(true);
    expect(back.utc().getTime()).toBe(sim.utc().getTime());
  });
});
