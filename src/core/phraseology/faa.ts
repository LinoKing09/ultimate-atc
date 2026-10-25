import { altimeterOf } from '../met';

/**
 * Pilot transmissions in FAA (US) style, made from the ICAO wording the crews use elsewhere:
 *
 * - runways without a leading zero ("runway 9");
 * - "holding point B9 runway 09" -> "runway 9 at B9", other holding points by their taxiway name ("short of B9");
 * - "holding point B1, ready for departure" -> "holding short at B1, ready";
 * - "vacated runway 27 via B5" / "runway 27 vacated via B5" -> "clear of runway 27 at B5";
 * - clearances: "flight planned route" -> "then as filed", "climb via SID to altitude 5000 feet" -> "climb via SID
 *   except maintain 5000";
 * - "request pushback" / "request push and start" -> "ready to push"; "Radar" (Approach) -> "Departure";
 * - "take-off" -> "takeoff", "QNH 1018" -> "altimeter 3006", "CTOT" -> "EDCT" (expect departure clearance time).
 */
export function faaStyle(text: string): string {
  return text
    .replace(/\b(runways?) 0(\d)/gi, '$1 $2')
    .replace(/\b(\d{1,2}[LRC]?) and 0(\d)/g, '$1 and $2')
    .replace(/\bholding point (\w+),? runway (\w+)/gi, 'runway $2 at $1')
    .replace(/\b(approaching|taxiing to) holding point (\w+), ready for departure/gi, '$1 $2, ready')
    .replace(/\bholding point (\w+), ready for departure/gi, 'holding short at $1, ready')
    .replace(/\bready for departure/gi, 'ready')
    .replace(/\bholding point (\w+)/gi, '$1')
    .replace(/\bvacated runway (\w+) via (\w+)/gi, 'clear of runway $1 at $2')
    .replace(/\brunway (\w+) vacated via (\w+)/gi, 'clear of runway $1 at $2')
    .replace(/\brunway (\w+) vacated\b/gi, 'clear of runway $1')
    .replace(/\bflight planned route\b/gi, 'then as filed')
    .replace(/\bclimb via SID to altitude (\d+) feet/gi, 'climb via SID except maintain $1')
    .replace(/\brequest (push and start|pushback)\b/gi, 'ready to push')
    .replace(/\bRadar\b/g, 'Departure')
    .replace(/\bCTOT\b/g, 'EDCT')
    .replace(/\btake-off\b/gi, 'takeoff')
    .replace(/\bQNH (\d{3,4})\b/g, (_, q: string) => `altimeter ${altimeterOf(Number(q))}`);
}
