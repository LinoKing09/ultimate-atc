import type { TutorialRunner } from '../core/tutorial';
import { rich } from './briefing';
import { h } from './dom';

export interface TutorialPanelCallbacks {
  /** "Show me": select the aircraft and put the example into the command line. */
  showExample(text: string | undefined, focus: string | undefined): void;
  /** After the last step: random traffic from now on. */
  liveTraffic(): void;
}

/**
 * The tutorial panel on the scope: the current step with its explanation,
 * "Show me" (example instruction into the command line), Next / Skip.
 * Collapsible, so it does not hide the airport on the iPad.
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
      h('span.tprog', { text: r.finished ? 'done' : `${r.index + 1}/${total}` }),
      h('span.tfold', { text: this.collapsed ? '+' : '−', title: 'Show / hide' }),
    );
    const step = r.step;
    this.exampleEl = undefined;
    if (!step) {
      this.body.replaceChildren(h('p', { text: 'Tutorial finished.' }));
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
    };
    const example = step.example?.(r.sim);
    if (step.example) btn('Show me', () => this.cb.showExample(step.example?.(r.sim), step.focus), true);
    else if (step.focus) btn(`Select ${step.focus}`, () => this.cb.showExample(undefined, step.focus));
    const last = r.index === total - 1;
    if (!step.done) {
      if (last) {
        btn('Live traffic', () => {
          this.cb.liveTraffic();
          r.next();
          this.render();
        }, true);
        btn('Close', () => this.el.remove());
      } else btn('Next', () => (r.next(), this.render()), true);
    } else btn('Skip', () => (r.next(), this.render()));
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
}
