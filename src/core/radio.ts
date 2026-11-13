import { toSpoken } from './phraseology/speech';

export type MessageKind = 'atc' | 'pilot' | 'system' | 'warning';

export interface RadioMessage {
  id: number;
  /** Simulation time the transmission started. */
  time: number;
  kind: MessageKind;
  /** Who is speaking: "ATC", a callsign, or "SYSTEM". */
  from: string;
  /** Callsign the message is addressed to / concerns. */
  callsign?: string;
  text: string;
  spoken: string;
  /** Frequency the message was transmitted on, if any. */
  frequency?: string;
}

interface QueuedTransmission {
  callsign: string;
  text: string;
  /** Earliest time the transmission may start. */
  notBefore: number;
  priority: number;
  onTransmit?: () => void;
  /** Dropped if not transmitted before this time... */
  expiresAt: number;
  /** ...unless the call still applies then: it stays queued for another `ttl`. */
  stillValid?: () => boolean;
  ttl: number;
}

/**
 * Models a single radio frequency: only one station can transmit at a time.
 * Controller transmissions are sent immediately (the controller decides when
 * to talk); pilot transmissions are queued and start once the frequency is
 * free, read-backs before new calls.
 */
/**
 * Radio discipline: after a pilot's call the others leave the controller time to answer before they call themselves
 * (seconds after the end of the call); after a controller transmission they leave the gap for the read-back.
 */
export const CALL_GAP_AFTER_CALL_S = 5;
/** Longest time the frequency is kept free for a read-back after the instruction ended (seconds). */
export const READBACK_WAIT_S = 5;
export const CALL_GAP_AFTER_ATC_S = 2;
/** Transmissions with at least this priority (read-backs, urgent reports such as "stopping") ignore these gaps. */
const URGENT_PRIORITY = 5;
/** Priority of read-backs. */
export const READBACK_PRIORITY = 10;
/** Longest time push-to-talk blocks the frequency (seconds), in case its release gets lost. */
export const PTT_MAX_S = 30;

export class Frequency {
  private busyUntil = 0;
  /** New calls (not read-backs) wait until then. */
  private callsFrom = 0;
  private queue: QueuedTransmission[] = [];
  /**
   * After an instruction the frequency belongs to the addressed station until
   * it has read back: other pilots do not call in between (radio discipline).
   */
  private reserved?: { callsign: string; until: number };
  private nextId = 1;
  /** The controller holds the push-to-talk key (until then at the latest): no pilot starts a transmission. */
  private keyedUntil = 0;

  /**
   * The controller presses (or releases) push-to-talk: while it is held nobody starts to transmit - a pilot who
   * hears the frequency being used waits. At most PTT_MAX_S, in case a release gets lost.
   */
  setKeyed(now: number, on: boolean): void {
    this.keyedUntil = on ? now + PTT_MAX_S : 0;
    // After the release the pilots leave the same gap as after a transmission.
    if (!on) this.callsFrom = Math.max(this.callsFrom, now + CALL_GAP_AFTER_ATC_S);
  }

  /** True while the controller holds push-to-talk. */
  isKeyed(now: number): boolean {
    return now < this.keyedUntil;
  }

  constructor(
    readonly frequency: string,
    private readonly emit: (m: RadioMessage) => void,
    /** Wording of the pilots' transmissions (FAA style at US airports). */
    private readonly pilotStyle: (text: string) => string = (t) => t,
    /** US radio: frequencies with "point" instead of "decimal". */
    private readonly usSpeech = false,
  ) {}

  private spoken(text: string): string {
    const s = toSpoken(text);
    return this.usSpeech ? s.replace(/\bdecimal\b/g, 'point') : s;
  }

  /**
   * Airtime of a message in seconds, from its spoken form ("Eurowings two two Alpha Sierra", "one two one decimal
   * niner": every spelled character is a word) at the pace of the pilot voices, so the frequency is free when the
   * voice has finished reading - and the radio-discipline gaps start from there.
   */
  static duration(spoken: string): number {
    const words = spoken.split(/\s+/).filter(Boolean).length;
    return 0.4 + words * 0.32;
  }

  /** Time the current transmission ends. */
  get freeAt(): number {
    return this.busyUntil;
  }

  isBusy(now: number): boolean {
    return now < this.busyUntil;
  }

