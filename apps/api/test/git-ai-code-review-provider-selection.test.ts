import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
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
    resolveSelected: async () => ({
      assistantService:
        selectedProvider === 'openai' ? cloudAssistant : localAssistant,
      provider: selectedProvider,
      mode: 'complete' as const,
    }),
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
  const tracked = started as typeof started & {
    provider: 'ollama' | 'openai';
    mode: 'fast' | 'complete';
  };

  assert.equal(tracked.provider, 'openai');
  assert.equal(tracked.mode, 'complete');
  assert.equal(completed?.status, 'completed');
  assert.equal(localCalls, 0);
  assert.equal(cloudCalls, 3);
});
