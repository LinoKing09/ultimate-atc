/**
 * Learning from the controller's corrections: when a transmission from the speech recogniser is edited before it
 * is sent, the words the recogniser got wrong - for this voice, this accent, this microphone - are learnt
 * ("eight" heard where "hotel" was said). A learnt word is replaced in later transmissions once it has been
 * corrected often enough and more often than it was right; a word that is mostly right (it is a radio word too)
 * is never replaced. Pure functions; the store lives in the browser (ui).
 */

/** Per heard word: how often it was sent as it was, and what it was corrected to how often. */
export interface CorrectionStore {
  [heard: string]: { kept: number; to: Record<string, number> };
}

/** A correction is applied after it was made this often ... */
export const CORRECTION_MIN = 3;
/** ... and when it makes up at least this share of the times the word was heard. */
export const CORRECTION_SHARE = 0.75;

function words(text: string): string[] {
  return text.toLowerCase().replace(/[,;:!?.]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Word alignment (edit distance): pairs of [heard, sent] - one of them undefined for an inserted / dropped word. */
function align(a: string[], b: string[]): [string | undefined, string | undefined][] {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  const out: [string | undefined, string | undefined][] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      out.unshift([a[--i], b[--j]]);
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) out.unshift([a[--i], undefined]);
    else out.unshift([undefined, b[--j]]);
  }
  return out;
}

/** At most half of the words changed: a corrected version, not another instruction. */
function similar(a: string[], b: string[]): boolean {
  return align(a, b).filter(([x, y]) => x !== y).length <= Math.max(a.length, b.length) / 2;
}

/** `sent` is a corrected version of `heard` (some words changed, at most half of them). */
export function isCorrection(heard: string, sent: string): boolean {
  const a = words(heard);
  const b = words(sent);
  return a.join(' ') !== b.join(' ') && a.length > 0 && b.length > 0 && similar(a, b);
}

/**
 * Learns from one transmission: `heard` as the recogniser gave it, `sent` as the controller sent it. Only word
 * for word replacements count (a word left out or added says nothing about how a word sounds); a transmission
 * rewritten by more than half is no correction but another instruction and is ignored.
 */
export function learnCorrection(store: CorrectionStore, heard: string, sent: string): CorrectionStore {
  const a = words(heard);
  const b = words(sent);
  if (!a.length || !b.length || !similar(a, b)) return store;
  const pairs = align(a, b);
  for (const [x, y] of pairs) {
    if (!x || !y) continue;
    const e = (store[x] ??= { kept: 0, to: {} });
    if (x === y) e.kept++;
    else e.to[y] = (e.to[y] ?? 0) + 1;
  }
  return store;
}

/** The learnt replacement of a word, if it has been learnt well enough. */
function replacement(store: CorrectionStore, w: string): string | undefined {
  const e = store[w];
  if (!e) return undefined;
  const [to, n] = Object.entries(e.to).sort((x, y) => y[1] - x[1])[0] ?? [];
  if (!to || n < CORRECTION_MIN) return undefined;
  const total = e.kept + Object.values(e.to).reduce((s, c) => s + c, 0);
  return n / total >= CORRECTION_SHARE ? to : undefined;
}

/** Applies the learnt corrections to a transcript. */
export function applyCorrections(store: CorrectionStore, text: string): string {
  return words(text)
    .map((w) => replacement(store, w) ?? w)
    .join(' ');
}

/** The corrections learnt well enough to be applied (for the settings): [heard, replaced by]. */
export function learntCorrections(store: CorrectionStore): [string, string][] {
  return Object.keys(store)
    .map((w): [string, string | undefined] => [w, replacement(store, w)])
    .filter((x): x is [string, string] => !!x[1]);
}
