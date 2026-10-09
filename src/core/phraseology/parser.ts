import type { Compass, StationType } from '../airport/types';
import { AIRLINES, VEHICLE_TELEPHONY } from '../../data/airlines';
import type { Altitude, Command, HoldShortTarget, ParsedTransmission, TaxiDestination } from './commands';

/**
 * Parser for controller transmissions written (or dictated) in ICAO
 * phraseology. See docs/phraseology.md for the supported grammar.
 *
 * The parser is deliberately forgiving: it scans for known keywords and
 * ignores filler words ("please", "roger", "good day"), accepts both typed
 * designators ("G1", "25") and spoken forms ("golf one", "two five"), and
 * lets the callsign appear at the start or at the end.
 */

export interface ParserContext {
  /** Callsigns of all aircraft currently in the simulation (upper case). */
  callsigns: string[];
  /** Taxiway designators known at the airport (upper case). */
  taxiways: Set<string>;
  /** Callsign of the currently selected aircraft, used when none is spoken. */
  selected?: string;
  /** SID designators of the airport (upper case), for IFR clearances. */
  sids?: string[];
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', tree: '3', four: '4', five: '5', fife: '5',
  six: '6', seven: '7', eight: '8', nine: '9', niner: '9',
};

const TENS_WORDS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

/**
 * Words speech recognition commonly produces instead of the intended
 * aviation word. Multi-word keys are matched before single words.
 */
const VOICE_FIXES: [string, string][] = [
  ['push back', 'pushback'],
  ['pushed back', 'pushback'],
  ['push bag', 'pushback'],
  ['start up', 'startup'],
  ['read back', 'readback'],
  ['red back', 'readback'],
  ['sea tot', 'ctot'],
  ['c tot', 'ctot'],
  ['see tot', 'ctot'],
  ['stand by', 'standby'],
  ['fox trot', 'foxtrot'],
  ['x ray', 'xray'],
  ['hold in point', 'holding point'],
  ['holding points', 'holding point'],
  ['holding position', 'holding point'],
  ['run way', 'runway'],
  ['run ways', 'runway'],
  ['euro wings', 'eurowings'],
  ['speed bird', 'speedbird'],
  ['sun express', 'sunexpress'],
  ['sun turk', 'sunturk'],
  ['hansa line', 'hansaline'],
  ['luft hansa', 'lufthansa'],
  ['air france', 'airfrans'],
  ['air frans', 'airfrans'],
  ['tui jet', 'tuijet'],
  ['ryan air', 'ryanair'],
  ['wiz air', 'wizz air'],
  ['whiz air', 'wizz air'],
  ['it arrow', 'itarrow'],
  ['frequency changed approved', 'frequency change approved'],
];

const VOICE_WORD_FIXES: Record<string, string> = {
  gulf: 'golf', eco: 'echo', charley: 'charlie', mic: 'mike', mik: 'mike', juliette: 'juliett', kilos: 'kilo',
  victa: 'victor', sierr: 'sierra', siera: 'sierra', romio: 'romeo', alfa: 'alpha', bravos: 'bravo',
  taxis: 'taxi', texi: 'taxi', approve: 'approved', improved: 'approved', proved: 'approved',
  phasing: 'facing', pacing: 'facing', tails: 'tail', canceled: 'cancelled',
  pushbacks: 'pushback', clearer: 'clear', won: 'one', ate: 'eight',
  lufthanza: 'lufthansa', lufthansas: 'lufthansa', eurowing: 'eurowings', condo: 'condor', condors: 'condor',
  turkis: 'turkish', vueling: 'vueling', veuling: 'vueling', airfrance: 'airfrans', speedbirds: 'speedbird',
};

const PHONETIC_WORDS: Record<string, string> = {
  alpha: 'a', alfa: 'a', bravo: 'b', charlie: 'c', delta: 'd', echo: 'e', foxtrot: 'f', golf: 'g',
  hotel: 'h', india: 'i', juliett: 'j', juliet: 'j', kilo: 'k', lima: 'l', mike: 'm', november: 'n',
  oscar: 'o', papa: 'p', quebec: 'q', romeo: 'r', sierra: 's', tango: 't', uniform: 'u', victor: 'v',
  whiskey: 'w', whisky: 'w', xray: 'x', 'x-ray': 'x', yankee: 'y', zulu: 'z',
};

/** Words between "able" and the intersection name ("able for an intersection departure from D"). */
const ABLE_FILLER = new Set(['for', 'to', 'an', 'a', 'the', 'depart', 'departure', 'from', 'intersection', 'holding', 'point', 'take', 'off', 'takeoff', 'at', 'taxiway']);

const STATION_WORDS: Record<string, StationType> = {
  tower: 'TWR', ground: 'GND', delivery: 'DEL', clearance: 'DEL', approach: 'APP', radar: 'APP',
  departure: 'DEP', director: 'APP', center: 'CTR', centre: 'CTR', apron: 'GND',
};

