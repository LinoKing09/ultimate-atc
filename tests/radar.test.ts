import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { M_PER_NM, distance } from '../src/core/geo';
import { parseTransmission } from '../src/core/phraseology/parser';
import { assumeTrack, finalCoordinates, offered, tasFactor, toMagnetic, windAloft } from '../src/core/radar';
import { Simulation } from '../src/core/simulation';
import { fingerprint, perform, restoreSession, saveSession } from '../src/core/session';
import { AIRPORTS } from '../src/data/airports';
import { EDDS } from '../src/data/airports/edds';
import { aircraftType } from '../src/data/aircraftTypes';

function appSim(seed = 7, traffic = false, positions: ('APP' | 'TWR' | 'GND' | 'DEL')[] = ['APP']) {
  return new Simulation({ airport: EDDS, position: positions[0], positions, runway: '25', density: 'medium', seed, events: false, generateTraffic: traffic });
}
function runUntil(sim: Simulation, cond: () => boolean, max = 1800): boolean {
  for (let t = 0; t < max && !cond(); t++) sim.tick(1);
  return cond();
}
function last(sim: Simulation, cs: string): string {
  return sim.messages.filter((m) => m.kind === 'pilot' && m.from === cs).at(-1)?.text ?? '';
}
function inbound(sim: Simulation, origin = 'EDDH', callsign = 'EWG7AB', assume = true): Aircraft {
  const ac = sim.traffic.spawnInbound({ airline: sim.traffic['pickAirline'](), type: aircraftType('A320'), origin })!;
  ac.callsign = callsign;
  // Center offers the track: assumed at once (the tests of the offer do it themselves).
  if (assume) assumeTrack(sim, ac);
  return ac;
}

const fixes = ['LBU', 'TEKSI', 'STG', 'BADSO', 'REUTL', 'ETASA', 'DS531'];
const ctx = (cs: string[]) => ({ callsigns: cs, taxiways: new Set(['A', 'B', 'C']), fixes });

describe('radar phraseology', () => {
  it('parses vectors, levels, direct, holdings and approach clearances', { timeout: 120000 }, () => {
    const c = ctx(['EWG7AB']);
    expect(parseTransmission('EWG7AB turn left heading 270', c).commands).toEqual([{ type: 'heading', heading: 270, turn: 'left' }]);
    expect(parseTransmission('EWG7AB fly heading 090', c).commands).toEqual([{ type: 'heading', heading: 90 }]);
    expect(parseTransmission('EWG7AB continue present heading', c).commands).toEqual([{ type: 'heading', present: true }]);
    expect(parseTransmission('EWG7AB descend altitude 5000 feet, QNH 1013', c).commands).toEqual([
      { type: 'level', altitude: { feet: 5000 }, verb: 'descend' },
      { type: 'qnh', qnh: 1013 },
    ]);
    expect(parseTransmission('EWG7AB climb flight level 140', c).commands).toEqual([{ type: 'level', altitude: { fl: 140 }, verb: 'climb' }]);
    expect(parseTransmission('EWG7AB descend to FL80', c).commands).toEqual([{ type: 'level', altitude: { fl: 80 }, verb: 'descend' }]);
    expect(parseTransmission('EWG7AB maintain 5000 feet', c).commands).toEqual([{ type: 'level', altitude: { feet: 5000 }, verb: 'maintain' }]);
    expect(parseTransmission('EWG7AB maintain 160 knots until 4 miles', c).commands).toEqual([{ type: 'speed', kt: 160, untilNm: 4 }]);
    expect(parseTransmission('EWG7AB reduce speed 220 knots', c).commands).toEqual([{ type: 'speed', kt: 220 }]);
    expect(parseTransmission('EWG7AB no speed restrictions', c).commands).toEqual([{ type: 'speed', resume: true }]);
    expect(parseTransmission('EWG7AB proceed direct LBU', c).commands).toEqual([{ type: 'direct', fix: 'LBU' }]);
    expect(parseTransmission('EWG7AB proceed direct lima bravo uniform', c).commands).toEqual([{ type: 'direct', fix: 'LBU' }]);
    expect(parseTransmission('EWG7AB hold over TEKSI as published', c).commands).toEqual([{ type: 'holdAt', fix: 'TEKSI' }]);
    expect(parseTransmission('EWG7AB turn left heading 280, cleared ILS approach runway 25', c).commands).toEqual([
      { type: 'heading', heading: 280, turn: 'left' },
      { type: 'approachClearance', kind: 'ILS', runway: '25' },
    ]);
    expect(parseTransmission('EWG7AB cleared RNP approach runway 07', c).commands).toEqual([{ type: 'approachClearance', kind: 'RNP', runway: '07' }]);
    expect(parseTransmission('EWG7AB Langen Radar, identified, descend altitude 5000 feet', c).commands.map((x) => x.type)).toEqual(['identified', 'level']);
    expect(parseTransmission('EWG7AB report established on the localizer', c).commands).toEqual([{ type: 'reportEstablished' }]);
    expect(parseTransmission('EWG7AB contact Langen Radar 131.300', c).commands).toEqual([{ type: 'handoff', station: 'APP', frequency: '131.300' }]);
  });
});

