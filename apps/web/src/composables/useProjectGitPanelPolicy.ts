import type {
  Project,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  amendProjectGit,
  commitProjectGit,
  createProjectGitBranch,
  prepareProjectGitMutation,
} from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { useProjectGitPanel } from './useProjectGitPanel';

export function useProjectGitPanelPolicy(
  props: Readonly<{ project: Project }>,
  route: { query: Record<string, unknown> } | undefined,
  emit: (event: 'git-updated', overview: ProjectGitOverview) => void,
) {
  const panel = useProjectGitPanel(props, route, emit);

  async function runMutation(
    operation: 'create-branch' | 'switch-branch',
    target: string,
  ): Promise<void> {
    if (operation !== 'create-branch') {
      await panel.runMutation(operation, target);
      return;
    }

    if (panel.mutationRunning.value) return;
    const trimmed = target.trim();
    if (!trimmed) {
      panel.mutationErrorMessage.value = 'Informe o nome da branch.';
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Criar branch?',
      message:
        `A branch "${trimmed}" será criada a partir do HEAD atual. `
        + 'As alterações locais não commitadas serão mantidas na nova branch.',
      confirmLabel: 'Criar branch',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        operation,
        trimmed,
      );
      const branch = await createProjectGitBranch(
        props.project.id,
        trimmed,
        confirmation.token,
      );
      panel.mutationMessage.value =
        `Branch "${branch}" criada e selecionada. Alterações locais preservadas.`;
      panel.createBranchName.value = '';
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a operação.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  async function runCommit(): Promise<void> {
    if (panel.mutationRunning.value) return;
    const message = panel.commitMessage.value.trim();
    if (!message) {
      panel.mutationErrorMessage.value = 'Informe uma mensagem de commit.';
      return;
    }

    const amend = panel.commitMode.value === 'amend';
    const confirmed = await confirmDialog({
      title: amend ? 'Alterar último commit?' : 'Criar commit?',
      message: amend
        ? `O último commit será alterado para "${message}" e incluirá as alterações atuais.`
        : `O commit "${message}" incluirá todas as alterações rastreadas.`,
      confirmLabel: amend ? 'Alterar commit' : 'Criar commit',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const operation = amend ? 'amend' : 'commit';
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        operation,
        message,
      );
      const commit = amend
        ? await amendProjectGit(
            props.project.id,
            message,
            confirmation.token,
          )
        : await commitProjectGit(
            props.project.id,
            message,
            true,
            confirmation.token,
          );
      panel.mutationMessage.value = amend
        ? `Commit "${commit.shortHash}" alterado: ${commit.subject}`
        : `Commit "${commit.shortHash}" criado: ${commit.subject}`;
      panel.commitMessage.value = '';
      panel.commitMode.value = 'create';
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : amend
            ? 'Não foi possível alterar o último commit.'
            : 'Não foi possível criar o commit.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  return {
    ...panel,
    runMutation,
    runCommit,
  };
}
