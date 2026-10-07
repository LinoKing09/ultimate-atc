/**
 * Per-browser user preferences. Stored in localStorage when available; every
 * access is guarded because storage can be unavailable (private mode, blocked
 * site data) and the app must work without it.
 */
export interface Settings {
  airport: string;
  position: string;
  runway: string;
  density: 'light' | 'medium' | 'heavy';
  tts: boolean;
  ttsVolume: number;
  voiceAutoSend: boolean;
  showRoutes: boolean;
}

const KEY = 'ultimate-atc.settings.v1';

const DEFAULTS: Settings = {
  airport: 'EDDS',
  position: 'GND',
  runway: '25',
  density: 'medium',
  tts: false,
  ttsVolume: 1,
  voiceAutoSend: true,
  showRoutes: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
