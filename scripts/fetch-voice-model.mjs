#!/usr/bin/env node
/**
 * Downloads the Vosk speech model for the own speech recogniser (vosk-model-small-en-us-0.15, Apache 2.0,
 * https://alphacephei.com/vosk/models) into public/models/ (not committed - the GitHub Pages build fetches it):
 *
 *   public/models/vosk-model-small-en-us-0.15.tar.gz   the model, packed for vosk-browser
 *   public/models/vosk-lexicon.txt                      the words the model knows (one per line)
 *
 * The lexicon is read from the symbol table of the model's grammar graph (graph/Gr.fst, OpenFst format: after
 * the header, for every word a 32-bit length, the word and a 64-bit id). The app uses it to break radio words the
 * model does not know into words it knows ("eurowings" -> "euro wings").
 *
 * Usage: npm run voice-model   (does nothing if both files are there; needs curl, unzip and tar)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NAME = 'vosk-model-small-en-us-0.15';
const URL = `https://alphacephei.com/vosk/models/${NAME}.zip`;
const OUT = join(process.cwd(), 'public', 'models');
const TAR = join(OUT, `${NAME}.tar.gz`);
const LEXICON = join(OUT, 'vosk-lexicon.txt');

if (existsSync(TAR) && existsSync(LEXICON)) {
  console.log(`Speech model already in ${OUT}`);
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'vosk-'));
try {
  const zip = join(work, 'model.zip');
  console.log(`Downloading ${URL} ...`);
  execFileSync('curl', ['-sSfL', '-o', zip, URL], { stdio: 'inherit' });
  execFileSync('unzip', ['-q', zip, '-d', work], { stdio: 'inherit' });
  execFileSync('tar', ['czf', TAR, '-C', work, NAME], { stdio: 'inherit' });

  const fst = readFileSync(join(work, NAME, 'graph', 'Gr.fst'));
  let p = fst.indexOf('<eps>') - 4;
  if (p < 0) throw new Error('no symbol table in Gr.fst');
  const words = [];
  while (p < fst.length - 12) {
    const len = fst.readInt32LE(p);
    if (len <= 0 || len > 60) break;
    const word = fst.toString('utf8', p + 4, p + 4 + len);
    p += 4 + len + 8;
    if (/^[a-z][a-z']*$/.test(word)) words.push(word);
  }
  if (words.length < 10000) throw new Error(`lexicon too small (${words.length} words)`);
  writeFileSync(LEXICON, words.sort().join('\n') + '\n');
  console.log(`Speech model: ${TAR}, lexicon of ${words.length} words: ${LEXICON}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
