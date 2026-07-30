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
  const confirmation = `Guardar ${state.changedFiles} alteração(ões) da branch "${state.branch}" no stash${message ? ` como "${message}"` : ''}?`;
  if (!window.confirm(confirmation)) return;

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

  const question = operation === 'apply'
    ? `Aplicar "${detail.message}" e manter o stash salvo?`
    : operation === 'pop'
      ? `Restaurar "${detail.message}" e remover o stash da lista?`
      : `Excluir definitivamente "${detail.message}" sem restaurar as alterações?`;
  if (!window.confirm(question)) return;

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
    const message = operation === 'apply'
      ? `Stash aplicado e preservado: ${response.result.stash.message}`
      : operation === 'pop'
        ? `Stash restaurado e removido: ${response.result.stash.message}`
        : `Stash excluído: ${response.result.stash.message}`;
    persistAndReload(message, operation === 'apply' ? detail.reference : undefined);
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
