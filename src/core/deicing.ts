import type { DeicingPad } from './airport/airport';
import type { Aircraft } from './aircraft';
import { distance } from './geo';
import type { Simulation } from './simulation';

/**
 * De-icing (scenario option "I", winter operations).
 *
 * Every departure that fits a de-icing pad has to be de-iced there before it
 * may taxi to the runway: Ground taxis it to a pad ("taxi to de-icing pad
 * DP2 via N"), the de-icing trucks need a few minutes, then the crew reports
 * "de-icing complete, ready for taxi" and Ground taxis it on to the runway.
 * Crews refuse a taxi clearance to the runway before. Aircraft too large for
 * every pad are de-iced on their stand (no pad needed). Holdover times are
 * not modelled: a de-iced aircraft stays de-iced.
 */

/** Time on the pad (seconds): 6-10 minutes, wide-bodies 3 minutes more. */
export const DEICING_MIN_S = 6 * 60;
export const DEICING_MAX_S = 10 * 60;
export const DEICING_WIDEBODY_EXTRA_S = 3 * 60;
/** Distance from the pad at which a de-iced aircraft has left it (metres). */
const LEFT_PAD_M = 60;

/** De-icing is in force in this session (scenario option and the airport has pads). */
export function deicingActive(sim: Simulation): boolean {
  return !!sim.config.scenario?.deicing && sim.airport.deicingPads.length > 0;
}

/** The aircraft fits at least one pad (larger ones are de-iced on the stand). */
export function fitsAnyPad(sim: Simulation, ac: Aircraft): boolean {
  return sim.airport.deicingPads.some((p) => p.maxWingspanM >= ac.type.wingspanM);
}

/** The departure still has to be de-iced on a pad before take-off. */
export function needsDeicing(sim: Simulation, ac: Aircraft): boolean {
  return deicingActive(sim) && ac.category === 'departure' && !ac.returnToStand && ac.deicing === undefined && fitsAnyPad(sim, ac);
}

/** The aircraft using a pad (taxiing to it, being de-iced, or not yet clear of it). */
export function padUser(sim: Simulation, pad: DeicingPad, except?: Aircraft): Aircraft | undefined {
  return sim.aircraft.find((o) => o !== except && o.phase !== 'gone' && o.deicingPad === pad.name);
}

/** Free pads the aircraft fits on. */
export function freePads(sim: Simulation, ac: Aircraft): DeicingPad[] {
  return sim.airport.deicingPads.filter((p) => p.maxWingspanM >= ac.type.wingspanM && !padUser(sim, p, ac));
}

/** Time the de-icing of this aircraft takes (seconds). */
export function deicingDuration(sim: Simulation, ac: Aircraft): number {
  const base = DEICING_MIN_S + (DEICING_MAX_S - DEICING_MIN_S) * sim.variation(`${ac.callsign}:deice`);
  return Math.round(base + (ac.type.wingspanM > 40 ? DEICING_WIDEBODY_EXTRA_S : 0));
}

/** The aircraft stopped on its pad: the de-icing trucks start. */
export function startDeicing(sim: Simulation, ac: Aircraft, pad: string): void {
  ac.deicing = 'inProgress';
  ac.deicingPad = pad;
  ac.deicingUntil = sim.time + deicingDuration(sim, ac);
}

/**
 * Periodic: finishes the de-icing (returns true when the crew should report
 * ready for taxi) and frees the pad once the aircraft has left it.
 */
export function updateDeicing(sim: Simulation, ac: Aircraft): boolean {
  if (ac.deicing === 'inProgress' && sim.time >= (ac.deicingUntil ?? 0)) {
    ac.deicing = 'done';
    ac.deicingUntil = undefined;
    return true;
  }
  if (ac.deicing === 'done' && ac.deicingPad) {
    const pad = sim.airport.deicingPad(ac.deicingPad);
    if (!pad || distance(ac.pos, pad.node.pos) > LEFT_PAD_M) ac.deicingPad = undefined;
  }
  return false;
}

/** The aircraft stands on its pad (route planning starts at the pad node). */
export function onPad(sim: Simulation, ac: Aircraft): DeicingPad | undefined {
  const pad = ac.deicingPad ? sim.airport.deicingPad(ac.deicingPad) : undefined;
  return pad && distance(ac.pos, pad.node.pos) < 3 ? pad : undefined;
}

/** Minutes of de-icing left (for the crew's answers). */
export function deicingMinutesLeft(sim: Simulation, ac: Aircraft): number {
  return Math.max(1, Math.round(((ac.deicingUntil ?? sim.time) - sim.time) / 60));
}
