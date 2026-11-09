import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../src/core/aircraft';
import { M_PER_NM, distance } from '../src/core/geo';
import { parseTransmission } from '../src/core/phraseology/parser';
import { finalCoordinates, toMagnetic } from '../src/core/radar';
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
function inbound(sim: Simulation, origin = 'EDDH', callsign = 'EWG7AB'): Aircraft {
  const ac = sim.traffic.spawnInbound({ airline: sim.traffic['pickAirline'](), type: aircraftType('A320'), origin })!;
  ac.callsign = callsign;
  return ac;
}

const fixes = ['LBU', 'TEKSI', 'STG', 'BADSO', 'REUTL', 'ETASA'];
const ctx = (cs: string[]) => ({ callsigns: cs, taxiways: new Set(['A', 'B', 'C']), fixes });

describe('radar phraseology', () => {
  it('parses vectors, levels, direct, holdings and approach clearances', () => {
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
  it('arrivals are handed over by Center at their entry fix and call in', () => {
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

  it('vectors an arrival onto the ILS, hands it to Tower and it lands', () => {
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

  it('flies the STAR to the IAF and holds there without a clearance', () => {
    const sim = appSim(3);
    const ac = inbound(sim, 'LTAI');
    expect(ac.radar?.route).toEqual(['TEKSI', 'STG']);
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

  it('departures call in after take-off, climb towards their exit fix and go to Center', () => {
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

  it('runs an hour of traffic with every position but Approach run by the simulator', () => {
    const sim = appSim(21, true);
    // Bot: answer every call, then give each arrival the approach clearance straight away (it flies the transition).
    for (let t = 0; t < 3600; t++) {
      sim.tick(1);
      if (t % 5) continue;
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
  it('queries an approach to a runway not in use and an impossible climb', () => {
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
  it('a radar session replays exactly from its log', async () => {
    const sim = appSim(13, true);
    for (let t = 0; t < 1500; t++) {
      sim.tick(1);
      if (t % 7) continue;
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
  }, 60000);
});
