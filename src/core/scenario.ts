import type { Density } from './simulation';
import { hhmmToMinutes } from './time';

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
 *  |    |  |||  |                CF taxiway F closed (one C token per taxiway)
 *  |    |  |||  events: letter + minute (M medical arrival, D medical departure,
 *  |    |  |||          R rejected take-off, W wind shift, S thunderstorm), X = none
 *  |    |  ||flags: 1 = more heavies, 2 = random special events, 3 = both, 0 = none
 *  |    |  |traffic mix: B balanced, D departure push, A arrival rush
 *  |    |  density: L light, M medium, H heavy
 *  |    runway in use, AUTO = from the wind
 *  airport
 * ```
 *
 * Codes without options have five parts (the format before 0.9); they stay valid.
 */

export type TrafficMix = 'balanced' | 'departures' | 'arrivals';
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
  /** More wide-body (heavy) aircraft. */
  heavies: boolean;
  /** Rare random special events in addition to the scheduled ones. */
  randomEvents: boolean;
  /** Scheduled events (they happen whatever `randomEvents` says). */
  events: ScenarioEvent[];
  /** Session start in local airport time, "2215"; undefined = now. */
  startLocal?: string;
  /** The airport's night flying restrictions apply. */
  nightRules?: boolean;
  /** Taxiways closed for the whole session (e.g. construction works), upper case. */
  closedTaxiways?: string[];
  seed: number;
}

/** The part of a scenario the simulation needs besides seed, runway, density and random events. */
export interface ScenarioSetup {
  mix?: TrafficMix;
  heavies?: boolean;
  events?: ScenarioEvent[];
  nightRules?: boolean;
  closedTaxiways?: string[];
}

/** The simulation setup of a scenario (the start time is passed separately as `startTime`). */
export function scenarioSetup(s: Scenario): ScenarioSetup {
  return { mix: s.mix, heavies: s.heavies, events: s.events, nightRules: s.nightRules, closedTaxiways: s.closedTaxiways };
}

const DENSITY_CODE: Record<Density, string> = { light: 'L', medium: 'M', heavy: 'H' };
const MIX_CODE: Record<TrafficMix, string> = { balanced: 'B', departures: 'D', arrivals: 'A' };
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
  return tokens.join('.');
}

export function formatScenarioCode(s: Scenario): string {
  const flags = (s.heavies ? 1 : 0) + (s.randomEvents ? 2 : 0);
  const events = [...s.events].sort((a, b) => a.atMin - b.atMin).map((e) => `${EVENT_CODE[e.kind]}${Math.round(e.atMin)}`).join('') || 'X';
  const options = formatOptions(s);
  return [s.airport.toUpperCase(), s.runway ?? 'AUTO', `${DENSITY_CODE[s.density]}${MIX_CODE[s.mix]}${flags}`, events, ...(options ? [options] : []), (s.seed >>> 0).toString(36).toUpperCase()].join('-');
}

/** Parses the options part ("T2215.N.CF.CE"). */
function parseOptions(part: string): Pick<Scenario, 'startLocal' | 'nightRules' | 'closedTaxiways'> | { error: string } {
  const out: Pick<Scenario, 'startLocal' | 'nightRules' | 'closedTaxiways'> = {};
  for (const tok of part.split('.')) {
    if (/^T\d{4}$/.test(tok) && hhmmToMinutes(tok.slice(1)) !== undefined) out.startLocal = tok.slice(1);
    else if (tok === 'N') out.nightRules = true;
    else if (/^C[A-Z][A-Z0-9]{0,3}$/.test(tok)) {
      const list = (out.closedTaxiways ??= []);
      if (!list.includes(tok.slice(1))) list.push(tok.slice(1));
    }
    else return { error: `Invalid option "${tok}" (T2215 start time, N night rules, CF taxiway F closed)` };
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
  const m = /^([LMH])([BDA])([0-3])$/.exec(traffic);
  if (!m) return { error: `Invalid traffic part "${traffic}" (density L/M/H, mix B/D/A, flags 0-3)` };
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
  const flags = Number(m[3]);
  return {
    airport,
    runway: runway === 'AUTO' ? undefined : runway,
    density: invert(DENSITY_CODE)[m[1]],
    mix: invert(MIX_CODE)[m[2]],
    heavies: (flags & 1) !== 0,
    randomEvents: (flags & 2) !== 0,
    events: evs,
    ...options,
    seed: parseInt(seed, 36),
  };
}

/** A short human-readable description of a scenario. */
export function describeScenario(s: Scenario): string {
  const mix = { balanced: 'balanced traffic', departures: 'departure push', arrivals: 'arrival rush' }[s.mix];
  const parts = [`${s.airport} runway ${s.runway ?? 'from the wind'}`, `${s.density} density`, mix];
  if (s.heavies) parts.push('more heavies');
  parts.push(s.randomEvents ? 'random events on' : 'random events off');
  if (s.startLocal) parts.push(`start ${s.startLocal} local`);
  if (s.nightRules) parts.push('night flying restrictions');
  if (s.closedTaxiways?.length) parts.push(`taxiway${s.closedTaxiways.length > 1 ? 's' : ''} ${s.closedTaxiways.join(', ')} closed`);
  const evs = [...s.events].sort((a, b) => a.atMin - b.atMin).map((e) => `${EVENT_LABEL[e.kind].toLowerCase()} at ${e.atMin} min`);
  return `${parts.join(', ')}${evs.length ? `; ${evs.join(', ')}` : ''}.`;
}

/** Ready-made training scenarios (without seed). */
export const SCENARIO_PRESETS: { name: string; description: string; scenario: Omit<Scenario, 'seed' | 'airport'> }[] = [
  {
    name: 'First steps',
    description: 'Light, balanced traffic without surprises.',
    scenario: { runway: undefined, density: 'light', mix: 'balanced', heavies: false, randomEvents: false, events: [] },
  },
  {
    name: 'Departure push',
    description: 'Many departures calling for pushback and taxi at once: sequencing, queue numbers, conditional clearances.',
    scenario: { runway: undefined, density: 'heavy', mix: 'departures', heavies: false, randomEvents: false, events: [] },
  },
  {
    name: 'Arrival rush',
    description: 'A stream of landing aircraft: quick taxi-in instructions, keeping the exits and vacate points free.',
    scenario: { runway: undefined, density: 'heavy', mix: 'arrivals', heavies: false, randomEvents: false, events: [] },
  },
  {
    name: 'Heavy metal',
    description: 'More wide-bodies: no turning around, full-length departures, stand sizes.',
    scenario: { runway: undefined, density: 'medium', mix: 'balanced', heavies: true, randomEvents: false, events: [] },
  },
  {
    name: 'Emergencies',
    description: 'Medical emergencies (arrival and departure) and a rejected take-off at fixed times.',
    scenario: {
      runway: undefined,
      density: 'medium',
      mix: 'balanced',
      heavies: false,
      randomEvents: false,
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
    scenario: { runway: '25', density: 'medium', mix: 'balanced', heavies: false, randomEvents: false, events: [{ kind: 'windShift', atMin: 15 }] },
  },
  {
    name: 'Night shift',
    description: 'The evening wave before the curfew: jets must be airborne by 2300 local, landings end at 2330 (delayed ones until 2400).',
    scenario: { runway: undefined, density: 'medium', mix: 'balanced', heavies: false, randomEvents: false, events: [], startLocal: '2215', nightRules: true },
  },
  {
    name: 'Construction works',
    description: 'Taxiways S and E are closed for resurfacing: plan routes around them; crews refuse routes over a closed taxiway.',
    scenario: { runway: '25', density: 'medium', mix: 'balanced', heavies: false, randomEvents: false, events: [], closedTaxiways: ['E', 'S'] },
  },
  {
    name: 'Thunderstorm',
    description: 'A thunderstorm crosses the airport: gusts, a tailwind shift, windshear go-arounds and a departure stop while it is overhead.',
    scenario: { runway: undefined, density: 'medium', mix: 'balanced', heavies: false, randomEvents: false, events: [{ kind: 'thunderstorm', atMin: 12 }] },
  },
  {
    name: 'Full shift',
    description: 'Heavy traffic, more heavies, random events and a wind shift - everything at once.',
    scenario: {
      runway: undefined,
      density: 'heavy',
      mix: 'balanced',
      heavies: true,
      randomEvents: true,
      events: [
        { kind: 'medicalArrival', atMin: 12 },
        { kind: 'windShift', atMin: 35 },
      ],
    },
  },
];
