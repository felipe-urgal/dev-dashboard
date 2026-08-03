const MIN_SIDEBAR_WIDTH = 190;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_SIDEBAR_WIDTH = 280;
const STORAGE_KEY = 'dev-dashboard:embedded-editor-sidebar-width';

let observer: MutationObserver | undefined;
let escapeListenerInstalled = false;

function clampSidebarWidth(value: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}

function readStoredWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored)
      ? clampSidebarWidth(stored)
      : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function storeWidth(value: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Preferências locais são opcionais; o editor continua funcional sem elas.
  }
}

function requestMonacoLayout(): void {
  window.dispatchEvent(new Event('resize'));
}

function setSidebarWidth(
  section: HTMLElement,
  separator: HTMLElement,
  width: number,
): void {
  const next = clampSidebarWidth(width);
  section.style.setProperty('--embedded-editor-sidebar-width', `${next}px`);
  separator.setAttribute('aria-valuenow', String(next));
  storeWidth(next);
  requestAnimationFrame(requestMonacoLayout);
}

function updateFullscreenButton(
  section: HTMLElement,
  button: HTMLButtonElement,
): void {
  const active = section.classList.contains('embedded-ide-fullscreen');
  button.textContent = active ? 'Sair da tela inteira' : 'Tela inteira';
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute(
    'aria-label',
    active ? 'Sair da visualização em tela inteira' : 'Abrir editor em tela inteira',
  );
}

function toggleFullscreen(
  section: HTMLElement,
  button: HTMLButtonElement,
): void {
  const active = section.classList.toggle('embedded-ide-fullscreen');
  document.body.classList.toggle('embedded-ide-fullscreen-open', active);
  updateFullscreenButton(section, button);
  requestAnimationFrame(requestMonacoLayout);
}

function installFullscreenButton(section: HTMLElement): void {
  const actions = section.querySelector<HTMLElement>(
    '.embedded-ide-header-actions',
  );
  if (!actions || actions.querySelector('[data-editor-fullscreen-button]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button embedded-ide-fullscreen-button';
  button.dataset.editorFullscreenButton = 'true';
  updateFullscreenButton(section, button);
  button.addEventListener('click', () => toggleFullscreen(section, button));
  actions.prepend(button);
}

function installResizeSeparator(section: HTMLElement): void {
  const shell = section.querySelector<HTMLElement>('.embedded-ide-shell');
  const sidebar = shell?.querySelector<HTMLElement>('.embedded-ide-sidebar');
  const workbench = shell?.querySelector<HTMLElement>('.embedded-ide-workbench');
  if (
    !shell
    || !sidebar
    || !workbench
    || shell.querySelector('[data-editor-resize-separator]')
  ) return;

  const separator = document.createElement('div');
  separator.className = 'embedded-ide-resize-separator';
  separator.dataset.editorResizeSeparator = 'true';
  separator.tabIndex = 0;
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-label', 'Redimensionar explorer de arquivos');
  separator.setAttribute('aria-orientation', 'vertical');
  separator.setAttribute('aria-valuemin', String(MIN_SIDEBAR_WIDTH));
  separator.setAttribute('aria-valuemax', String(MAX_SIDEBAR_WIDTH));

  shell.insertBefore(separator, workbench);
  setSidebarWidth(section, separator, readStoredWidth());

  let startX = 0;
  let startWidth = DEFAULT_SIDEBAR_WIDTH;

  const stopResize = (): void => {
    document.body.classList.remove('embedded-ide-resizing');
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    setSidebarWidth(section, separator, startWidth + event.clientX - startX);
  };

  separator.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startX = event.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    document.body.classList.add('embedded-ide-resizing');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  });

  separator.addEventListener('dblclick', () => {
    setSidebarWidth(section, separator, DEFAULT_SIDEBAR_WIDTH);
  });

  separator.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = Number(separator.getAttribute('aria-valuenow'))
      || DEFAULT_SIDEBAR_WIDTH;
    setSidebarWidth(
      section,
      separator,
      current + (event.key === 'ArrowRight' ? 16 : -16),
    );
  });
}

function installEditorWheelContainment(section: HTMLElement): void {
  const area = section.querySelector<HTMLElement>('.embedded-ide-editor-area');
  if (!area || area.dataset.editorWheelContainment === 'true') return;
  area.dataset.editorWheelContainment = 'true';

  area.addEventListener('wheel', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const scrollable = target?.closest<HTMLElement>('.monaco-scrollable-element')
      ?? area.querySelector<HTMLElement>('.monaco-scrollable-element');
    if (!scrollable || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight;
    const canScrollUp = event.deltaY < 0 && scrollable.scrollTop > 0;
    const canScrollDown = event.deltaY > 0 && scrollable.scrollTop < maxScrollTop;
    if (canScrollUp || canScrollDown) {
      // O elemento interno continua processando a roda; apenas impedimos que o
      // evento alcance a página e transforme o editor em uma armadilha de scroll.
      event.stopPropagation();
    }
  }, { passive: true });
}

function enhanceEditor(section: HTMLElement): void {
  if (section.dataset.editorLayoutEnhanced === 'true') return;
  section.dataset.editorLayoutEnhanced = 'true';
  installFullscreenButton(section);
  installResizeSeparator(section);
  installEditorWheelContainment(section);
}

function enhanceEditors(): void {
  for (const section of document.querySelectorAll<HTMLElement>('.embedded-ide')) {
    enhanceEditor(section);
  }

  if (!document.querySelector('.embedded-ide-fullscreen')) {
    document.body.classList.remove('embedded-ide-fullscreen-open');
  }
}

export function installEmbeddedEditorLayout(): void {
  enhanceEditors();

  observer?.disconnect();
  observer = new MutationObserver(enhanceEditors);
  observer.observe(document.body, { childList: true, subtree: true });

  if (!escapeListenerInstalled) {
    escapeListenerInstalled = true;
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const section = document.querySelector<HTMLElement>(
        '.embedded-ide-fullscreen',
      );
      const button = section?.querySelector<HTMLButtonElement>(
        '[data-editor-fullscreen-button]',
      );
      if (section && button) toggleFullscreen(section, button);
    });
  }
}