describe('Approach / Departure position (radar)', () => {
  it('arrivals are handed over by Center at their entry fix and call in', { timeout: 120000 }, () => {
    const sim = appSim();
    const ac = inbound(sim, 'EDDH');
    expect(ac.phase).toBe('inbound');
    expect(ac.onGround).toBe(false);
    expect(ac.radar?.route).toEqual(['LBU']);
    runUntil(sim, () => ac.request === 'checkIn', 60);
    expect(last(sim, ac.callsign)).toMatch(/^Langen Radar, .*descending flight level 100, information [A-Z]$/);
    sim.transmit(`${ac.callsign} identified, descend altitude 5000 feet, QNH ${sim.atis.qnh}`);
    runUntil(sim, () => /descending 5000 feet/.test(last(sim, ac.callsign)), 20);
    expect(last(sim, ac.callsign)).toMatch(/^Descending 5000 feet, QNH \d+, /);
    expect(ac.request).toBeNull();
    // The crew queries an altitude above the transition altitude.
    sim.transmit(`${ac.callsign} climb altitude 7000 feet`);
    runUntil(sim, () => /confirm flight level 70/.test(last(sim, ac.callsign)), 20);
    expect(ac.radar?.clearedFt).toBe(5000);
  });

  it('vectors an arrival onto the ILS, hands it to Tower and it lands', { timeout: 120000 }, () => {
    const sim = appSim(11);
    const ac = inbound(sim, 'EDDH');
    runUntil(sim, () => ac.request === 'checkIn', 60);
    sim.transmit(`${ac.callsign} identified, descend altitude 5000 feet, QNH ${sim.atis.qnh}`);
    sim.tick(15);
    // Right-hand downwind for 25 (north of the field), then base and an intercept heading.
    sim.transmit(`${ac.callsign} turn right heading 070`);
    sim.tick(15);
    const end = sim.airport.runwayEnd('25')!;
    expect(runUntil(sim, () => finalCoordinates(end, ac.pos).along < -14 * M_PER_NM, 900)).toBe(true);
    sim.transmit(`${ac.callsign} turn right heading 160`);
    sim.tick(15);
    expect(runUntil(sim, () => Math.abs(finalCoordinates(end, ac.pos).cross) < 4 * M_PER_NM, 600)).toBe(true);
    sim.transmit(`${ac.callsign} turn right heading 220, cleared ILS approach runway 25`);
    runUntil(sim, () => /cleared ILS approach runway 25/.test(last(sim, ac.callsign)), 20);
    expect(runUntil(sim, () => ac.phase === 'approach', 900)).toBe(true);
    expect(Math.abs(toMagnetic(sim, ac.heading) - toMagnetic(sim, end.heading))).toBeLessThan(1);
    sim.transmit(`${ac.callsign} contact Stuttgart Tower 118.805`);
    expect(runUntil(sim, () => ac.frequency === 'TWR', 30)).toBe(true);
    expect(sim.stats.arrivalsToTower).toBe(1);
    expect(runUntil(sim, () => ac.onGround, 900)).toBe(true);
    expect(sim.stats.radarSeparationLosses).toBe(0);
  });

  it('flies the STAR to the IAF and holds there without a clearance', { timeout: 120000 }, () => {
    const sim = appSim(3);
    const ac = inbound(sim, 'LTAI');
    expect(ac.radar?.route).toEqual(['TEKSI', 'BABEG', 'STG']);
    expect(runUntil(sim, () => !!ac.radar?.hold, 1800)).toBe(true);
    expect(runUntil(sim, () => ac.request === 'vectors', 30)).toBe(true);
    expect(last(sim, ac.callsign)).toMatch(/entering the hold over STG/);
    const stg = sim.airspace!.fix('STG')!;
    sim.tick(300);
    expect(distance(ac.pos, stg)).toBeLessThan(10 * M_PER_NM);
    // Cleared for the approach from the hold: it flies to the final on its own and joins it.
    sim.transmit(`${ac.callsign} descend altitude 5000 feet, cleared ILS approach runway 25`);
    expect(runUntil(sim, () => ac.phase === 'approach', 1500)).toBe(true);
  });

  it('departures call in after take-off, climb towards their exit fix and go to Center', { timeout: 120000 }, () => {
    const sim = appSim(5, true);
    let dep: Aircraft | undefined;
    expect(runUntil(sim, () => !!(dep = sim.aircraft.find((a) => a.category === 'departure' && a.frequency === 'APP' && a.request === 'checkIn')), 3600)).toBe(true);
    const d = dep!;
    expect(last(sim, d.callsign)).toMatch(/departure, passing \d+ feet, climbing 5000 feet$/);
    sim.transmit(`${d.callsign} identified, climb flight level 140`);
    sim.tick(20);
    expect(d.radar?.clearedFt).toBe(14000);
    expect(runUntil(sim, () => distance(d.pos, { x: 0, y: 0 }) > 20 * M_PER_NM, 900)).toBe(true);
    const freq = d.radar!.sector!.frequency;
    sim.transmit(`${d.callsign} contact Langen Radar ${freq}`);
    expect(runUntil(sim, () => d.frequency === 'CTR', 30)).toBe(true);
    expect(sim.stats.departuresToCenter).toBe(1);
  });

  it('runs an hour of traffic with every position but Approach run by the simulator', { timeout: 120000 }, () => {
    const sim = appSim(21, true);
    // Bot: answer every call, then give each arrival the approach clearance straight away (it flies the transition).
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      if (t % 5) continue;
      for (const a of sim.aircraft) if (offered(a)) assumeTrack(sim, a);
      for (const a of sim.aircraft) {
        if (a.frequency !== 'APP' || !a.request || sim.frequency.hasQueued(a.callsign)) continue;
        if (a.category === 'arrival' && a.phase === 'inbound') sim.transmit(`${a.callsign} identified, descend altitude 5000 feet, cleared ILS approach runway 25`);
        else if (a.request === 'radar') sim.transmit(`${a.callsign} contact Stuttgart Tower 118.805`);
        else if (a.category === 'departure') sim.transmit(`${a.callsign} identified, climb flight level ${a.radar?.sector?.releaseFt ? a.radar.sector.releaseFt / 100 : 100}`);
      }
      for (const a of sim.aircraft) {
        if (a.frequency === 'APP' && a.category === 'departure' && a.radar && !a.radar.toCenter && distance(a.pos, { x: 0, y: 0 }) > 22 * M_PER_NM && !sim.frequency.hasQueued(a.callsign)) {
          sim.transmit(`${a.callsign} contact Langen Radar ${a.radar.sector!.frequency}`);
        }
      }
    }
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.departuresToCenter).toBeGreaterThan(3);
    expect(sim.stats.arrivalsToTower + sim.stats.radarHandoffsMissed).toBeGreaterThan(3);
    // Nobody stays forever in the air.
    expect(sim.aircraft.filter((a) => a.phase === 'inbound' && sim.time - a.spawnedAt > 2400).length).toBe(0);
  });
});

