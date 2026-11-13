import { aircraftType } from '../data/aircraftTypes';
import { AIRLINES } from '../data/airlines';
import { destinationName } from '../data/destinations';
import type { Aircraft } from './aircraft';
import type { AirportData, StationType } from './airport/types';
import { allocateSquawk, departureFrequency, initialClimb, suggestedSid } from './delivery';
import { M_PER_NM } from './geo';
import { formatSidClimb } from './phraseology/format';
import { finalCoordinates, offered } from './radar';
import type { SimConfig, Simulation } from './simulation';
import { windWords } from './weather';

/**
 * Tutorials: one guided lesson per position with a fixed traffic situation.
 * Each step explains something, shows an example instruction and waits until
 * the simulation shows that it was done (an aircraft selected, a pushback
 * approved, a frequency changed ...). No DOM here: the UI shows the steps
 * (ui/tutorialPanel.ts) and passes the selected aircraft in.
 *
 * The examples are real instructions: tests/tutorial.test.ts plays every
 * lesson by sending them, so they stay correct when the simulation changes.
 */

export type TutorialId = 'delivery' | 'ground' | 'tower' | 'approach';

export interface TutorialContext {
  sim: Simulation;
  /** Aircraft selected in the UI. */
  selected?: string;
}

export interface TutorialStep {
  title: string;
  /** Explanation; `backticks` mark instructions. */
  text: string | ((sim: Simulation) => string);
  /** The aircraft the step is about (the UI selects it with "Show me"). */
  focus?: string;
  /** Example instruction for the command line, if the step is done by radio. */
  example?: (sim: Simulation) => string | undefined;
  /**
   * Not yet the moment for the example (radar: the turn onto base comes at the right distance): what to wait for.
   * Undefined when it is time. The panel shows it above the example.
   */
  wait?: (sim: Simulation) => string | undefined;
  /**
   * A step done with the scope instead of the radio (radar: assume a track Center offers, start the hand-over of a
   * track). The text says how; tests perform it as the session action of the same name.
   */
  action?: 'assume' | 'transfer';
  /** Called once when the step starts (e.g. new traffic). */
  enter?: (sim: Simulation) => void;
  /** The step is complete. Without it the step waits for "Next". */
  done?: (ctx: TutorialContext) => boolean;
}

export interface Tutorial {
  id: TutorialId;
  title: string;
  /** One line for the Connect dialog. */
  summary: string;
  /** Position the user staffs (the others are run by the simulator). */
  position: StationType;
  steps: TutorialStep[];
}

/** Fixed session settings of a tutorial: runway 25, wind 250/08, no random traffic or events. */
/** The tutorials are written for Stuttgart. */
export const TUTORIAL_AIRPORT = 'EDDS';
export const TUTORIAL_RUNWAY = '25';
const TUTORIAL_SEED = 2026;

/** Simulation setup for a tutorial. */
export function tutorialConfig(t: Tutorial, airport: AirportData): SimConfig {
  return { airport, position: t.position, runway: TUTORIAL_RUNWAY, density: 'light', seed: TUTORIAL_SEED, generateTraffic: false, events: false };
}

/** Runs a tutorial against a simulation: starts the steps and checks when they are done. */
export class TutorialRunner {
  index = 0;
  /** The furthest step reached. Steps before it are only shown again (Back): no traffic, no automatic advance. */
  furthest = 0;
  private entered = false;

  constructor(
    readonly tutorial: Tutorial,
    readonly sim: Simulation,
  ) {
    // A calm, fixed situation: westerly wind on runway 25, no readback errors unless a step asks for one.
    const wind = { direction: 250, speedKt: 8 };
    sim.atis.wind = { ...wind };
    sim.observedWind = { ...wind };
    sim.met.drift.enabled = false;
    sim.readbackErrors = 'off';
  }

  get step(): TutorialStep | undefined {
    return this.tutorial.steps[this.index];
  }

