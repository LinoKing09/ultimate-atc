import { h } from './dom';

export interface MenuItem {
  label: string;
  hint?: string;
  disabled?: boolean;
  action?: () => void;
  submenu?: () => MenuItem[];
  /** Called while the item is hovered (e.g. to preview a route). */
  onHover?: (active: boolean) => void;
  divider?: boolean;
}

/**
 * EuroScope-style popup list with cascading sub-menus.
 */
export class PopupMenu {
  private stack: HTMLElement[] = [];
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
    document.removeEventListener('pointerdown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
  }

  private closeFrom(level: number): void {
    while (this.stack.length > level) this.stack.pop()!.remove();
  }

  private openLevel(title: string | null, items: MenuItem[], x: number, y: number, level: number): void {
    this.closeFrom(level);
    const el = h('div.popup');
    if (title) el.append(h('div.head', { text: title }));
    for (const it of items) {
      if (it.divider) {
        el.append(h('div.divider'));
        continue;
      }
      const row = h(`div.item${it.submenu ? '.sub' : ''}${it.disabled ? '.disabled' : ''}`, {}, it.label, it.hint ? h('span.hint', { text: it.hint }) : null);
      const enter = () => {
        el.querySelectorAll('.item.open').forEach((n) => n.classList.remove('open'));
        it.onHover?.(true);
        if (it.submenu && !it.disabled) {
          row.classList.add('open');
          const r = row.getBoundingClientRect();
          this.openLevel(null, it.submenu(), r.right, r.top - 3, level + 1);
        } else {
          this.closeFrom(level + 1);
        }
      };
      row.addEventListener('pointerenter', enter);
      row.addEventListener('pointerleave', () => it.onHover?.(false));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        // Touch screens have no hover: a tap on a sub-menu entry opens it.
        if (it.submenu && !it.disabled && !row.classList.contains('open')) enter();
        if (it.disabled || it.submenu) return;
        this.close();
        it.action?.();
      });
      el.append(row);
    }
    document.body.append(el);
    // keep on screen
    const r = el.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - r.width - 4);
    const py = Math.min(y, window.innerHeight - r.height - 4);
    el.style.left = `${Math.max(2, px)}px`;
    el.style.top = `${Math.max(2, py)}px`;
    this.stack.push(el);
  }
}
