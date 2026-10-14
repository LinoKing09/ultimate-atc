/**
 * Speed profile on final approach.
 *
 * Arrivals do not fly the whole final at their final approach speed (Vapp). As Approach usually
 * instructs it, they intercept at about 180 kt, reduce to 160 kt from about 7-8 NM and keep it
 * until 4 NM ("160 knots until 4 miles"), then slow down to Vapp with gear and landing flaps -
 * stabilised at about 1000 ft above the runway (3 NM). The leader slowing down in front of a
 * follower that is still faster compresses the spacing on final, so Approach spaces arrivals by
 * time: the spacing it needs applies when the leader crosses the threshold.
 *
 * Pure functions (no DOM, no randomness): the per-flight variation comes from the caller.
 */

/** Speed reduction rates in kt per second (clean / intermediate, and with gear and landing flaps). */
export const DECEL_KT_S = 0.75;
export const FINAL_DECEL_KT_S = 1;
/** Crews want to be at their final approach speed by this distance (about 800 ft above the runway). */
export const STABILISED_NM = 2.5;
/** Acceleration when an instruction asks for more speed. */
export const ACCEL_KT_S = 1;
/** Approach's standard speed on final and the distance it applies until. */
export const STANDARD_FINAL_KT = 160;
export const STANDARD_UNTIL_NM = 4;
/** Intercept speed (with variation ±10 kt) and the distance where the reduction to 160 kt begins (7-8.5 NM). */
export const INTERCEPT_KT = 180;
export const REDUCE_MIN_NM = 7;
export const REDUCE_MAX_NM = 8.5;

export interface ApproachProfile {
  /** Speed on the intercept and the first part of final. */
  interceptKt: number;
  /** Below this distance the aircraft reduces to `finalKt`. */
  reduceAtNm: number;
  /** Speed until `untilNm` (Approach's standard 160 kt). */
  finalKt: number;
  untilNm: number;
  /** Final approach speed (Vapp), flown from `untilNm` to the threshold. */
  vappKt: number;
}

export interface SpeedRestriction {
  kt: number;
  untilNm: number;
}

/**
 * The profile of one flight. `v1`, `v2` in [0, 1) vary the intercept speed and where the reduction
 * starts; every value stays above the aircraft's Vapp.
 */
export function approachProfile(vappKt: number, v1 = 0.5, v2 = 0.5): ApproachProfile {
  const finalKt = Math.max(STANDARD_FINAL_KT, vappKt);
  const interceptKt = Math.max(finalKt, Math.round(INTERCEPT_KT - 10 + 20 * v1));
  return { interceptKt, reduceAtNm: REDUCE_MIN_NM + (REDUCE_MAX_NM - REDUCE_MIN_NM) * v2, finalKt, untilNm: STANDARD_UNTIL_NM, vappKt };
}

/** Target speed at `distNm` from the threshold; an instruction overrides the profile until its distance. */
export function targetSpeedKt(p: ApproachProfile, distNm: number, r?: SpeedRestriction): number {
  if (r) return distNm > r.untilNm ? r.kt : p.vappKt;
  if (distNm > p.reduceAtNm) return p.interceptKt;
  if (distNm > p.untilNm) return p.finalKt;
  return p.vappKt;
}

/** Distance in NM a reduction from `fromKt` to `toKt` takes with gear and landing flaps. */
export function finalReductionNm(fromKt: number, toKt: number): number {
  if (fromKt <= toKt) return 0;
  return (((fromKt - toKt) / FINAL_DECEL_KT_S) * ((fromKt + toKt) / 2)) / 3600;
}

/** One speed step of `dt` seconds towards the target (all in kt). */
export function stepSpeedKt(speedKt: number, targetKt: number, distNm: number, p: ApproachProfile, dt: number): number {
  if (speedKt < targetKt) return Math.min(targetKt, speedKt + ACCEL_KT_S * dt);
  const decel = distNm <= p.untilNm + 0.5 ? FINAL_DECEL_KT_S : DECEL_KT_S;
  return Math.max(targetKt, speedKt - decel * dt);
}

/**
 * Seconds to fly from `fromNm` to `toNm` (closer to the threshold) starting at `speedKt`. Exact for the
 * piecewise profile: constant targets between the profile distances, speed changes at constant rates.
 */
export function timeOnFinalS(p: ApproachProfile, fromNm: number, toNm: number, speedKt: number, r?: SpeedRestriction): number {
  const marks = (r ? [r.untilNm] : [p.reduceAtNm, p.untilNm]).concat(p.untilNm + 0.5);
  let d = fromNm;
  let v = Math.max(1, speedKt) / 3600; // NM per second
  let t = 0;
  for (let guard = 0; d > toNm + 1e-9 && guard < 16; guard++) {
    const target = targetSpeedKt(p, d, r) / 3600;
    const next = Math.max(toNm, ...marks.filter((m) => m < d - 1e-9));
    const span = d - next;
    if (Math.abs(v - target) < 1e-9) {
      t += span / v;
    } else {
      const a = (v < target ? ACCEL_KT_S : d <= p.untilNm + 0.5 + 1e-9 ? FINAL_DECEL_KT_S : DECEL_KT_S) / 3600;
      const change = Math.abs(target - v) / a;
      const changeDist = ((v + target) / 2) * change;
      if (changeDist >= span) {
        const vb = Math.sqrt(Math.max(0, v * v + (v < target ? 2 : -2) * a * span));
        t += Math.abs(vb - v) / a;
        v = vb;
      } else {
        t += change + (span - changeDist) / target;
        v = target;
      }
    }
    d = next;
  }
  return t;
}
