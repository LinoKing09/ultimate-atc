import { formatAltitude } from '../src/core/phraseology/format';
import { allocateSquawk, initialClimb, sendDcl, suggestedSid } from '../src/core/delivery';
import { routeHeadOn } from '../src/core/conflicts';
import { conflictResolution, pushInWay, reachableFreeStand } from '../src/core/groundAI';
import { previewTaxi } from '../src/core/pilot';
import { distance } from '../src/core/geo';
import type { Aircraft } from '../src/core/aircraft';
import type { Simulation } from '../src/core/simulation';

/**
 * The scripted controller of the soak tests: answers every call on the staffed positions with the shortest
 * instruction, the way a careful but simple controller would. Delivery clears; Ground pushes back and taxis when no
 * traffic is close by or coming the other way (at most 4 minutes' wait), sends arrivals to a stand they can reach
 * without opposite traffic, holds slot (CTOT) flights on the stand and resolves conflicts the way the AI Ground does
 * (the aircraft menu's "Resolve conflict"); Tower clears take-offs when the runway and the spacing allow (a backtrack
 * only on an empty runway), landings, crossings and frequency changes.
 */
/** A departure with a CTOT is pushed back at the earliest this long (s) before it. */
const CTOT_LEAD_S = 15 * 60;
/** A pushback or taxi waits at most this long (s) for opposite traffic on its way out. */
const HEAD_ON_WAIT_S = 240;
/** Departures taxiing out or waiting at the runway at most (more wait on the stand: gate hold). */
const QUEUE_MAX = 4;
/** Under gate hold, pushbacks are approved one at a time, this far apart (s). */
const GATE_HOLD_SPACING_S = 30;