describe('radar read-backs', () => {
  it('queries an approach to a runway not in use and an impossible climb', { timeout: 120000 }, () => {
    const sim = appSim(9);
    const ac = inbound(sim, 'EDDH');
    runUntil(sim, () => ac.request === 'checkIn', 60);
    sim.transmit(`${ac.callsign} cleared ILS approach runway 07`);
    runUntil(sim, () => /confirm runway 07/.test(last(sim, ac.callsign)), 20);
    expect(last(sim, ac.callsign)).toMatch(/^Confirm runway 07, the ATIS gives runway 25 for landing/);
    expect(ac.radar?.approach).toBeUndefined();
    sim.transmit(`${ac.callsign} climb flight level 80`);
    runUntil(sim, () => /onfirm climb/.test(last(sim, ac.callsign)), 20);
    expect(ac.radar?.clearedFt).toBe(10000);
    sim.transmit(`${ac.callsign} turn left heading 180`);
    runUntil(sim, () => /Left heading 180/.test(last(sim, ac.callsign)), 20);
    expect(ac.radar?.heading).toBe(180);
    expect(ac.radar?.route).toEqual([]);
  });
});

describe('radar sessions', () => {
  it('a radar session replays exactly from its log', { timeout: 120000 }, async () => {
    const sim = appSim(13, true);
    for (let t = 0; t < 1500; t++) {
      sim.tick(1);
      if (t % 7) continue;
      for (const a of sim.aircraft) if (offered(a)) perform(sim, { k: 'assume', callsign: a.callsign });
      for (const a of sim.aircraft) {
        if (a.frequency !== 'APP' || !a.request || sim.frequency.hasQueued(a.callsign)) continue;
        const text = a.category === 'arrival' ? `${a.callsign} identified, turn left heading 200, descend altitude 5000 feet, cleared ILS approach runway 25` : `${a.callsign} identified, climb flight level 140`;
        perform(sim, { k: 'transmit', text });
        break;
      }
    }
    const saved = JSON.parse(JSON.stringify(saveSession(sim, 'radar', 0)));
    const { sim: back, matches } = await restoreSession(saved, AIRPORTS);
    expect(matches).toBe(true);
    for (let t = 0; t < 120; t++) {
      sim.tick(1);
      back.tick(1);
    }
    expect(fingerprint(back)).toBe(fingerprint(sim));
  });
});

