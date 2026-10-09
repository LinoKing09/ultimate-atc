import { otherEnd } from './airport/airport';
import { findRoute, isRouteError, type RouteStart, type TaxiRoute } from './airport/routing';
import type { Compass, StationType } from './airport/types';
import type { Aircraft, PathStop, PilotRequest } from './aircraft';
import { distance, headingDiff, headingOf, normalize, scale, add, sub, type Vec2 } from './geo';
import { Path } from './path';
import type { Command, HoldShortTarget, ParsedTransmission, TaxiDestination } from './phraseology/commands';
import { STATION_WORD, capitalize, formatCommand, formatDestination, formatHoldShort } from './phraseology/format';
import { CLEARANCE_LEAD_S, execClearance, execCtot, execReadbackCorrect, execSquawk, hhmm, missReadbackError, startupDue } from './delivery';
import { destinationName } from '../data/destinations';
import type { Simulation, TransmitResult } from './simulation';
import { TOW_PARK_MAX_S, TOW_PARK_MIN_S, maybeStartTow } from './vehicles';

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

/** Longest time the frequency is kept free for a read-back after the instruction ended (seconds). */
const READBACK_WAIT_S = 6;

function readback(sim: Simulation, ac: Aircraft, text: string, after?: () => void): void {
  // Nobody else calls until this pilot has answered.
  sim.frequency.expectReply(ac.callsign, Math.max(sim.time, sim.frequency.freeAt) + READBACK_WAIT_S);
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
      if (!ac.cleared) return { unable: 'negative, we have no clearance yet' };
      ac.startupApproved = true;
      return { readback: 'start-up approved', answers: ac.request === 'startup' };
    case 'taxi':
      return ac.category === 'tow' ? execTow(sim, ac, c) : execTaxi(sim, ac, c);
    case 'followMe':
      return execFollowMe(sim, ac);
    case 'proceed':
      // Vehicle phraseology: a tug may be told to "proceed" instead of "tow approved".
      if (ac.category === 'tow' && !c.target && !c.base) return execTow(sim, ac, { type: 'taxi', destination: c.destination, via: c.via, holdShort: [], cross: [], tow: true });
      return { unable: 'confirm taxi instructions' };
    case 'returnToBase':
      return { unable: 'say again' };
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
    case 'askIntersection':
      return execAskIntersection(sim, ac, c.name);
    case 'clearance':
      return execClearance(sim, ac, c);
    case 'squawk': {
      const caught = !!ac.readbackError && ac.readbackError.squawk === c.code;
      const r = execSquawk(sim, ac, c.code);
      if (caught) {
        sim.stats.readbackErrorsCaught++;
        sim.updateScore();
      }
      return r;
    }
    case 'readbackCorrect':
      return execReadbackCorrect(sim, ac);
    case 'ctot':
      return execCtot(sim, ac, c.time);
    case 'lineUp':
    case 'takeoff':
      return { unable: 'confirm, we are on Ground frequency, contact Tower?' };
  }
}

// ====================================================================== intersection departures

/** Take-off run available from a holding point on the active runway, or undefined if it is not an entry. */
export function takeoffRunAvailable(sim: Simulation, holdingPoint: string): number | undefined {
  const end = sim.airport.runwayEnd(sim.runway);
  const hp = sim.airport.holdingPoint(holdingPoint);
  const strip = hp?.edges.find((e) => e.kind === 'runwayStrip');
  if (!end || !hp || !strip || hp.holdingPoint?.runway !== end.runway) return undefined;
  const rwyNode = strip.from === hp ? strip.to : strip.from;
  return end.length - sim.airport.runwayCoordinates(end, rwyNode.pos).along;
}

/** Take-off run this crew needs today (type figure varied per flight, -10 % / +15 %). */
function requiredRunway(sim: Simulation, ac: Aircraft): number {
  ac.requiredRunwayM ??= Math.round(ac.type.minRunwayM * sim.rng.range(0.9, 1.15));
  return ac.requiredRunwayM;
}

