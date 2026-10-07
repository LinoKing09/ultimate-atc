import { otherEnd } from './airport/airport';
import { findRoute, isRouteError, type RouteStart, type TaxiRoute } from './airport/routing';
import type { Compass, StationType } from './airport/types';
import type { Aircraft, PathStop, PilotRequest } from './aircraft';
import { distance, headingDiff, headingOf, normalize, scale, add, sub, type Vec2 } from './geo';
import { Path } from './path';
import type { Command, HoldShortTarget, ParsedTransmission, TaxiDestination } from './phraseology/commands';
import { STATION_WORD, capitalize, formatCommand, formatDestination, formatHoldShort } from './phraseology/format';
import type { Simulation, TransmitResult } from './simulation';

/**
 * AI pilots: execute controller instructions, read them back, and make their
 * own calls (requests, reports, reminders when nobody answers).
 */

type TaxiCommand = Extract<Command, { type: 'taxi' }>;

interface ExecResult {
  readback?: string;
  unable?: string;
  /** Executed once the read-back has actually been transmitted. */
  after?: () => void;
  /** True if the instruction answers the pilot's pending request. */
  answers?: boolean;
}

/** Medical emergencies parked within this time (s) after the call earn a bonus. */
const MEDICAL_BONUS_TIME = 360;

const COMPASS_BEARING: Record<Compass, number> = { north: 0, east: 90, south: 180, west: 270 };

function compassOf(heading: number): Compass {
  const all: Compass[] = ['north', 'east', 'south', 'west'];
  return all.reduce((best, c) =>
    Math.abs(headingDiff(heading, COMPASS_BEARING[c])) < Math.abs(headingDiff(heading, COMPASS_BEARING[best])) ? c : best,
  );
}

// ====================================================================== transmissions

/** Queues a spontaneous pilot call that represents a request. */
export function call(sim: Simulation, ac: Aircraft, request: PilotRequest, text: string): void {
  if (sim.frequency.hasQueued(ac.callsign)) return;
  ac.lastCallAt = sim.time;
  sim.frequency.pilotTransmit(sim.time, ac.callsign, text, {
    delay: sim.rng.range(0.3, 2.5),
    ttl: 45,
    onTransmit: () => {
      if (ac.request !== request) {
        ac.request = request;
        ac.requestSince = sim.time;
        ac.callCount = 0;
      }
      ac.callCount++;
      ac.lastCallAt = sim.time;
      ac.lastTransmission = text;
    },
  });
}

function readback(sim: Simulation, ac: Aircraft, text: string, after?: () => void): void {
  sim.frequency.pilotTransmit(sim.time, ac.callsign, text, {
    delay: sim.rng.range(0.8, 2.2),
    priority: 10,
    ttl: 60,
    onTransmit: () => {
      ac.lastTransmission = text;
      after?.();
    },
  });
}

export function executeTransmission(sim: Simulation, parsed: ParsedTransmission, raw: string): TransmitResult {
  const ac = sim.find(parsed.callsign);
  const condText = parsed.condition ? `${parsed.condition.text}, ` : '';
  const canonical =
    ac && parsed.commands.length && parsed.unparsed.length === 0
      ? `${sim.tel(ac)}, ${condText}${parsed.commands.map(formatCommand).join(', ')}`
      : raw;
  sim.frequency.controllerTransmit(sim.time, canonical, ac?.callsign);

  if (!parsed.callsign) return { ok: false, hint: 'No callsign recognised and no aircraft selected.' };
  if (!ac) return { ok: false, callsign: parsed.callsign, hint: `No aircraft with callsign ${parsed.callsign}.` };
  if (!sim.isOnMyFrequency(ac)) {
    return { ok: false, callsign: ac.callsign, hint: `${ac.callsign} is not on your frequency.` };
  }

  // Anything the pilot was about to say is dropped - they listen first.
  sim.frequency.cancel(ac.callsign);

  if (parsed.commands.length === 0) {
    sim.stats.sayAgains++;
    sim.updateScore();
    readback(sim, ac, `Say again, ${sim.tel(ac)}?`);
    return { ok: false, callsign: ac.callsign, hint: 'Instruction not understood.' };
  }

  // Conditional clearance: the pilot must identify the traffic first.
  let conditionTraffic: Aircraft | undefined;
  if (parsed.condition) {
    conditionTraffic = resolveConditionTraffic(sim, ac, parsed.condition);
    if (!conditionTraffic) {
      const what = parsed.condition.callsign ? sim.tel(sim.find(parsed.condition.callsign) ?? ac) : `the ${parsed.condition.type}`;
      readback(sim, ac, `Negative contact with ${what}, say again, ${sim.tel(ac)}`);
      return { ok: false, callsign: ac.callsign, hint: 'The pilot cannot identify the traffic of the conditional clearance.' };
    }
  }

  const results = parsed.commands.map((c) => execute(sim, ac, c));
  if (conditionTraffic && parsed.commands.some((c) => ['pushback', 'taxi', 'cross', 'continue'].includes(c.type))) {
    // Wait for the traffic to pass, then go (same mechanism as "give way").
    ac.giveWayTo = conditionTraffic.callsign;
    ac.giveWaySince = sim.time;
    ac.giveWayLastDist = distance(ac.pos, conditionTraffic.pos);
    ac.giveWayMinDist = undefined;
  }
  const parts: string[] = [];
  if (parsed.condition && conditionTraffic) {
    parts.push(parsed.condition.callsign ? parsed.condition.text.replace(parsed.condition.callsign, sim.tel(conditionTraffic)) : parsed.condition.text);
  }
  let ok = true;
  for (const r of results) {
    if (r.readback) parts.push(r.readback);
    if (r.unable) {
      parts.push(r.unable);
      ok = false;
    }
  }
  const afters = results.map((r) => r.after).filter((f): f is () => void => !!f);
  if (results.some((r) => r.answers)) {
    sim.recordAnswer(ac);
    ac.request = null;
    ac.sequence = undefined;
  }
  if (parts.length) {
    readback(sim, ac, `${capitalize(parts.join(', '))}, ${sim.tel(ac)}`, () => afters.forEach((f) => f()));
  } else {
    afters.forEach((f) => f());
  }
  return { ok, callsign: ac.callsign };
}

