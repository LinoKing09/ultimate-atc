import { describe, expect, it } from 'vitest';
import { approachProfile, finalReductionNm, targetSpeedKt, timeOnFinalS } from '../src/core/approach';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

describe('approach speed profile', () => {
  it('intercepts at about 180 kt, flies 160 kt until 4 NM and reaches Vapp by about 3 NM', () => {
    const p = approachProfile(138);
    expect(targetSpeedKt(p, 10)).toBe(180);
    expect(targetSpeedKt(p, 6)).toBe(160);
    expect(targetSpeedKt(p, 3.9)).toBe(138);
    // Reduction from 160 kt to Vapp after 4 NM: done by about 3 NM (stabilised by 1000 ft).
    expect(4 - finalReductionNm(160, 138)).toBeGreaterThan(2.8);
    // An instruction overrides the profile until its distance.
    expect(targetSpeedKt(p, 5, { kt: 170, untilNm: 5 })).toBe(138);
    expect(targetSpeedKt(p, 8, { kt: 170, untilNm: 5 })).toBe(170);
    // Faster on final than at Vapp all the way: the last 12 NM take less time.
    expect(timeOnFinalS(p, 12, 0, 180)).toBeLessThan((12 / 138) * 3600 - 30);
  });

  it('tells "resume normal speed" from "reduce to final approach speed"', () => {
    const ctx = { callsigns: ['DLH5AB'], taxiways: new Set<string>(), sids: [] };
    expect(parseTransmission('DLH5AB resume normal speed', ctx).commands).toEqual([{ type: 'speed', resume: true }]);
    expect(parseTransmission('DLH5AB reduce to final approach speed', ctx).commands).toEqual([{ type: 'speed', final: true }]);
  });

  it('arrivals slow down on final in the simulation and keep their spacing at the threshold', () => {
    const sim = new Simulation({ airport: EDDS, position: 'TWR', runway: '25', density: 'heavy', seed: 3, events: false });
    const seen = new Map<string, { at10?: number; at5?: number; at2?: number }>();
    let minGapS = Infinity;
    let lastLanding = -Infinity;
    const landed = new Set<string>();
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      for (const ac of sim.aircraft) {
        if (ac.phase === 'approach') {
          const d = sim.distanceToThresholdNm(ac);
          const kt = ac.speed / 0.514444;
          const s = seen.get(ac.callsign) ?? {};
          if (d < 10 && d > 9.5 && s.at10 === undefined) s.at10 = kt;
          if (d < 5 && s.at5 === undefined) s.at5 = kt;
          if (d < 2 && s.at2 === undefined) s.at2 = kt;
          seen.set(ac.callsign, s);
          if (!ac.landingCleared && d < 4 && t % 10 === 0 && !sim.tower.runwayBusy(ac)) sim.transmit(`${ac.callsign} cleared to land`);
        }
        if (ac.phase === 'landing' && !landed.has(ac.callsign)) {
          landed.add(ac.callsign);
          minGapS = Math.min(minGapS, sim.time - lastLanding);
          lastLanding = sim.time;
        }
        if (t % 10 === 0 && (ac.request === 'vacated' || ac.request === 'radar')) sim.transmit(`${ac.callsign} ${ac.request === 'radar' ? 'contact radar' : 'contact ground'}`);
      }
    }
    const full = [...seen.entries()].filter(([, s]) => s.at10 !== undefined && s.at2 !== undefined);
    expect(full.length).toBeGreaterThan(3);
    for (const [cs, s] of full) {
      const vapp = sim.aircraft.find((a) => a.callsign === cs)?.type.approachSpeedKt;
      expect(s.at10!).toBeGreaterThanOrEqual(169);
      expect(s.at5!).toBeGreaterThanOrEqual(159);
      if (vapp) expect(Math.abs(s.at2! - vapp)).toBeLessThan(1);
    }
    // 3 NM minimum at about 140 kt: at least about 75 s between landings.
    expect(minGapS).toBeGreaterThan(70);
    expect(sim.stats.goArounds).toBe(0);
  }, 120000);
});
