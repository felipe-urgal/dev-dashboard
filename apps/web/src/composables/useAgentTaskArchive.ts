import { type Ref } from 'vue';

import {
  archiveAgentTask,
  type AgentTaskRecord,
  type AgentTaskState,
} from '../api/agent-runtime';

interface ArchiveTarget {
  projectId: string;
  taskId: string;
  state: AgentTaskState;
  archived: boolean;
  activeExecution: boolean;
}

interface ArchiveClient {
  archive: typeof archiveAgentTask;
}

/**
 * Archives only the selected, finished task. Navigation and unmount invalidate
 * responses (including A → B → A), while the shared mutation lock remains
 * held until the request actually settles. The API owns archive eligibility.
 */
export function useAgentTaskArchive(
  currentTarget: () => ArchiveTarget | null,
  mutating: Ref<boolean>,
  applyArchived: (record: AgentTaskRecord) => void,
  refreshHistory: () => Promise<void>,
  reloadTask: (taskId: string) => Promise<void>,
  reportError: (message: string) => void,
  clearError: () => void,
  client: ArchiveClient = { archive: archiveAgentTask },
) {
  let generation = 0;

  function invalidateArchive(): void {
    generation += 1;
    // Do not release the lock: an already-dispatched write may still finish.
  }

  function isCurrent(target: ArchiveTarget, version: number): boolean {
    const selected = currentTarget();
    return (
      version === generation &&
      selected?.projectId === target.projectId &&
      selected.taskId === target.taskId
    );
  }

  async function reloadIfCurrent(
    target: ArchiveTarget,
    version: number,
  ): Promise<void> {
    if (!isCurrent(target, version)) return;
    try {
      await reloadTask(target.taskId);
    } catch {
      // No automatic retry of an ambiguous archive operation.
    }
  }

  async function archiveCurrent(): Promise<void> {
    const target = currentTarget();
    if (
      !target ||
      !['completed', 'cancelled'].includes(target.state) ||
      target.archived ||
      target.activeExecution ||
      mutating.value
    )
      return;

    const version = generation;
    mutating.value = true;
    clearError();
    try {
      const archived = await client.archive(target.projectId, target.taskId);
      if (!isCurrent(target, version)) return;
      if (
        archived.task.projectId !== target.projectId ||
        archived.task.id !== target.taskId ||
        !archived.task.archivedAt
      ) {
        throw new Error('A resposta de arquivamento não corresponde à task selecionada.');
      }

      applyArchived(archived);
      await refreshHistory();
    } catch (error) {
      if (!isCurrent(target, version)) return;
      reportError(
        error instanceof Error ? error.message : 'Não foi possível arquivar a task.',
      );
      await reloadIfCurrent(target, version);
    } finally {
      mutating.value = false;
    }
  }

  return { archiveCurrent, invalidateArchive };
}
