import type { CorrectionStore } from '../core/phraseology/corrections';
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
  /** Quiet radio noise under the pilot voices. */
  radioNoise: boolean;
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
  /** Language/accent the speech recogniser listens for (the browser's). */
  voiceLang: string;
  /** Speech recogniser: the own one (Vosk, in the browser, limited to the radio vocabulary) or the browser's. */
  voiceEngine: 'vosk' | 'browser';
  /** Model of the own speech recogniser: small (about 40 MB, default) or large (about 128 MB, slower). */
  voiceModel: 'small' | 'large';
  /**
   * Look of the scope: 'phx-night' / 'phx-day' as the VATSIM Germany EuroScope ground radar (modelled on
   * the DFS PHOENIX tower display: departures blue, arrivals yellow, PHX ground states), 'modern' (slate-grey
   * A-SMGCS), 'phosphor' (green radar tube), 'map' (seen from above), 'classic' the earlier Ultimate ATC colours
   * with the EuroScope ground states.
   */
  scopeStyle: 'phx-night' | 'phx-day' | 'classic' | 'modern' | 'phosphor' | 'map';
  /** Colours of the interface around the scope (toolbar, lists, menus, dialogs), see UI_THEMES. */
  uiTheme: UiTheme;
  /**
   * How you give instructions: 'text' only typed (not available yet), 'both' typed, by voice and with the menus
   * and the quick-action bar, 'realistic' (beta) only by voice - no command line, no quick-action bar, no
   * instructions from the menus (except a DCL / PDC on Delivery), and the lists are kept by hand.
   */
  controlMode: ControlMode;
  /**
   * How the aircraft menus of the radar read: 'simple' - every entry is the full phrase that is said ("Descend
   * flight level 80"); 'real' - short like EuroScope ("ALT" > "-FL080"), the phrase is only in the radio.
   */
  menuStyle: 'simple' | 'real';
}

export type ControlMode = 'text' | 'both' | 'realistic';

export type UiTheme = 'euroscope' | 'glass' | 'midnight' | 'light' | 'amber' | 'phosphor' | 'contrast';

/** The interface themes offered in the settings; the colours are in src/style.css. */
export const UI_THEMES: [UiTheme, string][] = [
  ['euroscope', 'EuroScope'],
  ['glass', 'Glass'],
  ['midnight', 'Midnight'],
  ['light', 'Light'],
  ['amber', 'Amber console'],
  ['phosphor', 'Phosphor console'],
  ['contrast', 'High contrast'],
];

const KEY = 'ultimate-atc.settings.v1';

const DEFAULTS: Settings = {
  airport: 'EDDS',
  position: 'GND',
  density: 'medium',
  eventLevel: DEFAULT_EVENT_LEVEL,
  start: 'empty',
  tts: false,
  radioNoise: true,
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
  voiceEngine: 'vosk',
  voiceModel: 'small',
  scopeStyle: 'phx-night',
  uiTheme: 'euroscope',
  controlMode: 'both',
  menuStyle: 'simple',
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
      if (!UI_THEMES.some(([t]) => t === s.uiTheme)) s.uiTheme = DEFAULTS.uiTheme;
      // 'text' is not available yet.
      if (s.controlMode !== 'realistic') s.controlMode = 'both';
      if (s.menuStyle !== 'real') s.menuStyle = 'simple';
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

const CORRECTIONS_KEY = 'ultimate-atc.voice-corrections.v1';

/** What the speech recogniser learnt from your corrections (core/phraseology/corrections.ts), in this browser. */
export function loadCorrections(): CorrectionStore {
  try {
    const raw = localStorage.getItem(CORRECTIONS_KEY);
    if (raw) return JSON.parse(raw) as CorrectionStore;
  } catch {
    /* storage unavailable */
  }
  return {};
}

export function saveCorrections(c: CorrectionStore): void {
  try {
    if (Object.keys(c).length) localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(c));
    else localStorage.removeItem(CORRECTIONS_KEY);
  } catch {
    /* storage unavailable */
  }
}