describe('SIDs, STARs and RNAV transitions', () => {
  it('parses transitions', { timeout: 120000 }, () => {
    const c = ctx(['EWG7AB']);
    expect(parseTransmission('EWG7AB via LBU 25 transition, cleared ILS approach runway 25', c).commands).toEqual([
      { type: 'transition', name: 'LBU 25' },
      { type: 'approachClearance', kind: 'ILS', runway: '25' },
    ]);
    expect(parseTransmission('EWG7AB cleared teksi 25 transition', c).commands).toEqual([{ type: 'transition', name: 'TEKSI 25' }]);
    expect(parseTransmission('EWG7AB proceed via transition lima bravo uniform 2 5', c).commands).toEqual([{ type: 'transition', name: 'LBU 25' }]);
  });

  it('departures fly the waypoints of their SID', { timeout: 120000 }, () => {
    const sim = appSim(5, true);
    let dep: Aircraft | undefined;
    expect(runUntil(sim, () => !!(dep = sim.aircraft.find((a) => a.category === 'departure' && !!a.radar)), 3600)).toBe(true);
    const sid = EDDS.sids.find((s) => s.name === dep!.flightPlan.sid)!;
    expect(sid.route?.length).toBeGreaterThan(1);
    expect(dep!.radar!.route).toEqual(sid.route);
    // Every waypoint of every SID, STAR and transition is a known fix.
    const known = new Set(EDDS.airspace!.fixes.map((f) => f.name));
    for (const s of EDDS.sids) for (const f of s.route ?? []) expect(known.has(f), `${s.name} ${f}`).toBe(true);
    for (const t of EDDS.airspace!.transitions ?? []) for (const f of t.route) expect(known.has(f), `${t.name} ${f}`).toBe(true);
    for (const e of EDDS.airspace!.entries) for (const f of [e.fix, e.iaf, ...(e.via ?? [])]) expect(known.has(f)).toBe(true);
  });

  it('an approach clearance on the STAR flies the RNAV transition and joins the final', { timeout: 120000 }, () => {
    for (const origin of ['LTAI', 'EDDH', 'LEPA', 'LSZH']) {
      const sim = appSim(17);
      const ac = inbound(sim, origin);
      runUntil(sim, () => ac.request === 'checkIn', 60);
      const entry = ac.radar!.route[0];
      sim.transmit(`${ac.callsign} identified, descend altitude 5000 feet, cleared ILS approach runway 25`);
      runUntil(sim, () => /cleared ILS approach runway 25/.test(last(sim, ac.callsign)), 20);
      expect(ac.radar?.transition, origin).toBe(`${entry} 25`);
      expect(ac.radar?.route.at(-1)).toBe('UNSER');
      expect(runUntil(sim, () => ac.phase === 'approach', 2400), origin).toBe(true);
      sim.transmit(`${ac.callsign} contact Stuttgart Tower 118.805`);
      expect(runUntil(sim, () => ac.onGround, 900), origin).toBe(true);
    }
  });

  it('a transition from the hold over LBU', { timeout: 120000 }, () => {
    const sim = appSim(19);
    const ac = inbound(sim, 'EDDH');
    expect(runUntil(sim, () => !!ac.radar?.hold, 1800)).toBe(true);
    sim.transmit(`${ac.callsign} descend altitude 5000 feet, via LBU 25 transition, cleared ILS approach runway 25`);
    runUntil(sim, () => /via LBU 25 transition/.test(last(sim, ac.callsign)), 20);
    expect(ac.radar?.hold).toBeUndefined();
    expect(ac.radar?.transition).toBe('LBU 25');
    expect(ac.radar?.route.slice(0, 2)).toContain('DS531');
    expect(runUntil(sim, () => ac.phase === 'approach', 2400)).toBe(true);
  });
});

