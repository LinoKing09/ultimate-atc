import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { formatMetar, METAR_INTERVAL_S } from '../src/core/met';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { EDDP } from '../src/data/airports/eddp';
import { EDDS } from '../src/data/airports/edds';

function sim(opts: Partial<ConstructorParameters<typeof Simulation>[0]> = {}): Simulation {
  return new Simulation({ airport: EDDS, position: 'GND', runway: '25', density: 'light', seed: 4, events: false, generateTraffic: false, startTime: new Date('2026-07-01T10:07:00Z'), ...opts });
}

function runUntil(s: Simulation, cond: () => boolean, maxS: number): boolean {
  for (let t = 0; t < maxS; t++) {
    if (cond()) return true;
    s.tick(1);
  }
  return cond();
}

const lastPilot = (s: Simulation, cs: string) => [...s.messages].reverse().find((m) => m.kind === 'pilot' && m.from === cs)?.text ?? '';

describe('METAR', () => {
  it('formats the observation and issues one at minute 20 and 50', () => {
    const s = sim();
    // The last routine observation before 10:07Z is the one of 09:50Z.
    expect(formatMetar(s, s.metar)).toMatch(/^METAR EDDS 010950Z \d{5}(G\d\d)?KT (CAVOK|\d{4}( [-+A-Z]+)* (FEW|SCT|BKN|OVC)\d{3}.*) M?\d\d\/M?\d\d Q\d{4} NOSIG$/);
    expect(s.metar.qnh).toBe(s.atis.qnh);
    runUntil(s, () => s.metar.time === '011020', 15 * 60);
    expect(s.time).toBeCloseTo(13 * 60, -1);
    runUntil(s, () => s.metar.time === '011050', METAR_INTERVAL_S + 5);
    expect(s.messages.filter((m) => /^METAR EDDS/.test(m.text)).length).toBe(2);
  });

  it('is the same for the same seed and does not change the traffic', () => {
    const a = sim({ generateTraffic: true, seed: 11 });
    const b = sim({ generateTraffic: true, seed: 11 });
    for (let t = 0; t < 2400; t++) {
      a.tick(1);
      b.tick(1);
    }
    expect(formatMetar(a, a.metar)).toBe(formatMetar(b, b.metar));
    expect(a.aircraft.map((x) => x.callsign)).toEqual(b.aircraft.map((x) => x.callsign));
  });

  it('a de-icing scenario is cold, a thunderstorm gets a SPECI', () => {
    const cold = sim({ scenario: { deicing: true } });
    expect(cold.metar.tempC).toBeLessThanOrEqual(1);
    const s = sim({ events: true, scenario: { events: [{ atMin: 1, kind: 'thunderstorm' }] } });
    runUntil(s, () => !!s.storm, 120);
    expect(s.metar.speci).toBe(true);
    expect(s.metar.weather).toContain('VCTS');
    expect(s.atisDifferences).toContain('VCTS');
  });
});

