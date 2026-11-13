import { describe, expect, it } from 'vitest';
import { clearanceSquawk, initialClimb } from '../src/core/delivery';
import { perform } from '../src/core/session';
import { Simulation } from '../src/core/simulation';
import { EDDS } from '../src/data/airports/edds';

function delivery(): Simulation {
  return new Simulation({ airport: EDDS, position: 'DEL', positions: ['DEL'], runway: '25', density: 'medium', seed: 3, generateTraffic: false, events: false });
}

describe('flight plan window (FPL)', () => {
  it('amends filed items and assigns SID, initial climb and squawk - checked, without changing what the crew does', () => {
    const sim = delivery();
    const ac = sim.traffic.spawnDeparture(0, { type: 'A320', callsign: 'DLH4AB' })!;
    const before = { squawk: ac.flightPlan.squawk, sid: ac.flightPlan.sid };
    const sid = EDDS.sids.find((s) => s.runway === '25' && s.name !== ac.flightPlan.sid)!;
    expect(perform(sim, { k: 'flightPlan', callsign: ac.callsign, change: { cruiseFl: 360, route: ' kunod  y163 ' , alternate: 'eddm', remarks: 'tcas', assignedSid: sid.name, assignedClimbFt: 6000, assignedSquawk: '2345' } })).toBeUndefined();
    expect(ac.flightPlan).toMatchObject({ cruiseFl: 360, route: 'KUNOD Y163', alternate: 'EDDM', remarks: 'TCAS', assignedSid: sid.name, assignedClimbFt: 6000, assignedSquawk: '2345' });
    // Nothing said yet: the transponder and the filed SID stay.
    expect(ac.flightPlan.squawk).toBe(before.squawk);
    expect(ac.flightPlan.sid).toBe(before.sid);
    // The clearance uses the assigned values.
    expect(clearanceSquawk(sim, ac)).toBe('2345');
    expect(initialClimb(sim, ac)).toEqual({ fl: 60 }); // above the transition altitude (5000 ft): a flight level
    // Invalid values are refused, nothing changes.
    for (const change of [{ assignedSquawk: '7700' }, { assignedSquawk: '2348' }, { cruiseFl: 900 }, { assignedClimbFt: 5050 }, { assignedSid: 'XYZ1A' }, { route: '  ' }, { alternate: 'ED' }]) {
      expect(perform(sim, { k: 'flightPlan', callsign: ac.callsign, change }), JSON.stringify(change)).toEqual(expect.any(String));
    }
    expect(ac.flightPlan.assignedSquawk).toBe('2345');
    // A SID of a runway not in use for departures.
    const other = EDDS.sids.find((s) => s.runway === '07')!;
    expect(perform(sim, { k: 'flightPlan', callsign: ac.callsign, change: { assignedSid: other.name } })).toMatch(/not in use/);
  });

  it('the clearance with the assigned values sets them; the departure climbs to its cleared initial climb', () => {
    const sim = delivery();
    const ac = sim.traffic.spawnDeparture(0, { type: 'A320', callsign: 'DLH4AB' })!;
    perform(sim, { k: 'flightPlan', callsign: ac.callsign, change: { assignedClimbFt: 6000, assignedSquawk: '2345' } });
    const sid = ac.flightPlan.sid!;
    const r = sim.transmit(`DLH4AB cleared to destination, ${sid} departure, climb altitude 6000 feet, squawk 2345`.replace('destination', ac.flightPlan.destination));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    for (let t = 0; t < 20; t++) sim.tick(1);
    expect(ac.cleared).toBe(true);
    expect(ac.flightPlan.squawk === '2345' || ac.readbackError?.squawk === '2345').toBe(true);
    expect(ac.flightPlan.clearedClimbFt).toBe(6000);
    // The assignments are used up.
    expect(ac.flightPlan.assignedSquawk).toBeUndefined();
    expect(ac.flightPlan.assignedClimbFt).toBeUndefined();
  });
});