const COMPASS: Record<string, Compass> = { north: 'north', east: 'east', south: 'south', west: 'west' };
const OPPOSITE: Record<Compass, Compass> = { north: 'south', south: 'north', east: 'west', west: 'east' };

/** Words that terminate a list of taxiways or begin a new instruction. */
const KEYWORDS = new Set([
  'to', 'via', 'hold', 'holding', 'short', 'cross', 'runway', 'stand', 'gate', 'parking', 'position',
  'contact', 'monitor', 'give', 'continue', 'push', 'pushback', 'start', 'startup', 'expedite',
  'standby', 'taxi', 'follow', 'behind', 'line', 'cleared', 'then', 'and', 'frequency', 'say',
  'along', 'cancel', 'number', 'expect', 'when', 'after', 'stop', 'able', 'advise', 'climb', 'squawk',
  'readback', 'ctot', 'slot', 'tow', 'proceed', 'return',
]);

/** Aircraft type words usable in conditional clearances ("behind the A320"). */
const TYPE_WORD = /^(a\d{3}|a\d{2}n|b\d{3}|b\d{2}m|7\d7|e\d{3}|crj\d*|dh8d|q400|at\d\d|atr|airbus|boeing|embraer|bombardier|dash|citation|challenger|bizjet|jet|heavy)$/;

/** What a sequence number / expected delay refers to. */
const SEQUENCE_FOR: Record<string, string> = {
  push: 'pushback', pushback: 'pushback', start: 'start-up', startup: 'start-up', taxi: 'taxi',
  departure: 'departure', takeoff: 'departure', take: 'departure', crossing: 'crossing', tow: 'tow',
};

/** Multi-word and single-word telephony designators -> ICAO prefix. */
const TELEPHONY_WORDS: { words: string[]; icao: string }[] = [...AIRLINES.filter((a) => a.telephony), ...VEHICLE_TELEPHONY]
  .map((a) => ({ words: a.telephony.toLowerCase().replace(/-/g, ' ').split(/\s+/), icao: a.icao }))
  .sort((a, b) => b.words.length - a.words.length);

/** Lower-cases, strips punctuation and converts spoken numbers/letters to characters. */
export function tokenize(input: string): string[] {
  let cleaned = input
    .toLowerCase()
    .replace(/(\d)\s*(decimal|point)\s*(\d)/g, '$1.$3')
    .replace(/[,;:!?()]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bx ray\b/g, 'xray');
  for (const [from, to] of VOICE_FIXES) cleaned = cleaned.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  const raw = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => VOICE_WORD_FIXES[w] ?? w);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i];
    const nextRaw = raw[i + 1] ?? '';
    if ((t === 'decimal' || (t === 'point' && raw[i - 1] !== 'holding')) && out.length && /^\d+$/.test(out[out.length - 1]) && (/^\d/.test(nextRaw) || NUMBER_WORDS[nextRaw])) {
      out[out.length - 1] += '.';
      continue;
    }
    const prevTok = out[out.length - 1];
    const numberContext = prevTok !== undefined && ['runway', 'stand', 'number', 'gate', 'in'].includes(prevTok);
    if (TENS_WORDS[t] !== undefined) {
      // "twenty five" -> 25, "twenty" -> 20
      const unit = NUMBER_WORDS[raw[i + 1] ?? ''];
      const tens = TENS_WORDS[t];
      if (tens >= 20 && unit && unit !== '0') {
        out.push(String(tens + Number(unit)));
        i++;
      } else out.push(String(tens));
      continue;
    }
    if (numberContext && (t === 'to' || t === 'too')) t = '2';
    else if (numberContext && t === 'for') t = '4';
    else if (NUMBER_WORDS[t]) t = NUMBER_WORDS[t];
    else if (PHONETIC_WORDS[t]) t = PHONETIC_WORDS[t];
    // join "118." + "805"
    if (out.length && /^\d+\.\d{0,2}$/.test(out[out.length - 1]) && /^\d+$/.test(t)) {
      out[out.length - 1] += t;
      continue;
    }
    out.push(t);
  }
  // Merge spoken frequency digits: "1 1 8.805" -> "118.805"
  for (let i = 0; i < out.length; i++) {
    if (!/^\d+\.\d*$/.test(out[i])) continue;
    while (i > 0 && /^\d$/.test(out[i - 1]) && out[i].indexOf('.') < 3) {
      out[i] = out[i - 1] + out[i];
      out.splice(i - 1, 1);
      i--;
    }
  }
  return out;
}

const isSingle = (t: string | undefined) => !!t && /^[a-z0-9]$/.test(t);
const isDigit = (t: string | undefined) => !!t && /^\d$/.test(t);

