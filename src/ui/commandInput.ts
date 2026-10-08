import { h } from './dom';

/**
 * Single-line command field. It is a plain-text `contenteditable` element
 * instead of an `<input>`: on iPad, Safari treats an `<input>` as a form
 * field and adds AutoFill buttons (passwords, cards, contacts) and the
 * form navigation arrows to the keyboard bar; for an editable element it
 * does not.
 */
export class CommandInput {
  readonly el: HTMLDivElement;

  constructor(placeholder: string) {
    this.el = h('div.cmd', {
      role: 'textbox',
      'aria-label': 'Command line',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'send',
    });
    try {
      this.el.contentEditable = 'plaintext-only';
    } catch {
      this.el.contentEditable = 'true';
    }
    if (this.el.contentEditable !== 'plaintext-only') this.el.contentEditable = 'true';
    this.placeholder = placeholder;
    // Keep it a single line of plain text (pasted line breaks, rich text).
    this.el.addEventListener('input', () => {
      if (this.el.childElementCount || /\n/.test(this.el.textContent ?? '')) {
        const text = (this.el.textContent ?? '').replace(/\s*\n\s*/g, ' ');
        this.el.textContent = text;
        this.caretToEnd();
      }
    });
  }

  get value(): string {
    return (this.el.textContent ?? '').replace(/ /g, ' ');
  }

  set value(text: string) {
    this.el.textContent = text;
    if (this.focused) this.caretToEnd();
  }

  set placeholder(text: string) {
    this.el.dataset.placeholder = text;
  }

  get focused(): boolean {
    return document.activeElement === this.el;
  }

  focus(): void {
    this.el.focus({ preventScroll: true });
    this.caretToEnd();
  }

  /** Appends typed text at the end and notifies listeners (like a key press would). */
  append(text: string): void {
    this.el.textContent = this.value + text;
    this.caretToEnd();
    this.el.dispatchEvent(new Event('input'));
  }

  private caretToEnd(): void {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(this.el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
