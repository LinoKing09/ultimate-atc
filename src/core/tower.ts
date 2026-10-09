import { CTOT_EARLY_S, CTOT_LATE_S, hhmm } from './delivery';
import { wantsFollowMe } from './vehicles';
import type { RunwayEnd, TaxiNode } from './airport/airport';
import { moveFree, type Aircraft } from './aircraft';
import { KT_TO_MS, M_PER_FT, M_PER_NM, add, distance, headingVector, length, scale } from './geo';
import { Path } from './path';
import { call } from './pilot';
import type { Simulation } from './simulation';

/**
 * AI tower controller. Owns the runway: flies arrivals down the final
 * approach, lands them and picks an exit, lines up and launches the
 * departures that Ground hands over, and sends arrivals around when the
 * runway is not clear. Also detects runway incursions.
 *
 * The separation rules are a simplified model of ICAO PANS-ATM (Doc 4444)
 * practice; see docs/tower-operations.md for the reasoning and sources.
 */

const GLIDE_SLOPE = Math.tan((3 * Math.PI) / 180);
const ROLLOUT_DECEL = 1.6; // m/s^2 normal landing roll-out
const REJECT_DECEL = 3.0; // m/s^2 rejected take-off
const TOUCHDOWN_DISTANCE = 350; // metres past the threshold
const LINEUP_DISTANCE = 50; // metres along the runway from the entry point
const TAKEOFF_ACCEL = 2.0; // m/s^2
const LINEUP_SPEED = 9 * KT_TO_MS;
/** A landing aircraft may cross the threshold when a preceding departure is airborne and this far down the runway (RRSM). */
const RRSM_DISTANCE = 2400;
/** Short final: from here on the arrival goes around if the runway is not clear. */
const GO_AROUND_CHECK_NM = 0.5;

interface DepartureRecord {
  airborneAt: number;
  wake: string;
  fix?: string;
}

export class TowerAI {
  /** Simulation time of the last take-off roll start. */
  lastTakeoffAt = -Infinity;
  private lastDeparture?: DepartureRecord;
  private inRunwayArea = new Set<string>();

  constructor(private readonly sim: Simulation) {}

  /** Active runway end. */
  get end(): RunwayEnd {
    return this.endFor(this.sim.runway);
  }

  endFor(name: string | undefined): RunwayEnd {
    return this.sim.airport.runwayEnd(name ?? this.sim.runway) ?? this.sim.airport.runwayEnd(this.sim.runway)!;
  }

  /** True if `p` is between the runway holding positions (runway + protected strip). */
  isInRunwayArea(p: { x: number; y: number }): boolean {
    const end = this.end;
    const c = this.sim.airport.runwayCoordinates(end, p);
    return c.along > -60 && c.along < end.length + 60 && Math.abs(c.lateral) < 70;
  }

  /** Aircraft on the ground inside the runway area (optionally excluding one). */
  runwayOccupants(except?: Aircraft): Aircraft[] {
    return this.sim.aircraft.filter((a) => a !== except && a.onGround && a.phase !== 'gone' && this.isInRunwayArea(a.pos));
  }

  /** Distance (NM) of the closest arrival still on final, Infinity if none. */
  nearestArrivalNm(): number {
    let best = Infinity;
    for (const a of this.sim.aircraft) {
      if (a.phase !== 'approach') continue;
      best = Math.min(best, distance(a.pos, this.endFor(a.runway).threshold) / M_PER_NM);
    }
    return best;
  }

  /** Seconds until the next arrival crosses its threshold (Infinity if none). */
  nextArrivalEta(): number {
    let best = Infinity;
    for (const a of this.sim.aircraft) {
      if (a.phase !== 'approach') continue;
      best = Math.min(best, distance(a.pos, this.endFor(a.runway).threshold) / Math.max(1, a.speed));
    }
    return best;
  }

  /** Number of departures waiting for the runway (holding or about to reach a holding point). */
  departureDemand(): number {
    return this.sim.aircraft.filter((a) => a.category === 'departure' && (a.phase === 'holding' || (a.phase === 'taxi' && a.routeDestination?.kind === 'holdingPoint'))).length;
  }

