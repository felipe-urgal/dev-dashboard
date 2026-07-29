import { h, render, type Component } from 'vue';
import {
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  CodeBracketIcon,
  DocumentMagnifyingGlassIcon,
  ServerStackIcon,
  Squares2X2Icon,
} from '@heroicons/vue/24/outline';

const iconByLabel: Record<string, Component> = {
  Resumo: Squares2X2Icon,
  Branches: CodeBracketIcon,
  Sincronização: ArrowsRightLeftIcon,
  Commit: CheckCircleIcon,
  Stash: ArchiveBoxIcon,
  Diff: DocumentMagnifyingGlassIcon,
  Histórico: ClockIcon,
};

function mountIcon(
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
