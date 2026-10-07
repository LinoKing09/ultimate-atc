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
    u.rate = Math.min(2, (1.05 + ((hv >> 16) % 25) / 100) * rate);
    u.volume = this.volume;
    window.speechSynthesis.speak(u);
  }

  cancel(): void {
    if (this.supported) window.speechSynthesis.cancel();
  }
}

// Minimal typings for the (prefixed) SpeechRecognition API.
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

export class VoiceInput {
  private rec?: Recognition;
  private finalText = '';
  listening = false;

  constructor(
    private readonly onInterim: (text: string) => void,
    private readonly onFinal: (text: string) => void,
    private readonly onState: (listening: boolean, error?: string) => void,
  ) {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      this.onInterim((this.finalText + interim).trim());
    };
    rec.onend = () => {
      const text = this.finalText.trim();
      this.listening = false;
      this.onState(false);
      if (text) this.onFinal(text);
      this.finalText = '';
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

  start(): void {
    if (!this.rec || this.listening) return;
    this.finalText = '';
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
