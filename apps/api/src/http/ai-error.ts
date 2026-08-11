import type { AiErrorCode } from '@dev-dashboard/contracts';

import { AiAssistantError } from '../services/ai-assistant-service.js';
import { AiProviderError } from '../services/ai-provider.js';
import { AiProviderResolutionError } from '../services/ai-provider-resolver.js';
import { ApiError } from './api-error.js';
import { apiErrorResponseSchema } from './response-schemas/common.js';

const STATUS_BY_AI_ERROR: Record<AiErrorCode, number> = {
  AI_ASSISTANT_INVALID_REQUEST: 400,
  AI_CLOUD_CONSENT_REQUIRED: 409,
  AI_PROVIDER_UNAVAILABLE: 503,
  AI_MODEL_UNAVAILABLE: 422,
  AI_PROVIDER_AUTH_FAILED: 502,
  AI_PROVIDER_QUOTA_EXCEEDED: 429,
  AI_PROVIDER_RATE_LIMITED: 429,
  AI_PROVIDER_TIMEOUT: 504,
  AI_REQUEST_CANCELLED: 409,
  AI_PROVIDER_INVALID_RESPONSE: 502,
  AI_PROVIDER_OPERATION_UNSUPPORTED: 422,
  AI_PROVIDER_REQUEST_FAILED: 502,
};

export const aiProviderErrorResponseSchemas = {
  422: apiErrorResponseSchema,
  429: apiErrorResponseSchema,
  502: apiErrorResponseSchema,
  503: apiErrorResponseSchema,
  504: apiErrorResponseSchema,
} as const;

export function aiErrorCode(error: unknown): AiErrorCode | undefined {
  if (
    error instanceof AiProviderResolutionError ||
    error instanceof AiProviderError ||
    error instanceof AiAssistantError
  ) {
    return error.code;
  }
  return undefined;
}

export function aiApiError(error: unknown): ApiError | null {
  const code = aiErrorCode(error);
  if (!code) return null;
  return new ApiError({
    statusCode: STATUS_BY_AI_ERROR[code],
    code,
    message:
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir a operação de IA.',
  });
}
