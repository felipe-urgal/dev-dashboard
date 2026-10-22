import { ref } from 'vue';

import {
  agentRuntimeWebSocketUrl,
  type AgentRealtimeSnapshot,
} from '../api/agent-runtime';

export interface AgentRealtimeTask {
  projectId: string;
  taskId: string;
}

/**
 * One WebSocket owner for the selected task. Async messages from a previous
 * project/task (or from an already replaced socket) cannot alter the cockpit.
 */
export function useAgentTaskRealtime(
  currentTask: () => AgentRealtimeTask,
  onSnapshot: (snapshot: AgentRealtimeSnapshot) => void,
  onError: (message: string) => void,
) {
  const socketState = ref<'idle' | 'connecting' | 'connected' | 'disconnected'>(
    'idle',
  );
  let socket: WebSocket | undefined;

  function closeSocket(): void {
    const previous = socket;
    socket = undefined;
    if (
      previous &&
      previous.readyState !== WebSocket.CLOSING &&
      previous.readyState !== WebSocket.CLOSED
    ) {
      previous.close();
    }
    socketState.value = 'idle';
  }

  function connect(projectId: string, taskId: string): void {
    closeSocket();
    if (!projectId || !taskId) return;

    const isCurrent = (): boolean => {
      const selected = currentTask();
      return selected.projectId === projectId && selected.taskId === taskId;
    };
    if (!isCurrent()) return;

    socketState.value = 'connecting';
    const next = new WebSocket(agentRuntimeWebSocketUrl(projectId, taskId));
    socket = next;

    next.onopen = () => {
      if (socket === next && isCurrent()) socketState.value = 'connected';
    };
    next.onmessage = (event) => {
      if (socket !== next || !isCurrent()) return;
      const message = parseSocketMessage(event.data);
      if (!message) return;

      if (message.type === 'error') {
        onError(message.message);
        return;
      }

      const task = message.snapshot.status?.task?.task;
      if (task?.id !== taskId || task.projectId !== projectId) return;
      onSnapshot(message.snapshot);
    };
    next.onerror = () => {
      if (socket === next && isCurrent()) socketState.value = 'disconnected';
    };
    next.onclose = () => {
      if (socket !== next) return;
      socket = undefined;
      socketState.value = 'disconnected';
    };
  }

  return { socketState, connect, closeSocket };
}

function parseSocketMessage(
  data: unknown,
):
  | { type: 'ready' | 'update'; snapshot: AgentRealtimeSnapshot }
  | { type: 'error'; message: string }
  | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (
      (parsed.type === 'ready' || parsed.type === 'update') &&
      parsed.snapshot &&
      typeof parsed.snapshot === 'object'
    ) {
      return {
        type: parsed.type,
        snapshot: parsed.snapshot as AgentRealtimeSnapshot,
      };
    }
    if (parsed.type === 'error' && typeof parsed.message === 'string') {
      return { type: 'error', message: parsed.message };
    }
  } catch {
    return null;
  }
  return null;
}
