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
  const canonical =
    ac && parsed.commands.length && parsed.unparsed.length === 0
      ? `${sim.tel(ac)}, ${parsed.commands.map(formatCommand).join(', ')}`
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

  const results = parsed.commands.map((c) => execute(sim, ac, c));
  const parts: string[] = [];
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
      ac.giveWayOpening = 0;
      return { readback: `${c.type === 'follow' ? 'follow' : 'give way to'} ${sim.tel(other)}`, answers: ac.request === 'blocked' };
    }
    case 'handoff':
      return execHandoff(sim, ac, c.station, c.frequency);
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
    const rwy = ac.runway ?? sim.config.runway;
    const entry = sim.airport.runwayOps(rwy)?.departureEntries[0];
    const hp = entry ? sim.airport.holdingPoint(entry.holdingPoint) : undefined;
    if (hp) {
      let bestLen = Infinity;
      for (const o of options) {
        const r = findRoute(sim.airport, { position: o.end, heading: o.nose }, hp);
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
): { route: TaxiRoute; dest: TaxiDestination } | { error: string } {
  if (!dest) {
    if (ac.routeDestination && via.length) dest = ac.routeDestination;
    else return { error: 'say again destination' };
  }
  const tryRoute = (node: Parameters<typeof findRoute>[2]) => findRoute(sim.airport, start, node, via);

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
    if (stand) return { position: stand.pos, heading: stand.heading, node: stand.node.id };
  }
  return { position: ac.pos, heading: ac.heading };
}

function toRouteStart(sim: Simulation, s: { position: Vec2; heading: number; node?: string }): RouteStart {
  return s.node ? { node: sim.airport.node(s.node) } : { position: s.position, heading: s.heading };
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
  const res = resolveDestination(sim, ac, c.destination, toRouteStart(sim, start), c.via);
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
  let rb = `taxi to ${formatDestination(res.dest)}`;
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
      if (ac.category === 'arrival') {
        sim.stats.arrivalsParked++;
        sim.updateScore();
      }
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
  const active = sim.airport.runwayEnd(sim.config.runway);
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
      const res = resolveDestination(sim, ac, c.destination, start, c.via);
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

  // Give way bookkeeping
  if (ac.giveWayTo) {
    const o = sim.find(ac.giveWayTo);
    const since = now - (ac.giveWaySince ?? now);
    if (!o || !o.onGround) {
      ac.giveWayTo = undefined;
    } else {
      const d = distance(ac.pos, o.pos);
      if (ac.giveWayLastDist !== undefined && d > ac.giveWayLastDist + 0.02) ac.giveWayOpening = (ac.giveWayOpening ?? 0) + 0.2;
      else if (ac.giveWayLastDist !== undefined && d < ac.giveWayLastDist - 0.02) ac.giveWayOpening = 0;
      ac.giveWayLastDist = d;
      const clearance = (ac.type.wingspanM + o.type.wingspanM) / 2 + 40;
      if (d > 250 || ((ac.giveWayOpening ?? 0) > 4 && d > clearance) || since > 240) ac.giveWayTo = undefined;
    }
  }

  if (!sim.isOnMyFrequency(ac)) return;

  const tel = sim.tel(ac);
  const stationName = sim.station.name;

  // Spontaneous first calls
  if (ac.request === null) {
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
  return resolveDestination(sim, ac, c.destination, toRouteStart(sim, start), c.via);
}

/** Builds a taxi route automatically (shortest path) - used by AI traffic and UI suggestions. */
export function autoRoute(sim: Simulation, ac: Aircraft, dest: TaxiDestination): TaxiRoute | undefined {
  const res = resolveDestination(sim, ac, dest, toRouteStart(sim, routeStart(sim, ac)), []);
  return 'error' in res ? undefined : res.route;
}
