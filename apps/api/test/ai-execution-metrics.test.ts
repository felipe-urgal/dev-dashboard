import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  Project,
} from '@dev-dashboard/contracts';

import type { AiExecutionMetricsLogger } from '../src/services/ai-execution-metrics.js';
import { AiImplementationExecutionService } from '../src/services/ai-implementation-execution-service.js';
import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';
import type { GitPullRequestService } from '../src/services/git-pull-request-service.js';

const project: Project = {
  id: 'project-metrics',
  name: 'Projeto',
  path: '/tmp/projeto',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace-1',
  enabled: true,
  capabilities: [],
};

function fakeLogger(): {
  logger: AiExecutionMetricsLogger;
  entries: Array<{ context: Record<string, unknown>; message: string }>;
} {
  const entries: Array<{ context: Record<string, unknown>; message: string }> =
    [];
  return {
    logger: {
      info: (context, message) => entries.push({ context, message }),
    },
    entries,
  };
}

test('implementation: registra métrica estruturada exatamente uma vez ao concluir', async () => {
  const { logger, entries } = fakeLogger();
  const assistant = {
    async chat(
      _project: Project,
      _model: string,
      _messages: AiChatMessage[],
      handlers: {
        signal: AbortSignal;
        send: (event: AiChatStreamEvent) => void;
      },
    ): Promise<void> {
      handlers.send({
        type: 'tool-call',
        tool: 'list_project_files',
        arguments: {},
      });
      handlers.send({
        type: 'tool-result',
        tool: 'list_project_files',
        ok: true,
        summary: 'Diretório listado.',
      });
      handlers.send({ type: 'done' });
    },
  };
  const service = new AiImplementationExecutionService(
    assistant,
    undefined,
    undefined,
    logger,
  );

  const started = service.start(project, 'qwen2.5-coder:14b', 'Criar testes');
  assert.equal(entries.length, 0);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.message, 'AI execution finished');
  assert.deepEqual(entries[0]?.context, {
    executionKind: 'implementation',
    executionId: started.id,
    projectId: project.id,
    provider: 'ollama',
    mode: 'fast',
    status: 'succeeded',
    durationMs: entries[0]?.context.durationMs,
  });
  assert.equal(typeof entries[0]?.context.durationMs, 'number');
});

test('implementation: métrica de cancelamento inclui o errorCode', async () => {
  const { logger, entries } = fakeLogger();
  const assistant = {
    async chat(
      _project: Project,
      _model: string,
      _messages: AiChatMessage[],
      handlers: {
        signal: AbortSignal;
        send: (event: AiChatStreamEvent) => void;
      },
    ): Promise<void> {
      await new Promise<void>((resolve) => {
        handlers.signal.addEventListener('abort', () => resolve());
      });
    },
  };
  const service = new AiImplementationExecutionService(
    assistant,
    undefined,
    undefined,
    logger,
  );
  const started = service.start(project, 'qwen2.5-coder:14b', 'Cancelar');

  service.cancel(project.id, started.id);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.context.status, 'cancelled');
  assert.equal(entries[0]?.context.errorCode, 'AI_REQUEST_CANCELLED');
});

test('code review: registra métrica estruturada ao concluir sem vazar conteúdo do diff', async () => {
  const { logger, entries } = fakeLogger();
  const service = new GitAiCodeReviewService(
    {
      review: async () =>
        JSON.stringify({ summary: 'Segredo do diff aqui.', findings: [] }),
    } as unknown as AiAssistantService,
    {
      getReviewFiles: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/arquivo.ts'],
      }),
      getReviewFileDiff: async () => ({
        targetRemote: 'origin',
        baseBranch: 'main',
        sourceBranch: 'feature/revisao',
        files: ['src/arquivo.ts'],
        diff: 'diff --git a/src/arquivo.ts b/src/arquivo.ts',
      }),
    } as unknown as Pick<
      GitPullRequestService,
      'getReviewFiles' | 'getReviewFileDiff'
    >,
    undefined,
    logger,
  );

  const started = await service.start({
    project,
    targetRemote: 'origin',
    baseBranch: 'main',
    model: 'qwen2.5-coder:14b',
  });
  assert.equal(entries.length, 0);

  for (let attempts = 0; attempts < 20; attempts += 1) {
    if (service.latest(project.id)?.status !== 'running') break;
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry?.message, 'AI execution finished');
  assert.deepEqual(entry?.context, {
    executionKind: 'code-review',
    executionId: started.id,
    projectId: project.id,
    provider: 'ollama',
    mode: 'fast',
    status: 'completed',
    durationMs: entry?.context.durationMs,
  });
  const serialized = JSON.stringify(entry?.context);
  assert.doesNotMatch(serialized, /Segredo do diff/);
});
