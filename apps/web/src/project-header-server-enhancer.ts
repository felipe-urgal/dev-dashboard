import { projectIdFromLocation } from './project-header-server/dom-helpers';
import { ensureIndicator, updateIndicator } from './project-header-server/indicator';
import type { ProcessResponse } from './project-header-server/types';

let activeProjectId = '';
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let requestGeneration = 0;

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
