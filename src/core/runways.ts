import type { AirportData } from './airport/types';

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