function execute(sim: Simulation, ac: Aircraft, c: Command): ExecResult {
  switch (c.type) {
    case 'pushback':
      return execPushback(sim, ac, c.facing, c.startup);
    case 'startup':
      if (ac.phase !== 'parked' && ac.phase !== 'pushback') return { unable: 'we are already running' };
      ac.startupApproved = true;
      return { readback: 'start-up approved' };
    case 'taxi':
      return execTaxi(sim, ac, c);
    case 'holdShort':
      return execHoldShort(sim, ac, c.target);
    case 'cross':
      return execCross(sim, ac, c.runway);
    case 'holdPosition':
      if (!ac.onGround) return { unable: 'say again' };
      ac.holdPosition = true;
      return { readback: 'holding position', answers: ac.request === 'blocked' };
    case 'continue':
      return execContinue(sim, ac);
    case 'giveWay':
    case 'follow': {
      const other = sim.find(c.callsign);
      if (!other || other === ac) return { unable: 'confirm traffic, we do not see it' };
      ac.giveWayTo = other.callsign;
      ac.giveWaySince = sim.time;
      ac.giveWayLastDist = distance(ac.pos, other.pos);
      ac.giveWayMinDist = undefined;
      return { readback: `${c.type === 'follow' ? 'follow' : 'give way to'} ${sim.tel(other)}`, answers: ac.request === 'blocked' };
    }
    case 'handoff':
      return execHandoff(sim, ac, c.station, c.frequency);
    case 'cancelPushback':
      return execCancelPushback(sim, ac);
    case 'stopPushback':
      if (ac.phase !== 'pushback') return { unable: 'we are not pushing back' };
      ac.holdPosition = true;
      return { readback: 'stopping pushback' };
    case 'sequence':
    case 'expect': {
      const waitS = c.type === 'sequence' ? 60 + 45 * c.number : c.minutes * 60 + 20;
      ac.standbyUntil = sim.time + waitS;
      if (c.type === 'sequence') ac.sequence = { number: c.number, for: c.for ?? 'pushback' };
      if (ac.request) {
        sim.recordAnswer(ac);
        ac.requestSince = sim.time;
      }
      return { readback: formatCommand(c) };
    }
    case 'standby':
      ac.standbyUntil = sim.time + 120;
      if (ac.request) {
        sim.recordAnswer(ac);
        ac.requestSince = sim.time;
      }
      return {};
    case 'expedite':
      ac.expedite = true;
      return { readback: 'expediting' };
    case 'sayAgain':
      if (ac.lastTransmission) readback(sim, ac, ac.lastTransmission);
      return {};
    case 'lineUp':
    case 'takeoff':
      return { unable: 'confirm, we are on Ground frequency, contact Tower?' };
  }
}

// ====================================================================== conditional clearances

/** Type designators a word in a conditional clearance may refer to. */
function typeMatches(word: string, icao: string): boolean {
  const w = word.toUpperCase();
  if (w === icao) return true;
  if (w === 'AIRBUS') return icao.startsWith('A');
  if (w === 'BOEING') return icao.startsWith('B');
  if (w === 'EMBRAER') return icao.startsWith('E');
  if (w === 'BOMBARDIER' || w.startsWith('CRJ')) return icao.startsWith('CRJ') || icao === 'CL35';
  if (w === 'DASH' || w === 'Q400') return icao === 'DH8D';
  if (w === 'ATR' || w.startsWith('AT')) return icao.startsWith('AT');
  if (w === 'JET' || w === 'BIZJET' || w === 'CITATION' || w === 'CHALLENGER') return icao === 'C56X' || icao === 'CL35';
  if (w === 'HEAVY') return icao.startsWith('A33') || icao.startsWith('B7') || icao.startsWith('B78');
  if (/^7\d7$/.test(w)) return icao.startsWith(`B${w[0]}${w[1]}`) || icao.startsWith(`B${w[0]}`);
  // "A320" also matches the neo, "B737" the 737 family
  return icao.slice(0, 3) === w.slice(0, 3);
}

