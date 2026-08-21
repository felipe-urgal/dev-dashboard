import { ref, watch } from 'vue';

import type { Project, ProjectGitOverview } from '@dev-dashboard/contracts';

import { createProjectGitBranch, prepareProjectGitMutation } from '../api';
import {
  forcePushProjectGitBranchWithLease,
  prepareProjectGitBranchPublish,
  prepareProjectGitForcePushWithLease,
  publishProjectGitBranch,
} from '../api/git-branch-publish';
import {
  fetchProjectGitBranchSquashStatus,
  prepareProjectGitBranchSquash,
  squashProjectGitBranch,
} from '../api/git-branch-squash';
import { confirmDialog } from '../stores/app-dialog';
import { useProjectGitPanel } from './useProjectGitPanel';

export function useProjectGitPanelPolicy(
  props: Readonly<{ project: Project }>,
  route: { query: Record<string, unknown> } | undefined,
  emit: (event: 'git-updated', overview: ProjectGitOverview) => void,
) {
  const panel = useProjectGitPanel(props, route, emit);
  const pendingPushBranch = ref<string | null>(null);
  const squashCommitCount = ref(0);
  let squashStatusGeneration = 0;

  async function refreshSquashStatus(branch?: string): Promise<void> {
    const requestGeneration = ++squashStatusGeneration;
    const target = branch?.trim() ?? '';
    if (!target || target === 'main' || target === 'master') {
      squashCommitCount.value = 0;
      return;
    }

    try {
      const status = await fetchProjectGitBranchSquashStatus(
        props.project.id,
        target,
      );
      if (
        requestGeneration === squashStatusGeneration &&
        panel.overview.value?.branch === target
      ) {
        squashCommitCount.value = status.commitCount;
      }
    } catch {
      if (requestGeneration === squashStatusGeneration) {
        squashCommitCount.value = 0;
      }
    }
  }

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

    const alreadyPublished = (panel.workspace.value?.branches ?? []).some(
      (candidate) =>
        candidate.kind === 'remote' &&
        candidate.remote === 'origin' &&
        candidate.shortName === trimmed,
    );

    const confirmed = await confirmDialog({
      title: alreadyPublished ? 'Enviar novos commits?' : 'Publicar branch?',
      message: alreadyPublished
        ? `Os commits novos da branch "${trimmed}" serão enviados para origin/${trimmed}.`
        : `A branch "${trimmed}" será enviada para origin e passará a rastrear ` +
          `origin/${trimmed}.`,
      confirmLabel: alreadyPublished ? 'Enviar' : 'Publicar',
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
      panel.mutationMessage.value = alreadyPublished
        ? `Commits novos de "${publishedBranch}" enviados para origin/${publishedBranch}.`
        : `Branch "${publishedBranch}" publicada em origin/${publishedBranch}.`;
      if (pendingPushBranch.value === publishedBranch) {
        pendingPushBranch.value = null;
      }
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar a branch para o origin.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  async function runSquashBranch(
    branch: string,
    message: string,
  ): Promise<void> {
    if (panel.mutationRunning.value || panel.remoteRefreshRunning.value) return;
    const trimmedBranch = branch.trim();
    const trimmedMessage = message.trim();
    if (!trimmedBranch || !trimmedMessage) return;

    const alreadyPublished = (panel.workspace.value?.branches ?? []).some(
      (candidate) =>
        candidate.kind === 'remote' &&
        candidate.remote === 'origin' &&
        candidate.shortName === trimmedBranch,
    );

    panel.mutationRunning.value = true;
    panel.mutationMessage.value = '';
    panel.mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitBranchSquash(
        props.project.id,
        trimmedBranch,
      );
      const squashedBranch = await squashProjectGitBranch(
        props.project.id,
        trimmedBranch,
        trimmedMessage,
        confirmation.token,
      );
      squashCommitCount.value = 1;
      if (alreadyPublished) {
        panel.amendedBranch.value = squashedBranch;
        panel.mutationMessage.value =
          `Squash concluído em "${squashedBranch}". ` +
          `Reenvie a branch para origin/${squashedBranch} com lease.`;
      } else {
        if (panel.amendedBranch.value === squashedBranch) {
          panel.amendedBranch.value = null;
        }
        panel.mutationMessage.value = `Squash concluído: "${squashedBranch}" agora possui um único commit exclusivo.`;
      }
      pendingPushBranch.value = null;
      await panel.reloadGitData();
    } catch (error) {
      panel.mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível fazer squash dos commits da branch.';
    } finally {
      panel.mutationRunning.value = false;
    }
  }

  async function runForcePushWithLease(branchOverride?: string): Promise<void> {
    const branch = branchOverride ?? panel.amendedBranch.value;
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
      if (panel.amendedBranch.value === pushedBranch) {
        panel.amendedBranch.value = null;
      }
      pendingPushBranch.value = null;
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

  async function runCommit(): Promise<void> {
    const mode = panel.commitMode.value;
    const branch = panel.overview.value?.branch;
    const previousHash = panel.overview.value?.latestCommit?.hash;

    await panel.runCommit();

    if (
      mode !== 'create' ||
      !branch ||
      branch === 'main' ||
      branch === 'master'
    ) {
      return;
    }

    const currentHash = panel.overview.value?.latestCommit?.hash;
    if (currentHash && currentHash !== previousHash) {
      pendingPushBranch.value = branch;
    }
  }

  watch(
    () => [props.project.id, panel.overview.value?.branch] as const,
    ([, branch]) => {
      if (pendingPushBranch.value && pendingPushBranch.value !== branch) {
        pendingPushBranch.value = null;
      }
    },
  );

  watch(
    () => [
      props.project.id,
      panel.overview.value?.branch,
      panel.overview.value?.latestCommit?.hash,
    ] as const,
    ([, branch]) => {
      void refreshSquashStatus(branch);
    },
  );

  return {
    ...panel,
    pendingPushBranch,
    squashCommitCount,
    runMutation,
    runPublishBranch,
    runSquashBranch,
    runForcePushWithLease,
    runCommit,
  };
}