/** True if the full-length entry is the only one this aircraft accepts at this holding point. */
function isIntersection(sim: Simulation, holdingPoint: string): boolean {
  const entry = sim.airport.runwayOps(sim.runway)?.departureEntries.find((e) => e.holdingPoint.toUpperCase() === holdingPoint.toUpperCase());
  return !!entry && !entry.fullLength;
}

/**
 * "Advise able for departure from intersection D": the crew checks the
 * take-off run available from that intersection against what they need.
 */
function execAskIntersection(sim: Simulation, ac: Aircraft, name: string): ExecResult {
  if (ac.category !== 'departure' || !ac.onGround || ['lineup', 'takeoff', 'climb'].includes(ac.phase)) return { unable: 'say again' };
  const available = takeoffRunAvailable(sim, name);
  if (available === undefined) return { unable: `confirm intersection ${name}, it is not an entry to runway ${sim.runway}` };
  const able = available >= requiredRunway(sim, ac);
  ac.ableIntersection = { ...ac.ableIntersection, [name.toUpperCase()]: able };
  return { readback: able ? `affirm, able intersection ${name}` : 'negative, we require full length' };
}

// ====================================================================== AI controllers

/**
 * An instruction from an AI controller (a position the user doesn't staff).
 * It is executed like a radio instruction, but nothing is transmitted on
 * the user's frequency. Returns false if the pilot can't comply.
 */