  runwayBusy(except?: Aircraft): boolean {
    return (
      this.runwayOccupants(except).length > 0 ||
      this.sim.aircraft.some((a) => a !== except && (a.phase === 'takeoff' || a.phase === 'landing'))
    );
  }

  update(dt: number): void {
    for (const ac of this.sim.aircraft) {
      switch (ac.phase) {
        case 'approach':
          this.flyApproach(ac, dt);
          break;
        case 'landing':
          this.checkVacating(ac);
          break;
        case 'lineup':
          if (ac.stoppedAt && this.sim.time >= ac.timerUntil && this.canTakeOff(ac)) this.startTakeoff(ac);
          break;
        case 'takeoff':
          this.takeoffRoll(ac, dt);
          break;
        case 'climb':
        case 'goAround':
          this.climbOut(ac, dt);
          break;
        case 'taxi':
          // Aircraft already with the tower that hold short of the runway on their route get a crossing.
          if (ac.frequency === this.sim.stationFor('tower') && ac.stoppedAt?.kind === 'runway' && !this.runwayBusy() && this.nextArrivalEta() > 90) {
            ac.clearedToCross.add(ac.stoppedAt.target);
            ac.stoppedAt = undefined;
          }
          break;
      }
    }
    this.sequenceDepartures();
    this.detectIncursions();
  }

  // ------------------------------------------------------------------ arrivals

  /** Places an arrival on the extended centreline `distanceNm` from the threshold. */
  setupApproach(ac: Aircraft, distanceNm: number, runway = this.sim.runway): void {
    const end = this.endFor(runway);
    const back = headingVector((end.heading + 180) % 360);
    const d = distanceNm * M_PER_NM;
    ac.pos = add(end.threshold, scale(back, d));
    ac.heading = end.heading;
    ac.runway = end.name;
    ac.flightPlan.runway = end.name;
    ac.speed = ac.type.approachSpeedKt * KT_TO_MS;
    ac.altitudeFt = end.elevationFt + 50 + (d * GLIDE_SLOPE) / M_PER_FT;
    ac.onGround = false;
    ac.phase = 'approach';
    ac.frequency = this.sim.stationFor('tower');
  }

  private flyApproach(ac: Aircraft, dt: number): void {
    const end = this.endFor(ac.runway);
    moveFree(ac, dt);
    const c = this.sim.airport.runwayCoordinates(end, ac.pos);
    const toThreshold = this.sim.airport.runwayCoordinates(end, end.threshold).along - c.along;
    ac.altitudeFt = end.elevationFt + Math.max(0, 50 + (toThreshold * GLIDE_SLOPE) / M_PER_FT);
    ac.verticalSpeedFpm = -(ac.speed * GLIDE_SLOPE * 60) / M_PER_FT;

    // Short final: the runway must be clear (no landing clearance otherwise).
    if (toThreshold < GO_AROUND_CHECK_NM * M_PER_NM && toThreshold > 0) {
      const blocker = this.landingBlocker(ac, end);
      if (blocker) {
        this.goAround(ac, blocker);
        return;
      }
    }
    if (toThreshold < -TOUCHDOWN_DISTANCE) this.touchdown(ac);
  }

  /**
   * Returns the aircraft that prevents a landing, if any:
   *  - any aircraft on the ground inside the runway area, except
   *  - a departure that is already rolling and far enough down the runway to be airborne
   *    and beyond 2400 m when the arrival crosses the threshold (reduced runway separation).
   */
  private landingBlocker(ac: Aircraft, end: RunwayEnd): Aircraft | undefined {
    for (const o of this.runwayOccupants(ac)) {
      if (o.phase === 'takeoff') {
        const along = this.sim.airport.runwayCoordinates(end, o.pos).along;
        if (along > RRSM_DISTANCE / 2 || o.speed > 100 * KT_TO_MS) continue;
      }
      return o;
    }
    return this.sim.aircraft.find((o) => o !== ac && o.phase === 'landing');
  }

