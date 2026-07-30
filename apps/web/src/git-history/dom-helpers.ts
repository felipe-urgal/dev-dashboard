import { h, render } from 'vue';

export function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function mountIcon(
  host: HTMLElement,
  component: Parameters<typeof h>[0],
  className: string,
): HTMLElement {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
  return iconHost;
}

export async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  const payload = await response.json().catch(() => null) as T | { message?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'message' in payload && payload.message
        ? payload.message
        : `A API respondeu com HTTP ${response.status}.`,
    );
  }
  return payload as T;
}
