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

/**
 * Apple's novelty and effect voices: they sing ("Bells", "Good News", "Cellos", "Organ"), laugh ("Hysterical"), whisper
 * or wobble - unsuitable for pilots, some are silent on iOS. Their names are translated on a device in another
 * language (German: "Glocken", "Gute Nachrichten", "Orgel" ...), so they are recognised by their identifier first:
 * `com.apple.speech.synthesis.voice.*` (the old macOS voices - only Alex is a normal voice) and
 * `com.apple.eloquence.*` (Grandma, Grandpa, Rocko ...).
 */
const NOVELTY_URI = /speech\.synthesis\.voice\.(?!alex\b)|eloquence/i;
const NOVELTY_NAME =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|junior|ralph|fred|kathy|princess|grandma|grandpa|rocko|eddy|flo|reed|sandy|shelley|glocken|gute nachrichten|schlechte nachrichten|orgel|blubbern|blasen|fl\u00fcstern|hysterisch|narr|wackeln|verr\u00fcckt|oma|opa)\b/i;

/**
 * The voice of a pilot, the same for a callsign every time: which of the voices, the pitch (0.92-1.08: a little higher
 * or lower, more makes some voices sound strange) and the speaking rate (1.05-1.29). Unsigned shifts: the hash is
 * above 2^31 for half of the callsigns (a signed shift gave those a pitch down to 0.4 and slow speech before).
 */
export function pilotVoiceStyle(callsign: string): { voice: number; pitch: number; rate: number } {
  const hv = hash(callsign);
  return { voice: hv, pitch: 0.92 + ((hv >>> 8) % 17) / 100, rate: 1.05 + ((hv >>> 16) % 25) / 100 };
}

export function normalVoice(v: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>): boolean {
  return !NOVELTY_URI.test(v.voiceURI ?? '') && !NOVELTY_NAME.test(v.name);
}

/**
 * Radio noise under a pilot's transmission: band-limited hiss (like an AM receiver) with a short squelch tail when
 * the transmission ends. Web Audio; started from the first tap (iOS needs that, as for speech).
 */
