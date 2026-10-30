import { h } from './dom';

/**
 * Own selection controls instead of the browser's drop-down lists: a segmented control for a few choices, a
 * drop-down list in the style of the app for longer lists, and a stepper for an ordered value (ATIS letter).
 */

export interface PickOption<T extends string> {
  value: T;
  label: string;
  /** Tooltip, or why the option is not available. */
  title?: string;
  disabled?: boolean;
}

export interface Picker<T extends string> {
  el: HTMLElement;
  get(): T;
  /** Sets the value without calling `onChange`. */
  set(value: T): void;
  /** Replaces the options (keeping the value if it is still there, else the first enabled one). */
  setOptions(options: PickOption<T>[]): void;
}

/** A row of buttons, one per choice; the chosen one is highlighted. For two to four short choices. */
export function segmented<T extends string>(options: PickOption<T>[], value: T, onChange: (v: T) => void): Picker<T> {
  const el = h('div.seg', { role: 'radiogroup' });
  let current = value;
  let opts = options;
  const render = () => {
    el.replaceChildren(
      ...opts.map((o) => {
        const b = h('button', { type: 'button', text: o.label, title: o.title, role: 'radio', 'aria-checked': String(o.value === current), disabled: o.disabled });
        b.classList.toggle('on', o.value === current);
        b.addEventListener('click', () => {
          if (o.disabled || o.value === current) return;
          current = o.value;
          render();
          onChange(current);
        });
        return b;
      }),
    );
  };
  render();
  return {
    el,
    get: () => current,
    set: (v) => {
      current = v;
      render();
    },
    setOptions: (o) => {
      opts = o;
      if (!opts.some((x) => x.value === current && !x.disabled)) current = opts.find((x) => !x.disabled)?.value ?? current;
      render();
    },
  };
}

/**
 * A button showing the chosen value; clicking it opens a list in the style of the app's menus (arrow keys,
 * Enter, Escape). For longer lists.
 */
export function dropdown<T extends string>(options: PickOption<T>[], value: T, onChange: (v: T) => void): Picker<T> {
  let current = value;
  let opts = options;
  const label = h('span.dd-label');
  const btn = h('button.dd', { type: 'button', 'aria-haspopup': 'listbox' }, label, h('span.dd-caret', { text: '▾' }));
  let list: HTMLElement | undefined;
  let active = 0;
  const show = () => (label.textContent = opts.find((o) => o.value === current)?.label ?? '');
  const close = () => {
    list?.remove();
    list = undefined;
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    btn.classList.remove('open');
  };
  const choose = (o: PickOption<T>) => {
    if (o.disabled) return;
    close();
    btn.focus();
    if (o.value === current) return;
    current = o.value;
    show();
    onChange(current);
  };
  const highlight = () => list?.querySelectorAll('.dd-item').forEach((it, i) => it.classList.toggle('active', i === active));
  const onDocDown = (e: PointerEvent) => {
    if (!list?.contains(e.target as Node) && !btn.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      for (let k = 0; k < opts.length; k++) {
        active = (active + step + opts.length) % opts.length;
        if (!opts[active].disabled) break;
      }
      highlight();
    } else if (e.key === 'Enter') choose(opts[active]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const open = () => {
    const r = btn.getBoundingClientRect();
    active = Math.max(0, opts.findIndex((o) => o.value === current));
    list = h(
      'div.dd-list',
      { role: 'listbox' },
      ...opts.map((o, i) => {
        const it = h('div.dd-item', { text: o.label, title: o.title, role: 'option' });
        it.classList.toggle('disabled', !!o.disabled);
        it.classList.toggle('chosen', o.value === current);
        it.addEventListener('pointerenter', () => {
          active = i;
          highlight();
        });
        it.addEventListener('click', () => choose(o));
        return it;
      }),
    );
    list.style.left = `${r.left}px`;
    list.style.minWidth = `${r.width}px`;
    document.body.append(list);
    // Below the button, or above it when there is no room.
    const below = window.innerHeight - r.bottom;
    list.style.top = below >= list.offsetHeight + 4 || below > r.top ? `${r.bottom + 2}px` : `${Math.max(4, r.top - list.offsetHeight - 2)}px`;
    highlight();
    btn.classList.add('open');
    setTimeout(() => {
      document.addEventListener('pointerdown', onDocDown, true);
      document.addEventListener('keydown', onKey, true);
    });
  };
  btn.addEventListener('click', () => (list ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (!list && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open();
    }
  });
  show();
  return {
    el: btn,
    get: () => current,
    set: (v) => {
      current = v;
      show();
    },
    setOptions: (o) => {
      opts = o;
      if (!opts.some((x) => x.value === current && !x.disabled)) current = opts.find((x) => !x.disabled)?.value ?? current;
      show();
    },
  };
}

/** ◀ value ▶ - steps through an ordered list (wrapping round), e.g. the ATIS letters A-Z. */
export function stepper(values: string[], value: string, onChange: (v: string) => void): { el: HTMLElement; get(): string } {
  let i = Math.max(0, values.indexOf(value));
  const out = h('span.step-val', { text: values[i] });
  const step = (d: number) => {
    i = (i + d + values.length) % values.length;
    out.textContent = values[i];
    onChange(values[i]);
  };
  const prev = h('button', { type: 'button', text: '◀', title: 'Previous' });
  const next = h('button', { type: 'button', text: '▶', title: 'Next' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const el = h('div.stepper', { tabindex: '0' }, prev, out, next);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(1);
    else if (/^[a-z]$/i.test(e.key) && values.includes(e.key.toUpperCase())) {
      i = values.indexOf(e.key.toUpperCase());
      out.textContent = values[i];
      onChange(values[i]);
    } else return;
    e.preventDefault();
  });
  return { el, get: () => values[i] };
}