  private goAround(ac: Aircraft, culprit: Aircraft): void {
    ac.phase = 'goAround';
    ac.verticalSpeedFpm = 2000;
    this.sim.incident('goAround', `${ac.callsign} went around - runway occupied by ${culprit.callsign}.`, [ac.callsign, culprit.callsign]);
    ac.assignedStand = undefined;
  }

  private touchdown(ac: Aircraft): void {
    const end = this.endFor(ac.runway);
    ac.onGround = true;
    ac.altitudeFt = end.elevationFt;
    ac.verticalSpeedFpm = 0;
    this.planRollout(ac, end, ROLLOUT_DECEL, this.sim.rng.chance(0.15));
  }

  /**
   * Plans the roll-out to the first exit that can be reached at the given
   * deceleration and puts the aircraft into phase 'landing'.
   */
  private planRollout(ac: Aircraft, end: RunwayEnd, decel: number, preferSouth: boolean): void {
    const sim = this.sim;
    ac.phase = 'landing';
    const here = sim.airport.runwayCoordinates(end, ac.pos).along;
    const v0 = ac.speed;
    const candidates = sim.airport
      .exits(end.name)
      .map((ex) => {
        const node = sim.airport.node(ex.path[0]);
        const along = sim.airport.runwayCoordinates(end, node.pos).along;
        const vExit = (ex.rapid ? 25 : 14) * KT_TO_MS;
        const needed = (v0 * v0 - vExit * vExit) / (2 * decel);
        return { ex, node, along, vExit, ok: along - here >= needed, south: ex.path[1].endsWith('2') };
      })
      .filter((c) => c.along > here + 5)
      // Don't take an exit that is blocked by an aircraft waiting behind its holding point.
      .filter((c) => {
        const stop = sim.airport.node(c.ex.path[c.ex.path.length - 1]).pos;
        return !sim.aircraft.some((o) => o !== ac && o.onGround && distance(o.pos, stop) < 70);
      })
      .sort((a, b) => a.along - b.along);
    const usable = candidates.filter((c) => c.ok);
    const pool = usable.length ? usable : candidates.slice(-1);
    const chosen = pool.find((c) => c.south === preferSouth) ?? pool.find((c) => !c.south) ?? pool[0];
    if (!chosen) {
      ac.phase = 'gone';
      return;
    }
    ac.exitName = chosen.ex.name;
    const nodes: TaxiNode[] = chosen.ex.path.map((id) => sim.airport.node(id));
    const path = new Path([ac.pos, ...nodes.map((n) => n.pos)], [null, ...nodes.map((n) => n.id)], 40);
    const sExit = path.marker(chosen.node.id)?.s ?? path.length;
    const vExit = chosen.vExit;
    ac.path = path;
    ac.s = 0;
    ac.reverse = false;
    ac.route = null;
    ac.stops = [{ s: path.length, kind: 'destination', target: 'vacated' }];
    ac.stoppedAt = undefined;
    ac.speedLimit = (s) => (s < sExit ? Math.min(v0, Math.sqrt(vExit * vExit + 2 * decel * (sExit - s))) : 10 * KT_TO_MS);
  }

  private checkVacating(ac: Aircraft): void {
    if (!ac.path) return;
    // markers: [runway node, holding point, stop point]
    const hp = ac.path.markers[1];
    if (hp && ac.s >= hp.s) ac.phase = 'vacating';
  }

  /** Called when an aircraft has stopped behind the holding position of its exit. */
  onVacated(ac: Aircraft): void {
    const sim = this.sim;
    ac.phase = 'taxi';
    ac.speedLimit = undefined;
    ac.route = null;
    ac.frequency = sim.stationFor('ground');
    if (!sim.isOnMyFrequency(ac)) return;
    const head = `${sim.station.name}, ${sim.tel(ac)}`;
    const via = `vacated runway ${ac.runway ?? this.end.name} via ${ac.exitName ?? ''}`;
    if (ac.rejectedTakeoff) {
      if (sim.rng.chance(0.6)) {
        ac.returnToStand = true;
        ac.assignedStand = sim.traffic.allocateStand(ac)?.id;
        call(sim, ac, 'taxiIn', `${head}, we rejected take-off due to a technical problem, ${via}, request taxi back to the stand`);
      } else {
        call(sim, ac, 'taxi', `${head}, we rejected take-off, problem solved, ${via}, request taxi for another departure`);
      }
      return;
    }
    if (ac.emergency === 'medical') {
      // Ground's part starts now: the bonus clock runs from this call.
      ac.emergencySince = sim.time;
      call(sim, ac, 'taxiIn', `${head}, PAN PAN, medical emergency on board, ${via}, request expedited taxi to the stand, ambulance requested`);
      return;
    }
    // Crews unfamiliar with the airport ask for a follow-me.
    ac.wantsFollowMe = wantsFollowMe(sim, ac);
    call(sim, ac, 'taxiIn', `${head}, ${via}${ac.wantsFollowMe ? ', request follow-me to the stand' : ''}`);
  }

