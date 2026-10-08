/**
 * Voice I/O using the browser's Web Speech API.
 *  - Text-to-speech for pilot transmissions (every pilot gets a stable voice,
 *    pitch and rate derived from the callsign).
 *  - Speech recognition for controller transmissions (push-to-talk). Only
 *    available in browsers that implement SpeechRecognition (Chrome, Edge).
 */

function hash(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}

export class PilotVoices {
  enabled = false;
  volume = 1;
  /** Global speaking-rate factor (settings). */
  rate = 1;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (!('speechSynthesis' in window)) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const en = all.filter((v) => v.lang.toLowerCase().startsWith('en'));
      this.voices = en.length ? en : all;
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  get supported(): boolean {
    return 'speechSynthesis' in window;
  }

  speak(callsign: string, text: string, rate = 1): void {
    if (!this.enabled || !this.supported || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    const hv = hash(callsign);
    if (this.voices.length) u.voice = this.voices[hv % this.voices.length];
    u.pitch = 0.8 + ((hv >> 8) % 40) / 100;
    u.rate = Math.min(2, (1.05 + ((hv >> 16) % 25) / 100) * rate * this.rate);
    u.volume = this.volume;
    window.speechSynthesis.speak(u);
  }

  cancel(): void {
    if (this.supported) window.speechSynthesis.cancel();
  }

  /** Pauses speech while the controller is transmitting (so the microphone doesn't hear the pilots). */
  pause(): void {
    if (this.supported) window.speechSynthesis.pause();
  }

  resume(): void {
    if (this.supported) window.speechSynthesis.resume();
  }
}

// Minimal typings for the (prefixed) SpeechRecognition API.
interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; length: number; [i: number]: RecognitionAlternative }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

export class VoiceInput {
  private rec?: Recognition;
  /** Final results so far; each entry holds the recogniser's alternatives for one phrase. */
  private finals: string[][] = [];
  listening = false;

  constructor(
    private readonly onInterim: (text: string) => void,
    /** Called with candidate transcripts (best guess first) when the transmission ends. */
    private readonly onFinal: (candidates: string[]) => void,
    private readonly onState: (listening: boolean, error?: string) => void,
  ) {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const alts: string[] = [];
          for (let k = 0; k < r.length; k++) alts.push(r[k].transcript.trim());
          this.finals.push(alts);
        } else interim += r[0].transcript;
      }
      this.onInterim(`${this.finals.map((f) => f[0]).join(' ')} ${interim}`.trim());
    };
    rec.onend = () => {
      const candidates = combineAlternatives(this.finals);
      this.listening = false;
      this.onState(false);
      if (candidates.length) this.onFinal(candidates);
      this.finals = [];
    };
    rec.onerror = (e) => {
      this.listening = false;
      this.onState(false, e.error);
    };
    this.rec = rec;
  }

  get supported(): boolean {
    return !!this.rec;
  }

  /** Language/accent of the recogniser, e.g. "en-US" or "en-GB". */
  set lang(lang: string) {
    if (this.rec) this.rec.lang = lang;
  }

  start(): void {
    if (!this.rec || this.listening) return;
    this.finals = [];
    try {
      this.rec.start();
      this.listening = true;
      this.onState(true);
    } catch {
      /* already started */
    }
  }

  stop(): void {
    if (!this.rec || !this.listening) return;
    this.rec.stop();
  }
}

/**
 * Builds complete candidate transcripts from per-phrase alternatives: the
 * best guess, plus variants where one phrase is replaced by one of its
 * alternatives (at most ~25 candidates).
 */
export function combineAlternatives(finals: string[][]): string[] {
  if (!finals.length) return [];
  const best = finals.map((f) => f[0]);
  const out = [best.join(' ')];
  finals.forEach((alts, i) => {
    for (let k = 1; k < alts.length; k++) {
      const v = [...best];
      v[i] = alts[k];
      out.push(v.join(' '));
    }
  });
  return [...new Set(out.map((t) => t.trim()).filter(Boolean))].slice(0, 25);
}
