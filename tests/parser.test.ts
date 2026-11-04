import { describe, expect, it } from 'vitest';
import { afterDisregard, parseTransmission, tokenize } from '../src/core/phraseology/parser';
import { toSpoken, telephonyCallsign } from '../src/core/phraseology/speech';

const ctx = {
  callsigns: ['DLH5AB', 'EWG7TK', 'THY1734', 'DCMGB', 'WZZ12AB'],
  taxiways: new Set(['N', 'S', 'R', 'V', 'A', 'B', 'C', 'D', 'E', 'F', 'G']),
};

describe('tokenize', () => {
  it('converts spoken numbers and letters', () => {
    expect(tokenize('Lufthansa five alpha bravo, runway two five')).toEqual(['lufthansa', '5', 'a', 'b', 'runway', '2', '5']);
    expect(tokenize('one one eight decimal eight zero five')).toEqual(['118.805']);
  });
});

describe('parseTransmission', () => {
  it('parses pushback with facing', () => {
    const p = parseTransmission('DLH5AB pushback approved facing east', ctx);
    expect(p.callsign).toBe('DLH5AB');
    expect(p.commands).toEqual([{ type: 'pushback', facing: 'east', startup: false }]);
  });

  it('parses push and start with telephony callsign', () => {
    const p = parseTransmission('Lufthansa 5AB, push and start approved, face west', ctx);
    expect(p.callsign).toBe('DLH5AB');
    expect(p.commands[0]).toEqual({ type: 'pushback', facing: 'west', startup: true });
  });

  it('handles "tail" facing', () => {
    const p = parseTransmission('EWG7TK push back approved tail east', ctx);
    expect(p.commands[0]).toMatchObject({ type: 'pushback', facing: 'west' });
  });

  it('parses a taxi instruction to a holding point', () => {
    const p = parseTransmission('DLH5AB taxi to holding point G1 runway 25 via N, G', ctx);
    expect(p.commands).toEqual([
      { type: 'taxi', destination: { kind: 'holdingPoint', name: 'G1', runway: '25' }, via: ['N', 'G'], holdShort: [], cross: [] },
    ]);
  });

  it('parses spoken taxi instructions', () => {
    const p = parseTransmission('eurowings seven tango kilo taxi via november golf to holding point golf one', ctx);
    expect(p.callsign).toBe('EWG7TK');
    expect(p.commands[0]).toMatchObject({ type: 'taxi', destination: { kind: 'holdingPoint', name: 'G1' }, via: ['N', 'G'] });
  });

  it('parses taxi to stand with hold short', () => {
    const p = parseTransmission('EWG7TK taxi to stand 12 via N R hold short of taxiway D', ctx);
    expect(p.commands[0]).toMatchObject({
      type: 'taxi',
      destination: { kind: 'stand', stand: '12' },
      via: ['N', 'R'],
      holdShort: [{ kind: 'taxiway', name: 'D' }],
    });
  });

  it('parses taxi to runway and crossing', () => {
    const p = parseTransmission('THY1734 taxi to runway 25 via S, G, cross runway 25', ctx);
    expect(p.commands[0]).toMatchObject({ type: 'taxi', destination: { kind: 'runway', runway: '25' }, via: ['S', 'G'], cross: ['25'] });
  });

  it('parses handoff with frequency', () => {
    const p = parseTransmission('DLH5AB contact tower 118.805', ctx);
    expect(p.commands).toEqual([{ type: 'handoff', station: 'TWR', frequency: '118.805' }]);
    const q = parseTransmission('DLH5AB contact Stuttgart Tower one one eight decimal eight zero five, bye', ctx);
    expect(q.commands).toEqual([{ type: 'handoff', station: 'TWR', frequency: '118.805' }]);
  });

  it('parses hold position / continue / give way', () => {
    expect(parseTransmission('DLH5AB hold position', ctx).commands).toEqual([{ type: 'holdPosition' }]);
    expect(parseTransmission('DLH5AB continue taxi', ctx).commands).toEqual([{ type: 'continue' }]);
    expect(parseTransmission('DLH5AB give way to Eurowings 7TK from the left', ctx).commands).toEqual([
      { type: 'giveWay', callsign: 'EWG7TK' },
    ]);
  });

  it('uses the selected aircraft when no callsign is given', () => {
    const p = parseTransmission('hold short of runway 25', { ...ctx, selected: 'EWG7TK' });
    expect(p.callsign).toBe('EWG7TK');
    expect(p.explicitCallsign).toBe(false);
    expect(p.commands).toEqual([{ type: 'holdShort', target: { kind: 'runway', runway: '25' } }]);
  });

  it('accepts the callsign at the end and flight-number suffixes', () => {
    expect(parseTransmission('pushback approved, DLH5AB', ctx).callsign).toBe('DLH5AB');
    expect(parseTransmission('1734 hold position', ctx).callsign).toBe('THY1734');
  });

  it('parses multi-word telephony and registrations', () => {
    expect(parseTransmission('Wizz Air 12AB standby', ctx)).toMatchObject({ callsign: 'WZZ12AB', commands: [{ type: 'standby' }] });
    expect(parseTransmission('DCMGB taxi to holding point A1 via N A', ctx).callsign).toBe('DCMGB');
  });

  it('reports unknown words', () => {
    const p = parseTransmission('DLH5AB banana', ctx);
    expect(p.commands).toEqual([]);
    expect(p.unparsed).toEqual(['banana']);
  });
});

