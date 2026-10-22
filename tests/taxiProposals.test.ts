import { describe, expect, it } from 'vitest';
import { parseTransmission } from '../src/core/phraseology/parser';
import { previewTaxi } from '../src/core/pilot';
import { Simulation } from '../src/core/simulation';
import { AIRPORTS } from '../src/data/airports';

/**
 * The taxi menu proposes a route ("taxi to holding point A via N, M") built from the router's own route: the crew
 * must accept it at every airport, also where OpenStreetMap has unnamed links at the junctions (Cologne/Bonn).
 */
describe('taxi route proposals', () => {
  for (const ap of AIRPORTS) {
    it(`${ap.icao}: the crews accept the proposed routes in both directions`, () => {
      const position = ap.stations.some((s) => s.type === 'GND') ? 'GND' : 'TWR';
      // Both directions of operation: the parallel runways, or both ends of the main runway.
      const main = ap.runways.find((r) => r.ends.some((e) => e.name === ap.runwayOps[0].runway))!;
      const runways = ap.parallelRunways?.length ? ap.parallelRunways.map((p) => p.ends.join('+')) : main.ends.map((e) => e.name).filter((e) => ap.runwayOps.some((o) => o.runway === e));
      const refused: string[] = [];
      let accepted = 0;
      for (const runway of runways) {
        const sim = new Simulation({ airport: ap, position, density: 'medium', seed: 2, events: false, runway });
        for (let t = 0; t < 1200; t++) {
          sim.tick(1);
          for (const ac of sim.aircraft) {
            if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
            if (ac.request === 'clearance') sim.transmit(`${ac.callsign} cleared to ${ac.flightPlan.destination} ${ac.flightPlan.sid} departure squawk ${ac.flightPlan.squawk}`);
            if (ac.request === 'pushback') sim.transmit(`${ac.callsign} push and start approved`);
            if (ac.request !== 'taxi' && ac.request !== 'taxiIn') continue;
            const dest = ac.request === 'taxi' ? `runway ${sim.departureRunwayOf(ac)}` : `stand ${ac.assignedStand}`;
            const cmd = parseTransmission(`taxi to ${dest}`, { callsigns: [], taxiways: sim.airport.taxiwayNames }).commands[0];
            const r = cmd?.type === 'taxi' ? previewTaxi(sim, ac, cmd) : { error: 'invalid' };
            if ('error' in r) {
              refused.push(`${runway} ${ac.callsign} ${dest}: ${r.error}`);
              continue;
            }
            const destText = r.dest.kind === 'holdingPoint' ? `holding point ${r.dest.name}` : dest;
            const text = `${ac.callsign} taxi to ${destText} via ${r.route.taxiways.join(', ')}`;
            const n = sim.messages.length;
            sim.transmit(text);
            sim.tick(8);
            const reply = sim.messages.slice(n).find((m) => m.kind === 'pilot' && m.from === ac.callsign);
            if (reply && /unable|confirm|say again/i.test(reply.text)) refused.push(`${runway} ${text} -> ${reply.text}`);
            else accepted++;
          }
        }
      }
      expect(refused).toEqual([]);
      expect(accepted).toBeGreaterThan(0);
    }, 60000);
  }
});
