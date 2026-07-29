import {
  createApp,
  type App,
} from 'vue';

import ProjectGitDiffPage from './components/ProjectGitDiffPage.vue';

const mountedApps = new Map<HTMLElement, App<Element>>();

function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function isLegacyDiffSection(section: HTMLElement): boolean {
  if (!section.matches('.git-tab-page')) return false;
  const heading = section.querySelector('h2');
  return heading?.textContent?.trim() === 'Diferenças por arquivo';
}

function enhanceDiffSection(section: HTMLElement): void {
  if (section.dataset.gitDiffPageEnhanced === 'true') return;
  if (!isLegacyDiffSection(section)) return;

  const projectId = projectIdFromLocation();
  if (!projectId) return;

  section.dataset.gitDiffPageEnhanced = 'true';
  section.classList.add('git-diff-page-host');

  const app = createApp(ProjectGitDiffPage, { projectId });
  mountedApps.set(section, app);
  app.mount(section);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement) enhanceDiffSection(root);
  root.querySelectorAll<HTMLElement>('.git-tab-page').forEach(enhanceDiffSection);
}

function cleanup(root: Node): void {
  if (!(root instanceof HTMLElement)) return;
  const hosts = [
    ...(root.dataset.gitDiffPageEnhanced === 'true' ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('[data-git-diff-page-enhanced="true"]'),
  ];

  hosts.forEach((host) => {
    const app = mountedApps.get(host);
    if (!app) return;
    app.unmount();
    mountedApps.delete(host);
  });
}

export function installGitDiffPageEnhancer(): void {
  if (typeof document === 'undefined') return;
  scan(document);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach(cleanup);
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scan(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
