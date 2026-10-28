import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { ref } from 'vue';

import type {
  MachineDatabaseQueryResult,
  MachineDatabaseService,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import { useDatabaseQueryExecution } from '../src/composables/useDatabaseQueryExecution';
import { useMachineDatabaseServices } from '../src/composables/useMachineDatabaseServices';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const postgresqlService: MachineDatabaseService = {
  id: 'postgresql',
  driver: 'postgresql',
  label: 'PostgreSQL',
  unit: 'postgresql.service',
  installed: true,
  active: false,
};

describe('useMachineDatabaseServices', () => {
  test('confirma mutação sensível e atualiza o estado após sucesso', async () => {
    const confirmations: string[] = [];
    const actions: string[] = [];

    const state = useMachineDatabaseServices({
      dependencies: {
        confirmMutation: async (input) => {
          confirmations.push(
            typeof input === 'string' ? input : (input.title ?? ''),
          );
          return true;
        },
        runAction: async (serviceId, action) => {
          actions.push(`${serviceId}:${action}`);
        },
        fetchServices: async () => [{ ...postgresqlService, active: true }],
      },
    });

    await state.runAction(postgresqlService, 'restart');

    assert.deepEqual(confirmations, ['Reiniciar PostgreSQL?']);
    assert.deepEqual(actions, ['postgresql:restart']);
    assert.equal(state.pending.value, null);
    assert.equal(state.services.value[0]?.active, true);
    assert.equal(
      state.successMessage.value,
      'PostgreSQL reiniciado com sucesso.',
    );
  });
});

function createQueryExecutionHarness(
  dependencies: Parameters<typeof useDatabaseQueryExecution>[0]['dependencies'],
) {
  const sessionId = ref<string | null>('session-1');
  const database = ref('');
  const table = ref('');
  const tables = ref<MachineDatabaseTable[]>([]);
  const query = ref('SELECT * FROM users');
  const loading = ref(false);
  const error = ref('');
  const result = ref<MachineDatabaseQueryResult | null>(null);
  const duration = ref<number | null>(null);
  let remembered = 0;

  const execution = useDatabaseQueryExecution({
    sessionId,
    database,
    table,
    tables,
    query,
    loading,
    error,
    resetTableList: () => undefined,
    resetQuery: () => {
      query.value = 'SELECT * FROM ';
    },
    setResult: (value) => {
      result.value = value;
    },
    setDuration: (value) => {
      duration.value = value;
    },
    resetResultPresentation: () => {
      result.value = null;
      duration.value = null;
    },
    clearCopiedMessage: () => undefined,
    rememberQuery: () => {
      remembered += 1;
    },
    handleSessionError: () => false,
    ...(dependencies ? { dependencies } : {}),
  });

  return {
    execution,
    sessionId,
    database,
    table,
    tables,
    query,
    loading,
    error,
    result,
    duration,
    remembered: () => remembered,
  };
}

describe('useDatabaseQueryExecution', () => {
  test('não publica resultado nem histórico quando a sessão troca durante a query', async () => {
    const pending = deferred<MachineDatabaseQueryResult>();
    const harness = createQueryExecutionHarness({
      runQuery: async () => await pending.promise,
    });

    const execution = harness.execution.runQuery();
    harness.sessionId.value = 'session-2';
    pending.resolve({
      columns: ['id'],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
    });
    await execution;

    assert.equal(harness.result.value, null);
    assert.equal(harness.remembered(), 0);
  });
});
