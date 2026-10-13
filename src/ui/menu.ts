import { h } from './dom';

export interface MenuItem {
  label: string;
  /** Text on the right; a function is re-evaluated twice a second while the menu is open (e.g. a countdown). */
  hint?: string | (() => string | undefined);
  disabled?: boolean;
  action?: () => void;
  submenu?: () => MenuItem[];
  /** Called while the item is hovered (e.g. to preview a route). */
  onHover?: (active: boolean) => void;
  divider?: boolean;
}

/** Clicks this soon after a menu level opened are ignored (the tap that opened it), ms. */
const TAP_GUARD_MS = 350;

/**
 * EuroScope-style popup list with cascading sub-menus.
 */
export class PopupMenu {
  private stack: HTMLElement[] = [];
  /** Live hints of the open menu levels. */
  private live: { el: HTMLElement; fn: () => string | undefined }[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private readonly onDocDown = (e: PointerEvent) => {
    if (!this.stack.some((el) => el.contains(e.target as Node))) this.close();
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  open(title: string, items: MenuItem[], x: number, y: number): void {
    this.close();
    this.openLevel(title, items, x, y, 0);
    setTimeout(() => {
      document.addEventListener('pointerdown', this.onDocDown, true);
      document.addEventListener('keydown', this.onKey, true);
    });
  }

  close(): void {
    for (const el of this.stack) el.remove();
    this.stack = [];
    this.live = [];
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener('pointerdown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
  }

  private closeFrom(level: number): void {
    while (this.stack.length > level) this.stack.pop()!.remove();
  }

  private openLevel(title: string | null, items: MenuItem[], x: number, y: number, level: number, anchor?: DOMRect): void {
    this.closeFrom(level);
    const el = h('div.popup');
    // Taps that arrive right after a level opened belong to the tap that opened it (touch screens fire
    // the click after the menu has appeared under the finger): they are ignored.
    const openedAt = performance.now();
    if (title) el.append(h('div.head', { text: title }));
    for (const it of items) {
      if (it.divider) {
        el.append(h('div.divider'));
        continue;
      }
      const hintText = typeof it.hint === 'function' ? it.hint() : it.hint;
      const hintEl = hintText !== undefined || typeof it.hint === 'function' ? h('span.hint', { text: hintText ?? '' }) : null;
      if (hintEl && typeof it.hint === 'function') this.live.push({ el: hintEl, fn: it.hint });
      const row = h(`div.item${it.submenu ? '.sub' : ''}${it.disabled ? '.disabled' : ''}`, {}, it.label, hintEl);
      const enter = () => {
        el.querySelectorAll('.item.open').forEach((n) => n.classList.remove('open'));
        it.onHover?.(true);
        if (it.submenu && !it.disabled) {
          row.classList.add('open');
          const r = row.getBoundingClientRect();
          this.openLevel(null, it.submenu(), r.right, r.top - 3, level + 1, r);
        } else {
          this.closeFrom(level + 1);
        }
      };
      // Hover opens sub-menus with a mouse only; on touch screens a tap does (below).
      row.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') enter();
      });
      row.addEventListener('pointerleave', () => it.onHover?.(false));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (performance.now() - openedAt < TAP_GUARD_MS) return;
        // Touch screens have no hover: a tap on a sub-menu entry opens it.
        if (it.submenu && !it.disabled && !row.classList.contains('open')) enter();
        if (it.disabled || it.submenu) return;
        this.close();
        it.action?.();
      });
      el.append(row);
    }
    document.body.append(el);
    // Keep on screen. A sub-menu goes right of its row, else left of it; if neither fits (phones),
    // below the row, so it never covers the entry that was tapped.
    const r = el.getBoundingClientRect();
    let px = x;
    let py = y;
    if (anchor && x + r.width > window.innerWidth - 4) {
      const parent = this.stack[level - 1]?.getBoundingClientRect();
      const left = (parent?.left ?? anchor.left) - r.width;
      if (left >= 2) px = left;
      else py = anchor.bottom + 2;
    }
    px = Math.min(px, window.innerWidth - r.width - 4);
    py = Math.min(py, window.innerHeight - r.height - 4);
    el.style.left = `${Math.max(2, px)}px`;
    el.style.top = `${Math.max(2, py)}px`;
    this.stack.push(el);
    if (this.live.length && !this.timer) {
      this.timer = setInterval(() => {
        this.live = this.live.filter((l) => l.el.isConnected);
        for (const l of this.live) l.el.textContent = l.fn() ?? '';
      }, 500);
    }
  }
}
