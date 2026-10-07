import type { Aircraft } from '../core/aircraft';

/** Short status code shown in tags and lists (EuroScope ground-state style). */
export function statusCode(ac: Aircraft): string {
  switch (ac.phase) {
    case 'parked':
      return ac.request ? 'RQST' : '----';
    case 'pushback':
      return 'PUSH';
    case 'startup':
      return 'ST-UP';
    case 'taxi':
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
      return 'TXIN';
    case 'handoff':
      return 'RDY';
    case 'crossing':
      return 'XRWY';
    case 'blocked':
      return 'BLKD';
    case 'route':
      return 'RTE?';
    default:
      return '';
  }
}
