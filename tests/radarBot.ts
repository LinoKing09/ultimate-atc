import { M_PER_NM, distance } from '../src/core/geo';
import { arrivalSequence, assumeTrack, initiateTransfer, offered } from '../src/core/radar';
import type { Simulation } from '../src/core/simulation';

/** Departures are handed to Center above this altitude (ft). */
const DEPARTURE_XFER_FT = 8000;

/**
 * Scripted Approach / Departure controller for the soak test: assumes the tracks Center offers, identifies and
 * descends the arrivals and clears them for the approach via the RNAV transition of their entry fix, slows an arrival
 * down that comes too close to the one ahead on the final, hands arrivals to Tower once they are established
 * (with the track transfer first, like EuroScope) and departures to Center above 8000 ft. Call it once per second.
 */
export function createRadarBot(sim: Simulation): () => void {
  const spoke = new Map<string, number>();
  const slowed = new Set<string>();
  const say = (cs: string, text: string): void => {
    if (sim.frequency.isBusy(sim.time) || sim.frequency.hasQueued(cs) || sim.time - (spoke.get(cs) ?? -Infinity) < 8) return;
    sim.transmit(`${cs} ${text}`);
    spoke.set(cs, sim.time);
  };
  return () => {
    for (const a of sim.aircraft) if (offered(a)) assumeTrack(sim, a);
    const seq = arrivalSequence(sim);
    for (const a of sim.aircraft) {
      const r = a.radar;
      if (!r || a.frequency !== 'APP' || a.onGround) continue;
      if (a.category === 'arrival') {
        const runway = a.runway ?? sim.runway;
        if (!r.approach && a.phase === 'inbound') {
          say(a.callsign, `${r.identified ? '' : 'identified, '}descend altitude 5000 feet, cleared ${sim.approachTypeFor(runway)} approach runway ${runway}`);
          continue;
        }
        const e = seq.get(a.callsign);
        if (e?.belowTarget && !slowed.has(a.callsign)) {
          slowed.add(a.callsign);
          say(a.callsign, 'reduce speed 160 knots');
          continue;
        }
        if (a.phase === 'approach' || r.established) {
          if (!r.transfer) initiateTransfer(sim, a);
          else if (r.transfer.acceptedAt !== undefined) say(a.callsign, `contact ${sim.airport.station('TWR')?.name ?? 'Tower'} ${sim.airport.station('TWR')?.frequency ?? ''}`);
        }
        continue;
      }
      if (a.category === 'departure') {
        const release = r.sector?.releaseFt ?? 10000;
        if (!r.identified || r.clearedFt < release) {
          say(a.callsign, `identified, climb ${release >= sim.transitionLevel(sim.atis.qnh) * 100 ? `flight level ${release / 100}` : `altitude ${release} feet`}`);
        } else if (a.altitudeFt > DEPARTURE_XFER_FT || distance(a.pos, { x: 0, y: 0 }) > 20 * M_PER_NM) {
          if (!r.transfer) initiateTransfer(sim, a);
          else if (r.transfer.acceptedAt !== undefined) say(a.callsign, `contact ${r.sector?.callsign ?? 'Langen Radar'} ${r.sector?.frequency ?? ''}`);
        }
      }
    }
  };
}
