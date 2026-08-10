import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
import type { GitPullRequestService } from '../src/services/git-pull-request-service.js';

function project(id: string): Project {
  return {
    id,
    name: 'Projeto',
    path: '/tmp/projeto',
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

function reviewFilesService() {
  return {
    getReviewFiles: async () => ({
      targetRemote: 'origin' as const,
      baseBranch: 'main',
      sourceBranch: 'feature/sintese',
      files: ['src/a.ts', 'src/b.ts'],
    }),
    getReviewFileDiff: async (
      _path: string,
      _input: unknown,
      filePath: string,
    ) => ({
      targetRemote: 'origin' as const,
      baseBranch: 'main',
      sourceBranch: 'feature/sintese',
      files: ['src/a.ts', 'src/b.ts'],
      diff: `diff --git a/${filePath} b/${filePath}\n+export const value = true;`,
    }),
  } as unknown as Pick<
    GitPullRequestService,
    'getReviewFiles' | 'getReviewFileDiff'
  >;
}

async function settles(
  service: GitAiCodeReviewService,
  projectId: string,
): Promise<ReturnType<GitAiCodeReviewService['latest']>> {
  for (let attempts = 0; attempts < 50; attempts += 1) {
    const execution = service.latest(projectId);
    if (execution?.status !== 'running') return execution;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return service.latest(projectId);
}

function localReview(path: string): string {
  return JSON.stringify({
    summary: `${path} revisado.`,
    findings: [
      {
        severity: 'warning',
        path,
        line: 1,
        title: 'Achado local',
        explanation: 'Há um ponto a revisar.',
        recommendation: 'Ajuste o arquivo.',
      },
    ],
  });
}

test('fast preserva agregação por arquivo sem síntese global', async () => {
  let calls = 0;
  const service = new GitAiCodeReviewService(
    {
      review: async (_model, messages) => {
        calls += 1;
        const prompt = messages[1]?.content ?? '';
        return localReview(
          prompt.includes('src/a.ts') ? 'src/a.ts' : 'src/b.ts',
        );
      },
    } as unknown as AiAssistantService,
    reviewFilesService(),
  );
  const proj = project('fast-synthesis');

  await service.start({
    project: proj,
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'modelo-teste',
    mode: 'fast',
  });

  const completed = await settles(service, proj.id);
  assert.equal(completed?.status, 'completed');
  assert.equal(calls, 2);
  assert.equal(
    completed?.review?.summary,
    'A IA revisou 2 arquivo(s) separadamente.',
  );
});

test(
  'complete executa síntese global e deduplica achados equivalentes',
  async () => {
    let calls = 0;
    let synthesisPrompt = '';
    const service = new GitAiCodeReviewService(
      {
        review: async (_model, messages) => {
          calls += 1;
          const prompt = messages[1]?.content ?? '';
          if (calls <= 2) {
            return localReview(
              prompt.includes('src/a.ts') ? 'src/a.ts' : 'src/b.ts',
            );
          }
          synthesisPrompt = prompt;
          return JSON.stringify({
            summary: 'Há um problema global entre os dois arquivos.',
            findings: [
              {
                severity: 'warning',
                path: 'src/a.ts',
                line: 1,
                title: 'Contrato inconsistente',
                explanation: 'A exportação diverge do consumidor.',
                recommendation: 'Alinhe o contrato entre os arquivos.',
              },
              {
                severity: 'warning',
                path: 'src/a.ts',
                line: 1,
                title: 'Contrato inconsistente',
                explanation: 'A exportação diverge do consumidor.',
                recommendation: 'Alinhe o contrato entre os arquivos.',
              },
              {
                severity: 'suggestion',
                path: 'src/b.ts',
                title: 'Teste integrado ausente',
                explanation: 'A alteração cruzada não tem cobertura conjunta.',
                recommendation: 'Adicione um teste cobrindo os dois arquivos.',
              },
            ],
          });
        },
      } as unknown as AiAssistantService,
      reviewFilesService(),
    );
    const proj = project('complete-synthesis');

    await service.start({
      project: proj,
      targetRemote: 'origin',
      baseBranch: 'main',
      model: 'modelo-teste',
      mode: 'complete',
    });

    const completed = await settles(service, proj.id);
    assert.equal(completed?.status, 'completed');
    assert.equal(calls, 3);
    assert.match(synthesisPrompt, /CONTEXTO_LOCAL/);
    assert.match(synthesisPrompt, /src\/a\.ts/);
    assert.match(synthesisPrompt, /src\/b\.ts/);
    assert.equal(
      completed?.review?.summary,
      'Há um problema global entre os dois arquivos.',
    );
    assert.equal(completed?.review?.findings.length, 2);
  },
);

test(
  'complete falha explicitamente quando a síntese global não retorna JSON válido',
  async () => {
    let calls = 0;
    const service = new GitAiCodeReviewService(
      {
        review: async (_model, messages) => {
          calls += 1;
          if (calls === 3) return 'resultado global sem JSON';
          const prompt = messages[1]?.content ?? '';
          return localReview(
            prompt.includes('src/a.ts') ? 'src/a.ts' : 'src/b.ts',
          );
        },
      } as unknown as AiAssistantService,
      reviewFilesService(),
    );
    const proj = project('invalid-synthesis');

    await service.start({
      project: proj,
      targetRemote: 'origin',
      baseBranch: 'main',
      model: 'modelo-teste',
      mode: 'complete',
    });

    const failed = await settles(service, proj.id);
    assert.equal(failed?.status, 'failed');
    assert.equal(calls, 3);
    assert.match(failed?.errorMessage ?? '', /síntese global/i);
    assert.equal(
      failed?.review?.summary,
      'A IA revisou 2 arquivo(s) separadamente.',
    );
    assert.equal(failed?.review?.findings.length, 2);
  },
);

test(
  'cancelamento durante a síntese global preserva a revisão parcial',
  async () => {
    let calls = 0;
    let synthesisStarted = false;
    const service = new GitAiCodeReviewService(
      {
        review: async (_model, messages, signal) => {
          calls += 1;
          if (calls <= 2) {
            const prompt = messages[1]?.content ?? '';
            return localReview(
              prompt.includes('src/a.ts') ? 'src/a.ts' : 'src/b.ts',
            );
          }
          synthesisStarted = true;
          return new Promise<string>((resolve) => {
            signal.addEventListener('abort', () => resolve('{}'));
          });
        },
      } as unknown as AiAssistantService,
      reviewFilesService(),
    );
    const proj = project('cancel-synthesis');
    const started = await service.start({
      project: proj,
      targetRemote: 'origin',
      baseBranch: 'main',
      model: 'modelo-teste',
      mode: 'complete',
    });

    for (let attempts = 0; attempts < 30 && !synthesisStarted; attempts += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(synthesisStarted, true);

    const cancelled = service.cancel(proj.id, started.id);
    const settled = await settles(service, proj.id);
    assert.equal(cancelled?.status, 'cancelled');
    assert.equal(settled?.status, 'cancelled');
    assert.equal(settled?.review?.findings.length, 2);
  },
);
