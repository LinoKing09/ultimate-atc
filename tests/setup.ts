import { afterAll } from 'vitest';
import { Simulation } from '../src/core/simulation';

// Reports how much traffic each test file simulated (summed in docs/benchmarks.md).
afterAll(() => {
  const h = Simulation.simulatedSeconds / 3600;
  if (h > 0) console.log(`[simulated traffic] ${h.toFixed(2)} h`);
});
