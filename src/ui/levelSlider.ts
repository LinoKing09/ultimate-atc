import { h } from './dom';

export interface LevelSlider {
  el: HTMLElement;
  input: HTMLInputElement;
  /** Sets the step without calling `onChange`. */
  set(step: number): void;
}

/**
 * A slider over a few named steps (density, traffic mix, heavies, special
 * events) with the name of the current step next to it.
 */
export function levelSlider(labels: string[], step: number, onChange: (step: number) => void): LevelSlider {
  const input = h('input', { type: 'range', min: '0', max: String(labels.length - 1), step: '1', class: 'level' });
  const out = h('span.val.level-val');
  const set = (v: number) => {
    input.value = String(v);
    out.textContent = labels[v] ?? '';
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = labels[v] ?? '';
    onChange(v);
  });
  set(step);
  return { el: h('div.rangerow.levelrow', {}, input, out), input, set };
}
