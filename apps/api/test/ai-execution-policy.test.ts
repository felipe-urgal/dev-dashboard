import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiExecutionMode, Project } from '@dev-dashboard/contracts';

import type { AiAssistantService } from '../src/services/ai-assistant-service.js';
import {
  AI_EXECUTION_POLICIES,
  DEFAULT_AI_EXECUTION_MODE,
} from '../src/services/ai-execution-policy.js';
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
