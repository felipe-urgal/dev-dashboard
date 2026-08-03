import { confirmDialog } from '../stores/app-dialog';
import { refreshControls } from './controls';
import { requestJson } from './dom-helpers';
import { persistAndReload, setNotice } from './notice';
import { stateBySection } from './state';
import type { ConfirmationResponse, MutationResponse, StashOperation, StashPageState } from './types';

async function prepareConfirmation(
  state: StashPageState,
  operation: StashOperation,
  target: string,
): Promise<string> {
  const response = await requestJson<ConfirmationResponse>(
    `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes/confirmations`,
    {
      method: 'POST',
      body: JSON.stringify({ operation, target }),
    },
  );
  return response.confirmation.token;
}

export async function runCreate(section: HTMLElement): Promise<void> {
  const state = stateBySection.get(section);
  if (!state || state.busy) return;
  const messageInput = section.querySelector<HTMLInputElement>('[data-stash-field="message"]');
  const includeUntracked = section.querySelector<HTMLInputElement>('[data-stash-field="untracked"]');
  const keepIndex = section.querySelector<HTMLInputElement>('[data-stash-field="keep-index"]');
  const message = messageInput?.value.trim() ?? '';
  const confirmed = await confirmDialog({
    title: 'Criar stash?',
    message: `As ${state.changedFiles} alteração(ões) da branch "${state.branch}" serão guardadas no stash${message ? ` como "${message}"` : ''}.`,
    confirmLabel: 'Criar stash',
    tone: 'warning',
  });
  if (!confirmed) return;

  state.busy = true;
  refreshControls(section);
  setNotice(section, 'Criando stash…');
  try {
    const token = await prepareConfirmation(state, 'create', state.branch);
    const response = await requestJson<MutationResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes`,
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          includeUntracked: includeUntracked?.checked ?? true,
          keepIndex: keepIndex?.checked ?? false,
          confirmationToken: token,
        }),
      },
    );
    persistAndReload(
      `Stash criado: ${response.result.stash.message}`,
      response.result.stash.reference,
    );
  } catch (error) {
    state.busy = false;
    setNotice(
      section,
      error instanceof Error ? error.message : 'Não foi possível criar o stash.',
      'error',
    );
    refreshControls(section);
  }
}

export async function runStashMutation(
  section: HTMLElement,
  operation: 'apply' | 'pop' | 'drop',
): Promise<void> {
  const state = stateBySection.get(section);
  const detail = state?.detail;
  if (!state || !detail || state.busy) return;
  if (operation !== 'drop' && state.changedFiles > 0) {
    setNotice(section, 'O working tree precisa estar limpo para restaurar este stash.', 'error');
    return;
  }

  const dialog = operation === 'apply'
    ? {
        title: 'Aplicar stash?',
        message: `As alterações de "${detail.message}" serão aplicadas e o stash continuará salvo.`,
        confirmLabel: 'Aplicar stash',
        tone: 'warning' as const,
      }
    : operation === 'pop'
      ? {
          title: 'Restaurar stash?',
          message: `As alterações de "${detail.message}" serão restauradas e o stash será removido da lista.`,
          confirmLabel: 'Restaurar stash',
          tone: 'warning' as const,
        }
      : {
          title: 'Excluir stash?',
          message: `O stash "${detail.message}" será excluído definitivamente sem restaurar as alterações.`,
          confirmLabel: 'Excluir stash',
          tone: 'danger' as const,
        };
  const confirmed = await confirmDialog(dialog);
  if (!confirmed) return;

  state.busy = true;
  refreshControls(section);
  setNotice(section, operation === 'drop' ? 'Excluindo stash…' : 'Restaurando stash…');
  try {
    const token = await prepareConfirmation(state, operation, detail.reference);
    const response = await requestJson<MutationResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes/${encodeURIComponent(detail.reference)}/${operation}`,
      {
        method: 'POST',
        body: JSON.stringify({ confirmationToken: token }),
      },
    );
    const resultMessage = operation === 'apply'
      ? `Stash aplicado e preservado: ${response.result.stash.message}`
      : operation === 'pop'
        ? `Stash restaurado e removido: ${response.result.stash.message}`
        : `Stash excluído: ${response.result.stash.message}`;
    persistAndReload(resultMessage, operation === 'apply' ? detail.reference : undefined);
  } catch (error) {
    state.busy = false;
    setNotice(
      section,
      error instanceof Error ? error.message : 'Não foi possível concluir a operação.',
      'error',
    );
    refreshControls(section);
  }
}
