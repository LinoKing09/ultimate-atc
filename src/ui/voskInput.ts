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

  constructor(
    private readonly onInterim: (text: string) => void,
    private readonly onFinal: (candidates: string[]) => void,
    private readonly onState: (listening: boolean, error?: string) => void,
    /** Progress for the user (loading the model). */
    private readonly onStatus: (text: string) => void,
  ) {}

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

  /** The microphone, kept open after the first transmission (one permission prompt). */
  private async openMic(): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = this.ctx!;
    const src = ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor: deprecated, but available everywhere (also Safari on the iPad) and simple.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if ((this.listening || this.finishing) && this.rec) {
        this.rec.acceptWaveform(e.inputBuffer);
        return;
      }
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

  start(): void {
    if (this.listening || this.failed) return;
    // The audio context belongs to the key press / tap (iOS): created or resumed before anything is awaited.
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx ??= new Ctx();
    void this.ctx.resume();
    this.listening = true;
    this.finishing = false;
    this.discard();
    this.onState(true);
    void (async () => {
      try {
        await Promise.all([this.load(), this.openMic()]);
      } catch (e) {
        this.failedWith = { size: this.modelSize(), error: (e as Error).message || String(e) };
        // The next try starts from the beginning (the failed model is not kept).
        this.loading = undefined;
        this.loadedSize = undefined;
        this.listening = false;
        this.onState(false, `speech model: ${this.failedWith.error}`);
        return;
      }
      // Released while the model was still loading: nothing was heard.
      if (!this.listening) {
        this.onState(false);
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
    this.listening = false;
    if (!this.rec) return; // still loading: start() ends it
    this.finishing = true;
    this.rec.retrieveFinalResult();
    this.finishTimer = setTimeout(() => this.finish(), FINAL_RESULT_WAIT_MS);
  }

  private finish(): void {
    if (!this.finishing) return;
    this.finishing = false;
    clearTimeout(this.finishTimer);
    const text = this.text();
    this.rec?.remove();
    this.rec = undefined;
    this.onState(false);
    if (text) this.onFinal([text]);
  }
}
