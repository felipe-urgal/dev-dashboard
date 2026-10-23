import { ref, type Ref } from 'vue';

import type { TaskContext } from '@dev-dashboard/contracts';

import { fetchTaskContexts } from '../api/task-contexts';
import {
  adoptAgentBacklog,
  createAgentTask,
  type AgentBacklogIssue,
  type AgentCapability,
  type AgentTaskRecord,
} from '../api/agent-runtime';

interface CreationTarget {
  projectId: string;
  environmentInstanceId?: string;
  taskContextId?: string;
  requestedCapabilities: AgentCapability[];
}

interface AdoptionNotice {
  source: string;
  issue: AgentBacklogIssue;
  reused: boolean;
  taskContextId?: string;
}

interface CreationClient {
  create: typeof createAgentTask;
  adopt: typeof adoptAgentBacklog;
  fetchContexts: typeof fetchTaskContexts;
}

export function parseAgentBacklogInstruction(
  value: string,
): { issueNumber?: number } | null {
  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
  if (
    normalized === 'pegue a próxima atividade' ||
    normalized === 'pegue a proxima atividade' ||
    normalized === 'pegue a próxima issue' ||
    normalized === 'pegue a proxima issue'
  ) {
    return {};
  }

  const specific = /^pegue a #(\d+)$/.exec(normalized);
  if (!specific) return null;
  const issueNumber = Number(specific[1]);
  return Number.isSafeInteger(issueNumber) && issueNumber > 0
    ? { issueNumber }
    : null;
}

/**
 * Owns the create/adopt drafts and their single in-flight mutation.
 * Project/context navigation invalidates late replies, including A → B → A.
 * An ambiguous HTTP response is never automatically replayed.
 */
export function useAgentTaskCreation(
  currentTarget: () => CreationTarget,
  mutating: Ref<boolean>,
  onCreated: (result: {
    record: AgentTaskRecord;
    adoption?: AdoptionNotice;
    contexts?: TaskContext[];
  }) => void,
  reloadTask: (taskId: string) => Promise<void>,
  reportError: (message: string) => void,
  clearError: () => void,
  client: CreationClient = {
    create: createAgentTask,
    adopt: adoptAgentBacklog,
    fetchContexts: fetchTaskContexts,
  },
) {
  const instruction = ref('');
  const backlogCandidates = ref<AgentBacklogIssue[]>([]);
  const backlogSelectionSource = ref('');
  const backlogAdoptionNotice = ref<AdoptionNotice | null>(null);
  let generation = 0;

  function invalidateCreation(): void {
    generation += 1;
    // Keep the shared mutation lock until the dispatched request settles.
  }

  function resetCreation(): void {
    invalidateCreation();
    instruction.value = '';
    backlogCandidates.value = [];
    backlogSelectionSource.value = '';
    backlogAdoptionNotice.value = null;
  }

  function chooseBacklogIssue(issue: AgentBacklogIssue): void {
    instruction.value = 'pegue a #' + issue.number;
  }

  function isCurrent(target: CreationTarget, version: number): boolean {
    const selected = currentTarget();
    return (
      generation === version &&
      selected.projectId === target.projectId &&
      selected.environmentInstanceId === target.environmentInstanceId &&
      selected.taskContextId === target.taskContextId
    );
  }

  async function createTask(): Promise<void> {
    const summary = instruction.value.trim();
    if (!summary || mutating.value) return;
    const current = currentTarget();
    if (!current.projectId) return;

    const target: CreationTarget = {
      projectId: current.projectId,
      environmentInstanceId: current.environmentInstanceId,
      taskContextId: current.taskContextId,
      requestedCapabilities: [...current.requestedCapabilities],
    };
    const version = generation;
    const backlogIntent = parseAgentBacklogInstruction(summary);
    mutating.value = true;
    clearError();

    try {
      if (backlogIntent) {
        const adoption = await client.adopt(target.projectId, {
          ...backlogIntent,
          ...(target.environmentInstanceId
            ? { environmentInstanceId: target.environmentInstanceId }
            : {}),
          requestedCapabilities: [...target.requestedCapabilities],
        });
        if (!isCurrent(target, version)) return;

        if (adoption.status === 'ambiguous') {
          backlogCandidates.value = adoption.candidates;
          backlogSelectionSource.value = adoption.source;
          backlogAdoptionNotice.value = null;
          return;
        }

        if (adoption.task.task.projectId !== target.projectId) {
          throw new Error('A resposta não corresponde ao projeto selecionado.');
        }
        const contexts = await client.fetchContexts(target.projectId);
        if (!isCurrent(target, version)) return;
        const notice: AdoptionNotice = {
          source: adoption.source,
          issue: adoption.issue,
          reused: adoption.reused,
          ...(adoption.task.task.taskContextId
            ? { taskContextId: adoption.task.task.taskContextId }
            : {}),
        };
        onCreated({ record: adoption.task, adoption: notice, contexts });
        backlogAdoptionNotice.value = notice;
        instruction.value = '';
        backlogCandidates.value = [];
        backlogSelectionSource.value = '';
        if (isCurrent(target, version)) await reloadTask(adoption.task.task.id);
        return;
      }

      const record = await client.create(target.projectId, {
        summary,
        ...(target.taskContextId
          ? { taskContextId: target.taskContextId }
          : target.environmentInstanceId
            ? { environmentInstanceId: target.environmentInstanceId }
            : {}),
        requestedCapabilities: [...target.requestedCapabilities],
      });
      if (!isCurrent(target, version)) return;
      if (record.task.projectId !== target.projectId) {
        throw new Error('A resposta não corresponde ao projeto selecionado.');
      }
      onCreated({ record });
      instruction.value = '';
      backlogCandidates.value = [];
      backlogSelectionSource.value = '';
      backlogAdoptionNotice.value = null;
      if (isCurrent(target, version)) await reloadTask(record.task.id);
    } catch (error) {
      if (!isCurrent(target, version)) return;
      reportError(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar a task.',
      );
    } finally {
      mutating.value = false;
    }
  }

  return {
    instruction,
    backlogCandidates,
    backlogSelectionSource,
    backlogAdoptionNotice,
    invalidateCreation,
    resetCreation,
    chooseBacklogIssue,
    createTask,
  };
}
