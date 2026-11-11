import type { Aircraft } from './aircraft';
import type { Airport, TaxiNode } from './airport/airport';
import { distance } from './geo';
import { lvpInForce } from './met';
import { inform } from './pilot';
import type { Simulation } from './simulation';

/**
 * Stop bars (low visibility procedures): a row of red lights across the taxiway at the runway holding position -
 * at airports with CAT II/III operations (`lvpHoldingPoints` in the airport data) at every runway holding point of
 * the runways in use, at its CAT II/III holding position where the chart has one. Lit while LVP are in force. Tower
 * switches a bar off for one aircraft (line-up or crossing clearance); it lights again once the aircraft has entered
 * the runway, or after STOP_BAR_RELIGHT_S. Crews never pass a lit stop bar, even when cleared: they stop and report
 * it (ICAO Annex 14 5.3.20, Doc 4444 7.15.7).
 */

/** A stop bar switched off lights again after this long (s) when its aircraft has not entered the runway by then. */
export const STOP_BAR_RELIGHT_S = 90;
/** A crew stopped at a lit stop bar despite its clearance reports it after this long (s). */
const STOP_BAR_REPORT_S = 5;

export interface StopBar {
  /** The node of the bar (the CAT II/III holding position, else the runway holding point). */
  id: string;
  node: TaxiNode;
  /** The runway holding point the bar belongs to. */
  hp: TaxiNode;
  /** Physical runway, e.g. "07/25". */
  runway: string;
}

const cache = new WeakMap<Airport, StopBar[]>();

/** All stop bars of an airport (none without CAT II/III holding positions). */
export function stopBarsOf(airport: Airport): StopBar[] {
  let bars = cache.get(airport);
  if (!bars) {
    bars = [];
    if (airport.lvpHoldingPoints.size) {
      for (const hp of airport.holdingPoints.values()) {
        const name = hp.holdingPoint!.name.toUpperCase();
        for (const node of airport.lvpHoldingPoints.get(name) ?? [hp]) bars.push({ id: node.id, node, hp, runway: hp.holdingPoint!.runway });
      }
    }
    cache.set(airport, bars);
  }
  return bars;
}

/** Stop bars are in operation: low visibility procedures at an airport with stop bars. */
export function stopBarsInOperation(sim: Simulation): boolean {
  return lvpInForce(sim) && stopBarsOf(sim.airport).length > 0;
}

/** The bar is lit: in operation, on a runway in use, and not switched off. */
export function stopBarLit(sim: Simulation, bar: StopBar): boolean {
  return stopBarsInOperation(sim) && !!sim.activeEndOn(bar.runway) && !sim.stopBarsOff.has(bar.id);
}

/** Switches a bar off (for an aircraft, or by hand) or on again. */
export function setStopBar(sim: Simulation, id: string, lit: boolean, callsign?: string): void {
  if (lit) sim.stopBarsOff.delete(id);
  else sim.stopBarsOff.set(id, { at: sim.time, callsign });
}

/**
 * The lit stop bar ahead of an aircraft on its way towards a runway, with its position on the path (arc length), if
 * any within `lookM`. A bar counts only in the direction towards the runway (not for traffic vacating it).
 */
export function litStopBarAhead(sim: Simulation, ac: Aircraft, lookM = 400): { bar: StopBar; s: number } | undefined {
  const path = ac.path;
  if (!path || !stopBarsInOperation(sim)) return undefined;
  let best: { bar: StopBar; s: number } | undefined;
  for (const bar of stopBarsOf(sim.airport)) {
    const hpS = path.marker(bar.hp.id)?.s;
    if (hpS === undefined || hpS < ac.s - 1) continue;
    // The bar on the path - or where the aircraft stands (a line-up starts at the CAT II/III holding position).
    const s = path.marker(bar.id)?.s ?? (distance(path.pointAt(ac.s), bar.node.pos) < 4 ? ac.s : undefined);
    if (s === undefined || s < ac.s - 1 || s - ac.s > lookM || s > hpS) continue;
    // Towards the runway: beyond the holding point the path comes closer to the runway centre line.
    if (bar.id === bar.hp.id && hpS + 10 <= path.length && !towardsRunway(sim, bar, path.pointAt(hpS + 10))) continue;
    if (!stopBarLit(sim, bar)) continue;
    if (!best || s < best.s) best = { bar, s };
  }
  return best;
}

