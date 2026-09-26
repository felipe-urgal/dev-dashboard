import type { AgentRealtimeSnapshot } from '../api/agent-runtime';
import type { NoticeOutcome } from './notice-center';

export type AgentNotificationKind =
  'checkpoint' | 'authorization' | 'failed' | 'completed' | 'recovery';

export interface AgentNotificationCandidate {
  key: string;
  kind: AgentNotificationKind;
  outcome: NoticeOutcome;
  label: string;
}

export interface AgentNotificationPreferences {
  checkpoint: boolean;
  authorization: boolean;
  failed: boolean;
  completed: boolean;
  recovery: boolean;
}

export const AGENT_NOTIFICATION_PREFERENCES_KEY =
  'dev-dashboard:agent-notification-preferences';
export const AGENT_NOTIFICATION_SEEN_KEY =
  'dev-dashboard:agent-notification-seen';
const MAX_SEEN_KEYS = 200;

export const DEFAULT_AGENT_NOTIFICATION_PREFERENCES: AgentNotificationPreferences =
  {
    checkpoint: true,
    authorization: true,
    failed: true,
    completed: true,
    recovery: true,
  };

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAgentNotificationPreferences(): AgentNotificationPreferences {
  const storage = safeLocalStorage();
  if (!storage) return { ...DEFAULT_AGENT_NOTIFICATION_PREFERENCES };
  try {
    const raw = storage.getItem(AGENT_NOTIFICATION_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_AGENT_NOTIFICATION_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AgentNotificationPreferences>;
    return {
      checkpoint: parsed.checkpoint !== false,
      authorization: parsed.authorization !== false,
      failed: parsed.failed !== false,
      completed: parsed.completed !== false,
      recovery: parsed.recovery !== false,
    };
  } catch {
    return { ...DEFAULT_AGENT_NOTIFICATION_PREFERENCES };
  }
}

export function writeAgentNotificationPreferences(
  preferences: AgentNotificationPreferences,
): void {
  try {
    safeLocalStorage()?.setItem(
      AGENT_NOTIFICATION_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Preferências locais não podem quebrar o runtime.
  }
}

function readSeenKeys(): string[] {
  try {
    const raw = safeLocalStorage()?.getItem(AGENT_NOTIFICATION_SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

export function markAgentNotificationSeen(key: string): void {
  const next = [...readSeenKeys().filter((item) => item !== key), key].slice(
    -MAX_SEEN_KEYS,
  );
  try {
    safeLocalStorage()?.setItem(
      AGENT_NOTIFICATION_SEEN_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Dedupe local degradado não altera a task.
  }
}

export function hasSeenAgentNotification(key: string): boolean {
  return readSeenKeys().includes(key);
}

export function agentNotificationCandidates(
  snapshot: AgentRealtimeSnapshot,
): AgentNotificationCandidate[] {
  const task = snapshot.status.task.task;
  const candidates: AgentNotificationCandidate[] = [];

  const pendingCheckpoint = [...snapshot.activity.checkpoints]
    .reverse()
    .find((checkpoint) => checkpoint.status === 'pending');

  if (pendingCheckpoint && task.state === 'checkpoint') {
    candidates.push({
      key: `agent:${task.id}:checkpoint:${pendingCheckpoint.id}`,
      kind: 'checkpoint',
      outcome: 'stopped',
      label: 'Checkpoint aguardando decisão',
    });

    const granted = new Set(
      snapshot.activity.authorizations
        .filter((authorization) => authorization.granted)
        .map((authorization) => authorization.capability),
    );
    if (
      pendingCheckpoint.requiredCapabilities.some(
        (capability) => !granted.has(capability),
      )
    ) {
      candidates.push({
        key: `agent:${task.id}:authorization:${pendingCheckpoint.id}`,
        kind: 'authorization',
        outcome: 'stopped',
        label: 'Autorização necessária',
      });
    }
  }

  if (task.state === 'failed' || task.state === 'blocked') {
    candidates.push({
      key: `agent:${task.id}:state:${task.state}:${task.updatedAt}`,
      kind: 'failed',
      outcome: 'failed',
      label: task.state === 'failed' ? 'Task falhou' : 'Task bloqueada',
    });
  }

  if (task.state === 'completed') {
    candidates.push({
      key: `agent:${task.id}:completed:${task.updatedAt}`,
      kind: 'completed',
      outcome: 'succeeded',
      label: 'Task concluída',
    });
  }

  if (
    snapshot.status.runtime.state === 'interrupted' &&
    snapshot.status.runtime.lastReason !== 'operator-recovered'
  ) {
    candidates.push({
      key: `agent:${task.id}:recovery:${snapshot.status.runtime.updatedAt}`,
      kind: 'recovery',
      outcome: 'failed',
      label: 'Recovery necessário',
    });
  }

  return candidates;
}
