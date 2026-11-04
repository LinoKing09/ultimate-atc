import type { KaldiRecognizer, Model } from 'vosk-browser';
import { fromVosk, voskPhraseGrammar } from '../core/phraseology/voskGrammar';

/**
 * The own speech recogniser: Vosk (Kaldi) running in the browser as WebAssembly, independent of the browser's
 * speech recognition (no Google / Apple service, offline once loaded). It is limited to a grammar of the radio
 * phrases of the session (radioPhrases: the phraseology in its order, the callsigns, holding points, stands and
 * frequencies of the session) - it can recognise nothing but radio words, and inside a phrase only in its order. Model: vosk-model-small-en-us-0.15
 * (Apache 2.0), served with the app from models/ (npm run voice-model); loaded on the first transmission.
 *
 * Same interface as VoiceInput: start() on push-to-talk, stop() on release; onInterim while speaking, onFinal with
 * the transcript when the transmission ends.
 */

/** The speech models (npm run voice-model): the small one by default, the large one optional (settings). */
export const VOSK_MODELS = {
  small: { name: 'vosk-model-small-en-us-0.15', size: 'about 40 MB' },
  large: { name: 'vosk-model-en-us-0.22-lgraph', size: 'about 128 MB' },
} as const;
export type VoskModelSize = keyof typeof VOSK_MODELS;
/** Audio kept from before the key press (s). */
const PRE_ROLL_S = 0.35;
/** An open microphone that delivers nothing this long after the press is opened again (ms). */
const MIC_SILENT_MS = 600;
/** After the release the recogniser still has a little audio to finish: at most this long (ms). */
const FINAL_RESULT_WAIT_MS = 2000;

export class VoskInput {
  listening = false;
  /** The radio phrases of the session, asked for at every transmission. */
  phrases: () => Iterable<string> = () => [];
  private model?: Model;
  private lexicon?: Set<string>;
  private loading?: Promise<void>;
  /** Why the model could not be loaded, and which model (another one gets its chance). */
  private failedWith?: { size: VoskModelSize; error: string };
  private ctx?: AudioContext;
  private stream?: MediaStream;
  /** Kept referenced while the microphone is open (Safari stops a processor nobody holds). */
  node?: ScriptProcessorNode;
  private rec?: KaldiRecognizer;
  private joins: [string[], string][] = [];
  /** Final pieces of this transmission (Vosk finishes a piece at every pause) and the piece in progress. */
  private heard: string[] = [];
  private partial = '';
  private finishTimer?: ReturnType<typeof setTimeout>;
  private finishing = false;
  /**
   * Audio not yet given to a recogniser: the last PRE_ROLL_S before the key press (the first word - mostly the
   * callsign - is often spoken while the key goes down), and everything while the recogniser is being made.
   */
  private pending: Float32Array[] = [];
  /** Audio blocks taken in during this transmission (0: the microphone delivered nothing - the audio was not running). */
  private captured = 0;

  constructor(
    private readonly onInterim: (text: string) => void,
    private readonly onFinal: (candidates: string[]) => void,
    private readonly onState: (listening: boolean, error?: string) => void,
    /** Progress for the user (loading the model). */
    private readonly onStatus: (text: string) => void,
    /**
     * What the MIC button shows: 'waiting' (pressed, the microphone is not capturing yet), 'recording', 'processing'
     * (released, the recogniser finishes), 'idle'.
     */
    private readonly onPhase: (phase: 'waiting' | 'recording' | 'processing' | 'idle') => void = () => {},
  ) {}
  /** Released before the recogniser was ready: it finishes as soon as it is (nothing said is dropped). */
  private stopRequested = false;

  get supported(): boolean {
    return typeof WebAssembly === 'object' && typeof Worker !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  }

  /** The model could not be loaded (then the browser's recogniser takes over). */
  get failed(): string | undefined {
    return this.failedWith?.size === this.modelSize() ? this.failedWith.error : undefined;
  }

  /** The model is the model: the accent setting is for the browser's recogniser. */
  set lang(_: string) {}

  /** Forgets what was heard so far (sent or cleared). */
  discard(): void {
    this.heard = [];
    this.partial = '';
  }

  /**
   * Keep the microphone open between transmissions (pre-roll, no waiting at the press). False on the iPad with the
   * pilot voices on: there the speech synthesis takes an open microphone away (it goes silent), so it is opened at
   * every press and let go after the transmission.
   */
  keepMicOpen: () => boolean = () => true;