/** Finds the traffic a conditional clearance refers to. */
function resolveConditionTraffic(sim: Simulation, ac: Aircraft, cond: NonNullable<ParsedTransmission['condition']>): Aircraft | undefined {
  if (cond.callsign) {
    const o = sim.find(cond.callsign);
    return o && o !== ac && o.onGround ? o : undefined;
  }
  if (!cond.type) return undefined;
  const candidates = sim.aircraft
    .filter((o) => o !== ac && o.onGround && !['parked', 'arrived'].includes(o.phase) && typeMatches(cond.type!, o.type.icao))
    .filter((o) => distance(o.pos, ac.pos) < 1500)
    .sort((a, b) => distance(a.pos, ac.pos) - distance(b.pos, ac.pos));
  return candidates[0];
}

function execCancelPushback(sim: Simulation, ac: Aircraft): ExecResult {
  if (ac.phase === 'pushback' && ac.s < 1) {
    // Tug not moving yet: back to the stand, the pilot will call again later.
    ac.phase = 'parked';
    ac.path = null;
    ac.reverse = false;
    ac.stops = [];
    ac.pendingTaxi = undefined;
    ac.request = null;
    ac.readyAt = sim.time + sim.rng.range(60, 150);
    return { readback: 'pushback cancelled' };
  }
  if (ac.phase === 'pushback') {
    ac.holdPosition = true;
    return { readback: 'stopping pushback' };
  }
  if (ac.phase === 'parked') return { readback: 'roger, pushback cancelled', answers: ac.request === 'pushback' };
  return { unable: 'we are not pushing back' };
}

// ====================================================================== pushback

interface PushPlan {
  path: Path;
  facing: Compass;
  end: Vec2;
  noseHeading: number;
}

function planPushback(sim: Simulation, ac: Aircraft, facing?: Compass): PushPlan | { error: string } {
  const stand = ac.stand ? sim.airport.stand(ac.stand) : undefined;
  if (!stand) return { error: 'we are not on a stand' };
  const lane = stand.lane;
  const options = lane.edges
    .filter((e) => e.kind === 'taxilane' || e.kind === 'taxiway')
    .map((e) => {
      const other = otherEnd(e, lane);
      const dir = normalize(sub(other.pos, lane.pos));
      const len = Math.min(45, e.length * 0.9);
      const end = add(lane.pos, scale(dir, len));
      return { end, nose: headingOf(scale(dir, -1)) };
    });
  if (!options.length) return { error: 'unable to push from this stand' };

  let choice = options[0];
  if (facing) {
    const target = COMPASS_BEARING[facing];
    choice = options.reduce((b, o) => (Math.abs(headingDiff(o.nose, target)) < Math.abs(headingDiff(b.nose, target)) ? o : b));
    if (Math.abs(headingDiff(choice.nose, target)) > 60) return { error: `unable to face ${facing} from this stand` };
  } else if (stand.defaultPushFacing) {
    return planPushback(sim, ac, stand.defaultPushFacing);
  } else {
    // Face the direction that gives the shortest taxi to the departure runway.
    const rwy = ac.runway ?? sim.runway;
    const entry = sim.airport.runwayOps(rwy)?.departureEntries[0];
    const hp = entry ? sim.airport.holdingPoint(entry.holdingPoint) : undefined;
    if (hp) {
      let bestLen = Infinity;
      for (const o of options) {
        const r = findRoute(sim.airport, { position: o.end, heading: o.nose }, hp, [], { flows: sim.airport.flowVectors(rwy) });
        const len = isRouteError(r) ? Infinity : r.length;
        if (len < bestLen) {
          bestLen = len;
          choice = o;
        }
      }
    }
  }
  const path = new Path([stand.pos, lane.pos, choice.end], [stand.node.id, lane.id, null], 18);
  return { path, facing: compassOf(choice.nose), end: choice.end, noseHeading: choice.nose };
}

function execPushback(sim: Simulation, ac: Aircraft, facing: Compass | undefined, startup: boolean): ExecResult {
  if (ac.category !== 'departure' || ac.phase !== 'parked') {
    return { unable: ac.phase === 'pushback' ? 'we are already pushing' : 'unable, we are not on a stand' };
  }
  const stand = sim.airport.stand(ac.stand ?? '');
  if (stand && !stand.pushback) return { unable: 'no pushback required, we can taxi out from this stand' };
  if (ac.request !== 'pushback' && ac.readyAt - sim.time > 90) {
    return { unable: 'negative, we are still boarding, we will call you when ready' };
  }
  const plan = planPushback(sim, ac, facing);
  if ('error' in plan) return { unable: plan.error };

  ac.phase = 'pushback';
  ac.path = plan.path;
  ac.s = 0;
  ac.reverse = true;
  ac.pushFacing = plan.facing;
  ac.stops = [{ s: plan.path.length, kind: 'destination', target: 'pushback' }];
  ac.stoppedAt = undefined;
  ac.startupApproved = ac.startupApproved || startup;
  ac.timerUntil = sim.time + sim.rng.range(6, 15); // tug connects
  const text = `${startup ? 'push and start approved' : 'pushback approved'}${facing ? `, facing ${facing}` : ''}`;
  return { readback: text, answers: true };
}

