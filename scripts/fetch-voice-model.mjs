#!/usr/bin/env node
/**
 * Downloads the Vosk speech models of the own speech recogniser (Apache 2.0, https://alphacephei.com/vosk/models)
 * into public/models/ (not committed - the GitHub Pages build fetches them):
 *
 *   small  vosk-model-small-en-us-0.15      about 40 MB, the default
 *   large  vosk-model-en-us-0.22-lgraph     about 128 MB, more accurate (optional in the settings)
 *
 * For each: public/models/<name>.tar.gz (packed for vosk-browser) and public/models/<name>.lexicon.txt (the words
 * the model knows, one per line). The lexicon is read from the symbol table of the model's grammar graph
 * (graph/Gr.fst, OpenFst format: after the header, for every word a 32-bit length, the word and a 64-bit id). The
 * app uses it to say radio words the model does not know with words it knows ("eurowings" -> "euro wings").
 *
 * Usage: npm run voice-model            the small model
 *        npm run voice-model -- --all   both (the Pages build)
 * Models already there are skipped; needs curl, unzip and tar.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODELS = { small: 'vosk-model-small-en-us-0.15', large: 'vosk-model-en-us-0.22-lgraph' };
const OUT = join(process.cwd(), 'public', 'models');
const wanted = process.argv.includes('--all') ? ['small', 'large'] : ['small'];

function fetchModel(name) {
  const tar = join(OUT, `${name}.tar.gz`);
  const lexicon = join(OUT, `${name}.lexicon.txt`);
  if (existsSync(tar) && existsSync(lexicon)) {
    console.log(`${name}: already in ${OUT}`);
    return;
  }
  const work = mkdtempSync(join(tmpdir(), 'vosk-'));
  try {
    const zip = join(work, 'model.zip');
    const url = `https://alphacephei.com/vosk/models/${name}.zip`;
    console.log(`Downloading ${url} ...`);
    execFileSync('curl', ['-sSfL', '-o', zip, url], { stdio: 'inherit' });
    execFileSync('unzip', ['-q', zip, '-d', work], { stdio: 'inherit' });
    execFileSync('tar', ['czf', tar, '-C', work, name], { stdio: 'inherit' });

    const fst = readFileSync(join(work, name, 'graph', 'Gr.fst'));
    let p = fst.indexOf('<eps>') - 4;
    if (p < 0) throw new Error(`${name}: no symbol table in Gr.fst`);
    const words = [];
    while (p < fst.length - 12) {
      const len = fst.readInt32LE(p);
      if (len <= 0 || len > 60) break;
      const word = fst.toString('utf8', p + 4, p + 4 + len);
      p += 4 + len + 8;
      if (/^[a-z][a-z']*$/.test(word)) words.push(word);
    }
    if (words.length < 10000) throw new Error(`${name}: lexicon too small (${words.length} words)`);
    writeFileSync(lexicon, words.sort().join('\n') + '\n');
    console.log(`${name}: ${tar}, lexicon of ${words.length} words`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

mkdirSync(OUT, { recursive: true });
for (const m of wanted) fetchModel(MODELS[m]);
