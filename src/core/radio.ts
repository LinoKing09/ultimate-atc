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
  /** Dropped if not transmitted before this time. */
  expiresAt: number;
}

/**
 * Models a single radio frequency: only one station can transmit at a time.
 * Controller transmissions are sent immediately (the controller decides when
 * to talk); pilot transmissions are queued and start once the frequency is
 * free, read-backs before new calls.
 */
export class Frequency {
  private busyUntil = 0;
  private queue: QueuedTransmission[] = [];
  private nextId = 1;

  constructor(
    readonly frequency: string,
    private readonly emit: (m: RadioMessage) => void,
  ) {}

  /** Approximate airtime of a message in seconds. */
  static duration(text: string): number {
    const words = text.split(/\s+/).length;
    return 0.8 + words * 0.32;
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
      spoken: toSpoken(text),
      frequency: this.frequency,
    };
    this.busyUntil = Math.max(this.busyUntil, now) + Frequency.duration(text);
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
    opts: { delay?: number; priority?: number; onTransmit?: () => void; ttl?: number } = {},
  ): void {
    this.queue.push({
      callsign,
      text,
      notBefore: now + (opts.delay ?? 0),
      priority: opts.priority ?? 0,
      onTransmit: opts.onTransmit,
      expiresAt: now + (opts.ttl ?? 120),
    });
  }

  /** True if the pilot already has a transmission waiting. */
  hasQueued(callsign: string): boolean {
    return this.queue.some((q) => q.callsign === callsign);
  }

  /** Removes queued (not yet spoken) transmissions of a pilot, e.g. after a frequency change. */
  cancel(callsign: string): void {
    this.queue = this.queue.filter((q) => q.callsign !== callsign);
  }

  update(now: number): void {
    this.queue = this.queue.filter((q) => q.expiresAt > now);
    if (this.isBusy(now)) return;
    const ready = this.queue.filter((q) => q.notBefore <= now);
    if (!ready.length) return;
    ready.sort((a, b) => b.priority - a.priority || a.notBefore - b.notBefore);
    const q = ready[0];
    this.queue.splice(this.queue.indexOf(q), 1);
    const m: RadioMessage = {
      id: this.nextId++,
      time: now,
      kind: 'pilot',
      from: q.callsign,
      callsign: q.callsign,
      text: q.text,
      spoken: toSpoken(q.text),
      frequency: this.frequency,
    };
    // small gap between transmissions
    this.busyUntil = now + Frequency.duration(q.text) + 0.6;
    q.onTransmit?.();
    this.emit(m);
  }
}
