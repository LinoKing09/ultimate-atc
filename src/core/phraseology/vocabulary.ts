/**
 * The vocabulary of the radio: what the parser understands, the phonetic alphabet, numbers, and the names of the
 * session (radiotelephony callsigns of the traffic, station names, SIDs). Speech recognition knows nothing about
 * aviation and often hears an everyday word instead ("texi", "holding paint", "a proved", "clear for take of").
 * `snapToVocabulary` replaces every word outside the vocabulary by the vocabulary word that sounds most alike (or two
 * words that together sound like one), and `vocabularyScore` tells how much of a transcript is radio language - the
 * voice input uses both to pick the best of the recogniser's alternatives. The same words go to recognisers that
 * can be biased towards them (`recognitionPhrases`).
 */

import { TELEPHONY } from '../../data/airlines';
import { destinationName } from '../../data/destinations';
import type { Simulation } from '../simulation';
import { splitCallsign } from './speech';

/** Words of the controller's phraseology the parser understands (and common filler words). */
const PHRASEOLOGY = `
able abort aborted about accept advise affirm affirmative after again airport along altimeter altitude and approach
approved approximately apron are area around arriving at back backtrack base bay behind blue break by bye calm can
cancel cancelled center centre change ciao clear clearance cleared climb confirm contact continue correct
correction cross crossing ctot current day decimal degree degrees deicing de icing delay depart departing departure
dme east except expect expedite face facing feet filed final fire flight follow followme follow me foot for
frequency from gate give good goodbye ground gust gusting gusts handoff hectopascal hectopascals hold holding hpa
hundred icing immediate immediately in increase information initial initially intersection is it land landing
late left level line maintain maximum mile miles min minute minutes monitor negative normal north nose now number
of off on orange out pad parking planned please point position proceed push pushback qnh radar read readback
reason reduce rejected rejection report request resume return right roger route runway say sequence servus short
sid slot south speed squawk stand standby start startup state station stop take takeoff taxi taxiing taxiway
thank thanks the then thousand time to too tow tower delivery approach departure turn until up vacate variable
vector vectoring vectors via wait way west when wilco wind with you your all stations information current
holding readback correct pan mayday emergency ambulance tug turnaround around reason say again unable disregard
`;

const PHONETIC = 'alpha bravo charlie delta echo foxtrot golf hotel india juliett juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray x-ray yankee zulu';
const NUMBERS = 'zero one two three four five six seven eight nine niner ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand';

const BASE = new Set(`${PHRASEOLOGY} ${PHONETIC} ${NUMBERS}`.split(/\s+/).filter(Boolean));

/** What the session adds to the vocabulary. */
export interface VocabularyContext {
  /** Radiotelephony names of the operators present ("Lufthansa", "Speedbird", "Follow-me"). */
  telephony?: string[];
  /** Station names ("Stuttgart Ground", "Langen Radar", "Lindbergh Tower"). */
  stations?: string[];
  /** SID designators ("KUNOD2B": the spoken name "kunod"). */
  sids?: string[];
  /** Other words (taxiway words such as "west" in B12WEST, destinations ...). */
  extra?: string[];
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** The vocabulary of the radio for a session. */
export function voiceVocabulary(ctx: VocabularyContext = {}): Set<string> {
  const v = new Set(BASE);
  for (const t of ctx.telephony ?? []) for (const w of words(t)) v.add(w);
  for (const s of ctx.stations ?? []) for (const w of words(s)) v.add(w);
  // A SID is said as its name and the number and letter: "kunod two bravo".
  for (const sid of ctx.sids ?? []) {
    const name = /^[A-Z]+/.exec(sid.toUpperCase())?.[0];
    if (name && name.length > 2) v.add(name.toLowerCase());
  }
  for (const e of ctx.extra ?? []) for (const w of words(e)) v.add(w);
  return v;
}

/**
 * A key for how a word sounds (a small Metaphone): words that sound alike get the same key - "texi" and "taxi",
 * "point" and "paint", "charly" and "charlie". Vowels after the first letter count only as "a vowel was here".
 */
export function soundKey(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  w = w
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^x/, 's')
    .replace(/^wh/, 'w')
    .replace(/ph/g, 'f')
    .replace(/gh(?![aeiou])/g, '')
    .replace(/ck/g, 'k')
    .replace(/sch/g, 'sk')
    .replace(/th/g, '0')
    .replace(/sh/g, 'x')
    .replace(/tch|ch/g, 'x')
    .replace(/dg(?=[eiy])/g, 'j')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/v/g, 'f')
    .replace(/d$/, 't')
    .replace(/([a-z])\1+/g, '$1');
  const first = w[0];
  const rest = w
    .slice(1)
    .replace(/[aeiouy]+/g, '*')
    .replace(/[hw]/g, '');
  return (first + rest).replace(/\*$/, '').replace(/\*/g, '').replace(/([a-z0-9])\1+/g, '$1').toUpperCase();
}

