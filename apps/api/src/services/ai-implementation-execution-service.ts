import { randomUUID } from 'node:crypto';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  AiExecutionMode,
  AiImplementationExecution,
  AiImplementationExecutionStatus,
  AiProviderId,
  AiTool,
  Project,
} from '@dev-dashboard/contracts';

import type { AiAssistantService } from './ai-assistant-service.js';
import { DEFAULT_AI_EXECUTION_MODE } from './ai-execution-policy.js';
import type { AiProviderResolver } from './ai-provider-resolver.js';

const MAX_EVENTS_PER_EXECUTION = 120;
const MAX_EXECUTIONS = 40;
const PROJECT_INSPECTION_TOOLS = new Set<AiTool>([
  'read_project_file',
  'search_project_text',
  'list_project_files',
  'get_git_diff',
  'get_symbol_definition',
  'get_symbol_references',
]);
const IMPLEMENTATION_SYSTEM_PROMPT = [
  'Você é o assistente de implementação do Dev Dashboard.',
  'Antes de responder sobre código existente, inspecione o projeto com as ferramentas disponíveis.',
  'Se o usuário mencionar uma tela, funcionalidade, componente ou diretório sem informar o arquivo exato, use search_project_text e list_project_files para localizar o código relevante.',
  'Nunca invente nomes ou caminhos de arquivos. Se uma leitura falhar com arquivo não encontrado, volte a buscar ou listar o projeto em vez de repetir o mesmo caminho.',
  'Leia pelo menos um arquivo relevante com read_project_file antes de concluir uma resposta sobre uma alteração concreta.',
  'Nunca aplique arquivos diretamente e nunca chame propose_workspace_edit antes de uma inspeção bem-sucedida do projeto.',
  'Quando tiver contexto suficiente, prefira a menor alteração concreta e explique a proposta de forma objetiva.',
].join(' ');
const INSPECTION_REQUIRED_MESSAGE =
  'O assistente não inspecionou o projeto antes de responder. Tente novamente; a implementação deve localizar e ler o código relevante antes de sugerir mudanças.';
const EDIT_REQUIRES_INSPECTION_MESSAGE =
  'Antes de propor alterações, localize e leia o código relevante com as ferramentas de inspeção do projeto.';

type ChatAssistant = Pick<AiAssistantService, 'chat'>;
type ProjectProviderResolver = Pick<
  AiProviderResolver,
  'getSelection' | 'resolve'
>;

interface StoredExecution {
  execution: AiImplementationExecution;
  controller: AbortController;
  aiAssistantService: ChatAssistant | undefined;
  projectInspected: boolean;
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
    private readonly aiAssistantService: ChatAssistant,
    private readonly now: () => Date = () => new Date(),
    private readonly providerResolver:
      ProjectProviderResolver | undefined = undefined,
  ) {}

  public start(
    project: Project,
    model: string,
    prompt: string,
    mode?: AiExecutionMode,
    aiAssistantService?: ChatAssistant,
    provider?: AiProviderId,
  ): AiImplementationExecution {
    this.cancelRunningForProject(project.id);
    this.discardOldExecutions();

    const selection = this.providerResolver?.getSelection(project.id);
    const executionProvider = provider ?? selection?.provider ?? 'ollama';
    const executionMode = mode ?? selection?.mode ?? DEFAULT_AI_EXECUTION_MODE;
    const timestamp = this.now().toISOString();
    const controller = new AbortController();
    const execution: AiImplementationExecution = {
      id: randomUUID(),
      projectId: project.id,
      provider: executionProvider,
      mode: executionMode,
      model,
      prompt,
      status: 'running',
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [],
    };
    const stored: StoredExecution = {
      execution,
      controller,
      aiAssistantService,
      projectInspected: false,
    };
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
      { role: 'system', content: IMPLEMENTATION_SYSTEM_PROMPT },
      { role: 'user', content: stored.execution.prompt },
    ];

    try {
      let assistantService = stored.aiAssistantService;
      if (!assistantService && this.providerResolver) {
        assistantService = await this.providerResolver.resolve(
          project.id,
          stored.execution.provider,
          stored.execution.model,
        );
      }
      assistantService ??= this.aiAssistantService;

      await assistantService.chat(
        project,
        stored.execution.model,
        messages,
        {
          signal: stored.controller.signal,
          send: (event) => this.recordEvent(stored, event),
        },
        stored.execution.mode,
      );
      if (
        stored.execution.status === 'running' &&
        !stored.projectInspected &&
        !this.hasError(stored.execution)
      ) {
        this.recordEvent(stored, {
          type: 'error',
          message: INSPECTION_REQUIRED_MESSAGE,
        });
      }
      if (stored.execution.status === 'running') {
        this.finish(
          stored.execution,
          this.hasError(stored.execution) ? 'failed' : 'succeeded',
        );
      }
    } catch (error) {
      if (stored.execution.status !== 'running') return;
      this.recordEvent(stored, {
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao executar a solicitação de implementação.',
      });
      this.finish(stored.execution, 'failed');
    }
  }

  private recordEvent(stored: StoredExecution, event: AiChatStreamEvent): void {
    const { execution } = stored;
    if (execution.status !== 'running') return;

    if (
      event.type === 'tool-call' &&
      event.tool === 'propose_workspace_edit' &&
      !stored.projectInspected
    ) {
      throw new Error(EDIT_REQUIRES_INSPECTION_MESSAGE);
    }

    if (
      event.type === 'tool-result' &&
      event.ok &&
      PROJECT_INSPECTION_TOOLS.has(event.tool)
    ) {
      stored.projectInspected = true;
    }

    if (
      !stored.projectInspected &&
      (event.type === 'message-delta' ||
        event.type === 'done' ||
        event.type === 'workspace-edit-proposed')
    ) {
      return;
    }

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
