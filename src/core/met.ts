import { deicingActive } from './deicing';
import type { Simulation } from './simulation';
import type { Wind } from './weather';

/**
 * Weather observations (METAR) for the ATIS. The weather of a session follows from its seed
 * (`sim.variation`, so it does not shift the random sequence of the traffic): a category (CAVOK,
 * few / scattered, broken, overcast), a temperature from the climate of the month and the time of
 * day, and a QNH that drifts by a hectopascal now and then. A routine METAR is issued at minute 20
 * and 50 of every hour (UTC), a SPECI when a thunderstorm approaches, is overhead or has passed.
 * The surface wind is the simulator's actual wind (`sim.observedWind`).
 */

export type CloudCover = 'FEW' | 'SCT' | 'BKN' | 'OVC';

export interface CloudLayer {
  cover: CloudCover;
  baseFt: number;
  /** Cumulonimbus. */
  cb?: boolean;
}

export interface Metar {
  /** Simulation time of the observation (may be before the session start). */
  at: number;
  /** Observation time "ddhhmm" (UTC). */
  time: string;
  speci: boolean;
  wind: Wind;
  /** Prevailing visibility in metres; 9999 = 10 km or more. */
  visibilityM: number;
  /** Present weather, e.g. "-RA", "BR", "TSRA", "VCTS". */
  weather: string[];
  clouds: CloudLayer[];
  tempC: number;
  dewC: number;
  qnh: number;
  /** "NOSIG", "TEMPO TSRA", "BECMG NSW". */
  trend: string;
}

export interface MetState {
  /** The latest observation. */
  metar: Metar;
  /** Number of the next routine observation. */
  next: number;
  /** Simulation time of the next routine observation. */
  nextAt: number;
  /** Base of the main cloud layer (ft), drifting from one observation to the next. */
  baseFt: number;
  /** End of the rain after a thunderstorm (simulation time; -Infinity: none). */
  rainUntil: number;
}

/** Interval of the routine observations (s). */
export const METAR_INTERVAL_S = 30 * 60;
/** Default climate (Central Europe): mean temperature of each month (degrees C), January first. */
const MONTHLY_MEAN_C = [1, 2, 5, 9, 14, 17, 19, 19, 15, 10, 5, 2];
/** Half the daily temperature range of each month under a clear sky. */
const DIURNAL_AMPLITUDE_C = [3, 3.5, 4.5, 5.5, 6, 6, 6, 6, 5, 4, 3, 3];

type Category = 'cavok' | 'few' | 'bkn' | 'ovc';

/** The weather category of the session: 30 % CAVOK, 30 % few / scattered, 25 % broken, 15 % overcast. */
function category(sim: Simulation): Category {
  if (deicingActive(sim)) return 'ovc';
  const v = sim.variation('met:cat');
  return v < 0.3 ? 'cavok' : v < 0.6 ? 'few' : v < 0.85 ? 'bkn' : 'ovc';
}

/** Lowest and highest base of the main cloud layer of a category (ft). */
const BASE_BAND: Record<Category, [number, number]> = { cavok: [5000, 9000], few: [2500, 5500], bkn: [1500, 4500], ovc: [600, 1600] };

function temperature(sim: Simulation, t: number, cat: Category): { tempC: number; dewC: number } {
  const month = new Date(sim.utc().getTime() + (t - sim.time) * 1000).getUTCMonth();
  if (deicingActive(sim)) {
    const tempC = Math.round(-3 + 4 * sim.variation('met:frost'));
    return { tempC, dewC: tempC - 1 };
  }
  const mean = (sim.config.airport.climate?.monthlyMeanC ?? MONTHLY_MEAN_C)[month] + 6 * (sim.variation('met:temp') - 0.5);
  const damping = cat === 'ovc' ? 0.4 : cat === 'bkn' ? 0.7 : 1;
  const hour = sim.localMinutes(t) / 60;
  const tempC = Math.round(mean + DIURNAL_AMPLITUDE_C[month] * damping * Math.cos((2 * Math.PI * (hour - 15)) / 24));
  // Dew point spread: small under a low overcast, larger in the afternoon.
  const spread0 = cat === 'ovc' ? 1 : cat === 'bkn' ? 3 : cat === 'few' ? 5 : 6;
  const spread = Math.max(0, Math.round(spread0 + 3 * sim.variation('met:spread') + (cat === 'ovc' ? 0 : 2 * Math.cos((2 * Math.PI * (hour - 15)) / 24))));
  return { tempC, dewC: tempC - spread };
}

