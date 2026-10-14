import { DENSITIES, MIXES, HEAVY_SHARES, EVENT_LEVELS, clampLevel, densityIndex, mixIndex, type Density, type TrafficMix } from './levels';
import { hhmmToMinutes } from './time';
import type { AirportData } from './airport/types';
import { closureProblems } from './airport/validate';

/**
 * Training scenarios.
 *
 * A plain seed only fixes the random numbers: the same seed with the same
 * settings gives the same traffic, but you cannot choose what happens. A
 * **scenario code** packs everything a training session needs into one
 * shareable string:
 *
 * ```
 * EDDS-25-HD1-M10R20W30S45-T2215.N.CF.CE-K7Q2M
 *  |    |  |||  |              |               |
 *  |    |  |||  |              |               seed (base 36)
 *  |    |  |||  |              options (optional part, tokens separated by "."):
 *  |    |  |||  |                T2215 start at 22:15 local time, N night flying restrictions,
 *  |    |  |||  |                CF taxiway F closed (one C token per taxiway), I de-icing (winter)
 *  |    |  |||  events: letter + minute (M medical arrival, D medical departure,
 *  |    |  |||          R rejected take-off, W wind shift, S thunderstorm), X = none
 *  |    |  ||flags: 1 = more heavies (35 %), 2 = random special events (rare), 3 = both, 0 = none
 *  |    |  |traffic mix: B balanced, D departure rush, A arrival rush
 *  |    |  density: L light, M medium, H heavy
 *  |    |  ...or four digits for the five-step sliders (levels.ts): density 1-5, mix 1-5
 *  |    |  (1 departure rush, 3 balanced, 5 arrival rush), heavies 0-4, special events 0-4,
 *  |    |  e.g. 4213. The letter form is used whenever it can express the values.
 *  |    runway in use, AUTO = from the wind
 *  airport
 * ```
 *
 * Codes without options have five parts (the format before 0.9); they stay valid.
 */

export type { TrafficMix } from './levels';
export type ScenarioEventKind = 'medicalArrival' | 'medicalDeparture' | 'rejectedTakeoff' | 'windShift' | 'thunderstorm';

export interface ScenarioEvent {
  kind: ScenarioEventKind;
  /** Minutes after the start of the session. */
  atMin: number;
}

export interface Scenario {
  airport: string;
  /** Runway in use; undefined = chosen from the (random) wind. */
  runway?: string;
  density: Density;
  mix: TrafficMix;
  /** Share of wide-bodies, step 0-4 of HEAVY_SHARES (0 = the operators' fleets). */
  heavyLevel: number;
  /** Rare random special events in addition to the scheduled ones. */
  /** Random special events, step 0-4 of EVENT_LEVELS (0 = never, 2 = rare). */
  eventLevel: number;
  /** Scheduled events (they happen whatever `eventLevel` says). */
  events: ScenarioEvent[];
  /** Session start in local airport time, "2215"; undefined = now. */
  startLocal?: string;
  /** The airport's night flying restrictions apply. */
  nightRules?: boolean;
  /** Taxiways closed for the whole session (e.g. construction works), upper case. */
  closedTaxiways?: string[];
  /** Winter operations: departures need de-icing on a de-icing pad before take-off. */
  deicing?: boolean;
  seed: number;
}

/** The part of a scenario the simulation needs besides seed, runway, density and random events. */
export interface ScenarioSetup {
  mix?: TrafficMix;
  /** Step 0-4 of HEAVY_SHARES. */
  heavyLevel?: number;
  events?: ScenarioEvent[];
  nightRules?: boolean;
  closedTaxiways?: string[];
  deicing?: boolean;
}

/** The simulation setup of a scenario (the start time is passed separately as `startTime`). */
export function scenarioSetup(s: Scenario): ScenarioSetup {
  return { mix: s.mix, heavyLevel: s.heavyLevel, events: s.events, nightRules: s.nightRules, closedTaxiways: s.closedTaxiways, deicing: s.deicing };
}

/** The letter form of the traffic part (codes before 0.9) covers only these steps. */
const DENSITY_CODE: Partial<Record<Density, string>> = { light: 'L', medium: 'M', heavy: 'H' };
const MIX_CODE: Partial<Record<TrafficMix, string>> = { balanced: 'B', departures: 'D', arrivals: 'A' };
const LEGACY_HEAVY_LEVEL = 3;
const LEGACY_EVENT_LEVEL = 2;

