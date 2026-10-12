/**
 * The steps of the traffic sliders (Connect dialog, settings, scenario
 * builder): density, traffic mix, share of heavies, special events. Each has
 * five steps; the scenario code stores the step (see scenario.ts).
 */

export type Density = 'light' | 'light-medium' | 'medium' | 'medium-heavy' | 'heavy';

export const DENSITIES: { value: Density; label: string; departures: number; arrivals: number }[] = [
  { value: 'light', label: 'Light', departures: 8, arrivals: 7 },
  { value: 'light-medium', label: 'Light to medium', departures: 11, arrivals: 10 },
  { value: 'medium', label: 'Medium', departures: 14, arrivals: 12 },
  { value: 'medium-heavy', label: 'Medium to heavy', departures: 18, arrivals: 15 },
  { value: 'heavy', label: 'Heavy', departures: 22, arrivals: 18 },
];

export type TrafficMix = 'departures' | 'more-departures' | 'balanced' | 'more-arrivals' | 'arrivals';

/** Traffic mix: factors on the departure and arrival rates of the density. */
export const MIXES: { value: TrafficMix; label: string; departures: number; arrivals: number }[] = [
  { value: 'departures', label: 'Departure rush', departures: 1.6, arrivals: 0.5 },
  { value: 'more-departures', label: 'More departures', departures: 1.3, arrivals: 0.75 },
  { value: 'balanced', label: 'Balanced', departures: 1, arrivals: 1 },
  { value: 'more-arrivals', label: 'More arrivals', departures: 0.75, arrivals: 1.3 },
  { value: 'arrivals', label: 'Arrival rush', departures: 0.5, arrivals: 1.6 },
];

/** Share of heavies: chance that a new flight is a wide-body, on top of the operators' own fleets (step 0). */
export const HEAVY_SHARES: { share: number; label: string }[] = [
  { share: 0, label: 'Normal (fleets of the operators)' },
  { share: 0.1, label: '10 % wide-bodies' },
  { share: 0.2, label: '20 % wide-bodies' },
  { share: 0.35, label: '35 % wide-bodies' },
  { share: 0.5, label: '50 % wide-bodies' },
];

/** Random special events: factor on their chances (step 2 = the standard "rare" rates). */
export const EVENT_LEVELS: { factor: number; label: string }[] = [
  { factor: 0, label: 'Never' },
  { factor: 0.5, label: 'Very rare' },
  { factor: 1, label: 'Rare' },
  { factor: 2, label: 'Occasional' },
  { factor: 4, label: 'Often' },
];

/** Default event step (the standard rates). */
export const DEFAULT_EVENT_LEVEL = 2;

export const densityIndex = (d: Density): number => Math.max(0, DENSITIES.findIndex((x) => x.value === d));
export const mixIndex = (m: TrafficMix): number => Math.max(0, MIXES.findIndex((x) => x.value === m));

/** Keeps a step number in 0-4. */
export function clampLevel(n: number): number {
  return Math.max(0, Math.min(4, Math.round(Number.isFinite(n) ? n : 0)));
}