// ====================================================================== taxi

function resolveDestination(
  sim: Simulation,
  ac: Aircraft,
  dest: TaxiDestination | undefined,
  start: RouteStart,
  via: string[],
  holdShort: HoldShortTarget[] = [],
): { route: TaxiRoute; dest: TaxiDestination } | { error: string } {
  if (!dest && holdShort.length && via.length) {
    return resolveClearanceLimit(sim, start, via, holdShort[holdShort.length - 1]);
  }
  if (!dest) {
    if (ac.routeDestination && via.length) dest = ac.routeDestination;
    else return { error: 'say again clearance limit' };
  }
  const flows = sim.airport.flowVectors(sim.runway);
  const tryRoute = (node: Parameters<typeof findRoute>[2]) => findRoute(sim.airport, start, node, via, { flows });

  switch (dest.kind) {
    case 'holdingPoint': {
      const hp = sim.airport.holdingPoint(dest.name);
      if (!hp) return { error: `confirm holding point ${dest.name}, we can't find it` };
      if (dest.runway && hp.holdingPoint && sim.airport.runwayNameFor(dest.runway) !== hp.holdingPoint.runway) {
        return { error: `holding point ${dest.name} is not for runway ${dest.runway}` };
      }
      const r = tryRoute(hp);
      if (isRouteError(r)) return { error: routeErrorText(r.error, via) };
      return { route: r, dest };
    }
    case 'runway': {
      const ops = sim.airport.runwayOps(dest.runway);
      if (!ops) return { error: `confirm runway ${dest.runway}` };
      let best: TaxiRoute | undefined;
      let bestFull = false;
      let lastErr = '';
      for (const entry of ops.departureEntries) {
        const hp = sim.airport.holdingPoint(entry.holdingPoint);
        if (!hp) continue;
        const r = tryRoute(hp);
        if (isRouteError(r)) {
          lastErr = r.error;
          continue;
        }
        // Prefer full length; among equals the shortest route.
        if (!best || (entry.fullLength && !bestFull) || (entry.fullLength === bestFull && r.length < best.length)) {
          best = r;
          bestFull = entry.fullLength;
        }
      }
      if (!best) return { error: routeErrorText(lastErr || 'no route', via) };
      const hpNode = best.nodes[best.nodes.length - 1];
      return {
        route: best,
        dest: { kind: 'holdingPoint', name: hpNode.holdingPoint?.name ?? '?', runway: dest.runway },
      };
    }
    case 'holdShort':
      return resolveClearanceLimit(sim, start, via, { kind: 'taxiway', name: dest.name });
    case 'stand': {
      const stand = sim.airport.stand(dest.stand);
      if (!stand) return { error: `confirm stand ${dest.stand}, we can't find it` };
      if (stand.maxWingspanM < ac.type.wingspanM) return { error: `stand ${dest.stand} is too small for us` };
      const occ = sim.standOccupant(stand.id, ac);
      if (occ) return { error: `stand ${dest.stand} is occupied` };
      const r = tryRoute(stand.node);
      if (isRouteError(r)) return { error: routeErrorText(r.error, via) };
      return { route: r, dest };
    }
  }
}

/**
 * Incomplete taxi instruction: "taxi via N, hold short of F" (or "... hold
 * short of runway 25"). The clearance limit is where the last via taxiway
 * meets the hold-short target.
 */
function resolveClearanceLimit(
  sim: Simulation,
  start: RouteStart,
  via: string[],
  target: HoldShortTarget,
): { route: TaxiRoute; dest: TaxiDestination } | { error: string } {
  const last = via[via.length - 1].toUpperCase();
  let best: { route: TaxiRoute; dest: TaxiDestination } | undefined;
  if (target.kind === 'runway') {
    const rwy = sim.airport.runwayNameFor(target.runway);
    for (const hp of sim.airport.holdingPoints.values()) {
      if (hp.holdingPoint?.runway !== rwy) continue;
      if (!hp.edges.some((e) => e.name.toUpperCase() === last)) continue;
      const r = findRoute(sim.airport, start, hp, via);
      if (isRouteError(r) || r.edges.some((e) => e.kind === 'runwayStrip')) continue;
      if (!best || r.length < best.route.length) best = { route: r, dest: { kind: 'holdingPoint', name: hp.holdingPoint!.name, runway: target.runway } };
    }
  } else {
    const X = target.name.toUpperCase();
    for (const n of sim.airport.nodes.values()) {
      if (!n.edges.some((e) => e.name.toUpperCase() === X) || !n.edges.some((e) => e.name.toUpperCase() === last)) continue;
      const r = findRoute(sim.airport, start, n, via);
      if (isRouteError(r) || r.edges.length === 0) continue;
      if (r.edges[r.edges.length - 1].name.toUpperCase() === X) continue;
      if (!best || r.length < best.route.length) best = { route: r, dest: { kind: 'holdShort', name: X } };
    }
  }
  if (!best) return { error: `unable to reach ${target.kind === 'runway' ? `runway ${target.runway}` : `taxiway ${target.name}`} via ${via.join(', ')}, say again route` };
  return best;
}

