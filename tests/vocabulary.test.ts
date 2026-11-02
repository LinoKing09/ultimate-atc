import { describe, expect, it } from 'vitest';
import { snapToVocabulary, soundKey, vocabularyScore, voiceVocabulary } from '../src/core/phraseology/vocabulary';

const vocab = voiceVocabulary({ telephony: ['Lufthansa', 'Eurowings', 'Speedbird', 'Sunturk'], stations: ['Stuttgart Ground', 'Stuttgart Tower', 'Langen Radar'], sids: ['KUNOD2B'], extra: ['Frankfurt', 'London Heathrow'] });

describe('voice vocabulary', () => {
  it('gives words that sound alike the same key', () => {
    expect(soundKey('texi')).toBe(soundKey('taxi'));
    expect(soundKey('charly')).toBe(soundKey('charlie'));
    expect(soundKey('juliet')).toBe(soundKey('juliett'));
  });

  it('snaps everyday words the recogniser hears to the radio words that sound alike', () => {
    const cases: [string, string][] = [
      ['lufthansa five alpha bravo texi to holding point alpha via november', 'lufthansa five alpha bravo taxi to holding point alpha via november'],
      ['lufthansa five alpha bravo taxi to holding paint alpha', 'lufthansa five alpha bravo taxi to holding point alpha'],
      ['eurowings seven tango kilo push and start a proved facing east', 'eurowings seven tango kilo push and start approved facing east'],
      // Words of the vocabulary stay ("clear", "of"): the parser's phrase fixes make "cleared for take-off" of them.
      ['speedbird one two clear for take of runway two five', 'speedbird one two clear for take of runway two five'],
      ['sunturk one two contact tower one one eight decimal eight zero five', 'sunturk one two contact tower one one eight decimal eight zero five'],
      ['lufthansa five alpha bravo cleared to frankfurt kunod two bravo departure squawk two three one two', 'lufthansa five alpha bravo cleared to frankfurt kunod two bravo departure squawk two three one two'],
    ];
    for (const [heard, meant] of cases) expect(snapToVocabulary(heard, vocab), heard).toBe(meant);
  });

  it('leaves numbers, single letters and words it has nothing close for alone', () => {
    expect(snapToVocabulary('DLH5AB stand 14 b', vocab)).toBe('dlh5ab stand 14 b');
    expect(snapToVocabulary('lufthansa banana', vocab)).toBe('lufthansa banana');
  });

  it('scores how much of a transcript is radio language', () => {
    expect(vocabularyScore('lufthansa five alpha bravo taxi to holding point alpha', vocab)).toBe(1);
    expect(vocabularyScore('look for the hansa five apple brother', vocab)).toBeLessThan(0.7);
  });
});
