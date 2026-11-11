import type { Aircraft } from '../core/aircraft';
import { M_PER_NM, distance, headingDiff } from '../core/geo';
import { headingText, isFlightLevel, toMagnetic, transferNeeded } from '../core/radar';
import type { Simulation } from '../core/simulation';
import type { MenuItem } from './menu';
import type { RadarTagItem } from './radarScope';

/**
 * Menus of the Approach / Departure position (radar): the aircraft menu and the menus of the tag items (level,
 * heading, speed, route, approach). Every entry says a standard phrase (the same you could type). Two styles
 * (Settings -> Aircraft menus): **simple** - each entry is the phrase that is said ("Descend flight level 80");
 * **real** - short like EuroScope ("ALT" > "-FL080", "HDG" > "L" > "L250"), the phrase is only on the radio.
 */

export interface RadarMenuContext {
  sim: Simulation;
  /** Transmits a phrase to the aircraft (callsign added). */
  say: (ac: Aircraft, phrase: string) => void;
  center: (ac: Aircraft) => void;
  resetTag: (ac: Aircraft) => void;
  /** EuroScope-style short entries. */
  real: boolean;
  /** Starts the hand-over of the track to Tower / Center (EuroScope: initiate transfer). */
  transfer?: (ac: Aircraft) => void;
  /** Starts the measuring tool at the aircraft. */
  measure?: (ac: Aircraft) => void;
  /** Show / hide the route of the aircraft on the radar (and whether it is shown). */
  toggleRoute?: (ac: Aircraft) => void;
  routeShown?: (ac: Aircraft) => boolean;
}

/** True if the aircraft is on your radar frequency (you work Approach / Departure). */
export function onMyRadar(sim: Simulation, ac: Aircraft): boolean {
  return ac.frequency === 'APP' && sim.userControls('APP') && !!sim.airspace && !ac.onGround;
}

