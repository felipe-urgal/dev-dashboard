import { DocumentCheckIcon } from '@heroicons/vue/24/outline';

import { mountIcon } from './dom-helpers';

export function addPageHeading(section: HTMLElement, branch: string): void {
  const heading = document.createElement('header');
  heading.className = 'git-commit-page-heading';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'git-commit-page-title';
  mountIcon(titleGroup, DocumentCheckIcon, 'git-commit-heading-icon');

  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Commit';
  const title = document.createElement('h2');
  title.textContent = 'Preparar e registrar alterações';
  const description = document.createElement('p');
  description.textContent = 'Revise os arquivos, escolha o escopo e crie um commit com uma mensagem clara.';
  copy.append(eyebrow, title, description);
  titleGroup.append(copy);

  const branchBadge = document.createElement('span');
  branchBadge.className = 'git-commit-branch-badge';
  branchBadge.textContent = branch || 'HEAD';

  heading.append(titleGroup, branchBadge);
  section.prepend(heading);
}
