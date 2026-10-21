import type { Aircraft } from '../core/aircraft';

/**
 * Ground states: 'euroscope' uses the EuroScope names (ST-UP, PUSH, TAXI, DEPA), 'phx' those of the DFS
 * PHOENIX tower display as used by VATSIM Germany (SUG start-up given, PBG pushback given, TXG taxi out,
 * TX taxi in, ALU line-up, DEP departed, ONB on blocks).
 */
export type StatusStyle = 'euroscope' | 'phx';

/** PHX names of the EuroScope-style codes (the others are the same in both). */
const PHX_STATES: Record<string, string> = { 'ST-UP': 'SUG', PUSH: 'PBG', 'L/U': 'ALU', DEPA: 'DEP', PARK: 'ONB' };

/** Short status code shown in tags and lists (ground state). */
export function statusCode(ac: Aircraft, style: StatusStyle = 'euroscope'): string {
  const code = euroscopeStatus(ac);
  if (style !== 'phx') return code;
  // Taxi out (departures) and taxi in (arrivals) are separate states in PHX.
  if (code === 'TAXI') return ac.category === 'arrival' ? 'TX' : 'TXG';
  return PHX_STATES[code] ?? code;
}

function euroscopeStatus(ac: Aircraft): string {
  switch (ac.phase) {
    case 'parked':
      if (ac.startupApproved) return 'ST-UP';
      if (ac.request) return 'RQST';
      return ac.cleared ? 'CLRD' : '----';
    case 'pushback':
      return 'PUSH';
    case 'startup':
      return 'ST-UP';
    case 'taxi':
      if (ac.deicing === 'inProgress') return 'DEICE';
      if (ac.stoppedAt?.kind === 'runway') return 'HS-R';
      if (ac.stoppedAt?.kind === 'destination' && ac.category === 'arrival') return 'VACD';
      if (ac.holdPosition || ac.speed < 0.2) return ac.holdPosition ? 'HOLD' : 'TAXI';
      return 'TAXI';
    case 'holding':
      return 'H/P';
    case 'lineup':
      return 'L/U';
    case 'takeoff':
    case 'climb':
      return 'DEPA';
    case 'approach':
      return 'APP';
    case 'landing':
      return 'LAND';
    case 'vacating':
      return 'VAC';
    case 'arrived':
      return 'PARK';
    case 'goAround':
      return 'G/A';
    case 'gone':
      return '';
  }
}

/** Short description of where the aircraft is cleared to. */
export function clearedTo(ac: Aircraft): string {
  const d = ac.pendingTaxi?.destination ?? ac.routeDestination;
  if (d) {
    if (d.kind === 'holdingPoint') return d.name;
    if (d.kind === 'runway') return `R${d.runway}`;
    if (d.kind === 'holdShort') return `HS ${d.name}`;
    if (d.kind === 'deicing') return d.pad ?? 'DEICE';
    return `S${d.stand}`;
  }
  return '';
}

export function requestLabel(ac: Aircraft): string {
  switch (ac.request) {
    case 'pushback':
      return 'PUSH';
    case 'taxi':
      return 'TAXI';
    case 'taxiIn':
      return ac.wantsFollowMe ? 'FLWM' : 'TXIN';
    case 'handoff':
    case 'departure':
      return 'RDY';
    case 'landing':
      return 'LDG';
    case 'vacated':
      return 'VACD';
    case 'radar':
      return 'RDR';
    case 'crossing':
      return 'XRWY';
    case 'blocked':
      return 'BLKD';
    case 'route':
      return 'RTE?';
    case 'clearance':
      return ac.dcl ? 'DCL' : 'CLR';
    case 'startup':
      return 'STUP';
    case 'frequency':
      return 'FREQ';
    case 'tow':
      return 'TOW';
    default:
      return '';
  }
}