function routeErrorText(err: string, via: string[]): string {
  if (err.startsWith('unknown taxiway')) return `confirm taxiway ${err.slice(16)}, we can't find it`;
  if (via.length) return `unable to follow route via ${via.join(', ')}, say again route`;
  return 'unable, say again route';
}

/** Start position/heading for route planning (after pushback if still pushing). */
function routeStart(sim: Simulation, ac: Aircraft): { position: Vec2; heading: number; node?: string } {
  if (ac.phase === 'pushback' && ac.path) {
    const end = ac.path.pointAt(ac.path.length);
    return { position: end, heading: (ac.path.headingAt(ac.path.length) + 180) % 360 };
  }
  if (ac.phase === 'parked') {
    const stand = sim.airport.stand(ac.stand ?? '');
    // Drive-through stands can only be left forwards; pushback stands are left backwards (planned separately).
    if (stand) return { position: stand.pos, heading: stand.pushback ? (stand.heading + 180) % 360 : stand.heading, node: stand.node.id };
  }
  return { position: ac.pos, heading: ac.heading };
}

function toRouteStart(sim: Simulation, s: { position: Vec2; heading: number; node?: string }): RouteStart {
  return s.node ? { node: sim.airport.node(s.node), heading: s.heading } : { position: s.position, heading: s.heading };
}

function execTaxi(sim: Simulation, ac: Aircraft, c: TaxiCommand): ExecResult {
  if (!ac.onGround || ['lineup', 'takeoff', 'climb', 'landing'].includes(ac.phase)) return { unable: 'say again' };
  if (ac.phase === 'parked') {
    const stand = sim.airport.stand(ac.stand ?? '');
    if (stand?.pushback) return { unable: 'negative, we need pushback first' };
    if (ac.request !== 'taxi' && ac.readyAt - sim.time > 90) return { unable: 'negative, we are not ready yet' };
  }
  if (ac.phase === 'arrived') return { unable: 'we are already parked' };

  const start = routeStart(sim, ac);
  const res = resolveDestination(sim, ac, c.destination, toRouteStart(sim, start), c.via, c.holdShort);
  if ('error' in res) return { unable: res.error };

  const resolved: TaxiCommand = { ...c, destination: res.dest };
  if (ac.phase === 'pushback' || ac.phase === 'startup') {
    ac.pendingTaxi = resolved;
  } else {
    applyRoute(sim, ac, res.route, res.dest, c.holdShort, c.cross);
    if (ac.phase === 'parked') ac.phase = 'taxi';
    if (ac.phase === 'holding') ac.phase = 'taxi';
  }

  // Read-back: destination, route, conditions.
  let rb = res.dest.kind === 'holdShort' ? 'taxi' : `taxi to ${formatDestination(res.dest)}`;
  const via = c.via.length ? c.via : [];
  if (via.length) rb += ` via ${via.join(', ')}`;
  for (const h of c.holdShort) rb += `, ${formatHoldShort(h)}`;
  for (const r of c.cross) rb += `, cross runway ${r}`;
  return { readback: rb, answers: true };
}

/** Installs a taxi route on an aircraft and computes where it has to stop. */
export function applyRoute(
  sim: Simulation,
  ac: Aircraft,
  route: TaxiRoute,
  dest: TaxiDestination,
  holdShort: HoldShortTarget[] = [],
  cross: string[] = [],
): void {
  const points: Vec2[] = [];
  const ids: (string | null)[] = [];
  if (route.startPosition) {
    points.push(route.startPosition);
    ids.push(null);
  }
  for (const n of route.nodes) {
    points.push(n.pos);
    ids.push(n.id);
  }
  const path = new Path(points, ids, 30);
  ac.path = path;
  ac.s = 0;
  ac.reverse = false;
  ac.route = route;
  ac.routeDestination = dest;
  ac.stoppedAt = undefined;
  ac.holdPosition = false;
  ac.blockDistance = undefined;
  ac.clearedToCross = new Set(cross.map((r) => sim.airport.runwayNameFor(r)).filter((r): r is string => !!r));
  for (const h of holdShort) {
    if (h.kind === 'runway') {
      const name = sim.airport.runwayNameFor(h.runway);
      if (name) ac.clearedToCross.delete(name);
    }
  }
  ac.stops = computeStops(sim, ac, holdShort);
  ac.taxiStartedAt = sim.time;
  if (dest.kind === 'holdShort') {
    // The clearance limit itself becomes the destination stop, ~40 m before the junction.
    const limit = ac.stops.find((st) => st.kind === 'holdShort' && st.target === dest.name) ?? holdShortStop(sim, ac, dest.name, 0);
    const end = ac.stops.find((st) => st.kind === 'destination');
    if (limit && end) {
      ac.stops = ac.stops.filter((st) => st !== limit && st !== end && st.s < limit.s);
      ac.stops.push({ s: limit.s, kind: 'destination', target: dest.name, nodeId: limit.nodeId });
    }
  }
}