export function aiInstruct(sim: Simulation, ac: Aircraft, c: Command): boolean {
  const r = execute(sim, ac, c);
  if (r.unable) return false;
  r.after?.();
  if (r.answers) ac.request = null;
  return true;
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
  if (ac.phase === 'pushback' && ac.path && !ac.towingIn) {
    // Already moving: the tug pulls the aircraft back onto the stand.
    const pts: Vec2[] = [ac.pos];
    for (let i = ac.path.points.length - 1; i >= 0; i--) if (ac.path.cum[i] < ac.s - 0.5) pts.push(ac.path.points[i]);
    const back = new Path(pts, [], 18);
    ac.path = back;
    ac.s = 0;
    ac.reverse = false;
    ac.towingIn = true;
    ac.holdPosition = false;
    ac.stoppedAt = undefined;
    ac.stops = [{ s: back.length, kind: 'destination', target: 'stand' }];
    ac.pendingTaxi = undefined;
    ac.timerUntil = sim.time + 4;
    return { readback: 'pushback cancelled, we are towed back onto the stand' };
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
  if (ac.category === 'tow') return { unable: 'we are a tow, request tow approval' };
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

// ====================================================================== tows and follow-me

/**
 * "Tow approved [to stand 45] via ...": the tug pushes the aircraft off a
 * stand that needs a pushback, then tows it along the route (at towing speed).
 * Without a destination the tow goes to the stand it asked for.
 */
function execTow(sim: Simulation, ac: Aircraft, c: TaxiCommand): ExecResult {
  const t = ac.tow;
  const hasLimit = c.holdShort.length > 0 && c.via.length > 0;
  const destination: TaxiDestination | undefined = c.destination ?? (hasLimit ? undefined : t ? { kind: 'stand', stand: t.to } : undefined);
  if (destination && destination.kind !== 'stand' && destination.kind !== 'holdShort') return { unable: 'negative, we are a tow, we can only tow to a stand' };
  const cmd: TaxiCommand = { ...c, destination, tow: true };
  if (destination?.kind === 'stand' && t) {
    t.to = destination.stand;
    ac.assignedStand = destination.stand;
  }
  const verb = (rb: string | undefined) => rb?.replace(/^taxi/, 'tow approved');
  if (ac.phase === 'parked') {
    const stand = sim.airport.stand(ac.stand ?? '');
    if (stand?.pushback) {
      // Push off the stand first; the tow route is resolved when the tug has repositioned.
      const plan = planPushback(sim, ac, undefined);
      if ('error' in plan) return { unable: plan.error };
      if (destination?.kind === 'stand') {
        const target = sim.airport.stand(destination.stand);
        if (!target) return { unable: `confirm stand ${destination.stand}, we can't find it` };
        if (target.maxWingspanM < ac.type.wingspanM) return { unable: `stand ${destination.stand} is too small for the ${ac.type.icao}` };
      }
      ac.phase = 'pushback';
      ac.path = plan.path;
      ac.s = 0;
      ac.reverse = true;
      ac.pushFacing = plan.facing;
      ac.stops = [{ s: plan.path.length, kind: 'destination', target: 'pushback' }];
      ac.stoppedAt = undefined;
      ac.timerUntil = sim.time + sim.rng.range(6, 15);
      ac.pendingTaxi = cmd;
      return { readback: formatCommand(cmd), answers: true };
    }
  }
  const res = execTaxi(sim, ac, { ...cmd });
  return { ...res, readback: verb(res.readback) };
}

/** "Follow the follow-me": a follow-me car comes and leads the aircraft (see vehicles.ts). */
function execFollowMe(sim: Simulation, ac: Aircraft): ExecResult {
  if (!ac.onGround || !['taxi', 'pushback', 'startup', 'holding'].includes(ac.phase)) return { unable: 'unable, say again' };
  ac.wantsFollowMe = false;
  if (!ac.followMe) ac.followMe = { leading: false };
  // Without a route of its own (e.g. just vacated), the follow-me leads to the allocated stand.
  // A taxi instruction in the same transmission replaces that route.
  const stand = ac.assignedStand;
  if (!ac.route && ac.phase === 'taxi' && stand) {
    const dest: TaxiDestination = { kind: 'stand', stand };
    const r = autoRoute(sim, ac, dest);
    if (r) {
      applyRoute(sim, ac, r, dest);
      return { readback: `follow the follow-me to stand ${stand}`, answers: true };
    }
  }
  return { readback: 'follow the follow-me', answers: !!ac.route && ac.request === 'taxiIn' };
}

// ====================================================================== taxi

function resolveDestination(
  sim: Simulation,
  ac: Aircraft,
  dest: TaxiDestination | undefined,
  start: RouteStart,
  via: string[],
  holdShort: HoldShortTarget[] = [],
  forceUTurn = false,
): { route: TaxiRoute; dest: TaxiDestination } | { error: string } {
  if (!forceUTurn && !routeOptions(sim, ac).allowUTurn) {
    const res = resolveDestination(sim, ac, dest, start, via, holdShort, true);
    if ('error' in res || !res.route.requiresUTurn) return res;
    // The only way would be a 180° turn on the taxiway, which an airliner can't do.
    const heading = start.heading ?? ac.heading;
    return { error: `unable, we are facing ${compassOf(heading)} and cannot turn around here, say again route` };
  }
  if (!dest && holdShort.length && via.length) {
    return resolveClearanceLimit(sim, ac, start, via, holdShort[holdShort.length - 1], forceUTurn);
  }
  if (!dest) {
    if (ac.routeDestination && via.length) dest = ac.routeDestination;
    else return { error: 'say again clearance limit' };
  }
  const opts = { ...routeOptions(sim, ac), allowUTurn: forceUTurn || routeOptions(sim, ac).allowUTurn };
  const tryRoute = (node: Parameters<typeof findRoute>[2]) => {
    // Automatic routes (no via list) follow the standard taxi flows strictly; only if that is impossible
    // (e.g. the aircraft already stands on a taxiway against the flow) they may use it against the flow.
    // Not turning around matters more than the flow.
    if (!via.length) {
      const strict = findRoute(sim.airport, start, node, via, { ...opts, strictFlows: true });
      if (!isRouteError(strict) && !strict.requiresUTurn) return strict;
      const soft = findRoute(sim.airport, start, node, via, opts);
      if (!isRouteError(soft) && !soft.requiresUTurn) return soft;
      return isRouteError(strict) ? soft : strict;
    }
    return findRoute(sim.airport, start, node, via, opts);
  };

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
      return resolveClearanceLimit(sim, ac, start, via, { kind: 'taxiway', name: dest.name }, forceUTurn);
    case 'stand': {
      const stand = sim.airport.stand(dest.stand);
      if (!stand) return { error: `confirm stand ${dest.stand}, we can't find it` };
      // The crew knows from its stand charts whether its aircraft fits the stand - but not
      // whether the stand is free: that it only sees when taxiing in (checkStandAhead).
      if (stand.maxWingspanM < ac.type.wingspanM) return { error: `stand ${dest.stand} is too small for us` };
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
  ac: Aircraft,
  start: RouteStart,
  via: string[],
  target: HoldShortTarget,
  forceUTurn = false,
): { route: TaxiRoute; dest: TaxiDestination } | { error: string } {
  const opts = { ...routeOptions(sim, ac), allowUTurn: forceUTurn || routeOptions(sim, ac).allowUTurn };
  const last = via[via.length - 1].toUpperCase();
  let best: { route: TaxiRoute; dest: TaxiDestination } | undefined;
  if (target.kind === 'runway') {
    const rwy = sim.airport.runwayNameFor(target.runway);
    for (const hp of sim.airport.holdingPoints.values()) {
      if (hp.holdingPoint?.runway !== rwy) continue;
      if (!hp.edges.some((e) => e.name.toUpperCase() === last)) continue;
      const r = findRoute(sim.airport, start, hp, via, opts);
      if (isRouteError(r) || r.edges.some((e) => e.kind === 'runwayStrip')) continue;
      if (!best || r.length < best.route.length) best = { route: r, dest: { kind: 'holdingPoint', name: hp.holdingPoint!.name, runway: target.runway } };
    }
  } else {
    const X = target.name.toUpperCase();
    for (const n of sim.airport.nodes.values()) {
      if (!n.edges.some((e) => e.name.toUpperCase() === X) || !n.edges.some((e) => e.name.toUpperCase() === last)) continue;
      const r = findRoute(sim.airport, start, n, via, opts);
      if (isRouteError(r) || r.edges.length === 0) continue;
      if (r.edges[r.edges.length - 1].name.toUpperCase() === X) continue;
      if (!best || r.length < best.route.length) best = { route: r, dest: { kind: 'holdShort', name: X } };
    }
  }
  if (!best) return { error: `unable to reach ${target.kind === 'runway' ? `runway ${target.runway}` : `taxiway ${target.name}`} via ${via.join(', ')}, say again route` };
  return best;
}

/** Largest wingspan (m) that can turn around on the spot on a taxiway. */
const UTURN_MAX_WINGSPAN = 25;

/**
 * Routing options for an aircraft: standard flows for the runway in use, and
 * whether it may turn around. Airliners can't make a 180° turn on a taxiway;
 * small business jets can, and so can an aircraft waiting at a holding point
 * (it turns on the wide runway entry).
 */
function routeOptions(sim: Simulation, ac: Aircraft): { flows: Map<string, Vec2>; allowUTurn: boolean; wingspanM: number } {
  const atHoldingPoint = ac.phase === 'holding' || !!ac.stoppedAt?.holdingPoint;
  return {
    wingspanM: ac.type.wingspanM,
    flows: sim.airport.flowVectors(sim.runway),
    // A towed aircraft turns wherever the tug can turn it.
    allowUTurn: ac.type.wingspanM <= UTURN_MAX_WINGSPAN || atHoldingPoint || isStuck(sim, ac) || ac.category === 'tow',
  };
}

/** Time a tug needs to arrive, connect and turn an airliner around (seconds). */
export const TUG_MIN_S = 300;
export const TUG_MAX_S = 600;

/** Stuck nose-to-nose (or reported blocked): the pilot accepts a turn-around with a tug. */
function isStuck(sim: Simulation, ac: Aircraft): boolean {
  if (ac.request === 'blocked') return true;
  return !!ac.blockedBy && ac.blockedSince !== undefined && sim.time - ac.blockedSince > 30 && ac.speed < 0.2;
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

  if (c.destination?.kind === 'holdingPoint' && ac.category === 'departure' && isIntersection(sim, c.destination.name)) {
    const available = takeoffRunAvailable(sim, c.destination.name);
    if (available !== undefined && available < requiredRunway(sim, ac)) {
      return { unable: `unable intersection ${c.destination.name.toUpperCase()}, we require full length` };
    }
  }
  const start = routeStart(sim, ac);
  const res = resolveDestination(sim, ac, c.destination, toRouteStart(sim, start), c.via, c.holdShort);
  if ('error' in res) return { unable: res.error };
  const atHoldingPoint = ac.phase === 'holding' || !!ac.stoppedAt?.holdingPoint;

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
  if (res.route.requiresUTurn && ac.type.wingspanM > UTURN_MAX_WINGSPAN && !atHoldingPoint && ac.category !== 'tow') {
    // An airliner can only turn around with a tug.
    // Ordering a tug, connecting it and turning the aircraft takes several minutes.
    const wait = sim.rng.range(TUG_MIN_S, TUG_MAX_S);
    ac.tugUntil = sim.time + wait;
    rb += `, we need a tug to turn around, expect about ${Math.round(wait / 60)} minutes`;
  }
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
  ac.standBlocked = undefined;
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
  if (ac.category === 'tow') return { unable: 'negative, we stay on your frequency until the tow is complete' };
  let type = stationType;
  if (!type) {
    if (frequency) type = sim.config.airport.stations.find((s) => s.frequency === frequency)?.type;
    // From Delivery the next station is Ground, from Ground it is Tower.
    if (!type && ac.category === 'departure') type = ac.frequency === sim.stationFor('delivery') && ac.frequency !== sim.stationFor('ground') ? sim.stationFor('ground') : sim.stationFor('tower');
  }
  if (!type) return { unable: 'say again frequency' };
  if (sim.userControls(type) && ac.frequency === type) return { unable: 'we are already on your frequency' };
  const station = sim.airport.station(type);
  if (!station) return { unable: 'say again station' };
  if (frequency && frequency !== station.frequency) return { unable: `confirm frequency ${frequency} for ${STATION_WORD[type]}` };

  const fromDelivery = ac.frequency === sim.stationFor('delivery') && type === sim.stationFor('ground') && type !== ac.frequency;
  if (fromDelivery && !ac.cleared) return { unable: 'negative, we have no clearance yet' };
  if (ac.category === 'departure' && !fromDelivery && type === sim.stationFor('tower') && !['taxi', 'holding'].includes(ac.phase)) {
    return { unable: `confirm contact ${STATION_WORD[type]}, we are not yet taxiing` };
  }
  if (ac.category === 'arrival' && type === sim.stationFor('tower')) return { unable: 'confirm contact Tower, we have already landed' };

  return {
    readback: `${STATION_WORD[type]} ${station.frequency}, goodbye`,
    answers: true,
    after: () => {
      ac.frequency = type!;
      ac.request = null;
      sim.frequency.cancel(ac.callsign);
      if (ac.category === 'departure' && type === sim.stationFor('tower')) {
        sim.stats.departuresHandedOff++;
        sim.updateScore();
      }
      if (fromDelivery) {
        // Leaving Delivery with a wrong readback still uncorrected: it stays wrong.
        missReadbackError(sim, ac);
        sim.stats.clearancesDelivered++;
        sim.updateScore();
        // Ground expects the call for pushback (or taxi) now.
        ac.readyAt = Math.min(ac.readyAt, sim.time + 20);
      }
    },
  };
}

// ====================================================================== events from movement

export function onStopReached(sim: Simulation, ac: Aircraft, stop: PathStop): void {
  if (ac.phase === 'pushback' && ac.towingIn) {
    const stand = sim.airport.stand(ac.stand ?? '');
    ac.phase = 'parked';
    ac.towingIn = false;
    ac.path = null;
    ac.stops = [];
    ac.stoppedAt = undefined;
    if (stand) {
      ac.pos = stand.pos;
      ac.heading = stand.heading;
    }
    ac.request = null;
    ac.readyAt = sim.time + sim.rng.range(60, 150);
    return;
  }
  if (ac.phase === 'pushback') {
    ac.phase = 'startup';
    ac.reverse = false;
    ac.speed = 0;
    ac.stand = undefined;
    // A tow: the tug repositions from pushing to towing; otherwise engine start.
    ac.timerUntil = sim.time + (ac.category === 'tow' ? sim.rng.range(10, 20) : ac.startupApproved ? sim.rng.range(15, 35) : sim.rng.range(40, 80));
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
      if (ac.category === 'tow') {
        // The aircraft stays on the remote stand for a while; the tug leaves.
        sim.stats.towsCompleted++;
        ac.timerUntil = sim.time + sim.rng.range(TOW_PARK_MIN_S, TOW_PARK_MAX_S);
      }
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
    // Turnaround over: the aircraft leaves the simulation - or is towed to a remote stand.
    if (ac.category === 'arrival') maybeStartTow(sim, ac);
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
        call(sim, ac, 'route', `${sim.tel(ac)}, ${ac.category === 'tow' ? 'ready to tow' : 'ready for taxi'}, ${res.error}`);
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

  towerResolveStuck(sim, ac);
  checkStandAhead(sim, ac);
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
  // The station the pilot is calling (with combined positions it may not be the primary one).
  const stationName = sim.airport.station(ac.frequency)?.name ?? sim.station.name;
  const onDelivery = ac.frequency === sim.stationFor('delivery') && ac.frequency !== sim.stationFor('ground');

  // Spontaneous first calls (not while told to wait: standby / number / expect)
  if (ac.request === null) {
    if (now <= ac.standbyUntil) return;
    if (onDelivery && ac.category === 'departure' && ac.phase === 'parked') {
      deliveryCall(sim, ac, stationName, tel);
      return;
    }
    // A tug driver asks for the tow (ICAO: REQUEST TOW (company) (type) FROM (location) TO (location)).
    if (ac.phase === 'parked' && ac.category === 'tow' && ac.tow && now >= ac.readyAt) {
      const t = ac.tow;
      call(sim, ac, 'tow', `${stationName}, ${tel}, request tow ${t.operator ? `${t.operator} ` : ''}${ac.type.icao} from stand ${t.from} to stand ${t.to}`);
      return;
    }
    // Ground: the crew calls for pushback when start-up is approved (TSAT with A-CDM) or it is ready.
    const pushDue = ac.startupApproved ? ac.readyAt : startupDue(sim, ac);
    if (ac.phase === 'parked' && ac.category === 'departure' && now >= pushDue) {
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
      if (o && isWaitingBlocker(o)) {
        call(sim, ac, 'blocked', `${tel}, we are blocked by ${sim.tel(o)}, waiting on the taxiway ahead, request instructions`);
        return;
      }
    }
    if (ac.stoppedAt?.kind === 'holdShort' && ac.phase === 'taxi' && now - ac.lastCallAt > 120 && ac.speed === 0) {
      call(sim, ac, 'route', `${tel}, holding short of ${ac.stoppedAt.target}, request to continue`);
      return;
    }
    return;
  }

  // The traffic that blocked us has moved on: nothing to ask any more.
  if (ac.request === 'blocked' && !ac.blockedBy && ac.speed > 0.5) {
    ac.request = null;
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
      clearance: `${stationName}, ${tel}, request clearance to ${destinationName(ac.flightPlan.destination)}`,
      startup: `${stationName}, ${tel}, stand ${ac.stand ?? ''}, ready for start-up`,
      frequency: `${stationName}, ${tel}, request frequency for pushback`,
      tow: `${stationName}, ${tel}, stand ${ac.stand ?? ''}, request tow to stand ${ac.tow?.to ?? ''}`,
    };
    // Datalink requests (DCL) are not repeated by voice.
    if (ac.request === 'clearance' && ac.dcl && sim.systemOn('dcl')) return;
    const text = reminder[ac.request];
    if (text) call(sim, ac, ac.request, text);
  }
}

/**
 * Calls of a departure on Delivery frequency: clearance request (about 10
 * minutes before off-block, by voice or datalink), start-up request (at the
 * TSAT with A-CDM, otherwise when ready), then the request for the Ground
 * frequency.
 */
function deliveryCall(sim: Simulation, ac: Aircraft, stationName: string, tel: string): void {
  const now = sim.time;
  if (!ac.cleared) {
    if (now < (ac.clearanceAt ?? ac.readyAt - CLEARANCE_LEAD_S)) return;
    if (ac.dcl && sim.systemOn('dcl')) {
      // Datalink request: shows up in the list, no voice transmission.
      ac.request = 'clearance';
      ac.requestSince = now;
      ac.lastCallAt = now;
      ac.callCount = 1;
      return;
    }
    const st = sim.airport.stand(ac.stand ?? '');
    call(sim, ac, 'clearance', `${stationName}, ${tel}, ${ac.type.icao}, stand ${st?.id ?? ''}, information ${sim.atisLetter}, request clearance to ${destinationName(ac.flightPlan.destination)}`);
    return;
  }
  if (!ac.startupApproved) {
    if (now < startupDue(sim, ac)) return;
    const tsat = sim.systemOn('acdm') && ac.tsat !== undefined ? `, TSAT ${hhmm(sim, ac.tsat)}` : '';
    call(sim, ac, 'startup', `${stationName}, ${tel}, stand ${ac.stand ?? ''}, ready for start-up${tsat}`);
    return;
  }
  if (now - ac.lastCallAt > 20) call(sim, ac, 'frequency', `${stationName}, ${tel}, start-up approved, request frequency for pushback`);
}

/**
 * True if the aircraft stands still waiting for an instruction (stopped at a
 * clearance limit, a vacate point or a hold-short) rather than queuing behind
 * other traffic or holding at a runway holding point.
 */
function isWaitingBlocker(o: Aircraft): boolean {
  if (o.speed > 0.1 || o.blockedBy || o.phase === 'holding') return false;
  if (o.stoppedAt?.kind === 'runway' || o.stoppedAt?.holdingPoint) return false;
  return !!o.stoppedAt || o.holdPosition || o.request !== null;
}

/** Seconds a departure may wait on Tower frequency short of the holding point before the AI Tower acts. */
const TOWER_STUCK_TIME = 15;
/** Up to this distance the AI Tower taxis a stranded departure on to the holding point itself. */
const TOWER_TAXI_ON_MAX = 600;

/**
 * The AI Tower does not leave a departure stranded on its frequency short of
 * the holding point (for example after "hold short of taxiway A" instead of
 * "taxi to holding point A", followed by a hand-off): it lets the aircraft
 * continue when the holding point is close, or sends it back to Ground.
 */
function towerResolveStuck(sim: Simulation, ac: Aircraft): void {
  const st = ac.stoppedAt;
  const stuck =
    ac.frequency === sim.stationFor('tower') &&
    !sim.userControls(sim.stationFor('tower')) &&
    ac.category === 'departure' &&
    ac.phase === 'taxi' &&
    !!st &&
    st.kind !== 'runway' &&
    ac.speed < 0.1 &&
    !ac.holdPosition &&
    !ac.giveWayTo &&
    !ac.incident;
  if (!stuck || !st) {
    ac.towerStuckSince = undefined;
    return;
  }
  ac.towerStuckSince ??= sim.time;
  if (sim.time - ac.towerStuckSince < TOWER_STUCK_TIME) return;
  ac.towerStuckSince = undefined;

  if (st.kind === 'holdShort') {
    // An intermediate hold-short on a route that already ends at the holding point.
    ac.stoppedAt = undefined;
    sim.system(`Tower: ${ac.callsign} was holding short of ${st.target}, Tower told it to continue to the holding point.`, 'warning', ac.callsign);
    return;
  }
  const dest: TaxiDestination = { kind: 'runway', runway: sim.runway };
  const route = autoRoute(sim, ac, dest);
  if (route && !route.requiresUTurn && route.length <= TOWER_TAXI_ON_MAX) {
    applyRoute(sim, ac, route, dest);
    sim.system(`Tower: ${ac.callsign} stopped at ${st.target} short of the holding point, Tower taxied it on to runway ${sim.runway}.`, 'warning', ac.callsign);
    return;
  }
  // Too far from the runway: back to Ground.
  ac.frequency = sim.stationFor('ground');
  ac.request = null;
  sim.stats.departuresHandedOff = Math.max(0, sim.stats.departuresHandedOff - 1);
  call(sim, ac, 'route', `${sim.station.name}, ${sim.tel(ac)}, Tower sent us back to you, we are short of the holding point, request taxi`);
}

/** Distance before the stand at which the crew can see whether it is free (metres along the route). */
const STAND_SIGHT_M = 150;

/**
 * Taxiing in, the crew sees its stand: if an aircraft stands on it (or too
 * close on a neighbouring stand), it stops and asks for another stand. An
 * aircraft that is just leaving the stand (pushback, start-up) is waited for.
 */
function checkStandAhead(sim: Simulation, ac: Aircraft): void {
  const dest = ac.routeDestination;
  if (ac.phase !== 'taxi' || !ac.path || dest?.kind !== 'stand') return;
  if (ac.path.length - ac.s > STAND_SIGHT_M) return;
  const occ = sim.standOccupant(dest.stand, ac, true);
  const neighbour = occ ? undefined : sim.standNeighbourConflict(dest.stand, ac.type.wingspanM, ac, true);
  // An aircraft that is moving (pushing back from or taxiing onto the stand) is waited for.
  const other = occ ?? neighbour?.aircraft;
  const leaving = !!other && !['parked', 'arrived'].includes(other.phase);
  if (!occ && !neighbour) {
    if (ac.standBlocked) {
      // The stand has become free (the other aircraft left): continue.
      if (!ac.standBlocked.reported) ac.holdPosition = false;
      ac.standBlocked = undefined;
    }
    return;
  }
  if (ac.standBlocked?.stand === dest.stand && ac.holdPosition) return;
  ac.holdPosition = true;
  const reported = !leaving;
  ac.standBlocked = { stand: dest.stand, reported: reported || !!ac.standBlocked?.reported };
  if (!reported || !sim.isOnMyFrequency(ac)) return;
  const why = occ
    ? `stand ${dest.stand} is occupied`
    : `stand ${dest.stand} is blocked, not enough wingtip clearance to the ${neighbour!.aircraft.type.icao} on stand ${neighbour!.stand.id}`;
  call(sim, ac, 'route', `${sim.station.name}, ${sim.tel(ac)}, ${why}, request another stand`);
}

/**
 * Computes the route a taxi instruction would produce, without executing it.
 * Used by the UI to preview routes while the controller is typing.
 */
export function previewTaxi(sim: Simulation, ac: Aircraft, c: TaxiCommand): { route: TaxiRoute; dest: TaxiDestination } | { error: string } {
  const start = routeStart(sim, ac);
  return resolveDestination(sim, ac, c.destination, toRouteStart(sim, start), c.via, c.holdShort);
}

/** Where a new route for this aircraft starts (its position and heading, or its stand). */
export function routeStartOf(sim: Simulation, ac: Aircraft): RouteStart {
  return toRouteStart(sim, routeStart(sim, ac));
}

/** Route options for this aircraft (taxi flows, wingspan, whether it may turn around). */
export function routeOptionsOf(sim: Simulation, ac: Aircraft): ReturnType<typeof routeOptions> {
  return routeOptions(sim, ac);
}

/** Builds a taxi route automatically (shortest path) - used by AI traffic and UI suggestions. */
export function autoRoute(sim: Simulation, ac: Aircraft, dest: TaxiDestination): TaxiRoute | undefined {
  const res = resolveDestination(sim, ac, dest, toRouteStart(sim, routeStart(sim, ac)), []);
  return 'error' in res ? undefined : res.route;
}