  // ------------------------------------------------------------------ departures

  /** The departure the next one has to be separated from: one still rolling, else the last airborne one. */
  private precedingDeparture(): DepartureRecord | undefined {
    const rolling = this.sim.aircraft.find((a) => a.phase === 'takeoff' && !a.rejectedTakeoff);
    if (rolling) {
      const toVr = Math.max(0, (rolling.type.vrKt * KT_TO_MS - rolling.speed) / TAKEOFF_ACCEL);
      return {
        airborneAt: this.sim.time + toVr,
        wake: rolling.type.wake,
        fix: this.sim.config.airport.sids.find((x) => x.name === rolling.flightPlan.sid)?.fix,
      };
    }
    return this.lastDeparture;
  }

  /** Seconds until `ac` may start its take-off roll as far as departure separation is concerned. */
  spacingRemaining(ac: Aircraft): number {
    const prev = this.precedingDeparture();
    if (!prev) return 0;
    return prev.airborneAt + this.departureSpacing(ac, prev) - this.sim.time;
  }

  /** Minimum time (s) between the previous departure becoming airborne and the next take-off roll. */
  departureSpacing(ac: Aircraft, prev = this.lastDeparture): number {
    if (!prev) return 0;
    const fix = this.sim.config.airport.sids.find((s) => s.name === ac.flightPlan.sid)?.fix;
    // Wake turbulence: 2 minutes behind a heavy (3 minutes from an intersection).
    if ((prev.wake === 'H' || prev.wake === 'J') && ac.type.wake !== 'J') return ac.intersectionDeparture ? 180 : 120;
    // Radar/route separation: 2 minutes on the same departure route, 1 minute on diverging routes.
    return prev.fix && prev.fix === fix ? 120 : 60;
  }

  /** Time (s) from start of roll until the aircraft is airborne and well down the runway. */
  private rollTime(ac: Aircraft): number {
    return (ac.type.vrKt * KT_TO_MS) / TAKEOFF_ACCEL + 12;
  }

  /**
   * CTOT (ATFM slot): take-off is only allowed from CTOT -5 to CTOT +10
   * minutes. A flight that misses its window needs a new slot.
   */
  private checkSlots(): void {
    const sim = this.sim;
    for (const a of sim.aircraft) {
      if (a.category !== 'departure' || a.ctot === undefined || !a.onGround || ['takeoff', 'climb', 'gone'].includes(a.phase)) continue;
      if (sim.time <= a.ctot + CTOT_LATE_S) continue;
      const old = hhmm(sim, a.ctot);
      a.ctot = Math.round((sim.time + sim.rng.range(20 * 60, 40 * 60)) / 60) * 60;
      sim.stats.slotsMissed++;
      sim.updateScore();
      sim.system(`${a.callsign} missed its CTOT ${old} (window -5/+10 min). New CTOT ${hhmm(sim, a.ctot)} from the Network Manager.`, 'warning', a.callsign);
    }
  }

  private sequenceDepartures(): void {
    const sim = this.sim;
    this.checkSlots();
    if (sim.aircraft.some((a) => a.phase === 'lineup')) return;
    // A departure with a CTOT is only lined up when it can be airborne inside its window; others go first.
    const queue = sim.aircraft
      .filter((a) => a.frequency === sim.stationFor('tower') && a.phase === 'holding')
      .filter((a) => a.ctot === undefined || sim.time + 35 + this.rollTime(a) >= a.ctot - CTOT_EARLY_S)
      .sort((a, b) => (a.holdingSince ?? 0) - (b.holdingSince ?? 0));
    const next = queue[0];
    if (!next || !this.canLineUp(next)) return;
    this.lineUp(next);
  }