class Cursor {
  i = 0;
  constructor(readonly t: string[]) {}
  peek(o = 0): string | undefined {
    return this.t[this.i + o];
  }
  next(): string | undefined {
    return this.t[this.i++];
  }
  done(): boolean {
    return this.i >= this.t.length;
  }
  accept(...words: string[]): boolean {
    if (this.peek() !== undefined && words.includes(this.peek()!)) {
      this.i++;
      return true;
    }
    return false;
  }
  /** Accepts a sequence of words exactly. */
  acceptSeq(...words: string[]): boolean {
    for (let k = 0; k < words.length; k++) if (this.peek(k) !== words[k]) return false;
    this.i += words.length;
    return true;
  }
}

/** Reads a runway designator: "25", "2 5", "07l", "0 7 left". */
function readRunway(c: Cursor): string | undefined {
  let s = '';
  const first = c.peek();
  if (first && /^\d{1,2}[lrc]?$/.test(first)) {
    s = c.next()!;
    if (s.length === 1 && isDigit(c.peek())) s += c.next();
  } else {
    return undefined;
  }
  if (!/[lrc]$/.test(s)) {
    const side = c.peek();
    if (side === 'left' || side === 'l') { c.next(); s += 'l'; }
    else if (side === 'right' || side === 'r') { c.next(); s += 'r'; }
    else if (side === 'center' || side === 'centre' || side === 'c') {
      // "c" right after a runway number is ambiguous with taxiway C; accept only the full words.
      if (side !== 'c') { c.next(); s += 'c'; }
    }
  }
  if (s.length === 1) s = '0' + s;
  return s.toUpperCase();
}

/** Words that end the destination of an IFR clearance ("cleared to Frankfurt via ..."). */
const CLEARANCE_STOP = new Set(['via', 'climb', 'maintain', 'squawk', 'runway', 'departure', 'then', 'and', 'ctot', 'slot', 'initially', 'initial', 'flight', 'expect', 'contact', 'sid']);

/**
 * Matches a SID designator at the cursor: typed ("krh2w") or spelled
 * ("k r h 2 w", from "kilo romeo hotel two whiskey"). Consumes it if `consume`.
 */
function matchSid(c: Cursor, sids: string[] | undefined, consume: boolean): string | undefined {
  if (!sids?.length) return undefined;
  for (let n = Math.min(7, c.t.length - c.i); n >= 1; n--) {
    const cand = c.t.slice(c.i, c.i + n).join('').toUpperCase();
    const sid = sids.find((s) => s === cand);
    if (sid) {
      if (consume) c.i += n;
      return sid;
    }
  }
  return undefined;
}

/** Reads an altitude: "5000 feet", "five thousand feet", "flight level 70", "altitude 5000". */
function readAltitude(c: Cursor): Altitude | undefined {
  c.accept('initially', 'to', 'altitude', 'via');
  c.accept('to', 'altitude');
  if (c.accept('flight', 'fl')) {
    c.accept('level');
    const fl = readNumber(c);
    return fl !== undefined ? { fl } : undefined;
  }
  const n = readNumber(c);
  if (n === undefined) return undefined;
  let feet = n;
  if (c.accept('thousand')) {
    feet = n * 1000;
    const rest = readNumber(c);
    if (rest !== undefined && c.accept('hundred')) feet += rest * 100;
  } else if (c.accept('hundred')) feet = n * 100;
  c.accept('feet', 'ft', 'foot');
  return { feet };
}

/** Reads a number written as one token ("5000") or as single digits ("5 0 0 0"). */
function readNumber(c: Cursor): number | undefined {
  const t = c.peek();
  if (!t || !/^\d+$/.test(t)) return undefined;
  let s = c.next()!;
  while (s.length < 5 && isDigit(c.peek()) && c.peek(1) !== 'thousand' && c.peek(1) !== 'hundred') s += c.next();
  return Number(s);
}

/** Reads a four-digit code (squawk, time): "2312" or "2 3 1 2". */
function readCode(c: Cursor): string | undefined {
  const t = c.peek();
  if (!t || !/^\d+$/.test(t)) return undefined;
  let s = c.next()!;
  while (s.length < 4 && isDigit(c.peek())) s += c.next();
  return /^\d{4}$/.test(s) ? s : undefined;
}

/** Reads a stand number such as "12", "1 2", "50a". */
function readStand(c: Cursor): string | undefined {
  let s = '';
  while (isDigit(c.peek()) || (s === '' && c.peek() && /^\d+[a-z]?$/.test(c.peek()!))) {
    s += c.next();
    if (/[a-z]$/.test(s)) break;
  }
  if (s && isSingle(c.peek()) && /[a-z]/.test(c.peek()!) && !KEYWORDS.has(c.peek()!)) {
    // trailing stand suffix letter, e.g. "stand 1 2 alpha" -> 12A. Only if followed by nothing taxiway-like.
    const nxt = c.peek(1);
    if (nxt === undefined || KEYWORDS.has(nxt)) s += c.next();
  }
  return s ? s.toUpperCase() : undefined;
}

/** Reads a holding point / taxiway designator: "g1", "g 1", "n", "a12". */
function readDesignator(c: Cursor): string | undefined {
  const t = c.peek();
  if (!t) return undefined;
  if (/^[a-z]\d{0,2}$/.test(t)) {
    c.next();
    let s = t;
    while (isDigit(c.peek()) && s.length < 4) s += c.next();
    return s.toUpperCase();
  }
  return undefined;
}

