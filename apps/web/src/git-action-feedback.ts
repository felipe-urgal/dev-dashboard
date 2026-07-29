import { h, render } from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/vue/24/outline';

type ActionTone = 'running' | 'success' | 'error';

type CompatibleTimer = number | ReturnType<typeof setTimeout>;

interface PendingTrigger {
  element: HTMLElement;
  label: string;
  expiresAt: number;
}

interface ActionSession {
  trigger: HTMLElement;
  label: string;
  activeRequests: number;
  failed: boolean;
  settleTimer: CompatibleTimer | undefined;
  toast: HTMLElement;
}

let pendingTrigger: PendingTrigger | null = null;
let activeSession: ActionSession | null = null;

function actionLabel(element: HTMLElement): string {
  const label = element.getAttribute('aria-label')
    ?? element.getAttribute('title')
    ?? element.textContent
    ?? 'ação Git';
  return label.replace(/\s+/g, ' ').replace(/…/g, '').trim() || 'ação Git';
}

function actionElement(event: Event): HTMLElement | null {
  if (event.type === 'submit') {
    const submitter = (event as SubmitEvent).submitter;
    if (submitter instanceof HTMLElement) return submitter;
    const form = event.target;
    return form instanceof HTMLFormElement
      ? form.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]')
      : null;
  }
  const target = event.target;
  return target instanceof Element
    ? target.closest<HTMLElement>('button, [role="button"], a')
    : null;
}

function rememberTrigger(event: Event): void {
  if (activeSession) return;
  const element = actionElement(event);
  if (!element || !element.closest('.git-modern-panel')) return;
  pendingTrigger = {
    element,
    label: actionLabel(element),
    expiresAt: Date.now() + 120_000,
  };
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return new URL(input.url, window.location.href);
    }
    return new URL(String(input), window.location.href);
  } catch {
    return null;
  }
}

function isGitRequest(input: RequestInfo | URL): boolean {
  const url = requestUrl(input);
  return Boolean(url && /\/api\/projects\/[^/]+\/git(?:\/|$)/.test(url.pathname));
}

function mountIcon(host: HTMLElement, component: Parameters<typeof h>[0]): void {
  const iconHost = document.createElement('span');
  iconHost.className = 'git-action-feedback-icon';
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: 'git-action-feedback-icon-svg' }), iconHost);
  host.append(iconHost);
}

function toastContainer(): HTMLElement {
  let container = document.querySelector<HTMLElement>('.git-action-feedback-stack');
  if (container) return container;
  container = document.createElement('div');
  container.className = 'git-action-feedback-stack';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  document.body.append(container);
  return container;
}

function renderToast(toast: HTMLElement, tone: ActionTone, label: string): void {
  toast.className = `git-action-feedback-toast is-${tone}`;
  toast.replaceChildren();
  mountIcon(
    toast,
    tone === 'running'
      ? ArrowPathIcon
      : tone === 'success'
        ? CheckCircleIcon
        : ExclamationCircleIcon,
  );
  const copy = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = tone === 'running'
    ? 'Executando ação Git'
    : tone === 'success'
      ? 'Ação concluída'
      : 'A ação falhou';
  const span = document.createElement('span');
  span.textContent = label;
  copy.append(strong, span);
  toast.append(copy);
}

function startSession(): ActionSession | null {
  const pending = pendingTrigger;
  if (!pending || pending.expiresAt < Date.now() || !pending.element.isConnected) {
    pendingTrigger = null;
    return null;
  }
  pendingTrigger = null;
  const toast = document.createElement('div');
  renderToast(toast, 'running', pending.label);
  toastContainer().append(toast);
  pending.element.classList.add('is-git-action-running');
  pending.element.setAttribute('aria-busy', 'true');
  const session: ActionSession = {
    trigger: pending.element,
    label: pending.label,
    activeRequests: 0,
    failed: false,
    settleTimer: undefined,
    toast,
  };
  activeSession = session;
  return session;
}

function beginRequest(): ActionSession | null {
  const session = activeSession ?? startSession();
  if (!session) return null;
  if (session.settleTimer) {
    clearTimeout(session.settleTimer);
    session.settleTimer = undefined;
  }
  session.activeRequests += 1;
  return session;
}

function finishSession(session: ActionSession): void {
  if (activeSession !== session) return;
  activeSession = null;
  session.trigger.classList.remove('is-git-action-running');
  session.trigger.removeAttribute('aria-busy');
  renderToast(session.toast, session.failed ? 'error' : 'success', session.label);
  window.setTimeout(() => {
    session.toast.remove();
  }, session.failed ? 3_500 : 1_800);
}

function finishRequest(session: ActionSession, success: boolean): void {
  session.failed ||= !success;
  session.activeRequests = Math.max(0, session.activeRequests - 1);
  if (session.activeRequests > 0) return;
  session.settleTimer = window.setTimeout(() => finishSession(session), 350);
}

export function installGitActionFeedback(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitActionFeedback === 'true') return;
  document.documentElement.dataset.gitActionFeedback = 'true';

  document.addEventListener('click', rememberTrigger, true);
  document.addEventListener('submit', rememberTrigger, true);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isGitRequest(input)) return originalFetch(input, init);
    const session = beginRequest();
    if (!session) return originalFetch(input, init);
    try {
      const response = await originalFetch(input, init);
      finishRequest(session, response.ok);
      return response;
    } catch (error) {
      finishRequest(session, false);
      throw error;
    }
  };
}
