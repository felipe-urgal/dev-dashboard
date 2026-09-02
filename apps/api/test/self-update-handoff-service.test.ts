import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import {
  SelfUpdateHandoffError,
  SelfUpdateHandoffService,
  type SelfUpdateToolRunner,
} from '../src/services/self-update-handoff-service.js';

const REVISION = 'a'.repeat(40);
const PLAN_HASH = 'b'.repeat(64);
const HANDOFF_ID = 'self-update-11111111-1111-4111-8111-111111111111';
const CREATED_AT = '2026-09-02T12:00:00.000Z';
const UPDATED_AT = '2026-09-02T12:00:01.000Z';
const INPUT = {
  projectId: 'dev-dashboard',
  targetRevision: REVISION,
  planHash: PLAN_HASH,
};

function handoff(status: 'prepared' | 'accepted', overrides = {}) {
  return JSON.stringify({
    version: 1,
    id: HANDOFF_ID,
    action: 'self-update',
    projectId: INPUT.projectId,
    targetRevision: INPUT.targetRevision,
    planHash: INPUT.planHash,
    status,
    createdAt: CREATED_AT,
    updatedAt: status === 'prepared' ? CREATED_AT : UPDATED_AT,
    ...overrides,
  });
}

function terminalHandoff() {
  return JSON.stringify({
    version: 1,
    id: HANDOFF_ID,
    action: 'self-update',
    projectId: INPUT.projectId,
    targetRevision: INPUT.targetRevision,
    planHash: INPUT.planHash,
    status: 'succeeded',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    result: {
      code: 'SELF_UPDATE_SUCCEEDED',
      message: 'ok',
      finishedAt: UPDATED_AT,
      appliedRevision: REVISION,
    },
  });
}

function ping() {
  return JSON.stringify({
    status: 'ready',
    pid: 1234,
    instanceId: '22222222-2222-4222-8222-222222222222',
    release: 'test-release',
    actions: ['ping', 'inspect', 'claim', 'recover'],
  });
}

function workerStarted(overrides = {}) {
  return JSON.stringify({
    status: 'worker-started',
    handoffId: HANDOFF_ID,
    pid: 4321,
    ...overrides,
  });
}

function successfulRunner(
  calls: Array<{ scriptPath: string; args: string[] }>,
) {
  const runner: SelfUpdateToolRunner = async (scriptPath, args) => {
    calls.push({ scriptPath, args });
    if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
    if (args[0] === 'prepare') {
      return { code: 0, stdout: handoff('prepared'), stderr: '' };
    }
    if (args[0] === 'claim') {
      return { code: 0, stdout: handoff('accepted'), stderr: '' };
    }
    if (args[0] === 'inspect') {
      return { code: 0, stdout: terminalHandoff(), stderr: '' };
    }
    return { code: 0, stdout: workerStarted(), stderr: '' };
  };
  return runner;
}

test('persiste, transfere ownership e só solicita shutdown após o worker provar exclusividade', async () => {
  const calls: Array<{ scriptPath: string; args: string[] }> = [];
  const probeCalls: Array<{ handoffId: string; workerPid: number }> = [];
  let shutdownCalls = 0;
  const service = new SelfUpdateHandoffService({
    runner: successfulRunner(calls),
    repositoryRoot: '/repo',
    executionProbe: async (handoffId, workerPid) => {
      probeCalls.push({ handoffId, workerPid });
    },
    requestShutdown: () => {
      shutdownCalls += 1;
    },
  });

  const result = await service.prepareAndExecute(INPUT);

  assert.equal(result.status, 'accepted');
  assert.equal(result.id, HANDOFF_ID);
  assert.deepEqual(probeCalls, [{ handoffId: HANDOFF_ID, workerPid: 4321 }]);
  assert.equal(shutdownCalls, 1);
  assert.deepEqual(calls, [
    {
      scriptPath: path.join('/repo', 'scripts/self-update-agent.mjs'),
      args: ['ping'],
    },
    {
      scriptPath: path.join('/repo', 'scripts/self-update-helper.mjs'),
      args: [
        'prepare',
        '--project-id',
        INPUT.projectId,
        '--revision',
        INPUT.targetRevision,
        '--plan-hash',
        INPUT.planHash,
      ],
    },
    {
      scriptPath: path.join('/repo', 'scripts/self-update-agent.mjs'),
      args: ['claim', HANDOFF_ID],
    },
    {
      scriptPath: path.join('/repo', 'scripts/self-update-agent.mjs'),
      args: ['execute', HANDOFF_ID],
    },
  ]);
});

test('usa handoff-id determinístico quando o domínio fornece correlação', async () => {
  const calls: Array<{ scriptPath: string; args: string[] }> = [];
  const service = new SelfUpdateHandoffService({
    runner: successfulRunner(calls),
    repositoryRoot: '/repo',
    executionProbe: async () => undefined,
    requestShutdown: () => undefined,
  });

  await service.prepareAndExecute({ ...INPUT, handoffId: HANDOFF_ID });
  assert.deepEqual(calls[1]?.args, [
    'prepare',
    '--project-id',
    INPUT.projectId,
    '--revision',
    INPUT.targetRevision,
    '--plan-hash',
    INPUT.planHash,
    '--handoff-id',
    HANDOFF_ID,
  ]);
});

