import { h, render } from 'vue';

export function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function mountIcon(host: HTMLElement, component: Parameters<typeof h>[0], className: string): void {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
}
