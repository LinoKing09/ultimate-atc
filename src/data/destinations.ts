/**
 * Names of destination airports as pilots and controllers say them in a
 * clearance ("cleared to Frankfurt"). Unknown codes are spoken as the ICAO code.
 */
export const DESTINATION_NAMES: Record<string, string> = {
  BKPR: 'Pristina',
  EDDB: 'Berlin',
  EDDF: 'Frankfurt',
  EDDH: 'Hamburg',
  EDDL: 'Duesseldorf',
  EDDM: 'Munich',
  EDDS: 'Stuttgart',
  EDDW: 'Bremen',
  EGCC: 'Manchester',
  EGKK: 'Gatwick',
  EGLF: 'Farnborough',
  EGLL: 'Heathrow',
  EHAM: 'Amsterdam',
  EIDW: 'Dublin',
  EKCH: 'Copenhagen',
  EPKT: 'Katowice',
  ESSA: 'Stockholm',
  GCFV: 'Fuerteventura',
  GCLP: 'Gran Canaria',
  GCRR: 'Lanzarote',
  GCTS: 'Tenerife South',
  HEGN: 'Hurghada',
  LBSF: 'Sofia',
  LDSP: 'Split',
  LDZA: 'Zagreb',
  LEBL: 'Barcelona',
  LEMG: 'Malaga',
  LEPA: 'Palma',
  LFMN: 'Nice',
  LFPG: 'Paris Charles de Gaulle',
  LGAV: 'Athens',
  LGIR: 'Heraklion',
  LGKO: 'Kos',
  LGTS: 'Thessaloniki',
  LHBP: 'Budapest',
  LIML: 'Milan Linate',
  LIPE: 'Bologna',
  LIRF: 'Rome',
  LMML: 'Malta',
  LOWW: 'Vienna',
  LPPT: 'Lisbon',
  LQMO: 'Mostar',
  LROP: 'Bucharest',
  LSGG: 'Geneva',
  LSZH: 'Zurich',
  LTAI: 'Antalya',
  LTAU: 'Kayseri',
  LTBJ: 'Izmir',
  LTBS: 'Dalaman',
  LTFE: 'Bodrum',
  LTFJ: 'Sabiha Gokcen',
  LTFM: 'Istanbul',
  LYBE: 'Belgrade',
};

/** Spoken name of a destination ("Frankfurt"), or its ICAO code if unknown. */
export function destinationName(icao: string): string {
  return DESTINATION_NAMES[icao.toUpperCase()] ?? icao.toUpperCase();
}

/** Resolves a spoken or typed destination ("frankfurt", "EDDF", "paris charles de gaulle") to an ICAO code. */
export function resolveDestination(text: string): string | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return undefined;
  if (/^[a-z]{4}$/.test(t) && DESTINATION_NAMES[t.toUpperCase()]) return t.toUpperCase();
  for (const [icao, name] of Object.entries(DESTINATION_NAMES)) {
    const n = name.toLowerCase();
    if (t === n || t.replace(/ /g, '') === n.replace(/ /g, '') || n.startsWith(`${t} `)) return icao;
  }
  if (/^[a-z]{4}$/.test(t)) return t.toUpperCase();
  return undefined;
}
