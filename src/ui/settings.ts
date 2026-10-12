import { DEFAULT_EVENT_LEVEL, clampLevel, type Density } from '../core/levels';

/**
 * Per-browser user preferences. Stored in localStorage when available; every
 * access is guarded because storage can be unavailable (private mode, blocked
 * site data) and the app must work without it.
 */
export interface Settings {
  airport: string;
  position: string;
  /** Positions staffed together (combined positions). */
  positions?: string[];
  density: Density;
  /** Random special events: step 0-4 (never ... often), see core/levels.ts. */
  eventLevel: number;
  tts: boolean;
  ttsVolume: number;
  voiceAutoSend: boolean;
  showRoutes: boolean;
  /** Scope rotated so that the runway is horizontal. */
  runwayAligned: boolean;
  /** Layout optimised for a phone/tablet (touch) or a PC (mouse and keyboard). */
  device: 'mobile' | 'pc';
  /** Size of the user interface text and buttons (1 = 100 %). */
  uiScale: number;
  /** Size of the data tags on the scope (1 = 100 %). */
  tagScale: number;
  /** Speaking rate of the pilot voices (1 = normal). */
  ttsRate: number;
  /** Language/accent the speech recogniser listens for. */
  voiceLang: string;
}

const KEY = 'ultimate-atc.settings.v1';

const DEFAULTS: Settings = {
  airport: 'EDDS',
  position: 'GND',
  density: 'medium',
  eventLevel: DEFAULT_EVENT_LEVEL,
  tts: false,
  ttsVolume: 1,
  voiceAutoSend: true,
  showRoutes: true,
  runwayAligned: true,
  device: 'pc',
  uiScale: 1,
  tagScale: 1,
  ttsRate: 1,
  voiceLang: 'en-US',
};

/** Default device mode: touch screens without a fine pointer start in mobile mode. */
function detectDevice(): Settings['device'] {
  try {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches ? 'mobile' : 'pc';
  } catch {
    return 'pc';
  }
}

export function defaultSettings(): Settings {
  return { ...DEFAULTS, device: detectDevice() };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Settings> & { events?: boolean };
      // Before 0.9 special events were on/off.
      if (stored.eventLevel === undefined && typeof stored.events === 'boolean') stored.eventLevel = stored.events ? DEFAULT_EVENT_LEVEL : 0;
      delete stored.events;
      const s = { ...defaultSettings(), ...stored };
      s.eventLevel = clampLevel(s.eventLevel);
      return s;
    }
  } catch {
    /* storage unavailable */
  }
  return defaultSettings();
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
