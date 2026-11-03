import type { KaldiRecognizer, Model } from 'vosk-browser';
import { fromVosk, voskGrammar } from '../core/phraseology/voskGrammar';

/**
 * The own speech recogniser: Vosk (Kaldi) running in the browser as WebAssembly, independent of the browser's
 * speech recognition (no Google / Apple service, offline once loaded). It is limited to a grammar of the radio
 * vocabulary of the session - it can recognise nothing but radio words. Model: vosk-model-small-en-us-0.15
 * (Apache 2.0), served with the app from models/ (npm run voice-model); loaded on the first transmission.
 *
 * Same interface as VoiceInput: start() on push-to-talk, stop() on release; onInterim while speaking, onFinal with
 * the transcript when the transmission ends.
 */

const MODEL_URL = 'models/vosk-model-small-en-us-0.15.tar.gz';
const LEXICON_URL = 'models/vosk-lexicon.txt';
/** After the release the recogniser still has a little audio to finish: at most this long (ms). */
const FINAL_RESULT_WAIT_MS = 2000;

export class VoskInput {
  listening = false;
  /** The radio vocabulary of the session (words), asked for at every transmission. */
  vocabulary: () => Iterable<string> = () => [];
  private model?: Model;
  private lexicon?: Set<string>;
  private loading?: Promise<void>;
  private failedWith?: string;
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
    return this.failedWith;
  }

  /** The model is the model: the accent setting is for the browser's recogniser. */
  set lang(_: string) {}

  /** Forgets what was heard so far (sent or cleared). */
  discard(): void {
    this.heard = [];
    this.partial = '';
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      this.onStatus('Loading the speech model (about 40 MB, only the first time) ...');
      const [{ createModel }, lexicon] = await Promise.all([
        import('vosk-browser'),
        fetch(LEXICON_URL).then((r) => {
          if (!r.ok) throw new Error(`lexicon: HTTP ${r.status}`);
          return r.text();
        }),
      ]);
      this.lexicon = new Set(lexicon.split('\n').filter(Boolean));
      // Log level -1: errors only (the worker would log every file it unpacks).
      this.model = await createModel(new URL(MODEL_URL, document.baseURI).href, -1);
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
      if ((this.listening || this.finishing) && this.rec) this.rec.acceptWaveform(e.inputBuffer);
    };
    src.connect(node);
    // Connected to the output (silent) - otherwise some browsers never call onaudioprocess.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
    this.node = node;
  }

  start(): void {
    if (this.listening || this.failedWith) return;
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
        this.failedWith = (e as Error).message || String(e);
        this.listening = false;
        this.onState(false, `speech model: ${this.failedWith}`);
        return;
      }
      // Released while the model was still loading: nothing was heard.
      if (!this.listening) {
        this.onState(false);
        return;
      }
      const g = voskGrammar(this.vocabulary(), this.lexicon!);
      this.joins = g.joins;
      const rec = new this.model!.KaldiRecognizer(this.ctx!.sampleRate, JSON.stringify([...g.words, '[unk]']));
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