function towardsRunway(sim: Simulation, bar: StopBar, beyond: { x: number; y: number }): boolean {
  const end = sim.airport.runwayEnd(sim.activeEndOn(bar.runway) ?? '');
  if (!end) return false;
  const lateral = (p: { x: number; y: number }) => Math.abs(sim.airport.runwayCoordinates(end, p).lateral);
  return lateral(beyond) < lateral(bar.hp.pos);
}

/** The stop bars an aircraft passes on its way onto (or across) the next runway: those its clearance switches off. */
export function stopBarsFor(sim: Simulation, ac: Aircraft): StopBar[] {
  const path = ac.path;
  if (!path) return [];
  const bars = stopBarsOf(sim.airport).filter((bar) => {
    const hpS = path.marker(bar.hp.id)?.s;
    if (hpS === undefined || hpS < ac.s - 1) return false;
    const s = path.marker(bar.id)?.s ?? (distance(path.pointAt(ac.s), bar.node.pos) < 4 ? ac.s : undefined);
    return s !== undefined && s >= ac.s - 1 && s <= hpS && s - ac.s < 600;
  });
  // Only the next runway's bars (the first holding point ahead).
  const first = Math.min(...bars.map((b) => path.marker(b.hp.id)!.s));
  return bars.filter((b) => path.marker(b.hp.id)!.s === first);
}

/**
 * A clearance onto or across the runway: Tower switches the stop bar(s) of the aircraft off - the AI always, you
 * when your stop bars follow your clearances (`stopBarsWithClearance`, the default).
 */
export function clearStopBarsFor(sim: Simulation, ac: Aircraft, byUser: boolean): void {
  if (!stopBarsInOperation(sim) || (byUser && !sim.stopBarsWithClearance)) return;
  for (const bar of stopBarsFor(sim, ac)) if (stopBarLit(sim, bar)) setStopBar(sim, bar.id, false, ac.callsign);
}

/** Per step: bars light again behind their aircraft (it entered the runway) or after the time-out; crews held by a lit bar report it. */
export function updateStopBars(sim: Simulation): void {
  if (!stopBarsInOperation(sim)) {
    sim.stopBarsOff.clear();
    return;
  }
  for (const [id, off] of sim.stopBarsOff) {
    const ac = off.callsign ? sim.find(off.callsign) : undefined;
    const passed = !!ac && (!ac.onGround || ac.phase === 'takeoff' || ac.phase === 'gone' || sim.tower.isInRunwayArea(ac.pos));
    if (passed || sim.time - off.at > STOP_BAR_RELIGHT_S) sim.stopBarsOff.delete(id);
  }
  for (const ac of sim.aircraft) {
    if (!ac.onGround || ac.speed > 0.1 || !ac.path || (ac.phase !== 'taxi' && ac.phase !== 'holding' && ac.phase !== 'lineup')) continue;
    // Cleared onto or across the runway, but held by a lit stop bar: the crew says so once.
    const ahead = litStopBarAhead(sim, ac, 6);
    const cleared = !!ahead && (ac.clearedToCross.has(ahead.bar.runway) || ((ac.lineUpCleared || ac.takeoffCleared) && sim.airport.runwayNameFor(ac.runway ?? '') === ahead.bar.runway));
    if (!ahead || !cleared) {
      ac.stopBarSince = undefined;
      continue;
    }
    ac.stopBarSince ??= sim.time;
    if (sim.time - ac.stopBarSince > STOP_BAR_REPORT_S && ac.stopBarReported !== ahead.bar.id && sim.isOnMyFrequency(ac)) {
      ac.stopBarReported = ahead.bar.id;
      inform(sim, ac, `${sim.tel(ac)}, holding at ${ahead.bar.hp.holdingPoint!.name}, stop bar still lit`);
    }
  }
}
