import type { StationType } from '../airport/types';
import type { Command, HoldShortTarget, TaxiDestination } from './commands';
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
    case 'taxi': {
      let s = c.destination ? `taxi to ${formatDestination(c.destination)}` : 'taxi';
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
    case 'handoff':
      if (!c.station && !c.frequency) return 'frequency change approved';
      return ['contact', c.station ? STATION_WORD[c.station] : '', c.frequency ?? ''].filter(Boolean).join(' ');
    case 'standby':
      return 'standby';
    case 'expedite':
      return 'expedite taxi';
    case 'sayAgain':
      return 'say again';
    case 'lineUp':
      return 'line up';
    case 'takeoff':
      return 'cleared for take-off';
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
