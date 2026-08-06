import type { Project, ProjectGitOverview } from '@dev-dashboard/contracts';

import { createProjectGitBranch, prepareProjectGitMutation } from '../api';
import {
  forcePushProjectGitBranchWithLease,
  prepareProjectGitBranchPublish,
  prepareProjectGitForcePushWithLease,
  publishProjectGitBranch,
} from '../api/git-branch-publish';
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
        `A branch "${trimmed}" será criada a partir do HEAD atual. ` +
        'As alterações locais não commitadas serão mantidas na nova branch.',
      confirmLabel: 'Criar branch',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';
    panel.changeImpact.value = null;

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
      panel.mutationMessage.value = `Branch "${branch}" criada e selecionada. Alterações locais preservadas.`;
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

  async function runPublishBranch(branch: string): Promise<void> {
    if (panel.mutationRunning.value || panel.remoteRefreshRunning.value) return;
    const trimmed = branch.trim();
    if (!trimmed) return;

    const confirmed = await confirmDialog({
      title: 'Publicar branch?',
      message:
        `A branch "${trimmed}" será enviada para origin e passará a rastrear ` +
        `origin/${trimmed}.`,
      confirmLabel: 'Publicar',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitBranchPublish(
        props.project.id,
        trimmed,
      );
      const publishedBranch = await publishProjectGitBranch(
        props.project.id,
        trimmed,
        confirmation.token,
      );
      panel.mutationMessage.value = `Branch "${publishedBranch}" publicada em origin/${publishedBranch}.`;
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível publicar a branch no origin.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  async function runForcePushWithLease(): Promise<void> {
    const branch = panel.amendedBranch.value;
    if (!branch || panel.mutationRunning.value) return;

    const confirmed = await confirmDialog({
      title: 'Reenviar branch com lease?',
      message:
        `O histórico de origin/${branch} será atualizado para o commit alterado. ` +
        'O envio será recusado automaticamente se alguém tiver publicado novos commits depois da confirmação.',
      confirmLabel: 'Reenviar com lease',
      tone: 'warning',
    });
    if (!confirmed) return;

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitForcePushWithLease(
        props.project.id,
        branch,
      );
      const pushedBranch = await forcePushProjectGitBranchWithLease(
        props.project.id,
        branch,
        confirmation.token,
      );
      panel.amendedBranch.value = null;
      panel.mutationMessage.value = `Branch "${pushedBranch}" atualizada em origin/${pushedBranch} com lease.`;
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível reenviar a branch com lease.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  return {
    ...panel,
    runMutation,
    runPublishBranch,
    runForcePushWithLease,
  };
}
