import type { TutorialRunner } from '../core/tutorial';
import { rich } from './briefing';
import { h } from './dom';

export interface TutorialPanelCallbacks {
  /** "Show me": select the aircraft and put the example into the command line. */
  showExample(text: string | undefined, focus: string | undefined): void;
  /** After the last step (or when the tutorial is skipped): random traffic from now on. */
  liveTraffic(): void;
}

/**
 * The tutorial panel on the scope: the current step with its explanation,
 * Back / "Show me" (example instruction into the command line) / Next, and
 * "Skip tutorial". Collapsible, so it does not hide the airport on the iPad;
 * it disappears when the tutorial is finished or skipped.
 */
export class TutorialPanel {
  readonly el: HTMLElement;
  private readonly head: HTMLElement;
  private readonly body: HTMLElement;
  private collapsed = false;
  private shown = -1;
  /** The example of the current step (it can change, e.g. once a stand is known). */
  private exampleEl?: HTMLElement;

  constructor(
    private readonly runner: TutorialRunner,
    private readonly cb: TutorialPanelCallbacks,
  ) {
    this.head = h('div.ttitle');
    this.head.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.el.classList.toggle('collapsed', this.collapsed);
    });
    this.body = h('div.tbody');
    this.el = h('div.tutorial', {}, this.head, this.body);
  }

  /** Advances the tutorial and redraws the panel when the step changed. */
  update(selected: string | undefined): void {
    if (!this.el.isConnected) return;
    if (this.runner.update(selected) || this.shown !== this.runner.index) this.render();
    else if (this.exampleEl) {
      const text = this.runner.step?.example?.(this.runner.sim) ?? '';
      if (this.exampleEl.textContent !== text) this.exampleEl.textContent = text;
    }
  }

  private render(): void {
    const r = this.runner;
    const t = r.tutorial;
    this.shown = r.index;
    const total = t.steps.length;
    this.head.replaceChildren(
      h('span', { text: `TUTORIAL ${t.title.toUpperCase()}` }),
      h('span.tprog', { text: `${Math.min(r.index + 1, total)}/${total}${r.reviewing ? ' (review)' : ''}` }),
      h('span.tfold', { text: this.collapsed ? '+' : '−', title: 'Show / hide' }),
    );
    const step = r.step;
    this.exampleEl = undefined;
    // Finished (or skipped): the panel disappears.
    if (!step) {
      this.el.remove();
      return;
    }
    const buttons: HTMLElement[] = [];
    const btn = (text: string, fn: () => void, primary = false) => {
      const b = h(primary ? 'button.primary' : 'button', { type: 'button', text });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      buttons.push(b);
      return b;
    };
    const back = btn('Back', () => (r.back(), this.render()));
    back.disabled = r.index === 0;
    const example = step.example?.(r.sim);
    if (step.example) btn('Show me', () => this.cb.showExample(step.example?.(r.sim), step.focus), true);
    else if (step.focus) btn(`Select ${step.focus}`, () => this.cb.showExample(undefined, step.focus));
    const last = r.index === total - 1;
    if (last) {
      btn('Live traffic', () => {
        this.cb.liveTraffic();
        this.finish();
      }, true);
      btn('Close', () => this.finish());
    } else {
      btn('Next', () => (r.next(), this.render()), !step.done || r.reviewing);
      btn('Skip tutorial', () => {
        this.cb.liveTraffic();
        this.finish();
      });
    }
    const parts: HTMLElement[] = [h('div.tstep', { text: step.title }), h('p', {}, ...rich(r.text()))];
    if (step.example) parts.push(h('div.texample', {}, (this.exampleEl = h('code', { text: example ?? '' }))));
    parts.push(h('div.tactions', {}, ...buttons));
    this.body.replaceChildren(...parts);
    // A new step: flash briefly and unfold.
    this.collapsed = false;
    this.el.classList.remove('collapsed', 'flash');
    void this.el.offsetWidth;
    this.el.classList.add('flash');
  }

  /** Ends the tutorial and removes the panel. */
  private finish(): void {
    this.runner.skipAll();
    this.el.remove();
  }
}
