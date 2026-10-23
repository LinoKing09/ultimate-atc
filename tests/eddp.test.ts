import { describe, expect, it } from 'vitest';
import { Airport } from '../src/core/airport/airport';
import { headOnPartner, resolveOptions } from '../src/core/conflicts';
import { M_PER_NM, distance } from '../src/core/geo';
import { parseScenarioCode, formatScenarioCode } from '../src/core/scenario';
import { Simulation } from '../src/core/simulation';
import { EDDP } from '../src/data/airports/eddp';

/** Answers every call: Ground (scripted), and with `tower` Tower too; otherwise the AI Tower flies and clears. */
function runHour(runway: string, tower: boolean, onTick?: (sim: Simulation) => void): Simulation {
  const sim = new Simulation({ airport: EDDP, position: 'GND', positions: tower ? ['GND', 'TWR'] : ['GND'], runway, density: 'medium', seed: 1, events: false });
  /** Last crossing clearance per runway: no take-off on it for 90 s after. */
  const crossed = new Map<string, number>();
  for (let t = 0; t < 3600; t++) {
    sim.tick(1);
    onTick?.(sim);
    for (const ac of sim.aircraft) {
      const cs = ac.callsign;
      // Tower clears a waiting departure as soon as the runway allows (it may have stopped calling).
      if (tower && ac.request === 'departure' && sim.time - ac.lastCallAt >= 3 && t % 5 === 0 && t - (crossed.get(sim.airport.runwayNameFor(ac.runway!) ?? '') ?? -999) > 90 && !sim.tower.runwayBusyForDeparture(ac) && sim.tower.spacingRemaining(ac) <= 0 && sim.tower.nextArrivalEta(sim.tower.departureEnd(ac)) > 90) {
        sim.transmit(`${cs} runway ${ac.runway} cleared for take-off`);
        continue;
      }
      if (!ac.request || sim.time - ac.lastCallAt < 3 || sim.time - ac.lastCallAt > 4) continue;
      if (ac.request === 'clearance') sim.transmit(`${cs} cleared to ${ac.flightPlan.destination} ${ac.flightPlan.sid} departure squawk ${ac.flightPlan.squawk}`);
      if (ac.request === 'pushback' && !sim.aircraft.some((o) => o !== ac && o.phase === 'taxi' && distance(o.pos, ac.pos) < 250)) sim.transmit(`${cs} push and start approved`);
      if (ac.request === 'taxi') sim.transmit(`${cs} taxi to runway ${sim.departureRunwayOf(ac)}`);
      if (ac.request === 'crossing' && ac.stoppedAt?.kind === 'runway' && sim.tower.crossingFree(ac.stoppedAt.target)) {
        const target = ac.stoppedAt.target;
        sim.transmit(`${cs} cross runway ${sim.activeEndOn(target) ?? target.split('/')[0]}`);
        crossed.set(target, t);
      }
      if (ac.request === 'taxiIn' || (ac.request === 'route' && ac.category === 'arrival')) sim.transmit(`${cs} taxi to stand ${ac.assignedStand ?? sim.freeStands(ac.type.wingspanM)[0]?.id}`);
      if (ac.request === 'handoff') sim.transmit(`${cs} contact tower`);
      // Head-on: re-route one of the two, as the aircraft menu's "Resolve conflict" offers.
      const other = ac.request === 'blocked' ? headOnPartner(sim, ac) : undefined;
      const opt = other && resolveOptions(sim, ac, other).find((o) => !o.crossesRunway && !o.tug);
      if (opt) sim.transmit(`${opt.aircraft.callsign} ${opt.instruction}`);
      if (!tower) continue;
      if (ac.request === 'landing') sim.transmit(`${cs} runway ${ac.runway} cleared to land`);
      if (ac.request === 'vacated') sim.transmit(`${cs} contact ground`);
      if (ac.request === 'radar') sim.transmit(`${cs} contact radar`);
    }
  }
  return sim;
}

/** Take-offs and landings per runway end during the hour. */
function movements(runway: string, tower: boolean): { sim: Simulation; dep: Map<string, number>; arr: Map<string, number>; minDiagonalNm: number } {
  const dep = new Map<string, number>();
  const arr = new Map<string, number>();
  const seen = new Set<string>();
  let minDiagonalNm = Infinity;
  const sim = runHour(runway, tower, (s) => {
    const finals = s.aircraft.filter((a) => a.phase === 'approach' && s.distanceToThresholdNm(a) < 10);
    for (const a of finals) {
      for (const b of finals) if (a !== b && a.runway !== b.runway) minDiagonalNm = Math.min(minDiagonalNm, distance(a.pos, b.pos) / M_PER_NM);
    }
    for (const a of s.aircraft) {
      const key = `${a.phase === 'takeoff' ? 'T' : 'L'}${a.callsign}`;
      if ((a.phase !== 'takeoff' && a.phase !== 'landing') || seen.has(key)) continue;
      seen.add(key);
      const m = a.phase === 'takeoff' ? dep : arr;
      m.set(a.runway!, (m.get(a.runway!) ?? 0) + 1);
    }
  });
  return { sim, dep, arr, minDiagonalNm };
}

