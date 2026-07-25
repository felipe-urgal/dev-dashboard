import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertBuildHasNoCredentials, orchestrate } from './dev-web.mjs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('orquestrador aborta antes do build quando o diagnóstico falha', async () => {
  let executions = 0;
  await assert.rejects(orchestrate({
    diagnoseEnvironment: async () => [{ status: 'error' }],
    runner: async () => { executions += 1; return { code: 0 }; },
  }), /Diagnóstico/);
  assert.equal(executions, 0);
});

test('orquestrador constrói e inicia somente a API distribuída', async () => {
  const calls = [];
  const code = await orchestrate({ rootDirectory: '/repo', diagnoseEnvironment: async () => [],
    fileChecker: async () => undefined,
    buildScanner: async () => undefined,
    runner: async (command, args, options) => { calls.push({ command, args, options }); return { code: calls.length === 2 ? 7 : 0 }; },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ['run', 'build']);
  assert.match(calls[1].args[0], /apps\/api\/dist\/server\.js$/);
  assert.equal(calls[1].options.env.DEV_DASHBOARD_LOCAL_DISTRIBUTION, '1');
  assert.equal(code, 7);
});

test('verificação do bundle detecta o valor real sem confundir apenas o nome do header', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bundle-check-')); await mkdir(path.join(root, 'assets'));
  const token = 'c'.repeat(64);
  await writeFile(path.join(root, 'assets/app.js'), 'const header = "X-Dev-Dashboard-Token";');
  await assertBuildHasNoCredentials(root, { forbiddenValues: [token] });
  await writeFile(path.join(root, 'assets/app.js'), `const segredo = "${token}";`);
  await assert.rejects(assertBuildHasNoCredentials(root, { forbiddenValues: [token] }), /Credencial/);
  await rm(root, { recursive: true });
});
