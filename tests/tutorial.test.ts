import { describe, expect, it } from 'vitest';
import { sendDcl, suggestedSid, allocateSquawk } from '../src/core/delivery';
import { Simulation } from '../src/core/simulation';
import { TUTORIALS, TutorialRunner, tutorialConfig } from '../src/core/tutorial';
import { EDDS } from '../src/data/airports/edds';

/**
 * Plays every tutorial like a student who follows the instructions: selects the
 * aircraft of the step and sends the step's example when the pilot is waiting
 * (or after a minute). The examples must be understood and every step must finish.
 */
function play(id: string): { runner: TutorialRunner; sim: Simulation; log: string[] } {
  const t = TUTORIALS.find((x) => x.id === id)!;
  const sim = new Simulation(tutorialConfig(t, EDDS));
  const runner = new TutorialRunner(t, sim);
  const log: string[] = [];
  let stepStart = 0;
  let lastSent = -Infinity;
  for (let s = 0; s < 45 * 60 && !runner.finished; s++) {
    if (runner.update(runner.step?.focus)) {
      stepStart = sim.time;
      log.push(`${Math.round(sim.time)}s ${runner.step?.title ?? 'END'}`);
      continue;
    }
    const step = runner.step!;
    // Steps without a check ("Next").
    if (!step.done) {
      runner.next();
      continue;
    }
    const focus = step.focus ? sim.find(step.focus) : undefined;
    if (step.title.startsWith('Datalink') && focus?.request === 'clearance') {
      expect(sendDcl(sim, focus, suggestedSid(sim, focus)!, allocateSquawk(sim))).toBeUndefined();
    }
    const example = step.example?.(sim);
    // The student answers a pilot who is waiting; a step without a call (e.g. correcting a readback) after a while.
    const calling = !!focus?.request;
    if (example && (calling || sim.time - stepStart > 60) && sim.time - lastSent > 20 && !sim.frequency.isBusy(sim.time)) {
      const r = sim.transmit(example);
      if (calling) expect(r.ok, `"${example}" not understood`).toBe(true);
      lastSent = sim.time;
    }
    sim.tick(1);
  }
  return { runner, sim, log };
}

describe('tutorials', () => {
  for (const t of TUTORIALS) {
    it(`${t.title}: every step can be done with its example`, () => {
      const { runner, sim, log } = play(t.id);
      expect(runner.finished, log.join('\n')).toBe(true);
      expect(sim.stats.sayAgains).toBe(0);
      expect(sim.incidents).toEqual([]);
      // The pilots did not refuse an example.
      const refused = sim.messages.filter((m) => m.kind === 'pilot' && /\b(unable|negative|say again|confirm)\b/i.test(m.text));
      expect(refused.map((m) => m.text)).toEqual([]);
    }, 60000);
  }

  it('the Delivery tutorial makes the crew read back a wrong squawk once, and it is caught', () => {
    const { sim } = play('delivery');
    expect(sim.stats.readbackErrorsCaught).toBe(1);
    expect(sim.stats.readbackErrorsMissed).toBe(0);
  }, 60000);

  it('live traffic after the tutorial', () => {
    const t = TUTORIALS[1];
    const sim = new Simulation(tutorialConfig(t, EDDS));
    const runner = new TutorialRunner(t, sim);
    runner.startLiveTraffic();
    for (let s = 0; s < 600; s++) sim.tick(1);
    expect(sim.aircraft.length).toBeGreaterThan(0);
  });
});
