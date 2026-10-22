/**
 * Names of destination airports as pilots and controllers say them in a
 * clearance ("cleared to Frankfurt"). Unknown codes are spoken as the ICAO code.
 */
export const DESTINATION_NAMES: Record<string, string> = {
  BKPR: 'Pristina',
  EBBR: 'Brussels',
  EDDB: 'Berlin',
  EDDF: 'Frankfurt',
  EDDH: 'Hamburg',
  EDDK: 'Cologne',
  EDDL: 'Duesseldorf',
  EDDM: 'Munich',
  EDDN: 'Nuremberg',
  EDDP: 'Leipzig',
  EDDS: 'Stuttgart',
  EDDW: 'Bremen',
  EDJA: 'Memmingen',
  EDXW: 'Sylt',
  EGCC: 'Manchester',
  EGKK: 'Gatwick',
  EGLF: 'Farnborough',
  EGLL: 'Heathrow',
  EGNX: 'East Midlands',
  EGSS: 'Stansted',
  EHAM: 'Amsterdam',
  EIDW: 'Dublin',
  EKCH: 'Copenhagen',
  EPKT: 'Katowice',
  EPWA: 'Warsaw',
  ESSA: 'Stockholm',
  GCFV: 'Fuerteventura',
  GCLP: 'Gran Canaria',
  GCRR: 'Lanzarote',
  GCTS: 'Tenerife South',
  GMMX: 'Marrakesh',
  HEGN: 'Hurghada',
  KCVG: 'Cincinnati',
  KJFK: 'New York',
  KMEM: 'Memphis',
  KPHL: 'Philadelphia',
  KSDF: 'Louisville',
  LBSF: 'Sofia',
  LCLK: 'Larnaca',
  LDSP: 'Split',
  LDZA: 'Zagreb',
  LDZD: 'Zadar',
  LEAL: 'Alicante',
  LEBL: 'Barcelona',
  LEMD: 'Madrid',
  LEMG: 'Malaga',
  LEPA: 'Palma',
  LEVC: 'Valencia',
  LFMN: 'Nice',
  LFPG: 'Paris Charles de Gaulle',
  LGAV: 'Athens',
  LGIR: 'Heraklion',
  LGKO: 'Kos',
  LGKR: 'Corfu',
  LGRP: 'Rhodes',
  LGTS: 'Thessaloniki',
  LHBP: 'Budapest',
  LIMC: 'Milan Malpensa',
  LIME: 'Bergamo',
  LIML: 'Milan Linate',
  LIPE: 'Bologna',
  LIRA: 'Rome Ciampino',
  LIRF: 'Rome',
  LMML: 'Malta',
  LOWW: 'Vienna',
  LPPR: 'Porto',
  LPPT: 'Lisbon',
  LQMO: 'Mostar',
  LQTZ: 'Tuzla',
  LRCL: 'Cluj',
  LRIA: 'Iasi',
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
  LWSK: 'Skopje',
  LYBE: 'Belgrade',
  LYPG: 'Podgorica',
  OBBI: 'Bahrain',
  OMDB: 'Dubai',
  UGKO: 'Kutaisi',
  VHHH: 'Hong Kong',
  VOBL: 'Bengaluru',
  ZGGG: 'Guangzhou',
  ZSPD: 'Shanghai',
};

/**
 * Airport reference points of the destinations (latitude, longitude; OurAirports, public domain), used to
 * plan each departure via the SID towards its destination.
 */