/** Traffic part: "MB2" when the letter form can express it, else four digits ("4213"). */
function formatTraffic(s: Scenario): string {
  const d = DENSITY_CODE[s.density];
  const m = MIX_CODE[s.mix];
  const h = clampLevel(s.heavyLevel);
  const e = clampLevel(s.eventLevel);
  if (d && m && (h === 0 || h === LEGACY_HEAVY_LEVEL) && (e === 0 || e === LEGACY_EVENT_LEVEL)) return `${d}${m}${(h ? 1 : 0) + (e ? 2 : 0)}`;
  return `${densityIndex(s.density) + 1}${mixIndex(s.mix) + 1}${h}${e}`;
}

/** Parses the traffic part (letter or digit form). */
function parseTraffic(part: string): Pick<Scenario, 'density' | 'mix' | 'heavyLevel' | 'eventLevel'> | undefined {
  const m = /^([LMH])([BDA])([0-3])$/.exec(part);
  if (m) {
    const flags = Number(m[3]);
    return {
      density: invert(DENSITY_CODE as Record<Density, string>)[m[1]],
      mix: invert(MIX_CODE as Record<TrafficMix, string>)[m[2]],
      heavyLevel: flags & 1 ? LEGACY_HEAVY_LEVEL : 0,
      eventLevel: flags & 2 ? LEGACY_EVENT_LEVEL : 0,
    };
  }
  const n = /^([1-5])([1-5])([0-4])([0-4])$/.exec(part);
  if (!n) return undefined;
  return { density: DENSITIES[Number(n[1]) - 1].value, mix: MIXES[Number(n[2]) - 1].value, heavyLevel: Number(n[3]), eventLevel: Number(n[4]) };
}
const EVENT_CODE: Record<ScenarioEventKind, string> = { medicalArrival: 'M', medicalDeparture: 'D', rejectedTakeoff: 'R', windShift: 'W', thunderstorm: 'S' };

/** Longest scenario time an event can be scheduled at (minutes). */
export const MAX_EVENT_MINUTE = 180;

/** Prefix of the system message a scheduled event posts. */
export const SCENARIO_EVENT_TEXT = { windShift: 'Supervisor', thunderstorm: 'MET' } as const;

export const EVENT_LABEL: Record<ScenarioEventKind, string> = {
  medicalArrival: 'Medical emergency, arrival',
  medicalDeparture: 'Medical emergency, departure',
  rejectedTakeoff: 'Rejected take-off',
  windShift: 'Wind shift (runway change)',
  thunderstorm: 'Thunderstorm (gusts, windshear, departures stopped)',
};

function invert<K extends string>(m: Record<K, string>): Record<string, K> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
}

/** The options part of a scenario code ("T2215.N.CF"), or '' if there are none. */
function formatOptions(s: Scenario): string {
  const tokens: string[] = [];
  if (s.startLocal) tokens.push(`T${s.startLocal}`);
  if (s.nightRules) tokens.push('N');
  for (const t of [...new Set(s.closedTaxiways ?? [])].sort()) tokens.push(`C${t.toUpperCase()}`);
  if (s.deicing) tokens.push('I');
  return tokens.join('.');
}

export function formatScenarioCode(s: Scenario): string {
  const events = [...s.events].sort((a, b) => a.atMin - b.atMin).map((e) => `${EVENT_CODE[e.kind]}${Math.round(e.atMin)}`).join('') || 'X';
  const options = formatOptions(s);
  return [s.airport.toUpperCase(), s.runway ?? 'AUTO', formatTraffic(s), events, ...(options ? [options] : []), (s.seed >>> 0).toString(36).toUpperCase()].join('-');
}

/** Parses the options part ("T2215.N.CF.CE"). */
function parseOptions(part: string): Pick<Scenario, 'startLocal' | 'nightRules' | 'closedTaxiways' | 'deicing'> | { error: string } {
  const out: Pick<Scenario, 'startLocal' | 'nightRules' | 'closedTaxiways' | 'deicing'> = {};
  for (const tok of part.split('.')) {
    if (/^T\d{4}$/.test(tok) && hhmmToMinutes(tok.slice(1)) !== undefined) out.startLocal = tok.slice(1);
    else if (tok === 'N') out.nightRules = true;
    else if (tok === 'I') out.deicing = true;
    else if (/^C[A-Z][A-Z0-9]{0,3}$/.test(tok)) {
      const list = (out.closedTaxiways ??= []);
      if (!list.includes(tok.slice(1))) list.push(tok.slice(1));
    }
    else return { error: `Invalid option "${tok}" (T2215 start time, N night rules, CF taxiway F closed, I de-icing)` };
  }
  return out;
}

