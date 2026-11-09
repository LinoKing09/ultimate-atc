import type { Simulation } from '../core/simulation';
import { h } from './dom';

/**
 * Performance of the app in the browser: frame rate, frame times, how long the simulation and the scope take per
 * frame, how fast the simulation really runs, and what it has to handle. Measured in App.frame (browser only, the
 * simulation does not change). Shown in the performance window (SETTINGS -> Performance, F6) and, if switched on,
 * as a small overlay on the scope.
 */

/** Frames kept for the statistics (about 5 s at 60 frames per second). */
const WINDOW = 300;
/** A frame longer than this (ms) is a stutter you can see. */
export const LONG_FRAME_MS = 50;

interface FrameSample {
  /** Real time since the previous frame, ms. */
  frameMs: number;
  /** Time spent in the simulation (sim.tick) and in drawing the scope this frame, ms. */
  simMs: number;
  renderMs: number;
  /** Simulated seconds this frame advanced. */
  simSeconds: number;
}

export interface PerfSnapshot {
  fps: number;
  frameAvgMs: number;
  frameP95Ms: number;
  frameMaxMs: number;
  simAvgMs: number;
  simMaxMs: number;
  renderAvgMs: number;
  renderMaxMs: number;
  /** Simulated seconds per real second over the window. */
  simRate: number;
  /** Frames longer than LONG_FRAME_MS in the window, and since the start. */
  longFrames: number;
  longFramesTotal: number;
  frames: number;
}

export class PerfMonitor {
  private readonly samples: FrameSample[] = [];
  private longTotal = 0;
  private count = 0;
  readonly startedAt = performance.now();

  record(s: FrameSample): void {
    this.samples.push(s);
    if (this.samples.length > WINDOW) this.samples.shift();
    this.count++;
    if (s.frameMs > LONG_FRAME_MS) this.longTotal++;
  }

  snapshot(): PerfSnapshot {
    const xs = this.samples;
    const n = xs.length || 1;
    const sum = (f: (s: FrameSample) => number) => xs.reduce((a, s) => a + f(s), 0);
    const max = (f: (s: FrameSample) => number) => xs.reduce((a, s) => Math.max(a, f(s)), 0);
    const frameTotal = sum((s) => s.frameMs);
    const sorted = xs.map((s) => s.frameMs).sort((a, b) => a - b);
    return {
      fps: frameTotal > 0 ? (xs.length * 1000) / frameTotal : 0,
      frameAvgMs: frameTotal / n,
      frameP95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
      frameMaxMs: max((s) => s.frameMs),
      simAvgMs: sum((s) => s.simMs) / n,
      simMaxMs: max((s) => s.simMs),
      renderAvgMs: sum((s) => s.renderMs) / n,
      renderMaxMs: max((s) => s.renderMs),
      simRate: frameTotal > 0 ? sum((s) => s.simSeconds) / (frameTotal / 1000) : 0,
      longFrames: xs.filter((s) => s.frameMs > LONG_FRAME_MS).length,
      longFramesTotal: this.longTotal,
      frames: this.count,
    };
  }
}

/** One line for the scope overlay: "60 FPS  16.7 ms  sim 0.4  draw 2.1". */
export function overlayText(p: PerfSnapshot): string {
  return `${p.fps.toFixed(0)} FPS  ${p.frameAvgMs.toFixed(1)} ms  sim ${p.simAvgMs.toFixed(1)}  draw ${p.renderAvgMs.toFixed(1)}`;
}

/** Rating of the frame rate for the window: good, ok, poor. */
function rating(p: PerfSnapshot): { cls: string; text: string } {
  if (p.fps >= 50 && p.frameP95Ms < 34) return { cls: 'good', text: 'Smooth' };
  if (p.fps >= 28) return { cls: 'ok', text: 'Usable - some frames are slow' };
  return { cls: 'poor', text: 'Slow - try a lower traffic density, a smaller window or the Classic scope style' };
}

export interface PerfContext {
  monitor: PerfMonitor;
  sim: Simulation;
  /** The simulation rate you set (1x, 2x ...) and whether the simulation is paused. */
  speed: () => number;
  paused: () => boolean;
  /** The canvas of the scope shown now (its size in device pixels). */
  canvas: () => HTMLCanvasElement | undefined;
}