describe('EuroScope track hand-over, wind and speeds', () => {
  it('Center offers an arrival; it calls only after you assume it (or after the offer times out)', { timeout: 120000 }, () => {
    const sim = appSim(23);
    const ac = inbound(sim, 'EDDH', 'EWG7AB', false);
    expect(offered(ac)).toBe(true);
    expect(ac.frequency).toBe('CTR');
    for (let t = 0; t < 60; t++) sim.tick(1);
    expect(ac.request).toBeNull();
    expect(sim.transmit(`${ac.callsign} descend flight level 80`).hint).toMatch(/not on your frequency/);
    expect(assumeTrack(sim, ac)).toBeUndefined();
    expect(runUntil(sim, () => ac.request === 'checkIn', 30)).toBe(true);
    expect(ac.frequency).toBe('APP');
    // Not assumed: Center sends it over after the timeout, a missed hand-off.
    const b = inbound(sim, 'LTAI', 'THY1AB', false);
    expect(runUntil(sim, () => b.frequency === 'APP', 200)).toBe(true);
    expect(sim.stats.radarHandoffsMissed).toBe(1);
  });

  it('true airspeed grows with altitude and the wind aloft moves the aircraft', { timeout: 120000 }, () => {
    expect(tasFactor(10000)).toBeCloseTo(1.2);
    const sim = appSim(29);
    sim.observedWind = { direction: 270, speedKt: 20 };
    const w = windAloft(sim, 10000);
    expect(w.direction).toBe(300);
    expect(w.speedKt).toBeGreaterThan(40);
    const ac = inbound(sim, 'EDDH');
    runUntil(sim, () => ac.request === 'checkIn', 60);
    // Heading east at 250 kt IAS at FL100: about 300 kt true, and the tailwind component on top.
    sim.transmit(`${ac.callsign} fly heading 090, reduce speed 250 knots`);
    for (let t = 0; t < 240; t++) sim.tick(1);
    expect(Math.round(ac.altitudeFt)).toBe(10000);
    expect(ac.speed / 0.5144).toBeGreaterThan(320);
    // It drifts: the track is right of the heading with the wind from the north-west.
    expect(ac.radar!.track! - ac.heading).toBeGreaterThan(2);
    // The crew asks for lower when kept at FL100 near the airport.
    sim.transmit(`${ac.callsign} proceed direct STG`);
    expect(runUntil(sim, () => ac.request === 'lower', 900)).toBe(true);
    expect(last(sim, ac.callsign)).toMatch(/request descent$/);
  });
});