/** The entry: the phrase (simple) or the short form (real); the phrase is what is transmitted. */
function entry(ctx: RadarMenuContext, ac: Aircraft, phrase: string, short: string, hint?: string): MenuItem {
  return { label: ctx.real ? short : capital(phrase), hint, action: () => ctx.say(ac, phrase) };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "flight level 80" / "altitude 5000 feet" as a phrase part. */
function levelPhrase(sim: Simulation, ft: number): string {
  return isFlightLevel(sim, ft) ? `flight level ${Math.round(ft / 100)}` : `altitude ${ft} feet`;
}

/** EuroScope form of a level: "FL080", "A5000". */
function levelShort(sim: Simulation, ft: number): string {
  return isFlightLevel(sim, ft) ? `FL${String(Math.round(ft / 100)).padStart(3, '0')}` : `A${ft}`;
}

function approachName(sim: Simulation, runway: string): { word: string; short: string } {
  const kind = sim.approachTypeFor(runway);
  return { word: kind === 'LOC' ? 'localizer' : kind, short: kind === 'LOC' ? 'LOC' : kind };
}

/** Headings in 10 degree steps from the present one (magnetic) in one turn direction. */
export function headingItems(ctx: RadarMenuContext, ac: Aircraft, turn: 'left' | 'right'): MenuItem[] {
  const base = Math.round(toMagnetic(ctx.sim, ac.heading) / 10) * 10;
  const out: MenuItem[] = [];
  for (let d = 10; d <= 180; d += 10) {
    const h = turn === 'left' ? base - d : base + d;
    const hdg = ((h % 360) + 360) % 360 || 360;
    out.push(entry(ctx, ac, `turn ${turn} heading ${headingText(hdg)}`, `${turn === 'left' ? 'L' : 'R'}${headingText(hdg)}`));
  }
  return out;
}

/** The heading menu: left / right turns, present heading, and an intercept heading for the final. */
export function headingMenu(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const now = headingText(toMagnetic(ctx.sim, ac.heading));
  const items: MenuItem[] = [
    { label: ctx.real ? 'L' : 'Turn left heading', submenu: () => headingItems(ctx, ac, 'left') },
    { label: ctx.real ? 'R' : 'Turn right heading', submenu: () => headingItems(ctx, ac, 'right') },
    entry(ctx, ac, 'continue present heading', 'PH', now),
  ];
  const icpt = interceptHeading(ctx.sim, ac);
  if (icpt && ac.category === 'arrival') {
    const a = approachName(ctx.sim, icpt.runway);
    items.push(entry(ctx, ac, `turn ${icpt.turn} heading ${headingText(icpt.heading)}, cleared ${a.word} approach runway ${icpt.runway}`, `${icpt.turn === 'left' ? 'L' : 'R'}${headingText(icpt.heading)} ${a.short}${icpt.runway}`, 'intercept'));
  }
  return items;
}

/** A 30 degree intercept heading for the final of the arrival runway (magnetic), if the aircraft is on the approach side. */
export function interceptHeading(sim: Simulation, ac: Aircraft): { heading: number; turn: 'left' | 'right'; runway: string } | undefined {
  const runway = sim.isArrivalRunway(ac.runway) ? ac.runway! : sim.arrivalRunways[0];
  const end = sim.airport.runwayEnd(runway);
  if (!end) return undefined;
  const d = { x: ac.pos.x - end.threshold.x, y: ac.pos.y - end.threshold.y };
  const rad = (end.heading * Math.PI) / 180;
  const along = d.x * Math.sin(rad) + d.y * Math.cos(rad);
  const cross = d.x * Math.cos(rad) - d.y * Math.sin(rad);
  if (along > -4 * M_PER_NM || along < -30 * M_PER_NM || Math.abs(cross) < 300) return undefined;
  // Right of the final (looking towards the runway) the intercept heading is to the left of the course.
  const courseMag = toMagnetic(sim, end.heading);
  const heading = Math.round((cross > 0 ? courseMag - 30 : courseMag + 30) / 10) * 10;
  const hdg = ((heading % 360) + 360) % 360 || 360;
  const turn = headingDiff(toMagnetic(sim, ac.heading), hdg) < 0 ? 'left' : 'right';
  return { heading: hdg, turn, runway };
}

/** Levels to climb or descend to: altitudes up to the transition altitude, flight levels from the transition level. */
export function levelItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const sim = ctx.sim;
  const ta = sim.config.airport.transitionAltitudeFt;
  const tl = sim.transitionLevel(sim.atis.qnh) * 100;
  const levels: number[] = [];
  for (let ft = 3000; ft <= ta; ft += 1000) levels.push(ft);
  const top = ac.category === 'departure' ? Math.min(ac.flightPlan.cruiseFl * 100, 24000) : 15000;
  for (let ft = tl; ft <= top; ft += 1000) levels.push(ft);
  const now = Math.round(ac.altitudeFt / 100) * 100;
  const cleared = ac.radar?.clearedFt;
  // Below the transition level for the first time: with the QNH.
  const qnh = (ft: number) => (!isFlightLevel(sim, ft) && (ac.radar?.clearedFl ?? isFlightLevel(sim, now)) ? `, ${sim.pressurePhrase()}` : '');
  const mva = sim.airspace!.mvaAt(ac.pos);
  return levels
    .sort((a, b) => (ac.category === 'departure' ? a - b : b - a))
    .map((ft) => {
      const verb = ft > now + 50 ? 'climb' : ft < now - 50 ? 'descend' : 'maintain';
      const phrase = `${verb} ${levelPhrase(sim, ft)}${verb === 'descend' ? qnh(ft) : ''}`;
      const sign = verb === 'climb' ? '+' : verb === 'descend' ? '-' : '=';
      const hint = ft === cleared ? (ctx.real ? 'CFL' : 'cleared') : ft < mva && ac.phase === 'inbound' ? `MVA ${mva}` : undefined;
      return entry(ctx, ac, phrase, `${sign}${levelShort(sim, ft)}`, hint);
    });
}

export function speedItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  if (ac.phase === 'approach') {
    return [
      entry(ctx, ac, 'maintain 160 knots until 4 miles', '160/4NM'),
      entry(ctx, ac, 'reduce to final approach speed', 'FAS'),
      entry(ctx, ac, 'resume normal speed', 'RES'),
    ];
  }
  const items: MenuItem[] = [];
  const min = ac.type.approachSpeedKt + 15;
  const now = Math.round(ac.speed / 0.514444 / 10) * 10;
  for (let kt = 300; kt >= Math.ceil(min / 10) * 10; kt -= 10) {
    const verb = kt < now ? 'reduce speed' : kt > now ? 'increase speed' : 'maintain';
    const sign = kt < now ? '-' : kt > now ? '+' : '=';
    items.push(entry(ctx, ac, `${verb} ${kt} knots`, `${sign}${kt}`, ac.radar?.speedKt === kt ? (ctx.real ? 'ASP' : 'assigned') : undefined));
  }
  items.push(entry(ctx, ac, 'no speed restrictions', 'NO SPD'));
  return items;
}

