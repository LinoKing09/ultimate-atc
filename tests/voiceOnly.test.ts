import { describe, expect, it } from 'vitest';
import { perform } from '../src/core/session';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

describe('voice-only mode: the crews report it themselves', () => {
  it('a medical emergency on final is declared by the crew (PAN PAN), with no system message; a go-around is only heard', () => {
    for (const voice of [false, true]) {
      const sim = new Simulation({ airport: EDDS, position: 'TWR', positions: ['TWR'], runway: '25', density: 'light', seed: 2, generateTraffic: false, events: false });
      perform(sim, { k: 'voiceOnly', on: voice });
      const msgs: { kind: string; from: string; text: string }[] = [];
      sim.on('message', (m) => msgs.push(m));
      const ac = sim.traffic.spawnArrival(8, { type: 'A320', callsign: 'DLH4AB', medical: true })!;
      for (let t = 0; t < 240 && !msgs.some((m) => m.kind === 'pilot' && /DLH4AB|Lufthansa 4AB/i.test(m.text)); t++) sim.tick(1);
      const first = msgs.find((m) => m.kind === 'pilot')!;
      expect(first.text).toMatch(/^PAN PAN, PAN PAN, PAN PAN, .*medical emergency/);
      expect(msgs.some((m) => m.from === 'SYSTEM' && /PAN PAN/.test(m.text))).toBe(!voice);
      // No landing clearance: the crew goes around on its own - in voice-only mode you only hear "going around".
      for (let t = 0; t < 600 && ac.phase === 'approach'; t++) sim.tick(1);
      expect(ac.phase).toBe('goAround');
      for (let t = 0; t < 10; t++) sim.tick(1);
      expect(msgs.some((m) => m.kind === 'pilot' && /going around/.test(m.text))).toBe(true);
      expect(msgs.some((m) => m.from === 'SYSTEM' && /went around/.test(m.text))).toBe(!voice);
      expect(sim.stats.goArounds).toBe(1);
    }
  });
});
