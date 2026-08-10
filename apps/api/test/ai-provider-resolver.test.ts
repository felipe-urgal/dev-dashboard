import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ProjectAiConsentRepository,
  ProjectAiSelectionRepository,
} from '@dev-dashboard/core';

import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import {
  AiProviderResolutionError,
  AiProviderResolver,
} from '../src/services/ai-provider-resolver.js';

function assistant(
  available: boolean,
  model: string,
  message: string,
): AiAssistantService {
  return {
    status: async () => ({
      available,
      models: available
        ? [{ name: model, capabilities: ['chat', 'tools'] as const }]
        : [],
      message,
    }),
  } as unknown as AiAssistantService;
}

async function withRepositories(
  callback: (
    directory: string,
    consentRepository: ProjectAiConsentRepository,
    selectionRepository: ProjectAiSelectionRepository,
  ) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-provider-'),
  );
  try {
    await callback(
      directory,
      new ProjectAiConsentRepository(directory),
      new ProjectAiSelectionRepository(directory),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('status inicia em Ollama + fast e explicita OpenAI não autenticada', async () => {
  await withRepositories(async (_directory, consentRepository, selectionRepository) => {
    const resolver = new AiProviderResolver({
      ollama: assistant(true, 'qwen2.5-coder:14b', 'Ollama disponível.'),
      openai: assistant(false, 'gpt-5-mini', 'OpenAI não configurada.'),
      consentRepository,
      selectionRepository,
    });

    const status = await resolver.status('project-1');

    assert.equal(status.selectedProvider, 'ollama');
    assert.equal(status.selectedMode, 'fast');
    assert.equal(status.providers.length, 2);
    const openai = status.providers.find((provider) => provider.id === 'openai');
    assert.equal(openai?.available, false);
    assert.equal(openai?.kind, 'cloud');
    assert.equal(openai?.consentGranted, false);
    assert.match(openai?.message ?? '', /não configurada/i);
  });
});

test('OpenAI selecionada continua bloqueada sem consentimento do projeto', async () => {
  await withRepositories(async (_directory, consentRepository, selectionRepository) => {
    await selectionRepository.set('project-1', {
      provider: 'openai',
      mode: 'complete',
    });
    const resolver = new AiProviderResolver({
      ollama: assistant(true, 'qwen2.5-coder:14b', 'Ollama disponível.'),
      openai: assistant(true, 'gpt-5-mini', 'OpenAI disponível.'),
      consentRepository,
      selectionRepository,
    });

    await assert.rejects(
      resolver.resolveSelected('project-1'),
      (error: unknown) =>
        error instanceof AiProviderResolutionError &&
        error.code === 'AI_CLOUD_CONSENT_REQUIRED',
    );
  });
});

test('consentimento libera OpenAI e seleção persiste localmente', async () => {
  await withRepositories(async (directory, consentRepository, selectionRepository) => {
    const openaiAssistant = assistant(
      true,
      'gpt-5-mini',
      'OpenAI disponível.',
    );
    const resolver = new AiProviderResolver({
      ollama: assistant(true, 'qwen2.5-coder:14b', 'Ollama disponível.'),
      openai: openaiAssistant,
      consentRepository,
      selectionRepository,
    });

    await resolver.setSelection('project-1', 'openai', 'complete');
    await resolver.setCloudConsent('project-1', 'openai', true);

    const resolved = await resolver.resolveSelected('project-1');
    assert.equal(resolved.assistantService, openaiAssistant);
    assert.equal(resolved.provider, 'openai');
    assert.equal(resolved.mode, 'complete');

    const reloadedSelection = new ProjectAiSelectionRepository(directory);
    const reloadedConsent = new ProjectAiConsentRepository(directory);
    assert.deepEqual(reloadedSelection.get('project-1'), {
      provider: 'openai',
      mode: 'complete',
    });
    assert.equal(reloadedConsent.has('project-1', 'openai'), true);
  });
});

test('revogar consentimento bloqueia a próxima resolução cloud', async () => {
  await withRepositories(async (_directory, consentRepository, selectionRepository) => {
    const resolver = new AiProviderResolver({
      ollama: assistant(true, 'qwen2.5-coder:14b', 'Ollama disponível.'),
      openai: assistant(true, 'gpt-5-mini', 'OpenAI disponível.'),
      consentRepository,
      selectionRepository,
    });
    await resolver.setSelection('project-1', 'openai', 'fast');
    await resolver.setCloudConsent('project-1', 'openai', true);
    await resolver.resolveSelected('project-1');

    await resolver.setCloudConsent('project-1', 'openai', false);

    await assert.rejects(
      resolver.resolveSelected('project-1'),
      (error: unknown) =>
        error instanceof AiProviderResolutionError &&
        error.code === 'AI_CLOUD_CONSENT_REQUIRED',
    );
  });
});