/** Edit distance (Levenshtein). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

interface Index {
  vocab: Set<string>;
  byKey: Map<string, string[]>;
}

const indexCache = new WeakMap<Set<string>, Index>();

function indexOf(vocab: Set<string>): Index {
  let idx = indexCache.get(vocab);
  if (!idx) {
    const byKey = new Map<string, string[]>();
    for (const w of vocab) {
      if (w.length < 3) continue;
      const k = soundKey(w);
      byKey.set(k, [...(byKey.get(k) ?? []), w]);
    }
    idx = { vocab, byKey };
    indexCache.set(vocab, idx);
  }
  return idx;
}

/** The vocabulary word that sounds most like `w` (undefined: nothing close enough). */
function closest(idx: Index, w: string): string | undefined {
  const key = soundKey(w);
  if (!key) return undefined;
  // Same sound: the one spelt most alike.
  const same = idx.byKey.get(key);
  if (same) return [...same].sort((a, b) => editDistance(w, a) - editDistance(w, b))[0];
  // Almost the same sound (one sound off) and spelt alike: at most a third of the letters differ.
  let best: { word: string; d: number } | undefined;
  for (const [k, list] of idx.byKey) {
    if (Math.abs(k.length - key.length) > 1 || editDistance(k, key) > 1) continue;
    for (const cand of list) {
      const d = editDistance(w, cand);
      if (d <= Math.max(1, Math.floor(Math.max(w.length, cand.length) / 3)) && (!best || d < best.d)) best = { word: cand, d };
    }
  }
  return best?.word;
}

/** Words a recogniser hears that are no word of the radio, but must not be changed (numbers, single letters). */
function keep(w: string, vocab: Set<string>): boolean {
  return vocab.has(w) || /\d/.test(w) || w.length < 3;
}

/**
 * Replaces the words of a transcript that are no radio words by the radio word that sounds most like them, or two
 * neighbouring words by one ("a proved" -> "approved", "push back" stays two words of the vocabulary). Words with
 * nothing close stay as they were (the parser reports them).
 */
export function snapToVocabulary(text: string, vocab: Set<string>): string {
  const idx = indexOf(vocab);
  const toks = text.toLowerCase().replace(/[,;:!?]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    const next = toks[i + 1];
    // Two words heard for one ("a proved", "take of" stays: "take" and "off" are words).
    if (next && (!keep(w, vocab) || !keep(next, vocab))) {
      const joined = w + next;
      const one = vocab.has(joined) ? joined : !/\d/.test(joined) && joined.length >= 5 ? closest(idx, joined) : undefined;
      if (one && soundKey(one) === soundKey(joined)) {
        out.push(one);
        i++;
        continue;
      }
    }
    if (keep(w, vocab)) {
      out.push(w);
      continue;
    }
    out.push(closest(idx, w) ?? w);
  }
  return out.join(' ');
}

/** Share of the words of a transcript that are radio words (numbers count): 0 ... 1. */
export function vocabularyScore(text: string, vocab: Set<string>): number {
  const toks = text.toLowerCase().replace(/[,;:!?]/g, ' ').split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  return toks.filter((w) => keep(w, vocab)).length / toks.length;
}

/** Phrases a recogniser that can be biased (contextual biasing) should expect, with the session's names. */
export function recognitionPhrases(ctx: VocabularyContext = {}): string[] {
  const fixed = [
    'push and start approved', 'pushback approved', 'taxi to holding point', 'taxi to stand', 'hold short of runway',
    'cross runway', 'line up and wait', 'cleared for take-off', 'cleared to land', 'contact ground', 'contact tower',
    'contact radar', 'hold position', 'continue taxi', 'give way to', 'follow the follow-me', 'readback correct',
    'start-up approved', 'cleared to', 'squawk', 'information', 'QNH', 'vacate via', 'go around', 'stop immediately',
    'expedite', 'standby', 'roger', 'say again', 'say reason', 'break break', 'behind', 'via', 'facing east',
    'facing west', 'facing north', 'facing south', 'request', 'tow approved', 'report position', 'turn around',
    ...PHONETIC.split(' '),
  ];
  return [...new Set([...fixed, ...(ctx.telephony ?? []), ...(ctx.stations ?? [])])];
}

/** The vocabulary context of a session: the operators, stations, SIDs, destinations and taxiway words in it. */
export function sessionVocabulary(sim: Simulation): VocabularyContext {
  const telephony = new Set<string>();
  for (const cs of sim.radioCallsigns) {
    const t = TELEPHONY.get(splitCallsign(cs).prefix);
    if (t) telephony.add(t);
  }
  const destinations = new Set<string>();
  for (const a of sim.aircraft) if (a.flightPlan?.destination) destinations.add(destinationName(a.flightPlan.destination));
  return {
    telephony: [...telephony],
    stations: sim.config.airport.stations.map((st) => st.name),
    sids: sim.sidNames,
    // Destinations (IFR clearance), the airport's name, and the words in taxiway names ("B12WEST").
    extra: [...destinations, sim.config.airport.name, ...(sim.airspace?.fixNames.filter((f) => f.length > 3) ?? []), ...[...sim.airport.taxiwayNames].filter((t) => /[A-Z]{3,}/.test(t)).map((t) => t.replace(/[^A-Z]/g, ' '))],
  };
}
