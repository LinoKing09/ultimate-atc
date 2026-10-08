import { describe, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

/**
 * Release benchmark: the same 20 one-hour sessions (runways 25 and 07, seeds
 * 1-10, medium traffic, no special events) with the same simple automatic
 * controller in every version, so results are comparable between releases.
 * Run with `npm run benchmark`; the results go into docs/benchmarks.md.
 * Keep the controller logic unchanged, or older results are no longer comparable.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const RUN = !!env.BENCH || env.npm_lifecycle_event === 'benchmark';

describe.skipIf(!RUN)('benchmark', () => {
  it('measures throughput, safety and speed', { timeout: 900_000 }, () => {
    const tot = { dep: 0, arr: 0, coll: 0, inc: 0, ga: 0, deadlockCalls: 0, ms: 0, n: 0 };
    for (const runway of ['25', '07']) {
      for (let seed = 1; seed <= 10; seed++) {
        const sim = new Simulation({ airport: EDDS, position: 'GND', runway, density: 'medium', seed, events: false });
        sim.on('message', (m) => {
          if (/opposite traffic|blocked by/.test(m.text)) tot.deadlockCalls++;
        });
        const t0 = performance.now();
        for (let t = 0; t < 3600; t++) {
          sim.tick(1);
          for (const ac of sim.aircraft) {
            if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
            if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) {
              sim.transmit(`${ac.callsign} push and start approved`);
            }
            if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${runway}`);
            if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) {
              sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
            }
            if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
          }
        }
        tot.ms += performance.now() - t0;
        const s = sim.stats;
        tot.dep += s.departuresAirborne;
        tot.arr += s.arrivalsParked;
        tot.coll += s.collisions;
        tot.inc += s.incursions;
        tot.ga += s.goArounds;
        tot.n++;
      }
    }
    const n = tot.n;
    console.log(
      `BENCHMARK (${n} x 1 h): departures airborne ${(tot.dep / n).toFixed(1)}/h | arrivals parked ${(tot.arr / n).toFixed(1)}/h | ` +
        `collisions ${tot.coll} | incursions ${tot.inc} | go-arounds ${tot.ga} | deadlock calls ${(tot.deadlockCalls / n).toFixed(1)}/h | ` +
        `${(tot.ms / n / 1000).toFixed(1)} s computing time per simulated hour`,
    );
  });
});
