import assert from 'node:assert/strict';
import test from 'node:test';

import { DeploymentError } from '../src/deployment/errors.js';
import {
  SudoSessionService,
  type SudoCommandRunner,
  type SudoDelegatedCommandRunner,
} from '../src/deployment/sudo-session.js';

test('status valida o ticket a partir de outro processo pai', async () => {
  let directCalls = 0;
  let delegatedCalls = 0;
  const service = new SudoSessionService({
    runSudo: async () => {
      directCalls += 1;
      return { exitCode: 0, unavailable: false };
    },
    runDelegatedSudo: async () => {
      delegatedCalls += 1;
      return { exitCode: 0, unavailable: false };
    },
  });

  assert.deepEqual(await service.status(), {
    available: true,
    authorized: true,
  });
  assert.equal(directCalls, 0);
  assert.equal(delegatedCalls, 1);
});

test('authorize envia a senha somente para sudo -S -v e confirma reutilização descendente', async () => {
  const calls: Array<{ args: readonly string[]; input?: string }> = [];
  let delegatedCalls = 0;
  const runSudo: SudoCommandRunner = async (args, input) => {
    calls.push({ args, ...(input === undefined ? {} : { input }) });
    return { exitCode: 0, unavailable: false };
  };
  const runDelegatedSudo: SudoDelegatedCommandRunner = async () => {
    delegatedCalls += 1;
    return { exitCode: 0, unavailable: false };
  };
  const service = new SudoSessionService({ runSudo, runDelegatedSudo });

  const status = await service.authorize('senha-local');

  assert.deepEqual(status, { available: true, authorized: true });
  assert.deepEqual(calls, [
    { args: ['-S', '-v', '-p', ''], input: 'senha-local' },
  ]);
  assert.equal(delegatedCalls, 1);
});

test('authorize tipa ticket aceito que não pode ser reutilizado por um descendente', async () => {
  const service = new SudoSessionService({
    runSudo: async () => ({ exitCode: 0, unavailable: false }),
    runDelegatedSudo: async () => ({ exitCode: 1, unavailable: false }),
  });

  await assert.rejects(service.authorize('senha-local'), (error: unknown) => {
    assert.ok(error instanceof DeploymentError);
    assert.equal(error.code, 'DEPLOYMENT_SUDO_TICKET_NOT_DELEGATED');
    assert.match(error.message, /NOPASSWD/);
    assert.match(error.message, /novo plano/);
    return true;
  });
});

test('authorize falha quando a validação descendente fica indisponível', async () => {
  const service = new SudoSessionService({
    runSudo: async () => ({ exitCode: 0, unavailable: false }),
    runDelegatedSudo: async () => ({ exitCode: 127, unavailable: true }),
  });

  await assert.rejects(service.authorize('senha-local'), (error: unknown) => {
    assert.ok(error instanceof DeploymentError);
    assert.equal(error.code, 'DEPLOYMENT_PRIVILEGE_REQUIRED');
    assert.match(error.message, /árvore de processos/);
    return true;
  });
});

test('authorize não finge suporte quando sudo não existe no host', async () => {
  let delegatedCalls = 0;
  const service = new SudoSessionService({
    runSudo: async () => ({ exitCode: 127, unavailable: true }),
    runDelegatedSudo: async () => {
      delegatedCalls += 1;
      return { exitCode: 127, unavailable: true };
    },
  });

  await assert.rejects(service.authorize('senha-local'), (error: unknown) => {
    assert.ok(error instanceof DeploymentError);
    assert.equal(error.code, 'DEPLOYMENT_PRIVILEGE_REQUIRED');
    assert.match(error.message, /não está disponível/i);
    return true;
  });
  assert.equal(delegatedCalls, 0);
});
