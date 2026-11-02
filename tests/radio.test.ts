import { describe, expect, it } from 'vitest';
import { CALL_GAP_AFTER_ATC_S, CALL_GAP_AFTER_CALL_S, Frequency, type RadioMessage } from '../src/core/radio';

function run(f: Frequency, from: number, to: number): void {
  for (let t = from; t <= to; t = Math.round((t + 0.1) * 10) / 10) f.update(t);
}

describe('radio discipline', () => {
  it('a pilot waits after another pilot\'s call, so the controller can answer; read-backs do not wait', () => {
    const heard: RadioMessage[] = [];
    const f = new Frequency('121.900', (m) => heard.push(m));
    f.pilotTransmit(0, 'DLH5AB', 'Stuttgart Ground, Lufthansa 5AB, stand 14, request pushback');
    f.pilotTransmit(0, 'EWG7TK', 'Stuttgart Ground, Eurowings 7TK, stand 20, request pushback');
    run(f, 0, 30);
    expect(heard.map((m) => m.from)).toEqual(['DLH5AB', 'EWG7TK']);
    const end = Frequency.duration(heard[0].text) + 0.6;
    expect(heard[1].time).toBeGreaterThanOrEqual(end + CALL_GAP_AFTER_CALL_S - 0.05);

    // The controller answers within the gap; the read-back comes at once, the next call only after the gap.
    const heard2: RadioMessage[] = [];
    const g = new Frequency('121.900', (m) => heard2.push(m));
    g.pilotTransmit(0, 'DLH5AB', 'Stuttgart Ground, Lufthansa 5AB, stand 14, request pushback');
    g.pilotTransmit(0, 'EWG7TK', 'Stuttgart Ground, Eurowings 7TK, stand 20, request pushback');
    run(g, 0, 5);
    const atc = g.controllerTransmit(5, 'DLH5AB, push and start approved', 'DLH5AB');
    g.expectReply('DLH5AB', 20);
    g.pilotTransmit(5, 'DLH5AB', 'Push and start approved, Lufthansa 5AB', { priority: 10, delay: 1 });
    run(g, 5.1, 40);
    const rb = heard2.find((m) => m.text.startsWith('Push and start'))!;
    const next = heard2.find((m) => m.from === 'EWG7TK')!;
    expect(rb.time).toBeLessThan(5 + Frequency.duration(atc.text) + 1.5);
    expect(next.time).toBeGreaterThan(rb.time);
    expect(next.time).toBeGreaterThanOrEqual(5 + Frequency.duration(atc.text) + CALL_GAP_AFTER_ATC_S - 0.05);
  });
});