  controllerTransmit(now: number, text: string, callsign?: string): RadioMessage {
    const m: RadioMessage = {
      id: this.nextId++,
      time: now,
      kind: 'atc',
      from: 'ATC',
      callsign,
      text,
      spoken: this.spoken(text),
      frequency: this.frequency,
    };
    this.busyUntil = Math.max(this.busyUntil, now) + Frequency.duration(m.spoken);
    // The controller has answered: the wait after the pilot's call is over, only the gap for the read-back remains.
    this.callsFrom = this.busyUntil + CALL_GAP_AFTER_ATC_S;
    this.emit(m);
    return m;
  }

  /**
   * Queues a pilot transmission.
   * @param priority  higher goes first (read-backs: 10, requests: 0)
   */
  pilotTransmit(
    now: number,
    callsign: string,
    text: string,
    opts: { delay?: number; priority?: number; onTransmit?: () => void; ttl?: number; stillValid?: () => boolean } = {},
  ): void {
    this.queue.push({
      stillValid: opts.stillValid,
      ttl: opts.ttl ?? 120,
      callsign,
      text,
      notBefore: now + (opts.delay ?? 0),
      priority: opts.priority ?? 0,
      onTransmit: opts.onTransmit,
      expiresAt: now + (opts.ttl ?? 120),
    });
  }

  /** Keeps the frequency free for the read-back of `callsign` (until it has transmitted, at most until `until`). */
  expectReply(callsign: string, until: number): void {
    this.reserved = { callsign, until };
  }

  /** Station whose read-back the frequency is waiting for, if any. */
  awaitingReplyFrom(now: number): string | undefined {
    return this.reserved && now < this.reserved.until ? this.reserved.callsign : undefined;
  }

  /** True if the pilot already has a transmission waiting. */
  hasQueued(callsign: string): boolean {
    return this.queue.some((q) => q.callsign === callsign);
  }

  /** Removes queued (not yet spoken) transmissions of a pilot, e.g. after a frequency change. */
  cancel(callsign: string): void {
    this.queue = this.queue.filter((q) => q.callsign !== callsign);
  }

  /** Removes the queued calls of a pilot (requests, reports) but keeps a read-back it is about to give. */
  cancelCalls(callsign: string): void {
    this.queue = this.queue.filter((q) => q.callsign !== callsign || q.priority >= READBACK_PRIORITY);
  }

  /** Like `cancel`, and releases a reservation for that station (it left the frequency). */
  release(callsign: string): void {
    this.cancel(callsign);
    if (this.reserved?.callsign === callsign) this.reserved = undefined;
  }

  update(now: number): void {
    // A call that could not get through in time is dropped - or, while it still applies (the aircraft still waits
    // where it called from), kept: a busy frequency must not swallow a call that is made only once.
    this.queue = this.queue.filter((q) => {
      if (q.expiresAt > now) return true;
      if (!q.stillValid?.()) return false;
      q.expiresAt = now + q.ttl;
      return true;
    });
    if (this.isBusy(now) || this.isKeyed(now)) return;
    const waitingFor = this.awaitingReplyFrom(now);
    if (!waitingFor) this.reserved = undefined;
    const ready = this.queue.filter((q) => q.notBefore <= now && (!waitingFor || q.callsign === waitingFor) && (q.priority >= URGENT_PRIORITY || now >= this.callsFrom));
    if (!ready.length) return;
    ready.sort((a, b) => b.priority - a.priority || a.notBefore - b.notBefore);
    const q = ready[0];
    this.queue.splice(this.queue.indexOf(q), 1);
    if (this.reserved?.callsign === q.callsign) this.reserved = undefined;
    const text = this.pilotStyle(q.text);
    const m: RadioMessage = {
      id: this.nextId++,
      time: now,
      kind: 'pilot',
      from: q.callsign,
      callsign: q.callsign,
      text,
      spoken: this.spoken(text),
      frequency: this.frequency,
    };
    // small gap between transmissions
    this.busyUntil = now + Frequency.duration(m.spoken) + 0.6;
    // A call (not a read-back): the others wait for the controller's answer.
    if (q.priority < URGENT_PRIORITY) this.callsFrom = Math.max(this.callsFrom, this.busyUntil + CALL_GAP_AFTER_CALL_S);
    q.onTransmit?.();
    this.emit(m);
  }
}
