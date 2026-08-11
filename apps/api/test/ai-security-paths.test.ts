import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { LOG_MASK } from '@dev-dashboard/process-manager';

import { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { AiImplementationExecutionService } from '../src/services/ai-implementation-execution-service.js';
import { createAiOutboundProtectionFetch } from '../src/services/ai-outbound-protection-fetch.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
import { GitService } from '../src/services/git-service.js';
import { ProjectFileService } from '../src/services/project-file-service.js';
import type { GitPullRequestService } from '../src/services/git-pull-request-service.js';

function project(root: string): Project {
  return {
    id: 'project-1',
    name: 'Painel',
    path: root,
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

async function waitForImplementation(
  service: AiImplementationExecutionService,
  projectId: string,
  executionId: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (service.find(projectId, executionId)?.status !== 'running') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('A execução de implementação não terminou dentro do limite.');
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

test('conteúdo lido por ferramenta é mascarado antes da rodada seguinte do chat', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-mask-tool-'),
  );
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
  await writeFile(
    path.join(root, 'config.ts'),
    `export const API_KEY = '${secret}';\n`,
    'utf8',
  );

  try {
    const requestBodies: string[] = [];
    let round = 0;
    const rawFetch: typeof fetch = async (_input, init) => {
      requestBodies.push(String(init?.body ?? ''));
      round += 1;
      if (round === 1) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'read_project_file',
                    arguments: { path: 'config.ts' },
                  },
                },
              ],
            },
            done: true,
          }),
        );
      }
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: 'Arquivo analisado.' },
          done: true,
        }),
      );
    };
    const service = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: createAiOutboundProtectionFetch(rawFetch),
    });

    await service.chat(
      project(root),
      'qwen2.5-coder:14b',
      [{ role: 'user', content: 'Leia o arquivo config.ts.' }],
      {
        signal: new AbortController().signal,
        send: () => undefined,
      },
    );

    assert.equal(requestBodies.length, 2);
    assert.equal((requestBodies[1] ?? '').includes(secret), false);
    assert.ok((requestBodies[1] ?? '').includes(LOG_MASK));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('implementation usa a mesma barreira de masking do chat', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-ai-mask-implementation-'),
  );
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz654321';
  await writeFile(
    path.join(root, 'app.ts'),
    'export const value = 1;\n',
    'utf8',
  );

  try {
    const requestBodies: string[] = [];
    let round = 0;
    const rawFetch: typeof fetch = async (_input, init) => {
      requestBodies.push(String(init?.body ?? ''));
      round += 1;
      if (round === 1) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'read_project_file',
                    arguments: { path: 'app.ts' },
                  },
                },
              ],
            },
            done: true,
          }),
        );
      }
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: 'Concluído.' },
          done: true,
        }),
      );
    };
    const assistant = new AiAssistantService({
      projectFileService: new ProjectFileService(),
      gitService: new GitService(),
      fetchImpl: createAiOutboundProtectionFetch(rawFetch),
    });
    const implementation = new AiImplementationExecutionService(assistant);
    const proj = project(root);

    const started = implementation.start(
      proj,
      'qwen2.5-coder:14b',
      `Atualize a integração. API_KEY=${secret}`,
    );
    await waitForImplementation(implementation, proj.id, started.id);

    assert.equal(implementation.find(proj.id, started.id)?.status, 'succeeded');
    assert.equal(requestBodies.length, 2);
    assert.equal(
      requestBodies.some((body) => body.includes(secret)),
      false,
    );
    assert.ok(requestBodies.some((body) => body.includes(LOG_MASK)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