  get finished(): boolean {
    return this.index >= this.tutorial.steps.length;
  }

  /** Text of the current step. */
  text(): string {
    const s = this.step;
    if (!s) return '';
    return typeof s.text === 'function' ? s.text(this.sim) : s.text;
  }

  /** Starts the current step, or moves on when it is done. Returns true if the step changed. */
  update(selected?: string): boolean {
    const s = this.step;
    if (!s || this.reviewing) return false;
    if (!this.entered) {
      this.entered = true;
      s.enter?.(this.sim);
      return true;
    }
    if (s.done?.({ sim: this.sim, selected })) {
      this.next();
      return true;
    }
    return false;
  }

  /** True while an earlier step is shown again (after Back). */
  get reviewing(): boolean {
    return this.index < this.furthest;
  }

  /** Next step (the "Next" button; on a step with a task it skips the task). */
  next(): void {
    if (this.finished) return;
    if (this.index === this.furthest) {
      this.furthest++;
      this.entered = false;
    }
    this.index++;
  }

  /** The previous step again (the "Back" button). */
  back(): void {
    if (this.index > 0) this.index--;
  }

  /** Ends the tutorial at once ("Skip tutorial"). */
  skipAll(): void {
    this.index = this.furthest = this.tutorial.steps.length;
  }

  /** After the last step: normal random traffic from now on. */
  startLiveTraffic(): void {
    this.sim.config.generateTraffic = true;
  }
}

// ---------------------------------------------------------------------- helpers

const ac = (sim: Simulation, cs: string): Aircraft | undefined => sim.find(cs);
const freq = (sim: Simulation, type: StationType) => sim.airport.station(type)?.frequency ?? '';
const airline = (icao: string) => AIRLINES.find((a) => a.icao === icao);

/** A departure on a stand with neither slot nor datalink (unless asked): the lessons stay predictable. */
function departure(sim: Simulation, callsign: string, stand: string, readyIn: number, opts: { dcl?: boolean } = {}): void {
  if (sim.find(callsign)) return;
  const a = sim.traffic.spawnDeparture(readyIn, { stand, callsign, type: 'A320' });
  if (!a) return;
  a.ctot = undefined;
  a.dcl = !!opts.dcl;
  a.plannedMedical = false;
}

function arrival(sim: Simulation, callsign: string, distanceNm: number): void {
  if (sim.find(callsign)) return;
  sim.traffic.spawnArrival(distanceNm, { callsign, type: 'A320', airline: airline(callsign.slice(0, 3)), medical: false });
}

/** "cleared to Frankfurt, ETASA4B departure, flight planned route, climb via SID to altitude 5000 feet, squawk 2101" */
function clearance(sim: Simulation, a: Aircraft): string {
  return `cleared to ${destinationName(a.flightPlan.destination)}, ${suggestedSid(sim, a)} departure, flight planned route, ${formatSidClimb(initialClimb(sim))}, squawk ${a.clearance?.squawk || allocateSquawk(sim)}`;
}

const wind = (sim: Simulation) => `wind ${windWords(sim.observedWind)}`;

const SELECT_HINT = 'Select it: tap it on the scope or in the list.';
const FASTER = 'Tip: 2x / 4x speeds things up.';
const MENU_HINT = 'Or use the aircraft menu / quick-action bar.';

// ---------------------------------------------------------------------- Ground

