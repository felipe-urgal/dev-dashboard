import assert from 'node:assert/strict';
import test from 'node:test';

import { DeploymentError } from '../src/deployment/errors.js';
import {
  SudoSessionService,
  type SudoCommandRunner,
} from '../src/deployment/sudo-session.js';

test('status usa validação não interativa do ticket sudo', async () => {
  const calls: Array<{ args: readonly string[]; input?: string }> = [];
  const runSudo: SudoCommandRunner = async (args, input) => {
    calls.push({ args, ...(input === undefined ? {} : { input }) });
    return { exitCode: 0, unavailable: false };
  };
  const service = new SudoSessionService({ runSudo });

  assert.deepEqual(await service.status(), {
    available: true,
    authorized: true,
  });
  assert.deepEqual(calls, [{ args: ['-n', '-v'] }]);
});

test('authorize envia a senha somente para sudo -S -v e confirma reutilização', async () => {
  const calls: Array<{ args: readonly string[]; input?: string }> = [];
  const runSudo: SudoCommandRunner = async (args, input) => {
    calls.push({ args, ...(input === undefined ? {} : { input }) });
    return { exitCode: 0, unavailable: false };
  };
  const service = new SudoSessionService({ runSudo });

  const status = await service.authorize('senha-local');

  assert.deepEqual(status, { available: true, authorized: true });
  assert.deepEqual(calls, [
    { args: ['-S', '-v', '-p', ''], input: 'senha-local' },
    { args: ['-n', '-v'] },
  ]);
});

test('authorize falha quando a política não permite reutilizar o ticket sem TTY', async () => {
  let call = 0;
  const service = new SudoSessionService({
    runSudo: async () => {
      call += 1;
      return {
        exitCode: call === 1 ? 0 : 1,
        unavailable: false,
      };
    },
  });

  await assert.rejects(service.authorize('senha-local'), (error: unknown) => {
    assert.ok(error instanceof DeploymentError);
    assert.equal(error.code, 'DEPLOYMENT_PRIVILEGE_REQUIRED');
    assert.match(error.message, /NOPASSWD/);
    return true;
  });
});

test('authorize não finge suporte quando sudo não existe no host', async () => {
  const service = new SudoSessionService({
    runSudo: async () => ({ exitCode: 127, unavailable: true }),
  });

  await assert.rejects(service.authorize('senha-local'), (error: unknown) => {
    assert.ok(error instanceof DeploymentError);
    assert.equal(error.code, 'DEPLOYMENT_PRIVILEGE_REQUIRED');
    assert.match(error.message, /não está disponível/i);
    return true;
  });
});
