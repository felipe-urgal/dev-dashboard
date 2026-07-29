import { h, render } from 'vue';
import { ServerStackIcon } from '@heroicons/vue/24/outline';

interface ManagedProcessSnapshot {
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  pid?: number | null;
  port?: number | null;
}

interface ProcessResponse {
  process: ManagedProcessSnapshot | null;
}

let activeProjectId = '';
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let requestGeneration = 0;

function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function serverPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/server`;
}

function statusDescription(process: ManagedProcessSnapshot | null): {
  label: string;
  detail: string;
  tone: string;
} {
  const detail = process?.port
    ? `porta ${process.port}`
    : process?.pid
      ? `PID ${process.pid}`
      : 'sem processo ativo';

  switch (process?.status) {
    case 'running':
      return { label: 'Servidor ativo', detail, tone: 'running' };
    case 'starting':
      return { label: 'Servidor iniciando', detail, tone: 'starting' };
    case 'stopping':
      return { label: 'Servidor parando', detail, tone: 'stopping' };
    case 'failed':
      return { label: 'Servidor falhou', detail, tone: 'failed' };
    default:
      return { label: 'Servidor parado', detail, tone: 'stopped' };
  }
}

function ensureIndicator(projectId: string): HTMLAnchorElement | null {
  const titleRow = document.querySelector<HTMLElement>('.project-title-row');
  if (!titleRow) return null;

  let indicator = titleRow.querySelector<HTMLAnchorElement>('.project-header-server-indicator');
  if (!indicator) {
    indicator = document.createElement('a');
    indicator.className = 'project-header-server-indicator is-loading';
    indicator.href = serverPath(projectId);
    indicator.setAttribute('aria-label', 'Abrir servidor do projeto');

    const iconHost = document.createElement('span');
    iconHost.className = 'project-header-server-icon';
    iconHost.setAttribute('aria-hidden', 'true');
    render(h(ServerStackIcon, { class: 'project-header-server-icon-svg' }), iconHost);

    const copy = document.createElement('span');
    copy.className = 'project-header-server-copy';
    const label = document.createElement('strong');
    label.textContent = 'Consultando servidor';
    const detail = document.createElement('small');
    detail.textContent = 'aguarde…';
    copy.append(label, detail);

    const dot = document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');

    indicator.append(dot, iconHost, copy);
    titleRow.append(indicator);
  }

  indicator.href = serverPath(projectId);
  return indicator;
}

function updateIndicator(
  indicator: HTMLAnchorElement,
  process: ManagedProcessSnapshot | null,
): void {
  const status = statusDescription(process);
  indicator.className = `project-header-server-indicator is-${status.tone}`;
  indicator.title = `${status.label} · ${status.detail}`;
  const label = indicator.querySelector('strong');
  const detail = indicator.querySelector('small');
  if (label) label.textContent = status.label;
  if (detail) detail.textContent = status.detail;
}

async function loadServerStatus(projectId: string): Promise<void> {
  const indicator = ensureIndicator(projectId);
  if (!indicator) return;
  const generation = ++requestGeneration;

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/process`,
      { credentials: 'same-origin' },
    );
    if (generation !== requestGeneration || projectId !== activeProjectId) return;
    if (!response.ok) {
      updateIndicator(indicator, null);
      return;
    }
    const payload = await response.json() as ProcessResponse;
    updateIndicator(indicator, payload.process);
  } catch {
    if (generation === requestGeneration && projectId === activeProjectId) {
      updateIndicator(indicator, null);
    }
  }
}

function synchronize(): void {
  const projectId = projectIdFromLocation();
  if (!projectId) {
    activeProjectId = '';
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
    return;
  }

  ensureIndicator(projectId);
  if (activeProjectId === projectId && refreshTimer) return;

  activeProjectId = projectId;
  if (refreshTimer) clearInterval(refreshTimer);
  void loadServerStatus(projectId);
  refreshTimer = setInterval(() => {
    void loadServerStatus(projectId);
  }, 10_000);
}

export function installProjectHeaderServerEnhancer(): void {
  if (typeof document === 'undefined') return;
  synchronize();

  const observer = new MutationObserver(() => synchronize());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('popstate', synchronize);
}