const GROUND: Tutorial = {
  id: 'ground',
  title: 'Ground',
  summary: 'Pushback, taxi out, hand-off to Tower, taxi in an arrival.',
  position: 'GND',
  steps: [
    {
      title: 'Welcome to Stuttgart Ground',
      text:
        'You are Stuttgart Ground (118.605): aprons and taxiways are yours, the runway is Tower\'s. Departures: pushback, taxi, hand-off to Tower. Arrivals: taxi to the stand. Runway 25 is in use.',
    },
    {
      title: 'A departure calls',
      text: `DLH5AB on stand 14 will call you for pushback. ${SELECT_HINT}`,
      focus: 'DLH5AB',
      enter: (sim) => departure(sim, 'DLH5AB', '14', 20),
      done: ({ sim, selected }) => selected === 'DLH5AB' && !!ac(sim, 'DLH5AB'),
    },
    {
      title: 'Pushback',
      text: `When it calls, approve the pushback. "Facing east" = nose towards runway 25 afterwards. ${MENU_HINT}`,
      focus: 'DLH5AB',
      example: () => 'DLH5AB pushback approved, facing east',
      // The arrival of the later step is already on its way.
      enter: (sim) => arrival(sim, 'EWG7TK', 9),
      done: ({ sim }) => !!ac(sim, 'DLH5AB') && ac(sim, 'DLH5AB')!.phase !== 'parked',
    },
    {
      title: 'Taxi to the holding point',
      text:
        'At "ready for taxi": holding point A (full length) and the taxiways in order. Departures use N eastbound. The preview shows the route in green before you send it.',
      focus: 'DLH5AB',
      example: () => 'DLH5AB taxi to holding point A via M, H, N',
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !!a && a.phase === 'taxi' && a.routeDestination?.kind === 'holdingPoint';
      },
    },
    {
      title: 'An arrival is landing',
      text: `EWG7TK is landing. After vacating, Tower hands it to you and it calls. ${FASTER}`,
      focus: 'EWG7TK',
      enter: (sim) => arrival(sim, 'EWG7TK', 5),
      done: ({ sim }) => ac(sim, 'EWG7TK')?.request === 'taxiIn',
    },
    {
      title: 'Taxi in',
      text: (sim) =>
        `Taxi it to stand ${ac(sim, 'EWG7TK')?.assignedStand ?? '(see STD in the list)'}. Without "via" the crew takes the standard route (S westbound).`,
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK taxi to stand ${ac(sim, 'EWG7TK')?.assignedStand ?? ''}`.trim(),
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || a.routeDestination?.kind === 'stand' || a.phase === 'arrived';
      },
    },
    {
      title: 'Hand-off to Tower',
      text: 'DLH5AB reports at holding point A: hand it to Tower.',
      focus: 'DLH5AB',
      example: (sim) => `DLH5AB contact tower ${freq(sim, 'TWR')}`,
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.frequency === 'TWR';
      },
    },
    {
      title: 'Well done',
      text:
        'More in the help (F1): `hold short of taxiway N`, `give way to EWG7TK`, `standby`, `number 2 for pushback`. Practise with live traffic, or end with DISCONNECT.',
    },
  ],
};

// ---------------------------------------------------------------------- Delivery

const DELIVERY: Tutorial = {
  id: 'delivery',
  title: 'Delivery',
  summary: 'IFR clearance, readback check, start-up, hand-off to Ground, datalink (DCL).',
  position: 'DEL',
  steps: [
    {
      title: 'Welcome to Stuttgart Delivery',
      text:
        'You are Stuttgart Delivery (121.915). Departures get their IFR clearance and start-up from you, then you send them to Ground.',
    },
    {
      title: 'A clearance request',
      text: `DLH5AB on stand 14 will ask for its clearance. ${SELECT_HINT}`,
      focus: 'DLH5AB',
      enter: (sim) => departure(sim, 'DLH5AB', '14', 60),
      done: ({ sim, selected }) => selected === 'DLH5AB' && !!ac(sim, 'DLH5AB'),
    },
    {
      title: 'IFR clearance',
      text: (sim) => {
        const a = ac(sim, 'DLH5AB');
        return `Destination, SID (${a ? suggestedSid(sim, a) : 'see the list'}), initial climb and a free squawk. ${MENU_HINT}`;
      },
      focus: 'DLH5AB',
      example: (sim) => {
        const a = ac(sim, 'DLH5AB');
        return a ? `DLH5AB ${clearance(sim, a)}` : undefined;
      },
      done: ({ sim }) => !!ac(sim, 'DLH5AB')?.cleared,
    },
    {
      title: 'Check the readback',
      text: 'Check the squawk in the readback. If it is right: `readback correct`.',
      focus: 'DLH5AB',
      example: () => 'DLH5AB readback correct',
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.request === 'startup' || !!a.startupApproved;
      },
    },
    {
      title: 'Start-up',
      text: 'The crew asks for start-up at its TSAT. Approve it.',
      focus: 'DLH5AB',
      example: () => 'DLH5AB start-up approved',
      done: ({ sim }) => !!ac(sim, 'DLH5AB')?.startupApproved,
    },
    {
      title: 'Hand-off to Ground',
      text: 'The crew asks for the frequency: send it to Ground.',
      focus: 'DLH5AB',
      example: (sim) => `DLH5AB contact ground ${freq(sim, 'GND')}`,
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.frequency !== 'DEL';
      },
    },
    {
      title: 'Catch a readback error',
      text: 'EWG7TK on stand 12: clear it the same way - and listen closely to the readback.',
      focus: 'EWG7TK',
      enter: (sim) => {
        departure(sim, 'EWG7TK', '12', 60);
        sim.readbackErrors = 'next';
      },
      example: (sim) => {
        const a = ac(sim, 'EWG7TK');
        return a ? `EWG7TK ${clearance(sim, a)}` : undefined;
      },
      done: ({ sim }) => !!ac(sim, 'EWG7TK')?.cleared,
    },
    {
      title: 'Correct it',
      text: (sim) =>
        `Wrong squawk read back! Correct it with the right code (${ac(sim, 'EWG7TK')?.clearance?.squawk ?? ''}).`,
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK negative, squawk ${ac(sim, 'EWG7TK')?.clearance?.squawk ?? ''}`,
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || !a.readbackError;
      },
    },
    {
      title: 'Start-up and Ground',
      text: 'Finish EWG7TK as before: start-up, then Ground.',
      focus: 'EWG7TK',
      example: (sim) => {
        const a = ac(sim, 'EWG7TK');
        if (!a) return undefined;
        return a.startupApproved ? `EWG7TK contact ground ${freq(sim, 'GND')}` : 'EWG7TK start-up approved';
      },
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || a.frequency !== 'DEL';
      },
    },
    {
      title: 'Datalink clearance (DCL)',
      text: 'CFG53 asks by datalink (DCL in the list, no radio call). Aircraft menu: Send DCL, then the SID. No readback.',
      focus: 'CFG53',
      enter: (sim) => departure(sim, 'CFG53', '25', 60, { dcl: true }),
      done: ({ sim }) => !!ac(sim, 'CFG53')?.cleared,
    },
    {
      title: 'Well done',
      text:
        'Flights with a CTOT (slot) get it in the clearance: `..., CTOT 1435`. Practise with live traffic, or end with DISCONNECT.',
    },
  ],
};

