/**
 * Local time of an airport (IANA time zone, e.g. "Europe/Berlin"). Uses the
 * Intl API only, no DOM. The simulation itself runs in UTC (`sim.utc()`);
 * local time matters for airport rules such as night flying restrictions.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Calendar fields of an instant in a time zone. */
export function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** Offset of the time zone from UTC at this instant, in minutes (Europe/Berlin: +60 in winter, +120 in summer). */
export function utcOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/**
 * The instant at which the local clock in `timeZone` shows `hhmm` ("2215") on the local
 * calendar day of `day` (default: now).
 */
export function zonedTime(hhmm: string, timeZone: string, day: Date = new Date()): Date {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4));
  const p = zonedParts(day, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, h, m);
  // Two passes: the offset at the guessed instant may differ from the one at `day` (daylight saving change).
  let t = wall - utcOffsetMinutes(new Date(wall), timeZone) * 60000;
  t = wall - utcOffsetMinutes(new Date(t), timeZone) * 60000;
  return new Date(t);
}

/** "2215" -> minutes after midnight (1335); undefined if invalid. */
export function hhmmToMinutes(hhmm: string): number | undefined {
  const m = /^([01]\d|2[0-3])([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

/** Minutes after midnight -> "2215" (1440 gives "2400"). */
export function minutesToHhmm(min: number): string {
  if (min === 1440) return '2400';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
}

/** True if the minute of the day `m` lies in [from, until), wrapping around midnight when from > until. */
export function inDailyWindow(m: number, from: number, until: number): boolean {
  return from <= until ? m >= from && m < until : m >= from || m < until;
}
