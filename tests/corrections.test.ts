import { describe, expect, it } from 'vitest';
import { applyCorrections, learnCorrection, learntCorrections, type CorrectionStore } from '../src/core/phraseology/corrections';

describe('learning from the controller\'s corrections', () => {
  it('learns a word the recogniser keeps getting wrong, after three corrections', () => {
    const s: CorrectionStore = {};
    const heard = 'lufthansa five alpha bravo taxi to holding point eight via november';
    const sent = 'lufthansa five alpha bravo taxi to holding point hotel via november';
    learnCorrection(s, heard, sent);
    learnCorrection(s, heard, sent);
    expect(applyCorrections(s, 'taxi to holding point eight')).toBe('taxi to holding point eight');
    learnCorrection(s, heard, sent);
    expect(applyCorrections(s, 'taxi to holding point eight')).toBe('taxi to holding point hotel');
    expect(learntCorrections(s)).toEqual([['eight', 'hotel']]);
  });

  it('never replaces a word that is mostly right', () => {
    const s: CorrectionStore = {};
    for (let i = 0; i < 3; i++) learnCorrection(s, 'cleared to frankfurt hundred two bravo departure', 'cleared to frankfurt kunod two bravo departure');
    // "hundred" is right far more often (altitudes): it stays.
    for (let i = 0; i < 5; i++) learnCorrection(s, 'climb five thousand five hundred feet', 'climb five thousand five hundred feet');
    expect(applyCorrections(s, 'kunod hundred')).toBe('kunod hundred');
  });

  it('does not learn from a transmission rewritten as another instruction', () => {
    const s: CorrectionStore = {};
    for (let i = 0; i < 5; i++) learnCorrection(s, 'lufthansa five alpha bravo hold position', 'eurowings seven tango kilo push and start approved');
    expect(learntCorrections(s)).toEqual([]);
  });
});
