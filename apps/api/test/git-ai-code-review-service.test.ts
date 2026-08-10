import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import type { GitPullRequestService } from '../src/services/git-pull-request-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/tmp/projeto',
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
  for (let attempts = 0; attempts < 20; attempts += 1) {
    const execution = service.latest(project.id);
    if (execution?.status !== 'running') return execution;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return service.latest(project.id);
}

test('mantém a revisão em execução fora da requisição que a iniciou', async () => {
  const prompts: string[] = [];
  const service = new GitAiCodeReviewService(
    {
      review: async (_model, messages) => {
        prompts.push(messages[1]?.content ?? '');
        return JSON.stringify({ summary: 'Revisão concluída.', findings: [] });
      },
    } as unknown as AiAssistantService,
    {
      getReviewFiles: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/primeiro.ts', 'src/segundo.ts'],
      }),
      getReviewFileDiff: async (_path, _input, filePath) => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/primeiro.ts', 'src/segundo.ts'],
        diff: `diff --git a/${filePath} b/${filePath}`,
      }),
    } as unknown as Pick<
      GitPullRequestService,
      'getReviewFiles' | 'getReviewFileDiff'
    >,
  );

  const started = await service.start({
    project,
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'qwen2.5-coder:14b',
  });

  assert.equal(started.status, 'running');
  assert.equal(started.completedFileCount, 0);
  assert.equal(service.latest(project.id)?.id, started.id);

  const completed = await settles(service);
  assert.equal(completed?.status, 'completed');
  assert.equal(completed?.completedFileCount, 2);
  assert.equal(
    completed?.review?.summary,
    'A IA revisou 2 arquivo(s) separadamente.',
  );
  assert.equal(prompts.length, 2);
});

test('continua os próximos arquivos quando a IA falha em um deles', async () => {
  let calls = 0;
  const service = new GitAiCodeReviewService(
    {
      review: async () => {
        calls += 1;
        if (calls === 1) throw new Error('modelo indisponível');
        return JSON.stringify({
          summary: 'Segundo arquivo revisado.',
          findings: [],
        });
      },
    } as unknown as AiAssistantService,
    {
      getReviewFiles: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/primeiro.ts', 'src/segundo.ts'],
      }),
      getReviewFileDiff: async (_path, _input, filePath) => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/primeiro.ts', 'src/segundo.ts'],
        diff: `diff --git a/${filePath} b/${filePath}`,
      }),
    } as unknown as Pick<
      GitPullRequestService,
      'getReviewFiles' | 'getReviewFileDiff'
    >,
  );

  await service.start({
    project,
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'qwen2.5-coder:14b',
  });

  const completed = await settles(service);
  assert.equal(completed?.status, 'completed');
  assert.equal(completed?.completedFileCount, 2);
  assert.equal(completed?.failedFiles.length, 1);
  assert.equal(completed?.review?.summary, 'A IA revisou 1 de 2 arquivo(s).');
});
