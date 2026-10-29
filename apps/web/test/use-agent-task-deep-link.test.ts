import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { test } from 'vitest';

import { useAgentTaskDeepLink } from '../src/composables/useAgentTaskDeepLink';

test('mudança de taskId no mesmo projeto seleciona task sem remount', async () => {
  const route = ref<string | undefined>('task-a');
  const selected = ref('');
  const calls: string[] = [];
  const scope = effectScope();

  scope.run(() => {
    useAgentTaskDeepLink(
      () => route.value,
      () => selected.value,
      async (taskId) => {
        selected.value = taskId;
        calls.push(taskId);
      },
    );
  });

  await nextTick();
  assert.deepEqual(calls, [], 'a carga inicial é responsabilidade do cockpit');

  selected.value = 'task-a';
  route.value = 'task-b';
  await nextTick();
  assert.deepEqual(calls, ['task-b']);
  assert.equal(selected.value, 'task-b');

  route.value = 'task-b';
  await nextTick();
  assert.deepEqual(calls, ['task-b'], 'mesma task não dispara novo GET');
  scope.stop();
});

test('A → B → A durante leitura pendente delega seleção mais recente', async () => {
  const route = ref<string | undefined>('task-a');
  const selected = ref('task-a');
  const calls: string[] = [];
  const scope = effectScope();
  const pending: Array<() => void> = [];

  scope.run(() => {
    useAgentTaskDeepLink(
      () => route.value,
      () => selected.value,
      (taskId) => {
        selected.value = taskId;
        calls.push(taskId);
        return new Promise<void>((resolve) => pending.push(resolve));
      },
    );
  });

  route.value = 'task-b';
  await nextTick();
  route.value = 'task-a';
  await nextTick();
  assert.deepEqual(calls, ['task-b', 'task-a']);

  pending[0]!();
  pending[1]!();
  await nextTick();
  assert.equal(selected.value, 'task-a');
  scope.stop();
});

test('limpar query preserva seleção manual e unmount encerra observer', async () => {
  const route = ref<string | undefined>('task-a');
  const selected = ref('task-a');
  const calls: string[] = [];
  const scope = effectScope();
  scope.run(() => {
    useAgentTaskDeepLink(
      () => route.value,
      () => selected.value,
      async (id) => {
        calls.push(id);
      },
    );
  });

  selected.value = 'manual';
  route.value = undefined;
  await nextTick();
  assert.deepEqual(calls, []);
  assert.equal(selected.value, 'manual');

  scope.stop();
  route.value = 'task-outro';
  await nextTick();
  assert.deepEqual(calls, []);
});
