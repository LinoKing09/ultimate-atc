/**
 * Airport and ATC systems the controller works with. Each can be switched
 * off in the systems window (maintenance, failure training). The selection
 * follows what real European airports of Stuttgart's size use:
 *
 * - A-SMGCS (Advanced Surface Movement Guidance and Control System), with the
 *   services defined by EUROCONTROL: surveillance (surface movement radar +
 *   multilateration), runway monitoring and conflict alerting (RMCA),
 *   conflicting ATC clearances (CATC) and the routing service.
 * - A-CDM (Airport Collaborative Decision Making) with its pre-departure
 *   sequencer: TOBT, TSAT, and the CTOTs of the Network Manager. Stuttgart has
 *   been a full A-CDM airport since November 2014.
 * - DCL: departure clearance by datalink instead of voice.
 */
export type SystemId = 'surveillance' | 'rmca' | 'catc' | 'routing' | 'acdm' | 'dcl';

export interface SystemInfo {
  id: SystemId;
  name: string;
  group: string;
  /** What the system does for the controller. */
  description: string;
  /** What changes when it is off. */
  whenOff: string;
}

export const SYSTEMS: SystemInfo[] = [
  {
    id: 'surveillance',
    name: 'Surveillance (SMR + MLAT)',
    group: 'A-SMGCS',
    description: 'Surface movement radar and multilateration: every aircraft on the scope with its identity (data tag).',
    whenOff: 'Targets lose their identity: no data tags on the scope. Work with the lists, the out-of-the-window view and position reports.',
  },
  {
    id: 'rmca',
    name: 'Runway monitoring and conflict alerting (RMCA)',
    group: 'A-SMGCS',
    description: 'Alerts when an aircraft is about to enter or cross the runway while it is occupied or an arrival is close.',
    whenOff: 'No runway alerts - only the incursion itself is detected.',
  },
  {
    id: 'catc',
    name: 'Conflicting ATC clearances (CATC)',
    group: 'A-SMGCS',
    description: 'Checks taxi routes against each other: warns before you transmit a route that meets other traffic head-on, and alerts on head-on conflicts between cleared routes.',
    whenOff: 'No route conflict warnings.',
  },
  {
    id: 'routing',
    name: 'Routing service',
    group: 'A-SMGCS',
    description: 'Proposes taxi routes (following the standard taxi flows) in the Taxi to menu and the quick-action bar, and the Resolve conflict menu.',
    whenOff: 'Menus offer destinations without a proposed route; you plan the route yourself.',
  },
  {
    id: 'acdm',
    name: 'A-CDM / pre-departure sequencer',
    group: 'A-CDM',
    description: 'TOBT (target off-block time) from the airlines, TSAT (target start-up approval time) from the sequencer, CTOTs from the Network Manager. Pilots ask for start-up at their TSAT.',
    whenOff: 'No TSAT: pilots ask for start-up when they are ready (first come, first served). CTOTs still apply.',
  },
  {
    id: 'dcl',
    name: 'Departure clearance by datalink (DCL)',
    group: 'Datalink',
    description: 'Crews of equipped aircraft request their IFR clearance by datalink; you send it from the list without a voice transmission. Start-up is still requested by voice.',
    whenOff: 'All clearances by voice.',
  },
];

export type SystemStates = Record<SystemId, boolean>;

export function defaultSystemStates(available?: SystemId[]): SystemStates {
  const all = Object.fromEntries(SYSTEMS.map((s) => [s.id, true])) as SystemStates;
  if (available) for (const s of SYSTEMS) all[s.id] = available.includes(s.id);
  return all;
}