/** Parses a scenario code. Returns an error text for invalid codes. */
export function parseScenarioCode(code: string): Scenario | { error: string } {
  const parts = code.trim().toUpperCase().split('-');
  if (parts.length !== 5 && parts.length !== 6) return { error: 'A scenario code has five or six parts, e.g. EDDS-25-MB2-M10-K7Q2M or EDDS-25-MB2-M10-T2215.N-K7Q2M' };
  const [airport, runway, traffic, events] = parts;
  const seed = parts[parts.length - 1];
  const options = parts.length === 6 ? parseOptions(parts[4]) : {};
  if ('error' in options) return options;
  if (!/^[A-Z]{4}$/.test(airport)) return { error: `Unknown airport "${airport}"` };
  if (!/^(AUTO|\d{2}[LRC]?)$/.test(runway)) return { error: `Invalid runway "${runway}"` };
  const tr = parseTraffic(traffic);
  if (!tr) return { error: `Invalid traffic part "${traffic}" (e.g. MB2, or four digits like 3302)` };
  const evs: ScenarioEvent[] = [];
  if (events !== 'X') {
    const re = /([MDRWS])(\d{1,3})/gy;
    let em: RegExpExecArray | null;
    let pos = 0;
    while ((em = re.exec(events))) {
      evs.push({ kind: invert(EVENT_CODE)[em[1]], atMin: Math.min(MAX_EVENT_MINUTE, Number(em[2])) });
      pos = re.lastIndex;
    }
    if (pos !== events.length || !evs.length) return { error: `Invalid events "${events}" (e.g. M10R20, or X for none)` };
  }
  if (!/^[0-9A-Z]{1,7}$/.test(seed) || parseInt(seed, 36) > 0xffffffff) return { error: `Invalid seed "${seed}"` };
  return {
    airport,
    runway: runway === 'AUTO' ? undefined : runway,
    ...tr,
    events: evs,
    ...options,
    seed: parseInt(seed, 36),
  };
}

/** A short human-readable description of a scenario. */
export function describeScenario(s: Scenario): string {
  const mix = MIXES[mixIndex(s.mix)].label.toLowerCase();
  const parts = [`${s.airport} runway ${s.runway ?? 'from the wind'}`, `${DENSITIES[densityIndex(s.density)].label.toLowerCase()} traffic`, s.mix === 'balanced' ? 'balanced mix' : mix];
  if (s.heavyLevel > 0) parts.push(HEAVY_SHARES[clampLevel(s.heavyLevel)].label);
  parts.push(`random events: ${EVENT_LEVELS[clampLevel(s.eventLevel)].label.toLowerCase()}`);
  if (s.startLocal) parts.push(`start ${s.startLocal} local`);
  if (s.nightRules) parts.push('night flying restrictions');
  if (s.closedTaxiways?.length) parts.push(`taxiway${s.closedTaxiways.length > 1 ? 's' : ''} ${s.closedTaxiways.join(', ')} closed`);
  if (s.deicing) parts.push('de-icing');
  const evs = [...s.events].sort((a, b) => a.atMin - b.atMin).map((e) => `${EVENT_LABEL[e.kind].toLowerCase()} at ${e.atMin} min`);
  return `${parts.join(', ')}${evs.length ? `; ${evs.join(', ')}` : ''}.`;
}

