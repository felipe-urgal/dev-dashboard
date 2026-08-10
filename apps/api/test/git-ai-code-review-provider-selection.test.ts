import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
import { AiProviderResolutionError } from '../src/services/ai-provider-resolver.js';
import type { GitPullRequestService } from '../src/services/git-pull-request-service.js';

const project: Project = {
  id: 'project-provider-review',
  name: 'Projeto',
  path: '/tmp/projeto-provider-review',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace-1',
  favorite: false,
  enabled: true,
  capabilities: [],
};

async function settles(
  service: GitAiCodeReviewService,
): Promise<ReturnType<GitAiCodeReviewService['latest']>> {
  for (let attempts = 0; attempts < 30; attempts += 1) {
    const execution = service.latest(project.id);
    if (execution?.status !== 'running') return execution;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return service.latest(project.id);
}

test('congela provider e modo resolvidos no início da Code Review', async () => {
  let selectedProvider: 'ollama' | 'openai' = 'openai';
  let localCalls = 0;
  let cloudCalls = 0;
  let resolvedModel = '';

  const localAssistant = {
    review: async () => {
      localCalls += 1;
      return JSON.stringify({ summary: 'Local', findings: [] });
    },
  } as unknown as AiAssistantService;

  const cloudAssistant = {
    review: async () => {
      cloudCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return JSON.stringify({ summary: 'Cloud', findings: [] });
    },
  } as unknown as AiAssistantService;

  const resolver = {
    resolveSelected: async (_projectId: string, model?: string) => {
      resolvedModel = model ?? '';
      return {
        assistantService:
          selectedProvider === 'openai' ? cloudAssistant : localAssistant,
        provider: selectedProvider,
        mode: 'complete' as const,
      };
    },
  };

  const service = new GitAiCodeReviewService(
    localAssistant,
    {
      getReviewFiles: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/provider-review',
        files: ['src/primeiro.ts', 'src/segundo.ts'],
      }),
      getReviewFileDiff: async (_path, _input, filePath) => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/provider-review',
        files: ['src/primeiro.ts', 'src/segundo.ts'],
        diff: `diff --git a/${filePath} b/${filePath}`,
      }),
    } as unknown as Pick<
      GitPullRequestService,
      'getReviewFiles' | 'getReviewFileDiff'
    >,
    resolver,
  );

  const started = await service.start({
    project,
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'gpt-5-mini',
  });

  selectedProvider = 'ollama';
  const completed = await settles(service);

  assert.equal(resolvedModel, 'gpt-5-mini');
  assert.equal(started.provider, 'openai');
  assert.equal(started.mode, 'complete');
  assert.equal(completed?.provider, 'openai');
  assert.equal(completed?.mode, 'complete');
  assert.equal(completed?.status, 'completed');
  assert.equal(localCalls, 0);
  assert.equal(cloudCalls, 3);
});

test('bloqueia a Code Review antes de ler o diff quando o resolver rejeita provider ou modelo', async () => {
  const localAssistant = {
    review: async () => JSON.stringify({ summary: 'Local', findings: [] }),
  } as unknown as AiAssistantService;
  let reviewFilesCalls = 0;

  for (const error of [
    new AiProviderResolutionError(
      'AI_CLOUD_CONSENT_REQUIRED',
      'Autorize o uso da OpenAI para este projeto antes de enviar código à cloud.',
    ),
    new AiProviderResolutionError(
      'AI_PROVIDER_UNAVAILABLE',
      'O provider selecionado não está disponível.',
    ),
    new AiProviderResolutionError(
      'AI_MODEL_UNAVAILABLE',
      'O modelo selecionado não está disponível neste provider.',
    ),
  ]) {
    const service = new GitAiCodeReviewService(
      localAssistant,
      {
        getReviewFiles: async () => {
          reviewFilesCalls += 1;
          return {
            targetRemote: 'origin',
            baseBranch: 'main',
            sourceBranch: 'feature/provider-review',
            files: ['src/primeiro.ts'],
          };
        },
        getReviewFileDiff: async () => {
          throw new Error('não deve chegar ao diff');
        },
      } as unknown as Pick<
        GitPullRequestService,
        'getReviewFiles' | 'getReviewFileDiff'
      >,
      {
        resolveSelected: async () => {
          throw error;
        },
      },
    );

    await assert.rejects(
      service.start({
        project,
        targetRemote: 'origin',
        baseBranch: 'main',
        model: 'gpt-5-mini',
      }),
      (caught: unknown) => caught === error,
    );
  }

  assert.equal(reviewFilesCalls, 0);
});
