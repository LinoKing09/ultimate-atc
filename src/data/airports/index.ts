import type { AirportData } from '../../core/airport/types';
import { EDDS } from './edds';
import { EDJA } from './edja';

/** Airports with complete data, selectable in the Connect dialog. */
export const AIRPORTS: AirportData[] = [EDDS, EDJA];