/** The performance window: live statistics, updated twice a second while it is open. */
export function showPerformance(ctx: PerfContext): void {
  document.querySelector('.overlay.perf')?.remove();
  const body = h('div.dbody');
  const close = h('button', { type: 'button', text: 'Close' });
  const overlay = h('div.overlay.perf', {}, h('div.dialog', {}, h('div.dtitle', {}, h('span', { text: 'PERFORMANCE' }), close), body));
  const row = (label: string, value: string, hint?: string) => [h('label', { text: label, title: hint }), h('span.perfval', { text: value, title: hint })];
  const fmt = (ms: number) => `${ms.toFixed(1)} ms`;
  const render = () => {
    const p = ctx.monitor.snapshot();
    const sim = ctx.sim;
    const r = rating(p);
    const canvas = ctx.canvas();
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const airborne = sim.aircraft.filter((a) => !a.onGround).length;
    const realS = (performance.now() - ctx.monitor.startedAt) / 1000;
    body.replaceChildren(
      h('div.sub', { text: 'Live, over the last ~5 seconds (300 frames). Measured in this browser; nothing is sent anywhere.' }),
      h(`div.perfrating.${r.cls}`, { text: `${p.fps.toFixed(0)} FPS - ${r.text}` }),
      h('h2', { text: 'Frames' }),
      h(
        'div.grid',
        {},
        ...row('Frame rate', `${p.fps.toFixed(1)} FPS`, 'Frames drawn per second (the screen usually allows 60)'),
        ...row('Frame time', `${fmt(p.frameAvgMs)} average, ${fmt(p.frameP95Ms)} (95 %), ${fmt(p.frameMaxMs)} max`, 'Real time between two frames'),
        ...row('Slow frames', `${p.longFrames} in the window, ${p.longFramesTotal} since opening the session`, `Frames longer than ${LONG_FRAME_MS} ms - visible stutters`),
        ...row('Simulation', `${fmt(p.simAvgMs)} average, ${fmt(p.simMaxMs)} max per frame`, 'Time the simulation (traffic, pilots, AI positions, radar) takes per frame'),
        ...row('Drawing', `${fmt(p.renderAvgMs)} average, ${fmt(p.renderMaxMs)} max per frame`, 'Time drawing the scope takes per frame'),
        ...row('Frames since start', `${p.frames} in ${realS.toFixed(0)} s`),
      ),
      h('h2', { text: 'Simulation' }),
      h(
        'div.grid',
        {},
        ...row('Rate', ctx.paused() ? 'paused' : `${p.simRate.toFixed(2)}x real time (set: ${ctx.speed()}x)`, 'Simulated seconds per real second; lower than set when the browser cannot keep up or waits for a pilot voice'),
        ...row('Steps', `${sim.steps} (0.2 s each), ${Math.round(sim.time - sim.sessionStart)} s simulated`),
        ...row('Aircraft', `${sim.aircraft.length} (${airborne} airborne), ${sim.vehicles.length} vehicles`),
        ...row('Radio messages', `${sim.messages.length} kept`),
      ),
      h('h2', { text: 'Device' }),
      h(
        'div.grid',
        {},
        ...row('Scope canvas', canvas ? `${canvas.width} x ${canvas.height} px (pixel ratio ${(window.devicePixelRatio || 1).toFixed(2)})` : '-', 'A larger canvas (a big window, a high pixel ratio) takes longer to draw'),
        ...row('Memory (JS heap)', mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB of ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB` : 'not reported by this browser'),
        ...row('Processor cores', `${navigator.hardwareConcurrency ?? '?'}`),
        ...row('Browser', navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)),
      ),
    );
  };
  const timer = setInterval(() => {
    if (!overlay.isConnected) clearInterval(timer);
    else render();
  }, 500);
  close.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => e.target === overlay && overlay.remove());
  overlay.addEventListener('keydown', (e) => e.key === 'Escape' && overlay.remove());
  render();
  document.body.append(overlay);
}
