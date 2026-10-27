import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { Simulation } from '../src/core/simulation';
import { AIRPORTS } from '../src/data/airports';

/** Smallest turn radius along a path, from the heading change over 10 m. */
function minRadius(path: NonNullable<Aircraft['path']>): number {
  let r = Infinity;
  for (let s = 0; s + 10 <= path.length; s++) {
    let d = Math.abs(path.headingAt(s + 10) - path.headingAt(s)) % 360;
    if (d > 180) d = 360 - d;
    if (d > 0.5) r = Math.min(r, 10 / ((d * Math.PI) / 180));
  }
  return r;
}

describe('line-up from every departure entry', () => {
  it('turns onto the runway in curves (no pivoting, no hairpin) and ends on the centre line', () => {
    for (const airport of AIRPORTS) {
      for (const ops of airport.runwayOps) {
        for (const entry of ops.departureEntries) {
          const sim = new Simulation({ airport, position: 'TWR', runway: ops.runway, density: 'medium', seed: 1, events: false, generateTraffic: false });
          // A turboprop: it accepts the short intersections too.
          const ac = sim.traffic.spawnDeparture(2, { type: 'DH8D' }) as Aircraft;
          const hp = sim.airport.holdingPoint(entry.holdingPoint)!;
          ac.pos = { ...hp.pos };
          ac.runway = ops.runway;
          ac.stoppedAt = { s: 0, kind: 'holdShort', target: '', nodeId: hp.id, holdingPoint: entry.holdingPoint };
          ac.backtrackCleared = !!entry.backtrack;
          const where = `${airport.icao} ${ops.runway} ${entry.holdingPoint}`;
          if ((sim.tower as unknown as { lineUp(a: Aircraft): string | undefined }).lineUp(ac)) continue;
          // The 180° turns on the runway have 11 m radius (measured over 10 m of path: about 7.5 m).
          expect(minRadius(ac.path!), where).toBeGreaterThan(7);
          const p = ac.path!.points;
          const end = sim.airport.runwayEnd(ops.runway)!;
          expect(Math.abs(sim.airport.runwayCoordinates(end, p[p.length - 1]).lateral), where).toBeLessThan(4);
          expect(Math.abs(((ac.path!.headingAt(ac.path!.length - 1) - end.heading + 540) % 360) - 180), where).toBeLessThan(10);
        }
      }
    }
  });
});
