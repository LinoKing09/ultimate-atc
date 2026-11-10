import { describe, expect, it } from 'vitest';
import { realLabel } from '../src/ui/realLabels';

describe('Real menu style', () => {
  it('shortens the menu labels like EuroScope and leaves unknown ones alone', () => {
    expect(realLabel('Line up and wait runway 25')).toBe('LUAW 25');
    expect(realLabel('Cleared for take-off runway 25')).toBe('T/O 25');
    expect(realLabel('Cleared to land runway 07')).toBe('LAND 07');
    expect(realLabel('Contact Ground 118.605')).toBe('GND 118.605');
    expect(realLabel('Contact Langen Radar 125.050')).toBe('FREQ 125.050');
    expect(realLabel('Push and start approved')).toBe('PUSH+ST');
    expect(realLabel('Facing east')).toBe('FAC E');
    expect(realLabel('Stand 14')).toBe('STD 14');
    expect(realLabel('ETASA4B')).toBe('ETASA4B');
  });
});