class RadioNoise {
  private ctx?: AudioContext;
  private noise?: AudioBuffer;
  private current?: { src: AudioBufferSourceNode; gain: GainNode };

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume?.();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      // Fixed pseudo-random noise (no Math.random: same hiss every time, and nothing to do with the simulation).
      let x = 12345;
      for (let i = 0; i < len; i++) {
        x = (Math.imul(x, 1103515245) + 12345) >>> 0;
        data[i] = (x / 0xffffffff) * 2 - 1;
      }
      void this.ctx.resume?.();
    } catch {
      this.ctx = undefined;
    }
  }

  /** Starts the hiss; returns a handle for stop() (undefined without audio). */
  start(volume: number): object | undefined {
    const ctx = this.ctx;
    if (!ctx || !this.noise || volume <= 0) return undefined;
    this.stop(false);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    const level = 0.035 * volume;
    // The carrier comes up with a short crackle, then a quiet hiss under the voice.
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level * 2.2, ctx.currentTime + 0.03);
    gain.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.15);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start();
    this.current = { src, gain };
    return this.current;
  }

  /**
   * Ends the hiss; `tail`: the short squelch burst of a transmission that ends normally. With a handle only that
   * transmission's hiss (a cancelled utterance may report its end after the next one has started).
   */
  stop(tail = true, handle?: object): void {
    const ctx = this.ctx;
    const cur = this.current;
    if (!ctx || !cur || (handle && handle !== cur)) return;
    this.current = undefined;
    const t = ctx.currentTime;
    const g = cur.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (tail) {
      g.linearRampToValueAtTime(g.value * 2.5, t + 0.02);
      g.linearRampToValueAtTime(0, t + 0.14);
      cur.src.stop(t + 0.15);
    } else {
      g.linearRampToValueAtTime(0, t + 0.03);
      cur.src.stop(t + 0.04);
    }
  }
}

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
  /** Pilot transmissions being spoken (not the test phrase). */
  private pilotLive = new Set<SpeechSynthesisUtterance>();
  private lastStart = 0;
  private unlocked = false;
  private readonly noise = new RadioNoise();
  /** Radio noise under the pilots' transmissions. */
  radioNoise = true;

  constructor() {
    if (!('speechSynthesis' in window)) return;
    // iOS / iPadOS only lets a page speak once speech was started from a tap (a click or the end
    // of a touch - a touchstart or pointerdown does not count): the first tap starts a silent
    // utterance, after that the pilots can speak at any time.
    const unlock = () => {
      this.noise.unlock();
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
      const all = window.speechSynthesis.getVoices().filter(normalVoice);
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

  /** A pilot's transmission is being read aloud right now. */
  get pilotSpeaking(): boolean {
    return this.enabled && this.pilotLive.size > 0 && window.speechSynthesis.speaking;
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
    this.noise.unlock();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voices.length) {
      u.voice = this.voices[0];
      u.lang = u.voice.lang;
    } else u.lang = 'en-US';
    u.volume = this.volume;
    this.withNoise(u);
    this.say(u);
  }

  /** Radio noise while the utterance is spoken (from its start: the speech engine may begin later). */
  private withNoise(u: SpeechSynthesisUtterance): void {
    if (!this.radioNoise) return;
    let safety: ReturnType<typeof setTimeout> | undefined;
    let handle: object | undefined;
    u.addEventListener('start', () => {
      handle = this.noise.start(this.volume);
      // An end that is never reported must not leave the hiss running.
      safety = setTimeout(() => this.noise.stop(true, handle), 20000);
    });
    const end = () => {
      if (safety) clearTimeout(safety);
      if (handle) this.noise.stop(true, handle);
    };
    u.addEventListener('end', end);
    u.addEventListener('error', end);
  }

  speak(callsign: string, text: string, rate = 1): void {
    if (!this.enabled || !this.supported || !text) return;
    if (this.held) {
      this.held.push({ callsign, text, rate });
      return;
    }
    // At high simulation rates the pilots talk faster than the voices can speak: rather than falling minutes behind
    // the radio, drop what is still waiting and go on with the newest transmission.
    if (this.live.size >= 3) {
      window.speechSynthesis.cancel();
      this.live.clear();
      this.pilotLive.clear();
    }
    const u = new SpeechSynthesisUtterance(text);
    const style = pilotVoiceStyle(callsign);
    if (this.voices.length) {
      u.voice = this.voices[style.voice % this.voices.length];
      u.lang = u.voice.lang;
    } else u.lang = 'en-US';
    u.pitch = style.pitch;
    u.rate = Math.min(2, style.rate * rate * this.rate);
    u.volume = this.volume;
    this.withNoise(u);
    this.pilotLive.add(u);
    const done = () => this.pilotLive.delete(u);
    u.addEventListener('end', done);
    u.addEventListener('error', done);
    this.say(u);
  }

  cancel(): void {
    this.noise.stop(false);
    this.pilotLive.clear();
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
    this.noise.stop(false);
    this.pilotLive.clear();
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
  /** Contextual biasing (newer Chrome, on-device recognition): phrases the recogniser should expect. */
  phrases?: unknown[];
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
  /** Phrases to bias the recogniser towards (radio language), where it can be biased. */
  phrases: () => string[] = () => [];
  /** The recogniser refused phrases (biasing not supported for this language / without on-device recognition). */
  private phrasesRefused = false;

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
      // Biasing not available here: go on without it (the run that refused it ends; onend restarts it).
      if (e.error === 'phrases-not-supported') {
        this.phrasesRefused = true;
        if (this.rec) this.rec.phrases = [];
        return;
      }
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
    this.applyPhrases();
    try {
      this.rec.start();
      this.listening = true;
      this.onState(true);
    } catch {
      this.wanted = false;
    }
  }

  /** Biases the recogniser towards the radio language, where the browser supports it (SpeechRecognitionPhrase). */
  private applyPhrases(): void {
    const Phrase = (window as unknown as { SpeechRecognitionPhrase?: new (phrase: string, boost: number) => unknown }).SpeechRecognitionPhrase;
    if (!this.rec || !Phrase || this.phrasesRefused || !('phrases' in this.rec)) return;
    try {
      this.rec.phrases = this.phrases().map((p) => new Phrase(p, 5));
    } catch {
      this.phrasesRefused = true;
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
