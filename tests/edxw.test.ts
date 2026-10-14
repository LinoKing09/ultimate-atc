import { describe, expect, it } from 'vitest';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDXW } from '../src/data/airports/edxw';

describe('Sylt (EDXW)', () => {
  it('runs an hour of traffic on each runway as Sylt Tower (the only position) without collisions', () => {
    for (const runway of ['32', '14']) {
      const sim = new Simulation({ airport: EDXW, position: 'TWR', runway, density: 'heavy', seed: 2, events: false });
      expect(sim.userTower).toBe(true);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        for (const ac of sim.aircraft) {
          const busy = sim.tower.runwayBusy(ac);
          if (ac.phase === 'approach' && ac.frequency === sim.stationFor('tower') && !ac.landingCleared && sim.distanceToThresholdNm(ac) < 4 && !busy) sim.transmit(`${ac.callsign} cleared to land`);
          if (!ac.request || sim.time - ac.lastCallAt < 3 || Math.round(sim.time) % 10 !== 0) continue;
          const r = ac.request;
          if (r === 'pushback') sim.transmit(`${ac.callsign} push and start approved`);
          if (r === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${runway}`);
          if ((r === 'taxiIn' || r === 'vacated') && ac.assignedStand) sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand}`);
          if (r === 'crossing' && !busy) sim.transmit(`${ac.callsign} cross runway 24`);
          if ((r === 'departure' || r === 'handoff') && ac.phase === 'holding' && !ac.lineUpCleared && !busy && sim.tower.nextArrivalEta() > 150 && sim.tower.spacingRemaining(ac) <= 0) sim.transmit(`${ac.callsign} cleared for take-off`);
          if (r === 'radar') sim.transmit(`${ac.callsign} contact radar`);
        }
      }
      expect(sim.stats.collisions).toBe(0);
      expect(sim.stats.incursions).toBe(0);
      expect(sim.stats.departuresAirborne).toBeGreaterThanOrEqual(2);
      expect(sim.stats.arrivalsParked).toBeGreaterThanOrEqual(2);
      // Nobody is left waiting on the ground for a clearance the bot could not give.
      expect(sim.aircraft.filter((a) => a.onGround && a.request === 'vacated' && sim.time - a.requestSince > 300)).toEqual([]);
    }
  });

  it('parses lettered stands (Apron 2)', () => {
    const r = parseTransmission('DCABC taxi to stand golf 1 via D', { callsigns: ['DCABC'], taxiways: new Set(['D']), sids: [] });
    expect(r.commands[0]).toMatchObject({ type: 'taxi', destination: { kind: 'stand', stand: 'G1' } });
  });
});
