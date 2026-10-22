import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

import {
  fetchAgentUsage,
  type AgentUsageOverview,
} from '../src/api/agent-runtime';
import { useAgentTaskUsage } from '../src/composables/useAgentTaskUsage';

interface PendingUsage {
  projectId: string;
  taskId?: string;
  period: { observedFrom?: string; observedTo?: string };
  resolve: (value: AgentUsageOverview) => void;
  reject: (reason: Error) => void;
}

function usage(totalTokens?: number): AgentUsageOverview {
  return {
    total: {
      executionCount: 1,
      ...(totalTokens === undefined ? {} : { totalTokens }),
    },
    byProvider: {},
  };
}

function currentTokens(
  state: ReturnType<typeof useAgentTaskUsage>,
): number | undefined {
  return state.usage.value?.total.totalTokens;
}

function controlledLoader() {
  const requests: PendingUsage[] = [];
  const loader: typeof fetchAgentUsage = (projectId, taskId, period) =>
    new Promise((resolve, reject) => {
      requests.push({
        projectId,
        ...(taskId ? { taskId } : {}),
        period: period ?? {},
        resolve,
        reject,
      });
    });
  return { loader, requests };
}

test('troca A → B → A não reutiliza response antigo nem métricas', async () => {
  const selected = { projectId: 'project-1', taskId: 'a' };
  const { loader, requests } = controlledLoader();
  const state = useAgentTaskUsage(() => selected, loader);

  const initial = state.reloadUsage();
  selected.taskId = 'b';
  state.clearUsage();
  const second = state.reloadUsage();
  selected.taskId = 'a';
  state.clearUsage();
  const latest = state.reloadUsage();

  requests[0]!.resolve(usage(10));
  requests[1]!.resolve(usage(20));
  await Promise.all([initial, second]);
  assert.equal(state.usage.value, null);

  requests[2]!.resolve(usage(30));
  await latest;
  assert.equal(currentTokens(state), 30);
  assert.equal(state.usageHasMetrics.value, true);
});

test('respostas fora de ordem respeitam o período mais recente', async () => {
  const { loader, requests } = controlledLoader();
  const state = useAgentTaskUsage(
    () => ({ projectId: 'project-1', taskId: 'a' }),
    loader,
  );

  state.usagePeriod.value = '24h';
  const first = state.reloadUsage();
  state.usagePeriod.value = '7d';
  const next = state.reloadUsage();

  assert.match(requests[0]!.period.observedFrom ?? '', /T/);
  assert.match(requests[1]!.period.observedFrom ?? '', /T/);
  assert.equal(requests[0]!.taskId, 'a');

  requests[1]!.resolve(usage(42));
  await next;
  requests[0]!.resolve(usage(5));
  await first;
  assert.equal(currentTokens(state), 42);
});

test('erro de request stale é ignorado; erro atual continua observável', async () => {
  const selected = { projectId: 'project-1', taskId: 'a' };
  const { loader, requests } = controlledLoader();
  const state = useAgentTaskUsage(() => selected, loader);
  const older = state.reloadUsage();

  selected.taskId = 'b';
  state.clearUsage();
  requests[0]!.reject(new Error('falha antiga'));
  await assert.doesNotReject(older);

  const current = state.reloadUsage();
  requests[1]!.reject(new Error('falha atual'));
  await assert.rejects(current, /falha atual/);
  assert.equal(state.usage.value, null);
});

test('limpeza descarta métricas antigas e preserva indisponível como sem métrica', async () => {
  const { loader, requests } = controlledLoader();
  const state = useAgentTaskUsage(
    () => ({ projectId: 'project-1', taskId: 'a' }),
    loader,
  );
  assert.equal(state.usageHasMetrics.value, false);

  const pending = state.reloadUsage();
  requests[0]!.resolve(usage());
  await pending;
  assert.equal(state.usageHasMetrics.value, false);

  state.clearUsage();
  assert.equal(state.usage.value, null);
});

test('cockpit usa um owner de usage e limpa ao trocar task/projeto', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskUsage/);
  assert.match(panel, /await reloadUsage\(\)/);
  assert.match(
    panel,
    /reloadBudget\(\),\s*reloadUsage\(\)/,
  );
  assert.doesNotMatch(panel, /usage\.value\s*=/);
});
