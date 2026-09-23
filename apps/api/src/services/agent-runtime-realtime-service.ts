import type {
  AgentAuditSnapshot,
  AgentWorkflowTaskStatus,
} from '@dev-dashboard/agent-runtime';

import type { AgentRuntimeApiServicePort } from './agent-runtime-api-service.js';

export interface AgentRuntimeRealtimeSnapshot {
  status: AgentWorkflowTaskStatus;
  activity: AgentAuditSnapshot;
}

export interface AgentRuntimeRealtimeAttachment {
  snapshot: AgentRuntimeRealtimeSnapshot;
  detach: () => void;
}

export interface AgentRuntimeRealtimeServiceOptions {
  intervalMs?: number;
}

type RealtimeReader = Pick<AgentRuntimeApiServicePort, 'status' | 'activity'>;

export class AgentRuntimeRealtimeService {
  private readonly intervalMs: number;
  private readonly detachments = new Set<() => void>();
  private closed = false;

  public constructor(
    private readonly reader: RealtimeReader,
    options: AgentRuntimeRealtimeServiceOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 1_000;
    if (!Number.isSafeInteger(this.intervalMs) || this.intervalMs < 100) {
      throw new Error('Agent realtime interval must be at least 100ms.');
    }
  }

  public async attach(
    projectId: string,
    taskId: string,
    onSnapshot: (snapshot: AgentRuntimeRealtimeSnapshot) => void,
    onError: (error: unknown) => void,
  ): Promise<AgentRuntimeRealtimeAttachment> {
    if (this.closed) {
      throw new Error('Agent realtime service is closed.');
    }

    const snapshot = await this.read(projectId, taskId);
    let previous = JSON.stringify(snapshot);
    let polling = false;
    let detached = false;

    const timer = setInterval(() => {
      if (polling || detached || this.closed) return;
      polling = true;

      void this.read(projectId, taskId)
        .then((current) => {
          const serialized = JSON.stringify(current);
          if (serialized === previous || detached || this.closed) return;
          previous = serialized;
          onSnapshot(current);
        })
        .catch((error: unknown) => {
          if (!detached && !this.closed) onError(error);
        })
        .finally(() => {
          polling = false;
        });
    }, this.intervalMs);

    const detach = () => {
      if (detached) return;
      detached = true;
      clearInterval(timer);
      this.detachments.delete(detach);
    };
    this.detachments.add(detach);

    return { snapshot, detach };
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const detach of [...this.detachments]) detach();
  }

  private async read(
    projectId: string,
    taskId: string,
  ): Promise<AgentRuntimeRealtimeSnapshot> {
    const [status, activity] = await Promise.all([
      this.reader.status(projectId, taskId),
      this.reader.activity(projectId, taskId),
    ]);
    return { status, activity };
  }
}
