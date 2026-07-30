import { h, render } from 'vue';
import { ServerStackIcon } from '@heroicons/vue/24/outline';

import { serverPath } from './dom-helpers';
import { statusDescription } from './status';
import type { ManagedProcessSnapshot } from './types';

export function ensureIndicator(projectId: string): HTMLAnchorElement | null {
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

export function updateIndicator(
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
