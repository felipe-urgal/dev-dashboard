import type { AiErrorCode, ProjectAiStatus } from '@dev-dashboard/contracts';

export type AiProviderStatus = ProjectAiStatus;

export type AiProviderErrorCode = Exclude<
  AiErrorCode,
  'AI_ASSISTANT_INVALID_REQUEST'
>;

export class AiProviderError extends Error {
  public constructor(
    public readonly code: AiProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AiProviderError';
  }
}

export interface AiProviderMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
}

export interface AiProviderToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiProviderToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiProviderChatRoundOptions {
  signal: AbortSignal;
  tools?: readonly AiProviderToolDefinition[];
  timeoutMs?: number | null;
  format?: 'json';
  maxOutputTokens?: number;
  temperature?: number;
  onTextDelta?: (content: string) => void;
}

export interface AiProviderChatRoundResult {
  content: string;
  toolCalls: AiProviderToolCall[];
}

/**
 * Boundary mÃ­nimo entre o domÃ­nio do dev-dashboard e um motor de IA.
 *
 * O provider conhece autenticaÃ§Ã£o/transporte/payload do fornecedor. Ele nÃ£o
 * conhece projeto, filesystem, Git, LSP, workspace edit nem aprovaÃ§Ã£o. Desde
 * a remoÃ§Ã£o do Assistente IA sÃ³ a Code review usa este boundary â apenas
 * `status`/`chatRound` seguem em uso; compleÃ§Ã£o inline e instalaÃ§Ã£o de
 * modelo eram exclusivas do Assistente IA e foram removidas.
 */
export interface AiProvider {
  status(): Promise<AiProviderStatus>;

  chatRound(
    model: string,
    messages: readonly AiProviderMessage[],
    options: AiProviderChatRoundOptions,
  ): Promise<AiProviderChatRoundResult>;
}
