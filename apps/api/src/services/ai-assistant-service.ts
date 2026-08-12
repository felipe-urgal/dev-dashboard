import type {
  AiChatMessage,
  AiErrorCode,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

import { AiProviderError, type AiProvider } from './ai-provider.js';
import { OllamaProvider } from './ollama-provider.js';

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;
const REVIEW_MAX_OUTPUT_TOKENS = 700;
const MODEL_REQUIRED_MESSAGE = 'Selecione um modelo de IA disponível.';

export { resolveOllamaBaseUrl } from './ollama-provider.js';

export class AiAssistantError extends Error {
  public constructor(
    message: string,
    public readonly code: AiErrorCode = 'AI_ASSISTANT_INVALID_REQUEST',
  ) {
    super(message);
    this.name = 'AiAssistantError';
  }
}

export interface AiAssistantServiceOptions {
  provider?: AiProvider;
  fetchImpl?: typeof fetch;
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
 * Fachada estável entre a Code review e o provider de IA local (Ollama).
 *
 * Depois da remoção do Assistente IA (chat/implementation), este serviço só
 * expõe o que a Code review precisa: consultar disponibilidade/modelos
 * (`status`) e pedir uma resposta única sem ferramentas (`review`).
 */
export class AiAssistantService {
  private readonly provider: AiProvider;

  public constructor(options: AiAssistantServiceOptions = {}) {
    this.provider =
      options.provider ??
      new OllamaProvider(
        options.fetchImpl
          ? { fetchImpl: options.fetchImpl, leakedToolCallMode: 'error' }
          : {},
      );
  }

  public status(): Promise<ProjectAiStatus> {
    return this.provider.status();
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
}