describe('ATIS', () => {
  it('has a D-ATIS text and a spoken form', () => {
    const s = sim();
    const text = s.atisDatis();
    expect(text[0]).toBe(`ATIS EDDS ${s.atisLetter} 0950`);
    expect(text).toContain('EXPECT ILS APCH');
    expect(text).toContain('RWY 25');
    expect(text).toContain('A-CDM IN PROGRESS');
    expect(text.some((l) => /^\d{5}KT .* T\d\d DPM?\d\d QNH\d{4}$/.test(l))).toBe(true);
    expect(text.at(-1)).toBe('TREND NOSIG');
    expect(s.atisText()).toMatch(new RegExp(`^Stuttgart information ${s.atisLetter}, time 0950\\. Expect ILS approach runway 25, runway in use 25, A-CDM in progress\\. Transition level \\d0\\. Wind .* QNH ${s.atis.qnh}\\. Trend nosig\\. Information ${s.atisLetter} out\\.$`));
    s.setSystem('dcl', false);
    expect(s.atisDatis()).toContain('DCL U/S');
  });

  it('names the runway of each apron with parallel runways', () => {
    const s = sim({ airport: EDDP, runway: '26R+26L' });
    expect(s.atisDatis()).toContain('EXPECT DEPENDENT ILS APCH');
    expect(s.atisDatis()).toContain('RWYS 26R AND 26L');
    expect(s.atisText()).toMatch(/aircraft on apron 1 or 3 expect departure and arrival runway 26R/);
  });

  it('a new ATIS takes the latest METAR', () => {
    const s = sim();
    s.met.metar = { ...s.metar, qnh: s.metar.qnh + 1 };
    expect(s.atisDifferences).toEqual([`QNH ${s.metar.qnh}`]);
    s.updateAtis({});
    expect(s.atis.qnh).toBe(s.metar.qnh);
    expect(s.atisDifferences).toEqual([]);
  });

  it('parses "information K is current, QNH 1018"', () => {
    const p = parseTransmission('DLH5AB information kilo is now current qnh 1 0 1 8', { callsigns: ['DLH5AB'], taxiways: new Set() });
    expect(p.commands).toEqual([{ type: 'information', letter: 'K', qnh: 1018 }]);
    expect(parseTransmission('DLH5AB qnh 998', { callsigns: ['DLH5AB'], taxiways: new Set() }).commands).toEqual([{ type: 'qnh', qnh: 998 }]);
  });

  it('crews that listened before a new ATIS report the old letter; you correct them or lose points', () => {
    const s = sim();
    const old = s.atisLetter;
    const a = s.traffic.spawnDeparture(60, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    const b = s.traffic.spawnDeparture(70, { stand: '16', callsign: 'EWG12A', type: 'A320' }) as Aircraft;
    s.updateAtis({});
    const cur = s.atisLetter;
    expect(cur).not.toBe(old);
    expect(runUntil(s, () => a.request === 'pushback' && b.request === 'pushback', 600)).toBe(true);
    expect(lastPilot(s, 'DLH5AB')).toMatch(new RegExp(`information ${old}\\b`, 'i'));
    expect(a.atisOutdated).toBe(true);
    // The wrong letter is queried, the right one read back.
    s.transmit(`DLH5AB information ${old} is current`);
    expect(runUntil(s, () => /confirm information/i.test(lastPilot(s, 'DLH5AB')), 15)).toBe(true);
    s.transmit(`DLH5AB information ${cur} is current, QNH ${s.atis.qnh}`);
    expect(runUntil(s, () => new RegExp(`information ${cur}, QNH ${s.atis.qnh}`, 'i').test(lastPilot(s, 'DLH5AB')), 15)).toBe(true);
    expect(a.atisOutdated).toBe(false);
    // The other one leaves your frequency with the old letter.
    expect(b.atisOutdated).toBe(true);
    b.frequency = 'TWR';
    s.tick(6);
    expect(s.stats.atisNotCorrected).toBe(1);
    expect(b.atisOutdated).toBe(false);
  });

  it('a broadcast of the current information corrects every crew on your frequency', () => {
    const s = sim();
    const a = s.traffic.spawnDeparture(60, { stand: '14', callsign: 'DLH5AB', type: 'A320' }) as Aircraft;
    s.updateAtis({});
    expect(runUntil(s, () => a.request === 'pushback', 600)).toBe(true);
    expect(a.atisOutdated).toBe(true);
    s.transmit(`all stations, information ${s.atisLetter} is now current, QNH ${s.atis.qnh}`);
    expect(a.atisOutdated).toBe(false);
    expect(a.atisHeard).toBe(s.atisLetter);
  });
});

describe('changing surface wind', () => {
  it('turns the actual wind to the next observed wind, and the METAR reports it', () => {
    const s = sim({ seed: 21 });
    const start = { ...s.observedWind };
    const winds: string[] = [];
    let last = s.metar.time;
    for (let t = 0; t < 3 * 3600; t++) {
      s.tick(1);
      if (s.metar.time !== last) {
        last = s.metar.time;
        // The routine observation reports the actual wind of that moment (direction to 10 degrees).
        expect(s.metar.wind.speedKt).toBe(s.observedWind.speedKt);
        if (s.metar.wind.speedKt > 0) expect(Math.abs(((s.metar.wind.direction - s.observedWind.direction + 540) % 360) - 180), `${s.metar.time} ${JSON.stringify(s.metar.wind)} ${JSON.stringify(s.observedWind)}`).toBeLessThanOrEqual(5);
        winds.push(`${s.metar.wind.direction}/${s.metar.wind.speedKt}`);
      }
      const w = s.observedWind;
      expect(w.speedKt).toBeGreaterThanOrEqual(0);
      expect(w.speedKt).toBeLessThanOrEqual(30);
      if (w.gustKt) expect(w.gustKt).toBeGreaterThanOrEqual(w.speedKt + 10);
    }
    expect(winds.length).toBe(6);
    // The wind changes over three hours, but stays near the prevailing wind of the session.
    expect(new Set(winds).size).toBeGreaterThan(2);
    const away = Math.abs(((s.observedWind.direction - start.direction + 540) % 360) - 180);
    expect(away).toBeLessThan(120);
  });

  it('shows the difference to the broadcast ATIS, and changes gradually', () => {
    const s = sim({ seed: 9 });
    let maxStep = 0;
    let prev = s.observedWind.direction;
    let differs = false;
    for (let t = 0; t < 4 * 3600; t++) {
      s.tick(1);
      maxStep = Math.max(maxStep, Math.abs(((s.observedWind.direction - prev + 540) % 360) - 180));
      prev = s.observedWind.direction;
      differs ||= s.atisDifferences.some((d) => d.startsWith('wind'));
    }
    expect(maxStep).toBeLessThanOrEqual(3);
    expect(differs).toBe(true);
  });

  it('takes a wind set in the ATIS editor as it is', () => {
    const s = sim({ seed: 21 });
    s.updateAtis({ wind: { direction: 70, speedKt: 6 } });
    for (let t = 0; t < 60; t++) s.tick(1);
    expect(s.observedWind).toEqual({ direction: 70, speedKt: 6 });
  });

  it('keeps the wind of the tutorials', () => {
    const s = sim({ seed: 21 });
    s.met.drift.enabled = false;
    const w = { ...s.observedWind };
    for (let t = 0; t < 2 * 3600; t++) s.tick(1);
    expect(s.observedWind).toEqual(w);
  });
});
