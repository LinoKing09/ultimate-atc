import type { AirportData } from '../../core/airport/types';
import { EDDN } from './eddn';
import { EDDS } from './edds';
import { EDJA } from './edja';
import { EDXW } from './edxw';

/** Airports with complete data, selectable in the Connect dialog. */
export const AIRPORTS: AirportData[] = [EDDS, EDDN, EDJA, EDXW];
