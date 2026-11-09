import type { Aircraft } from '../core/aircraft';
import { M_PER_NM, distance, headingDiff } from '../core/geo';
import { headingText, isFlightLevel, toMagnetic } from '../core/radar';
import type { Simulation } from '../core/simulation';
import type { MenuItem } from './menu';
import type { RadarTagItem } from './radarScope';

/**
 * Menus of the Approach / Departure position (radar): the aircraft menu and the menus of the tag items (level,
 * heading, speed, route, approach), EuroScope style. Every entry says a standard phrase (the same you could type).
 */

export interface RadarMenuContext {
  sim: Simulation;
  /** Transmits a phrase to the aircraft (callsign added). */
  say: (ac: Aircraft, phrase: string) => void;
  center: (ac: Aircraft) => void;
  resetTag: (ac: Aircraft) => void;
}

/** True if the aircraft is on your radar frequency (you work Approach / Departure). */
export function onMyRadar(sim: Simulation, ac: Aircraft): boolean {
  return ac.frequency === 'APP' && sim.userControls('APP') && !!sim.airspace && !ac.onGround;
}

/** "flight level 80" / "altitude 5000 feet" as a phrase part. */
function levelPhrase(sim: Simulation, ft: number): string {
  return isFlightLevel(sim, ft) ? `flight level ${Math.round(ft / 100)}` : `altitude ${ft} feet`;
}

/** Headings in 10 degree steps around the present one (magnetic), for one turn direction or both. */
export function headingItems(ctx: RadarMenuContext, ac: Aircraft, turn?: 'left' | 'right'): MenuItem[] {
  const now = toMagnetic(ctx.sim, ac.heading);
  const base = Math.round(now / 10) * 10;
  const out: MenuItem[] = [];
  for (let d = 10; d <= 180; d += 10) {
    const h = turn === 'left' ? base - d : turn === 'right' ? base + d : base + (d % 20 === 0 ? d / 2 : -(d + 10) / 2);
    const hdg = ((h % 360) + 360) % 360 || 360;
    const dir = turn ?? (headingDiff(now, hdg) < 0 ? 'left' : 'right');
    out.push({ label: `Turn ${dir} heading ${headingText(hdg)}`, action: () => ctx.say(ac, `turn ${dir} heading ${headingText(hdg)}`) });
    if (!turn && out.length >= 16) break;
  }
  return out;
}

/** The heading menu: left / right turns, present heading, and an intercept heading for the final. */
export function headingMenu(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const items: MenuItem[] = [
    { label: 'Turn left heading', submenu: () => headingItems(ctx, ac, 'left') },
    { label: 'Turn right heading', submenu: () => headingItems(ctx, ac, 'right') },
    { label: 'Continue present heading', hint: headingText(toMagnetic(ctx.sim, ac.heading)), action: () => ctx.say(ac, 'continue present heading') },
  ];
  const icpt = interceptHeading(ctx.sim, ac);
  if (icpt && ac.category === 'arrival') {
    const kind = ctx.sim.approachTypeFor(icpt.runway);
    const name = kind === 'LOC' ? 'localizer' : kind;
    items.push({
      label: `Turn ${icpt.turn} heading ${headingText(icpt.heading)}, cleared ${name} approach runway ${icpt.runway}`,
      hint: 'intercept',
      action: () => ctx.say(ac, `turn ${icpt.turn} heading ${headingText(icpt.heading)}, cleared ${name} approach runway ${icpt.runway}`),
    });
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
  return levels
    .sort((a, b) => (ac.category === 'departure' ? a - b : b - a))
    .map((ft) => {
      const verb = ft > now + 50 ? 'climb' : ft < now - 50 ? 'descend' : 'maintain';
      const phrase = `${verb} ${levelPhrase(sim, ft)}${verb === 'descend' ? qnh(ft) : ''}`;
      const mva = sim.airspace!.mvaAt(ac.pos);
      return { label: phrase.charAt(0).toUpperCase() + phrase.slice(1), hint: ft === cleared ? 'cleared' : ft < mva && ac.phase === 'inbound' ? `MVA ${mva}` : undefined, action: () => ctx.say(ac, phrase) };
    });
}

export function speedItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const items: MenuItem[] = [];
  const min = ac.type.approachSpeedKt + 15;
  if (ac.phase === 'approach') {
    items.push(
      { label: 'Maintain 160 knots until 4 miles', action: () => ctx.say(ac, 'maintain 160 knots until 4 miles') },
      { label: 'Reduce to final approach speed', action: () => ctx.say(ac, 'reduce to final approach speed') },
      { label: 'Resume normal speed', action: () => ctx.say(ac, 'resume normal speed') },
    );
    return items;
  }
  for (let kt = 300; kt >= Math.ceil(min / 10) * 10; kt -= 10) {
    const now = Math.round((ac.speed / 0.514444) / 10) * 10;
    const verb = kt < now ? 'reduce speed' : kt > now ? 'increase speed' : 'maintain';
    items.push({ label: `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${kt} knots`, hint: ac.radar?.speedKt === kt ? 'assigned' : undefined, action: () => ctx.say(ac, `${verb} ${kt} knots`) });
  }
  items.push({ label: 'No speed restrictions', action: () => ctx.say(ac, 'no speed restrictions') });
  return items;
}

