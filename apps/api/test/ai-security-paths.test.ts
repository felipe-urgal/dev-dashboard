import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { LOG_MASK } from '@dev-dashboard/process-manager';

import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
import type { GitPullRequestService } from '../src/services/git-pull-request-service.js';

function project(root: string): Project {
  return {
    id: 'project-1',
    name: 'Painel',
    path: root,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: [],
  };
}

async function waitForReview(
  service: GitAiCodeReviewService,
  projectId: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (service.latest(projectId)?.status !== 'running') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('A execução de code review não terminou dentro do limite.');
}

test('code review preserva masking e metadados de redação antes de chamar o modelo', async () => {
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz999999';
  let receivedPrompt = '';
  const service = new GitAiCodeReviewService(
    {
      review: async (_model, messages) => {
        receivedPrompt = messages[1]?.content ?? '';
        return JSON.stringify({ summary: 'Sem achados.', findings: [] });
      },
    } as unknown as AiAssistantService,
    {
      getReviewFiles: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/masking',
        files: ['src/config.ts'],
      }),
      getReviewFileDiff: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/masking',
        files: ['src/config.ts'],
        diff: `+ const API_KEY = '${secret}';`,
      }),
    } as unknown as Pick<
      GitPullRequestService,
      'getReviewFiles' | 'getReviewFileDiff'
    >,
  );

  await service.start({
    project: project('/tmp/projeto'),
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'qwen2.5-coder:14b',
  });
  await waitForReview(service, 'project-1');

  const completed = service.latest('project-1');
  assert.equal(completed?.status, 'completed');
  assert.equal(receivedPrompt.includes(secret), false);
  assert.ok(receivedPrompt.includes(LOG_MASK));
  assert.equal(completed?.review?.masked, true);
  assert.ok((completed?.review?.redactionCount ?? 0) > 0);
});
