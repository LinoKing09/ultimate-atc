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
export function toSpoken(text: string): string {
  return text
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
      if (/^D[A-Z]{4}$/.test(tok)) return spell(tok);
      return tok;
    })
    .join('');
}
