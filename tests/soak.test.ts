import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

/**
 * Soak test: many seeds, both runways, one hour each, with a simple automatic
 * controller (shortest routes, no sequencing). Run with `npm run soak`.
 * It reports collisions, incursions, go-arounds, deadlocks and throughput.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const RUN = !!env.SOAK || env.npm_lifecycle_event === 'soak';

describe.skipIf(!RUN)('soak', () => {
  it('runs many sessions without crashes or collisions', { timeout: 600_000 }, () => {
    const rows: string[] = [];
    let collisions = 0;
    const totals = { airborne: 0, parked: 0, goArounds: 0, incursions: 0, deadlocks: 0, ms: 0, runs: 0 };
    for (const runway of ['25', '07']) {
      for (let seed = 1; seed <= 10; seed++) {
        const sim = new Simulation({ airport: EDDS, position: 'GND', runway, density: 'medium', seed, events: true, scenario: { heavies: seed % 3 === 0 } });
        let deadlockCalls = 0;
        const t0 = performance.now();
        sim.on('message', (m) => {
          if (/opposite traffic|blocked by/.test(m.text)) deadlockCalls++;
        });
        for (let t = 0; t < 3600; t++) {
          sim.tick(1);
          for (const ac of sim.aircraft) {
            if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
            if (ac.request === 'pushback') {
              // Simple de-confliction: no push while something taxis close by.
              if (!sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) sim.transmit(`${ac.callsign} push and start approved`);
            }
            if (ac.request === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${runway}`);
            if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) {
              sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM, undefined, ac)[0]?.id}`);
            }
            if (ac.request === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
            // Tows (since 0.6.x): approved like pushbacks.
            if (ac.request === 'tow' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && Math.hypot(o.pos.x - ac.pos.x, o.pos.y - ac.pos.y) < 250)) sim.transmit(`${ac.callsign} tow approved`);
          }
        }
        const ms = performance.now() - t0;
        const s = sim.stats;
        collisions += s.collisions;
        totals.airborne += s.departuresAirborne;
        totals.parked += s.arrivalsParked;
        totals.goArounds += s.goArounds;
        totals.incursions += s.incursions;
        totals.deadlocks += deadlockCalls;
        totals.ms += ms;
        totals.runs++;
        rows.push(`${runway} seed ${String(seed).padStart(2)}: airborne ${String(s.departuresAirborne).padStart(2)}, parked ${String(s.arrivalsParked).padStart(2)}, collisions ${s.collisions}, incursions ${s.incursions}, go-arounds ${s.goArounds}, deadlock calls ${deadlockCalls}, on ground ${sim.aircraft.filter((a) => a.onGround).length}`);
      }
    }
    const n = totals.runs;
    rows.push(
      `SUMMARY (${n} sessions of 1 h): departures airborne ${(totals.airborne / n).toFixed(1)}/h, arrivals parked ${(totals.parked / n).toFixed(1)}/h, ` +
        `collisions ${collisions}, incursions ${totals.incursions}, go-arounds ${totals.goArounds}, deadlock calls ${(totals.deadlocks / n).toFixed(1)}/h, ` +
        `${(totals.ms / n).toFixed(0)} ms computing time per simulated hour`,
    );
    console.log(rows.join('\n'));
    expect(collisions).toBe(0);
  });
});
