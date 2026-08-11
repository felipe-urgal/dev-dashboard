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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

test('close cancela Code Review em andamento e aborta o request do provider', async () => {
  const reviewStarted = deferred<void>();
  let aborted = false;
  const assistant = {
    review: async (
      _model: string,
      _messages: unknown,
      signal?: AbortSignal,
    ) => {
      reviewStarted.resolve();
      return new Promise<string>((resolve) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
          resolve(JSON.stringify({ summary: 'Tardio', findings: [] }));
        });
      });
    },
  } as unknown as AiAssistantService;
  const service = new GitAiCodeReviewService(assistant, {
    getReviewFiles: async () => ({
      targetRemote: 'origin',
      baseBranch: 'main',
      sourceBranch: 'feature/provider-review',
      files: ['src/primeiro.ts'],
    }),
    getReviewFileDiff: async () => ({
      targetRemote: 'origin',
      baseBranch: 'main',
      sourceBranch: 'feature/provider-review',
      files: ['src/primeiro.ts'],
      diff: 'diff --git a/src/primeiro.ts b/src/primeiro.ts',
    }),
  } as unknown as Pick<
    GitPullRequestService,
    'getReviewFiles' | 'getReviewFileDiff'
  >);

  const started = await service.start({
    project,
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'qwen2.5-coder:14b',
  });
  await reviewStarted.promise;

  service.close();

  const cancelled = service.latest(project.id);
  assert.equal(cancelled?.id, started.id);
  assert.equal(cancelled?.status, 'cancelled');
  assert.equal(cancelled?.errorCode, 'AI_REQUEST_CANCELLED');
  assert.equal(aborted, true);
});

test('síntese tardia não sobrescreve uma Code Review cancelada', async () => {
  const synthesisStarted = deferred<void>();
  const synthesisResult = deferred<string>();
  let calls = 0;
  const assistant = {
    review: async () => {
      calls += 1;
      if (calls === 1) {
        return JSON.stringify({ summary: 'Arquivo revisado.', findings: [] });
      }
      synthesisStarted.resolve();
      return synthesisResult.promise;
    },
  } as unknown as AiAssistantService;
  const service = new GitAiCodeReviewService(
    assistant,
    {
      getReviewFiles: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/provider-review',
        files: ['src/primeiro.ts'],
      }),
      getReviewFileDiff: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/provider-review',
        files: ['src/primeiro.ts'],
        diff: 'diff --git a/src/primeiro.ts b/src/primeiro.ts',
      }),
    } as unknown as Pick<
      GitPullRequestService,
      'getReviewFiles' | 'getReviewFileDiff'
    >,
    {
      resolveSelected: async () => ({
        assistantService: assistant,
        provider: 'openai' as const,
        mode: 'complete' as const,
      }),
    },
  );

  const started = await service.start({
    project,
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'gpt-5-mini',
  });
  await synthesisStarted.promise;

  const cancelled = service.cancel(project.id, started.id);
  assert.equal(cancelled?.status, 'cancelled');
  synthesisResult.resolve(
    JSON.stringify({ summary: 'Síntese tardia.', findings: [] }),
  );
  await new Promise((resolve) => setImmediate(resolve));

  const afterLateResponse = service.latest(project.id);
  assert.equal(afterLateResponse?.status, 'cancelled');
  assert.equal(afterLateResponse?.errorCode, 'AI_REQUEST_CANCELLED');
});
