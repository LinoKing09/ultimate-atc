import type { RunwayEnd, TaxiNode } from './airport/airport';
import { moveFree, type Aircraft } from './aircraft';
import { KT_TO_MS, M_PER_FT, M_PER_NM, add, distance, headingVector, length, scale } from './geo';
import { Path } from './path';
import { call } from './pilot';
import type { Simulation } from './simulation';

const GLIDE_SLOPE = Math.tan((3 * Math.PI) / 180);
const ROLLOUT_DECEL = 1.6; // m/s^2
const TOUCHDOWN_DISTANCE = 350; // metres past the threshold
const LINEUP_DISTANCE = 50; // metres along the runway from the entry point

/**
 * AI tower controller. Owns the active runway: flies arrivals down the
 * final approach, lands them and picks an exit, lines up and launches the
 * departures that Ground hands over, and sends arrivals around when the
 * runway is not clear. Also detects runway incursions.
 */
export class TowerAI {
  lastTakeoffAt = -Infinity;
  private lastTakeoffWake: string = 'M';
  private inRunwayArea = new Set<string>();

  constructor(private readonly sim: Simulation) {}

  get end(): RunwayEnd {
    return this.sim.airport.runwayEnd(this.sim.config.runway)!;
  }

  /** True if `p` is between the runway holding positions (runway + protected strip). */
  isInRunwayArea(p: { x: number; y: number }): boolean {
    const c = this.sim.airport.runwayCoordinates(this.end, p);
    return c.along > -60 && c.along < this.end.length + 60 && Math.abs(c.lateral) < 70;
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
      best = Math.min(best, distance(a.pos, this.end.threshold) / M_PER_NM);
    }
    return best;
  }

  runwayBusy(except?: Aircraft): boolean {
    return (
      this.runwayOccupants(except).length > 0 ||
      this.sim.aircraft.some((a) => a !== except && (a.phase === 'takeoff' || a.phase === 'landing'))
    );
  }

  update(dt: number): void {
    const sim = this.sim;
    for (const ac of sim.aircraft) {
      switch (ac.phase) {
        case 'approach':
          this.flyApproach(ac, dt);
          break;
        case 'landing':
          this.checkVacating(ac);
          break;
        case 'lineup':
          if (ac.stoppedAt && sim.time >= ac.timerUntil && !this.runwayBusy(ac)) this.startTakeoff(ac);
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
          if (ac.frequency === 'TWR' && ac.stoppedAt?.kind === 'runway' && !this.runwayBusy() && this.nearestArrivalNm() > 3) {
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
  setupApproach(ac: Aircraft, distanceNm: number): void {
    const end = this.end;
    const back = headingVector((end.heading + 180) % 360);
    const d = distanceNm * M_PER_NM;
    ac.pos = add(end.threshold, scale(back, d));
    ac.heading = end.heading;
    ac.runway = end.name;
    ac.speed = ac.type.approachSpeedKt * KT_TO_MS;
    ac.altitudeFt = end.elevationFt + 50 + (d * GLIDE_SLOPE) / M_PER_FT;
    ac.onGround = false;
    ac.phase = 'approach';
    ac.frequency = 'TWR';
  }

  private flyApproach(ac: Aircraft, dt: number): void {
    const end = this.end;
    moveFree(ac, dt);
    const c = this.sim.airport.runwayCoordinates(end, ac.pos);
    const toThreshold = this.sim.airport.runwayCoordinates(end, end.threshold).along - c.along;
    ac.altitudeFt = end.elevationFt + Math.max(0, 50 + (toThreshold * GLIDE_SLOPE) / M_PER_FT);
    ac.verticalSpeedFpm = -(ac.speed * GLIDE_SLOPE * 60) / M_PER_FT;

    // Go around if the runway is not clear when short final.
    if (toThreshold < 0.9 * M_PER_NM && toThreshold > 0) {
      const occ = this.runwayOccupants(ac);
      const rolling = this.sim.aircraft.find((a) => a !== ac && (a.phase === 'takeoff' || a.phase === 'landing'));
      if (occ.length || (rolling && toThreshold < 0.5 * M_PER_NM)) {
        const culprit = occ[0] ?? rolling!;
        this.goAround(ac, culprit);
        return;
      }
    }
    if (toThreshold < -TOUCHDOWN_DISTANCE) this.touchdown(ac);
  }

  private goAround(ac: Aircraft, culprit: Aircraft): void {
    ac.phase = 'goAround';
    ac.verticalSpeedFpm = 2000;
    this.sim.incident('goAround', `${ac.callsign} went around - runway occupied by ${culprit.callsign}.`, [ac.callsign, culprit.callsign]);
    if (ac.assignedStand) ac.assignedStand = undefined;
  }

  private touchdown(ac: Aircraft): void {
    const sim = this.sim;
    const end = this.end;
    ac.onGround = true;
    ac.altitudeFt = end.elevationFt;
    ac.verticalSpeedFpm = 0;
    ac.phase = 'landing';
    const touchAlong = sim.airport.runwayCoordinates(end, ac.pos).along;
    const v0 = ac.speed;

    const exits = sim.airport.exits(end.name);
    const preferSouth = sim.rng.chance(0.15);
    const candidates = exits
      .map((ex) => {
        const node = sim.airport.node(ex.path[0]);
        const along = sim.airport.runwayCoordinates(end, node.pos).along;
        const vExit = (ex.rapid ? 25 : 14) * KT_TO_MS;
        const needed = (v0 * v0 - vExit * vExit) / (2 * ROLLOUT_DECEL);
        return { ex, node, along, vExit, ok: along - touchAlong >= needed, south: ex.path[1].endsWith('2') };
      })
      .filter((c) => c.along > touchAlong)
      .sort((a, b) => a.along - b.along);
    const usable = candidates.filter((c) => c.ok);
    const pool = usable.length ? usable : candidates.slice(-1);
    const chosen =
      pool.find((c) => c.south === preferSouth) ?? pool.find((c) => !c.south) ?? pool[0];
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
    ac.speedLimit = (s) => (s < sExit ? Math.min(v0, Math.sqrt(vExit * vExit + 2 * ROLLOUT_DECEL * (sExit - s))) : 10 * KT_TO_MS);
  }

  private checkVacating(ac: Aircraft): void {
    if (!ac.path) return;
    // markers: [runway node, holding point, stop point]
    const hp = ac.path.markers[1];
    if (hp && ac.s >= hp.s) ac.phase = 'vacating';
  }

  /** Called when an arrival has stopped behind the holding position of its exit. */
  onVacated(ac: Aircraft): void {
    const sim = this.sim;
    ac.phase = 'taxi';
    ac.speedLimit = undefined;
    ac.route = null;
    ac.frequency = sim.config.position;
    if (sim.isOnMyFrequency(ac)) {
      call(sim, ac, 'taxiIn', `${sim.station.name}, ${sim.tel(ac)}, vacated runway ${this.end.name} via ${ac.exitName ?? ''}`);
    }
  }

  // ------------------------------------------------------------------ departures

  private sequenceDepartures(): void {
    const sim = this.sim;
    if (sim.aircraft.some((a) => a.phase === 'lineup')) return;
    const queue = sim.aircraft
      .filter((a) => a.frequency === 'TWR' && a.phase === 'holding')
      .sort((a, b) => (a.holdingSince ?? 0) - (b.holdingSince ?? 0));
    const next = queue[0];
    if (!next) return;
    const spacing = this.lastTakeoffWake === 'H' ? 120 : 75;
    if (sim.time - this.lastTakeoffAt < spacing) return;
    if (this.runwayBusy(next) || this.nearestArrivalNm() < 4.5) return;
    this.lineUp(next);
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
      ac.frequency = sim.config.position;
      ac.holdingSince = sim.time + 1e9;
      call(sim, ac, 'route', `${sim.station.name}, ${sim.tel(ac)}, tower sent us back, not enough runway at ${hp.holdingPoint?.name ?? ''} for departure ${end.name}, request taxi`);
      return;
    }
    const path = new Path([ac.pos, rwyNode.pos, lineupPt], [hp.id, rwyNode.id, null], 35);
    ac.phase = 'lineup';
    ac.path = path;
    ac.s = 0;
    ac.stops = [{ s: path.length, kind: 'destination', target: 'lineup' }];
    ac.stoppedAt = undefined;
    ac.speedLimit = () => 9 * KT_TO_MS;
  }

  onLinedUp(ac: Aircraft): void {
    ac.timerUntil = this.sim.time + this.sim.rng.range(8, 20);
  }

  private startTakeoff(ac: Aircraft): void {
    const end = this.end;
    const remaining = end.length - this.sim.airport.runwayCoordinates(end, ac.pos).along;
    const far = add(ac.pos, scale(headingVector(end.heading), remaining + 5000));
    ac.path = new Path([ac.pos, far]);
    ac.s = 0;
    ac.stops = [];
    ac.stoppedAt = undefined;
    ac.speedLimit = undefined;
    ac.heading = end.heading;
    ac.phase = 'takeoff';
    this.lastTakeoffAt = this.sim.time;
    this.lastTakeoffWake = ac.type.wake;
  }

  private takeoffRoll(ac: Aircraft, dt: number): void {
    ac.speed += 2.0 * dt;
    ac.s += ac.speed * dt;
    if (ac.path) ac.pos = ac.path.pointAt(ac.s);
    if (ac.speed >= ac.type.vrKt * KT_TO_MS) {
      ac.onGround = false;
      ac.phase = 'climb';
      ac.verticalSpeedFpm = ac.type.climbFpm;
      ac.path = null;
    }
  }

  private climbOut(ac: Aircraft, dt: number): void {
    const sim = this.sim;
    ac.speed = Math.min(ac.speed + 1.2 * dt, 200 * KT_TO_MS);
    if (ac.phase === 'goAround') ac.speed = Math.max(ac.speed, ac.type.approachSpeedKt * KT_TO_MS);
    moveFree(ac, dt);
    if (ac.altitudeFt - sim.airport.data.elevationFt > 4000 || length(ac.pos) > 15000) {
      if (ac.phase === 'climb') {
        sim.stats.departuresAirborne++;
      }
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
