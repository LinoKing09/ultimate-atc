import type { Simulation, Stats } from './simulation';

/**
 * Points per counted event: the single source of the score (Simulation.updateScore) and of the
 * debriefing after a session. `points` is per event; for `delayPenalty` and `bonus` the stat is
 * already in points.
 */
export const SCORE_TABLE: { key: keyof Stats; label: string; points: number }[] = [
  { key: 'departuresHandedOff', label: 'Departures handed to Tower', points: 10 },
  { key: 'arrivalsParked', label: 'Arrivals parked on their stand', points: 10 },
  { key: 'clearancesDelivered', label: 'IFR clearances delivered', points: 10 },
  { key: 'towsCompleted', label: 'Tows completed', points: 5 },
  { key: 'departuresToRadar', label: 'Departures handed to Radar', points: 10 },
  { key: 'arrivalsToGround', label: 'Arrivals handed to Ground', points: 10 },
  { key: 'readbackErrorsCaught', label: 'Wrong read-backs corrected', points: 5 },
  { key: 'bonus', label: 'Bonus (emergencies handled quickly)', points: 1 },
  { key: 'handoffsMissed', label: 'Departures that left without a frequency change', points: -5 },
  { key: 'separationLosses', label: 'Take-offs with too little spacing', points: -10 },
  { key: 'goAroundsInstructed', label: 'Go-arounds you instructed', points: -5 },
  { key: 'readbackErrorsMissed', label: 'Wrong read-backs not corrected', points: -10 },
  { key: 'slotsMissed', label: 'CTOT slots missed or violated', points: -10 },
  { key: 'sayAgains', label: 'Instructions not understood ("say again")', points: -2 },
  { key: 'delayPenalty', label: 'Slow answers (1 point per 15 s beyond 30 s)', points: -1 },
  { key: 'arrivalStopMinutes', label: 'Minutes Approach held all arrivals for you', points: -2 },
  { key: 'departureStopMinutes', label: 'Minutes Ground held all departures for you', points: -2 },
  { key: 'incursions', label: 'Runway incursions', points: -50 },
  { key: 'collisions', label: 'Collisions', points: -100 },
  { key: 'goArounds', label: 'Go-arounds without your instruction', points: -15 },
];

export function scoreOf(stats: Stats): number {
  return SCORE_TABLE.reduce((sum, row) => sum + (stats[row.key] as number) * row.points, 0);
}

export interface DebriefLine {
  label: string;
  count: number;
  points: number;
}

export interface Debrief {
  /** Simulated session time (seconds). */
  durationS: number;
  positions: string[];
  score: number;
  /** What earned points, largest first. */
  good: DebriefLine[];
  /** What cost points, largest loss first. */
  costs: DebriefLine[];
  answered: number;
  /** Average time pilots waited for an answer (seconds). */
  averageWaitS: number;
  /** The longest waits of the session. */
  longestWaits: { callsign: string; seconds: number }[];
  departuresAirborne: number;
  incidents: { time: number; text: string }[];
  /** Warnings from the system (alerts, missed slots, separation...), oldest first, at most 12. */
  warnings: { time: number; text: string }[];
  /** Advice for the next session. */
  tips: string[];
}

/** Summary of a session for the debriefing: what went well, what cost points, and what to work on. */
export function debrief(sim: Simulation): Debrief {
  const s = sim.stats;
  const lines = SCORE_TABLE.map((row) => ({ label: row.label, count: s[row.key] as number, points: (s[row.key] as number) * row.points })).filter((l) => l.count > 0);
  const good = lines.filter((l) => l.points > 0).sort((a, b) => b.points - a.points);
  const costs = lines.filter((l) => l.points < 0).sort((a, b) => a.points - b.points);
  const averageWaitS = s.answeredRequests ? s.totalWaitSeconds / s.answeredRequests : 0;
  const tips: string[] = [];
  if (averageWaitS > 30 || s.delayPenalty >= 10) tips.push('Answer requests sooner. When you are busy, a quick "standby" or a queue number ("number 2 for pushback") stops the clock; Tab selects the pilot who has waited longest.');
  if (s.sayAgains >= 3) tips.push('Several instructions were not understood. Check the command-line preview before you send: green means the pilot will understand it.');
  if (s.collisions > 0) tips.push('Keep aircraft apart at intersections: hold one short ("hold short of taxiway N") or let one follow the other ("give way to ..."), and use Resolve conflict as soon as two aircraft are routed head-on.');
  if (s.incursions > 0) tips.push('Never clear a crossing or a line-up while an aircraft is landing or taking off; wait for the RMCA alert to stay quiet.');
  if (s.separationLosses > 0) tips.push('Wait for the departure spacing shown in the take-off menu: 2 minutes behind a heavy or a departure on the same SID, 1 minute on diverging SIDs.');
  if (s.goArounds > 0) tips.push('Clear arrivals to land in time: without a landing clearance at short final they go around.');
  if (s.handoffsMissed > 0) tips.push('Hand departures to Radar soon after take-off; they leave your frequency at 4000 ft.');
  if (s.slotsMissed > 0) tips.push('Watch the CTOT column: a departure with a slot must be airborne between CTOT -5 and +10 minutes.');
  if (s.readbackErrorsMissed > 0) tips.push('Listen to the squawk in every clearance read-back and correct a wrong one ("negative, squawk 2312").');
  if (!tips.length) tips.push(s.answeredRequests + s.departuresAirborne > 10 ? 'A clean session. Try heavier traffic, a scenario with special events or a combined position next.' : 'Work a longer session to get a meaningful debriefing.');
  const warnings = sim.messages
    .filter((m) => m.kind === 'warning' && m.from === 'SYSTEM')
    .map((m) => ({ time: m.time, text: m.text }))
    .slice(-12);
  return {
    durationS: sim.time,
    positions: sim.loggedInStations.map((t) => sim.airport.station(t)?.callsign ?? t),
    score: s.score,
    good,
    costs,
    answered: s.answeredRequests,
    averageWaitS,
    longestWaits: [...sim.longestWaits],
    departuresAirborne: s.departuresAirborne,
    incidents: sim.incidents.map((i) => ({ time: i.time, text: i.text })),
    warnings,
    tips,
  };
}
