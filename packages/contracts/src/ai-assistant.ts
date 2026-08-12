export type AiCapability = 'chat' | 'tools' | 'fill-in-the-middle';

export type AiExecutionMode = 'fast' | 'complete';

/**
 * Ãnico provider suportado desde a remoÃ§Ã£o do Assistente IA e da seleÃ§Ã£o
 * multi-provider: a Code review sempre usa o Ollama local.
 */
export type AiProviderId = 'ollama';

/**
 * Taxonomia pÃºblica e provider-neutral para falhas dos fluxos de IA.
 *
 * A mensagem continua sendo legÃ­vel para a pessoa usuÃ¡ria; o cÃ³digo existe
 * para frontend, testes e diagnÃ³stico nÃ£o dependerem de comparaÃ§Ã£o de texto.
 */
export type AiErrorCode =
  | 'AI_ASSISTANT_INVALID_REQUEST'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROVIDER_AUTH_FAILED'
  | 'AI_PROVIDER_QUOTA_EXCEEDED'
  | 'AI_PROVIDER_RATE_LIMITED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_REQUEST_CANCELLED'
  | 'AI_PROVIDER_INVALID_RESPONSE'
  | 'AI_PROVIDER_OPERATION_UNSUPPORTED'
  | 'AI_PROVIDER_REQUEST_FAILED';

export interface AiModelInfo {
  name: string;
  capabilities: AiCapability[];
}

export interface ProjectAiStatus {
  available: boolean;
  baseUrl?: string;
  models: AiModelInfo[];
  message: string;
  errorCode?: AiErrorCode;
}

export type AiChatRole = 'user' | 'assistant' | 'system';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}
