import { randomUUID } from 'node:crypto';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  AiImplementationExecution,
  AiImplementationExecutionStatus,
  Project,
} from '@dev-dashboard/contracts';

import type { AiAssistantService } from './ai-assistant-service.js';

const MAX_EVENTS_PER_EXECUTION = 120;
const MAX_EXECUTIONS = 40;

interface StoredExecution {
  execution: AiImplementationExecution;
  controller: AbortController;
}

function copyExecution(
  execution: AiImplementationExecution,
): AiImplementationExecution {
  return {
    ...execution,
    events: [...execution.events],
  };
}

/**
 * Mantém execuções de implementação no processo da API, sem vínculo com uma
 * conexão SSE. A interface pode sair e voltar a consultar o snapshot atual.
 */
export class AiImplementationExecutionService {
  private readonly executions = new Map<string, StoredExecution>();

  public constructor(
    private readonly aiAssistantService: Pick<AiAssistantService, 'chat'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public start(
    project: Project,
    model: string,
    prompt: string,
  ): AiImplementationExecution {
    this.cancelRunningForProject(project.id);
    this.discardOldExecutions();

    const timestamp = this.now().toISOString();
    const controller = new AbortController();
    const execution: AiImplementationExecution = {
      id: randomUUID(),
      projectId: project.id,
      model,
      prompt,
      status: 'running',
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [],
    };
    const stored = { execution, controller };
    this.executions.set(execution.id, stored);
    void this.run(project, stored);
    return copyExecution(execution);
  }

  public find(
    projectId: string,
    executionId: string,
  ): AiImplementationExecution | null {
    const stored = this.executions.get(executionId);
    if (!stored || stored.execution.projectId !== projectId) return null;
    return copyExecution(stored.execution);
  }

  public latestForProject(projectId: string): AiImplementationExecution | null {
    const candidates = [...this.executions.values()]
      .map(({ execution }) => execution)
      .filter((execution) => execution.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return candidates[0] ? copyExecution(candidates[0]) : null;
  }

  public cancel(
    projectId: string,
    executionId: string,
  ): AiImplementationExecution | null {
    const stored = this.executions.get(executionId);
    if (!stored || stored.execution.projectId !== projectId) return null;
    if (stored.execution.status === 'running') {
      stored.controller.abort();
      this.finish(stored.execution, 'cancelled');
    }
    return copyExecution(stored.execution);
  }

  public close(): void {
    for (const stored of this.executions.values()) {
      if (stored.execution.status === 'running') {
        stored.controller.abort();
        this.finish(stored.execution, 'cancelled');
      }
    }
  }

  private async run(project: Project, stored: StoredExecution): Promise<void> {
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content:
          'Você é o assistente de implementação do Dev Dashboard. Analise o projeto antes de propor mudanças. Nunca aplique arquivos diretamente: use propose_workspace_edit somente quando tiver uma alteração concreta e explique a proposta de forma objetiva.',
      },
      { role: 'user', content: stored.execution.prompt },
    ];

    try {
      await this.aiAssistantService.chat(
        project,
        stored.execution.model,
        messages,
        {
          signal: stored.controller.signal,
          send: (event) => this.recordEvent(stored.execution, event),
        },
      );
      if (stored.execution.status === 'running') {
        this.finish(
          stored.execution,
          this.hasError(stored.execution) ? 'failed' : 'succeeded',
        );
      }
    } catch (error) {
      if (stored.execution.status !== 'running') return;
      this.recordEvent(stored.execution, {
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao executar a solicitação de implementação.',
      });
      this.finish(stored.execution, 'failed');
    }
  }

  private recordEvent(
    execution: AiImplementationExecution,
    event: AiChatStreamEvent,
  ): void {
    if (execution.status !== 'running') return;
    execution.events.push(event);
    if (execution.events.length > MAX_EVENTS_PER_EXECUTION)
      execution.events.shift();
    execution.updatedAt = this.now().toISOString();
  }

  private finish(
    execution: AiImplementationExecution,
    status: Exclude<AiImplementationExecutionStatus, 'running'>,
  ): void {
    const timestamp = this.now().toISOString();
    execution.status = status;
    execution.updatedAt = timestamp;
    execution.finishedAt = timestamp;
  }

  private hasError(execution: AiImplementationExecution): boolean {
    return execution.events.some((event) => event.type === 'error');
  }

  private cancelRunningForProject(projectId: string): void {
    for (const [executionId, stored] of this.executions) {
      if (
        stored.execution.projectId !== projectId ||
        stored.execution.status !== 'running'
      )
        continue;
      stored.controller.abort();
      this.finish(stored.execution, 'cancelled');
      this.executions.delete(executionId);
    }
  }

  private discardOldExecutions(): void {
    const terminal = [...this.executions.entries()]
      .filter(([, stored]) => stored.execution.status !== 'running')
      .sort(([, left], [, right]) =>
        left.execution.updatedAt.localeCompare(right.execution.updatedAt),
      );
    while (this.executions.size >= MAX_EXECUTIONS && terminal.length > 0) {
      const oldest = terminal.shift();
      if (oldest) this.executions.delete(oldest[0]);
    }
  }
}