  /** Which model to use (settings); asked at every transmission - a change loads the other model. */
  modelSize: () => VoskModelSize = () => 'small';
  private loadedSize?: VoskModelSize;

  private load(): Promise<void> {
    const size = this.modelSize();
    if (this.loadedSize !== size) {
      // Another model chosen: the old one is let go (its worker ends), the new one loads.
      this.model?.terminate();
      this.model = undefined;
      this.loading = undefined;
      this.loadedSize = size;
    }
    const { name, size: mb } = VOSK_MODELS[size];
    this.loading ??= (async () => {
      this.onStatus(`Loading the speech model (${mb}, only the first time) ...`);
      const [{ createModel }, lexicon] = await Promise.all([
        import('vosk-browser'),
        fetch(`models/${name}.lexicon.txt`).then((r) => {
          if (!r.ok) throw new Error(`lexicon: HTTP ${r.status}`);
          return r.text();
        }),
      ]);
      this.lexicon = new Set(lexicon.split('\n').filter(Boolean));
      // Log level -1: errors only (the worker would log every file it unpacks).
      this.model = await createModel(new URL(`models/${name}.tar.gz`, document.baseURI).href, -1);
      this.onStatus('Speech model ready.');
    })();
    return this.loading;
  }

  /**
   * The open microphone no longer delivers sound: on iOS the pilot voices (speech synthesis) take the audio over and
   * end or mute its track, or interrupt the audio context.
   */
  private micStale = false;

  private micDead(): boolean {
    const tracks = this.stream?.getAudioTracks() ?? [];
    return this.micStale || !tracks.length || tracks.some((t) => t.readyState === 'ended' || t.muted);
  }

  /** Lets the microphone go (the next transmission opens it again). */
  private closeMic(): void {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = undefined;
    if (this.node) this.node.onaudioprocess = null;
    this.node?.disconnect();
    this.node = undefined;
    this.micStale = false;
  }