/** "211220" for a simulation time. */
function obsTime(sim: Simulation, t: number): string {
  const d = new Date(sim.utc().getTime() + (t - sim.time) * 1000);
  return [d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()].map((n) => String(n).padStart(2, '0')).join('');
}

/** The METAR wind: the actual wind, direction to 10 degrees. */
function metarWindOf(w: Wind): Wind {
  if (w.speedKt === 0) return { direction: 0, speedKt: 0 };
  return { direction: (Math.round(w.direction / 10) * 10) % 360 || 360, speedKt: w.speedKt, ...(w.gustKt ? { gustKt: w.gustKt } : {}) };
}

/** An observation at simulation time `t` with the drifting state `s` (QNH of the previous one). */
function observe(sim: Simulation, t: number, qnh: number, baseFt: number, speci: boolean, rainUntil: number): Metar {
  const cat = category(sim);
  const v = (k: string) => sim.variation(`met:${k}:${Math.round(t)}`);
  let { tempC, dewC } = temperature(sim, t, cat);
  let visibilityM = 9999;
  const weather: string[] = [];
  const clouds: CloudLayer[] = [];
  let trend = 'NOSIG';
  const precipitation = (light: boolean) => (tempC <= 1 ? (light ? '-SN' : 'SN') : light ? '-RA' : 'RA');
  if (cat === 'few' || cat === 'cavok') {
    clouds.push({ cover: v('cover') < 0.6 ? 'FEW' : 'SCT', baseFt });
  } else if (cat === 'bkn') {
    if (sim.variation('met:scat') < 0.5) clouds.push({ cover: 'SCT', baseFt: Math.max(1000, baseFt - 1000) });
    clouds.push({ cover: 'BKN', baseFt });
    if (sim.variation('met:rain') < 0.4) {
      weather.push(precipitation(true));
      visibilityM = 6000 + 1000 * Math.floor(4 * v('vis'));
    }
  } else {
    clouds.push({ cover: 'OVC', baseFt });
    visibilityM = 3000 + 500 * Math.floor(7 * v('vis'));
    weather.push(deicingActive(sim) ? (sim.variation('met:snow') < 0.6 ? '-SN' : 'BR') : sim.variation('met:rain') < 0.5 ? precipitation(true) : 'BR');
  }
  // Thunderstorm (scenario event): approaching, overhead, then rain for a while.
  const storm = sim.storm;
  if (storm?.phase === 'warning') {
    weather.unshift('VCTS');
    clouds.push({ cover: 'FEW', baseFt: 4000, cb: true });
    trend = 'TEMPO TSRA';
  } else if (storm?.phase === 'overhead') {
    weather.length = 0;
    weather.push('TSRA');
    visibilityM = Math.min(visibilityM, 4000);
    clouds.length = 0;
    clouds.push({ cover: 'SCT', baseFt: 1500 }, { cover: 'BKN', baseFt: 2500, cb: true });
    tempC -= 4;
    dewC = Math.min(dewC, tempC - 1);
    trend = 'BECMG NSW';
  } else if (t < rainUntil) {
    if (!weather.some((w) => /RA|SN/.test(w))) weather.push(precipitation(true));
    visibilityM = Math.min(visibilityM, 8000);
    tempC -= 3;
    dewC = Math.min(dewC, tempC - 1);
  }
  clouds.sort((a, b) => a.baseFt - b.baseFt);
  return { at: t, time: obsTime(sim, t), speci, wind: metarWindOf(sim.observedWind), visibilityM, weather, clouds, tempC, dewC, qnh, trend };
}

