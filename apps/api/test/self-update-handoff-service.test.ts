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

function ping() {
  return JSON.stringify({
    status: 'ready',
    pid: 1234,
    instanceId: '22222222-2222-4222-8222-222222222222',
    release: 'test-release',
    actions: ['ping', 'inspect', 'claim', 'recover'],
  });
}

test('persiste handoff antes de transferir ownership para o agent', async () => {
  const calls: Array<{ scriptPath: string; args: string[] }> = [];
  const runner: SelfUpdateToolRunner = async (scriptPath, args) => {
    calls.push({ scriptPath, args });
    if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
    if (args[0] === 'prepare') {
      return { code: 0, stdout: handoff('prepared'), stderr: '' };
    }
    return { code: 0, stdout: handoff('accepted'), stderr: '' };
  };
  const service = new SelfUpdateHandoffService(runner, '/repo');

  const result = await service.prepareAndClaim(INPUT);

  assert.equal(result.status, 'accepted');
  assert.equal(result.id, HANDOFF_ID);
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
  ]);
});

test('recusa contexto inválido antes de executar tooling local', async () => {
  let calls = 0;
  const service = new SelfUpdateHandoffService(async () => {
    calls += 1;
    return { code: 0, stdout: '', stderr: '' };
  }, '/repo');

  await assert.rejects(
    () =>
      service.prepareAndClaim({
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
  const service = new SelfUpdateHandoffService(async () => ({
    code: 1,
    stdout: '',
    stderr: 'Self-update agent: indisponível\n',
  }), '/repo');

  await assert.rejects(
    () => service.prepareAndClaim(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_AGENT_UNAVAILABLE',
  );
});

test('não cria handoff se ping não provar suporte a claim', async () => {
  let calls = 0;
  const service = new SelfUpdateHandoffService(async () => {
    calls += 1;
    return {
      code: 0,
      stdout: JSON.stringify({
        status: 'ready',
        instanceId: '22222222-2222-4222-8222-222222222222',
        actions: ['ping', 'inspect'],
      }),
      stderr: '',
    };
  }, '/repo');

  await assert.rejects(
    () => service.prepareAndClaim(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_AGENT_UNAVAILABLE',
  );
  assert.equal(calls, 1);
});

test('distingue falha ao persistir handoff de falha ao transferir ownership', async () => {
  const prepareFailure = new SelfUpdateHandoffService(async (_script, args) => {
    if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
    return { code: 1, stdout: '', stderr: 'persistência recusada' };
  }, '/repo');

  await assert.rejects(
    () => prepareFailure.prepareAndClaim(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_PREPARE_FAILED',
  );

  const claimFailure = new SelfUpdateHandoffService(async (_script, args) => {
    if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
    if (args[0] === 'prepare') {
      return { code: 0, stdout: handoff('prepared'), stderr: '' };
    }
    return { code: 1, stdout: '', stderr: 'claim recusado' };
  }, '/repo');

  await assert.rejects(
    () => claimFailure.prepareAndClaim(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_CLAIM_FAILED',
  );
});

test('recusa resposta adulterada do helper ou troca de handoff pelo agent', async () => {
  const wrongRevision = new SelfUpdateHandoffService(async (_script, args) => {
    if (args[0] === 'ping') return { code: 0, stdout: ping(), stderr: '' };
    return {
      code: 0,
      stdout: handoff('prepared', { targetRevision: 'c'.repeat(40) }),
      stderr: '',
    };
  }, '/repo');

  await assert.rejects(
    () => wrongRevision.prepareAndClaim(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_INVALID',
  );

  const swappedHandoff = new SelfUpdateHandoffService(async (_script, args) => {
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
  }, '/repo');

  await assert.rejects(
    () => swappedHandoff.prepareAndClaim(INPUT),
    (error) =>
      error instanceof SelfUpdateHandoffError &&
      error.code === 'SELF_UPDATE_HANDOFF_INVALID',
  );
});
