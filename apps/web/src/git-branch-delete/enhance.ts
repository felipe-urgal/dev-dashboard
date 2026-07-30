import { ExclamationTriangleIcon, TrashIcon } from '@heroicons/vue/24/outline';

import { mountIcon, projectIdFromLocation } from './dom-helpers';
import { requestJson } from './network';
import {
  isCurrentBranch,
  isLocalBranch,
  protectionReason,
  refreshBranches,
  selectedBranch,
} from './panel-info';
import type { ConfirmationResponse, DeleteResponse } from './types';

export function enhancePanel(panel: HTMLElement): void {
  const branch = selectedBranch(panel);
  const local = isLocalBranch(panel);
  const current = isCurrentBranch(panel);
  const signature = `${local ? 'local' : 'remote'}:${branch}:${current ? 'current' : 'idle'}`;
  if (panel.dataset.branchDeleteSignature === signature) return;
  panel.dataset.branchDeleteSignature = signature;
  panel.querySelector('.git-branch-delete-zone')?.remove();
  if (!local || !branch) return;

  const zone = document.createElement('section');
  zone.className = 'git-branch-delete-zone';
  const heading = document.createElement('div');
  mountIcon(heading, ExclamationTriangleIcon, 'git-branch-delete-warning-icon');
  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Zona de atenção';
  const title = document.createElement('strong');
  title.textContent = 'Remover branch local';
  const description = document.createElement('p');
  description.textContent = 'A remoção usa o modo seguro do Git e será recusada caso existam commits ainda não integrados.';
  copy.append(eyebrow, title, description);
  heading.append(copy);

  const status = document.createElement('p');
  status.className = 'git-branch-delete-status';
  status.hidden = true;

  const reason = protectionReason(branch, current);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-branch-delete-button';
  button.disabled = Boolean(reason);
  mountIcon(button, TrashIcon, 'git-branch-delete-button-icon');
  const buttonLabel = document.createElement('span');
  buttonLabel.textContent = reason ? 'Branch protegida' : 'Remover branch';
  button.append(buttonLabel);

  if (reason) {
    status.hidden = false;
    status.textContent = reason;
  } else {
    button.addEventListener('click', async () => {
      const confirmed = window.confirm(
        `Remover a branch local "${branch}"? Esta ação só será concluída se a branch estiver integrada.`,
      );
      if (!confirmed) return;
      const projectId = projectIdFromLocation();
      if (!projectId) return;
      button.disabled = true;
      status.hidden = false;
      status.classList.remove('is-error', 'is-success');
      status.textContent = `Removendo "${branch}"…`;
      try {
        const confirmation = await requestJson<ConfirmationResponse>(
          `/api/projects/${encodeURIComponent(projectId)}/git/branches/delete/confirmations`,
          {
            method: 'POST',
            body: JSON.stringify({ branch }),
          },
        );
        const result = await requestJson<DeleteResponse>(
          `/api/projects/${encodeURIComponent(projectId)}/git/branches/delete`,
          {
            method: 'POST',
            body: JSON.stringify({
              branch,
              confirmationToken: confirmation.confirmation.token,
            }),
          },
        );
        status.classList.add('is-success');
        status.textContent = `Branch "${result.branch.branch}" removida.`;
        refreshBranches();
      } catch (error) {
        button.disabled = false;
        status.classList.add('is-error');
        status.textContent = error instanceof Error
          ? error.message
          : 'Não foi possível remover a branch.';
      }
    });
  }

  zone.append(heading, button, status);
  panel.append(zone);
}
