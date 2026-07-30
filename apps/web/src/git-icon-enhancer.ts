import { ServerStackIcon } from '@heroicons/vue/24/outline';

import { iconByLabel } from './git-icon/constants';
import { mountIcon } from './git-icon/dom-helpers';

function enhanceGitIcons(root: ParentNode = document): void {
  const tabButtons = [
    ...(root instanceof HTMLElement && root.matches('.git-subtabs button') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('.git-subtabs button'),
  ];
  tabButtons.forEach((button) => {
    const label = button.textContent?.trim() ?? '';
    const icon = iconByLabel[label];
    if (icon) mountIcon(button, icon, 'git-tab-heroicon');
  });

  const indicators = [
    ...(root instanceof HTMLElement && root.matches('.git-server-indicator') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('.git-server-indicator'),
  ];
  indicators.forEach((indicator) => {
    mountIcon(indicator, ServerStackIcon, 'git-server-heroicon', 'i');
  });
}

export function installGitIconEnhancer(): void {
  if (typeof document === 'undefined') return;

  enhanceGitIcons(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) enhanceGitIcons(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