/** Ready-made training scenarios (without seed). */
export const SCENARIO_PRESETS: { name: string; description: string; scenario: Omit<Scenario, 'seed' | 'airport'> }[] = [
  {
    name: 'First steps',
    description: 'Light, balanced traffic without surprises.',
    scenario: { runway: undefined, density: 'light', mix: 'balanced', heavyLevel: 0, eventLevel: 0, events: [] },
  },
  {
    name: 'Departure push',
    description: 'Many departures calling for pushback and taxi at once: sequencing, queue numbers, conditional clearances.',
    scenario: { runway: undefined, density: 'heavy', mix: 'departures', heavyLevel: 0, eventLevel: 0, events: [] },
  },
  {
    name: 'Arrival rush',
    description: 'A stream of landing aircraft: quick taxi-in instructions, keeping the exits and vacate points free.',
    scenario: { runway: undefined, density: 'heavy', mix: 'arrivals', heavyLevel: 0, eventLevel: 0, events: [] },
  },
  {
    name: 'Heavy metal',
    description: 'More wide-bodies: no turning around, full-length departures, stand sizes.',
    scenario: { runway: undefined, density: 'medium', mix: 'balanced', heavyLevel: 3, eventLevel: 0, events: [] },
  },
  {
    name: 'Emergencies',
    description: 'Medical emergencies (arrival and departure) and a rejected take-off at fixed times.',
    scenario: {
      runway: undefined,
      density: 'medium',
      mix: 'balanced',
      heavyLevel: 0,
      eventLevel: 0,
      events: [
        { kind: 'medicalArrival', atMin: 6 },
        { kind: 'rejectedTakeoff', atMin: 15 },
        { kind: 'medicalDeparture', atMin: 25 },
      ],
    },
  },
  {
    name: 'Runway change',
    description: 'The wind turns after 15 minutes: update the ATIS and change the runway with traffic on the move.',
    scenario: { runway: '25', density: 'medium', mix: 'balanced', heavyLevel: 0, eventLevel: 0, events: [{ kind: 'windShift', atMin: 15 }] },
  },
  {
    name: 'Night shift',
    description: 'The evening wave before the curfew: jets must be airborne by 2300 local, landings end at 2330 (delayed ones until 2400).',
    scenario: { runway: undefined, density: 'medium', mix: 'balanced', heavyLevel: 0, eventLevel: 0, events: [], startLocal: '2215', nightRules: true },
  },
  {
    name: 'Construction works',
    description: 'Taxiways S and E are closed for resurfacing: plan routes around them; crews refuse routes over a closed taxiway.',
    scenario: { runway: '25', density: 'medium', mix: 'balanced', heavyLevel: 0, eventLevel: 0, events: [], closedTaxiways: ['E', 'S'] },
  },
  {
    name: 'Winter morning',
    description: 'Frost on the wings: every departure needs de-icing on one of the de-icing pads before it can taxi to the runway.',
    scenario: { runway: undefined, density: 'medium', mix: 'departures', heavyLevel: 0, eventLevel: 0, events: [], startLocal: '0630', deicing: true },
  },
  {
    name: 'Thunderstorm',
    description: 'A thunderstorm crosses the airport: gusts, a tailwind shift, windshear go-arounds and a departure stop while it is overhead.',
    scenario: { runway: undefined, density: 'medium', mix: 'balanced', heavyLevel: 0, eventLevel: 0, events: [{ kind: 'thunderstorm', atMin: 12 }] },
  },
  {
    name: 'Full shift',
    description: 'Heavy traffic, more heavies, random events and a wind shift - everything at once.',
    scenario: {
      runway: undefined,
      density: 'heavy',
      mix: 'balanced',
      heavyLevel: 3,
      eventLevel: 2,
      events: [
        { kind: 'medicalArrival', atMin: 12 },
        { kind: 'windShift', atMin: 35 },
      ],
    },
  },
];

/**
 * The presets that make sense at an airport (the list above is written for Stuttgart): a fixed runway
 * becomes the airport's preferred runway, closures need taxiways that exist and can be closed, night
 * rules and de-icing need the airport's restrictions and pads.
 */
export function presetsFor(airport: AirportData): typeof SCENARIO_PRESETS {
  const first = airport.runwayOps[0]?.runway;
  const ends = new Set(airport.runwayOps.map((o) => o.runway));
  const taxiways = new Set(airport.taxiEdges.filter((e) => e.kind === 'taxiway').map((e) => e.name.toUpperCase()));
  const out: typeof SCENARIO_PRESETS = [];
  for (const p of SCENARIO_PRESETS) {
    const sc = { ...p.scenario };
    if (sc.runway && !ends.has(sc.runway)) sc.runway = first;
    if (sc.nightRules && !airport.nightRestrictions) continue;
    if (sc.deicing && !airport.deicingPads?.length) continue;
    if (sc.closedTaxiways?.length) {
      if (!sc.closedTaxiways.every((t) => taxiways.has(t)) || closureProblems(airport, sc.closedTaxiways).length) continue;
    }
    out.push({ ...p, scenario: sc });
  }
  return out;
}
