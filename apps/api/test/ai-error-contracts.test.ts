import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiErrorCode } from '@dev-dashboard/contracts';

import { aiApiError, aiErrorCode } from '../src/http/ai-error.js';
import { AiAssistantError } from '../src/services/ai-assistant-service.js';
import { AiProviderError } from '../src/services/ai-provider.js';

const cases: Array<{
  code: AiErrorCode;
  statusCode: number;
  error: Error;
}> = [
  {
    code: 'AI_ASSISTANT_INVALID_REQUEST',
    statusCode: 400,
    error: new AiAssistantError('Request inválido.'),
  },
  {
    code: 'AI_PROVIDER_UNAVAILABLE',
    statusCode: 503,
    error: new AiProviderError(
      'AI_PROVIDER_UNAVAILABLE',
      'Provider indisponível.',
    ),
  },
  {
    code: 'AI_PROVIDER_AUTH_FAILED',
    statusCode: 502,
    error: new AiProviderError(
      'AI_PROVIDER_AUTH_FAILED',
      'Autenticação do provider falhou.',
    ),
  },
  {
    code: 'AI_PROVIDER_QUOTA_EXCEEDED',
    statusCode: 429,
    error: new AiProviderError('AI_PROVIDER_QUOTA_EXCEEDED', 'Quota esgotada.'),
  },
  {
    code: 'AI_PROVIDER_RATE_LIMITED',
    statusCode: 429,
    error: new AiProviderError('AI_PROVIDER_RATE_LIMITED', 'Rate limit.'),
  },
  {
    code: 'AI_PROVIDER_TIMEOUT',
    statusCode: 504,
    error: new AiProviderError('AI_PROVIDER_TIMEOUT', 'Timeout.'),
  },
  {
    code: 'AI_REQUEST_CANCELLED',
    statusCode: 409,
    error: new AiProviderError('AI_REQUEST_CANCELLED', 'Cancelada.'),
  },
  {
    code: 'AI_PROVIDER_INVALID_RESPONSE',
    statusCode: 502,
    error: new AiProviderError(
      'AI_PROVIDER_INVALID_RESPONSE',
      'Resposta inválida.',
    ),
  },
  {
    code: 'AI_PROVIDER_OPERATION_UNSUPPORTED',
    statusCode: 422,
    error: new AiProviderError(
      'AI_PROVIDER_OPERATION_UNSUPPORTED',
      'Operação não suportada.',
    ),
  },
  {
    code: 'AI_PROVIDER_REQUEST_FAILED',
    statusCode: 502,
    error: new AiProviderError('AI_PROVIDER_REQUEST_FAILED', 'Falha upstream.'),
  },
];

test('traduz classes de falha de IA para código e status HTTP estáveis', () => {
  for (const item of cases) {
    assert.equal(aiErrorCode(item.error), item.code);
    const translated = aiApiError(item.error);
    assert.ok(translated);
    assert.equal(translated.code, item.code);
    assert.equal(translated.statusCode, item.statusCode);
    assert.equal(translated.message, item.error.message);
  }
});

test('não classifica erro estranho como falha conhecida de IA', () => {
  const error = new Error('erro de outro domínio');
  assert.equal(aiErrorCode(error), undefined);
  assert.equal(aiApiError(error), null);
});
