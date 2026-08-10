import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AiChatStreamEvent,
  AiExecutionMode,
  Project,
} from '@dev-dashboard/contracts';

import { AiAssistantService } from '../src/services/ai-assistant-service.js';
import {
  AI_EXECUTION_POLICIES,
  DEFAULT_AI_EXECUTION_MODE,
} from '../src/services/ai-execution-policy.js';
import type { AiProvider } from '../src/services/ai-provider.js';
import { GitAiCodeReviewService } from '../src/services/git-ai-code-review-service.js';

function project(id = 'project-1'): Project {
  return {
    id,
    name: 'Painel',
    path: '/tmp/inexistente',
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

function toolLoopProvider(repeated = false): {
  provider: AiProvider;
  rounds: () => number;
} {
  let roundCount = 0;
  return {
    rounds: () => roundCount,
    provider: {
      status: async () => ({ available: true, models: [], message: 'ok' }),
      chatRound: async () => {
        roundCount += 1;
        return {
          content: '',
          toolCalls: [
            {
              name: 'read_project_file',
              arguments: {
                path: repeated ? 'missing.ts' : `missing-${roundCount}.ts`,
              },
            },
          ],
        };
      },
      complete: async () => ({ text: '' }),
    },
  };
}

async function runToolLoop(
  mode?: AiExecutionMode,
  repeated = false,
): Promise<{ rounds: number; events: AiChatStreamEvent[] }> {
  const fake = toolLoopProvider(repeated);
  const service = new AiAssistantService({ provider: fake.provider });
  const events: AiChatStreamEvent[] = [];

  await service.chat(
    project(),
    'modelo-teste',
    [{ role: 'user', content: 'Analise o projeto.' }],
    {
      signal: new AbortController().signal,
      send: (event) => events.push(event),
    },
    mode,
  );

  return { rounds: fake.rounds(), events };
}

async function waitForReview(
  service: GitAiCodeReviewService,
  projectId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (service.latest(projectId)?.status !== 'running') return;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('fast preserva os budgets atuais e complete aumenta a profundidade', () => {
  assert.equal(DEFAULT_AI_EXECUTION_MODE, 'fast');
  assert.equal(AI_EXECUTION_POLICIES.fast.maxToolRounds, 4);
  assert.equal(AI_EXECUTION_POLICIES.fast.maxDiffChars, 4_000);
  assert.equal(AI_EXECUTION_POLICIES.fast.runGlobalSynthesis, false);

  assert.ok(
    AI_EXECUTION_POLICIES.complete.maxToolRounds >
      AI_EXECUTION_POLICIES.fast.maxToolRounds,
  );
  assert.ok(
    AI_EXECUTION_POLICIES.complete.maxToolResultChars >
      AI_EXECUTION_POLICIES.fast.maxToolResultChars,
  );
  assert.ok(
    AI_EXECUTION_POLICIES.complete.maxAccumulatedToolResultChars >
      AI_EXECUTION_POLICIES.fast.maxAccumulatedToolResultChars,
  );
  assert.ok(
    AI_EXECUTION_POLICIES.complete.maxDiffChars >
      AI_EXECUTION_POLICIES.fast.maxDiffChars,
  );
  assert.ok(
    AI_EXECUTION_POLICIES.complete.maxContextFiles >
      AI_EXECUTION_POLICIES.fast.maxContextFiles,
  );
  assert.equal(AI_EXECUTION_POLICIES.complete.runGlobalSynthesis, true);
});

test('fast mantém limite de quatro rodadas do assistente', async () => {
  const result = await runToolLoop();

  assert.equal(result.rounds, 4);
  const error = result.events.find((event) => event.type === 'error');
  assert.ok(error);
  assert.match(error.message, /encadeou ferramentas demais/);
});

test('complete permite mais rodadas sem remover o limite', async () => {
  const result = await runToolLoop('complete');

  assert.equal(result.rounds, 10);
  const error = result.events.find((event) => event.type === 'error');
  assert.ok(error);
  assert.match(error.message, /encadeou ferramentas demais/);
});

test('tool call idêntica repetida é interrompida antes de formar loop', async () => {
  const result = await runToolLoop('complete', true);

  assert.equal(result.rounds, 3);
  assert.equal(
    result.events.filter((event) => event.type === 'tool-call').length,
    2,
  );
  const error = result.events.find((event) => event.type === 'error');
  assert.ok(error);
  assert.match(error.message, /mesmos argumentos sem progresso/);
});

test('code review usa maxDiffChars da policy selecionada', async () => {
  const diff = `+${'x'.repeat(8_999)}`;

  async function reviewWithMode(mode: AiExecutionMode, projectId: string) {
    const receivedPrompts: string[] = [];
    const service = new GitAiCodeReviewService(
      {
        review: async (_model, messages) => {
          receivedPrompts.push(messages[1]?.content ?? '');
          return JSON.stringify({ summary: 'Sem achados.', findings: [] });
        },
      } as unknown as AiAssistantService,
      {
        getReviewFiles: async () => ({
          targetRemote: 'origin',
          baseBranch: 'main',
          sourceBranch: 'feature/modos',
          files: ['src/index.ts'],
        }),
        getReviewFileDiff: async () => ({
          targetRemote: 'origin',
          baseBranch: 'main',
          sourceBranch: 'feature/modos',
          files: ['src/index.ts'],
          diff,
        }),
      },
    );

    await service.start({
      project: project(projectId),
      targetRemote: 'origin',
      baseBranch: 'main',
      model: 'modelo-teste',
      mode,
    });
    await waitForReview(service, projectId);
    return {
      receivedPrompt: receivedPrompts[0] ?? '',
      receivedPrompts,
      execution: service.latest(projectId),
    };
  }

  const fast = await reviewWithMode('fast', 'fast-project');
  const complete = await reviewWithMode('complete', 'complete-project');

  assert.equal(fast.receivedPrompts.length, 1);
  assert.equal(fast.receivedPrompt.includes(diff), false);
  assert.ok(
    fast.receivedPrompt.endsWith(
      diff.slice(0, AI_EXECUTION_POLICIES.fast.maxDiffChars),
    ),
  );
  assert.equal(fast.execution?.review?.diffTruncated, true);

  assert.equal(complete.receivedPrompts.length, 2);
  assert.ok(complete.receivedPrompt.endsWith(diff));
  assert.equal(complete.execution?.review?.diffTruncated, false);
});
