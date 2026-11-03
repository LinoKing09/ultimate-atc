import { soundKey } from './vocabulary';

/**
 * The grammar of the own speech recogniser (Vosk): it recognises only the words of the radio vocabulary - nothing
 * else can come out. Vosk's model knows a fixed lexicon of English words; a radio word it does not know is said
 * as words it knows ("eurowings" -> "euro wings", "qnh" -> "q n h", "juliett" -> "juliet") and joined again after
 * recognition (`fromVosk`).
 */
export interface VoskGrammar {
  /** The words Vosk may recognise. */
  words: string[];
  /** Word sequences to join again after recognition: [what Vosk says, the radio word]. */
  joins: [string[], string][];
}

/**
 * How radio words the model does not know are said, in words it knows (where the automatic split would sound
 * wrong): abbreviations letter by letter, names as they are pronounced on the radio.
 */
const SPOKEN: Record<string, string> = {
  qnh: 'q n h', ctot: 'see tot', atis: 'a tis', dme: 'd m e', hpa: 'h p a', sid: 'sid', xray: 'x ray', juliett: 'juliet',
  readback: 'read back', followme: 'follow me', hectopascal: 'hector pascal', hectopascals: 'hector pascal', deicing: 'de icing',
  eurowings: 'euro wings', speedbird: 'speed bird', sunexpress: 'sun express', sunturk: 'sun turk', hansaline: 'hansa line',
  tuijet: 'tui jet', airfrans: 'air france', corendon: 'coren don', koreanair: 'korean air', royalair: 'royal air', iceair: 'ice air',
  japanair: 'japan air', cargolux: 'cargo lux', whitestar: 'white star', vietjet: 'viet jet', thaiviet: 'thai viet', eurotrans: 'euro trans',
  nuernberg: 'nuremberg', koeln: 'cologne', sylt: 'silt', servus: 'service',
};

/** A piece of a split: words with a vowel and of some length sound like words; others are poor pieces. */
function pieceCost(part: string, whole: string): number {
  return 1 + (/[aeiouy]/.test(part) ? 0 : 1.5) + (part.length < 3 && whole.length > 4 ? 1 : 0);
}

/** Splits `w` into words of the lexicon, at the lowest cost (few, word-like pieces); single letters only for short abbreviations. */
function segment(w: string, lexicon: Set<string>, minPart = w.length <= 4 ? 1 : 2): string[] | undefined {
  const best: ({ parts: string[]; cost: number } | undefined)[] = new Array(w.length + 1).fill(undefined);
  best[0] = { parts: [], cost: 0 };
  for (let i = 1; i <= w.length; i++) {
    for (let j = 0; j <= i - minPart; j++) {
      const prev = best[j];
      const part = w.slice(j, i);
      if (!prev || !lexicon.has(part)) continue;
      const cost = prev.cost + pieceCost(part, w);
      const cur = best[i];
      if (!cur || cost < cur.cost) best[i] = { parts: [...prev.parts, part], cost };
    }
  }
  const r = best[w.length];
  return r && r.parts.length > 1 ? r.parts : undefined;
}

function editDistance(a: string, b: string): number {
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

const keyIndex = new WeakMap<Set<string>, Map<string, string[]>>();

/** A lexicon word that sounds like `w` (the same sound key, spelt most alike). */
function soundAlike(w: string, lexicon: Set<string>): string | undefined {
  let idx = keyIndex.get(lexicon);
  if (!idx) {
    idx = new Map();
    for (const x of lexicon) {
      const k = soundKey(x);
      const list = idx.get(k);
      if (list) list.push(x);
      else idx.set(k, [x]);
    }
    keyIndex.set(lexicon, idx);
  }
  const list = idx.get(soundKey(w));
  if (!list) return undefined;
  const dist = (a: string) => Math.abs(a.length - w.length) + [...a].filter((c, i) => c !== w[i]).length;
  return [...list].sort((a, b) => dist(a) - dist(b))[0];
}

/** The grammar for the radio vocabulary `vocab`, with the words of Vosk's `lexicon`. */
export function voskGrammar(vocab: Iterable<string>, lexicon: Set<string>): VoskGrammar {
  const words = new Set<string>();
  const joins: [string[], string][] = [];
  const radio = new Set([...vocab].map((v) => v.toLowerCase().replace(/[^a-z']/g, '')));
  for (const raw of radio) {
    const w = raw.toLowerCase().replace(/[^a-z']/g, '');
    if (!w) continue;
    if (lexicon.has(w)) {
      words.add(w);
      continue;
    }
    // How it is said: the curated form, a word that sounds alike and is spelt almost alike ("juliett" -> "juliet";
    // not one that is itself a radio word - it would be changed everywhere), a split into words, and last pieces
    // down to single letters ("imvur") - better than not at all.
    const spoken = SPOKEN[w]?.split(' ');
    const alike = soundAlike(w, lexicon);
    const close = alike && !radio.has(alike) && editDistance(alike, w) <= 2 ? [alike] : undefined;
    const parts =
      (spoken?.every((p) => lexicon.has(p)) ? spoken : undefined) ??
      close ??
      segment(w, lexicon) ??
      (alike && !radio.has(alike) ? [alike] : undefined) ??
      segment(w, lexicon, 1);
    if (!parts) continue;
    for (const p of parts) words.add(p);
    joins.push([parts, w]);
  }
  return { words: [...words].sort(), joins };
}

/** Joins what Vosk heard back into radio words ("euro wings" -> "eurowings") and drops "[unk]". */
export function fromVosk(text: string, joins: [string[], string][]): string {
  const toks = text.toLowerCase().split(/\s+/).filter((t) => t && t !== '[unk]');
  // Longest sequences first; a single replaced word only where it is not itself a radio word.
  const sorted = [...joins].sort((a, b) => b[0].length - a[0].length);
  const out: string[] = [];
  for (let i = 0; i < toks.length; ) {
    const hit = sorted.find(([parts]) => parts.every((p, k) => toks[i + k] === p));
    if (hit) {
      out.push(hit[1]);
      i += hit[0].length;
    } else out.push(toks[i++]);
  }
  return out.join(' ');
}