/** Fixes to fly direct to: the ones of its route first, then nearby fixes and navaids (no RNAV waypoints). */
export function directItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const as = ctx.sim.airspace!;
  const onRoute = ac.radar?.route ?? [];
  const preferred = new Set<string>(onRoute);
  const sid = ctx.sim.config.airport.sids.find((s) => s.name === ac.flightPlan.sid);
  if (ac.category === 'departure' && sid?.fix) preferred.add(sid.fix);
  if (ac.category === 'arrival') for (const e of as.entries) preferred.add(e.iaf);
  const fixes = [...as.fixes.entries()]
    .filter(([name, f]) => f.kind !== 'rnav' || preferred.has(name))
    .map(([name, f]) => ({ name, d: distance(ac.pos, f.pos) / M_PER_NM, order: onRoute.indexOf(name) }))
    .filter((f) => f.d < 60)
    .sort((a, b) => {
      const ra = a.order >= 0 ? a.order : preferred.has(a.name) ? 100 : 1000;
      const rb = b.order >= 0 ? b.order : preferred.has(b.name) ? 100 : 1000;
      return ra - rb || a.d - b.d;
    })
    .slice(0, 18);
  return fixes.map((f) => entry(ctx, ac, `proceed direct ${f.name}`, f.name, `${f.d.toFixed(0)} NM`));
}

export function holdItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  return ctx.sim.airspace!.holdings.map((hd) => entry(ctx, ac, `hold over ${hd.fix}`, hd.fix, `MHA ${hd.minAltFt}`));
}

/** RNAV transitions to final of the landing runway(s). */
export function transitionItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const sim = ctx.sim;
  const list = (sim.airspace!.data.transitions ?? []).filter((t) => sim.isArrivalRunway(t.runway));
  if (!list.length) return [{ label: ctx.real ? 'NONE' : 'No transitions for the runway in use', disabled: true }];
  return list.map((t) => {
    const a = approachName(sim, t.runway);
    return entry(ctx, ac, `via ${t.name} transition, cleared ${a.word} approach runway ${t.runway}`, `${t.name.replace(' ', '')} ${a.short}${t.runway}`, ac.radar?.transition === t.name ? (ctx.real ? 'ACT' : 'flying') : undefined);
  });
}

export function approachItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const sim = ctx.sim;
  if (ac.category !== 'arrival') return [{ label: ctx.real ? 'DEP' : 'Departure - no approach', disabled: true }];
  const items: MenuItem[] = [];
  for (const r of sim.arrivalRunways) {
    const a = approachName(sim, r);
    items.push(entry(ctx, ac, `cleared ${a.word} approach runway ${r}`, `${a.short}${r}`, ac.radar?.approach?.runway === r ? (ctx.real ? 'CLR' : 'cleared') : undefined));
  }
  const icpt = interceptHeading(sim, ac);
  if (icpt) {
    const a = approachName(sim, icpt.runway);
    items.push(entry(ctx, ac, `turn ${icpt.turn} heading ${headingText(icpt.heading)}, cleared ${a.word} approach runway ${icpt.runway}`, `${icpt.turn === 'left' ? 'L' : 'R'}${headingText(icpt.heading)} ${a.short}${icpt.runway}`));
  }
  items.push(entry(ctx, ac, 'report established on the localizer', 'RPT EST'));
  return items;
}

/** Hand-off: arrivals to Tower, departures to their Center sector. */
function handoffItem(ctx: RadarMenuContext, ac: Aircraft): MenuItem {
  const sim = ctx.sim;
  if (ac.category === 'arrival') {
    const twr = sim.airport.station(sim.stationFor('tower'));
    const f = sim.frequencyFor(sim.stationFor('tower'), ac);
    return entry(ctx, ac, `contact ${twr?.name ?? 'tower'} ${f}`, `TWR ${f}`, ac.request === 'radar' ? (ctx.real ? 'REQ' : 'requested') : undefined);
  }
  const s = ac.radar?.sector ?? sim.airspace!.sectorFor(undefined);
  return entry(ctx, ac, `contact ${s.callsign} ${s.frequency}`, `${s.name} ${s.frequency}`, ctx.real ? levelShort(sim, s.releaseFt) : `sector ${s.name}, release ${levelShort(sim, s.releaseFt)}`);
}

