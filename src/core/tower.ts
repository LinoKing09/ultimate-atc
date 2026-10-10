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
/** Without a landing clearance (you staff Tower) the crew goes around only just before the threshold (NM, about 280 m). */
const NO_CLEARANCE_GO_AROUND_NM = 0.15;
/** Approach (simulator) hands arrivals to Tower between these distances from the threshold (NM). */
const APP_HANDOFF_MIN_NM = 7;
const APP_HANDOFF_MAX_NM = 9;
/** Departures leave the scope this far from the airport (metres, 10 NM - about the size of the Stuttgart control zone). */
const CTR_RADIUS_M = 10 * M_PER_NM;

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

  /**
   * The runway end a departure takes off from: when you staff Tower, the one in its clearance
   * (its assigned runway, even if the ATIS has changed since); otherwise the runway in use.
   */
  departureEnd(ac: Aircraft): RunwayEnd {
    return this.sim.userTower ? this.endFor(ac.runway) : this.end;
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
    // When you staff Tower, this class only flies the aircraft: every clearance is yours.
    const user = this.sim.userTower;
    for (const ac of this.sim.aircraft) {
      switch (ac.phase) {
        case 'approach':
          this.flyApproach(ac, dt);
          break;
        case 'landing':
          this.checkVacating(ac);
          break;
        case 'holding':
          // Line-up (or take-off) clearance received: enter the runway once any condition ("behind ...") is met.
          // The crew does not enter the runway while another aircraft is lined up or still on the runway near its entry.
          if (user && ac.lineUpCleared && !ac.giveWayTo && !ac.holdPosition && ac.frequency === this.sim.stationFor('tower') && !this.entryBlocked(ac)) {
            const err = this.lineUp(ac);
            if (err) {
              ac.lineUpCleared = ac.takeoffCleared = false;
              call(this.sim, ac, 'departure', `${this.sim.tel(ac)}, unable, ${err}`);
            }
          }
          break;
        case 'lineup':
          if (user) {
            // The crew rolls when cleared - but not with traffic on the runway in front of it.
            if (ac.stoppedAt && ac.takeoffCleared && !ac.holdPosition && !ac.giveWayTo && this.sim.time >= ac.timerUntil && this.runwayClearFor(ac)) this.startTakeoff(ac);
          } else if (ac.stoppedAt && this.sim.time >= ac.timerUntil && this.canTakeOff(ac)) this.startTakeoff(ac);
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
          if (!user && ac.frequency === this.sim.stationFor('tower') && ac.stoppedAt?.kind === 'runway' && !this.runwayBusy() && this.nextArrivalEta() > 90) {
            ac.clearedToCross.add(ac.stoppedAt.target);
            ac.stoppedAt = undefined;
          }
          break;
      }
    }
    if (!user) this.handBackToGround();
    this.sequenceDepartures();
    this.detectIncursions();
  }

  /**
   * AI Tower (e.g. after you switched the Tower frequency off): arrivals that
   * have vacated and aircraft that have crossed the runway go to Ground.
   */
  private handBackToGround(): void {
    const sim = this.sim;
    const tower = sim.stationFor('tower');
    if (tower === sim.stationFor('ground')) return;
    for (const ac of sim.aircraft) {
      if (ac.frequency !== tower || !ac.onGround || ac.phase !== 'taxi') continue;
      const vacated = ac.category === 'arrival' && !ac.route;
      const crossed = (ac.crossingWithTower === 'crossing' && !this.isInRunwayArea(ac.pos)) || (ac.category !== 'departure' && ac.clearedToCross.size > 0);
      if (!vacated && !crossed) continue;
      ac.crossingWithTower = undefined;
      ac.frequency = sim.stationFor('ground');
      ac.request = null;
      sim.frequency.release(ac.callsign);
    }
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
    // Far out the arrival is still with Approach; it is handed to Tower at 7-9 NM.
    ac.approachHandoffNm = APP_HANDOFF_MIN_NM + (APP_HANDOFF_MAX_NM - APP_HANDOFF_MIN_NM) * this.sim.variation(`${ac.callsign}:app`);
    ac.frequency = distanceNm > ac.approachHandoffNm && this.sim.airport.station('APP') ? 'APP' : this.sim.stationFor('tower');
  }

  private flyApproach(ac: Aircraft, dt: number): void {
    const end = this.endFor(ac.runway);
    // Speed control: the instructed speed until the given distance, then the final approach speed.
    const vapp = ac.type.approachSpeedKt * KT_TO_MS;
    const r = ac.speedRestriction;
    const target = r && this.sim.distanceToThresholdNm(ac) > r.untilNm ? r.kt * KT_TO_MS : vapp;
    const accel = 0.6 * dt; // about 1 kt per second
    ac.speed = ac.speed < target ? Math.min(target, ac.speed + accel) : Math.max(target, ac.speed - accel);
    moveFree(ac, dt);
    if (ac.frequency === 'APP' && this.sim.distanceToThresholdNm(ac) <= (ac.approachHandoffNm ?? APP_HANDOFF_MAX_NM)) ac.frequency = this.sim.stationFor('tower');
    const c = this.sim.airport.runwayCoordinates(end, ac.pos);
    const toThreshold = this.sim.airport.runwayCoordinates(end, end.threshold).along - c.along;
    ac.altitudeFt = end.elevationFt + Math.max(0, 50 + (toThreshold * GLIDE_SLOPE) / M_PER_FT);
    ac.verticalSpeedFpm = -(ac.speed * GLIDE_SLOPE * 60) / M_PER_FT;

    // Still no landing clearance at one mile: the crew asks once more (also if it is waiting for an answer).
    const towerFreq = ac.frequency === this.sim.stationFor('tower');
    if (this.sim.userTower && towerFreq && !ac.landingCleared && !ac.landingAsked && toThreshold < M_PER_NM && !this.sim.frequency.hasQueued(ac.callsign)) {
      ac.landingAsked = true;
      call(this.sim, ac, 'landing', `${this.sim.tel(ac)}, one mile final, request landing clearance`);
    }
    // No landing clearance (you staff Tower): the crew goes around only just before the threshold.
    if (toThreshold < NO_CLEARANCE_GO_AROUND_NM * M_PER_NM && toThreshold > 0 && this.sim.userTower && !ac.landingCleared && ac.frequency !== 'APP') {
      this.goAround(ac);
      return;
    }
    // Short final with the runway not clear: go around.
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

  /** The crew goes around on its own: runway occupied, or (you staff Tower) no landing clearance. */
  private goAround(ac: Aircraft, culprit?: Aircraft): void {
    ac.phase = 'goAround';
    ac.verticalSpeedFpm = 2000;
    ac.landingCleared = false;
    if (culprit) this.sim.incident('goAround', `${ac.callsign} went around - runway occupied by ${culprit.callsign}.`, [ac.callsign, culprit.callsign]);
    else this.sim.incident('goAround', `${ac.callsign} went around - no landing clearance.`, [ac.callsign]);
    if (this.sim.isOnMyFrequency(ac)) call(this.sim, ac, 'radar', `${this.sim.tel(ac)}, going around${culprit ? '' : ', no landing clearance received'}`);
    ac.assignedStand = undefined;
  }

  /** "Go around" from Tower: costs less than a go-around the crew has to make on its own. */
  instructGoAround(ac: Aircraft): void {
    ac.phase = 'goAround';
    ac.verticalSpeedFpm = 2000;
    ac.landingCleared = false;
    ac.assignedStand = undefined;
    this.sim.stats.goAroundsInstructed++;
    this.sim.updateScore();
  }

  /** Another aircraft lined up, or on the runway within 400 m of this departure's entry (and not rolling away). */
  private entryBlocked(ac: Aircraft): boolean {
    const end = this.end;
    const here = this.sim.airport.runwayCoordinates(end, ac.pos).along;
    return this.runwayOccupants(ac).some((o) => {
      if (o.phase === 'lineup') return true;
      if (o.phase === 'takeoff') return false;
      return Math.abs(this.sim.airport.runwayCoordinates(end, o.pos).along - here) < 400;
    });
  }

  /** Runway free in front of a departure: nobody else on the runway, nobody landing or taking off. */
  private runwayClearFor(ac: Aircraft): boolean {
    if (this.runwayOccupants(ac).length > 0) return false;
    return !this.sim.aircraft.some((a) => a !== ac && (a.phase === 'takeoff' || a.phase === 'landing'));
  }

  private touchdown(ac: Aircraft): void {
    const end = this.endFor(ac.runway);
    ac.onGround = true;
    ac.altitudeFt = end.elevationFt;
    ac.verticalSpeedFpm = 0;
    // Every crew brakes a little differently: 1.2-2.0 m/s^2, and now and then rolls on to the next exit.
    const v = (k: string) => this.sim.variation(`${ac.callsign}:${k}:${Math.round(this.sim.time)}`);
    this.planRollout(ac, end, ROLLOUT_DECEL * (0.75 + 0.5 * v('decel')), this.sim.rng.chance(0.15), v('long') < 0.2);
  }

  /**
   * Plans the roll-out to the first exit that can be reached at the given
   * deceleration and puts the aircraft into phase 'landing'.
   */
  private planRollout(ac: Aircraft, end: RunwayEnd, decel: number, preferSouth: boolean, longRoll = false): void {
    const sim = this.sim;
    ac.phase = 'landing';
    const here = sim.airport.runwayCoordinates(end, ac.pos).along;
    const v0 = ac.speed;
    const candidates = sim.airport
      .exits(end.name)
      .map((ex) => {
        const node = sim.airport.node(ex.path[0]);
        const along = sim.airport.runwayCoordinates(end, node.pos).along;
        const vary = sim.variation(`${ac.callsign}:${ex.name}:${Math.round(sim.time)}`);
        const vExit = (ex.rapid ? 20 + 8 * vary : 11 + 5 * vary) * KT_TO_MS;
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
    let usable = candidates.filter((c) => c.ok);
    // A long landing roll: the first exit that could be made is passed.
    if (longRoll && usable.length > 1) usable = usable.slice(1);
    const pool = usable.length ? usable : candidates.slice(-1);
    // Tower: "vacate via E" - taken if it can still be reached.
    const requested = ac.requestedExit ? usable.find((c) => c.ex.name.toUpperCase() === ac.requestedExit) : undefined;
    const chosen = requested ?? pool.find((c) => c.south === preferSouth) ?? pool.find((c) => !c.south) ?? pool[0];
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
    if (sim.userTower && ac.frequency === sim.stationFor('tower')) {
      // You staff Tower: the crew reports vacated and waits for "contact ground".
      const what = ac.rejectedTakeoff ? 'we rejected take-off, ' : ac.emergency === 'medical' ? 'PAN PAN, medical emergency, ' : '';
      call(sim, ac, 'vacated', `${sim.tel(ac)}, ${what}runway ${ac.runway ?? this.end.name} vacated via ${ac.exitName ?? ''}`);
      return;
    }
    ac.frequency = sim.stationFor('ground');
    this.callGround(ac);
  }

  /**
   * The first call of an aircraft that has vacated the runway on Ground frequency (when you
   * staff Ground): request taxi to the stand (or back, or for another departure).
   */
  callGround(ac: Aircraft): void {
    const sim = this.sim;
    if (!sim.isOnMyFrequency(ac)) return;
    const head = `${sim.stationName(ac.frequency)}, ${sim.tel(ac)}`;
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
    if (sim.userTower) return;
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

  /** Lines a departure up from its holding point. Returns why not, if it cannot. */
  private lineUp(ac: Aircraft): string | undefined {
    const sim = this.sim;
    const end = this.departureEnd(ac);
    const hp = ac.stoppedAt?.nodeId ? sim.airport.node(ac.stoppedAt.nodeId) : undefined;
    const strip = hp?.edges.find((e) => e.kind === 'runwayStrip');
    if (!hp || !strip) return 'we are not at a runway holding point';
    const rwyNode = strip.from === hp ? strip.to : strip.from;
    const lineupPt = add(rwyNode.pos, scale(headingVector(end.heading), LINEUP_DISTANCE));
    const remaining = end.length - sim.airport.runwayCoordinates(end, lineupPt).along;
    if (remaining < 1500) {
      if (sim.userTower) return `not enough runway at ${hp.holdingPoint?.name ?? ''} for departure ${end.name}`;
      // Wrong end of the runway: send the aircraft back to Ground.
      ac.frequency = sim.stationFor('ground');
      ac.holdingSince = sim.time + 1e9;
      call(sim, ac, 'route', `${sim.stationName(sim.stationFor('ground'))}, ${sim.tel(ac)}, tower sent us back, not enough runway at ${hp.holdingPoint?.name ?? ''} for departure ${end.name}, request taxi`);
      return undefined;
    }
    const entry = sim.airport.runwayOps(end.name)?.departureEntries.find((e) => e.holdingPoint === hp.holdingPoint?.name);
    ac.intersectionDeparture = entry ? !entry.fullLength : remaining < end.length - 300;
    const path = new Path([ac.pos, rwyNode.pos, lineupPt], [hp.id, rwyNode.id, null], 35);
    ac.phase = 'lineup';
    ac.path = path;
    ac.s = 0;
    ac.stops = [{ s: path.length, kind: 'destination', target: 'lineup' }];
    ac.stoppedAt = undefined;
    // "Cleared for immediate take-off": a brisk line-up.
    ac.speedLimit = () => (ac.immediateTakeoff && ac.takeoffCleared ? LINEUP_SPEED * 1.5 : LINEUP_SPEED);
    return undefined;
  }

  onLinedUp(ac: Aircraft): void {
    // "Ready for immediate departure": keep the time lined up short.
    ac.timerUntil = ac.immediateTakeoff ? this.sim.time + 0.5 : this.sim.time + this.sim.rng.range(this.sim.userTower ? 2 : 3, this.sim.userTower ? 5 : 8);
  }

  /** "Stop immediately" from Tower during the take-off roll (below 80 kt). */
  stopTakeoff(ac: Aircraft): void {
    ac.rejectAtSpeed = undefined;
    ac.rejectedTakeoff = true;
    ac.takeoffCleared = false;
    this.sim.system(`Tower: ${ac.callsign} stopped its take-off on your instruction - runway blocked until vacated.`, 'warning', ac.callsign);
    this.planRollout(ac, this.departureEnd(ac), REJECT_DECEL, false);
  }

  private startTakeoff(ac: Aircraft): void {
    const sim = this.sim;
    const end = this.departureEnd(ac);
    const remaining = end.length - sim.airport.runwayCoordinates(end, ac.pos).along;
    const far = add(ac.pos, scale(headingVector(end.heading), remaining + 5000));
    ac.path = new Path([ac.pos, far]);
    ac.s = 0;
    ac.stops = [];
    ac.stoppedAt = undefined;
    ac.speedLimit = undefined;
    ac.heading = end.heading;
    if (sim.userTower) {
      // Your take-off clearance: check the departure separation (wake turbulence / same route).
      const early = this.spacingRemaining(ac);
      if (early > 5) {
        sim.stats.separationLosses++;
        sim.updateScore();
        sim.system(`Separation: ${ac.callsign} started its take-off ${Math.round(early)} s too early behind the previous departure (wake turbulence / departure route).`, 'warning', ac.callsign);
      }
      // Slot compliance is the controller's job: the crew takes off when cleared, an early take-off breaks the CTOT.
      if (ac.ctot !== undefined && sim.time < ac.ctot - CTOT_EARLY_S) {
        sim.stats.slotsMissed++;
        sim.updateScore();
        sim.system(`${ac.callsign} took off before its CTOT window (CTOT ${hhmm(sim, ac.ctot)}, window from ${hhmm(sim, ac.ctot - CTOT_EARLY_S)}): slot violation.`, 'warning', ac.callsign);
      }
      ac.takeoffCleared = false;
      ac.immediateTakeoff = false;
    }
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
    sim.system(`Tower: ${ac.callsign} rejected the take-off on runway ${this.departureEnd(ac).name} - runway blocked until vacated.`, 'warning', ac.callsign);
    this.planRollout(ac, this.departureEnd(ac), REJECT_DECEL, false);
  }

  private climbOut(ac: Aircraft, dt: number): void {
    const sim = this.sim;
    ac.speed = Math.min(ac.speed + 1.2 * dt, 200 * KT_TO_MS);
    if (ac.phase === 'goAround') ac.speed = Math.max(ac.speed, ac.type.approachSpeedKt * KT_TO_MS);
    moveFree(ac, dt);
    // Passing 4000 ft (or 8 NM) still on Tower frequency: a missed hand-off. The aircraft stays on the
    // scope until it leaves the control zone.
    if (!ac.leftTowerAirspace && (ac.altitudeFt - sim.airport.data.elevationFt > 4000 || length(ac.pos) > 15000)) {
      ac.leftTowerAirspace = true;
      if (ac.phase === 'climb' && sim.userTower && ac.frequency === sim.stationFor('tower')) {
        sim.stats.handoffsMissed++;
        sim.updateScore();
        sim.system(`${ac.callsign} left the control zone without a frequency change to Radar.`, 'warning', ac.callsign);
      }
    }
    if (length(ac.pos) > CTR_RADIUS_M) {
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
