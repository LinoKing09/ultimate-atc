import { describe, expect, it } from 'vitest';
import { AIRPORTS } from '../src/data/airports';
import { PLANNED_AIRPORTS, REGIONS, regionOf, trafficLevel } from '../src/data/regions';

describe('airport menu regions', () => {
  it('lists the continents, and Germany split into its three FIRs', () => {
    expect(REGIONS.map((c) => c.name)).toEqual(['Europe', 'North America', 'South America', 'Asia', 'Australia / Oceania']);
    const germany = REGIONS[0].countries.find((c) => c.name === 'Germany')!;
    expect(germany.firs.map((f) => `${f.name} ${f.icao}`)).toEqual(['Bremen FIR EDWW', 'Langen FIR EDGG', 'München FIR EDMM']);
  });

  it('places every airport in a FIR of its own country', () => {
    for (const a of AIRPORTS) {
      const r = regionOf(a.fir);
      expect(r, a.icao).toBeDefined();
      expect(r!.country.name, a.icao).toBe(a.country);
    }
    expect(Object.fromEntries(AIRPORTS.map((a) => [a.icao, a.fir]))).toEqual({ EDDS: 'EDGG', EDDN: 'EDMM', EDJA: 'EDMM', EDXW: 'EDWW', EDDW: 'EDWW', EDDK: 'EDGG', EDDP: 'EDMM', KSAN: 'KZLA', VTSP: 'VTBB', NZWN: 'NZZC', SEQM: 'SEFG', TNCM: 'TJZS' });
    for (const p of PLANNED_AIRPORTS) {
      expect(regionOf(p.fir), p.icao).toBeDefined();
      expect(AIRPORTS.some((a) => a.icao === p.icao), `${p.icao} is available, remove it from PLANNED_AIRPORTS`).toBe(false);
    }
    expect(new Set(REGIONS.flatMap((c) => c.countries.flatMap((x) => x.firs.map((f) => f.icao)))).size).toBe(REGIONS.flatMap((c) => c.countries.flatMap((x) => x.firs)).length);
  });

  it('rates the traffic from Stuttgart (busiest) to Sylt', () => {
    const level = (icao: string) => trafficLevel(AIRPORTS.find((a) => a.icao === icao)!);
    expect(level('EDDS')).toEqual({ perHour: 26, level: 4 });
    expect(['EDDN', 'EDJA', 'EDXW'].map((i) => level(i).level)).toEqual([3, 2, 1]);
  });
});
