/**
 * Saved sessions. The simulation is deterministic: it runs in fixed steps from its seed, and everything else
 * comes from the controller. So a session is saved as its start configuration plus the log of what the
 * controller did (each action with the step it happened at), and restored by running the simulation again
 * from the start and repeating every action at its step - no aircraft, routes or radio queues are stored.
 */
import type { AirportData } from './airport/types';
import { acknowledgeCatc, catcAlert } from './conflicts';
import { sendDcl } from './delivery';
import type { ScenarioSetup } from './scenario';
import { HANDOVER_S, Simulation, type AtisChange, type SimConfig, type TransmitResult } from './simulation';
import type { SystemId } from './systems';
import type { StationType } from './airport/types';
import type { Density } from './levels';

/** Everything the controller can do to the simulation (the UI only changes it through these). */
export type SessionAction =
  | { k: 'transmit'; text: string; selected?: string; fallback?: boolean }
  | { k: 'atis'; change: AtisChange }
  | { k: 'system'; id: SystemId; on: boolean }
  | { k: 'station'; type: StationType; on: boolean }
  | { k: 'addStation'; type: StationType }
  | { k: 'flow'; kind: 'arrivals' | 'departures'; stop: boolean }
  | { k: 'askIntersections'; on: boolean }
  | { k: 'sendIntersections'; on: boolean }
  | { k: 'handoff'; callsign: string }
  | { k: 'dcl'; callsign: string; sid: string; squawk: string }
  | { k: 'catcAck'; callsign: string }
  | { k: 'density'; density: Density }
  | { k: 'eventLevel'; level: number };

/** What an action returns to the UI: a transmission's result, or an error text. */
export type ActionResult = TransmitResult | string | undefined;

/** Does an action and logs it with the current step, so that a saved session repeats it. */
export function perform(sim: Simulation, a: SessionAction): ActionResult {
  sim.actionLog.push([sim.steps, a]);
  return apply(sim, a);
}

function apply(sim: Simulation, a: SessionAction): ActionResult {
  switch (a.k) {
    case 'transmit':
      return sim.transmit(a.text, a.selected, { fallbackToLastCaller: a.fallback });
    case 'atis':
      sim.updateAtis(a.change);
      return undefined;
    case 'system':
      sim.setSystem(a.id, a.on);
      return undefined;
    case 'station':
      return sim.setStationActive(a.type, a.on);
    case 'addStation':
      return sim.addStation(a.type);
    case 'flow':
      return sim.setFlow(a.kind, a.stop);
    case 'askIntersections':
      return sim.setAskIntersections(a.on);
    case 'sendIntersections':
      return sim.setSendIntersections(a.on);
    case 'handoff': {
      const ac = sim.find(a.callsign);
      return ac ? sim.requestHandoff(ac) : undefined;
    }
    case 'dcl': {
      const ac = sim.find(a.callsign);
      return ac ? sendDcl(sim, ac, a.sid, a.squawk) : undefined;
    }
    case 'catcAck': {
      const ac = sim.find(a.callsign);
      const alert = ac && catcAlert(sim, ac);
      if (ac && alert && acknowledgeCatc(sim, ac)) sim.system(`CATC alert ${alert.a.callsign} / ${alert.b.callsign} acknowledged.`, 'system', ac.callsign);
      return undefined;
    }
    case 'density':
      sim.config.density = a.density;
      return undefined;
    case 'eventLevel':
      sim.config.eventLevel = a.level;
      return undefined;
  }
}

/** Format version of saved sessions; older ones are not loaded. */
export const SESSION_VERSION = 1;

export interface SavedSession {
  version: number;
  /** Unique id (a slot in the browser's storage). */
  id: string;
  name: string;
  /** When it was saved (ISO time, real world). */
  savedAt: string;
  /** Airport ICAO code. */
  airport: string;
  config: {
    position: StationType;
    positions?: StationType[];
    runway?: string;
    density: Density;
    events?: boolean;
    eventLevel?: number;
    start?: 'empty' | 'handover';
    seed: number;
    /** Start of the session (Unix ms) as passed to the simulation. */
    startTime: number;
    scenario?: ScenarioSetup;
  };
  /** Steps run when saved. */
  steps: number;
  actions: [number, SessionAction][];
  /** Your time on position when saved (seconds, real time, without pauses) - kept by the UI. */
  controlSeconds: number;
  /** For the list: simulation time (UTC "hh:mm"), score, positions. */
  summary: { utc: string; score: number; positions: string };
  /** Checks the restored session against the saved one. */
  fingerprint: string;
}

/** A short check value of the state that matters: time, score, the aircraft and their phases. */
export function fingerprint(sim: Simulation): string {
  const text = `${sim.steps}|${sim.stats.score}|${sim.aircraft.map((a) => `${a.callsign}:${a.phase}:${Math.round(a.pos.x)}:${Math.round(a.pos.y)}`).join(',')}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/** The session as it can be saved now. */
export function saveSession(sim: Simulation, name: string, controlSeconds: number, now = new Date()): SavedSession {
  const c = sim.startConfig;
  const utc = sim.utc();
  const positions = sim.loggedInStations.map((t) => sim.airport.station(t)?.callsign ?? t).join(' + ');
  return {
    version: SESSION_VERSION,
    id: `${now.getTime().toString(36)}-${sim.seed.toString(36)}`,
    name,
    savedAt: now.toISOString(),
    airport: c.airport.icao,
    config: {
      position: c.position,
      positions: c.positions,
      runway: c.runway,
      density: c.density,
      events: c.events,
      eventLevel: c.eventLevel,
      start: c.start,
      seed: sim.seed,
      // The simulation shifts its clock back for a 'handover' start: undo that to get what was passed in.
      startTime: sim.startEpochMs + (c.start === 'handover' ? HANDOVER_S * 1000 : 0),
      scenario: c.scenario,
    },
    steps: sim.steps,
    actions: sim.actionLog.map(([s, a]) => [s, a]),
    controlSeconds: Math.round(controlSeconds),
    summary: { utc: `${String(utc.getUTCHours()).padStart(2, '0')}:${String(utc.getUTCMinutes()).padStart(2, '0')}`, score: sim.stats.score, positions },
    fingerprint: fingerprint(sim),
  };
}

/**
 * Rebuilds a saved session: a new simulation from the same start, every action repeated at its step.
 * `progress` is called now and then (0..1) and may pause (await) so a browser stays responsive.
 * `matches` is false if the result differs from what was saved (it can still be used).
 */
export async function restoreSession(
  saved: SavedSession,
  airports: AirportData[],
  progress?: (done: number) => Promise<void> | void,
): Promise<{ sim: Simulation; matches: boolean }> {
  if (saved.version !== SESSION_VERSION) throw new Error('This session was saved by another version of Ultimate ATC.');
  const airport = airports.find((a) => a.icao === saved.airport);
  if (!airport) throw new Error(`Unknown airport ${saved.airport}.`);
  const c = saved.config;
  const config: SimConfig = { ...c, airport, startTime: new Date(c.startTime) };
  const sim = new Simulation(config);
  const CHUNK = 2000;
  const runTo = async (step: number) => {
    while (sim.steps < step) {
      sim.runSteps(Math.min(CHUNK, step - sim.steps));
      await progress?.(sim.steps / Math.max(1, saved.steps));
    }
  };
  for (const [step, action] of saved.actions) {
    await runTo(step);
    perform(sim, action);
  }
  await runTo(saved.steps);
  return { sim, matches: fingerprint(sim) === saved.fingerprint };
}
