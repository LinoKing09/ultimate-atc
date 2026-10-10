import type { StationType } from '../airport/types';
import { destinationName, resolveDestination } from '../../data/destinations';
import type { Altitude, Command, HoldShortTarget, TaxiDestination } from './commands';
import { telephonyCallsign } from './speech';

/** Word used for a station type in phraseology ("contact Tower"). */
export const STATION_WORD: Record<StationType, string> = {
  DEL: 'Delivery',
  GND: 'Ground',
  TWR: 'Tower',
  APP: 'Radar',
  DEP: 'Departure',
  CTR: 'Radar',
  ATIS: 'Information',
};

export function formatDestination(d: TaxiDestination): string {
  switch (d.kind) {
    case 'holdingPoint':
      return `holding point ${d.name}${d.runway ? ` runway ${d.runway}` : ''}`;
    case 'runway':
      return `runway ${d.runway}`;
    case 'stand':
      return `stand ${d.stand}`;
    case 'holdShort':
      return `holding short of taxiway ${d.name}`;
  }
}

export function formatHoldShort(t: HoldShortTarget): string {
  return t.kind === 'runway' ? `hold short of runway ${t.runway}` : `hold short of taxiway ${t.name}`;
}

/** Canonical controller phraseology for a command (without callsign). */
export function formatCommand(c: Command): string {
  switch (c.type) {
    case 'pushback':
      return `${c.startup ? 'push and start approved' : 'pushback approved'}${c.facing ? `, facing ${c.facing}` : ''}`;
    case 'startup':
      return 'start-up approved';
    case 'cancelPushback':
      return 'cancel pushback';
    case 'stopPushback':
      return 'stop pushback';
    case 'sequence':
      return `number ${c.number}${c.for ? ` for ${c.for}` : ''}`;
    case 'expect':
      return `expect ${c.what} in ${c.minutes} minute${c.minutes === 1 ? '' : 's'}`;
    case 'taxi': {
      const verb = c.tow ? 'tow approved' : 'taxi';
      let s = c.destination && c.destination.kind !== 'holdShort' ? `${verb} to ${formatDestination(c.destination)}` : verb;
      if (c.via.length) s += ` via ${c.via.join(', ')}`;
      for (const h of c.holdShort) s += `, ${formatHoldShort(h)}`;
      for (const r of c.cross) s += `, cross runway ${r}`;
      return s;
    }
    case 'holdShort':
      return formatHoldShort(c.target);
    case 'cross':
      return `cross runway ${c.runway}`;
    case 'holdPosition':
      return 'hold position';
    case 'continue':
      return 'continue taxi';
    case 'giveWay':
      return `give way to ${telephonyCallsign(c.callsign)}`;
    case 'follow':
      return `follow ${telephonyCallsign(c.callsign)}`;
    case 'followMe':
      return 'follow the follow-me';
    case 'proceed': {
      let s = 'proceed';
      if (c.base) s += ' to base';
      else if (c.target) s += ` to ${telephonyCallsign(c.target)}`;
      else if (c.destination) s += ` to ${formatDestination(c.destination)}`;
      if (c.via.length) s += ` via ${c.via.join(', ')}`;
      return s;
    }
    case 'returnToBase':
      return 'return to base';
    case 'reportPosition':
      return 'report position';
    case 'handoff':
      if (!c.station && !c.frequency) return 'frequency change approved';
      return ['contact', c.station ? STATION_WORD[c.station] : '', c.frequency ?? ''].filter(Boolean).join(' ');
    case 'standby':
      return 'standby';
    case 'roger':
      return 'roger';
    case 'expedite':
      return 'expedite taxi';
    case 'sayAgain':
      return 'say again';
    case 'askIntersection':
      return `advise able for departure from intersection ${c.name}`;
    case 'clearance':
      return formatClearance(c);
    case 'squawk':
      return `squawk ${c.code}`;
    case 'readbackCorrect':
      return 'readback correct';
    case 'ctot':
      return `CTOT ${c.time}`;
    case 'lineUp':
      return `line up and wait${c.runway ? ` runway ${c.runway}` : ''}`;
    case 'takeoff':
      return `${c.runway ? `runway ${c.runway}, ` : ''}cleared for ${c.immediate ? 'immediate ' : ''}take-off`;
    case 'speed':
      if (c.final) return 'reduce to final approach speed';
      return `maintain ${c.kt} knots${c.untilNm ? ` until ${c.untilNm} miles` : ''}`;
    case 'land':
      return `${c.runway ? `runway ${c.runway}, ` : ''}cleared to land`;
    case 'continueApproach':
      return c.lateLanding ? 'continue approach, expect late landing clearance' : 'continue approach';
    case 'goAround':
      return 'go around';
    case 'cancelTakeoff':
      return 'hold position, cancel take-off';
    case 'vacate':
      return `vacate via ${c.exit}`;
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "5000 feet" / "flight level 70". */
export function formatAltitude(a: Altitude): string {
  return 'fl' in a ? `flight level ${a.fl}` : `${a.feet} feet`;
}

/** An IFR clearance in standard order: limit, route (SID), runway, climb, squawk, slot. */
export function formatClearance(c: Extract<Command, { type: 'clearance' }>): string {
  const dest = c.destination ? (resolveDestination(c.destination) ? destinationName(resolveDestination(c.destination)!) : c.destination) : '';
  const parts = [`cleared to ${dest || '...'}${c.sid ? ` via ${c.sid} departure` : ''}`];
  if (c.runway) parts.push(`runway ${c.runway}`);
  if (c.climb) parts.push(`climb ${formatAltitude(c.climb)}`);
  if (c.squawk) parts.push(`squawk ${c.squawk}`);
  if (c.ctot) parts.push(`CTOT ${c.ctot}`);
  return parts.join(', ');
}