// ---------------------------------------------------------------------- Tower

const TOWER: Tutorial = {
  id: 'tower',
  title: 'Tower',
  summary: 'Landing clearance, hand-off to Ground, line-up, take-off, hand-off to Radar.',
  position: 'TWR',
  steps: [
    {
      title: 'Welcome to Stuttgart Tower',
      text:
        'You are Stuttgart Tower (118.805): the runway is yours. Arrivals: landing clearance, then Ground. Departures: line-up, take-off, then Radar.',
    },
    {
      title: 'An arrival on final',
      text: `EWG7TK is on final and calls you. ${SELECT_HINT}`,
      focus: 'EWG7TK',
      enter: (sim) => {
        arrival(sim, 'EWG7TK', 7);
        // A departure starts taxiing meanwhile; Ground hands it to you later.
        departure(sim, 'DLH5AB', '14', 20);
      },
      done: ({ sim, selected }) => selected === 'EWG7TK' && !!ac(sim, 'EWG7TK'),
    },
    {
      title: 'Landing clearance',
      text: 'The runway is free: clear it to land. Without a clearance it goes around.',
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK ${wind(sim)}, runway 25, cleared to land`,
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || a.landingCleared || a.onGround;
      },
    },
    {
      title: 'Vacated: to Ground',
      text: 'When it reports "runway vacated": send it to Ground.',
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK contact ground ${freq(sim, 'GND')}`,
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || (a.onGround && a.frequency !== 'TWR');
      },
    },
    {
      title: 'Line up',
      text: `DLH5AB reports ready for departure: line it up (no take-off clearance yet). ${FASTER}`,
      focus: 'DLH5AB',
      example: () => 'DLH5AB line up and wait runway 25',
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || !!a.lineUpCleared || ['lineup', 'takeoff', 'climb'].includes(a.phase);
      },
    },
    {
      title: 'Take-off',
      text: 'Clear it for take-off. Later: keep 1-2 minutes between departures.',
      focus: 'DLH5AB',
      example: (sim) => `DLH5AB ${wind(sim)}, runway 25, cleared for take-off`,
      // The next step starts once it is airborne.
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || !a.onGround;
      },
    },
    {
      title: 'Hand-off to Radar',
      text: 'Airborne: send it to Radar before 4000 ft.',
      focus: 'DLH5AB',
      example: (sim) => {
        const a = ac(sim, 'DLH5AB');
        return `DLH5AB contact radar ${(a && departureFrequency(sim, a)) || freq(sim, 'APP')}`;
      },
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.frequency === 'APP';
      },
    },
    {
      title: 'Well done',
      text:
        'More in the help (F1): `go around`, `vacate via E`, `cross runway 25`, conditional line-up. Practise with live traffic, or end with DISCONNECT.',
    },
  ],
};

