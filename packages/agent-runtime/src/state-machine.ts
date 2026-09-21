import type { AgentTask, AgentTaskState } from './contracts.js';

const TASK_TRANSITIONS: Readonly<Record<AgentTaskState, readonly AgentTaskState[]>> = {
  queued: ['running', 'cancelled'],
  running: ['checkpoint', 'review', 'blocked', 'failed', 'completed', 'cancelled'],
  checkpoint: ['running', 'review', 'blocked', 'cancelled'],
  review: ['running', 'blocked', 'failed', 'completed', 'cancelled'],
  blocked: ['queued', 'failed', 'cancelled'],
  failed: ['queued', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class AgentStateTransitionError extends Error {
  constructor(
    readonly from: AgentTaskState,
    readonly to: AgentTaskState,
  ) {
    super(`Invalid agent task transition: ${from} -> ${to}`);
    this.name = 'AgentStateTransitionError';
  }
}

export function canTransitionAgentTask(
  from: AgentTaskState,
  to: AgentTaskState,
): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function transitionAgentTask(
  task: AgentTask,
  to: AgentTaskState,
  observedAt: string,
): AgentTask {
  if (!canTransitionAgentTask(task.state, to)) {
    throw new AgentStateTransitionError(task.state, to);
  }

  return {
    ...task,
    state: to,
    updatedAt: observedAt,
  };
}

export function isTerminalAgentTaskState(state: AgentTaskState): boolean {
  return state === 'completed' || state === 'cancelled';
}