/** Fixes to fly direct to, nearest first (and the SID exit fix / IAF first if there is one). */
export function directItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const as = ctx.sim.airspace!;
  const preferred = new Set<string>();
  const sid = ctx.sim.config.airport.sids.find((s) => s.name === ac.flightPlan.sid);
  if (ac.category === 'departure' && sid?.fix) preferred.add(sid.fix);
  if (ac.category === 'arrival') for (const e of as.entries) preferred.add(e.iaf);
  const fixes = [...as.fixes.entries()]
    .map(([name, f]) => ({ name, d: distance(ac.pos, f.pos) / M_PER_NM }))
    .filter((f) => f.d < 60)
    .sort((a, b) => (preferred.has(b.name) ? 1 : 0) - (preferred.has(a.name) ? 1 : 0) || a.d - b.d)
    .slice(0, 16);
  return fixes.map((f) => ({ label: `Proceed direct ${f.name}`, hint: `${f.d.toFixed(0)} NM`, action: () => ctx.say(ac, `proceed direct ${f.name}`) }));
}

export function holdItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  return ctx.sim.airspace!.holdings.map((hd) => ({ label: `Hold over ${hd.fix}`, hint: `MHA ${hd.minAltFt}`, action: () => ctx.say(ac, `hold over ${hd.fix}`) }));
}

export function approachItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const sim = ctx.sim;
  if (ac.category !== 'arrival') return [{ label: 'Departure - no approach', disabled: true }];
  const items: MenuItem[] = [];
  for (const r of sim.arrivalRunways) {
    const kind = sim.approachTypeFor(r);
    const name = kind === 'LOC' ? 'localizer' : kind;
    items.push({ label: `Cleared ${name} approach runway ${r}`, hint: ac.radar?.approach?.runway === r ? 'cleared' : undefined, action: () => ctx.say(ac, `cleared ${name} approach runway ${r}`) });
  }
  const icpt = interceptHeading(sim, ac);
  if (icpt) {
    const kind = sim.approachTypeFor(icpt.runway);
    const name = kind === 'LOC' ? 'localizer' : kind;
    items.push({ label: `Turn ${icpt.turn} heading ${headingText(icpt.heading)}, cleared ${name} approach runway ${icpt.runway}`, action: () => ctx.say(ac, `turn ${icpt.turn} heading ${headingText(icpt.heading)}, cleared ${name} approach runway ${icpt.runway}`) });
  }
  items.push({ label: 'Report established', action: () => ctx.say(ac, 'report established on the localizer') });
  return items;
}

