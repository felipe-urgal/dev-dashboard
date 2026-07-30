import { h, render, type Component } from 'vue';

export function mountIcon(
  host: HTMLElement,
  icon: Component,
  className: string,
  tagName: 'span' | 'i' = 'span',
): void {
  if (host.dataset.heroiconReady === 'true') return;

  const iconHost = document.createElement(tagName);
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(icon, { class: `${className}-svg` }), iconHost);
  host.prepend(iconHost);
  host.dataset.heroiconReady = 'true';
}
