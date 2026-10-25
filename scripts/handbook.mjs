/**
 * Builds the printable handbook docs/handbook/ultimate-atc-handbook.pdf from the Markdown documentation and the
 * screenshots in docs/images/handbook (made with scripts/handbook-shots.mjs), in the colours and font of the app.
 *
 *   npm run handbook            (or: node scripts/handbook.mjs [--html-only])
 *
 * The HTML is written next to the PDF as handbook.html (not committed). Playwright is not a dependency of the
 * project: set PLAYWRIGHT to its module (default `playwright`) and CHROMIUM to a browser executable if Playwright
 * has none of its own.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const outDir = join(docs, 'handbook');
const repo = 'https://github.com/linoking09/ultimate-atc/blob/main/';
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const shots = JSON.parse(readFileSync(join(docs, 'images/handbook/shots.json'), 'utf8'));

/**
 * The chapters in book order. `drop` removes sections (by heading text) that are for developers only, `figures`
 * puts a screenshot below a heading, `replace` swaps an image of the online docs for a handbook figure.
 */
const airports = ['EDDS', 'EDDK', 'EDDN', 'EDDP', 'EDDW', 'EDJA', 'EDXW', 'KSAN'];
const chapters = [
  { part: 'Playing', file: 'getting-started.md', drop: ['Tests', 'Deploying to GitHub Pages'] },
  {
    file: 'user-guide.md',
    figures: {
      'ATIS editor': ['atis', 'The ATIS editor: runway, wind, QNH and the ATIS letter'],
      'Airport briefing': ['briefing', 'The airport briefing with the local procedures'],
      'Systems window': ['systems', 'The systems window'],
      '4. Aircraft tags and colours': ['apron', 'Data tags on the apron at Stuttgart, phx-night style'],
      '7. Aircraft menu': ['menu', 'The aircraft menu after a right-click on a taxiing aircraft'],
      Debriefing: ['debrief', 'The debriefing after a session'],
    },
    replace: { 'screenshot-connect.png': 'airport-menu', 'screenshot-overview.png': 'SCREEN' },
    dropFirstCode: '2. Screen layout',
  },
  { file: 'tutorials.md', drop: ['For developers'], figures: { 'How a tutorial works': ['tutorial', 'The first step of the Ground tutorial'] } },
  { file: 'phraseology.md' },
  { file: 'scenarios.md' },
  { part: 'Airports', file: 'airports/README.md' },
  ...airports.map((icao) => ({ file: `airports/${icao}.md`, top: [`airport-${icao}`, `${icao} at the start of a session (phx-day style)`] })),
  { part: 'Background', file: 'systems.md' },
  { file: 'tower-operations.md' },
  { file: 'simulation.md' },
  { file: 'glossary.md' },
];

/** GitHub-style heading anchors. */
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
const chapterId = (file) => file.replace(/\.md$/, '').replace(/[/]/g, '-').toLowerCase();
const inBook = new Set(chapters.map((c) => c.file));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const figure = (name, caption) =>
  `<figure><img src="../images/handbook/${name}.jpg" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption></figure>`;

/** The screen with numbered regions and a legend (the regions come from shots.json). */
function screenFigure() {
  const { width, height, marks } = shots.screen;
  const legend = [
    ['toolbar', 'Toolbar: stations, runway, ATIS, wind, QNH, clock, speed, score, help'],
    ['departures', 'Departure list'],
    ['arrivals', 'Arrival list'],
    ['scope', 'Ground radar scope'],
    ['messages', 'Message window (radio log)'],
    ['cmdline', 'Command line with preview, MIC and SEND'],
    ['sidebar', 'Sidebar'],
  ].filter(([k]) => marks[k]);
  const pins = legend
    .map(([k], i) => {
      const m = marks[k];
      // Scope: the pin goes into the middle, the others into the top left corner of their region.
      const [x, y] = k === 'scope' ? [m.x + m.w / 2, m.y + m.h / 2] : [m.x + 14, m.y + Math.min(14, m.h / 2)];
      const box = k === 'scope' ? '' : `<div class="mark" style="left:${(m.x / width) * 100}%;top:${(m.y / height) * 100}%;width:${(m.w / width) * 100}%;height:${(m.h / height) * 100}%"></div>`;
      return `${box}<div class="pin" style="left:${(x / width) * 100}%;top:${(y / height) * 100}%">${i + 1}</div>`;
    })
    .join('');
  const items = legend.map(([, t]) => `<li>${esc(t)}</li>`).join('');
  return `<figure class="screen"><div class="annotated"><img src="../images/handbook/screen.jpg" alt="The screen">${pins}</div><figcaption>The screen at Stuttgart during a Ground session</figcaption><ol class="legend">${items}</ol></figure>`;
}

