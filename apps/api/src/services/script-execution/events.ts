import type { ScriptExecutionEvent } from '@dev-dashboard/contracts';

import {
  EVENT_THROTTLE_MS,
  MAX_EXECUTION_SUBSCRIBERS,
  MAX_TOTAL_SUBSCRIBERS,
} from './constants.js';
import { ScriptExecutionError } from './errors.js';
import { getExecution, readExecutionLog } from './store.js';
import type {
  ExecutionSubscriber,
  RunningExecution,
  ScriptExecutionContext,
} from './state.js';

/**
 * Acompanhamento ao vivo (SSE) de uma execução: assinatura com limite por
 * execução e total, estado inicial + log enviados na entrada, e log
 * throttled (`EVENT_THROTTLE_MS`) enquanto o processo roda — mesmo padrão
 * de reconexão/backoff já usado no catálogo de scripts.
 */

export async function subscribeToExecution(
  context: ScriptExecutionContext,
  projectId: string,
  executionId: string,
  subscriber: ExecutionSubscriber,
): Promise<() => void> {
  const execution = await getExecution(context, projectId, executionId);
  const current =
    context.subscribers.get(executionId) ?? new Set<ExecutionSubscriber>();
  const total = Array.from(context.subscribers.values()).reduce(
    (sum, items) => sum + items.size,
    0,
  );
  if (
    current.size >= MAX_EXECUTION_SUBSCRIBERS ||
    total >= MAX_TOTAL_SUBSCRIBERS
  ) {
    throw new ScriptExecutionError(
      'SCRIPT_SUBSCRIBER_LIMIT',
      'O limite de acompanhamentos simultâneos foi atingido.',
    );
  }
  current.add(subscriber);
  context.subscribers.set(executionId, current);
  try {
    subscriber.send({ type: 'state', execution });
    subscriber.send({
      type: 'log',
      log: await readExecutionLog(context, projectId, executionId),
    });
  } catch (error) {
    current.delete(subscriber);
    if (current.size === 0) context.subscribers.delete(executionId);
    throw error;
  }
  if (execution.status !== 'running') queueMicrotask(subscriber.close);
  return () => {
    current.delete(subscriber);
    if (current.size === 0) context.subscribers.delete(executionId);
  };
}

export function emitEvent(
  context: ScriptExecutionContext,
  record: RunningExecution,
  event: ScriptExecutionEvent,
): void {
  for (const subscriber of context.subscribers.get(record.execution.id) ?? [])
    subscriber.send(event);
  if (event.type === 'state' && event.execution.status !== 'running') {
    const subscribers = context.subscribers.get(record.execution.id);
    if (subscribers)
      queueMicrotask(() => {
        for (const subscriber of subscribers) subscriber.close();
      });
  }
}

export function scheduleLogEvent(
  context: ScriptExecutionContext,
  record: RunningExecution,
  immediate = false,
): void {
  if (!context.subscribers.has(record.execution.id)) return;
  const existing = context.eventTimers.get(record.execution.id);
  if (existing && !immediate) return;
  if (existing) clearTimeout(existing);
  const publish = (): void => {
    context.eventTimers.delete(record.execution.id);
    void readExecutionLog(
      context,
      record.execution.projectId,
      record.execution.id,
    )
      .then((log) => emitEvent(context, record, { type: 'log', log }))
      .catch(() => undefined);
  };
  if (immediate) queueMicrotask(publish);
  else
    context.eventTimers.set(
      record.execution.id,
      setTimeout(publish, EVENT_THROTTLE_MS),
    );
}

export function closeAllSubscribers(context: ScriptExecutionContext): void {
  for (const timer of context.eventTimers.values()) clearTimeout(timer);
  for (const subscribers of context.subscribers.values()) {
    for (const subscriber of subscribers) subscriber.close();
  }
  context.eventTimers.clear();
  context.subscribers.clear();
}