function computeStops(sim: Simulation, ac: Aircraft, holdShort: HoldShortTarget[]): PathStop[] {
  const route = ac.route!;
  const path = ac.path!;
  const stops: PathStop[] = [];
  const sOf = (id: string) => path.marker(id)?.s ?? 0;

  for (let i = 0; i < route.edges.length; i++) {
    const e = route.edges[i];
    const from = route.nodes[i];
    if (e.kind === 'runwayStrip' && from.holdingPoint && !ac.clearedToCross.has(from.holdingPoint.runway)) {
      stops.push({ s: sOf(from.id), kind: 'runway', target: from.holdingPoint.runway, holdingPoint: from.holdingPoint.name, nodeId: from.id });
    }
  }
  for (const h of holdShort) {
    if (h.kind !== 'taxiway') continue;
    const st = holdShortStop(sim, ac, h.name, 0);
    if (st) stops.push(st);
  }
  const last = route.nodes[route.nodes.length - 1];
  stops.push({
    s: path.length,
    kind: 'destination',
    target: last.id,
    holdingPoint: last.holdingPoint?.name,
    nodeId: last.id,
  });
  return stops.sort((a, b) => a.s - b.s);
}

/** Stop position before the route joins or crosses taxiway `name`, searching from arc length `fromS`. */
function holdShortStop(_sim: Simulation, ac: Aircraft, name: string, fromS: number): PathStop | undefined {
  const route = ac.route;
  const path = ac.path;
  if (!route || !path) return undefined;
  const N = name.toUpperCase();
  for (let i = 1; i < route.nodes.length; i++) {
    const n = route.nodes[i];
    if (route.edges[i - 1].name.toUpperCase() === N) continue;
    if (!n.edges.some((e) => e.name.toUpperCase() === N)) continue;
    const sNode = path.marker(n.id)?.s ?? 0;
    const sPrev = path.marker(route.nodes[i - 1].id)?.s ?? 0;
    const s = Math.max(sPrev + 1, sNode - 40);
    if (s < fromS) continue;
    return { s, kind: 'holdShort', target: N, nodeId: n.id };
  }
  return undefined;
}

function execHoldShort(sim: Simulation, ac: Aircraft, target: HoldShortTarget): ExecResult {
  if (!ac.path || !ac.route) return { unable: 'we are not taxiing' };
  if (target.kind === 'runway') {
    const name = sim.airport.runwayNameFor(target.runway);
    if (!name) return { unable: `confirm runway ${target.runway}` };
    ac.clearedToCross.delete(name);
    const keep = ac.stops.filter((s) => s.kind === 'holdShort');
    ac.stops = [...computeStops(sim, ac, []).filter((s) => s.s >= ac.s - 0.5), ...keep].sort((a, b) => a.s - b.s);
    return { readback: formatHoldShort(target) };
  }
  const st = holdShortStop(sim, ac, target.name, ac.s + 5);
  if (!st) return { unable: `taxiway ${target.name} is not on our route` };
  ac.stops = [...ac.stops, st].sort((a, b) => a.s - b.s);
  return { readback: formatHoldShort(target) };
}

function execCross(sim: Simulation, ac: Aircraft, runway: string): ExecResult {
  const name = sim.airport.runwayNameFor(runway);
  if (!name) return { unable: `confirm runway ${runway}` };
  const onRoute = ac.stoppedAt?.kind === 'runway' || ac.stops.some((s) => s.kind === 'runway' && s.target === name);
  if (!onRoute) return { unable: `confirm cross runway ${runway}, it is not on our route` };
  ac.clearedToCross.add(name);
  ac.stops = ac.stops.filter((s) => !(s.kind === 'runway' && s.target === name));
  if (ac.stoppedAt?.kind === 'runway' && ac.stoppedAt.target === name) ac.stoppedAt = undefined;
  return { readback: `cross runway ${runway}`, answers: ac.request === 'crossing' };
}

function execContinue(sim: Simulation, ac: Aircraft): ExecResult {
  void sim;
  const wasHolding = ac.holdPosition || !!ac.giveWayTo;
  ac.holdPosition = false;
  ac.giveWayTo = undefined;
  if (ac.stoppedAt?.kind === 'holdShort') {
    ac.stoppedAt = undefined;
    return { readback: 'continue taxi', answers: true };
  }
  if (ac.stoppedAt?.kind === 'runway') {
    return { unable: `confirm cleared to cross runway ${sim.airport.runwayNameFor(ac.stoppedAt.target) ?? ''}`.trim() };
  }
  if (!wasHolding) {
    // Remove the next hold-short stop if one is ahead ("continue" cancels a hold short instruction).
    const idx = ac.stops.findIndex((s) => s.kind === 'holdShort');
    if (idx >= 0) {
      ac.stops.splice(idx, 1);
      return { readback: 'continue taxi', answers: true };
    }
    if (!ac.path || ac.stoppedAt?.kind === 'destination') return { unable: 'confirm where to taxi' };
  }
  return { readback: 'continue taxi', answers: ac.request === 'blocked' || ac.request === 'route' };
}

// ====================================================================== handoff

