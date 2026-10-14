import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { pavementGeometry } from '../src/core/airport/pavement';
import { projectOnSegment } from '../src/core/geo';
import { EDDN } from '../src/data/airports/eddn';
import { EDDS } from '../src/data/airports/edds';
import { EDJA } from '../src/data/airports/edja';
import { EDXW } from '../src/data/airports/edxw';

describe('taxiway pavement geometry', () => {
  for (const data of [EDDS, EDDN, EDJA, EDXW]) {
    it(`${data.icao}: the rounded chains cover every taxiway edge`, () => {
      const ap = new Airport(data);
      const g = pavementGeometry(ap);
      const near = (p: { x: number; y: number }) =>
        g.chains.some((c) => c.points.some((q, i) => i > 0 && projectOnSegment(p, c.points[i - 1], q).dist < 6));
      for (const e of ap.edges) {
        if (e.kind === 'runway' || e.kind === 'stand') continue;
        // The middle of every edge lies on a chain (within the rounding of a corner).
        const mid = { x: (e.from.pos.x + e.to.pos.x) / 2, y: (e.from.pos.y + e.to.pos.y) / 2 };
        if (!e.shape.length) expect(near(mid)).toBe(true);
      }
      expect(g.fillets.length).toBeGreaterThan(0);
    });
  }

  it('Memmingen: widths after the chart, fillets where taxiways meet the runway', () => {
    const ap = new Airport(EDJA);
    const width = (name: string) => ap.edges.find((e) => e.name === name && e.kind === 'taxiway')!.widthM;
    expect(width('N')).toBe(23);
    expect(width('R')).toBe(27);
    expect(width('P')).toBe(15);
    const g = pavementGeometry(ap);
    const rwyR = ap.node('RWY.R').pos;
    expect(g.fillets.filter((f) => f.widthM === 27 && Math.hypot(f.points[0].x - rwyR.x, f.points[0].y - rwyR.y) < 120).length).toBe(2);
  });
});
