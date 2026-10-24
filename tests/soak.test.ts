import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import type { StationType } from '../src/core/airport/types';
import { distance } from '../src/core/geo';
import { defaultRunwayKey } from '../src/core/runways';
import { Simulation } from '../src/core/simulation';
import { AIRPORTS } from '../src/data/airports';
import { createBot } from './bot';

/**
 * Soak test (the 2.0 criterion "no dead ends at any airport"): every airport, every runway direction (parallel
 * runways together, as the airport uses them), SOAK_SEEDS seeds (default 3; every third with more heavies) of one
 * hour each, once with Ground staffed (the AI runs Delivery and Tower) and once with every position staffed,
 * answered by the scripted controller of tests/bot.ts. Run with `npm run soak` (SOAK_AIRPORT=EDDK for one airport).
 * It reports collisions, incursions, go-arounds, deadlock calls, aircraft stuck for good and throughput, and fails
 * on a collision or an aircraft stuck for good.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const RUN = !!env.SOAK || env.npm_lifecycle_event === 'soak';
const SEEDS = Number(env.SOAK_SEEDS ?? 3);
const ONLY = env.SOAK_AIRPORT?.toUpperCase();

/** An aircraft on the ground that has not moved for this long (s), and is not parked or waiting at a holding point, is stuck. */
export const STUCK_S = 1200;

/** Why an aircraft does not move: for the report. */
function whyStuck(ac: Aircraft, since: number): string {
  const why = [
    ac.request && `request ${ac.request}`,
    ac.blockedBy && `behind ${ac.blockedBy}`,
    ac.giveWayTo && `giving way to ${ac.giveWayTo}`,
    ac.oppositeStop && `opposite ${ac.oppositeStop.other} at ${ac.oppositeStop.junction}${ac.oppositeStop.narrow ? ' (narrow)' : ''}`,
    ac.holdPosition && 'hold position',
    ac.stoppedAt && `stopped at ${ac.stoppedAt.kind} ${ac.stoppedAt.target ?? ''}`,
    ac.route && `route ${ac.route.edges.map((e) => e.name).filter((n, i, a) => n && n !== a[i - 1]).join(' ')} to ${ac.route.nodes.at(-1)?.id}`,
  ].filter(Boolean);
  return `${ac.callsign} (${ac.category}, ${ac.phase}, ${ac.frequency}) since ${Math.round(since)} s at ${Math.round(ac.pos.x)},${Math.round(ac.pos.y)}: ${why.join(', ')}`;
}

describe.skipIf(!RUN)('soak', () => {
  for (const airport of AIRPORTS.filter((a) => !ONLY || a.icao === ONLY)) {
    it(`${airport.icao}: every runway direction without collisions or aircraft stuck for good`, { timeout: 1_800_000 }, () => {
      const rows: string[] = [];
      const fails: string[] = [];
      const sum = { dep: 0, arr: 0, coll: 0, inc: 0, ga: 0, deadlock: 0, ms: 0, n: 0 };
      const roles = airport.stations.map((s) => s.type).filter((r): r is StationType => r === 'DEL' || r === 'GND' || r === 'TWR');
      const runways = [...new Set(airport.runwayOps.map((o) => defaultRunwayKey(airport, o.runway)))];
      // Ground alone (the AI runs the rest) where the airport has Ground, and all positions together.
      const setups: StationType[][] = [...(roles.includes('GND') ? [['GND' as StationType]] : []), roles];
      for (const runway of runways) {
        for (const positions of setups) {
          for (let seed = 1; seed <= SEEDS; seed++) {
            const sim = new Simulation({ airport, position: positions[0], positions, runway, density: 'medium', seed, events: true, scenario: { heavyLevel: seed % 3 === 0 ? 3 : 0 } });
            const bot = createBot(sim);
            let deadlockCalls = 0;
            sim.on('message', (m) => {
              if (/opposite traffic|blocked by/.test(m.text)) deadlockCalls++;
            });
            const moved = new Map<string, { x: number; y: number; t: number }>();
            const stuck = new Map<string, string>();
            const t0 = performance.now();
            for (let t = 0; t < 3600; t++) {
              sim.tick(1);
              bot();
              for (const ac of sim.aircraft) {
                if (!ac.onGround || ac.phase === 'arrived' || ac.phase === 'gone') continue;
                const m = moved.get(ac.callsign);
                if (!m || distance(m, ac.pos) > 3 || ac.phase === 'parked' || ac.phase === 'holding') moved.set(ac.callsign, { x: ac.pos.x, y: ac.pos.y, t: sim.time });
                else if (sim.time - m.t > STUCK_S && !stuck.has(ac.callsign)) stuck.set(ac.callsign, whyStuck(ac, m.t));
              }
            }
            const ms = performance.now() - t0;
            const s = sim.stats;
            const label = `${airport.icao} ${runway.padEnd(7)} ${positions.join('+').padEnd(11)} seed ${seed}`;
            rows.push(`${label}: airborne ${String(s.departuresAirborne).padStart(2)}, parked ${String(s.arrivalsParked).padStart(2)}, collisions ${s.collisions}, incursions ${s.incursions}, go-arounds ${s.goArounds}, deadlock calls ${deadlockCalls}, stuck ${stuck.size}, ${(ms / 1000).toFixed(1)} s`);
            Object.assign(sum, { dep: sum.dep + s.departuresAirborne, arr: sum.arr + s.arrivalsParked, coll: sum.coll + s.collisions, inc: sum.inc + s.incursions, ga: sum.ga + s.goArounds, deadlock: sum.deadlock + deadlockCalls, ms: sum.ms + ms, n: sum.n + 1 });
            if (s.collisions) fails.push(`${label}: ${s.collisions} collision(s)`);
            for (const st of stuck.values()) fails.push(`${label}: stuck ${st}`);
          }
        }
      }
      const n = sum.n;
      rows.push(
        `${airport.icao} SUMMARY (${n} sessions of 1 h): departures airborne ${(sum.dep / n).toFixed(1)}/h, arrivals parked ${(sum.arr / n).toFixed(1)}/h, collisions ${sum.coll}, ` +
          `incursions ${sum.inc}, go-arounds ${sum.ga}, deadlock calls ${(sum.deadlock / n).toFixed(1)}/h, stuck ${fails.length}, ${(sum.ms / n / 1000).toFixed(1)} s computing time per simulated hour`,
      );
      console.log(rows.join('\n'));
      expect(fails).toEqual([]);
    });
  }
});
