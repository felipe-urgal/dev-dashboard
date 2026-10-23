import { type Ref } from 'vue';

import {
  type AgentActivity,
  type AgentRealtimeSnapshot,
  type AgentTaskStatus,
} from '../api/agent-runtime';

interface SelectedTask {
  projectId: string;
  taskId: string;
}

type SnapshotResult = 'applied' | 'stale' | 'invalid';

/**
 * The cockpit has one status/activity owner shared by REST and realtime.
 * Accept only snapshots for the selected task and never replace a newer
 * canonical version (or newer runtime observation) with an older one.
 * All activity records must belong to that same task before reaching the UI.
 */
export function useAgentTaskSnapshots(
  selectedTask: () => SelectedTask | null,
  status: Ref<AgentTaskStatus | null>,
  activity: Ref<AgentActivity | null>,
  onAccepted: (snapshot: AgentRealtimeSnapshot) => void,
) {
  function applySnapshot(snapshot: AgentRealtimeSnapshot): SnapshotResult {
    const selected = selectedTask();
    if (!selected) return 'stale';

    const nextStatus = snapshot?.status;
    const record = nextStatus?.task;
    const runtime = nextStatus?.runtime;
    const execution = nextStatus?.activeExecution;
    const nextActivity = snapshot?.activity;
    const observedAt = Date.parse(runtime?.updatedAt ?? '');

    if (
      record?.task?.projectId !== selected.projectId ||
      record.task.id !== selected.taskId ||
      runtime?.projectId !== selected.projectId ||
      runtime.taskId !== selected.taskId ||
      (execution &&
        (execution.projectId !== selected.projectId ||
          execution.taskId !== selected.taskId)) ||
      !Number.isSafeInteger(record.version) ||
      record.version < 0 ||
      !Number.isFinite(observedAt) ||
      !Array.isArray(nextActivity?.events) ||
      !Array.isArray(nextActivity.authorizations) ||
      !Array.isArray(nextActivity.checkpoints) ||
      !Array.isArray(nextActivity.evidence) ||
      !nextActivity.events.every(
        (entry) => entry?.taskId === selected.taskId,
      ) ||
      !nextActivity.authorizations.every(
        (entry) => entry?.taskId === selected.taskId,
      ) ||
      !nextActivity.checkpoints.every(
        (entry) => entry?.taskId === selected.taskId,
      ) ||
      !nextActivity.evidence.every((entry) => entry?.taskId === selected.taskId)
    ) {
      return 'invalid';
    }

    const previous = status.value;
    if (
      previous?.task.task.projectId === selected.projectId &&
      previous.task.task.id === selected.taskId
    ) {
      if (record.version < previous.task.version) return 'stale';
      if (
        record.version === previous.task.version &&
        observedAt < Date.parse(previous.runtime.updatedAt)
      ) {
        return 'stale';
      }
    }

    status.value = nextStatus;
    activity.value = nextActivity;
    onAccepted(snapshot);
    return 'applied';
  }

  return { applySnapshot };
}
