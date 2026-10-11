import { SCENARIO_EVENT_TEXT } from './scenario';
import type { Simulation } from './simulation';

/** Surface wind. `gustKt`: peak gusts (only when they are reported). */
export interface Wind {
  direction: number;
  speedKt: number;
  gustKt?: number;
}

/** "250/12KT", "070/18G32KT" (`spaced`: "250/12 KT"). */
export function formatWind(w: Wind, spaced = false): string {
  return `${String(w.direction).padStart(3, '0')}/${String(w.speedKt).padStart(2, '0')}${w.gustKt ? `G${w.gustKt}` : ''}${spaced ? ' KT' : 'KT'}`;
}

/** "250 degrees 12 knots", "070 degrees 18 knots gusting 32 knots", "calm". */
export function windWords(w: Wind): string {
  if (w.speedKt === 0) return 'calm';
  return `${String(w.direction).padStart(3, '0')} degrees ${w.speedKt} knots${w.gustKt ? ` gusting ${w.gustKt} knots` : ''}`;
}

/**
 * Thunderstorm (scenario event "S"). A storm cell crosses the airport:
 *
 * 1. Warning (5 min): MET warns of the cell; the wind starts to gust,
 *    Approach widens the spacing on final (fewer arrivals).
 * 2. Overhead (15 min): the gust front turns the wind into a strong, gusty
 *    tailwind on the runway in use. Lightning stops the ground handling (no
 *    pushbacks) and crews do not take off. On final, crews go around in
 *    windshear (about 4 in 10) and always with more than 10 kt tailwind - a
 *    runway change helps with the second, not with the first.
 * 3. Passed: the wind settles from the new direction (often the other runway
 *    is now better), departures resume.
 *
 * Weather go-arounds do not count against the controller.
 */
export type StormPhase = 'warning' | 'overhead';

export interface StormState {
  phase: StormPhase;
  /** Simulation time the phase ends. */
  until: number;
  /** Number of the storm in this session (for the variations). */
  n: number;
}

export const STORM_WARNING_S = 5 * 60;
export const STORM_OVERHEAD_S = 15 * 60;
/** Share of arrivals that go around in windshear while the storm is overhead. */
export const WINDSHEAR_GO_AROUND_SHARE = 0.4;
/** Crews do not land with more tailwind than this (knots). */
export const TAILWIND_LIMIT_KT = 10;
/** Distance from the threshold at which the crew decides to continue or go around (NM). */
export const WEATHER_DECISION_NM = 1;
/** Minimum spacing Approach gives on final during the storm (NM). */
export const STORM_ARRIVAL_SPACING_NM = 8;
/** Arrival rate during the storm, as a share of the normal rate. */
export const STORM_ARRIVAL_RATE = 0.5;

const storms = new WeakMap<Simulation, number>();

/** Starts a thunderstorm. Returns false while another one is still active (the event is retried later). */
export function startThunderstorm(sim: Simulation): boolean {
  if (sim.storm) return false;
  const n = (storms.get(sim) ?? 0) + 1;
  storms.set(sim, n);
  const v = (k: string) => sim.variation(`storm${n}:${k}`);
  const w = sim.observedWind;
  sim.storm = { phase: 'warning', until: sim.time + STORM_WARNING_S, n };
  const speed = Math.max(8, w.speedKt + 4);
  sim.observedWind = { direction: w.direction, speedKt: speed, gustKt: speed + 10 + Math.round(6 * v('gw')) };
  sim.system(
    `${SCENARIO_EVENT_TEXT.thunderstorm}: thunderstorm approaching the airport, overhead in about ${STORM_WARNING_S / 60} minutes for about ${STORM_OVERHEAD_S / 60} minutes. ` +
      `Expect a gust front with a wind shift, windshear on final and a stop of ground handling (lightning). Approach increases the spacing on final.`,
    'warning',
  );
  return true;
}

/** Advances an active thunderstorm. */
export function updateWeather(sim: Simulation): void {
  const s = sim.storm;
  if (!s || sim.time < s.until) return;
  const v = (k: string) => sim.variation(`storm${s.n}:${k}`);
  if (s.phase === 'warning') {
    // Gust front: the wind turns to blow along the runway in use from behind (tailwind).
    const end = sim.airport.runwayEnd(sim.runway)!;
    const magHeading = end.heading - sim.config.airport.magneticVariation;
    const direction = (Math.round((magHeading + 180 + 40 * (v('dir') - 0.5)) / 10) * 10 + 360) % 360 || 360;
    const speedKt = 14 + Math.round(6 * v('spd'));
    const wind = { direction, speedKt, gustKt: speedKt + 12 + Math.round(6 * v('gust')) };
    sim.observedWind = wind;
    sim.storm = { phase: 'overhead', until: sim.time + STORM_OVERHEAD_S, n: s.n };
    const tail = -Math.round(sim.windComponents(sim.runway, wind).headwind);
    const best = sim.bestRunwayForWind(wind);
    sim.system(
      `${SCENARIO_EVENT_TEXT.thunderstorm}: thunderstorm overhead, gust front - surface wind ${formatWind(wind, true)}${tail > 0 ? `, ${tail} kt tailwind on runway ${sim.runway}` : ''}. ` +
        `Lightning: ground handling stopped (no pushbacks), crews will not take off. Windshear on final - expect go-arounds.` +
        `${best !== sim.runway ? ` Consider runway ${best}.` : ''} Broadcast a new ATIS.`,
      'warning',
    );
    return;
  }
  // The storm has passed: the wind settles from the new direction.
  const w = sim.observedWind;
  const wind = { direction: w.direction, speedKt: 6 + Math.round(5 * v('after')) };
  sim.observedWind = wind;
  sim.storm = undefined;
  const best = sim.bestRunwayForWind(wind);
  sim.system(
    `${SCENARIO_EVENT_TEXT.thunderstorm}: the thunderstorm has passed. Ground handling resumes, departures may go again. Surface wind ${formatWind(wind, true)}.` +
      `${best !== sim.runway ? ` Runway ${best} is better now.` : ''} Broadcast a new ATIS.`,
  );
}

/** True while lightning stops the ground handling (no pushbacks). */
export function apronClosed(sim: Simulation): boolean {
  return sim.storm?.phase === 'overhead';
}

/** True while crews refuse to take off. */
export function takeoffsSuspended(sim: Simulation): boolean {
  return sim.storm?.phase === 'overhead';
}

/**
 * Decision of an arrival at the weather decision point while the storm is overhead:
 * 'tailwind' or 'windshear' to go around, undefined to continue.
 */
export function weatherGoAround(sim: Simulation, callsign: string, runway: string): 'tailwind' | 'windshear' | undefined {
  if (sim.storm?.phase !== 'overhead') return undefined;
  const tail = -sim.windComponents(runway, sim.observedWind).headwind;
  if (tail > TAILWIND_LIMIT_KT) return 'tailwind';
  return sim.variation(`${callsign}:windshear:${sim.storm.n}`) < WINDSHEAR_GO_AROUND_SHARE ? 'windshear' : undefined;
}
