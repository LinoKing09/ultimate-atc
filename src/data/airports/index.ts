import type { AirportData } from '../../core/airport/types';
import { EDDK } from './eddk';
import { EDDM } from './eddm';
import { EGKK } from './egkk';
import { EDDN } from './eddn';
import { EDDP } from './eddp';
import { EDDS } from './edds';
import { EDDW } from './eddw';
import { EDJA } from './edja';
import { EDXW } from './edxw';
import { KSAN } from './ksan';
import { NZWN } from './nzwn';
import { SEQM } from './seqm';
import { SLLP } from './sllp';
import { TNCM } from './tncm';
import { VTSP } from './vtsp';

/** Airports with complete data, selectable in the Connect dialog. */
export const AIRPORTS: AirportData[] = [EDDS, EDDN, EDJA, EDXW, EDDW, EDDK, EDDP, EDDM, KSAN, VTSP, NZWN, SEQM, TNCM, SLLP, EGKK];
