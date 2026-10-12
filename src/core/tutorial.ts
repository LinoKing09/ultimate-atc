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

const SELECT_HINT = 'Select it: click (on the iPad: tap) the aircraft on the scope or its row in the list.';
const FASTER = 'Waiting? 2x or 4x in the toolbar speeds the simulation up.';
const MENU_HINT = 'Instead of typing you can use the aircraft menu (right-click; on the iPad tap the selected aircraft again) or the quick-action bar in mobile mode.';

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
        'You are Stuttgart Ground (118.605): you own the aprons and taxiways, Tower owns the runway. Departures call you for pushback and taxi; you send them to a holding point and hand them to Tower. Arrivals call you after they have vacated the runway; you taxi them to their stand. ' +
        'Runway 25 is in use. The scope shows the airport like the aerodrome chart, the lists on top show your departures and arrivals. Press Next when you are ready.',
    },
    {
      title: 'A departure calls',
      text: `Lufthansa 5AB (DLH5AB) on stand 14 will call you for pushback in a moment - its row in the departure list starts to flash. ${SELECT_HINT} A selected aircraft does not need its callsign typed in front of an instruction.`,
      focus: 'DLH5AB',
      enter: (sim) => departure(sim, 'DLH5AB', '14', 20),
      done: ({ sim, selected }) => selected === 'DLH5AB' && !!ac(sim, 'DLH5AB'),
    },
    {
      title: 'Pushback',
      text: `Wait for the call ("request pushback"), then approve it. The tug pushes the aircraft back onto taxilane M; "facing east" says where the nose points afterwards (towards runway 25's full-length entry A). ${MENU_HINT}`,
      focus: 'DLH5AB',
      example: () => 'DLH5AB pushback approved, facing east',
      // The arrival of the later step is already on its way.
      enter: (sim) => arrival(sim, 'EWG7TK', 9),
      done: ({ sim }) => !!ac(sim, 'DLH5AB') && ac(sim, 'DLH5AB')!.phase !== 'parked',
    },
    {
      title: 'Taxi to the holding point',
      text:
        'After the pushback the crew starts the engines and reports "ready for taxi". Give it a route: the clearance limit (holding point A, the full length of runway 25) and the taxiways in order - M along the apron, H down to N, then N eastbound (the standard flow for departures). ' +
        'The live preview in the command line shows the route in green before you send it; red means the crew would not understand it.',
      focus: 'DLH5AB',
      example: () => 'DLH5AB taxi to holding point A via M, H, N',
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !!a && a.phase === 'taxi' && a.routeDestination?.kind === 'holdingPoint';
      },
    },
    {
      title: 'An arrival is landing',
      text: `While DLH5AB taxis, Eurowings 7TK (EWG7TK) lands on runway 25. Tower hands it to you once it has vacated: it stops behind the holding position of its exit and calls you. Watch it on final (the extended centreline east of the runway) and wait for the call. ${FASTER}`,
      focus: 'EWG7TK',
      enter: (sim) => arrival(sim, 'EWG7TK', 5),
      done: ({ sim }) => ac(sim, 'EWG7TK')?.request === 'taxiIn',
    },
    {
      title: 'Taxi in',
      text: (sim) =>
        `EWG7TK has vacated and asks for taxi. Its stand is ${ac(sim, 'EWG7TK')?.assignedStand ?? 'shown in the arrival list (STD)'}. Without "via" the crew takes the standard route itself - S westbound for arrivals, so it never meets the departures on N. Give a route with "via" when you want a different one.`,
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK taxi to stand ${ac(sim, 'EWG7TK')?.assignedStand ?? ''}`.trim(),
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || a.routeDestination?.kind === 'stand' || a.phase === 'arrived';
      },
    },
    {
      title: 'Hand-off to Tower',
      text: 'DLH5AB reports at (or shortly before) holding point A. The runway is Tower\'s: hand the aircraft over with the Tower frequency. Tower lines it up and clears it for take-off.',
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
        'That is the core of the Ground job. More tools for busy traffic (all in the help, F1): `hold short of taxiway N`, `give way to EWG7TK`, conditional clearances (`behind the A320 passing left to right, ...`), `standby` and `number 2 for pushback`, the follow-me car, and the CATC alert for head-on routes. ' +
        'Continue with live traffic to practise, or end with DISCONNECT for the debriefing.',
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
        'You are Stuttgart Delivery (121.915). Departures call you about 10 minutes before off-block for their IFR clearance: destination (clearance limit), departure route (SID), initial climb and squawk. Then they ask for start-up and you send them to Ground for pushback. ' +
        'Ground and Tower are run by the simulator. Press Next when you are ready.',
    },
    {
      title: 'A clearance request',
      text: `Lufthansa 5AB (DLH5AB) on stand 14 asks for its clearance in a moment. ${SELECT_HINT} The departure list shows its destination (ADES) and the SID of its flight plan.`,
      focus: 'DLH5AB',
      enter: (sim) => departure(sim, 'DLH5AB', '14', 60),
      done: ({ sim, selected }) => selected === 'DLH5AB' && !!ac(sim, 'DLH5AB'),
    },
    {
      title: 'IFR clearance',
      text: (sim) => {
        const a = ac(sim, 'DLH5AB');
        return `Clear it in the German form: clearance limit, SID for runway 25 that starts at the first fix of its route (${a ? suggestedSid(sim, a) : 'see the list'}), flight planned route, the initial climb (${initialClimbFt(sim)} feet) and a free squawk. ${MENU_HINT} (Menu: IFR clearance - it fills in everything.)`;
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
      text: 'The crew reads the clearance back. Always check the squawk: if it is right, `readback correct` (optional, but good practice). Then the crew reports ready for start-up.',
      focus: 'DLH5AB',
      example: () => 'DLH5AB readback correct',
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.request === 'startup' || !!a.startupApproved;
      },
    },
    {
      title: 'Start-up',
      text: 'With A-CDM (on at Stuttgart) the crew asks for start-up at its TSAT (target start-up approval time, column TSAT). Approve it.',
      focus: 'DLH5AB',
      example: () => 'DLH5AB start-up approved',
      done: ({ sim }) => !!ac(sim, 'DLH5AB')?.startupApproved,
    },
    {
      title: 'Hand-off to Ground',
      text: 'The crew asks for the frequency for pushback. Send it to Ground - Ground (the simulator) does the pushback and taxi.',
      focus: 'DLH5AB',
      example: (sim) => `DLH5AB contact ground ${freq(sim, 'GND')}`,
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || a.frequency !== 'DEL';
      },
    },
    {
      title: 'Catch a readback error',
      text: 'Eurowings 7TK (EWG7TK) on stand 12 asks for its clearance. Clear it like DLH5AB - and listen carefully to the readback this time.',
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
        `The crew read back the wrong squawk (two digits swapped) - a classic. Correct it with "negative" and the right code (${ac(sim, 'EWG7TK')?.clearance?.squawk ?? ''}). "Readback correct" would let it set the wrong code. (Menu: Squawk - Negative, squawk ...)`,
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK negative, squawk ${ac(sim, 'EWG7TK')?.clearance?.squawk ?? ''}`,
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || !a.readbackError;
      },
    },
    {
      title: 'Start-up and Ground',
      text: 'Now finish EWG7TK as before: approve the start-up when it asks, then send it to Ground.',
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
      text: 'Condor 53 (CFG53) on stand 25 requests its clearance by datalink: no radio call, the request shows in the departure list (DCL). Open its aircraft menu and choose Send DCL (datalink), then the SID - the crew confirms with WILCO, there is no readback to check.',
      focus: 'CFG53',
      enter: (sim) => departure(sim, 'CFG53', '25', 60, { dcl: true }),
      done: ({ sim }) => !!ac(sim, 'CFG53')?.cleared,
    },
    {
      title: 'Well done',
      text:
        'CFG53 calls for start-up by voice like the others - approve it and send it to Ground. Also good to know: some flights have a CTOT (ATFM slot); add it to the clearance (`..., CTOT 1435`) - they must be airborne within -5 / +10 minutes. ' +
        'Continue with live traffic to practise, or end with DISCONNECT for the debriefing.',
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
        'You are Stuttgart Tower (118.805): you own the runway. Arrivals come from Approach on final; you clear them to land and send them to Ground after vacating. Departures come from Ground at the holding point; you line them up, clear them for take-off and send them to Radar. ' +
        'Nobody enters the runway without your clearance. Delivery and Ground are run by the simulator. Press Next when you are ready.',
    },
    {
      title: 'An arrival on final',
      text: `Eurowings 7TK (EWG7TK) is on final for runway 25 and calls you. ${SELECT_HINT} Airborne aircraft show altitude (hundreds of feet) and speed in the tag.`,
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
      text: 'The runway is free: clear it to land, with the wind (information only). Without a landing clearance the crew asks again at one mile and goes around just before the threshold.',
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK ${wind(sim)}, runway 25, cleared to land`,
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || a.landingCleared || a.onGround;
      },
    },
    {
      title: 'Vacated: to Ground',
      text: 'After landing the crew vacates via one of the exits and reports "runway vacated". Send it to Ground, who taxis it to the stand.',
      focus: 'EWG7TK',
      example: (sim) => `EWG7TK contact ground ${freq(sim, 'GND')}`,
      done: ({ sim }) => {
        const a = ac(sim, 'EWG7TK');
        return !a || (a.onGround && a.frequency !== 'TWR');
      },
    },
    {
      title: 'Line up',
      text: `Lufthansa 5AB (DLH5AB) taxis to holding point A and reports ready for departure (Ground hands it to you on the way). Nobody is on final: line it up. "Line up and wait" is not a take-off clearance - the aircraft stops on the runway. ${FASTER}`,
      focus: 'DLH5AB',
      example: () => 'DLH5AB line up and wait runway 25',
      done: ({ sim }) => {
        const a = ac(sim, 'DLH5AB');
        return !a || !!a.lineUpCleared || ['lineup', 'takeoff', 'climb'].includes(a.phase);
      },
    },
    {
      title: 'Take-off',
      text: 'Clear it for take-off and watch it roll. Between two departures keep the spacing: 2 minutes behind a heavy or on the same SID, 1 minute on diverging SIDs (the take-off menu counts it down).',
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
      text: 'Once airborne, send it to Langen Radar. Do it early: at 4000 ft it leaves your airspace, and without a frequency change that costs points.',
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
        'That is the Tower routine. More tools (help, F1): `behind landing EWG7TK, line up and wait behind`, `cleared for immediate take-off`, `go around`, `vacate via E`, speed control on final, runway crossings (`cross runway 25`) and COORD to ask Approach for gaps. ' +
        'Continue with live traffic to practise, or end with DISCONNECT for the debriefing.',
    },
  ],
};

export const TUTORIALS: Tutorial[] = [DELIVERY, GROUND, TOWER];

export function tutorialById(id: string | undefined): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