test('inspect valida o resultado terminal contra o contexto confirmado', async () => {
  const service = new SelfUpdateHandoffService({
    runner: successfulRunner([]),
    repositoryRoot: '/repo',
  });

  const result = await service.inspect({ ...INPUT, handoffId: HANDOFF_ID });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result?.appliedRevision, REVISION);
});

test('não solicita shutdown quando o worker não comprova ownership', async () => {
  let shutdownCalls = 0;
  const service = new SelfUpdateHandoffService({
    runner: successfulRunner([]),
    repositoryRoot: '/repo',
    executionProbe: async () => {
      throw new Error('lock ausente');
    },
    requestShutdown: () => {
      shutdownCalls += 1;
    },
  });

  await assert.rejects(
    () => service.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_EXECUTION_START_FAILED',
  );
  assert.equal(shutdownCalls, 0);
});

test('distingue falha ao solicitar a parada depois do ownership comprovado', async () => {
  const service = new SelfUpdateHandoffService({
    runner: successfulRunner([]),
    repositoryRoot: '/repo',
    executionProbe: async () => undefined,
    requestShutdown: () => {
      throw new Error('shutdown indisponível');
    },
  });

  await assert.rejects(
    () => service.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_SHUTDOWN_REQUEST_FAILED',
  );
});

test('recusa contexto inválido antes de executar tooling local', async () => {
  let calls = 0;
  const service = new SelfUpdateHandoffService({
    runner: async () => {
      calls += 1;
      return { code: 0, stdout: '', stderr: '' };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () =>
      service.prepareAndExecute({
        ...INPUT,
        projectId: '../outro-projeto',
      }),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_INPUT_INVALID',
  );
  assert.equal(calls, 0);
});

test('falha fechado quando o agent não está disponível', async () => {
  const service = new SelfUpdateHandoffService({
    runner: async () => ({
      code: 1,
      stdout: '',
      stderr: 'Self-update agent: indisponível\n',
    }),
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => service.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_AGENT_UNAVAILABLE',
  );
});

test('não cria handoff se ping não provar suporte a claim e inspect', async () => {
  let calls = 0;
  const service = new SelfUpdateHandoffService({
    runner: async () => {
      calls += 1;
      return {
        code: 0,
        stdout: JSON.stringify({
          status: 'ready',
          instanceId: '22222222-2222-4222-8222-222222222222',
          actions: ['ping', 'claim'],
        }),
        stderr: '',
      };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => service.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_AGENT_UNAVAILABLE',
  );
  assert.equal(calls, 1);
});

test('distingue falhas de persistência, ownership e início do worker', async () => {
  const prepareFailure = new SelfUpdateHandoffService({
    runner: async (_script, args) => {
      if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
      return { code: 1, stdout: '', stderr: 'persistência recusada' };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => prepareFailure.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_PREPARE_FAILED',
  );

  const claimFailure = new SelfUpdateHandoffService({
    runner: async (_script, args) => {
      if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
      if (args[0] === 'prepare') {
        return { code: 0, stdout: handoff('prepared'), stderr: '' };
      }
      return { code: 1, stdout: '', stderr: 'claim recusado' };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => claimFailure.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_CLAIM_FAILED',
  );

  const workerFailure = new SelfUpdateHandoffService({
    runner: async (_script, args) => {
      if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
      if (args[0] === 'prepare') {
        return { code: 0, stdout: handoff('prepared'), stderr: '' };
      }
      if (args[0] === 'claim') {
        return { code: 0, stdout: handoff('accepted'), stderr: '' };
      }
      return { code: 1, stdout: '', stderr: 'preflight recusado' };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => workerFailure.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_EXECUTION_START_FAILED',
  );
});

test('recusa resposta adulterada do helper, agent ou worker', async () => {
  const wrongRevision = new SelfUpdateHandoffService({
    runner: async (_script, args) => {
      if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
      return {
        code: 0,
        stdout: handoff('prepared', { targetRevision: 'c'.repeat(40) }),
        stderr: '',
      };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => wrongRevision.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_INVALID',
  );

  const swappedHandoff = new SelfUpdateHandoffService({
    runner: async (_script, args) => {
      if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
      if (args[0] === 'prepare') {
        return { code: 0, stdout: handoff('prepared'), stderr: '' };
      }
      return {
        code: 0,
        stdout: handoff('accepted', {
          id: 'self-update-33333333-3333-4333-8333-333333333333',
        }),
        stderr: '',
      };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => swappedHandoff.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_INVALID',
  );

  const wrongWorker = new SelfUpdateHandoffService({
    runner: async (_script, args) => {
      if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
      if (args[0] === 'prepare') {
        return { code: 0, stdout: handoff('prepared'), stderr: '' };
      }
      if (args[0] === 'claim') {
        return { code: 0, stdout: handoff('accepted'), stderr: '' };
      }
      return {
        code: 0,
        stdout: workerStarted({ handoffId: 'outro-handoff' }),
        stderr: '',
      };
    },
    repositoryRoot: '/repo',
  });

  await assert.rejects(
    () => wrongWorker.prepareAndExecute(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_EXECUTION_START_FAILED',
  );
});