// ---------------------------------------------------------------------- Approach / Departure (radar)

/** An arrival handed over by Center: offered at its entry fix (from the north LBU, from the south-east TEKSI). */
function inbound(sim: Simulation, callsign: string, origin: string): void {
  if (sim.find(callsign)) return;
  const a = sim.traffic.spawnInbound({ airline: airline(callsign.slice(0, 3))!, type: aircraftType('A320'), origin });
  if (!a) return;
  a.callsign = callsign;
  a.plannedMedical = false;
}

/** Position relative to the final of runway 25 in NM: `along` < 0 before the threshold, `cross` > 0 north of it. */
function onFinal25(sim: Simulation, a: Aircraft): { along: number; cross: number } {
  const f = finalCoordinates(sim.airport.runwayEnd(TUTORIAL_RUNWAY)!, a.pos);
  return { along: f.along / M_PER_NM, cross: f.cross / M_PER_NM };
}

/** Release level of a departure's Center sector (feet), e.g. 14000 = FL140. */
const releaseFt = (a: Aircraft | undefined) => a?.radar?.sector?.releaseFt ?? 10000;

const APPROACH: Tutorial = {
  id: 'approach',
  title: 'Approach',
  summary: 'Radar: assume a track, identify, vectors to the ILS, hand-off to Tower; a departure to Center; an RNAV transition.',
  position: 'APP',
  steps: [
    {
      title: 'Welcome to Langen Radar',
      text:
        'You are Stuttgart Approach / Departure, callsign Langen Radar (125.050), on a radar scope: north is up, the line east of the field is the final of runway 25 with a tick every mile. Center hands you the arrivals, you bring them onto the ILS and pass them to Tower. Tower passes you the departures, you climb them and pass them to Center.',
    },
    {
      title: 'Center offers a track',
      text:
        'EWG7TK from Hamburg is coming in over LBU, north of the field. Center offers it to you: its tag flashes with H/O. Click the tag (or its menu: "Accept hand-off" / `ASSUME`) - only then does Center send the crew to your frequency.',
      focus: 'EWG7TK',
      enter: (sim) => {
        inbound(sim, 'EWG7TK', 'EDDH');
        // The departure of the later steps starts meanwhile (the simulator works Delivery, Ground and Tower).
        departure(sim, 'DLH5AB', '14', 20);
      },
      action: 'assume',
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || !offered(a);
      },
    },
    {
      title: 'Identify and descend',
      text: (sim) =>
        `It calls with its level and the ATIS letter. Answer with \`identified\` and a descent: 5000 feet is below the transition level, so give the QNH (${sim.atis.qnh}). ${MENU_HINT}`,
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK identified, descend altitude 5000 feet, QNH ${sim.atis.qnh}`,
      done: ({ sim }) => {
        const r = ac(sim, 'EWG7TK')?.radar;
        return !r || (!!r.identified && r.clearedFt <= 5000);
      },
    },
    {
      title: 'Downwind',
      text:
        'Runway 25 lands towards the west, so arrivals from the north fly a downwind to the east, parallel to the final, and slow down. A heading takes it off its STAR: from now on it flies only your vectors.',
      focus: 'EWG7TK',
      example: () => 'EWG7TK turn left heading 070, reduce speed 220 knots',
      done: ({ sim }) => {
        const r = ac(sim, 'EWG7TK')?.radar;
        return !r || r.heading === 70 || !!r.approach;
      },
    },
    {
      title: 'Base',
      text: `About 16 NM east of the threshold (count the ticks on the centre line) turn it south onto base and slow it to 180 knots. ${FASTER}`,
      focus: 'EWG7TK',
      wait: (sim) => {
        const a = ac(sim, 'EWG7TK');
        if (!a) return undefined;
        const d = -onFinal25(sim, a).along;
        return d < 16 ? `Wait: EWG7TK is ${Math.max(0, Math.round(d))} NM east of the threshold - turn at 16 NM.` : undefined;
      },
      example: () => 'EWG7TK turn right heading 160, reduce speed 180 knots',
      done: ({ sim }) => {
        const r = ac(sim, 'EWG7TK')?.radar;
        return !r || r.heading === 160 || !!r.approach;
      },
    },
    {
      title: 'Intercept and clear for the ILS',
      text:
        'About 3 NM before the centre line: an intercept heading 30 degrees to the final (220 for runway 25) together with the approach clearance. The crew turns onto the localizer by itself and follows the glide path down from 5000 feet - intercept at 12 NM or more.',
      focus: 'EWG7TK',
      wait: (sim) => {
        const a = ac(sim, 'EWG7TK');
        if (!a) return undefined;
        const c = onFinal25(sim, a).cross;
        return c > 3.5 ? `Wait: EWG7TK is ${Math.round(c)} NM north of the centre line - turn at 3 NM.` : undefined;
      },
      example: () => 'EWG7TK turn right heading 220, cleared ILS approach runway 25',
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || !!a.radar?.approach || a.frequency !== 'APP';
      },
    },
    {
      title: 'Hand-over to Tower',
      text:
        'Cleared for the approach, the arrival belongs to Tower next. Start the hand-over of the track like in EuroScope: tag or aircraft menu, "Hand-over to Tower" (`XFER`). Tower accepts after a few seconds (tag `>TWR`, then `TWR`).',
      focus: 'EWG7TK',
      action: 'transfer',
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || a.radar?.transfer?.acceptedAt !== undefined || a.frequency !== 'APP';
      },
    },
    {
      title: 'Contact Tower',
      text: 'Accepted. Once the crew is established on the localizer (the tag shows it on the centre line), send it to Tower - Tower gives it the landing clearance.',
      focus: 'EWG7TK',
      wait: (sim) => {
        const a = ac(sim, 'EWG7TK');
        return a && !a.radar?.established && a.phase !== 'approach' ? 'Wait until EWG7TK is established on the localizer.' : undefined;
      },
      example: (sim) => `EWG7TK contact Stuttgart Tower ${freq(sim, 'TWR')}`,
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || a.frequency !== 'APP';
      },
    },
    {
      title: 'A departure calls',
      text: (sim) =>
        `DLH5AB takes off on runway 25 and calls you climbing 5000 feet on its SID. Identify it and climb it to the release level of its Center sector (${releaseFt(ac(sim, 'DLH5AB')) / 100 >= 100 ? 'FL' + releaseFt(ac(sim, 'DLH5AB')) / 100 : releaseFt(ac(sim, 'DLH5AB')) + ' ft'} for its exit fix). ${FASTER}`,
      focus: 'DLH5AB',
      example: (sim) => {
        const ft = releaseFt(ac(sim, 'DLH5AB'));
        return `DLH5AB identified, climb ${ft >= sim.transitionLevel(sim.atis.qnh) * 100 ? `flight level ${ft / 100}` : `altitude ${ft} feet`}`;
      },
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || (!!a.radar?.identified && a.radar.clearedFt === releaseFt(a)) || a.frequency === 'CTR';
      },
    },
    {
      title: 'Hand-over to Center',
      text: 'It flies its SID towards the exit fix. Before it leaves your airspace, start the hand-over of the track to Center (tag or menu, `XFER`).',
      focus: 'DLH5AB',
      action: 'transfer',
      wait: (sim) => {
        const a = ac(sim, 'DLH5AB');
        return a && a.altitudeFt < 8000 ? 'Wait until it passes 8000 feet - it is still close to the field.' : undefined;
      },
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.radar?.transfer?.acceptedAt !== undefined || a.frequency === 'CTR';
      },
    },
    {
      title: 'Contact Center',
      text: 'Center accepted: send it on. Each sector has its own frequency - the tag and the OUTBOUND list show the next one.',
      focus: 'DLH5AB',
      example: (sim) => `DLH5AB contact Langen Radar ${ac(sim, 'DLH5AB')?.radar?.sector?.frequency ?? ''}`.trim(),
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.frequency === 'CTR' || !!a.radar?.toCenter;
      },
    },
    {
      title: 'The quick way: a transition',
      text:
        'CFG1753 from Antalya comes in over TEKSI, east of the field. Assume its track as before. With little traffic you do not need vectors: an approach clearance on the STAR lets the crew fly the published RNAV transition (downwind, base, final) by itself.',
      focus: 'CFG1753',
      enter: (sim) => inbound(sim, 'CFG1753', 'LTAI'),
      action: 'assume',
      done: ({ sim }) => {
        const a = ac(sim, 'CFG1753');
        return !a || !offered(a);
      },
    },
    {
      title: 'Cleared via the transition',
      text: 'Identify it, descend it and clear it for the ILS: it flies the TEKSI 25 transition to the final on its own. Show its route with "Show route" (`ROUTE`).',
      focus: 'CFG1753',
      example: () => 'CFG1753 identified, descend altitude 5000 feet, cleared ILS approach runway 25',
      done: ({ sim }) => {
        const a = ac(sim, 'CFG1753');
        return !a || !!a.radar?.approach;
      },
    },
    {
      title: 'Well done',
      text:
        'Hand CFG1753 to Tower once it is on final. Keep 6 NM between arrivals on final (SOP), use speeds to fine-tune the sequence, `hold over LBU` when it gets busy, `proceed direct STG` to shorten. STCA (red tags) warns of conflicts, MSAW of an aircraft below the minimum vectoring altitude. Practise with live traffic, or end with DISCONNECT.',
    },
  ],
};

export const TUTORIALS: Tutorial[] = [DELIVERY, GROUND, TOWER, APPROACH];

export function tutorialById(id: string | undefined): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
