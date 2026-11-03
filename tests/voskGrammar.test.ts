import { describe, expect, it } from 'vitest';
import { fromVosk, voskGrammar } from '../src/core/phraseology/voskGrammar';
import { voiceVocabulary } from '../src/core/phraseology/vocabulary';
import { AIRLINES } from '../src/data/airlines';
import { AIRPORTS } from '../src/data/airports';

const LEXICON_FILE = 'public/models/vosk-lexicon.txt';
// Node's fs, loaded at run time (the project's types are those of the browser).
const NODE_FS = 'node:fs';
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string };

describe('Vosk grammar', () => {
  const lexicon = new Set(['euro', 'wings', 'speed', 'bird', 'q', 'n', 'h', 'juliet', 'taxi', 'to', 'holding', 'point', 'lufthansa', 'five', 'alpha', 'bravo']);

  it('keeps the words the model knows and says the others with words it knows', () => {
    const g = voskGrammar(['taxi', 'eurowings', 'speedbird', 'qnh', 'juliett', 'zzzz'], lexicon);
    expect(g.words).toEqual(['bird', 'euro', 'h', 'juliet', 'n', 'q', 'speed', 'taxi', 'wings']);
    expect(g.joins).toContainEqual([['euro', 'wings'], 'eurowings']);
    expect(g.joins).toContainEqual([['q', 'n', 'h'], 'qnh']);
    expect(g.joins).toContainEqual([['juliet'], 'juliett']);
  });

  it('joins what the recogniser heard back into radio words', () => {
    const g = voskGrammar(['eurowings', 'qnh', 'juliett'], lexicon);
    expect(fromVosk('euro wings five alpha [unk] q n h juliet', g.joins)).toBe('eurowings five alpha qnh juliett');
  });

  // With the real model's lexicon (npm run voice-model): every radio word of every airport can be said.
  it.skipIf(!existsSync(LEXICON_FILE))('covers the whole radio vocabulary of every airport with the real lexicon', () => {
    const lex = new Set<string>(readFileSync(LEXICON_FILE, 'utf8').split('\n').filter(Boolean));
    const vocab = voiceVocabulary({
      telephony: AIRLINES.map((a) => a.telephony).filter((t): t is string => !!t),
      stations: AIRPORTS.flatMap((a) => a.stations.map((s) => s.name)),
      sids: AIRPORTS.flatMap((a) => a.sids.map((s) => s.name)),
    });
    const g = voskGrammar(vocab, lex);
    const said = new Set([...g.words, ...g.joins.map((j) => j[1])]);
    const missing = [...vocab].map((v) => v.replace(/[^a-z']/g, '')).filter((v) => v && !said.has(v));
    expect(missing).toEqual([]);
    expect(g.joins).toContainEqual([['euro', 'wings'], 'eurowings']);
    console.log(`Vosk grammar: ${g.words.length} words, ${g.joins.length} said with other words: ${g.joins.map(([p, w]) => `${w}=${p.join(' ')}`).join(', ')}`);
  });
});
