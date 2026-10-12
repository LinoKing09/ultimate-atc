import { AIRLINES } from '../data/airlines';
import { destinationName } from '../data/destinations';
import type { Aircraft } from './aircraft';
import type { AirportData, StationType } from './airport/types';
import { allocateSquawk, initialClimbFt, suggestedSid } from './delivery';
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

export type TutorialId = 'delivery' | 'ground' | 'tower';

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

/** "cleared to Frankfurt, KRH4B departure, flight planned route, climb via SID to altitude 5000 feet, squawk 2101" */
function clearance(sim: Simulation, a: Aircraft): string {
  return `cleared to ${destinationName(a.flightPlan.destination)}, ${suggestedSid(sim, a)} departure, flight planned route, climb via SID to altitude ${initialClimbFt(sim)} feet, squawk ${a.clearance?.squawk || allocateSquawk(sim)}`;
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
      example: (sim) => `DLH5AB contact radar ${freq(sim, 'APP')}`,
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

export const TUTORIALS: Tutorial[] = [DELIVERY, GROUND, TOWER];

export function tutorialById(id: string | undefined): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
