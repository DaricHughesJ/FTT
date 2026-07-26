// Tiny DOM helpers — no framework, everything is explicit.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  cls = 'btn',
  disabled = false,
): HTMLButtonElement {
  const b = el('button', { class: cls }, [label]);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

export function toast(msg: string, ms = 2600): void {
  const host = document.getElementById('toasts')!;
  const t = el('div', { class: 'toast' }, [msg]);
  host.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export interface ModalHandle {
  close(): void;
  box: HTMLElement;
}

export function modal(build: (box: HTMLElement, close: () => void) => void): ModalHandle {
  const overlay = el('div', { class: 'modal-overlay' });
  const box = el('div', { class: 'modal-box' });
  overlay.appendChild(box);
  const close = () => overlay.remove();
  build(box, close);
  document.body.appendChild(overlay);
  return { close, box };
}

/** Simple confirm-style modal with title, body lines and buttons. */
export function infoModal(title: string, lines: string[], okLabel = 'OK'): Promise<void> {
  return new Promise((resolve) => {
    modal((box, close) => {
      box.appendChild(el('h3', {}, [title]));
      const list = el('div', { class: 'modal-list' });
      for (const line of lines) list.appendChild(el('div', {}, [line]));
      box.appendChild(list);
      box.appendChild(
        el('div', { class: 'row' }, [
          button(okLabel, () => {
            close();
            resolve();
          }, 'btn btn-primary'),
        ]),
      );
    });
  });
}
