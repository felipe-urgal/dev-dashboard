import type {
  AiChatMessage,
  AiCompletionResult,
  AiErrorCode,
  AiExecutionMode,
  AiModelPullStreamEvent,
  Project,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

import {
  AiProviderError,
  type AiProvider,
} from './ai-provider.js';
import { AiOrchestrator, type AiChatHandlers } from './ai-orchestrator.js';
import { OllamaProvider } from './ollama-provider.js';
import { ProjectFileService } from './project-file-service.js';
import { GitService } from './git-service.js';
import { ProjectWorkspaceEditService } from './project-workspace-edit-service.js';
import { ProjectLanguageServerService } from './project-language-server-service.js';

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;
const COMPLETION_TIMEOUT_MS = 15_000;
const MAX_COMPLETION_PREFIX_CHARS = 4_000;
const MAX_COMPLETION_SUFFIX_CHARS = 1_000;
const MAX_COMPLETION_RESPONSE_CHARS = 2_000;
const COMPLETION_MAX_OUTPUT_TOKENS = 128;
const REVIEW_MAX_OUTPUT_TOKENS = 700;
const MODEL_REQUIRED_MESSAGE = 'Selecione um modelo de IA disponível.';

export { resolveOllamaBaseUrl } from './ollama-provider.js';
export type { AiChatHandlers } from './ai-orchestrator.js';

export class AiAssistantError extends Error {
  public constructor(
    message: string,
    public readonly code: AiErrorCode = 'AI_ASSISTANT_INVALID_REQUEST',
  ) {
    super(message);
    this.name = 'AiAssistantError';
  }
}

export interface AiModelPullHandlers {
  send: (event: AiModelPullStreamEvent) => void;
  signal: AbortSignal;
}

export interface AiAssistantServiceOptions {
  provider?: AiProvider;
  orchestrator?: AiOrchestrator;
  projectFileService?: ProjectFileService;
  gitService?: GitService;
  fetchImpl?: typeof fetch;
  workspaceEditService?: ProjectWorkspaceEditService;
  languageServerService?: ProjectLanguageServerService;
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

function asAiError(error: unknown, fallback: string): Error {
  if (error instanceof AiAssistantError || error instanceof AiProviderError) {
    return error;
  }
  return new AiProviderError('AI_PROVIDER_REQUEST_FAILED', fallback, {
    cause: error,
  });
}

/**
 * Fachada estável usada pelas rotas e serviços atuais.
 *
 * Inferência é delegada ao AiProvider; o loop interativo e as ferramentas são
 * responsabilidade do AiOrchestrator. Isso preserva a API existente enquanto
 * remove detalhes do provider do fluxo de negócio.
 */
export class AiAssistantService {
  private readonly provider: AiProvider;
  private readonly orchestrator: AiOrchestrator;

  public constructor(options: AiAssistantServiceOptions = {}) {
    const projectFileService =
      options.projectFileService ?? new ProjectFileService();
    const gitService = options.gitService ?? new GitService();
    const workspaceEditService =
      options.workspaceEditService ??
      new ProjectWorkspaceEditService(projectFileService);
    const languageServerService =
      options.languageServerService ??
      new ProjectLanguageServerService({ projectFileService });
    const provider =
      options.provider ??
      new OllamaProvider(
        options.fetchImpl
          ? { fetchImpl: options.fetchImpl, leakedToolCallMode: 'error' }
          : {},
      );

    this.provider = provider;
    this.orchestrator =
      options.orchestrator ??
      new AiOrchestrator({
        provider,
        projectFileService,
        gitService,
        workspaceEditService,
        languageServerService,
      });
  }

  public status(): Promise<ProjectAiStatus> {
    return this.provider.status();
  }

  public async chat(
    project: Project,
    model: string,
    messages: AiChatMessage[],
    handlers: AiChatHandlers,
    mode?: AiExecutionMode,
  ): Promise<void> {
    if (!model.trim()) {
      handlers.send({
        type: 'error',
        code: 'AI_ASSISTANT_INVALID_REQUEST',
        message: MODEL_REQUIRED_MESSAGE,
      });
      return;
    }
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      handlers.send({
        type: 'error',
        code: 'AI_ASSISTANT_INVALID_REQUEST',
        message: `A conversa deve conter entre 1 e ${MAX_MESSAGES} mensagens.`,
      });
      return;
    }
    for (const message of messages) {
      if (message.content.length > MAX_MESSAGE_CHARS) {
        handlers.send({
          type: 'error',
          code: 'AI_ASSISTANT_INVALID_REQUEST',
          message: `Cada mensagem deve ter no máximo ${MAX_MESSAGE_CHARS} caracteres.`,
        });
        return;
      }
    }

    await this.orchestrator.chat(project, model, messages, handlers, mode);
  }

  /**
   * Resposta única sem catálogo de ferramentas, usada por fluxos com contexto
   * fechado pelo servidor, como a Code review.
   */
  public async review(
    model: string,
    messages: AiChatMessage[],
    signal: AbortSignal,
    maxMessageChars: number = MAX_MESSAGE_CHARS,
  ): Promise<string> {
    if (!model.trim()) {
      throw new AiAssistantError(MODEL_REQUIRED_MESSAGE);
    }
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      throw new AiAssistantError(
        `A revisão deve conter entre 1 e ${MAX_MESSAGES} mensagens.`,
      );
    }
    if (messages.some((message) => message.content.length > maxMessageChars)) {
      throw new AiAssistantError(
        `Cada mensagem deve ter no máximo ${maxMessageChars} caracteres.`,
      );
    }

    try {
      const result = await this.provider.chatRound(
        model,
        messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          signal,
          timeoutMs: null,
          maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
          temperature: 0.1,
        },
      );
      if (result.toolCalls.length > 0) {
        throw new AiProviderError(
          'AI_PROVIDER_INVALID_RESPONSE',
          'O modelo tentou usar ferramentas durante a revisão, o que não é permitido.',
        );
      }
      if (!result.content.trim()) {
        throw new AiProviderError(
          'AI_PROVIDER_INVALID_RESPONSE',
          'O modelo não devolveu uma revisão.',
        );
      }
      return result.content;
    } catch (error) {
      if (signal.aborted) {
        throw new AiProviderError(
          'AI_REQUEST_CANCELLED',
          'A revisão foi cancelada pelo usuário.',
        );
      }
      throw asAiError(error, 'Falha ao executar a revisão de IA.');
    }
  }

  public async pullRecommendedModel(
    model: string,
    handlers: AiModelPullHandlers,
  ): Promise<void> {
    if (!this.provider.installModel) {
      throw new AiProviderError(
        'AI_PROVIDER_OPERATION_UNSUPPORTED',
        'O provider de IA atual não permite instalar modelos pelo dashboard.',
      );
    }
    try {
      await this.provider.installModel(model, handlers);
    } catch (error) {
      throw asAiError(error, 'Falha ao instalar o modelo de IA.');
    }
  }

  public async complete(
    model: string,
    prefix: string,
    suffix: string,
    signal: AbortSignal,
  ): Promise<AiCompletionResult> {
    if (!model.trim()) {
      throw new AiAssistantError(MODEL_REQUIRED_MESSAGE);
    }
    if (
      prefix.length > MAX_COMPLETION_PREFIX_CHARS ||
      suffix.length > MAX_COMPLETION_SUFFIX_CHARS
    ) {
      throw new AiAssistantError(
        'O contexto de compleção excede o limite permitido.',
      );
    }
    if (!prefix.trim() && !suffix.trim()) return { text: '' };

    try {
      const result = await this.provider.complete(model, prefix, suffix, {
        signal,
        timeoutMs: COMPLETION_TIMEOUT_MS,
        maxOutputTokens: COMPLETION_MAX_OUTPUT_TOKENS,
      });
      return {
        text: truncate(result.text, MAX_COMPLETION_RESPONSE_CHARS),
      };
    } catch (error) {
      if (signal.aborted) {
        throw new AiProviderError(
          'AI_REQUEST_CANCELLED',
          'A compleção foi cancelada pelo usuário.',
        );
      }
      throw asAiError(error, 'Falha ao completar código com IA.');
    }
  }
}
