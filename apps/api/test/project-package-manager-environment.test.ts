import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseShellEnvironmentOutput,
  referencedPackageManagerEnvironmentVariables,
  resolvePackageManagerEnvironment,
} from '../src/security/project-package-manager-environment.js';

test('detecta nomes de variáveis interpoladas sem ler seus valores', () => {
  assert.deepEqual(
    referencedPackageManagerEnvironmentVariables(
      [
        '//npm.fontawesome.com/:_authToken=${FONTAWESOME_TOKEN}',
        'cache=${HOME}/.cache/npm',
        'again=${FONTAWESOME_TOKEN}',
      ].join('\n'),
    ),
    ['FONTAWESOME_TOKEN', 'HOME'],
  );
});

test('parser ignora ruído do shell fora dos marcadores', () => {
  const output = Buffer.from(
    [
      'startup noise',
      '\0__DEV_DASHBOARD_SHELL_ENV_START__\0',
      'FOO=bar\0TOKEN=value=with=equals\0',
      '\0__DEV_DASHBOARD_SHELL_ENV_END__\0',
      'shutdown noise',
    ].join(''),
    'utf8',
  );

  assert.deepEqual(parseShellEnvironmentOutput(output), {
    FOO: 'bar',
    TOKEN: 'value=with=equals',
  });
});

test('resolve somente variáveis referenciadas e busca ausentes no shell', async (context) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-package-manager-env-'),
  );
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeFile(
    path.join(projectPath, '.npmrc'),
    [
      '//npm.fontawesome.com/:_authToken=${FONTAWESOME_TOKEN}',
      'cache=${HOME}/.cache/npm',
      '',
    ].join('\n'),
  );

  let shellCalls = 0;
  const environment = await resolvePackageManagerEnvironment(projectPath, {
    processEnvironment: {
      HOME: '/home/test',
    },
    resolveShellEnvironment: async (cwd) => {
      shellCalls += 1;
      assert.equal(cwd, projectPath);
      return {
        FONTAWESOME_TOKEN: 'token-from-shell',
        UNRELATED_SECRET: 'do-not-forward',
      };
    },
  });

  assert.deepEqual(environment, {
    FONTAWESOME_TOKEN: 'token-from-shell',
    HOME: '/home/test',
  });
  assert.equal(shellCalls, 1);
});

test('não abre shell quando todas as referências já existem no processo', async (context) => {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-package-manager-process-env-'),
  );
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeFile(
    path.join(projectPath, '.npmrc'),
    '//registry.example/:_authToken=${NPM_TOKEN}\n',
  );

  const environment = await resolvePackageManagerEnvironment(projectPath, {
    processEnvironment: {
      NPM_TOKEN: 'already-present',
    },
    resolveShellEnvironment: async () => {
      throw new Error('shell não deveria ser consultado');
    },
  });

  assert.deepEqual(environment, { NPM_TOKEN: 'already-present' });
});