/** The weather at the session start: the last routine observation before it (minute 20 or 50 UTC). */
export function initialMet(sim: Simulation, qnh: number): MetState {
  const cat = category(sim);
  const [lo, hi] = BASE_BAND[cat];
  const baseFt = Math.round((lo + (hi - lo) * sim.variation('met:base')) / 100) * 100;
  const minute = sim.utc().getUTCMinutes() + sim.utc().getUTCSeconds() / 60;
  const since = ((minute - 20 + 60) % 30) * 60;
  const at = -since;
  return { metar: observe(sim, at, qnh, baseFt, false, -Infinity), next: 1, nextAt: at + METAR_INTERVAL_S, baseFt, rainUntil: -Infinity };
}

/** Issues the routine observation when it is due and tells the controller when the ATIS no longer matches. */
export function updateMet(sim: Simulation): void {
  const m = sim.met;
  if (sim.time < m.nextAt) return;
  const n = m.next;
  const [lo, hi] = BASE_BAND[category(sim)];
  // The QNH drifts the way the pressure of the session goes (rising or falling): one hectopascal in about one
  // observation of four, now and then one back.
  const trend = sim.variation('met:qnhTrend') < 0.5 ? -1 : 1;
  const q = sim.variation(`met:qnh:${n}`);
  const qnh = m.metar.qnh + (q < 0.25 ? trend : q > 0.95 ? -trend : 0);
  m.baseFt = Math.min(hi, Math.max(lo, m.baseFt + 100 * Math.round(6 * (sim.variation(`met:drift:${n}`) - 0.5))));
  m.metar = observe(sim, m.nextAt, qnh, m.baseFt, false, m.rainUntil);
  m.next = n + 1;
  m.nextAt += METAR_INTERVAL_S;
  announce(sim);
}

/** A special observation (thunderstorm phases). */
export function issueSpeci(sim: Simulation): void {
  const m = sim.met;
  if (!sim.storm && m.metar.weather.includes('TSRA')) m.rainUntil = sim.time + 20 * 60;
  m.metar = observe(sim, sim.time, m.metar.qnh, m.baseFt, true, m.rainUntil);
  announce(sim);
}

function announce(sim: Simulation): void {
  const diff = atisDifferences(sim);
  sim.system(
    `${formatMetar(sim, sim.met.metar)}${diff.length ? ` - differs from information ${sim.atisLetter} (${diff.join(', ')}): broadcast a new ATIS.` : ''}`,
    'system',
  );
}

// ------------------------------------------------------------------ comparison with the ATIS

/** The ceiling (lowest broken or overcast layer, ft) or undefined. */
function ceiling(m: Metar): number | undefined {
  return m.clouds.find((c) => c.cover === 'BKN' || c.cover === 'OVC')?.baseFt;
}

/**
 * What the latest METAR says differently from the ATIS that is broadcast: the QNH, a wind change
 * (30 degrees at 10 kt or more, 5 kt, gusts), visibility, present weather or ceiling. Empty: the
 * ATIS is up to date.
 */
export function atisDifferences(sim: Simulation): string[] {
  const m = sim.met.metar;
  const a = sim.atis;
  const out: string[] = [];
  if (m.qnh !== a.qnh) out.push(`QNH ${m.qnh}`);
  const w = m.wind;
  const dirDiff = Math.abs(((w.direction - a.wind.direction + 540) % 360) - 180);
  if ((dirDiff >= 30 && Math.max(w.speedKt, a.wind.speedKt) >= 10) || Math.abs(w.speedKt - a.wind.speedKt) >= 5 || Math.abs((w.gustKt ?? 0) - (a.wind.gustKt ?? 0)) >= 10) {
    out.push(`wind ${metarWind(w)}`);
  }
  const old = a.metar;
  if ((m.visibilityM < 5000) !== (old.visibilityM < 5000) || Math.abs(m.visibilityM - old.visibilityM) >= 3000) out.push(`visibility ${visibilityText(m.visibilityM)}`);
  if (m.weather.join(' ') !== old.weather.join(' ')) out.push(m.weather.length ? m.weather.join(' ') : 'no weather');
  const c = ceiling(m);
  const co = ceiling(old);
  if ((c === undefined) !== (co === undefined) || (c !== undefined && co !== undefined && Math.abs(c - co) >= 500)) out.push(c === undefined ? 'no ceiling' : `ceiling ${c} ft`);
  return out;
}

// ------------------------------------------------------------------ formats