/** Cuts the sections with these headings (up to the next heading of the same or a higher level). */
function dropSections(md, headings) {
  if (!headings?.length) return md;
  const out = [];
  let skip = 0;
  let fence = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) fence = !fence;
    const h = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
    if (h && skip && h[1].length <= skip) skip = 0;
    if (h && headings.includes(h[2].trim())) skip = h[1].length;
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

function renderChapter(ch, n) {
  const id = chapterId(ch.file);
  const base = posix.dirname(ch.file);
  let md = readFileSync(join(docs, ch.file), 'utf8');
  md = md.replace(/^\[Documentation\].*\n+/, '');
  md = dropSections(md, ch.drop);
  // The local table of contents is replaced by the book's.
  md = md.replace(/^(?:- \[[^\]\n]+\]\(#[^)\n]+\)\n)+\n*(?:---\n)?/m, '');
  if (ch.dropFirstCode) {
    const at = md.indexOf(`## ${ch.dropFirstCode}`);
    if (at >= 0) md = md.slice(0, at) + md.slice(at).replace(/\n```\n[\s\S]*?\n```\n/, '\n');
  }

  /** A link of the online docs as a link inside the book (or to GitHub for what the book leaves out). */
  const href = (h) => {
    if (/^[a-z]+:/i.test(h)) return h;
    const [path, hash] = h.split('#');
    if (!path) return `#${id}--${hash}`;
    const target = posix.normalize(posix.join(base, path));
    if (inBook.has(target)) return hash ? `#${chapterId(target)}--${hash}` : `#${chapterId(target)}`;
    return repo + posix.normalize(posix.join('docs', target)) + (hash ? `#${hash}` : '');
  };
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        const plain = text.replace(/[*`_]/g, '');
        if (depth === 1) {
          const top = ch.top ? figure(...ch.top) : '';
          return `<h1 id="${id}"><span class="num">${n}</span>${inner}</h1>${top}`;
        }
        const fig = ch.figures?.[plain] ? figure(...ch.figures[plain]) : '';
        return `<h${depth} id="${id}--${slug(plain)}">${inner}</h${depth}>${fig}`;
      },
      link({ href: h, tokens }) {
        return `<a href="${esc(href(h))}">${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href: h, text }) {
        const name = posix.basename(h);
        const r = ch.replace?.[name];
        if (r === 'SCREEN') return screenFigure();
        if (r) return figure(r, text);
        return `<figure><img src="${esc(posix.join('..', base, h))}" alt="${esc(text)}"><figcaption>${esc(text)}</figcaption></figure>`;
      },
    },
  });
  const html = marked.parse(md);
  const title = /^# (.*)$/m.exec(md)?.[1] ?? ch.file;
  const subs = [...md.matchAll(/^## (.*)$/gm)].map((m) => m[1].replace(/[*`]/g, ''));
  return { id, title: title.replace(/[*`]/g, ''), subs, html };
}

const rendered = chapters.map((ch, i) => ({ ...ch, ...renderChapter(ch, i + 1) }));

const toc = rendered
  .map((c, i) => {
    const part = c.part ? `<li class="part">${esc(c.part)}</li>` : '';
    const subs = c.subs.length && !c.file.startsWith('airports/') ? `<span class="subs">${c.subs.map(esc).join(' · ')}</span>` : '';
    return `${part}<li><a href="#${c.id}"><span class="num">${i + 1}</span>${esc(c.title)}</a>${subs}</li>`;
  })
  .join('');

const css = `
:root {
  --bg: #1d2528; --panel: #262e32; --panel-2: #2d363b; --panel-border: #3d484e;
  --text: #cfd8dc; --text-dim: #8a979d; --accent: #6fe3ff; --warn: #ffcf4d; --danger: #ff5a5a; --ok: #7bdc8f;
  --atc: #9fd3ff; --pilot: #e8f0f0;
  --font: 'DejaVu Sans Mono', Consolas, Menlo, 'Liberation Mono', monospace;
}
@page { size: A4; margin: 16mm 14mm 18mm; background: var(--bg);
  @bottom-left { content: 'ULTIMATE ATC · HANDBOOK ${version}'; font: 7pt var(--font); color: #8a979d; letter-spacing: .08em; }
  @bottom-right { content: counter(page); font: bold 8pt var(--font); color: #6fe3ff; }
}
@page :first { @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: var(--bg); color: var(--text); font: 8.6pt/1.5 var(--font); margin: 0; }
a { color: var(--accent); text-decoration: none; }
strong { color: var(--pilot); }
code { color: var(--warn); background: var(--panel); border: 1px solid var(--panel-border); border-radius: 2px; padding: 0 .25em; font-size: .95em; }
pre { background: var(--panel); border: 1px solid var(--panel-border); border-left: 3px solid var(--accent); padding: 6px 9px; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; border: 0; padding: 0; color: var(--atc); }
h1, h2, h3, h4 { color: var(--accent); font-weight: bold; letter-spacing: .03em; break-after: avoid; }
h1 { break-before: page; font-size: 17pt; margin: 0 0 10px; padding: 8px 10px; background: var(--panel); border: 1px solid var(--panel-border); border-left: 5px solid var(--accent); text-transform: uppercase; }
h1 .num { color: var(--bg); background: var(--accent); padding: 0 .35em; margin-right: .5em; }
h2 { font-size: 11.5pt; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid var(--panel-border); text-transform: uppercase; }
h3 { font-size: 9.5pt; color: var(--warn); margin: 12px 0 4px; }
h4 { font-size: 9pt; color: var(--text); margin: 10px 0 4px; }
p, ul, ol { margin: 4px 0 7px; }
ul, ol { padding-left: 1.4em; }
li::marker { color: var(--accent); }
hr { border: 0; border-top: 1px dashed var(--panel-border); margin: 10px 0; }
blockquote { margin: 6px 0; padding: 4px 10px; border-left: 3px solid var(--warn); background: var(--panel); color: var(--text); }
table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 7.6pt; background: var(--panel); border: 1px solid var(--panel-border); }
thead { display: table-header-group; }
th { background: var(--panel-2); color: var(--accent); text-align: left; font-weight: bold; text-transform: uppercase; letter-spacing: .04em; }
th, td { padding: 3px 6px; border-bottom: 1px solid var(--panel-border); vertical-align: top; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #2a3236; }
figure { margin: 8px 0 12px; break-inside: avoid; }
figure img { display: block; width: 100%; border: 1px solid var(--panel-border); }
figcaption { color: var(--text-dim); font-size: 7.4pt; margin-top: 3px; }
figcaption::before { content: '▸ '; color: var(--accent); }
.annotated { position: relative; }
.mark { position: absolute; border: 1.5px solid var(--warn); }
.pin { position: absolute; transform: translate(-50%, -50%); width: 18px; height: 18px; border-radius: 50%; background: var(--warn); color: var(--bg); font: bold 9pt/18px var(--font); text-align: center; box-shadow: 0 0 0 2px var(--bg); }
.legend { columns: 2; margin-top: 6px; font-size: 7.8pt; }
.legend li::marker { color: var(--warn); font-weight: bold; }
.cover { height: 262mm; padding: 14mm 4mm 0; display: flex; flex-direction: column; break-after: page; overflow: hidden; }
.cover .brand { color: var(--accent); font-size: 34pt; font-weight: bold; letter-spacing: .12em; }
.cover .sub { color: var(--text); font-size: 13pt; letter-spacing: .3em; margin: 4px 0 18mm; }
.cover .bar { display: flex; gap: 0; margin-bottom: 8mm; font-size: 8pt; }
.cover .bar span { padding: 3px 8px; background: var(--panel); border: 1px solid var(--panel-border); margin-right: -1px; }
.cover .bar .gnd { color: var(--ok); } .cover .bar .del { color: var(--atc); } .cover .bar .twr { color: var(--danger); }
.cover img { width: 100%; border: 1px solid var(--panel-border); }
.cover .foot { margin-top: auto; color: var(--text-dim); font-size: 8pt; display: flex; justify-content: space-between; }
.stopbar { display: flex; gap: 7px; margin: 10mm 0 4mm; }
.stopbar i { width: 9px; height: 9px; border-radius: 50%; background: var(--danger); box-shadow: 0 0 6px var(--danger); }
.toc h1 { break-before: auto; }
.toc ol { list-style: none; padding: 0; }
.toc li { padding: 3px 0; border-bottom: 1px dotted var(--panel-border); break-inside: avoid; }
.toc li a { font-weight: bold; }
.toc .num { display: inline-block; width: 2.4em; color: var(--warn); }
.toc .part { border: 0; color: var(--text-dim); text-transform: uppercase; letter-spacing: .2em; padding-top: 10px; font-size: 7.6pt; }
.toc .subs { display: block; padding-left: 2.9em; color: var(--text-dim); font-size: 7pt; }
.notice { margin-top: 8mm; color: var(--text-dim); font-size: 7.4pt; border-top: 1px dashed var(--panel-border); padding-top: 4px; }
`;

const date = new Date().toISOString().slice(0, 10);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ultimate ATC - Handbook ${version}</title><style>${css}</style></head><body>
<section class="cover">
  <div class="brand">ULTIMATE ATC</div>
  <div class="sub">CONTROLLER HANDBOOK</div>
  <div class="bar"><span class="del">DEL</span><span class="gnd">GND</span><span class="twr">TWR</span><span>VERSION ${version}</span><span>${date}</span></div>
  <img src="../images/handbook/screen.jpg" alt="">
  <div class="stopbar">${'<i></i>'.repeat(9)}</div>
  <div class="foot"><span>A browser-based tower and ground control simulator</span><span>${repo.replace(/blob\/main\/$/, '').replace('https://', '')}</span></div>
</section>
<section class="toc"><h1>Contents</h1><ol>${toc}</ol>
<p class="notice">For training and entertainment only - not for real-world navigation or air traffic control. Airport layouts from © OpenStreetMap contributors (ODbL) and OurAirports (public domain); facts digitised by hand from the AIP as a reference. Screenshots from the app. Developer documentation (architecture, airport data, contributing) is online in the repository.</p></section>
${rendered.map((c) => `<section class="chapter">${c.html}</section>`).join('\n')}
</body></html>`;

// Links into sections the book leaves out go to the online documentation.
const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
const fileOf = new Map(chapters.map((c) => [chapterId(c.file), c.file]));
const book = html.replace(/href="#(([^"-]+(?:-[^"-]+)*)--([^"]+))"/g, (all, target, chap, hash) =>
  ids.has(target) || !fileOf.has(chap) ? all : `href="${repo}docs/${fileOf.get(chap)}#${hash}"`,
);

mkdirSync(outDir, { recursive: true });
const htmlFile = join(outDir, 'handbook.html');
writeFileSync(htmlFile, book);
if (process.argv.includes('--html-only')) {
  console.log(`handbook HTML written to ${htmlFile}`);
  process.exit(0);
}
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
const pdf = join(outDir, 'ultimate-atc-handbook.pdf');
await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
await browser.close();
console.log(`handbook written to ${pdf}`);