/** The aircraft menu on the radar. */
export function radarItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const r = ac.radar;
  const real = ctx.real;
  const items: MenuItem[] = [];
  if (r && !r.identified) items.push(entry(ctx, ac, 'identified', 'IDENT', ac.request === 'checkIn' ? (real ? 'C/I' : 'first call') : undefined));
  items.push(
    { label: real ? 'HDG' : 'Heading', hint: r?.heading !== undefined ? headingText(r.heading) : undefined, submenu: () => headingMenu(ctx, ac) },
    { label: real ? 'ALT' : ac.category === 'departure' ? 'Climb' : 'Descend / climb', hint: r ? String(Math.round(r.clearedFt / 100)).padStart(3, '0') : undefined, submenu: () => levelItems(ctx, ac) },
    { label: real ? 'SPD' : 'Speed', hint: r?.speedKt ? `${r.speedKt}${real ? '' : ' kt'}` : undefined, submenu: () => speedItems(ctx, ac) },
    { label: real ? 'DCT' : 'Proceed direct', hint: r?.route[0], submenu: () => directItems(ctx, ac) },
  );
  if (ac.category === 'arrival') {
    items.push(
      { label: real ? 'HOLD' : 'Hold over', hint: r?.hold?.fix, submenu: () => holdItems(ctx, ac) },
      { label: real ? 'TRANS' : 'Transition', hint: r?.transition, submenu: () => transitionItems(ctx, ac) },
      { label: real ? 'APP' : 'Approach', hint: r?.approach ? `${r.approach.kind} ${r.approach.runway}` : undefined, submenu: () => approachItems(ctx, ac) },
    );
  }
  // Hand-over like EuroScope: first the track (the next controller accepts it), then the crew ("contact").
  if (ctx.transfer && transferNeeded(ctx.sim, ac)) {
    const t = r?.transfer;
    const to = ac.category === 'arrival' ? 'Tower' : (r?.sector?.callsign ?? 'Center');
    const short = ac.category === 'arrival' ? 'TWR' : (r?.sector?.name ?? 'CTR');
    if (!t) items.push({ label: real ? `XFER ${short}` : `Hand-over to ${to} (transfer the track)`, action: () => ctx.transfer!(ac) });
    else items.push({ label: real ? `XFER ${short}` : `Hand-over to ${to}`, hint: t.acceptedAt === undefined ? (real ? 'REQ' : 'waiting for acceptance') : real ? 'ACC' : 'accepted - send the crew over', disabled: true });
  }
  items.push(handoffItem(ctx, ac), { divider: true, label: '' });
  items.push(entry(ctx, ac, 'standby', real ? 'STBY' : 'standby'), entry(ctx, ac, 'say again', real ? 'SAY AGN' : 'say again'), { divider: true, label: '' });
  if (ctx.measure) items.push({ label: real ? 'MEAS' : 'Measure from here', hint: real ? undefined : 'bearing, distance, time', action: () => ctx.measure!(ac) });
  if (ctx.toggleRoute) {
    const shown = ctx.routeShown?.(ac);
    items.push({ label: real ? 'ROUTE' : shown ? 'Hide route' : 'Show route', hint: real && shown ? 'ON' : undefined, action: () => ctx.toggleRoute!(ac) });
  }
  items.push({ label: real ? 'CENTER' : 'Centre view', action: () => ctx.center(ac) }, { label: real ? 'RST TAG' : 'Reset tag position', action: () => ctx.resetTag(ac) });
  return items;
}

/** The menu of a clicked tag item. */
export function radarTagItems(ctx: RadarMenuContext, ac: Aircraft, item: RadarTagItem): { title: string; items: MenuItem[] } {
  const t = (simple: string, real: string) => `${ac.callsign} - ${ctx.real ? real : simple}`;
  switch (item) {
    case 'level':
      return { title: t('level', 'ALT'), items: levelItems(ctx, ac) };
    case 'heading':
      return { title: t('heading', 'HDG'), items: headingMenu(ctx, ac) };
    case 'speed':
      return { title: t('speed', 'SPD'), items: speedItems(ctx, ac) };
    case 'route':
      return { title: t('direct', 'DCT'), items: directItems(ctx, ac) };
    case 'approach':
      return { title: t('approach', 'APP'), items: [...approachItems(ctx, ac), { divider: true, label: '' }, ...transitionItems(ctx, ac)] };
    default:
      return { title: `${ac.callsign} - ${ctx.sim.tel(ac).toUpperCase()}`, items: radarItems(ctx, ac) };
  }
}