/** "25008KT", "25018G32KT", "00000KT". */
export function metarWind(w: Wind): string {
  return `${String(w.direction).padStart(3, '0')}${String(w.speedKt).padStart(2, '0')}${w.gustKt ? `G${w.gustKt}` : ''}KT`;
}

/** CAVOK: visibility 10 km or more, no cloud below 5000 ft, no cumulonimbus, no weather. */
export function isCavok(m: Metar): boolean {
  return m.visibilityM >= 9999 && !m.weather.length && m.clouds.every((c) => c.baseFt >= 5000 && !c.cb);
}

function visibilityText(m: number): string {
  return m >= 9999 ? '9999' : String(m).padStart(4, '0');
}

/** "FEW035 BKN025CB" or "NSC". */
function cloudGroups(m: Metar): string {
  if (!m.clouds.length) return 'NSC';
  return m.clouds.map((c) => `${c.cover}${String(Math.round(c.baseFt / 100)).padStart(3, '0')}${c.cb ? 'CB' : ''}`).join(' ');
}

const tempGroup = (t: number) => (t < 0 ? `M${String(-t).padStart(2, '0')}` : String(t).padStart(2, '0'));

/** "METAR EDDS 221220Z 25008KT 9999 FEW035 12/06 Q1018 NOSIG". */
export function formatMetar(sim: Simulation, m: Metar): string {
  return `${m.speci ? 'SPECI' : 'METAR'} ${sim.config.airport.icao} ${m.time}Z ${metarWind(m.wind)} ${metMiddle(m)} ${tempGroup(m.tempC)}/${tempGroup(m.dewC)} Q${m.qnh} ${m.trend}`;
}

/** Visibility, weather and clouds: "9999 FEW035", "CAVOK", "4000 TSRA SCT015 BKN025CB". */
function metMiddle(m: Metar): string {
  if (isCavok(m)) return 'CAVOK';
  return [visibilityText(m.visibilityM), ...m.weather, cloudGroups(m)].join(' ');
}

/** The met line of the D-ATIS text: "25008KT 9999 FEW035 T12 DP06 QNH1018" (wind and QNH of the ATIS). */
export function datisMet(m: Metar, wind: Wind, qnh: number): string {
  return `${metarWind(wind)} ${metMiddle(m)} T${tempGroup(m.tempC)} DP${tempGroup(m.dewC)} QNH${qnh}`;
}

const WEATHER_WORDS: Record<string, string> = {
  '-RA': 'light rain', RA: 'moderate rain', '-SN': 'light snow', SN: 'moderate snow', '-DZ': 'light drizzle', BR: 'mist',
  TSRA: 'thunderstorm with rain', VCTS: 'thunderstorm in the vicinity',
};
const COVER_WORDS: Record<CloudCover, string> = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast' };

/** "visibility 10 kilometres, few 3500 feet" / "CAVOK" (spoken ATIS). */
export function metWords(m: Metar): string {
  if (isCavok(m)) return 'CAVOK';
  const vis = m.visibilityM >= 9999 ? 'visibility 10 kilometres or more' : m.visibilityM >= 5000 ? `visibility ${m.visibilityM / 1000} kilometres` : `visibility ${m.visibilityM} metres`;
  const wx = m.weather.map((w) => WEATHER_WORDS[w] ?? w);
  const clouds = m.clouds.length ? m.clouds.map((c) => `${COVER_WORDS[c.cover]} ${c.baseFt} feet${c.cb ? ' cumulonimbus' : ''}`) : ['no significant clouds'];
  return [vis, ...wx, ...clouds].join(', ');
}

/** "temperature 12, dew point 6" ("minus 3"). */
export function temperatureWords(m: Metar): string {
  const t = (x: number) => (x < 0 ? `minus ${-x}` : String(x));
  return `temperature ${t(m.tempC)}, dew point ${t(m.dewC)}`;
}

/** "nosig", "tempo thunderstorm with rain", "becoming no significant weather". */
export function trendWords(trend: string): string {
  if (trend === 'NOSIG') return 'nosig';
  return trend
    .split(' ')
    .map((w) => (w === 'TEMPO' ? 'tempo' : w === 'BECMG' ? 'becoming' : w === 'NSW' ? 'no significant weather' : (WEATHER_WORDS[w] ?? w.toLowerCase())))
    .join(' ');
}
