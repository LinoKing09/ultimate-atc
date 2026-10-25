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
  /** Session start: an empty airport, or taking over traffic in progress from the controller before you. */
  start: 'empty' | 'handover';
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
  /** Data tags: 'compact' = only the callsign when zoomed out (full when selected), 'full' = always the full tag. */
  tagDetail: 'compact' | 'full';
  /** Speaking rate of the pilot voices (1 = normal). */
  ttsRate: number;
  /** Language/accent the speech recogniser listens for. */
  voiceLang: string;
  /**
   * Look of the scope: 'phx-night' / 'phx-day' as the VATSIM Germany EuroScope ground radar (modelled on
   * the DFS PHOENIX tower display: departures blue, arrivals yellow, PHX ground states), 'classic' the
   * earlier Ultimate ATC colours with the EuroScope ground states.
   */
  scopeStyle: 'phx-night' | 'phx-day' | 'classic';
}

const KEY = 'ultimate-atc.settings.v1';

const DEFAULTS: Settings = {
  airport: 'EDDS',
  position: 'GND',
  density: 'medium',
  eventLevel: DEFAULT_EVENT_LEVEL,
  start: 'empty',
  tts: false,
  ttsVolume: 1,
  voiceAutoSend: true,
  showRoutes: true,
  runwayAligned: true,
  device: 'pc',
  uiScale: 1,
  tagScale: 1,
  tagDetail: 'compact',
  ttsRate: 1,
  voiceLang: 'en-US',
  scopeStyle: 'phx-night',
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