  /**
   * Line-up ("line up and wait") is given when the runway entry is free and
   * the departure can be airborne before the next arrival reaches the
   * threshold. It may line up behind a landing aircraft that has passed its
   * entry point, or behind a departure that is already rolling.
   */
  private canLineUp(ac: Aircraft): boolean {
    const end = this.end;
    const entry = ac.pos;
    const entryAlong = this.sim.airport.runwayCoordinates(end, entry).along;
    // Time until a landing aircraft we line up behind has vacated (take-off must wait for it).
    let landingRemaining = 0;
    for (const o of this.runwayOccupants(ac)) {
      if (o.phase === 'takeoff') continue;
      if (o.phase === 'landing' && this.sim.airport.runwayCoordinates(end, o.pos).along > entryAlong + 300) {
        const rest = o.path ? o.path.length - o.s : 0;
        landingRemaining = Math.max(landingRemaining, rest / Math.max(o.speed, 6) + 10);
        continue;
      }
      return false;
    }
    const remainingSpacing = this.spacingRemaining(ac);
    if (remainingSpacing > 45) return false;
    // Emergency arrivals get priority.
    if (this.sim.aircraft.some((a) => a.phase === 'approach' && a.emergency && distance(a.pos, this.endFor(a.runway).threshold) < 8 * M_PER_NM)) return false;
    const lineupTime = 35;
    const needed = lineupTime + Math.max(5, remainingSpacing, landingRemaining) + this.rollTime(ac) + 15;
    return this.nextArrivalEta() > needed;
  }

  private canTakeOff(ac: Aircraft): boolean {
    // Previous departure airborne, preceding landing vacated, nobody crossing.
    if (this.runwayOccupants(ac).length > 0) return false;
    if (this.sim.aircraft.some((a) => a !== ac && (a.phase === 'takeoff' || a.phase === 'landing'))) return false;
    if (this.spacingRemaining(ac) > 0) return false;
    return this.nextArrivalEta() > this.rollTime(ac) + 8;
  }

  private lineUp(ac: Aircraft): void {
    const sim = this.sim;
    const end = this.end;
    const hp = ac.stoppedAt?.nodeId ? sim.airport.node(ac.stoppedAt.nodeId) : undefined;
    const strip = hp?.edges.find((e) => e.kind === 'runwayStrip');
    if (!hp || !strip) return;
    const rwyNode = strip.from === hp ? strip.to : strip.from;
    const lineupPt = add(rwyNode.pos, scale(headingVector(end.heading), LINEUP_DISTANCE));
    const remaining = end.length - sim.airport.runwayCoordinates(end, lineupPt).along;
    if (remaining < 1500) {
      // Wrong end of the runway: send the aircraft back to Ground.
      ac.frequency = sim.stationFor('ground');
      ac.holdingSince = sim.time + 1e9;
      call(sim, ac, 'route', `${sim.station.name}, ${sim.tel(ac)}, tower sent us back, not enough runway at ${hp.holdingPoint?.name ?? ''} for departure ${end.name}, request taxi`);
      return;
    }
    const entry = sim.airport.runwayOps(end.name)?.departureEntries.find((e) => e.holdingPoint === hp.holdingPoint?.name);
    ac.intersectionDeparture = entry ? !entry.fullLength : remaining < end.length - 300;
    const path = new Path([ac.pos, rwyNode.pos, lineupPt], [hp.id, rwyNode.id, null], 35);
    ac.phase = 'lineup';
    ac.path = path;
    ac.s = 0;
    ac.stops = [{ s: path.length, kind: 'destination', target: 'lineup' }];
    ac.stoppedAt = undefined;
    ac.speedLimit = () => LINEUP_SPEED;
  }

  onLinedUp(ac: Aircraft): void {
    // "Ready for immediate departure": keep the time lined up short.
    ac.timerUntil = this.sim.time + this.sim.rng.range(3, 8);
  }

