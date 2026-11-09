import { TELEPHONY } from '../../data/airlines';

/**
 * Formatting helpers for radio messages.
 *
 * Every message exists in two forms:
 *  - text:   what is shown in the message window ("Lufthansa 5AB, stand 12")
 *  - spoken: what text-to-speech reads ("Lufthansa five alpha bravo, stand one two")
 * The spoken form is derived from the text with `toSpoken()`.
 */

export const PHONETIC: Record<string, string> = {
  A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel',
  I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa',
  Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
  X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
};

export const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];

/** Splits a callsign into operator prefix and flight identification ("DLH5AB" -> ["DLH", "5AB"]). */
export function splitCallsign(callsign: string): { prefix: string; suffix: string } {
  const m = /^([A-Z]{3})([0-9][0-9A-Z]*)$/.exec(callsign.toUpperCase());
  if (m) return { prefix: m[1], suffix: m[2] };
  return { prefix: '', suffix: callsign.toUpperCase() };
}

/** Radiotelephony callsign for display, e.g. "Lufthansa 5AB". Registrations stay as they are. */
export function telephonyCallsign(callsign: string): string {
  const { prefix, suffix } = splitCallsign(callsign);
  const tel = prefix ? TELEPHONY.get(prefix) : undefined;
  return tel ? `${tel} ${suffix}` : callsign.toUpperCase();
}

/** Spells a token character by character using the ICAO alphabet and digits. */
export function spell(token: string): string {
  return [...token.toUpperCase()]
    .map((c) => (c >= '0' && c <= '9' ? DIGITS[+c] : PHONETIC[c] ?? c))
    .join(' ');
}

/** Formats a frequency for speech: "118.805" -> "one one eight decimal eight zero five". */
export function spokenFrequency(freq: string): string {
  return freq
    .split('.')
    .map((p) => spell(p))
    .join(' decimal ');
}

/**
 * Converts a display message to a TTS-friendly string: numbers and
 * designators (G1, 5AB, single letters) are spelled out phonetically.
 */
/** Abbreviations that text-to-speech would otherwise read as a word. */
const SPELLED_ABBREVIATIONS: Record<string, string> = { QNH: 'Q-N-H', ILS: 'I-L-S', RVR: 'R-V-R', DCL: 'D-C-L', LVP: 'L-V-P', VOR: 'V-O-R', RNP: 'R-N-P' };

const SIDE: Record<string, string> = { L: 'left', R: 'right', C: 'centre' };

/** Three-letter words in capitals that are said as words, not spelled. */
const SAID_AS_WORD = new Set(['PAN', 'SID', 'ATC', 'GPS', 'RVR', 'DCL', 'LVP', 'VOR', 'RNP', 'ILS', 'QNH', 'CAT']);

export function toSpoken(text: string): string {
  return text
    // Altitudes in thousands and hundreds (ICAO): "5000 feet" -> "five thousand feet", "4500 feet" -> "four thousand five hundred feet".
    .replace(/\b(\d{1,2})(\d)00 feet\b/g, (_, th: string, hu: string) => `${spell(th)} thousand${hu === '0' ? '' : ` ${spell(hu)} hundred`} feet`)
    .replace(/\b([1-9])00 feet\b/g, (_, hu: string) => `${spell(hu)} hundred feet`)
    // Runway designators: "26R" -> "two six right".
    .replace(/\b(\d{2})([LRC])\b/g, (_, n: string, side: string) => `${spell(n)} ${SIDE[side]}`)
    .replace(/\b(QNH|ILS|RVR|DCL|LVP|VOR|RNP)\b/g, (abbr: string) => SPELLED_ABBREVIATIONS[abbr])
    .split(/(\s+|,|\.(?!\d))/)
    .map((tok) => {
      if (!tok || /^\s+$/.test(tok) || tok === ',' || tok === '.') return tok;
      if (/^\d+\.\d+$/.test(tok)) return spokenFrequency(tok);
      if (/^\d+$/.test(tok)) return spell(tok);
      // Callsign-like tokens (DLH5AB, DCMGB) and designators (G1, 5AB, K, 07L)
      if (/^[A-Z]{3}\d[0-9A-Z]*$/.test(tok) && TELEPHONY.has(tok.slice(0, 3))) {
        return `${TELEPHONY.get(tok.slice(0, 3))} ${spell(tok.slice(3))}`;
      }
      if (/^(?=.*\d)[0-9A-Z]{1,5}$/.test(tok)) return spell(tok);
      if (/^[A-Z]$/.test(tok)) return PHONETIC[tok];
      // Three-letter navaid identifiers ("direct LBU" -> "direct Lima Bravo Uniform").
      if (/^[A-Z]{3}$/.test(tok) && !SAID_AS_WORD.has(tok)) return spell(tok);
      if (/^D[A-Z]{4}$/.test(tok) || /^N\d{1,5}[A-Z]{0,2}$/.test(tok)) return spell(tok);
      return tok;
    })
    .join('');
}
