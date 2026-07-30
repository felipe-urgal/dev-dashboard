const HISTORY_LIST_WIDTH_KEY = 'dev-dashboard-git-history-list-width';
const DEFAULT_HISTORY_LIST_WIDTH = 30;
const MIN_HISTORY_LIST_WIDTH = 22;
const MAX_HISTORY_LIST_WIDTH = 62;

export function clampHistoryListWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_LIST_WIDTH;
  return Math.min(MAX_HISTORY_LIST_WIDTH, Math.max(MIN_HISTORY_LIST_WIDTH, value));
}

export function readHistoryListWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(HISTORY_LIST_WIDTH_KEY));
    return stored > 0 ? clampHistoryListWidth(stored) : DEFAULT_HISTORY_LIST_WIDTH;
  } catch {
    return DEFAULT_HISTORY_LIST_WIDTH;
  }
}

export function persistHistoryListWidth(value: number): void {
  try {
    window.localStorage.setItem(HISTORY_LIST_WIDTH_KEY, String(value));
  } catch {
    // Preferência visual opcional.
  }
}

export function applyHistoryListWidth(layout: HTMLElement, value: number): number {
  const width = clampHistoryListWidth(value);
  layout.style.setProperty('--git-history-list-width', `${width}%`);
  const separator = layout.querySelector<HTMLElement>('.git-history-page-resizer');
  separator?.setAttribute('aria-valuenow', String(Math.round(width)));
  return width;
}

export function buildHistoryResizer(layout: HTMLElement): HTMLButtonElement {
  const separator = document.createElement('button');
  separator.type = 'button';
  separator.className = 'git-history-page-resizer';
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-label', 'Redimensionar lista de commits e detalhes');
  separator.setAttribute('aria-orientation', 'vertical');
  separator.setAttribute('aria-valuemin', String(MIN_HISTORY_LIST_WIDTH));
  separator.setAttribute('aria-valuemax', String(MAX_HISTORY_LIST_WIDTH));

  const updateFromPointer = (event: PointerEvent): void => {
    const bounds = layout.getBoundingClientRect();
    if (bounds.width <= 0) return;
    applyHistoryListWidth(layout, ((event.clientX - bounds.left) / bounds.width) * 100);
  };

  const finishResize = (event: PointerEvent): void => {
    if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId);
    separator.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-resizing-git-history');
    persistHistoryListWidth(Number.parseFloat(
      layout.style.getPropertyValue('--git-history-list-width'),
    ));
  };

  separator.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || window.matchMedia('(max-width: 820px)').matches) return;
    event.preventDefault();
    separator.setPointerCapture(event.pointerId);
    separator.classList.add('is-dragging');
    document.documentElement.classList.add('is-resizing-git-history');
    updateFromPointer(event);
  });
  separator.addEventListener('pointermove', (event) => {
    if (!separator.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event);
  });
  separator.addEventListener('pointerup', finishResize);
  separator.addEventListener('pointercancel', finishResize);
  separator.addEventListener('keydown', (event) => {
    const current = Number.parseFloat(
      layout.style.getPropertyValue('--git-history-list-width'),
    ) || DEFAULT_HISTORY_LIST_WIDTH;
    let next = current;
    if (event.key === 'ArrowLeft') next = current - 2;
    else if (event.key === 'ArrowRight') next = current + 2;
    else if (event.key === 'Home') next = MIN_HISTORY_LIST_WIDTH;
    else if (event.key === 'End') next = MAX_HISTORY_LIST_WIDTH;
    else return;
    event.preventDefault();
    persistHistoryListWidth(applyHistoryListWidth(layout, next));
  });

  return separator;
}