describe('Leipzig/Halle (EDDP) after the AIP charts', () => {
  it('has the runways, taxiways, holding points and stands of the charts', () => {
    const ap = new Airport(EDDP);
    expect(EDDP.runways.map((r) => r.name)).toEqual(['08L/26R', '08R/26L']);
    const graph = new Set(EDDP.taxiEdges.filter((e) => e.kind !== 'runway' && e.kind !== 'stand').map((e) => e.name));
    for (const t of ['A1', 'A5', 'A9', 'B', 'C', 'E7', 'E8', 'F', 'H1', 'H5', 'H7', 'H8', 'L', 'N', 'S1', 'S4', 'S10', 'T', 'V', 'W1', 'Y', 'Z1.1', 'Z4.3']) expect(graph.has(t), t).toBe(true);
    const hps = EDDP.taxiNodes.filter((n) => n.holdingPoint).map((n) => `${n.holdingPoint!.name} ${n.holdingPoint!.runway}`);
    expect(hps.filter((h) => h.endsWith('08L/26R')).map((h) => h.split(' ')[0]).sort()).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']);
    expect(hps.filter((h) => h.endsWith('08R/26L')).length).toBe(14);
    const aprons = new Map<string, number>();
    for (const s of ap.stands.values()) aprons.set(s.apron, (aprons.get(s.apron) ?? 0) + 1);
    expect(Object.fromEntries(aprons)).toEqual({ 'Apron 1': 34, 'Apron 2': 18, 'Apron 3': 8, 'Apron 4': 62, 'Apron 5': 6 });
  });

  it('publishes the declared distances of the AIP for every entry', () => {
    const tora = (rwy: string) => Object.fromEntries(EDDP.runwayOps.find((o) => o.runway === rwy)!.departureEntries.map((e) => [e.holdingPoint, e.toraM]));
    expect(tora('08L')).toEqual({ A1: 3600, A2: 3600, A3: 2450, A4: 1850, A5: 1745 });
    expect(tora('26R')).toEqual({ A9: 3600, A8: 3600, A7: 2450, A6: 1850, A5: 1745 });
    expect(tora('26L')).toEqual({ S10: 3600, S9: 3270, H8: 2885, S8: 2850, H7: 2760, S7: 2725, S6: 2250, H5: 1895, S5: 1895 });
    expect(tora('08R')).toEqual({ S1: 3600, H1: 3600, S2: 3270, S3: 2450, S4: 1850, H5: 1595, S5: 1595 });
  });

  it('uses both runways: each apron its own, the large freighters the southern one; the ATIS names both', () => {
    const sim = new Simulation({ airport: EDDP, position: 'GND', density: 'medium', seed: 3, events: false, runway: '26R+26L', generateTraffic: false });
    expect(sim.runways).toEqual(['26R', '26L']);
    const a320 = { wingspanM: 35.8 } as Parameters<Simulation['runwayFor']>[1];
    const b748 = { wingspanM: 68.4 } as Parameters<Simulation['runwayFor']>[1];
    expect(sim.runwayFor('130', a320)).toBe('26R');
    expect(sim.runwayFor('305', a320)).toBe('26R');
    expect(sim.runwayFor('441', a320)).toBe('26L');
    expect(sim.runwayFor('305', b748)).toBe('26L');
    expect(sim.atisText()).toMatch(/ILS approach runways 26R and 26L, dependent parallel approaches in progress, runways 26R and 26L in use/);
    // The ATIS can put a single runway in use.
    sim.updateAtis({ runway: '26L' });
    expect(sim.runways).toEqual(['26L']);
    expect(sim.runwayFor('130', a320)).toBe('26L');
    expect(sim.atisText()).toMatch(/runway in use 26L/);
  });

  it('keeps parallel runways in scenario codes ("26R.26L")', () => {
    const sc = parseScenarioCode('EDDP-26R.26L-MB0-X-1');
    expect('error' in sc).toBe(false);
    if (!('error' in sc)) {
      expect(sc.runway).toBe('26R+26L');
      expect(formatScenarioCode(sc)).toBe('EDDP-26R.26L-MB0-X-1');
    }
  });

  it('runs an hour on both runways of each direction (AI Tower): take-offs and landings on both, no collisions', () => {
    for (const [runway, ends] of [
      ['26R+26L', ['26R', '26L']],
      ['08L+08R', ['08L', '08R']],
    ] as const) {
      const { sim, dep, arr, minDiagonalNm } = movements(runway, false);
      expect(sim.stats.collisions, runway).toBe(0);
      expect(sim.stats.incursions, runway).toBe(0);
      for (const e of ends) expect(dep.get(e) ?? 0, `${runway} departures ${e}`).toBeGreaterThan(2);
      for (const e of ends) expect(arr.get(e) ?? 0, `${runway} arrivals ${e}`).toBeGreaterThan(0);
      expect(sim.stats.arrivalsParked, runway).toBeGreaterThan(3);
      // Dependent parallel approaches: 1.5 NM diagonal between the finals (a little less after compression).
      expect(minDiagonalNm, runway).toBeGreaterThan(1.3);
    }
  }, 120000);

  it('works both runways from the Tower position (scripted clearances)', () => {
    const { sim, dep, arr } = movements('26R+26L', true);
    expect(sim.stats.collisions).toBe(0);
    expect(sim.stats.incursions).toBe(0);
    expect(dep.get('26R') ?? 0).toBeGreaterThan(1);
    expect(dep.get('26L') ?? 0).toBeGreaterThan(2);
    expect((arr.get('26R') ?? 0) + (arr.get('26L') ?? 0)).toBeGreaterThan(4);
  }, 120000);
});
