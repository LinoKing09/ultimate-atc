import { describe, expect, it } from 'vitest';
import { radioPhrases, sessionPhraseContext } from '../src/core/phraseology/radioPhrases';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

describe('radio phrases (grammar of the own speech recogniser)', () => {
  const sim = new Simulation({ airport: EDDS, position: 'GND', density: 'light', seed: 1, events: false, generateTraffic: false });
  const phrases = new Set(radioPhrases({ ...sessionPhraseContext(sim), callsigns: ['DLH5AB', 'DCMGB', 'TUI9MD'], destinations: ['Frankfurt'] }));

  it('has the callsigns of the session as they are said', () => {
    expect(phrases.has('lufthansa five alpha bravo')).toBe(true);
    expect(phrases.has('tuijet niner mike delta')).toBe(true);
    expect(phrases.has('tuijet nine mike delta')).toBe(true);
    expect(phrases.has('delta charlie mike golf bravo')).toBe(true);
  });

  it('has the phraseology in its order, and the places and numbers of the airport', () => {
    for (const p of ['push and start approved', 'taxi to holding point', 'holding point alpha', 'stand one four', 'stand fourteen', 'runway two five', 'contact stuttgart tower one one eight decimal eight zero five', 'kunod two bravo departure', 'cleared to frankfurt', 'line up and wait']) {
      expect(phrases.has(p), p).toBe(true);
    }
  });

  it('lets only digits, letters and short replies stand alone - not every word', () => {
    expect(phrases.has('alpha')).toBe(true);
    expect(phrases.has('niner')).toBe(true);
    expect(phrases.has('approved')).toBe(true);
    expect(phrases.has('point')).toBe(true);
    // Words that only come inside phrases.
    for (const w of ['holding', 'facing', 'cleared', 'take', 'push']) expect(phrases.has(w), w).toBe(false);
  });
});