describe('round 2: spoken radar phrases, transfers, reaction, read-back errors, push-to-talk', () => {
  it('understands radar phrases as they are spoken', { timeout: 120000 }, () => {
    const c = ctx(['EWG7AB']);
    expect(parseTransmission('eurowings seven alpha bravo turn left heading two seven zero', c).commands).toEqual([{ type: 'heading', heading: 270, turn: 'left' }]);
    expect(parseTransmission('EWG7AB fly heading to seven zero', c).commands).toEqual([{ type: 'heading', heading: 270 }]);
    expect(parseTransmission('EWG7AB the send flight level eight zero', c).commands).toEqual([{ type: 'level', altitude: { fl: 80 }, verb: 'descend' }]);
    expect(parseTransmission('EWG7AB descend to altitude five thousand feet q n h one zero one three', c).commands).toEqual([
      { type: 'level', altitude: { feet: 5000 }, verb: 'descend' },
      { type: 'qnh', qnh: 1013 },
    ]);
    expect(parseTransmission('EWG7AB climb flight level one hundred', c).commands).toEqual([{ type: 'level', altitude: { fl: 100 }, verb: 'climb' }]);
    expect(parseTransmission('EWG7AB turn write heading zero niner zero clear i l s approach runway two five', c).commands).toEqual([
      { type: 'heading', heading: 90, turn: 'right' },
      { type: 'approachClearance', kind: 'ILS', runway: '25' },
    ]);
    expect(parseTransmission('EWG7AB reduce speed one eight zero nots', c).commands).toEqual([{ type: 'speed', kt: 180 }]);
  });

  it('the crew starts a turn only after its reaction time', { timeout: 120000 }, () => {
    const sim = appSim(31);
    const ac = inbound(sim);
    runUntil(sim, () => ac.request === 'checkIn', 60);
    const before = ac.heading;
    sim.transmit(`${ac.callsign} turn left heading 090`);
    sim.tick(2);
    expect(ac.heading).toBeCloseTo(before, 0);
    for (let t = 0; t < 12; t++) sim.tick(1);
    expect(Math.abs(ac.heading - before)).toBeGreaterThan(5);
  });

  it('a transfer is accepted after a few seconds; contact without it is not coordinated', { timeout: 120000 }, () => {
    const sim = appSim(5, true);
    let dep: Aircraft | undefined;
    expect(runUntil(sim, () => !!(dep = sim.aircraft.find((a) => a.category === 'departure' && a.frequency === 'APP' && a.request === 'checkIn')), 3600)).toBe(true);
    const d = dep!;
    expect(perform(sim, { k: 'transfer', callsign: d.callsign })).toBeUndefined();
    expect(d.radar!.transfer?.acceptedAt).toBeUndefined();
    for (let t = 0; t < 10; t++) sim.tick(1);
    expect(d.radar!.transfer?.acceptedAt).toBeDefined();
    sim.transmit(`${d.callsign} contact Langen Radar ${d.radar!.sector!.frequency}`);
    expect(runUntil(sim, () => d.frequency === 'CTR', 30)).toBe(true);
    expect(sim.stats.uncoordinatedTransfers).toBe(0);
  });

  it('read-back errors only in voice-only mode, caught by repeating the instruction', { timeout: 120000 }, () => {
    const count = (voiceOnly: boolean) => {
      const sim = appSim(37);
      sim.voiceOnly = voiceOnly;
      const ac = inbound(sim);
      runUntil(sim, () => ac.request === 'checkIn', 60);
      let wrong = 0;
      for (let i = 0; i < 200; i++) {
        sim.transmit(`${ac.callsign} fly heading 100`);
        if (ac.radar!.rbError) {
          wrong++;
          expect(ac.radar!.heading).not.toBe(100);
          sim.transmit(`${ac.callsign} fly heading 100`);
          expect(ac.radar!.rbError).toBeUndefined();
          expect(ac.radar!.heading).toBe(100);
        }
        for (let t = 0; t < 7; t++) sim.tick(1);
      }
      return { wrong, caught: sim.stats.readbackErrorsCaught };
    };
    expect(count(false).wrong).toBe(0);
    const v = count(true);
    expect(v.wrong).toBeGreaterThan(0);
    expect(v.caught).toBe(v.wrong);
  });

  it('nobody starts a transmission while push-to-talk is held', { timeout: 120000 }, () => {
    const sim = appSim(41);
    const ac = inbound(sim);
    perform(sim, { k: 'ptt', on: true });
    for (let t = 0; t < 25; t++) sim.tick(1);
    expect(sim.messages.filter((m) => m.kind === 'pilot').length).toBe(0);
    perform(sim, { k: 'ptt', on: false });
    expect(runUntil(sim, () => ac.request === 'checkIn', 20)).toBe(true);
  });
});
