import assert from 'node:assert/strict';
import { test } from 'vitest';

import type {
  AiImplementationExecution,
  ProjectAiProviderStatus,
} from '@dev-dashboard/contracts';

import { resolveAiFallbackOffer } from '../src/ai-fallback.js';

function failedExecution(): AiImplementationExecution {
  return {
    id: 'e852c4aa-e432-4fd8-a326-d30f366b9ad5',
    projectId: 'p1',
    model: 'qwen2.5-coder:14b',
    prompt: 'Adicionar testes',
    status: 'failed',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:10.000Z',
    finishedAt: '2026-08-10T12:00:10.000Z',
    events: [{ type: 'error', message: 'Ollama ficou indisponível.' }],
  };
}

function providers(
  ollamaAvailable: boolean,
  openaiAvailable: boolean,
): ProjectAiProviderStatus[] {
  return [
    {
      id: 'ollama',
      label: 'Local',
      kind: 'local',
      available: ollamaAvailable,
      models: [],
      message: ollamaAvailable ? 'Ollama disponível.' : 'Ollama indisponível.',
      consentRequired: false,
      consentGranted: true,
    },
    {
      id: 'openai',
      label: 'OpenAI',
      kind: 'cloud',
      available: openaiAvailable,
      models: [],
      message: openaiAvailable ? 'OpenAI disponível.' : 'OpenAI indisponível.',
      consentRequired: true,
      consentGranted: false,
    },
  ];
}

test('offer sugere outro provider quando o atual falhou e está indisponível', () => {
  assert.deepEqual(
    resolveAiFallbackOffer('offer', failedExecution(), 'ollama', providers(false, true)),
    {
      fromProvider: 'ollama',
      toProvider: 'openai',
      reason: 'Ollama ficou indisponível.',
    },
  );
});

test('off encerra sem oferecer troca', () => {
  assert.equal(
    resolveAiFallbackOffer('off', failedExecution(), 'ollama', providers(false, true)),
    null,
  );
});

test('não oferece fallback para erro com provider ainda disponível', () => {
  assert.equal(
    resolveAiFallbackOffer('offer', failedExecution(), 'ollama', providers(true, true)),
    null,
  );
});

test('não oferece provider alternativo indisponível', () => {
  assert.equal(
    resolveAiFallbackOffer('offer', failedExecution(), 'ollama', providers(false, false)),
    null,
  );
});
