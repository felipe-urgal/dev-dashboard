import { h, render } from 'vue';

import { requestJson as requestApiJson } from '../api/core';

export function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function mountIcon(
  host: HTMLElement,
  component: Parameters<typeof h>[0],
  className: string,
): void {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
}

export async function requestJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  return requestApiJson<T>(url, signal ? { signal } : undefined);
}

export function currentBranchFromSection(section: HTMLElement): string {
  return (
    section
      .querySelector<HTMLElement>('.git-status-grid article:first-child strong')
      ?.textContent?.trim() ?? ''
  );
}