export const DESTINATION_POSITIONS: Record<string, [number, number]> = {
  BKPR: [42.573, 21.036],
  EBBR: [50.901, 4.484],
  EDDB: [52.362, 13.502],
  EDDF: [50.027, 8.558],
  EDDH: [53.630, 9.988],
  EDDK: [50.866, 7.143],
  EDDL: [51.290, 6.767],
  EDDM: [48.354, 11.786],
  EDDN: [49.499, 11.078],
  EDDP: [51.424, 12.236],
  EDDS: [48.690, 9.222],
  EDDW: [53.047, 8.789],
  EDJA: [47.988, 10.238],
  EDXW: [54.913, 8.340],
  EGCC: [53.349, -2.280],
  EGKK: [51.149, -0.186],
  EGLF: [51.276, -0.776],
  EGLL: [51.471, -0.460],
  EGNX: [52.831, -1.328],
  EGSS: [51.885, 0.235],
  EHAM: [52.309, 4.764],
  EIDW: [53.429, -6.262],
  EKCH: [55.618, 12.656],
  EPKT: [50.476, 19.081],
  EPWA: [52.166, 20.967],
  ESSA: [59.648, 17.929],
  GCFV: [28.453, -13.864],
  GCLP: [27.932, -15.387],
  GCRR: [28.945, -13.605],
  GCTS: [28.044, -16.573],
  GMMX: [31.605, -8.036],
  HEGN: [27.177, 33.797],
  KCVG: [39.049, -84.668],
  KJFK: [40.641, -73.778],
  KMEM: [35.042, -89.977],
  KPHL: [39.872, -75.241],
  KSDF: [38.174, -85.736],
  LBSF: [42.696, 23.418],
  LCLK: [34.875, 33.625],
  LDSP: [43.539, 16.298],
  LDZA: [45.743, 16.069],
  LDZD: [44.097, 15.354],
  LEAL: [38.282, -0.558],
  LEBL: [41.297, 2.078],
  LEMD: [40.472, -3.561],
  LEMG: [36.678, -4.500],
  LEPA: [39.552, 2.739],
  LEVC: [39.489, -0.481],
  LFMN: [43.658, 7.216],
  LFPG: [49.009, 2.554],
  LGAV: [37.936, 23.945],
  LGIR: [35.340, 25.180],
  LGKO: [36.795, 27.091],
  LGKR: [39.601, 19.912],
  LGRP: [36.405, 28.086],
  LGTS: [40.519, 22.970],
  LHBP: [47.430, 19.262],
  LIMC: [45.631, 8.728],
  LIME: [45.669, 9.709],
  LIML: [45.445, 9.277],
  LIPE: [44.535, 11.289],
  LIRA: [41.799, 12.595],
  LIRF: [41.805, 12.252],
  LMML: [35.846, 14.492],
  LOWW: [48.110, 16.570],
  LPPR: [41.248, -8.681],
  LPPT: [38.781, -9.136],
  LQMO: [43.282, 17.846],
  LQTZ: [44.460, 18.724],
  LRCL: [46.786, 23.686],
  LRIA: [47.180, 27.621],
  LROP: [44.572, 26.103],
  LSGG: [46.238, 6.109],
  LSZH: [47.458, 8.548],
  LTAI: [36.899, 30.801],
  LTAU: [38.770, 35.495],
  LTBJ: [38.292, 27.157],
  LTBS: [36.713, 28.793],
  LTFE: [37.249, 27.664],
  LTFJ: [40.899, 29.309],
  LTFM: [41.275, 28.732],
  LWSK: [41.958, 21.623],
  LYBE: [44.818, 20.309],
  LYPG: [42.359, 19.252],
  OBBI: [26.271, 50.634],
  OMDB: [25.253, 55.364],
  UGKO: [42.177, 42.485],
  VHHH: [22.308, 113.918],
  VOBL: [13.198, 77.706],
  ZGGG: [23.392, 113.299],
  ZSPD: [31.143, 121.805],
};

/**
 * Initial great-circle bearing (degrees true) from a position to a destination airport, or undefined if
 * its position is not known.
 */
export function destinationBearing(from: { lat: number; lon: number }, icao: string): number | undefined {
  const p = DESTINATION_POSITIONS[icao.toUpperCase()];
  if (!p) return undefined;
  const rad = Math.PI / 180;
  const [la1, la2, dLon] = [from.lat * rad, p[0] * rad, (p[1] - from.lon) * rad];
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / rad) % 360 + 360) % 360;
}

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
