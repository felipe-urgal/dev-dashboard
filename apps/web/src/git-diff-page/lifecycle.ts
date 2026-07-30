import { createApp } from 'vue';

import ProjectGitDiffPage from '../components/ProjectGitDiffPage.vue';
import { isLegacyDiffSection, projectIdFromLocation } from './dom-helpers';
import { mountedApps } from './state';

export function enhanceDiffSection(section: HTMLElement): void {
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

export function cleanup(root: Node): void {
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
