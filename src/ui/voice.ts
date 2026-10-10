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

/** Apple's novelty voices (and other effect voices) - unsuitable for pilots, some are silent on iOS. */
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ/i;

/** iPhone, iPad (also iPadOS that reports itself as a Mac). */
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export class PilotVoices {
  enabled = false;
  volume = 1;
  /** Global speaking-rate factor (settings). */
  rate = 1;
  private voices: SpeechSynthesisVoice[] = [];
  /** While the controller transmits, pilot messages wait here (instead of pause(), which iOS never resumes). */
  private held: { callsign: string; text: string; rate: number }[] | null = null;
  private heldSince = 0;
  /** Utterances being spoken: Safari stops speaking an utterance that was garbage-collected. */
  private live = new Set<SpeechSynthesisUtterance>();
  private lastStart = 0;
  private unlocked = false;

  constructor() {
    if (!('speechSynthesis' in window)) return;
    // iOS / iPadOS only lets a page speak once speech was started from a tap (a click or the end
    // of a touch - a touchstart or pointerdown does not count): the first tap starts a silent
    // utterance, after that the pilots can speak at any time.
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      const u = new SpeechSynthesisUtterance('ok');
      u.volume = 0;
      u.lang = 'en-US';
      this.say(u);
      for (const ev of ['click', 'touchend', 'keydown']) document.removeEventListener(ev, unlock, true);
    };
    for (const ev of ['click', 'touchend', 'keydown']) document.addEventListener(ev, unlock, true);
    const load = () => {
      const all = window.speechSynthesis.getVoices().filter((v) => !NOVELTY.test(v.name));
      let en = all.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en'));
      // On iOS only voices installed on the device speak reliably.
      if (IOS) {
        const local = en.filter((v) => v.localService);
        if (local.length) en = local;
      }
      this.voices = en.length ? en : all;
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    // Safari sometimes gets stuck with utterances that never start: clear the queue then.
    setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.pending && !synth.speaking && performance.now() - this.lastStart > 8000) synth.cancel();
      // A transmission whose end was never reported must not keep the pilots silent.
      if (this.held && performance.now() - this.heldSince > 20000) this.release();
    }, 2000);
  }

  get supported(): boolean {
    return 'speechSynthesis' in window;
  }

  private say(u: SpeechSynthesisUtterance): void {
    const synth = window.speechSynthesis;
    // Safari can be left paused (e.g. after an interrupted utterance): nothing would be heard.
    if (synth.paused) synth.resume();
    this.live.add(u);
    const done = () => this.live.delete(u);
    u.onend = done;
    u.onerror = done;
    this.lastStart = performance.now();
    synth.speak(u);
  }

  /** Speaks a short test phrase; call it from a click so that iOS allows it. */
  test(text = 'Stuttgart Ground, pilot voices on'): void {
    if (!this.supported) return;
    this.unlocked = true;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voices.length) {
      u.voice = this.voices[0];
      u.lang = u.voice.lang;
    } else u.lang = 'en-US';
    u.volume = this.volume;
    this.say(u);
  }

  speak(callsign: string, text: string, rate = 1): void {
    if (!this.enabled || !this.supported || !text) return;
    if (this.held) {
      this.held.push({ callsign, text, rate });
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const hv = hash(callsign);
    if (this.voices.length) {
      u.voice = this.voices[hv % this.voices.length];
      u.lang = u.voice.lang;
    } else u.lang = 'en-US';
    u.pitch = 0.8 + ((hv >> 8) % 40) / 100;
    u.rate = Math.min(2, (1.05 + ((hv >> 16) % 25) / 100) * rate * this.rate);
    u.volume = this.volume;
    this.say(u);
  }

  cancel(): void {
    this.held = this.held ? [] : null;
    if (this.supported) window.speechSynthesis.cancel();
  }

  /**
   * While the controller is transmitting the pilots are silent (so the microphone doesn't hear
   * them): what is being said stops, new messages wait until release().
   */
  hold(): void {
    if (!this.supported || this.held) return;
    this.held = [];
    this.heldSince = performance.now();
    window.speechSynthesis.cancel();
  }

  /** Speaks the messages that came in during the transmission (the last three at most). */
  release(): void {
    const queued = this.held ?? [];
    this.held = null;
    // After the microphone iOS may leave the speech engine in a bad state: start clean.
    if (this.supported) window.speechSynthesis.cancel();
    for (const m of queued.slice(-3)) this.speak(m.callsign, m.text, m.rate);
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
  /** Final results of earlier recognition runs of this transmission (Safari ends a run at every pause). */
  private committed: string[][] = [];
  /** Final results of the current run; each entry holds the recogniser's alternatives for one phrase. */
  private finals: string[][] = [];
  /** Words heard but not yet final (Safari often never finalises the last phrase when stopped). */
  private interim = '';
  /** Results before this index were discarded (sent or cleared) and are not shown again. */
  private skip = 0;
  private seen = 0;
  /** The controller is transmitting (MIC on / key held): restart the recogniser when it stops by itself. */
  private wanted = false;
  private startedAt = 0;
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
      // Rebuilt from all results of this run each time: Safari (iOS) re-sends earlier results,
      // which would otherwise be added twice. Results discarded by discard() are skipped.
      this.seen = e.results.length;
      this.finals = [];
      let interim = '';
      for (let i = this.skip; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const alts: string[] = [];
          for (let k = 0; k < r.length; k++) alts.push(r[k].transcript.trim());
          this.finals.push(alts);
        } else interim += r[0].transcript;
      }
      this.interim = interim.trim();
      const text = this.text();
      if (text) this.onInterim(text);
    };
    rec.onend = () => {
      this.commitRun();
      // Safari stops after a short pause even in continuous mode: carry on while the controller still transmits.
      if (this.wanted && performance.now() - this.startedAt < 60_000) {
        try {
          rec.start();
          return;
        } catch {
          /* could not restart: end the transmission */
        }
      }
      this.finish();
    };
    rec.onerror = (e) => {
      // "no-speech" / "aborted" end the run; onend follows and decides.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        this.wanted = false;
        this.onState(this.listening, e.error);
      }
    };
    this.rec = rec;
  }

  /** Everything heard in this transmission so far. */
  private text(): string {
    return [...this.committed.map((f) => f[0]), ...this.finals.map((f) => f[0]), this.interim].filter(Boolean).join(' ').trim();
  }

  /** The run ended: keep what it heard (the last unfinished phrase too). */
  private commitRun(): void {
    this.committed.push(...this.finals);
    if (this.interim) this.committed.push([this.interim]);
    this.finals = [];
    this.interim = '';
    this.skip = 0;
    this.seen = 0;
  }

  private finish(): void {
    const candidates = combineAlternatives(this.committed);
    this.committed = [];
    this.wanted = false;
    this.listening = false;
    this.onState(false);
    if (candidates.length) this.onFinal(candidates);
  }

  get supported(): boolean {
    return !!this.rec;
  }

  /** Language/accent of the recogniser, e.g. "en-US" or "en-GB". */
  set lang(lang: string) {
    if (this.rec) this.rec.lang = lang;
  }

  /** Forgets what was heard so far (the command was sent or cleared): it does not come back. */
  discard(): void {
    this.skip = this.seen;
    this.committed = [];
    this.finals = [];
    this.interim = '';
  }

  start(): void {
    if (!this.rec || this.listening) return;
    this.committed = [];
    this.finals = [];
    this.interim = '';
    this.skip = 0;
    this.seen = 0;
    this.wanted = true;
    this.startedAt = performance.now();
    try {
      this.rec.start();
      this.listening = true;
      this.onState(true);
    } catch {
      this.wanted = false;
    }
  }

  stop(): void {
    if (!this.rec || !this.listening) return;
    this.wanted = false;
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
