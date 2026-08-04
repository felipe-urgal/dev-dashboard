const MIN_SIDEBAR_WIDTH = 190;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_SIDEBAR_WIDTH = 280;
const STORAGE_KEY = 'dev-dashboard:embedded-editor-sidebar-width';

const MIN_AI_WIDTH = 260;
const MAX_AI_WIDTH = 640;
const DEFAULT_AI_WIDTH = 320;
const AI_STORAGE_KEY = 'dev-dashboard:embedded-editor-ai-width';

let observer: MutationObserver | undefined;
let escapeListenerInstalled = false;

function clampSidebarWidth(value: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}

function readStoredWidth(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw.trim() === '') return DEFAULT_SIDEBAR_WIDTH;
    const stored = Number(raw);
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

function clampAiWidth(value: number): number {
  return Math.min(MAX_AI_WIDTH, Math.max(MIN_AI_WIDTH, value));
}

function readStoredAiWidth(): number {
  try {
    const raw = window.localStorage.getItem(AI_STORAGE_KEY);
    if (raw === null || raw.trim() === '') return DEFAULT_AI_WIDTH;
    const stored = Number(raw);
    return Number.isFinite(stored) ? clampAiWidth(stored) : DEFAULT_AI_WIDTH;
  } catch {
    return DEFAULT_AI_WIDTH;
  }
}

function storeAiWidth(value: number): void {
  try {
    window.localStorage.setItem(AI_STORAGE_KEY, String(value));
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

function setAiWidth(
  section: HTMLElement,
  separator: HTMLElement,
  width: number,
): void {
  const next = clampAiWidth(width);
  section.style.setProperty('--embedded-editor-ai-width', `${next}px`);
  separator.setAttribute('aria-valuenow', String(next));
  storeAiWidth(next);
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

/**
 * Instalado/removido a cada mutação (chamado fora da guarda de
 * `editorLayoutEnhanced`, que só roda uma vez): o painel de IA aparece e
 * desaparece via `v-if` do Vue, então o separador precisa acompanhar —
 * deixar um separador órfão quando o painel fecha faria o grid de 3 colunas
 * (sem IA) receber um 4º item sem coluna própria, reproduzindo o mesmo bug
 * de quebra de layout já corrigido para o próprio painel.
 */
function installAiResizeSeparator(section: HTMLElement): void {
  const shell = section.querySelector<HTMLElement>('.embedded-ide-shell');
  const aiPanel = shell?.querySelector<HTMLElement>('.embedded-ide-ai-panel');
  const existing = shell?.querySelector<HTMLElement>('[data-editor-ai-resize-separator]');

  if (!shell || !aiPanel) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const separator = document.createElement('div');
  separator.className = 'embedded-ide-resize-separator embedded-ide-ai-resize-separator';
  separator.dataset.editorAiResizeSeparator = 'true';
  separator.tabIndex = 0;
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-label', 'Redimensionar painel de IA');
  separator.setAttribute('aria-orientation', 'vertical');
  separator.setAttribute('aria-valuemin', String(MIN_AI_WIDTH));
  separator.setAttribute('aria-valuemax', String(MAX_AI_WIDTH));

  shell.insertBefore(separator, aiPanel);
  setAiWidth(section, separator, readStoredAiWidth());

  let startX = 0;
  let startWidth = DEFAULT_AI_WIDTH;

  const stopResize = (): void => {
    document.body.classList.remove('embedded-ide-resizing');
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  };

  // O painel fica à direita do separador: arrastar para a esquerda deve
  // aumentar sua largura, o oposto do separador da sidebar (à esquerda do
  // conteúdo que redimensiona).
  const handlePointerMove = (event: PointerEvent): void => {
    setAiWidth(section, separator, startWidth - (event.clientX - startX));
  };

  separator.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startX = event.clientX;
    startWidth = aiPanel.getBoundingClientRect().width;
    document.body.classList.add('embedded-ide-resizing');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  });

  separator.addEventListener('dblclick', () => {
    setAiWidth(section, separator, DEFAULT_AI_WIDTH);
  });

  separator.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = Number(separator.getAttribute('aria-valuenow')) || DEFAULT_AI_WIDTH;
    setAiWidth(section, separator, current + (event.key === 'ArrowLeft' ? 16 : -16));
  });
}

function wheelDeltaInPixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * window.innerHeight;
  }
  return event.deltaY;
}

function installEditorWheelChaining(section: HTMLElement): void {
  const area = section.querySelector<HTMLElement>('.embedded-ide-editor-area');
  if (!area || area.dataset.editorWheelChaining === 'true') return;
  area.dataset.editorWheelChaining = 'true';

  area.addEventListener('wheel', (event) => {
    if (
      section.classList.contains('embedded-ide-fullscreen')
      || event.deltaY === 0
      || Math.abs(event.deltaY) < Math.abs(event.deltaX)
    ) return;

    const target = event.target instanceof Element ? event.target : null;
    const scrollable = target?.closest<HTMLElement>('.monaco-scrollable-element')
      ?? area.querySelector<HTMLElement>('.monaco-scrollable-element');
    if (!scrollable) return;

    const maxScrollTop = Math.max(
      0,
      scrollable.scrollHeight - scrollable.clientHeight,
    );
    const canScrollUp = event.deltaY < 0 && scrollable.scrollTop > 1;
    const canScrollDown = event.deltaY > 0
      && scrollable.scrollTop < maxScrollTop - 1;
    if (canScrollUp || canScrollDown) return;

    // O Monaco consome a roda mesmo no limite. Interceptamos antes dele e
    // continuamos a rolagem no documento para o editor não prender a página.
    event.preventDefault();
    event.stopPropagation();
    window.scrollBy({
      top: wheelDeltaInPixels(event),
      left: 0,
      behavior: 'auto',
    });
  }, { passive: false, capture: true });
}

function enhanceEditor(section: HTMLElement): void {
  if (section.dataset.editorLayoutEnhanced !== 'true') {
    section.dataset.editorLayoutEnhanced = 'true';
    installFullscreenButton(section);
    installResizeSeparator(section);
    installEditorWheelChaining(section);
  }
  // Ao contrário das instalações acima (idempotentes, uma vez por seção), o
  // painel de IA some e reaparece com o toggle do usuário — precisa ser
  // reavaliado em toda mutação, não só na primeira vez.
  installAiResizeSeparator(section);
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