function readFrequency(c: Cursor): string | undefined {
  const t = c.peek();
  if (t && /^1\d\d\.\d{1,3}$/.test(t)) {
    c.next();
    return t;
  }
  // spoken digits: 1 1 8 . 8 0 5 have already been joined if "decimal" was used; else collect 6 digits
  if (isDigit(t)) {
    let digits = '';
    const save = c.i;
    while (isDigit(c.peek()) && digits.length < 6) digits += c.next();
    if (digits.length >= 5 && digits.startsWith('1')) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    c.i = save;
  }
  return undefined;
}

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Telephony word match that tolerates small recognition errors ("lufthanza"). */
function telephonyWordMatches(token: string | undefined, word: string): boolean {
  if (!token) return false;
  if (token === word) return true;
  return word.length >= 5 && token.length >= 4 && levenshtein(token, word) <= (word.length >= 8 ? 2 : 1);
}

interface CallsignMatch {
  callsign: string;
  consumed: number;
}

/** Tries to read a callsign at token position `i`. */
function matchCallsign(tokens: string[], i: number, callsigns: string[]): CallsignMatch | undefined {
  const t = tokens[i];
  if (!t) return undefined;
  const upper = callsigns.map((c) => c.toUpperCase());

  // 1. Literal callsign "dlh5ab"
  const direct = upper.find((c) => c === t.toUpperCase());
  if (direct) return { callsign: direct, consumed: 1 };

  // 2. Telephony + suffix ("lufthansa 5 a b", "wizz air 1 2 3")
  for (const tel of TELEPHONY_WORDS) {
    if (tel.words.every((w, k) => telephonyWordMatches(tokens[i + k], w))) {
      let j = i + tel.words.length;
      let suffix = '';
      while (j < tokens.length && /^[a-z0-9]+$/.test(tokens[j]) && !KEYWORDS.has(tokens[j]) && suffix.length < 7) {
        const cand = (suffix + tokens[j]).toUpperCase();
        // stop if adding the token no longer matches any callsign prefix
        if (!upper.some((c) => c.startsWith(tel.icao + cand))) {
          // ...unless it is a plausible flight-number fragment (recognition errors are fixed below)
          if (!/^[a-z0-9]{1,3}$/.test(tokens[j]) || FILLER.has(tokens[j]) || suffix.length >= 4) break;
        }
        suffix += tokens[j];
        j++;
      }
      const cs = (tel.icao + suffix).toUpperCase();
      if (upper.includes(cs)) return { callsign: cs, consumed: j - i };
      // Fuzzy: closest callsign of this operator (one character off), or the only one.
      const same = upper.filter((c) => c.startsWith(tel.icao));
      const scored = same.map((c) => ({ c, d: levenshtein(c.slice(3), suffix.toUpperCase()) })).sort((a, b) => a.d - b.d);
      if (scored.length && (scored[0].d <= 1 || (scored.length === 1 && scored[0].d <= 2) || (scored.length === 1 && !suffix))) {
        if (scored.length === 1 || scored[1].d > scored[0].d) return { callsign: scored[0].c, consumed: j - i };
      }
      return { callsign: cs, consumed: j - i }; // unknown aircraft, reported by the caller
    }
  }

  // 3. Spelled registration or flight number suffix ("5 a b", "5ab", "d c m g b")
  let j = i;
  let acc = '';
  let best: CallsignMatch | undefined;
  while (j < tokens.length && /^[a-z0-9]+$/.test(tokens[j]) && acc.length < 7) {
    if (KEYWORDS.has(tokens[j]) && acc.length > 0) break;
    acc += tokens[j];
    j++;
    const A = acc.toUpperCase();
    const exact = upper.filter((c) => c === A);
    if (exact.length === 1) best = { callsign: exact[0], consumed: j - i };
    const bySuffix = upper.filter((c) => c.length > A.length && c.endsWith(A) && /^[A-Z]{3}$/.test(c.slice(0, c.length - A.length)));
    if (bySuffix.length === 1 && /\d/.test(A)) best = { callsign: bySuffix[0], consumed: j - i };
  }
  return best;
}