function execHandoff(sim: Simulation, ac: Aircraft, stationType: StationType | undefined, frequency?: string): ExecResult {
  let type = stationType;
  if (!type) {
    if (frequency) type = sim.config.airport.stations.find((s) => s.frequency === frequency)?.type;
    if (!type) type = ac.category === 'departure' ? 'TWR' : undefined;
  }
  if (!type) return { unable: 'say again frequency' };
  if (type === sim.config.position) return { unable: 'we are already on your frequency' };
  const station = sim.airport.station(type);
  if (!station) return { unable: 'say again station' };
  if (frequency && frequency !== station.frequency) return { unable: `confirm frequency ${frequency} for ${STATION_WORD[type]}` };

  if (ac.category === 'departure' && !['taxi', 'holding'].includes(ac.phase)) {
    return { unable: `confirm contact ${STATION_WORD[type]}, we are not yet taxiing` };
  }
  if (ac.category === 'arrival' && type === 'TWR') return { unable: 'confirm contact Tower, we have already landed' };

  return {
    readback: `${STATION_WORD[type]} ${station.frequency}, goodbye`,
    answers: true,
    after: () => {
      ac.frequency = type!;
      ac.request = null;
      sim.frequency.cancel(ac.callsign);
      if (ac.category === 'departure' && type === 'TWR') {
        sim.stats.departuresHandedOff++;
        sim.updateScore();
      }
    },
  };
}

// ====================================================================== events from movement

export function onStopReached(sim: Simulation, ac: Aircraft, stop: PathStop): void {
  if (ac.phase === 'pushback') {
    ac.phase = 'startup';
    ac.reverse = false;
    ac.speed = 0;
    ac.stand = undefined;
    ac.timerUntil = sim.time + (ac.startupApproved ? sim.rng.range(15, 35) : sim.rng.range(40, 80));
    return;
  }
  if (ac.phase === 'landing' || ac.phase === 'vacating') {
    sim.tower.onVacated(ac);
    return;
  }
  if (ac.phase === 'lineup') {
    sim.tower.onLinedUp(ac);
    return;
  }
  if (ac.phase !== 'taxi') return;

  if (stop.kind === 'runway') {
    if (sim.isOnMyFrequency(ac)) {
      call(sim, ac, 'crossing', `${sim.tel(ac)}, holding short runway ${runwayEndsText(sim, stop.target)} at ${stop.holdingPoint ?? ''}`.trim());
    }
    return;
  }
  if (stop.kind === 'destination') {
    const dest = ac.routeDestination;
    if (dest?.kind === 'stand') {
      ac.phase = 'arrived';
      ac.stand = dest.stand;
      ac.assignedStand = undefined;
      ac.timerUntil = sim.time + sim.rng.range(150, 300);
      if (ac.category === 'arrival') sim.stats.arrivalsParked++;
      if (ac.emergency === 'medical') {
        const t = sim.time - (ac.emergencySince ?? sim.time);
        sim.stats.emergenciesHandled++;
        const quick = t <= MEDICAL_BONUS_TIME;
        if (quick) sim.stats.bonus += 15;
        const mmss = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
        sim.system(`${ac.callsign} is on stand ${dest.stand}, the ambulance has taken over the patient (${mmss} after the emergency call${quick ? ', +15 points' : ''}).`, 'system', ac.callsign);
        ac.emergency = undefined;
      }
      sim.updateScore();
      return;
    }
    if (stop.holdingPoint) {
      ac.phase = 'holding';
      ac.holdingSince = sim.time;
    }
  }
}

function runwayEndsText(sim: Simulation, runway: string): string {
  // Use the active runway designator if it belongs to this runway, else the full name.
  const active = sim.airport.runwayEnd(sim.runway);
  return active && active.runway === runway ? active.name : runway;
}

// ====================================================================== periodic pilot logic

