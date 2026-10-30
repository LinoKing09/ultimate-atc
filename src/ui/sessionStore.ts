import { SESSION_VERSION, type SavedSession } from '../core/session';

/**
 * Saved sessions and the controller's statistics in the browser's storage (localStorage). Every access is
 * guarded: storage can be unavailable (private mode, blocked site data) and the app must work without it.
 */
const SESSIONS_KEY = 'ultimate-atc.sessions.v1';
const STATS_KEY = 'ultimate-atc.stats.v1';
/** Sessions kept in the browser (the oldest go first; the autosave counts as one). */
const MAX_SESSIONS = 20;
/** The slot that is overwritten automatically during a session. */
export const AUTOSAVE_ID = 'autosave';

export function listSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const list = raw ? (JSON.parse(raw) as SavedSession[]) : [];
    return Array.isArray(list) ? list.filter((s) => s && s.version === SESSION_VERSION) : [];
  } catch {
    return [];
  }
}

/** Stores a session (replacing one with the same id), newest first. Returns an error text if that failed. */
export function storeSession(s: SavedSession): string | undefined {
  const list = [s, ...listSessions().filter((x) => x.id !== s.id)].slice(0, MAX_SESSIONS);
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
    return undefined;
  } catch {
    return 'The browser did not let Ultimate ATC store the session (storage full or blocked) - download it as a file instead.';
  }
}

export function deleteSession(id: string): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(listSessions().filter((x) => x.id !== id)));
  } catch {
    // Storage unavailable: nothing stored anyway.
  }
}

/** Offers the session as a file to download (to keep it, or to continue on another device). */
export function downloadSession(s: SavedSession): void {
  const blob = new Blob([JSON.stringify(s)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${s.airport}-${s.savedAt.slice(0, 16).replace(/[-:T]/g, '')}.atc.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Reads a downloaded session file. */
export async function readSessionFile(file: File): Promise<SavedSession> {
  let s: SavedSession;
  try {
    s = JSON.parse(await file.text()) as SavedSession;
  } catch {
    throw new Error('This is not a saved Ultimate ATC session.');
  }
  if (!s || typeof s !== 'object' || !Array.isArray(s.actions) || !s.config) throw new Error('This is not a saved Ultimate ATC session.');
  if (s.version !== SESSION_VERSION) throw new Error('This session was saved by another version of Ultimate ATC.');
  return s;
}

/**
 * The controller's totals over all sessions in this browser - the start of the account statistics: time on
 * position (real time, without pauses), simulated time, sessions, and the time per airport and per position.
 */
export interface ControllerStats {
  controlSeconds: number;
  simulatedSeconds: number;
  sessions: number;
  airports: Record<string, number>;
  positions: Record<string, number>;
}

export function loadStats(): ControllerStats {
  const empty: ControllerStats = { controlSeconds: 0, simulatedSeconds: 0, sessions: 0, airports: {}, positions: {} };
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<ControllerStats>) } : empty;
  } catch {
    return empty;
  }
}

function saveStats(s: ControllerStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: the totals are not kept.
  }
}

/** Counts a new session (not a restored one: that continues an earlier session). */
export function countSession(): void {
  const s = loadStats();
  s.sessions++;
  saveStats(s);
}

/** Adds time on position (and the simulated time it covered) to the totals. `positions`: the ones staffed. */
export function addControlTime(controlSeconds: number, simulatedSeconds: number, airport: string, positions: string[]): void {
  if (controlSeconds <= 0 && simulatedSeconds <= 0) return;
  const s = loadStats();
  s.controlSeconds += controlSeconds;
  s.simulatedSeconds += simulatedSeconds;
  s.airports[airport] = (s.airports[airport] ?? 0) + controlSeconds;
  for (const p of positions) s.positions[p] = (s.positions[p] ?? 0) + controlSeconds;
  saveStats(s);
}

/** "2 h 05 min", "12 min", "0:42:10" (`clock`). */
export function formatDuration(seconds: number, clock = false): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (clock) return `${h}:${String(m).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
