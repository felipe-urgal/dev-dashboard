import { randomUUID } from 'node:crypto';

import type {
  GitSyncOperation,
  GitSyncProgressEvent,
} from '@dev-dashboard/contracts';

export type GitSyncProgressInput = Omit<
  GitSyncProgressEvent,
  'runId' | 'operation' | 'occurredAt'
>;

export type GitSyncProgressReporter = (event: GitSyncProgressInput) => void;

type GitSyncProgressListener = (event: GitSyncProgressEvent) => void;

export class GitSyncProgressService {
  private readonly listeners = new Map<string, Set<GitSyncProgressListener>>();

  public createReporter(
    projectId: string,
    operation: GitSyncOperation,
  ): {
    runId: string;
    report: GitSyncProgressReporter;
  } {
    const runId = randomUUID();

    return {
      runId,
      report: (event) => {
        this.publish(projectId, {
          ...event,
          runId,
          operation,
          occurredAt: new Date().toISOString(),
        });
      },
    };
  }

  public subscribe(
    projectId: string,
    listener: GitSyncProgressListener,
  ): () => void {
    const listeners =
      this.listeners.get(projectId) ?? new Set<GitSyncProgressListener>();
    listeners.add(listener);
    this.listeners.set(projectId, listeners);

    return () => {
      const current = this.listeners.get(projectId);
      current?.delete(listener);
      if (current?.size === 0) this.listeners.delete(projectId);
    };
  }

  private publish(projectId: string, event: GitSyncProgressEvent): void {
    const listeners = this.listeners.get(projectId);
    if (!listeners) return;

    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        listeners.delete(listener);
      }
    }

    if (listeners.size === 0) this.listeners.delete(projectId);
  }
}