  /** The microphone, kept open after the first transmission (one permission prompt) - opened again when it went dead. */
  private async openMic(): Promise<void> {
    if (this.stream && !this.micDead()) return;
    if (this.stream) this.closeMic();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.stream = stream;
    for (const t of stream.getAudioTracks()) {
      const stale = () => {
        if (this.stream === stream) this.micStale = true;
      };
      t.addEventListener('ended', stale);
      t.addEventListener('mute', stale);
    }
    const ctx = this.audio();
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor: deprecated, but available everywhere (also Safari on the iPad) and simple.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (this.listening) this.captured++;
      if ((this.listening || this.finishing) && this.rec) {
        this.rec.acceptWaveform(e.inputBuffer);
        return;
      }
      // Released while the recogniser is being made: what was said is kept as it is, nothing more is added.
      if (this.stopRequested) return;
      // Kept: before a transmission the last PRE_ROLL_S, while the recogniser is being made all of it.
      this.pending.push(e.inputBuffer.getChannelData(0).slice());
      if (!this.listening) {
        const keep = Math.max(1, Math.ceil((PRE_ROLL_S * e.inputBuffer.sampleRate) / e.inputBuffer.length));
        if (this.pending.length > keep) this.pending.splice(0, this.pending.length - keep);
      }
    };
    src.connect(node);
    // Connected to the output (silent) - otherwise some browsers never call onaudioprocess.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
    this.node = node;
  }

  /** The audio context, created on first use (it belongs to a tap or key press on iOS). */
  private audio(): AudioContext {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx ??= new Ctx();
    return this.ctx;
  }

  /**
   * Called on every tap, click and key press: Safari on the iPad lets the audio start only from the release of a tap
   * (pressing PTT / MIC is no such moment), so the audio is started - or resumed after the pilot voices interrupted it
   * - by the taps before. `prepare`: also load the speech model and open the microphone now, so the first press
   * records at once (the realistic mode, where every instruction is spoken).
   */
  unlock(prepare = false): void {
    if (!this.supported || this.failed) return;
    const ctx = this.audio();
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    if (prepare && !this.stream && !this.preparing) {
      this.preparing = true;
      void Promise.all([this.load(), this.keepMicOpen() ? this.openMic() : undefined])
        .catch(() => {
          /* start() tries again and reports the error */
        })
        .finally(() => (this.preparing = false));
    }
  }

  private preparing = false;
  private watchdog?: ReturnType<typeof setTimeout>;

  start(): void {
    if (this.listening || this.failed) return;
    // Pressed again before the recogniser was even ready: the same transmission goes on.
    if (this.stopRequested) {
      this.stopRequested = false;
      this.finishing = false;
      this.listening = true;
      this.onPhase(this.stream ? 'recording' : 'waiting');
      return;
    }
    // Pressed again while the last transmission is still being finished: that one is sent first, with what was heard.
    if (this.finishing) this.finish();
    // The audio context belongs to the key press / tap (iOS): created or resumed before anything is awaited.
    void this.audio().resume().catch(() => {});
    this.captured = 0;
    this.listening = true;
    this.finishing = false;
    this.stopRequested = false;
    this.discard();
    this.onState(true);
    // Recording from the first moment where the microphone is open and alive (its audio is kept); else as soon as it is.
    const alive = !!this.stream && !this.micDead();
    this.onPhase(alive ? 'recording' : 'waiting');
    // No sound from an open microphone soon after the press (iOS after the pilot voices): open it again.
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (!this.listening || this.captured) return;
      this.micStale = true;
      this.onPhase('waiting');
      void this.audio().resume().catch(() => {});
      void this.openMic()
        .then(() => {
          if (this.listening) this.onPhase('recording');
        })
        .catch(() => {});
    }, MIC_SILENT_MS);
    void (async () => {
      try {
        await Promise.all([
          this.load(),
          this.openMic().then(() => {
            if (this.listening) this.onPhase('recording');
          }),
        ]);
      } catch (e) {
        this.failedWith = { size: this.modelSize(), error: (e as Error).message || String(e) };
        // The next try starts from the beginning (the failed model is not kept).
        this.loading = undefined;
        this.loadedSize = undefined;
        this.listening = false;
        this.stopRequested = false;
        this.onPhase('idle');
        this.onState(false, `speech model: ${this.failedWith.error}`);
        return;
      }
      const g = voskPhraseGrammar(this.phrases(), this.lexicon!);
      this.joins = g.joins;
      const rec = new this.model!.KaldiRecognizer(this.ctx!.sampleRate, JSON.stringify([...g.phrases, '[unk]']));
      rec.on('partialresult', (m) => {
        if (rec !== this.rec || m.event !== 'partialresult') return;
        this.partial = m.result.partial;
        this.interim();
      });
      rec.on('result', (m) => {
        if (rec !== this.rec || m.event !== 'result') return;
        if (m.result.text) this.heard.push(m.result.text);
        this.partial = '';
        if (this.finishing) this.finish();
        else this.interim();
      });
      // What was said before the key press and while the recogniser was being made comes first.
      for (const chunk of this.pending) rec.acceptWaveformFloat(chunk, this.ctx!.sampleRate);
      this.pending = [];
      this.rec = rec;
      // Released while the model was loading or the microphone opening: what was said is recognised now.
      if (this.stopRequested) {
        this.stopRequested = false;
        this.beginFinish();
      }
    })();
  }

  private text(): string {
    return fromVosk([...this.heard, this.partial].join(' '), this.joins).trim();
  }

  private interim(): void {
    const t = this.text();
    if (t) this.onInterim(t);
  }

  stop(): void {
    if (!this.listening) return;
    // The release of a tap may start the audio where the press could not (iPad): ready for the next transmission.
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    this.listening = false;
    this.onPhase('processing');
    // Still loading / opening: the recogniser finishes once it is there, with the audio kept meanwhile.
    if (!this.rec) {
      this.stopRequested = true;
      this.finishing = true;
      return;
    }
    this.beginFinish();
  }

  private beginFinish(): void {
    this.finishing = true;
    this.rec!.retrieveFinalResult();
    clearTimeout(this.finishTimer);
    this.finishTimer = setTimeout(() => this.finish(), FINAL_RESULT_WAIT_MS);
  }

  private finish(): void {
    if (!this.finishing) return;
    this.finishing = false;
    clearTimeout(this.finishTimer);
    const text = this.text();
    this.rec?.remove();
    this.rec = undefined;
    if (!this.keepMicOpen()) {
      this.closeMic();
      this.pending = [];
    }
    this.onPhase('idle');
    this.onState(false);
    if (text) this.onFinal([text]);
    // Nothing came from the microphone (the audio was not running yet): say so instead of doing nothing.
    else if (!this.captured) this.onStatus('Nothing was recorded - the microphone was not ready yet. Hold PTT / MIC again and speak.');
  }
}
