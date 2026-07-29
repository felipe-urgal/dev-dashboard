import { h, render, type Component } from 'vue';
import {
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  CodeBracketIcon,
  CommitIcon,
  DocumentMagnifyingGlassIcon,
  ServerStackIcon,
  Squares2X2Icon,
} from '@heroicons/vue/24/outline';

const iconByLabel: Record<string, Component> = {
  Resumo: Squares2X2Icon,
  Branches: CodeBracketIcon,
  Sincronização: ArrowsRightLeftIcon,
  Commit: CommitIcon,
  Stash: ArchiveBoxIcon,
  Diff: DocumentMagnifyingGlassIcon,
  Histórico: ClockIcon,
};

function mountIcon(host: HTMLElement, icon: Component, className: string): void {
  if (host.dataset.heroiconReady === 'true') return;

  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(icon, { class: `${className}-svg` }), iconHost);
  host.prepend(iconHost);
  host.dataset.heroiconReady = 'true';
}

function enhanceGitIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.git-subtabs button').forEach((button) => {
    const label = button.textContent?.trim() ?? '';
    const icon = iconByLabel[label];
    if (icon) mountIcon(button, icon, 'git-tab-heroicon');
  });

  root.querySelectorAll<HTMLElement>('.git-server-indicator').forEach((indicator) => {
    mountIcon(indicator, ServerStackIcon, 'git-server-heroicon');
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