export function updatePilot(sim: Simulation, ac: Aircraft): void {
  const now = sim.time;

  if (ac.phase === 'arrived' && now >= ac.timerUntil) {
    ac.phase = 'gone';
    return;
  }

  // Engines started after pushback
  if (ac.phase === 'startup' && now >= ac.timerUntil) {
    if (ac.pendingTaxi) {
      const c = ac.pendingTaxi;
      ac.pendingTaxi = undefined;
      ac.phase = 'taxi';
      const start = { position: ac.pos, heading: ac.heading };
      const res = resolveDestination(sim, ac, c.destination, start, c.via, c.holdShort);
      if ('error' in res) {
        call(sim, ac, 'route', `${sim.tel(ac)}, ready for taxi, ${res.error}`);
        ac.stoppedAt = { s: ac.s, kind: 'destination', target: 'none' };
      } else {
        applyRoute(sim, ac, res.route, res.dest, c.holdShort, c.cross);
      }
    } else if (ac.request !== 'taxi' && ac.request !== 'route' && sim.isOnMyFrequency(ac)) {
      call(sim, ac, 'taxi', `${sim.tel(ac)}, ready for taxi`);
    }
  }

  // Give way / conditional clearance bookkeeping: wait until the traffic has passed.
  if (ac.giveWayTo) {
    const o = sim.find(ac.giveWayTo);
    const since = now - (ac.giveWaySince ?? now);
    if (!o || !o.onGround) {
      ac.giveWayTo = undefined;
    } else {
      const d = distance(ac.pos, o.pos);
      ac.giveWayMinDist = Math.min(ac.giveWayMinDist ?? d, d);
      ac.giveWayLastDist = d;
      const clearance = (ac.type.wingspanM + o.type.wingspanM) / 2 + 40;
      // Passed = it came closest and is now clearly moving away again (or it stopped far away).
      const passed = d - ac.giveWayMinDist > 40 && d > clearance;
      const parkedAway = o.speed < 0.2 && d > 300 && since > 20;
      if (passed || parkedAway || since > 240) {
        ac.giveWayTo = undefined;
        ac.giveWayMinDist = undefined;
      }
    }
  }

  if (!sim.isOnMyFrequency(ac)) return;

  // Special event: medical emergency while taxiing out.
  if (ac.plannedMedical && ac.phase === 'taxi' && ac.category === 'departure' && ac.taxiStartedAt !== undefined && now - ac.taxiStartedAt > 40) {
    ac.plannedMedical = false;
    ac.emergency = 'medical';
    ac.emergencySince = now;
    ac.returnToStand = true;
    ac.assignedStand = sim.traffic.allocateStand(ac)?.id;
    ac.request = null;
    sim.frequency.cancel(ac.callsign);
    call(sim, ac, 'taxiIn', `${sim.station.name}, ${sim.tel(ac)}, PAN PAN, PAN PAN, PAN PAN, medical emergency on board, request immediate return to the stand, ambulance required`);
    return;
  }

  const tel = sim.tel(ac);
  const stationName = sim.station.name;

  // Spontaneous first calls (not while told to wait: standby / number / expect)
  if (ac.request === null) {
    if (now <= ac.standbyUntil) return;
    if (ac.phase === 'parked' && ac.category === 'departure' && now >= ac.readyAt) {
      const stand = sim.airport.stand(ac.stand ?? '');
      if (stand && !stand.pushback) {
        call(sim, ac, 'taxi', `${stationName}, ${tel}, stand ${ac.stand}, information ${sim.atisLetter}, request taxi`);
      } else {
        call(sim, ac, 'pushback', `${stationName}, ${tel}, stand ${ac.stand}, information ${sim.atisLetter}, request ${sim.rng.chance(0.2) ? 'push and start' : 'pushback'}`);
      }
      return;
    }
    if (ac.phase === 'holding' && ac.category === 'departure' && now - (ac.holdingSince ?? now) > 8) {
      call(sim, ac, 'handoff', `${tel}, holding point ${ac.stoppedAt?.holdingPoint ?? ''}, ready for departure`);
      return;
    }
    if (ac.blockedBy && ac.blockedSince !== undefined && now - ac.blockedSince > 60 && ac.speed < 0.1) {
      const o = sim.find(ac.blockedBy);
      const headOn = o && Math.abs(headingDiff(ac.heading, o.heading)) > 120;
      const mutual = o && o.blockedBy === ac.callsign;
      if (headOn || mutual) {
        call(sim, ac, 'blocked', `${tel}, we have opposite traffic ahead, ${o!.callsign}, request instructions`);
        return;
      }
    }
    if (ac.stoppedAt?.kind === 'holdShort' && ac.phase === 'taxi' && now - ac.lastCallAt > 120 && ac.speed === 0) {
      call(sim, ac, 'route', `${tel}, holding short of ${ac.stoppedAt.target}, request to continue`);
      return;
    }
    return;
  }

  // Reminders when nobody answers
  const interval = 60 + (ac.callsign.charCodeAt(ac.callsign.length - 1) % 30);
  if (now > ac.standbyUntil && now - ac.lastCallAt > interval && ac.callCount < 5 && !sim.frequency.hasQueued(ac.callsign)) {
    const reminder: Partial<Record<PilotRequest, string>> = {
      pushback: `${stationName}, ${tel}, stand ${ac.stand ?? ''}, request pushback`,
      taxi: `${stationName}, ${tel}, ready for taxi`,
      taxiIn: `${stationName}, ${tel}, request taxi to the stand`,
      handoff: `${stationName}, ${tel}, holding point ${ac.stoppedAt?.holdingPoint ?? ''}, ready for departure`,
      crossing: `${stationName}, ${tel}, holding short runway, request crossing`,
      blocked: `${stationName}, ${tel}, still blocked by traffic, request instructions`,
      route: `${stationName}, ${tel}, request further taxi instructions`,
    };
    const text = reminder[ac.request];
    if (text) call(sim, ac, ac.request, text);
  }
}

/**
 * Computes the route a taxi instruction would produce, without executing it.
 * Used by the UI to preview routes while the controller is typing.
 */
export function previewTaxi(sim: Simulation, ac: Aircraft, c: TaxiCommand): { route: TaxiRoute; dest: TaxiDestination } | { error: string } {
  const start = routeStart(sim, ac);
  return resolveDestination(sim, ac, c.destination, toRouteStart(sim, start), c.via, c.holdShort);
}

/** Builds a taxi route automatically (shortest path) - used by AI traffic and UI suggestions. */
export function autoRoute(sim: Simulation, ac: Aircraft, dest: TaxiDestination): TaxiRoute | undefined {
  const res = resolveDestination(sim, ac, dest, toRouteStart(sim, routeStart(sim, ac)), []);
  return 'error' in res ? undefined : res.route;
}
