import { describe, expect, it } from 'vitest';
import { initialClimb } from '../src/core/delivery';
import { formatSidClimb } from '../src/core/phraseology/format';
import { Simulation } from '../src/core/simulation';
import { EDDN } from '../src/data/airports/eddn';

describe('Nuremberg (EDDN)', () => {
  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['28', '10']) {
      const sim = new Simulation({ airport: EDDN, position: 'GND', runway, density: 'medium', seed: 1, events: false });
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        for (const ac of sim.aircraft) {
          if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
          if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) sim.transmit(`${ac.callsign} push and start approved`);
          if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${runway}`);
          if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
          if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
        }
      }
      expect(sim.stats.collisions).toBe(0);
      expect(sim.stats.departuresAirborne).toBeGreaterThan(4);
      expect(sim.stats.arrivalsParked).toBeGreaterThan(4);
    }
  });

  it('crews read back the full-length holding points and the clearance at FL70', () => {
    const sim = new Simulation({ airport: EDDN, position: 'GND', runway: '28', density: 'medium', seed: 5, events: false, generateTraffic: false });
    const ac = sim.traffic.spawnDeparture(2, { stand: '12', callsign: 'DLH5AB', type: 'A320' })!;
    for (let t = 0; t < 900 && ac.request !== 'pushback'; t++) sim.tick(1);
    sim.transmit('DLH5AB push and start approved');
    for (let t = 0; t < 300 && ac.request !== 'taxi'; t++) sim.tick(1);
    sim.transmit('DLH5AB taxi to runway 28');
    for (let t = 0; t < 10; t++) sim.tick(1);
    expect(sim.messages.filter((m) => m.from === 'DLH5AB').at(-1)?.text).toMatch(/taxi to holding point A runway 28/i);
    expect(formatSidClimb(initialClimb(sim))).toBe('climb via SID to flight level 70');
  });
});
