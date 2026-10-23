import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { test } from 'vitest';

import { useAgentTaskSupplementalData } from '../src/composables/useAgentTaskSupplementalData';

type Pending = { resolve: () => void; reject: (error: Error) => void };

function harness() {
  const target = { projectId: 'project-a', taskId: 'task-a' };
  const budgets: Pending[] = [];
  const usages: Pending[] = [];
  const load = (pending: Pending[]) =>
    new Promise<void>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  const state = useAgentTaskSupplementalData(
    () => target,
    () => load(budgets),
    () => load(usages),
  );
  return { target, budgets, usages, state };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

test('observações auxiliares são iniciadas sem bloquear e falhas são explícitas', async () => {
  const h = harness();
  h.state.loadSupplementalData();
  assert.equal(h.budgets.length, 0, 'consultas são despachadas no microtask');
  await flush();
  assert.equal(h.budgets.length, 1);
  assert.equal(h.usages.length, 1);

  h.budgets[0]!.reject(new Error('token sensível do provider'));
  await flush();
  assert.deepEqual(h.state.failedSources.value, ['budget']);
  assert.match(h.state.supplementalWarning.value, /Não foi possível consultar o budget/);
  assert.doesNotMatch(h.state.supplementalWarning.value, /token sensível/);
  // A requisição de usage continua pendente sem bloquear o diagnóstico.
  h.usages[0]!.reject(new Error('falha de usage'));
  await flush();
  assert.deepEqual(h.state.failedSources.value, ['budget', 'usage']);
  assert.match(h.state.supplementalWarning.value, /Budget e usage indisponíveis/);
});

test('falha apenas de usage não transforma dados ausentes em telemetria observada', async () => {
  const h = harness();
  h.state.loadSupplementalData();
  await flush();
  h.budgets[0]!.resolve();
  h.usages[0]!.reject(new Error('métrica indisponível'));
  await flush();
  assert.deepEqual(h.state.failedSources.value, ['usage']);
  assert.match(h.state.supplementalWarning.value, /Métricas da task indisponíveis/);
});

test('sucesso de ambos mantém o aviso vazio', async () => {
  const h = harness();
  h.state.loadSupplementalData();
  await flush();
  h.budgets[0]!.resolve();
  h.usages[0]!.resolve();
  await flush();
  assert.deepEqual(h.state.failedSources.value, []);
  assert.equal(h.state.supplementalWarning.value, '');
});

test('troca A → B → A invalida respostas e erros das consultas antigas', async () => {
  const h = harness();
  h.state.loadSupplementalData();
  await flush();

  h.target.taskId = 'task-b';
  h.state.resetSupplementalData();
  h.state.loadSupplementalData();
  await flush();

  h.target.taskId = 'task-a';
  h.state.resetSupplementalData();
  h.state.loadSupplementalData();
  await flush();

  h.budgets[2]!.resolve();
  h.usages[2]!.resolve();
  await flush();
  h.budgets[0]!.reject(new Error('budget A antigo'));
  h.usages[1]!.reject(new Error('usage B antigo'));
  h.budgets[1]!.reject(new Error('budget B antigo'));
  h.usages[0]!.reject(new Error('usage A antigo'));
  await flush();

  assert.deepEqual(h.state.failedSources.value, []);
  assert.equal(h.state.supplementalWarning.value, '');
});

test('reset no unmount descarta erro tardio e nova consulta limpa aviso anterior', async () => {
  const h = harness();
  h.state.loadSupplementalData();
  await flush();
  h.budgets[0]!.reject(new Error('budget indisponível'));
  await flush();
  assert.deepEqual(h.state.failedSources.value, ['budget']);
  h.state.resetSupplementalData();
  assert.equal(h.state.supplementalWarning.value, '');

  h.usages[0]!.reject(new Error('erro posterior ao unmount'));
  await flush();
  assert.deepEqual(h.state.failedSources.value, []);

  h.state.loadSupplementalData();
  await flush();
  h.usages[1]!.resolve();
  h.budgets[1]!.resolve();
  await flush();
  assert.equal(h.state.supplementalWarning.value, '');
});

test('cockpit não aguarda budget e usage antes de mostrar task e conectar socket', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  const loader = panel.slice(
    panel.indexOf('async function loadTask('),
    panel.indexOf('async function load():'),
  );

  assert.match(loader, /loadSupplementalData\(\)/);
  assert.match(loader, /await Promise\.all\(\[/);
  assert.match(loader, /fetchAgentTaskStatus\(/);
  assert.match(loader, /fetchAgentActivity\(/);
  assert.match(loader, /fetchAgentConversation\(/);
  assert.match(loader, /fetchAgentAttachments\(/);
  assert.match(loader, /connectTaskSocket\(/);
  assert.doesNotMatch(loader, /reloadBudget\(\)/);
  assert.doesNotMatch(loader, /reloadUsage\(\)/);
  assert.match(panel, /resetSupplementalData\(\)/);
  assert.match(panel, /v-if="supplementalWarning"/);
  assert.match(panel, /mutating \|\| failedSources\.includes\('budget'\)/);
});