describe('speech', () => {
  it('formats telephony and spoken text', () => {
    expect(telephonyCallsign('DLH5AB')).toBe('Lufthansa 5AB');
    expect(toSpoken('Lufthansa 5AB, taxi to holding point G1 runway 25')).toBe(
      'Lufthansa five Alpha Bravo, taxi to holding point Golf one runway two five',
    );
    expect(toSpoken('Tower 118.805, goodbye')).toBe('Tower one one eight decimal eight zero five, goodbye');
    // Runway designators, altitudes and abbreviations as they are said on the radio.
    expect(toSpoken('runway 26R, cleared for take-off')).toBe('runway two six right, cleared for take-off');
    expect(toSpoken('climb 5000 feet, QNH 1018')).toBe('climb five thousand feet, Q-N-H one zero one eight');
    expect(toSpoken('passing 4500 feet')).toBe('passing four thousand five hundred feet');
    expect(toSpoken('climb 10000 feet')).toBe('climb one zero thousand feet');
    expect(toSpoken('cleared ILS approach runway 08L')).toBe('cleared I-L-S approach runway zero eight left');
  });

  it('repairs phrases a recogniser hears in the wrong order or form', () => {
    expect(parseTransmission('speedbird one two clear for take of runway two five', { ...ctx, callsigns: ['BAW12'] }).commands).toEqual([{ type: 'takeoff', runway: '25' }]);
    expect(parseTransmission('lufthansa five alpha bravo line up and weight runway two five', ctx).commands).toEqual([{ type: 'lineUp', runway: '25' }]);
    // "line up" spoken quickly, heard as "land".
    for (const heard of ['land and wait', 'land up and wait', 'line and wait', 'lined up and wait']) {
      expect(parseTransmission(`eurowings seven charlie delta ${heard} runway two five`, { ...ctx, callsigns: ['EWG7CD'] }).commands).toEqual([{ type: 'lineUp', runway: '25' }]);
    }
    expect(parseTransmission('lufthansa five alpha bravo whole short of runway two five', ctx).commands).toEqual([{ type: 'holdShort', target: { kind: 'runway', runway: '25' } }]);
  });

  it('cancels what was said before "disregard"', () => {
    expect(afterDisregard('lufthansa five alpha bravo taxi to holding point alpha disregard')).toEqual({ disregarded: true, rest: '' });
    expect(afterDisregard('DLH5AB taxi to holding point A, disregard, DLH5AB hold position')).toEqual({ disregarded: true, rest: 'DLH5AB hold position' });
    expect(afterDisregard('DLH5AB hold position')).toEqual({ disregarded: false, rest: 'DLH5AB hold position' });
    expect(afterDisregard('Disregard.')).toEqual({ disregarded: true, rest: '' });
  });

  it('ignores "break break" in front of a transmission', () => {
    for (const text of ['break break DLH5AB hold position', 'Break, break, Lufthansa five alpha bravo, hold position']) {
      const p = parseTransmission(text, ctx);
      expect(p.callsign).toBe('DLH5AB');
      expect(p.commands).toEqual([{ type: 'holdPosition' }]);
      expect(p.unparsed).toEqual([]);
    }
  });

  it('parses questions about intersection departures', () => {
    for (const text of ['DLH5AB are you able intersection D', 'DLH5AB advise able for departure from intersection D', 'DLH5AB confirm able to depart from D runway 25', 'Lufthansa 5AB able for an intersection departure from delta']) {
      const p = parseTransmission(text, ctx);
      expect(p.commands).toEqual([{ type: 'askIntersection', name: 'D' }]);
    }
  });

  it('parses "turn around" with a taxi instruction, before or after it', () => {
    for (const text of ['DLH5AB turn around, taxi to stand 14 via N', 'DLH5AB taxi to stand 14 via N, turn around']) {
      expect(parseTransmission(text, ctx).commands).toEqual([{ type: 'taxi', destination: { kind: 'stand', stand: '14' }, via: ['N'], holdShort: [], cross: [], turnAround: true }]);
    }
  });
});
