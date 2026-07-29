import { h, render } from 'vue';
import {
  ExclamationTriangleIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

interface ConfirmationResponse {
  confirmation: {
    token: string;
    operation: 'delete-branch';
    target: string;
    expiresAt: string;
  };
}

interface DeleteResponse {
  branch: { branch: string };
}

function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function mountIcon(host: HTMLElement, component: Parameters<typeof h>[0], className: string): void {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null) as T | { message?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'message' in payload && payload.message
        ? payload.message
        : `A API respondeu com HTTP ${response.status}.`,
    );
  }
  return payload as T;
}

function selectedBranch(panel: HTMLElement): string {
  return panel.querySelector('h3')?.textContent?.trim() ?? '';
}

function isLocalBranch(panel: HTMLElement): boolean {
  return panel.querySelector('.section-kicker')?.textContent?.trim() === 'Branch local';
}

function isCurrentBranch(panel: HTMLElement): boolean {
  return panel.querySelector('.branch-state')?.textContent?.trim() === 'Atual';
}

function protectionReason(branch: string, current: boolean): string {
  if (current) return 'Troque para outra branch antes de remover esta branch.';
  if (branch === 'main' || branch === 'master') {
    return 'Branches principais são protegidas contra remoção no dashboard.';
  }
  return '';
}

function refreshBranches(): void {
  const button = document.querySelector<HTMLButtonElement>(
    '.git-branches-page .branches-page-heading .secondary-button',
  );
  button?.click();
}

function enhancePanel(panel: HTMLElement): void {
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

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-branches-page .branch-detail-panel')) {
    enhancePanel(root);
  }
  root.querySelectorAll<HTMLElement>('.git-branches-page .branch-detail-panel').forEach(enhancePanel);
}

export function installGitBranchDeleteEnhancer(): void {
  if (typeof document === 'undefined') return;
  scan();
  let scheduled = false;
  const scheduleScan = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan();
    });
  };
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
