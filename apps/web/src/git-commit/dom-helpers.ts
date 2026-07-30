import { h, render, type Component } from 'vue';

export function mountIcon(host: HTMLElement, icon: Component, className: string): void {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(icon, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
}
