/**
 * Takes the screenshots of the handbook from a running app (`npm run dev`) with Playwright and writes them to
 * docs/images/handbook/ (JPEG), together with shots.json: the screen regions the handbook marks with numbers.
 *
 *   node scripts/handbook-shots.mjs [--url http://localhost:5173/]
 *
 * Playwright is not a dependency of the project: set PLAYWRIGHT to its module (default `playwright`) and
 * CHROMIUM to a browser executable if Playwright has none of its own.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/images/handbook');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const url = arg('--url', 'http://localhost:5173/');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
mkdirSync(out, { recursive: true });
const regions = {};
const W = 1600;
const H = 900;

/** A connected session at an airport, after `secs` simulated seconds answered by a simple Ground controller. */
async function session({ airport = 'EDDS', position = 'GND', positions = [position], scenario, secs = 0, style = 'phx-night', w = W, h = H } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(([ap, pos, list, st]) => {
    localStorage.setItem('ultimate-atc.settings.v1', JSON.stringify({ airport: ap, position: pos, positions: list, scopeStyle: st }));
  }, [airport, position, positions, style]);
  await page.goto(scenario ? `${url}?scenario=${scenario}` : url);
  await page.waitForSelector('button.primary');
  await page.click('button.primary');
  await page.waitForTimeout(800);
  if (secs) {
    await page.evaluate((SECS) => {
      const { sim } = window.atc;
      const said = new Map();
      for (let t = 0; t < SECS; t++) {
        sim.tick(1);
        for (const ac of sim.aircraft) {
          if (!sim.isOnMyFrequency(ac) || !ac.request || sim.time - (said.get(ac.callsign) ?? -99) < 10) continue;
          if (t > SECS - 60 && ac.request !== 'taxiIn') continue;
          const r = ac.request;
          if (r === 'clearance') sim.transmit(`${ac.callsign} cleared to ${ac.flightPlan.destination} ${ac.flightPlan.sid} departure squawk ${ac.flightPlan.squawk}`);
          else if (r === 'pushback') sim.transmit(`${ac.callsign} push and start approved`);
          else if (r === 'taxi') sim.transmit(`${ac.callsign} taxi to runway ${sim.departureRunwayOf(ac)}`);
          else if (r === 'taxiIn') sim.transmit(`${ac.callsign} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
          else if (r === 'handoff') sim.transmit(`${ac.callsign} contact tower`);
          else continue;
          said.set(ac.callsign, sim.time);
        }
      }
    }, secs);
  }
  await page.waitForTimeout(1200);
  return page;
}

const shot = (page, name, clip) => page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 85, ...(clip ? { clip } : {}) });

/** The bounding box of the first element matching a selector, in screenshot pixels. */
async function box(page, selector) {
  const b = await page.locator(selector).first().boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

/** Pause the simulation (Space) so the pictures stay still. */
const pause = (page) => page.evaluate(() => window.atc.app.togglePause?.());

// Connect dialog and airport menu.
{
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript(() => localStorage.setItem('ultimate-atc.settings.v1', JSON.stringify({ airport: 'EDDS' })));
  await page.goto(url);
  await page.waitForSelector('button.primary');
  await page.waitForTimeout(500);
  await shot(page, 'connect');
  await page.locator('.airport-field').first().click();
  await page.waitForTimeout(600);
  for (const [column, label] of [['continents', /^Europe/], ['countries', /^Germany/], ['firs', /^Langen FIR/]]) {
    await page.locator(`.picker-col.${column}`).getByText(label).first().click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(800);
  await shot(page, 'airport-menu');
  await page.close();
}

// The screen at Stuttgart: overview with the regions of the user guide.
{
  const page = await session({ scenario: 'EDDS-25-MB2-X-7', secs: 1500 });
  await pause(page);
  await shot(page, 'screen');
  regions.screen = {
    width: W,
    height: H,
    marks: {
      toolbar: await box(page, '.toolbar'),
      departures: await box(page, '.panel >> nth=0'),
      arrivals: await box(page, '.panel >> nth=1'),
      scope: await box(page, 'canvas.scope'),
      messages: await box(page, '.messages'),
      cmdline: await box(page, '.cmdline'),
      sidebar: await box(page, '.sidebar'),
    },
  };
  // Close-up of the apron with data tags, and the aircraft menu.
  await page.evaluate(() => {
    const { app, sim } = window.atc;
    app.scope.centerOn(sim.airport.stands.get('29').pos);
    app.scope.zoomBy(1.6);
  });
  await page.waitForTimeout(700);
  await shot(page, 'apron');
  const target = await page.evaluate(() => {
    const { app, sim } = window.atc;
    const ac = sim.aircraft.find((a) => a.onGround && a.phase === 'taxi') ?? sim.aircraft.find((a) => a.onGround);
    const p = app.scope.toScreen(ac.pos);
    const r = document.querySelector('canvas.scope').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.waitForTimeout(600);
  await shot(page, 'menu');
  await page.keyboard.press('Escape');
  // ATIS editor, systems window, briefing.
  await page.locator('.toolbar .field', { hasText: 'ATIS' }).first().click();
  await page.waitForTimeout(600);
  await shot(page, 'atis');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: /^SYSTEMS/ }).click();
  await page.waitForTimeout(600);
  await shot(page, 'systems');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, H - 5);
  await page.getByRole('button', { name: 'BRIEFING' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'briefing');
  await page.keyboard.press('Escape');
  await page.close();
}

// Debriefing after an hour.
{
  const page = await session({ scenario: 'EDDS-25-MB2-X-7', secs: 3000 });
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'DISCONNECT' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'debrief');
  await page.close();
}

// A tutorial.
{
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript(() => localStorage.setItem('ultimate-atc.settings.v1', JSON.stringify({ airport: 'EDDS', scopeStyle: 'phx-night' })));
  await page.goto(url);
  await page.waitForSelector('button.primary');
  await page.locator('.positions button', { hasText: 'Ground' }).last().click();
  await page.waitForTimeout(1500);
  await shot(page, 'tutorial');
  await page.close();
}

// Every airport, as the session starts (Tower at Sylt, Ground elsewhere).
for (const [airport, position] of [['EDDS', 'GND'], ['EDDK', 'GND'], ['EDDN', 'GND'], ['EDDP', 'GND'], ['EDDW', 'GND'], ['EDJA', 'GND'], ['EDXW', 'TWR'], ['KSAN', 'GND']]) {
  const page = await session({ airport, position, secs: 600, style: 'phx-day' });
  await pause(page);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.panel')) el.style.display = 'none';
  });
  await page.waitForTimeout(400);
  const scope = await box(page, 'canvas.scope');
  await shot(page, `airport-${airport}`, { x: scope.x, y: scope.y, width: scope.w, height: scope.h });
  await page.close();
}

writeFileSync(join(out, 'shots.json'), `${JSON.stringify(regions, null, 2)}\n`);
await browser.close();
console.log(`handbook screenshots written to ${out}`);
