import { ref, type Ref } from 'vue';

import {
  cancelAgentTask,
  executeAgentTask,
  recoverAgentTask,
  retryAgentTask,
  type AgentExecutionResult,
  type AgentProviderId,
  type AgentTaskRecord,
  type AgentTaskState,
} from '../api/agent-runtime';

interface LifecycleTarget {
  projectId: string;
  taskId: string;
  state: AgentTaskState;
  runtimeState: string;
  activeExecution: boolean;
}

interface ExecutionInput {
  providerId: AgentProviderId;
  attachmentIds: string[];
  profileId?: string;
}

interface LifecycleClient {
  execute: typeof executeAgentTask;
  cancel: typeof cancelAgentTask;
  retry: typeof retryAgentTask;
  recover: typeof recoverAgentTask;
}

/**
 * Owns the cockpit's task execution and lifecycle requests. The runtime is
 * authoritative for execution ownership, retry eligibility and recovery.
 * Neither a failed/ambiguous response nor a navigation change causes replay.
 */
export function useAgentTaskLifecycle(
  currentTarget: () => LifecycleTarget | null,
  canExecute: () => boolean,
  mutating: Ref<boolean>,
  onExecution: (result: AgentExecutionResult) => void,
  replaceTask: (record: AgentTaskRecord) => void,
  reloadTask: (target: LifecycleTarget) => Promise<void>,
  reportError: (message: string) => void,
  clearError: () => void,
  client: LifecycleClient = {
    execute: executeAgentTask,
    cancel: cancelAgentTask,
    retry: retryAgentTask,
    recover: recoverAgentTask,
  },
) {
  const executing = ref(false);
  let generation = 0;

  function resetLifecycle(): void {
    generation += 1;
    // A dispatched operation may still own the remote task. Keep both local
    // locks held until it settles rather than enabling a second mutation on
    // a task reached by A → B → A navigation.
  }

  function isCurrent(target: LifecycleTarget, version: number): boolean {
    const selected = currentTarget();
    return (
      version === generation &&
      selected?.projectId === target.projectId &&
      selected.taskId === target.taskId
    );
  }

  function assertRecord(
    record: AgentTaskRecord,
    target: LifecycleTarget,
  ): void {
    if (
      record.task.id !== target.taskId ||
      record.task.projectId !== target.projectId
    ) {
      throw new Error('A resposta não corresponde à task selecionada.');
    }
  }

  async function reloadIfCurrent(
    target: LifecycleTarget,
    version: number,
  ): Promise<void> {
    if (!isCurrent(target, version)) return;
    try {
      await reloadTask(target);
    } catch {
      // Do not replace the original operation error or attempt a replay.
    }
  }

  async function executeCurrent(input: ExecutionInput): Promise<void> {
    const target = currentTarget();
    if (
      !target ||
      target.state !== 'queued' ||
      target.activeExecution ||
      executing.value ||
      mutating.value ||
      !canExecute()
    )
      return;
    const version = generation;
    executing.value = true;
    clearError();
    try {
      const result = await client.execute(
        target.projectId,
        target.taskId,
        input.providerId,
        [...input.attachmentIds],
        input.profileId,
      );
      if (!isCurrent(target, version)) return;
      assertRecord(result.task, target);
      onExecution(result);
      replaceTask(result.task);
      await reloadIfCurrent(target, version);
    } catch (error) {
      if (!isCurrent(target, version)) return;
      reportError(
        error instanceof Error
          ? error.message
          : 'A execução do Agente não foi concluída.',
      );
      // A timeout may be ambiguous. Reconcile via canonical status; do not
      // dispatch the provider again from the client.
      await reloadIfCurrent(target, version);
    } finally {
      executing.value = false;
    }
  }

  async function mutate(kind: 'cancel' | 'retry' | 'recover'): Promise<void> {
    const target = currentTarget();
    if (!target || mutating.value) return;
    if (kind === 'cancel' && !target.activeExecution) return;
    if (
      kind === 'retry' &&
      (target.state !== 'failed' || target.activeExecution || executing.value)
    )
      return;
    if (
      kind === 'recover' &&
      (target.activeExecution ||
        executing.value ||
        (target.runtimeState !== 'interrupted' && target.state !== 'blocked'))
    )
      return;

    const version = generation;
    mutating.value = true;
    clearError();
    try {
      if (kind === 'retry') {
        const result = await client.retry(target.projectId, target.taskId);
        if (!isCurrent(target, version)) return;
        assertRecord(result, target);
        replaceTask(result);
      } else {
        const result =
          kind === 'cancel'
            ? await client.cancel(target.projectId, target.taskId)
            : await client.recover(target.projectId, target.taskId);
        if (!isCurrent(target, version)) return;
        assertRecord(result.task, target);
        replaceTask(result.task);
      }
      await reloadIfCurrent(target, version);
    } catch (error) {
      if (!isCurrent(target, version)) return;
      const fallback =
        kind === 'cancel'
          ? 'Não foi possível parar a task.'
          : kind === 'retry'
            ? 'Não foi possível tentar novamente.'
            : 'Não foi possível recuperar a task.';
      reportError(error instanceof Error ? error.message : fallback);
      await reloadIfCurrent(target, version);
    } finally {
      mutating.value = false;
    }
  }

  return {
    executing,
    resetLifecycle,
    executeCurrent,
    cancelCurrent: () => mutate('cancel'),
    retryCurrent: () => mutate('retry'),
    recoverCurrent: () => mutate('recover'),
  };
}
