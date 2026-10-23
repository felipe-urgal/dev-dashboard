import { computed, ref, type Ref } from 'vue';

import {
  fetchAgentActivity,
  resolveAgentCheckpoint,
  setAgentAuthorization,
  type AgentActivity,
  type AgentAuthorization,
  type AgentAuthorizationScope,
  type AgentCapability,
  type AgentCheckpoint,
  type AgentTaskRecord,
} from '../api/agent-runtime';

interface ApprovalTarget {
  projectId: string;
  taskId: string;
  requestedCapabilities: AgentCapability[];
}

interface ApprovalClient {
  authorize: typeof setAgentAuthorization;
  resolve: typeof resolveAgentCheckpoint;
  fetchActivity: typeof fetchAgentActivity;
}

export function authorizationScopeLabel(
  scope: AgentAuthorizationScope | undefined,
): string {
  if (!scope) return 'Sem escopo estruturado (legado)';
  switch (scope.kind) {
    case 'environment':
      return 'Ambiente · ' + scope.environmentInstanceId;
    case 'branch':
      return 'Branch · ' + scope.branch;
    case 'repository-branch':
      return scope.repository + ' · ' + scope.branch;
    case 'pull-request':
      return scope.repository + ' · PR #' + scope.number;
    case 'release-target':
      return 'Target · ' + scope.target;
  }
}

/**
 * Checkpoints and grants are decisions for the selected canonical task only.
 * A late response after project/task change is never allowed to update the
 * next task's activity, errors, draft, or task record.
 *
 * Authorization scope, checkpoint conflicts, and grants are decided by the
 * backend; this composable never infers a grant from an optimistic click.
 */
export function useAgentTaskApprovals(
  currentTarget: () => ApprovalTarget | null,
  activity: Ref<AgentActivity | null>,
  mutating: Ref<boolean>,
  replaceTask: (task: AgentTaskRecord) => void,
  reloadTask: (target: ApprovalTarget) => Promise<void>,
  reportError: (message: string) => void,
  clearError: () => void,
  client: ApprovalClient = {
    authorize: setAgentAuthorization,
    resolve: resolveAgentCheckpoint,
    fetchActivity: fetchAgentActivity,
  },
) {
  const checkpointInstruction = ref('');
  let generation = 0;

  const pendingCheckpoint = computed<AgentCheckpoint | null>(() => {
    const target = currentTarget();
    if (!target) return null;
    const values = activity.value?.checkpoints ?? [];
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const checkpoint = values[index];
      if (
        checkpoint?.status === 'pending' &&
        checkpoint.taskId === target.taskId
      )
        return checkpoint;
    }
    return null;
  });

  const authorizationByCapability = computed(() => {
    const values = new Map<AgentCapability, AgentAuthorization>();
    const target = currentTarget();
    if (!target) return values;
    for (const authorization of activity.value?.authorizations ?? []) {
      if (
        authorization.taskId === target.taskId &&
        target.requestedCapabilities.includes(authorization.capability)
      ) {
        values.set(authorization.capability, authorization);
      }
    }
    return values;
  });

  const authorizationGranted = (capability: AgentCapability): boolean =>
    authorizationByCapability.value.get(capability)?.granted === true;

  function resetApprovals(): void {
    generation += 1;
    checkpointInstruction.value = '';
    // Do not clear the shared mutating lock while a prior HTTP request is in
    // flight. Its finally releases the lock; no other privileged mutation may
    // overlap merely because the selected task changed.
  }

  function isCurrent(target: ApprovalTarget, version: number): boolean {
    const current = currentTarget();
    return (
      version === generation &&
      current?.projectId === target.projectId &&
      current.taskId === target.taskId
    );
  }

  async function refreshActivity(
    target: ApprovalTarget,
    version: number,
  ): Promise<void> {
    const next = await client.fetchActivity(target.projectId, target.taskId);
    if (isCurrent(target, version)) activity.value = next;
  }

  async function toggleAuthorization(
    capability: AgentCapability,
    granted: boolean,
  ): Promise<void> {
    const target = currentTarget();
    if (
      !target ||
      mutating.value ||
      !target.requestedCapabilities.includes(capability)
    )
      return;
    const version = generation;
    mutating.value = true;
    clearError();
    try {
      await client.authorize(
        target.projectId,
        target.taskId,
        capability,
        granted,
      );
      if (isCurrent(target, version)) await refreshActivity(target, version);
    } catch (error) {
      if (!isCurrent(target, version)) return;
      reportError(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar a autorização.',
      );
      // A failed response can be ambiguous: re-read canonical grants instead
      // of optimistically reflecting the requested authorization.
      try {
        await refreshActivity(target, version);
      } catch {
        // Keep the original error and the last confirmed snapshot.
      }
    } finally {
      mutating.value = false;
    }
  }

  async function resolveCheckpoint(
    decision: 'approved' | 'rejected',
  ): Promise<void> {
    const target = currentTarget();
    const checkpoint = pendingCheckpoint.value;
    if (!target || !checkpoint || mutating.value) return;
    const version = generation;
    const instruction =
      decision === 'approved' ? checkpointInstruction.value : undefined;
    mutating.value = true;
    clearError();

    try {
      const result = await client.resolve(
        target.projectId,
        target.taskId,
        checkpoint.id,
        decision,
        instruction,
      );
      if (!isCurrent(target, version)) return;
      if (result.task.task.id !== target.taskId) {
        throw new Error('A resposta do checkpoint não corresponde à task.');
      }
      replaceTask(result.task);
      checkpointInstruction.value = '';
      await reloadTask(target);
    } catch (error) {
      if (!isCurrent(target, version)) return;
      reportError(
        error instanceof Error
          ? error.message
          : 'Não foi possível resolver o checkpoint.',
      );
      // A response failure may occur after the decision persisted. Re-read
      // the task before presenting a potentially stale pending checkpoint.
      try {
        await reloadTask(target);
      } catch {
        // Preserve the original resolution error.
      }
    } finally {
      mutating.value = false;
    }
  }

  return {
    checkpointInstruction,
    pendingCheckpoint,
    authorizationByCapability,
    authorizationGranted,
    resetApprovals,
    toggleAuthorization,
    resolveCheckpoint,
  };
}
