import type { AirportData } from '../core/airport/types';
import { DENSITIES } from '../core/levels';

/** A flight information region (in the United States: an ARTCC). */
export interface FirInfo {
  /** ICAO code, e.g. "EDGG". */
  icao: string;
  /** Display name, e.g. "Langen FIR". */
  name: string;
}

export interface CountryInfo {
  name: string;
  /** A country with several FIRs gets a FIR column of its own in the airport menu. */
  firs: FirInfo[];
}

export interface ContinentInfo {
  name: string;
  countries: CountryInfo[];
}

/**
 * Continents, countries and FIRs of the airport menu in the Connect dialog. Only countries with an
 * airport (available or planned) are listed; a continent without one says "Coming soon".
 */
export const REGIONS: ContinentInfo[] = [
  {
    name: 'Europe',
    countries: [
      {
        name: 'Germany',
        firs: [
          { icao: 'EDWW', name: 'Bremen FIR' },
          { icao: 'EDGG', name: 'Langen FIR' },
          { icao: 'EDMM', name: 'München FIR' },
        ],
      },
      { name: 'United Kingdom', firs: [{ icao: 'EGTT', name: 'London FIR' }] },
    ],
  },
  {
    name: 'North America',
    countries: [
      // The Dutch Caribbean (Sint Maarten) lies in the San Juan FIR of the United States.
      { name: 'Sint Maarten', firs: [{ icao: 'TJZS', name: 'San Juan FIR' }] },
      {
        name: 'United States',
        firs: [
          { icao: 'KZDV', name: 'Denver ARTCC' },
          { icao: 'KZLA', name: 'Los Angeles ARTCC' },
          { icao: 'KZMA', name: 'Miami ARTCC' },
          { icao: 'KZLC', name: 'Salt Lake City ARTCC' },
        ],
      },
    ],
  },
  {
    name: 'South America',
    countries: [
      { name: 'Argentina', firs: [{ icao: 'SAEF', name: 'Ezeiza FIR' }] },
      { name: 'Bolivia', firs: [{ icao: 'SLLF', name: 'La Paz FIR' }] },
      { name: 'Brazil', firs: [{ icao: 'SBCW', name: 'Curitiba FIR' }] },
      { name: 'Colombia', firs: [{ icao: 'SKED', name: 'Bogotá FIR' }] },
      { name: 'Ecuador', firs: [{ icao: 'SEFG', name: 'Guayaquil FIR' }] },
    ],
  },
  {
    name: 'Asia',
    countries: [
      { name: 'Japan', firs: [{ icao: 'RJJJ', name: 'Fukuoka FIR' }] },
      { name: 'Malaysia', firs: [{ icao: 'WMFC', name: 'Kuala Lumpur FIR' }] },
      { name: 'Sri Lanka', firs: [{ icao: 'VCCF', name: 'Colombo FIR' }] },
      { name: 'Taiwan', firs: [{ icao: 'RCAA', name: 'Taipei FIR' }] },
      { name: 'Thailand', firs: [{ icao: 'VTBB', name: 'Bangkok FIR' }] },
    ],
  },
  {
    name: 'Australia / Oceania',
    countries: [
      // Sydney, Melbourne and Perth lie in the Melbourne FIR, Brisbane in the Brisbane FIR.
      {
        name: 'Australia',
        firs: [
          { icao: 'YBBB', name: 'Brisbane FIR' },
          { icao: 'YMMM', name: 'Melbourne FIR' },
        ],
      },
      { name: 'New Zealand', firs: [{ icao: 'NZZC', name: 'New Zealand FIR' }] },
    ],
  },
];

/** Airports planned for a later version: listed in the airport menu, not selectable. */
export const PLANNED_AIRPORTS: { icao: string; name: string; fir: string }[] = [
  { icao: 'EDDF', name: 'Frankfurt', fir: 'EDGG' },
  { icao: 'EGLL', name: 'London Heathrow', fir: 'EGTT' },
  { icao: 'KLAX', name: 'Los Angeles', fir: 'KZLA' },
  { icao: 'KSAN', name: 'San Diego', fir: 'KZLA' },
  { icao: 'KASE', name: 'Aspen', fir: 'KZDV' },
  { icao: 'KJAC', name: 'Jackson Hole', fir: 'KZLC' },
  { icao: 'KEYW', name: 'Key West', fir: 'KZMA' },
  { icao: 'TNCM', name: 'St. Maarten', fir: 'TJZS' },
  { icao: 'SABE', name: 'Buenos Aires Aeroparque', fir: 'SAEF' },
  { icao: 'SLLP', name: 'La Paz', fir: 'SLLF' },
  { icao: 'SBPA', name: 'Porto Alegre', fir: 'SBCW' },
  { icao: 'SKRG', name: 'Medellín', fir: 'SKED' },
  { icao: 'SEQM', name: 'Quito', fir: 'SEFG' },
  { icao: 'RJGG', name: 'Nagoya Chubu', fir: 'RJJJ' },
  { icao: 'WMKP', name: 'Penang', fir: 'WMFC' },
  { icao: 'VCBI', name: 'Colombo', fir: 'VCCF' },
  { icao: 'RCSS', name: 'Taipei Songshan', fir: 'RCAA' },
  { icao: 'VTSP', name: 'Phuket', fir: 'VTBB' },
  { icao: 'YBBN', name: 'Brisbane', fir: 'YBBB' },
  { icao: 'YBCG', name: 'Gold Coast', fir: 'YBBB' },
  { icao: 'YMML', name: 'Melbourne', fir: 'YMMM' },
  { icao: 'YMHB', name: 'Hobart', fir: 'YMMM' },
  { icao: 'YPPH', name: 'Perth', fir: 'YMMM' },
  { icao: 'YSSY', name: 'Sydney', fir: 'YMMM' },
  { icao: 'NZAA', name: 'Auckland', fir: 'NZZC' },
  { icao: 'NZQN', name: 'Queenstown', fir: 'NZZC' },
  { icao: 'NZWN', name: 'Wellington', fir: 'NZZC' },
];

export interface RegionPath {
  continent: ContinentInfo;
  country: CountryInfo;
  fir: FirInfo;
}

/** Continent, country and FIR of a FIR code; undefined if the FIR is not in `REGIONS`. */
export function regionOf(fir: string | undefined): RegionPath | undefined {
  for (const continent of REGIONS) {
    for (const country of continent.countries) {
      const f = country.firs.find((x) => x.icao === fir);
      if (f) return { continent, country, fir: f };
    }
  }
  return undefined;
}

/**
 * How busy an airport is in the simulator: movements per hour at medium traffic (departures + arrivals,
 * scaled by the airport's `rateFactor`) and a level of 1-4 for the bars in the airport menu.
 */
export function trafficLevel(a: AirportData): { perHour: number; level: 1 | 2 | 3 | 4 } {
  const medium = DENSITIES.find((d) => d.value === 'medium')!;
  const perHour = Math.round((medium.departures + medium.arrivals) * (a.traffic?.rateFactor ?? 1));
  return { perHour, level: perHour >= 20 ? 4 : perHour >= 12 ? 3 : perHour >= 8 ? 2 : 1 };
}
