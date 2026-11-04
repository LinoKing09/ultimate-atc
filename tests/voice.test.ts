import { describe, expect, it } from 'vitest';
import { normalVoice, pilotVoiceStyle } from '../src/ui/voice';

describe('pilot voices', () => {
  it('give every pilot a pitch and rate within a natural range', () => {
    for (let i = 0; i < 2000; i++) {
      const s = pilotVoiceStyle(`DLH${i}${String.fromCharCode(65 + (i % 26))}`);
      expect(s.pitch).toBeGreaterThanOrEqual(0.92);
      expect(s.pitch).toBeLessThanOrEqual(1.08);
      expect(s.rate).toBeGreaterThanOrEqual(1.05);
      expect(s.rate).toBeLessThanOrEqual(1.29);
    }
  });

  it('leave out singing, laughing and other effect voices, also with translated names', () => {
    const v = (name: string, voiceURI: string) => normalVoice({ name, voiceURI });
    expect(v('Samantha', 'com.apple.voice.compact.en-US.Samantha')).toBe(true);
    expect(v('Daniel', 'com.apple.ttsbundle.Daniel-compact')).toBe(true);
    expect(v('Alex', 'com.apple.speech.synthesis.voice.Alex')).toBe(true);
    expect(v('Google US English', 'Google US English')).toBe(true);
    expect(v('Microsoft David - English (United States)', 'Microsoft David - English (United States)')).toBe(true);
    // Translated names (German iPad), recognised by the identifier.
    expect(v('Glocken', 'com.apple.speech.synthesis.voice.Bells')).toBe(false);
    expect(v('Hysterisch', 'com.apple.speech.synthesis.voice.Hysterical')).toBe(false);
    expect(v('Gute Nachrichten', 'com.apple.speech.synthesis.voice.GoodNews')).toBe(false);
    // The Eloquence voices are normal voices (on many iPads the only English ones installed): kept.
    expect(v('Oma', 'com.apple.eloquence.en-US.Grandma')).toBe(true);
    expect(v('Eddy', 'com.apple.eloquence.en-US.Eddy')).toBe(true);
    expect(v('Fred', 'com.apple.speech.synthesis.voice.Fred')).toBe(true);
    // And by the name where the identifier says nothing.
    expect(v('Bells', 'Bells')).toBe(false);
    expect(v('Good News', 'x')).toBe(false);
    expect(v('Cellos', 'x')).toBe(false);
    expect(v('Thomas', 'com.apple.voice.compact.fr-FR.Thomas')).toBe(true);
    expect(v('Orgel', 'x')).toBe(false);
  });
});
