import type { Airport } from './airport/airport';
import type { AirportData, ParallelApproachMode } from './airport/types';

// Runway keys ("26R+26L": parallel runways in use together) and runway designators in words.

/** The runway ends of a runway key: "26R+26L" -> ["26R", "26L"]. */
export function runwayEndsOf(key: string): string[] {
  return key.toUpperCase().split('+').filter(Boolean);
}

/** "runway 25", "runways 26R and 26L". */
export function runwayWords(ends: string[]): string {
  if (ends.length === 1) return `runway ${ends[0]}`;
  return `runways ${ends.slice(0, -1).join(', ')} and ${ends[ends.length - 1]}`;
}

/** A runway designator the US way, without a leading zero: "09" -> "9", "09/27" -> "9/27". */
export function usRunway(name: string): string {
  return name.replace(/(^|\/)0(\d)/g, '$1$2');
}

/** First letter upper case. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The runway choices of an airport for the ATIS and the scenario builder: the parallel runways used together
 * ("26R+26L") first, then every single runway end.
 */
export function runwayChoices(airport: AirportData): { key: string; label: string }[] {
  const sets = (airport.parallelRunways ?? []).map((p) => ({ key: p.ends.join('+'), label: `Runways ${p.ends.join(' + ')}` }));
  return [...sets, ...airport.runwayOps.map((o) => ({ key: o.runway, label: `Runway ${o.runway}` }))];
}

/** The runway key an airport uses by default for a runway end: its parallel runways where it has them. */
export function defaultRunwayKey(airport: AirportData, end: string): string {
  const set = airport.parallelRunways?.find((p) => p.ends.includes(end));
  return set ? set.ends.join('+') : end;
}

/** What a runway end in use is used for: take-offs and landings (mixed), or only one of them. */
export type RunwayRole = 'mixed' | 'arrivals' | 'departures';

/**
 * How the parallel runways in use share the traffic (set with the ATIS): the role of each runway end, and the
 * separation between arrivals on adjacent finals when more than one runway takes arrivals.
 */
export interface ParallelUse {
  /** Role of each runway end in use; an end not listed is mixed. */
  roles: Record<string, RunwayRole>;
  approaches: ParallelApproachMode;
}

/**
 * Smallest distance between the runway centre lines (m) for each approach mode (ICAO Annex 14 / Doc 9643):
 * independent parallel approaches 1035 m, dependent 915 m; staggered approaches (3 NM radar separation between
 * the finals) have no minimum.
 */
export const PARALLEL_APPROACH_MIN_SPACING_M: Record<ParallelApproachMode, number> = { independent: 1035, dependent: 915, staggered: 0 };

/** The role of a runway end (mixed where no parallel use says otherwise). */
export function roleOf(use: ParallelUse | undefined, end: string): RunwayRole {
  return use?.roles[end.toUpperCase()] ?? 'mixed';
}

/** The runway ends in use that take arrivals / departures. */
export function arrivalEnds(ends: string[], use: ParallelUse | undefined): string[] {
  return ends.filter((e) => roleOf(use, e) !== 'departures');
}
export function departureEnds(ends: string[], use: ParallelUse | undefined): string[] {
  return ends.filter((e) => roleOf(use, e) !== 'arrivals');
}

/** Distance between the centre lines of two parallel runway ends (m). */
export function centrelineSpacingM(airport: Airport, a: string, b: string): number {
  const ea = airport.runwayEnd(a);
  const eb = airport.runwayEnd(b);
  return ea && eb ? Math.abs(airport.runwayCoordinates(ea, eb.threshold).lateral) : 0;
}

/** The approach modes the runway spacing allows for these runway ends (ICAO minima, see above). */
export function allowedApproachModes(airport: Airport, ends: string[]): ParallelApproachMode[] {
  let spacing = Infinity;
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) spacing = Math.min(spacing, centrelineSpacingM(airport, ends[i], ends[j]));
  return (['independent', 'dependent', 'staggered'] as ParallelApproachMode[]).filter((m) => spacing >= PARALLEL_APPROACH_MIN_SPACING_M[m]);
}

/**
 * The ways two parallel runways can share the traffic, for the ATIS editor: both mixed, segregated (one for
 * arrivals, the other for departures) and semi-mixed (one mixed, the other for departures only), each way round.
 */
export function parallelRoleChoices(ends: string[]): { label: string; roles: Record<string, RunwayRole> }[] {
  if (ends.length !== 2) return [{ label: 'Mixed (take-offs and landings on every runway)', roles: {} }];
  const [a, b] = ends;
  return [
    { label: `Mixed: take-offs and landings on ${a} and ${b}`, roles: {} },
    { label: `Segregated: landings ${a}, take-offs ${b}`, roles: { [a]: 'arrivals', [b]: 'departures' } },
    { label: `Segregated: landings ${b}, take-offs ${a}`, roles: { [a]: 'departures', [b]: 'arrivals' } },
    { label: `Semi-mixed: ${a} mixed, take-offs only ${b}`, roles: { [b]: 'departures' } },
    { label: `Semi-mixed: ${b} mixed, take-offs only ${a}`, roles: { [a]: 'departures' } },
  ];
}

/** The same roles (ends not listed are mixed). */
export function sameRoles(a: Record<string, RunwayRole>, b: Record<string, RunwayRole>, ends: string[]): boolean {
  return ends.every((e) => (a[e] ?? 'mixed') === (b[e] ?? 'mixed'));
}

/**
 * Arrival and departure runways in ATIS words: "runways 26R and 26L in use" (all mixed), else "arrival runway
 * 26R, departure runway 26L" / "arrival runway 26R, departure runways 26R and 26L".
 */
export function runwayUseWords(ends: string[], use: ParallelUse | undefined): string {
  const arr = arrivalEnds(ends, use);
  const dep = departureEnds(ends, use);
  if (arr.length === ends.length && dep.length === ends.length) return ends.length > 1 ? `${runwayWords(ends)} in use` : `runway in use ${ends[0]}`;
  return `arrival ${runwayWords(arr)}, departure ${runwayWords(dep)}`;
}
