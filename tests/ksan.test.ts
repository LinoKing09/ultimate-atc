import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { altimeterOf, formatMetar, qnhFromAltimeter } from '../src/core/met';
import { faaStyle } from '../src/core/phraseology/faa';
import { parseTransmission } from '../src/core/phraseology/parser';
import { Simulation } from '../src/core/simulation';
import { KSAN } from '../src/data/airports/ksan';
import { createBot } from './bot';

describe('San Diego (KSAN) after the FAA airport diagram', () => {
  it('has runway 9/27, the taxiways, holding positions and ramps of the diagram', () => {
    const ap = new Airport(KSAN);
    expect(KSAN.runways.map((r) => r.name)).toEqual(['09/27']);
    for (const t of ['A', 'B', 'C', 'D', 'F', 'H', 'J', 'P', 'X', 'A3', 'A4', 'A5', 'A6', 'A7']) expect(ap.taxiwayNames.has(t), t).toBe(true);
    const hps = KSAN.taxiNodes.filter((n) => n.holdingPoint).map((n) => n.holdingPoint!.name).sort();
    expect(hps).toEqual(['B1', 'B10', 'B2', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    const aprons = new Map<string, number>();
    for (const s of ap.stands.values()) aprons.set(s.apron, (aprons.get(s.apron) ?? 0) + 1);
    expect(Object.fromEntries(aprons)).toEqual({ 'Terminal 1': 10, 'Terminal 2 East': 13, 'Terminal 2 West': 20, 'West remote': 7, 'North apron': 10 });
  });

  it('understands FAA instructions', () => {
    const ap = new Airport(KSAN);
    const parse = (t: string) => parseTransmission(t, { callsigns: ['SWA123'], taxiways: ap.taxiwayNames, sids: KSAN.sids.map((s) => s.name) });
    expect(parse('SWA123 runway 27, taxi via B').commands).toEqual([{ type: 'taxi', via: ['B'], holdShort: [], cross: [], destination: { kind: 'runway', runway: '27' } }]);
    expect(parse('SWA123 runway 9 at B8, taxi via B').commands[0]).toMatchObject({ destination: { kind: 'holdingPoint', name: 'B8', runway: '09' } });
    expect(parse('SWA123 push back approved, tail east').commands).toEqual([{ type: 'pushback', facing: 'west', startup: false }]);
    const clr = parse('SWA123 cleared to KSFO airport PADRZ2 departure then as filed climb via SID except maintain 5000 expect FL350 10 minutes after departure departure frequency 125.15 squawk 1234');
    expect(clr.unparsed).toEqual([]);
    expect(clr.commands).toEqual([{ type: 'clearance', destination: 'ksfo', sid: 'PADRZ2', climb: { feet: 5000 }, squawk: '1234' }]);
    expect(parse('SWA123 wind 250 at 8, runway 27, cleared for takeoff').commands).toEqual([{ type: 'takeoff', runway: '27' }]);
    expect(parse('SWA123 runway 27 at B1, line up and wait').commands).toEqual([{ type: 'lineUp', runway: '27' }]);
    expect(parse('SWA123 turn left at B5, contact ground point niner').commands).toEqual([{ type: 'vacate', exit: 'B5' }, { type: 'handoff', station: 'GND' }]);
    expect(parse('SWA123 altimeter 29.92').commands).toEqual([{ type: 'qnh', qnh: 1013, altimeter: '2992' }]);
    expect(parse('SWA123 cross runway 27 at C6').commands).toEqual([{ type: 'cross', runway: '27' }]);
  });

  it('pilots speak the FAA way', () => {
    expect(faaStyle('Taxi to holding point B9 runway 09, Southwest 1')).toBe('Taxi to runway 9 at B9, Southwest 1');
    expect(faaStyle('Lindbergh Tower, Southwest 1, holding point B1, ready for departure')).toBe('Lindbergh Tower, Southwest 1, holding short at B1, ready');
    expect(faaStyle('Southwest 1, runway 27 vacated via B5')).toBe('Southwest 1, clear of runway 27 at B5');
    expect(faaStyle('Cleared to Denver, ZZOOO4 departure, flight planned route, climb via SID to altitude 5000 feet, squawk 2101')).toBe(
      'Cleared to Denver, ZZOOO4 departure, then as filed, climb via SID except maintain 5000, squawk 2101',
    );
    expect(faaStyle('stand 36, information C, request pushback')).toBe('stand 36, information C, ready to push');
    expect(faaStyle('information K, QNH 1013')).toBe('information K, altimeter 2991');
    expect(faaStyle('Radar 125.150, goodbye')).toBe('Departure 125.150, goodbye');
  });

  it('has a US METAR and ATIS: statute miles, altimeter in inches, runways without a leading zero', () => {
    const sim = new Simulation({ airport: KSAN, position: 'GND', runway: '09', density: 'light', seed: 3, generateTraffic: false, events: false });
    expect(formatMetar(sim, sim.metar)).toMatch(/^METAR KSAN \d{6}Z \d{5}(G\d\d)?KT \d+SM .* A\d{4}$/);
    expect(sim.atisText()).toMatch(/^San Diego International information [A-Z], \d{4} Zulu\. Wind .* altimeter \d{4}\. .*runway 9 in use, departing runway 9.*Advise on initial contact you have information [A-Z]\.$/);
    expect(sim.atisDatis()[0]).toMatch(/^KSAN ATIS INFO [A-Z] \d{4}Z$/);
    expect(sim.pressurePhrase(1013)).toBe('altimeter 2991');
  });

  it('keeps an altimeter set in inches exactly', () => {
    for (let a = 2850; a <= 3100; a++) expect(altimeterOf(qnhFromAltimeter(a / 100))).toBe(String(a));
    const sim = new Simulation({ airport: KSAN, position: 'GND', runway: '27', density: 'light', seed: 3, generateTraffic: false, events: false });
    sim.updateAtis({ qnh: qnhFromAltimeter(Number(altimeterOf(sim.metar.qnh)) / 100) });
    expect(sim.atisDifferences.filter((d) => d.startsWith('altimeter'))).toEqual([]);
  });

  it('runs an hour of traffic on each runway (scripted Ground, AI Tower) without collisions', () => {
    for (const runway of ['27', '09']) {
      const sim = new Simulation({ airport: KSAN, position: 'GND', runway, density: 'medium', seed: 1, events: false });
      const bot = createBot(sim);
      for (let t = 0; t < 3600; t++) {
        sim.tick(1);
        bot();
      }
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.departuresAirborne, runway).toBeGreaterThan(8);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(3);
    }
  }, 120000);
});
