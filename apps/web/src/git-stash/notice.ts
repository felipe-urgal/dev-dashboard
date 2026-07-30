import type { PersistedNotice } from './types';

const NOTICE_KEY = 'dev-dashboard-git-stash-notice';

export function setNotice(section: HTMLElement, message: string, tone: 'success' | 'error' | 'info' = 'info'): void {
  const host = section.querySelector<HTMLElement>('.git-stash-notice');
  if (!host) return;
  host.textContent = message;
  host.className = `git-stash-notice is-${tone}`;
  host.hidden = !message;
}

export function persistAndReload(message: string, selectedReference?: string): void {
  const notice: PersistedNotice = {
    message,
    ...(selectedReference ? { selectedReference } : {}),
  };
  window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice));
  window.location.reload();
}

export function readPersistedNotice(): PersistedNotice | null {
  const raw = window.sessionStorage.getItem(NOTICE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(NOTICE_KEY);
  try {
    return JSON.parse(raw) as PersistedNotice;
  } catch {
    return null;
  }
}