/** Hand-off: arrivals to Tower, departures to their Center sector. */
function handoffItem(ctx: RadarMenuContext, ac: Aircraft): MenuItem {
  const sim = ctx.sim;
  if (ac.category === 'arrival') {
    const twr = sim.airport.station(sim.stationFor('tower'));
    const f = sim.frequencyFor(sim.stationFor('tower'), ac);
    return { label: `Contact ${twr?.name ?? 'Tower'} ${f}`, hint: ac.request === 'radar' ? 'requested' : undefined, action: () => ctx.say(ac, `contact ${twr?.name ?? 'tower'} ${f}`) };
  }
  const s = ac.radar?.sector ?? sim.airspace!.sectorFor(undefined);
  return { label: `Contact ${s.callsign} ${s.frequency}`, hint: `sector ${s.name}, release ${levelPhrase(sim, s.releaseFt).replace('flight level', 'FL')}`, action: () => ctx.say(ac, `contact ${s.callsign} ${s.frequency}`) };
}

/** The aircraft menu on the radar. */
export function radarItems(ctx: RadarMenuContext, ac: Aircraft): MenuItem[] {
  const r = ac.radar;
  const items: MenuItem[] = [];
  if (r && !r.identified && (ac.request === 'checkIn' || !r.identified)) items.push({ label: 'Identified', hint: ac.request === 'checkIn' ? 'first call' : undefined, action: () => ctx.say(ac, 'identified') });
  items.push(
    { label: 'Heading', hint: r?.heading !== undefined ? headingText(r.heading) : undefined, submenu: () => headingMenu(ctx, ac) },
    { label: ac.category === 'departure' ? 'Climb' : 'Descend / climb', hint: r ? String(Math.round(r.clearedFt / 100)).padStart(3, '0') : undefined, submenu: () => levelItems(ctx, ac) },
    { label: 'Speed', hint: r?.speedKt ? `${r.speedKt} kt` : undefined, submenu: () => speedItems(ctx, ac) },
    { label: 'Proceed direct', hint: r?.route[0], submenu: () => directItems(ctx, ac) },
  );
  if (ac.category === 'arrival') {
    items.push({ label: 'Hold over', hint: r?.hold?.fix, submenu: () => holdItems(ctx, ac) }, { label: 'Approach', hint: r?.approach ? `${r.approach.kind} ${r.approach.runway}` : undefined, submenu: () => approachItems(ctx, ac) });
  }
  items.push(handoffItem(ctx, ac), { divider: true, label: '' });
  items.push(
    { label: 'Standby', action: () => ctx.say(ac, 'standby') },
    { label: 'Say again', action: () => ctx.say(ac, 'say again') },
    { divider: true, label: '' },
    { label: 'Centre view', action: () => ctx.center(ac) },
    { label: 'Reset tag position', action: () => ctx.resetTag(ac) },
  );
  return items;
}

/** The menu of a clicked tag item. */
export function radarTagItems(ctx: RadarMenuContext, ac: Aircraft, item: RadarTagItem): { title: string; items: MenuItem[] } {
  switch (item) {
    case 'level':
      return { title: `${ac.callsign} - level`, items: levelItems(ctx, ac) };
    case 'heading':
      return { title: `${ac.callsign} - heading`, items: headingMenu(ctx, ac) };
    case 'speed':
      return { title: `${ac.callsign} - speed`, items: speedItems(ctx, ac) };
    case 'route':
      return { title: `${ac.callsign} - direct`, items: directItems(ctx, ac) };
    case 'approach':
      return { title: `${ac.callsign} - approach`, items: approachItems(ctx, ac) };
    default:
      return { title: `${ac.callsign} - ${ctx.sim.tel(ac).toUpperCase()}`, items: radarItems(ctx, ac) };
  }
}