export function parseTransmission(input: string, ctx: ParserContext): ParsedTransmission {
  const tokens = tokenize(input);
  const result: ParsedTransmission = { explicitCallsign: false, commands: [], unparsed: [] };

  // ---- callsign at the beginning or at the end
  let start = 0;
  let end = tokens.length;
  const head = matchCallsign(tokens, 0, ctx.callsigns);
  if (head) {
    result.callsign = head.callsign;
    result.explicitCallsign = true;
    start = head.consumed;
  } else {
    for (let k = Math.max(0, tokens.length - 6); k < tokens.length; k++) {
      const tail = matchCallsign(tokens, k, ctx.callsigns);
      if (tail && k + tail.consumed === tokens.length && ctx.callsigns.includes(tail.callsign)) {
        result.callsign = tail.callsign;
        result.explicitCallsign = true;
        end = k;
        break;
      }
    }
  }
  if (!result.callsign && ctx.selected) result.callsign = ctx.selected;

  const c = new Cursor(tokens.slice(start, end));
  let taxi: Extract<Command, { type: 'taxi' }> | undefined;
  const pendingHoldShort: HoldShortTarget[] = [];
  const pendingCross: string[] = [];

  const readFacing = (): Compass | undefined => {
    // looks ahead a few tokens for "facing east" / "face west" / "tail north"
    for (let k = 0; k < 7; k++) {
      const w = c.peek(k);
      if (w === 'facing' || w === 'face' || w === 'nose') {
        const d = COMPASS[c.peek(k + 1) ?? ''];
        if (d) {
          c.t.splice(c.i + k, 2);
          return d;
        }
      }
      if (w === 'tail') {
        const d = COMPASS[c.peek(k + 1) ?? ''];
        if (d) {
          c.t.splice(c.i + k, 2);
          return OPPOSITE[d];
        }
      }
    }
    return undefined;
  };

  const readHoldShortTarget = (): HoldShortTarget | undefined => {
    c.accept('of');
    if (c.accept('runway')) {
      const r = readRunway(c);
      return r ? { kind: 'runway', runway: r } : undefined;
    }
    c.accept('taxiway');
    const d = readDesignator(c);
    return d ? { kind: 'taxiway', name: d } : undefined;
  };

  const readVia = (into: string[]) => {
    while (!c.done()) {
      if (c.accept('and') || c.accept('then')) {
        // "via N and D" - allow, but "and" may also start a new clause; check what follows
        const p = c.peek();
        if (!p || !/^[a-z]\d{0,2}$/.test(p) || !ctx.taxiways.has(p.toUpperCase())) {
          c.i--;
          break;
        }
      }
      c.accept('taxiway');
      const p = c.peek();
      if (!p || KEYWORDS.has(p)) break;
      const save = c.i;
      const d = readDesignator(c);
      if (!d) break;
      if (!ctx.taxiways.has(d) && /\d/.test(d) && ctx.taxiways.has(d[0])) {
        // "n 2" misread as N2 at an airport without N2 - keep the letter only
        c.i = save + 1;
        into.push(d[0]);
        continue;
      }
      into.push(d);
    }
  };

  const readTaxiDestination = (): TaxiDestination | undefined => {
    if (c.accept('holding') || c.acceptSeq('hold', 'point')) {
      c.accept('point', 'position');
      const name = readDesignator(c);
      if (!name) return undefined;
      let runway: string | undefined;
      if (c.peek() === 'runway') {
        c.next();
        runway = readRunway(c);
      }
      return { kind: 'holdingPoint', name, runway };
    }
    if (c.accept('runway')) {
      const r = readRunway(c);
      if (!r) return undefined;
      // "runway 25 at G1" / "runway 25 intersection F"
      if (c.accept('at', 'intersection', 'via')) {
        const save = c.i;
        const hp = readDesignator(c);
        if (hp && /\d/.test(hp)) return { kind: 'holdingPoint', name: hp, runway: r };
        c.i = save;
        if (c.t[c.i - 1] === 'via') c.i--;
      }
      return { kind: 'runway', runway: r };
    }
    if (c.accept('stand', 'gate', 'parking', 'position', 'apron')) {
      c.accept('position');
      const s = readStand(c);
      return s ? { kind: 'stand', stand: s } : undefined;
    }
    return undefined;
  };

  /**
   * Conditional clearance at the start of an instruction:
   * "behind DLH5AB", "behind the A320 passing from left to right",
   * "when clear of the Boeing", "after the A321 has passed".
   */
  const readCondition = (): void => {
    const w = c.peek();
    const isWhenClear = w === 'when' && c.peek(1) === 'clear';
    if (w !== 'behind' && w !== 'after' && !isWhenClear) return;
    const startIdx = c.i;
    c.i += isWhenClear ? 2 : 1;
    c.accept('of');
    c.accept('the');
    let callsign: string | undefined;
    let type: string | undefined;
    const m = matchCallsign(c.t, c.i, ctx.callsigns);
    if (m && ctx.callsigns.includes(m.callsign)) {
      callsign = m.callsign;
      c.i += m.consumed;
    } else if (c.peek() && TYPE_WORD.test(c.peek()!)) {
      const word = c.next()!;
      type = /\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1);
      // "A3 20" / "7 37" split by recognition
      if (/^\d+$/.test(c.peek() ?? '') && type.length < 4) type += c.next();
    } else {
      c.i = startIdx;
      return;
    }
    // Descriptive words up to the instruction: "passing from left to right", "has passed", "on N".
    const descr: string[] = [];
    while (!c.done() && !['push', 'pushback', 'taxi', 'start', 'startup', 'cross', 'continue', 'line', 'hold', 'contact'].includes(c.peek()!)) {
      descr.push(c.next()!);
    }
    const words = c.t.slice(startIdx, startIdx + (c.i - startIdx - descr.length));
    const lead = words[0] === 'when' ? 'when clear of' : words[0];
    const subject = callsign ?? `the ${type}`;
    const tail = descr.filter((d) => !['and', 'then'].includes(d)).join(' ');
    result.condition = { callsign, type, text: `${lead} ${subject}${tail ? ` ${tail}` : ''}` };
  };

  readCondition();

  while (!c.done()) {
    const w = c.peek()!;

    // ---------- cancel / stop / continue pushback
    if (w === 'cancel' && ['push', 'pushback', 'startup', 'start'].includes(c.peek(1) ?? '')) {
      c.i += 2;
      c.accept('back');
      result.commands.push({ type: 'cancelPushback' });
      continue;
    }
    if ((w === 'push' || w === 'pushback') && (c.peek(1) === 'cancelled' || (c.peek(1) === 'back' && c.peek(2) === 'cancelled'))) {
      c.i += c.peek(1) === 'back' ? 3 : 2;
      result.commands.push({ type: 'cancelPushback' });
      continue;
    }
    if (w === 'stop' && (c.peek(1) === 'push' || c.peek(1) === 'pushback' || (c.peek(1) === 'the' && ['push', 'pushback'].includes(c.peek(2) ?? '')))) {
      c.i += c.peek(1) === 'the' ? 3 : 2;
      c.accept('back');
      c.accept('immediately');
      result.commands.push({ type: 'stopPushback' });
      continue;
    }
    if (w === 'continue' && (c.peek(1) === 'push' || c.peek(1) === 'pushback')) {
      c.i += 2;
      c.accept('back');
      result.commands.push({ type: 'continue' });
      continue;
    }

    // ---------- sequence number / expected delay
    if (w === 'number' && /^\d$/.test(c.peek(1) ?? '')) {
      c.next();
      const n = Number(c.next());
      let what: string | undefined;
      if (c.accept('for')) {
        what = SEQUENCE_FOR[c.peek() ?? ''];
        if (what) {
          c.next();
          c.accept('back', 'up', 'off');
        }
      }
      result.commands.push({ type: 'sequence', number: n, for: what });
      continue;
    }
    if (w === 'expect' && SEQUENCE_FOR[c.peek(1) ?? '']) {
      const what = SEQUENCE_FOR[c.peek(1)!];
      const save = c.i;
      c.i += 2;
      c.accept('back', 'up', 'off', 'clearance');
      c.accept('in');
      c.accept('about', 'approximately');
      const n = /^\d+$/.test(c.peek() ?? '') ? Number(c.next()) : NaN;
      if (!Number.isNaN(n)) {
        c.accept('minutes', 'minute', 'min');
        result.commands.push({ type: 'expect', what, minutes: n });
      } else {
        c.i = save + 1;
      }
      continue;
    }

    // ---------- pushback / startup
    if (w === 'push' || w === 'pushback') {
      c.next();
      c.accept('back');
      let startup = false;
      const facing = readFacing();
      if (c.accept('and')) {
        if (c.accept('start', 'startup')) {
          c.accept('up');
          startup = true;
        } else c.i--;
      }
      c.accept('is', 'approved');
      c.accept('approved');
      result.commands.push({ type: 'pushback', facing: facing ?? readFacing(), startup });
      continue;
    }
    if (w === 'start' || w === 'startup') {
      c.next();
      c.accept('up');
      c.accept('approved');
      result.commands.push({ type: 'startup' });
      continue;
    }

    // ---------- taxi
    // ---------- vehicles: "proceed [to DCEEO | to stand 14 | to base] [via N, F]", "return to base"
    if (w === 'proceed') {
      c.next();
      const p: Extract<Command, { type: 'proceed' }> = { type: 'proceed', via: [] };
      while (!c.done()) {
        if (c.accept('to')) {
          c.accept('the');
          if (c.accept('base')) p.base = true;
          else if (c.peek() === 'fire' && c.peek(1) === 'station') {
            c.i += 2;
            p.base = true;
          } else if (['holding', 'runway', 'stand', 'gate', 'parking'].includes(c.peek()!)) {
            const d = readTaxiDestination();
            if (d) p.destination = d;
          } else {
            const m = matchCallsign(c.t, c.i, ctx.callsigns);
            if (!m) break;
            c.i += m.consumed;
            p.target = m.callsign;
          }
          continue;
        }
        if (c.accept('via', 'along')) {
          readVia(p.via);
          continue;
        }
        if (c.accept('and')) continue;
        break;
      }
      result.commands.push(p);
      continue;
    }
    if (w === 'return' && (c.peek(1) === 'to' || c.peek(1) === 'base')) {
      c.next();
      c.accept('to');
      c.accept('the');
      if (!c.accept('base') && c.peek() === 'fire' && c.peek(1) === 'station') c.i += 2;
      result.commands.push({ type: 'returnToBase' });
      continue;
    }

    // "follow the follow-me [to stand 14 via ...]" (before "follow <callsign>")
    const followMeAt = w === 'follow' ? (c.peek(1) === 'the' ? 2 : 1) : -1;
    if (followMeAt > 0 && ((c.peek(followMeAt) === 'follow' && c.peek(followMeAt + 1) === 'me') || c.peek(followMeAt) === 'followme')) {
      c.i += followMeAt + (c.peek(followMeAt) === 'followme' ? 1 : 2);
      if (/^\d$/.test(c.peek() ?? '')) c.next(); // "follow-me 1"
      result.commands.push({ type: 'followMe' });
      if (c.peek() !== 'to' && c.peek() !== 'via') continue;
      // the destination follows directly: parse it like a taxi instruction
      c.t[--c.i] = 'taxi';
    }
    const tow = w === 'tow' && c.peek(1) === 'approved';
    if (c.peek() === 'taxi' || tow || (w === 'continue' && c.peek(1) === 'taxi' && ['to', 'via'].includes(c.peek(2) ?? ''))) {
      if (c.peek() === 'continue' || tow) c.next();
      c.next();
      taxi = { type: 'taxi', via: [], holdShort: [], cross: [] };
      if (tow) taxi.tow = true;
      while (!c.done()) {
        if (c.accept('to')) {
          const d = readTaxiDestination();
          if (d) taxi.destination = d;
          continue;
        }
        if (c.accept('via', 'along')) {
          readVia(taxi.via);
          continue;
        }
        if (['holding', 'runway', 'stand', 'gate', 'parking'].includes(c.peek()!) && !taxi.destination) {
          const d = readTaxiDestination();
          if (d) {
            taxi.destination = d;
            continue;
          }
        }
        if (c.peek() === 'hold' && c.peek(1) === 'short') {
          c.i += 2;
          const t = readHoldShortTarget();
          if (t) taxi.holdShort.push(t);
          continue;
        }
        if (c.peek() === 'cross' && c.peek(1) === 'runway') {
          c.i += 2;
          const r = readRunway(c);
          if (r) taxi.cross.push(r);
          continue;
        }
        if (c.peek() === 'and' || c.peek() === 'then') {
          c.next();
          continue;
        }
        break;
      }
      result.commands.push(taxi);
      continue;
    }

    // ---------- hold short / hold position
    if (w === 'hold' || w === 'stop') {
      c.next();
      if (w === 'hold' && c.accept('short')) {
        const t = readHoldShortTarget();
        if (t) {
          if (taxi) taxi.holdShort.push(t);
          else pendingHoldShort.push(t);
        } else result.unparsed.push('hold short');
        continue;
      }
      c.accept('your');
      c.accept('position');
      result.commands.push({ type: 'holdPosition' });
      continue;
    }

    if (w === 'continue') {
      c.next();
      c.accept('taxi', 'taxiing');
      result.commands.push({ type: 'continue' });
      continue;
    }

    // ---------- runway crossing
    if (w === 'cross') {
      c.next();
      c.accept('runway');
      const r = readRunway(c);
      if (r) {
        if (taxi) taxi.cross.push(r);
        else pendingCross.push(r);
      } else result.unparsed.push('cross');
      continue;
    }

    // ---------- give way / follow
    if ((w === 'give' && c.peek(1) === 'way') || w === 'follow' || (w === 'behind' && false)) {
      const follow = w === 'follow';
      c.next();
      if (!follow) c.next();
      c.accept('to');
      c.accept('the');
      // optional type word before the callsign ("give way to the Airbus ...")
      let m: CallsignMatch | undefined;
      for (let k = 0; k < 4 && !m; k++) {
        m = matchCallsign(c.t, c.i + k, ctx.callsigns);
        if (m) c.i += k;
      }
      if (m) {
        c.i += m.consumed;
        result.commands.push(follow ? { type: 'follow', callsign: m.callsign } : { type: 'giveWay', callsign: m.callsign });
        // skip trailing description ("from the left", "passing left to right")
        while (!c.done() && !KEYWORDS.has(c.peek()!)) c.next();
      } else result.unparsed.push(follow ? 'follow' : 'give way');
      continue;
    }

    // ---------- frequency change
    if (w === 'contact' || w === 'monitor') {
      c.next();
      let station: StationType | undefined;
      // skip airport name ("stuttgart tower")
      for (let k = 0; k < 3; k++) {
        const s = STATION_WORDS[c.peek(k) ?? ''];
        if (s) {
          station = s;
          c.i += k + 1;
          break;
        }
      }
      c.accept('on');
      const frequency = readFrequency(c);
      result.commands.push({ type: 'handoff', station, frequency });
      continue;
    }
    if (w === 'frequency' && c.peek(1) === 'change') {
      c.i += 2;
      c.accept('approved');
      result.commands.push({ type: 'handoff' });
      continue;
    }

    // ---------- "are you able intersection D?" / "advise able for departure from D"
    if (w === 'able' || (['are', 'advise', 'confirm', 'can', 'report'].includes(w) && [1, 2, 3].some((k) => ['able', 'accept'].includes(c.peek(k) ?? '')))) {
      const save = c.i;
      while (!c.done() && !['able', 'accept'].includes(c.peek()!)) c.next();
      c.next();
      while (!c.done() && ABLE_FILLER.has(c.peek()!)) c.next();
      const name = readDesignator(c);
      if (name) {
        c.accept('runway');
        if (/^\d{2}[lrc]?$/.test(c.peek() ?? '')) readRunway(c);
        c.accept('departure');
        result.commands.push({ type: 'askIntersection', name });
        continue;
      }
      c.i = save;
    }

    // ---------- misc
    if (w === 'standby' || (w === 'stand' && c.peek(1) === 'by')) {
      c.i += w === 'standby' ? 1 : 2;
      result.commands.push({ type: 'standby' });
      continue;
    }
    if (w === 'expedite') {
      c.next();
      c.accept('taxi');
      result.commands.push({ type: 'expedite' });
      continue;
    }
    if (w === 'say' && c.peek(1) === 'again') {
      c.i += 2;
      result.commands.push({ type: 'sayAgain' });
      continue;
    }
    if (w === 'line' && c.peek(1) === 'up') {
      c.i += 2;
      result.commands.push({ type: 'lineUp' });
      continue;
    }
    // ---------- IFR clearance (Delivery)
    if (w === 'cleared' && c.peek(1) === 'to' && c.peek(2) === 'cross') {
      c.i += 2; // "cleared to cross runway 25" = "cross runway 25"
      continue;
    }
    if (w === 'cleared' && c.peek(1) === 'to') {
      c.i += 2;
      const clr: Extract<Command, { type: 'clearance' }> = { type: 'clearance' };
      const dest: string[] = [];
      while (!c.done() && !CLEARANCE_STOP.has(c.peek()!) && !matchSid(c, ctx.sids, false)) dest.push(c.next()!);
      if (dest.length) clr.destination = dest.join(' ');
      while (!c.done()) {
        if (c.accept('via', 'and', 'then', 'departure', 'sid', 'initially', 'initial')) continue;
        const sid = matchSid(c, ctx.sids, true);
        if (sid) {
          clr.sid = sid;
          continue;
        }
        // An unknown SID-like designator ("abc1x"): keep it, the pilot will query it.
        if (!clr.sid && /^[a-z]{2,5}\d[a-z]$/.test(c.peek() ?? '')) {
          clr.sid = c.next()!.toUpperCase();
          continue;
        }
        if (c.peek() === 'runway') {
          c.next();
          clr.runway = readRunway(c);
          continue;
        }
        if (c.accept('climb', 'maintain')) {
          clr.climb = readAltitude(c);
          continue;
        }
        if (c.accept('squawk')) {
          clr.squawk = readCode(c);
          continue;
        }
        if (c.accept('ctot', 'slot')) {
          c.accept('time');
          clr.ctot = readCode(c);
          continue;
        }
        break;
      }
      result.commands.push(clr);
      continue;
    }
    if (w === 'squawk') {
      c.next();
      const code = readCode(c);
      if (code) result.commands.push({ type: 'squawk', code });
      else result.unparsed.push('squawk');
      continue;
    }
    if (w === 'readback' || (w === 'read' && c.peek(1) === 'back')) {
      c.i += w === 'readback' ? 1 : 2;
      c.accept('correct', 'is');
      c.accept('correct');
      result.commands.push({ type: 'readbackCorrect' });
      continue;
    }
    if ((w === 'ctot' || w === 'slot') && c.peek(1) !== undefined) {
      c.next();
      c.accept('time', 'is');
      const time = readCode(c);
      if (time) result.commands.push({ type: 'ctot', time });
      else result.unparsed.push(w);
      continue;
    }

    if (w === 'cleared' && (c.peek(1) === 'for' || c.peek(1) === 'takeoff')) {
      c.next();
      c.accept('for');
      c.accept('takeoff', 'take');
      c.accept('off');
      result.commands.push({ type: 'takeoff' });
      continue;
    }

    // filler words
    c.next();
    if (!FILLER.has(w)) result.unparsed.push(w);
  }

  for (const t of pendingHoldShort) result.commands.push({ type: 'holdShort', target: t });
  for (const r of pendingCross) result.commands.push({ type: 'cross', runway: r });
  return result;
}

const FILLER = new Set([
  'roger', 'wilco', 'please', 'good', 'day', 'bye', 'goodbye', 'tschuess', 'servus', 'ciao', 'thanks',
  'thank', 'you', 'is', 'approved', 'the', 'and', 'then', 'now', 'correction', 'affirm', 'affirmative',
  'stuttgart', 'via', 'to', 'of', 'on', 'at', 'for', 'your', 'a', 'request', 'information', 'right', 'left',
  'negative', 'correction', 'say', 'feet',
]);