export function createBot(sim: Simulation): () => void {
  /** Last crossing clearance per runway: no take-off on it for 90 s after. */
  const crossed = new Map<string, number>();
  const answered = new Map<string, number>();
  /** Since when a pushback / taxi waits for opposite traffic (per call). */
  const held = new Map<string, number>();
  const staffed = (role: 'DEL' | 'GND' | 'TWR') => [sim.config.position, ...(sim.config.positions ?? [])].includes(role);
  const tower = staffed('TWR');
  /** Last pushback approved while departures were queueing (gate hold: one at a time). */
  let lastHeldPush = -Infinity;
  /** Without head-on traffic on the way: the arrival's stand, or else the nearest free one it can reach without (a careful Ground). */
  const standFor = (ac: Aircraft): string | undefined => {
    // A stand the crew reported blocked (occupied, or a parked neighbour too close) is given up, like the AI Ground does.
    const blocked = ac.standBlocked?.reported ? ac.standBlocked.stand : undefined;
    const own = (ac.assignedStand !== blocked ? ac.assignedStand : undefined) ?? reachableFreeStand(sim, ac, (s) => s.id !== blocked)?.id;
    const clear = (stand: string) => {
      const r = previewTaxi(sim, ac, { type: 'taxi', destination: { kind: 'stand', stand }, via: [], holdShort: [], cross: [] });
      if ('error' in r || r.route.requiresUTurn) return false;
      const pts = sim.airport.polyline(r.route.nodes).points;
      // An aircraft pushing back or starting up on the way: it will taxi towards us.
      const pushing = sim.aircraft.some((o) => (o.phase === 'pushback' || o.phase === 'startup') && pts.some((p) => distance(p, o.pos) < (o.type.wingspanM + ac.type.wingspanM) * 0.38 + 6));
      return !pushing && !routeHeadOn(sim, ac, pts);
    };
    if (!own || clear(own)) return own;
    const others = sim.freeStands(ac.type.wingspanM, (s) => s.id !== own, ac).sort((a, b) => distance(a.pos, ac.pos) - distance(b.pos, ac.pos)).slice(0, 5);
    const other = others.find((s) => clear(s.id))?.id;
    if (other) return other;
    // Nothing clear: the crew waits where it is (at most HEAD_ON_WAIT_S), then gets its stand anyway.
    const key = `${ac.callsign}:${ac.request}:${ac.requestSince}`;
    held.set(key, held.get(key) ?? sim.time);
    return sim.time - held.get(key)! < HEAD_ON_WAIT_S ? undefined : own;
  };
  return () => {
    const t = sim.time;
    // One take-off clearance per runway and round: the aircraft cleared has not moved yet (two backtracks at once).
    const clearedNow = new Set<string>();
    for (const ac of sim.aircraft) {
      const cs = ac.callsign;
      if (!sim.isOnMyFrequency(ac)) continue;
      if (tower && (ac.request === 'departure' || (ac.request === 'handoff' && ac.phase === 'holding')) && t - ac.lastCallAt >= 3 && Math.floor(t) % 5 === 0) {
        const rwy = sim.airport.runwayNameFor(ac.runway!) ?? '';
        // A backtrack needs the whole runway (and more time before the next arrival).
        const backtrack = /backtrack/.test(ac.lastTransmission ?? '');
        const free = backtrack ? !sim.tower.runwayBusy(ac, sim.tower.departureEnd(ac)) : !sim.tower.runwayBusyForDeparture(ac);
        if (!clearedNow.has(rwy) && t - (crossed.get(rwy) ?? -999) > 90 && free && sim.tower.spacingRemaining(ac) <= 0 && sim.tower.nextArrivalEta(sim.tower.departureEnd(ac)) > (backtrack ? 180 : 90)) {
          sim.transmit(`${cs} ${backtrack ? 'backtrack ' : ''}runway ${ac.runway}, cleared for take-off`);
          clearedNow.add(rwy);
          continue;
        }
      }
      // Conflicts: the same way out as the AI Ground gives (the aircraft menu's "Resolve conflict").
      // As a last resort across a runway too (Ground then asks Tower for the crossing).
      const way = conflictResolution(sim, ac, true);
      if (way && sim.isOnMyFrequency(way.aircraft)) {
        sim.transmit(`${way.aircraft.callsign} ${way.instruction}`);
        way.done();
        continue;
      }
      // A wrong squawk in the read-back is corrected.
      if (ac.readbackError && t - ac.lastCallAt >= 3 && t - ac.lastCallAt < 4) sim.transmit(`${cs} negative, squawk ${ac.readbackError.squawk}`);
      // Each call is answered once 3 s after it; a call that could not be answered yet (traffic, runway busy) is
      // checked again every 5 s, and an answer the crew did not take is repeated after a minute.
      if (!ac.request || t - ac.lastCallAt < 3) continue;
      const key = `${cs}:${ac.request}:${ac.requestSince}`;
      const last = answered.get(key);
      if (last !== undefined ? t - last < 60 : Math.floor(t - ac.lastCallAt) % 5 !== 3) continue;
      let sent = false;
      const say = (text: string) => {
        sim.transmit(text);
        sent = true;
      };
      // A departure with a slot (CTOT) is pushed back and taxied only in time for it, not to block the holding point.
      const early = ac.ctot !== undefined && t < ac.ctot - CTOT_LEAD_S;
      // Opposite traffic on the way out (CATC): the pushback / taxi waits for it (at most HEAD_ON_WAIT_S).
      const headOn = () => {
        const r = previewTaxi(sim, ac, { type: 'taxi', destination: { kind: 'runway', runway: sim.departureRunwayOf(ac) }, via: [], holdShort: [], cross: [] });
        if ('error' in r) return false;
        const c = routeHeadOn(sim, ac, sim.airport.polyline(r.route.nodes).points);
        // Traffic that waits behind us (blocked by us) is no reason to wait: we have to move first.
        if (!c || c.other.blockedBy === cs) return false;
        // Per request: a new call (after a cancelled pushback, say) waits again.
        const key = `${cs}:${ac.request}:${ac.requestSince}`;
        held.set(key, held.get(key) ?? t);
        return t - held.get(key)! < HEAD_ON_WAIT_S;
      };
      // Traffic taxiing past the stand or the lane in front of it: no pushback into its way (as the AI Ground).
      const inWay = () => pushInWay(sim, ac);
      // Gate hold: the runway queue is long enough already.
      const queueFull = () => {
        const n = sim.aircraft.filter((o) => o.category === 'departure' && ['pushback', 'taxi', 'holding', 'lineup'].includes(o.phase)).length;
        return n >= QUEUE_MAX || (n >= QUEUE_MAX - 1 && t - lastHeldPush < GATE_HOLD_SPACING_S);
      };
      const nearTaxi = () => sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && distance(o.pos, ac.pos) < 250);
      switch (ac.request) {
        case 'clearance': {
          const sid = suggestedSid(sim, ac) ?? ac.flightPlan.sid;
          const squawk = allocateSquawk(sim);
          if (!sid) break;
          if (ac.dcl) sendDcl(sim, ac, sid, squawk);
          else say(`${cs} cleared to ${ac.flightPlan.destination} via ${sid} departure, climb ${formatAltitude(initialClimb(sim))}, squawk ${squawk}`);
          break;
        }
        case 'startup':
          say(`${cs} start-up approved`);
          break;
        case 'frequency':
          // Without a Ground (St. Maarten) Delivery hands the crews to the Tower.
          say(`${cs} contact ${sim.stationFor('ground') === 'TWR' ? 'tower' : 'ground'}`);
          break;
        case 'pushback':
          if (!nearTaxi() && !early && !queueFull() && !headOn() && !inWay()) {
            say(`${cs} push and start approved`);
            lastHeldPush = t;
          }
          break;
        case 'tow':
          if (!nearTaxi()) say(`${cs} tow approved`);
          break;
        case 'taxi':
          if (early || headOn()) break;
          say(`${cs} taxi to runway ${sim.departureRunwayOf(ac)}`);
          break;
        case 'taxiIn': {
          const stand = standFor(ac);
          if (stand) say(`${cs} taxi to stand ${stand}`);
          break;
        }
        case 'route':
          if (ac.category === 'arrival') {
            const stand = standFor(ac);
            if (stand) say(`${cs} taxi to stand ${stand}`);
          }
          else if (ac.category === 'departure') say(`${cs} taxi to runway ${sim.departureRunwayOf(ac)}`);
          // A tow that could not find its way after the pushback: to its stand again.
          else if (ac.category === 'tow' && ac.tow) say(`${cs} taxi to stand ${ac.tow.to}`);
          break;
        case 'crossing':
          if (ac.stoppedAt?.kind === 'runway' && sim.tower.crossingFree(ac.stoppedAt.target)) {
            const target = ac.stoppedAt.target;
            say(`${cs} cross runway ${sim.activeEndOn(target) ?? target.split('/')[0]}`);
            crossed.set(target, t);
          }
          break;
        case 'handoff':
          // On Tower's frequency already (Tower-only airports): the take-off clearance above answers it.
          if (ac.frequency !== sim.stationFor('tower')) say(`${cs} contact tower`);
          break;
        case 'landing':
          say(`${cs} runway ${ac.runway} cleared to land`);
          break;
        case 'vacated':
          // Without a Ground of its own (or Ground staffed by the same controller) Tower gives the taxi instruction.
          if (!sim.airport.station('GND') || staffed('GND')) {
            if (ac.category === 'arrival') {
              const stand = standFor(ac);
              if (stand) say(`${cs} taxi to stand ${stand}`);
            } else if (ac.category === 'departure' && !headOn()) say(`${cs} taxi to runway ${sim.departureRunwayOf(ac)}`);
          } else say(`${cs} contact ground`);
          break;
        case 'radar':
          say(`${cs} contact radar`);
          break;
      }
      if (sent) answered.set(key, t);
    }
  };
}
