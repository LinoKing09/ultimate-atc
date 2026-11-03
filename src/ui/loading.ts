import { h } from './dom';

/**
 * Loading screen between Connect and the scope: building a large airport and taking over its traffic takes a few
 * seconds (München with traffic in progress: 3-4 s, longer on a tablet). The spinner turns as a CSS transform
 * animation, so it keeps turning while the page is busy; the steps and the progress bar show how far it is.
 */
export interface Loading {
  /** Shows a step (and how far it is, 0 ... 1, for a bar) and waits until the browser has drawn it. */
  step(text: string, progress?: number): Promise<void>;
  close(): void;
}

/** Resolves once the browser has drawn the current state (or after 50 ms in a tab in the background). */
function painted(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 50);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0),
    );
  });
}

export function showLoading(title: string, subtitle = ''): Loading {
  const stepEl = h('div.lstep', { text: '' });
  const fill = h('i');
  const bar = h('div.lbar', {}, fill);
  bar.hidden = true;
  const overlay = h(
    'div.overlay.loading',
    { role: 'status', 'aria-live': 'polite' },
    h('div.dialog.loading-box', {}, h('div.dbody', {}, h('div.spinner', { 'aria-hidden': 'true' }), h('div.ltitle', { text: title }), subtitle ? h('div.lsub', { text: subtitle }) : null, stepEl, bar)),
  );
  document.body.append(overlay);
  return {
    async step(text, progress) {
      stepEl.textContent = text;
      bar.hidden = progress === undefined;
      if (progress !== undefined) fill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
      await painted();
    },
    close() {
      overlay.remove();
    },
  };
}
