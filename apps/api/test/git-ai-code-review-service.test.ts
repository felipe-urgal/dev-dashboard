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

test('revisa somente os arquivos selecionados com a concorrência escolhida', async () => {
  const reviewedPaths: string[] = [];
  const service = new GitAiCodeReviewService(
    {
      review: async (_model, messages) => {
        reviewedPaths.push(messages[1]?.content ?? '');
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
    paths: ['src/segundo.ts'],
    concurrency: 2,
  });

  const completed = await settles(service);
  assert.deepEqual(started.files, ['src/segundo.ts']);
  assert.equal(started.concurrency, 2);
  assert.equal(completed?.completedFileCount, 1);
  assert.equal(reviewedPaths.length, 1);
  assert.match(reviewedPaths[0] ?? '', /src\/segundo\.ts/);
});

test('cancela a chamada ao modelo e preserva o estado parcial da revisão', async () => {
  let aborted = false;
  const service = new GitAiCodeReviewService(
    {
      review: async (_model, _messages, signal) =>
        new Promise<string>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve(
              JSON.stringify({ summary: 'Não deve concluir.', findings: [] }),
            );
          });
        }),
    } as unknown as AiAssistantService,
    {
      getReviewFiles: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/primeiro.ts'],
      }),
      getReviewFileDiff: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/primeiro.ts'],
        diff: 'diff --git a/src/primeiro.ts b/src/primeiro.ts',
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
  await new Promise((resolve) => setImmediate(resolve));
  const cancelled = service.cancel(project.id, started.id);
  const settled = await settles(service);

  assert.equal(cancelled?.status, 'cancelled');
  assert.equal(settled?.status, 'cancelled');
  assert.equal(aborted, true);
  assert.equal(settled?.completedFileCount, 0);
  assert.equal(settled?.failedFiles.length, 0);
  assert.equal(settled?.fileExecutions[0]?.status, 'cancelled');
});
