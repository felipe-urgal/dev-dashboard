import type {
  AiCompletionResult,
  AiErrorCode,
  AiModelPullStreamEvent,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

export type AiProviderStatus = ProjectAiStatus;

export type AiProviderErrorCode = Exclude<
  AiErrorCode,
  | 'AI_ASSISTANT_INVALID_REQUEST'
  | 'AI_CLOUD_CONSENT_REQUIRED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_MODEL_UNAVAILABLE'
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

export interface AiProviderCompletionOptions {
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputTokens: number;
}

export interface AiProviderModelInstallHandlers {
  send: (event: AiModelPullStreamEvent) => void;
  signal: AbortSignal;
}

/**
 * Boundary mínimo entre o domínio do dev-dashboard e um motor de IA.
 *
 * O provider conhece autenticação/transporte/payload do fornecedor. Ele não
 * conhece projeto, filesystem, Git, LSP, workspace edit nem aprovação.
 */
export interface AiProvider {
  status(): Promise<AiProviderStatus>;

  chatRound(
    model: string,
    messages: readonly AiProviderMessage[],
    options: AiProviderChatRoundOptions,
  ): Promise<AiProviderChatRoundResult>;

  complete(
    model: string,
    prefix: string,
    suffix: string,
    options: AiProviderCompletionOptions,
  ): Promise<AiCompletionResult>;

  installModel?(
    model: string,
    handlers: AiProviderModelInstallHandlers,
  ): Promise<void>;
}