  private startTakeoff(ac: Aircraft): void {
    const sim = this.sim;
    const end = this.end;
    const remaining = end.length - sim.airport.runwayCoordinates(end, ac.pos).along;
    const far = add(ac.pos, scale(headingVector(end.heading), remaining + 5000));
    ac.path = new Path([ac.pos, far]);
    ac.s = 0;
    ac.stops = [];
    ac.stoppedAt = undefined;
    ac.speedLimit = undefined;
    ac.heading = end.heading;
    ac.phase = 'takeoff';
    this.lastTakeoffAt = sim.time;
    // Special event: rejected take-off.
    const forced = sim.forceRejectedTakeoff && !ac.rejectedTakeoff;
    if (forced) sim.forceRejectedTakeoff = false;
    if (forced || (sim.config.events !== false && !ac.rejectedTakeoff && sim.rng.chance(0.015))) {
      ac.rejectAtSpeed = sim.rng.range(60, Math.min(110, ac.type.vrKt - 15)) * KT_TO_MS;
    }
  }

  private takeoffRoll(ac: Aircraft, dt: number): void {
    ac.speed += TAKEOFF_ACCEL * dt;
    ac.s += ac.speed * dt;
    if (ac.path) ac.pos = ac.path.pointAt(ac.s);
    if (ac.rejectAtSpeed && ac.speed >= ac.rejectAtSpeed) {
      this.rejectTakeoff(ac);
      return;
    }
    if (ac.speed >= ac.type.vrKt * KT_TO_MS) {
      ac.onGround = false;
      ac.phase = 'climb';
      ac.verticalSpeedFpm = ac.type.climbFpm;
      ac.path = null;
      ac.airborneAt = this.sim.time;
      this.lastDeparture = {
        airborneAt: this.sim.time,
        wake: ac.type.wake,
        fix: this.sim.config.airport.sids.find((s) => s.name === ac.flightPlan.sid)?.fix,
      };
    }
  }

  private rejectTakeoff(ac: Aircraft): void {
    const sim = this.sim;
    ac.rejectAtSpeed = undefined;
    ac.rejectedTakeoff = true;
    sim.stats.rejectedTakeoffs++;
    sim.system(`Tower: ${ac.callsign} rejected the take-off on runway ${this.end.name} - runway blocked until vacated.`, 'warning', ac.callsign);
    this.planRollout(ac, this.end, REJECT_DECEL, false);
  }

  private climbOut(ac: Aircraft, dt: number): void {
    const sim = this.sim;
    ac.speed = Math.min(ac.speed + 1.2 * dt, 200 * KT_TO_MS);
    if (ac.phase === 'goAround') ac.speed = Math.max(ac.speed, ac.type.approachSpeedKt * KT_TO_MS);
    moveFree(ac, dt);
    if (ac.altitudeFt - sim.airport.data.elevationFt > 4000 || length(ac.pos) > 15000) {
      if (ac.phase === 'climb') sim.stats.departuresAirborne++;
      ac.phase = 'gone';
    }
  }

  // ------------------------------------------------------------------ safety nets

  private detectIncursions(): void {
    const sim = this.sim;
    const now = new Set<string>();
    for (const ac of sim.aircraft) {
      if (!ac.onGround || ac.phase === 'gone') continue;
      if (!this.isInRunwayArea(ac.pos)) continue;
      now.add(ac.callsign);
      if (this.inRunwayArea.has(ac.callsign)) continue;
      // Newly entered the runway area. Only taxiing traffic can cause an incursion.
      if (ac.phase !== 'taxi') continue;
      const arrival = this.nearestArrivalNm();
      const rolling = sim.aircraft.find((a) => a.phase === 'takeoff' || a.phase === 'landing' || a.phase === 'lineup');
      if (arrival < 2.5 || rolling) {
        const reason = rolling ? `${rolling.callsign} is using the runway` : `traffic on ${arrival.toFixed(1)} NM final`;
        sim.incident('incursion', `RUNWAY INCURSION: ${ac.callsign} entered runway ${this.end.runway} while ${reason}.`, [ac.callsign]);
      }
    }
    this.inRunwayArea = now;
  }
}
