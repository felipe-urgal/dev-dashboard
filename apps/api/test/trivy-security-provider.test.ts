import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  TrivySecurityProvider,
  type TrivyCommandRunner,
} from '../src/services/trivy-security-provider.js';

const NOW = new Date('2026-09-05T20:00:00.000Z');
const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

test('availability detecta versão sem transportar saída arbitrária', async () => {
  const runner: TrivyCommandRunner = async (command) => {
    assert.deepEqual(command, { program: 'trivy', args: ['--version'] });
    return 'Version: 0.68.1\nsecret-token-que-nao-deve-voltar';
  };

  const result = await new TrivySecurityProvider(
    runner,
    () => NOW,
  ).availability();

  assert.deepEqual(result, {
    state: 'available',
    observedAt: NOW.toISOString(),
    version: '0.68.1',
  });
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
});

test('scan usa argv fixo, cwd do projeto e sanitiza secret pelo parser existente', async () => {
  const calls: Array<{ args: string[]; cwd?: string }> = [];
  const runner: TrivyCommandRunner = async (command, options) => {
    calls.push({
      args: [...command.args],
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });
    return JSON.stringify({
      Results: [
        {
          Target: 'scripts/deploy.sh',
          Secrets: [
            {
              RuleID: 'github-pat',
              Severity: 'HIGH',
              StartLine: 18,
              Match: 'ghp_SUPER_SECRET_VALUE',
              Code: { Lines: [{ Content: 'TOKEN=ghp_SUPER_SECRET_VALUE' }] },
            },
          ],
        },
      ],
    });
  };

  const result = await new TrivySecurityProvider(runner, () => NOW).scan(
    project,
  );

  assert.equal(result.state, 'completed');
  assert.deepEqual(calls[0], {
    args: [
      'fs',
      '--format',
      'json',
      '--scanners',
      'secret,misconfig',
      '--no-progress',
      '--skip-dirs',
      'node_modules',
      '--skip-dirs',
      'dist',
      '--skip-dirs',
      'build',
      '--skip-dirs',
      'coverage',
      '.',
    ],
    cwd: project.path,
  });
  assert.equal(result.result?.findings[0]?.file, 'scripts/deploy.sh');
  assert.equal(
    JSON.stringify(result).includes('ghp_SUPER_SECRET_VALUE'),
    false,
  );
});

test('Trivy ausente é estado suportado e não ecoa path do erro', async () => {
  const runner: TrivyCommandRunner = async () => {
    const error = new Error('spawn trivy ENOENT /secret/path') as Error & {
      code?: string;
    };
    error.code = 'ENOENT';
    throw error;
  };

  const provider = new TrivySecurityProvider(runner, () => NOW);
  const availability = await provider.availability();
  const scan = await provider.scan(project);

  assert.equal(availability.state, 'missing');
  assert.equal(scan.state, 'failed');
  assert.equal(
    JSON.stringify({ availability, scan }).includes('/secret/path'),
    false,
  );
});

test('JSON inválido falha fechado sem transportar stdout', async () => {
  const runner: TrivyCommandRunner = async () => '{"Match":"SUPER_SECRET"';
  const result = await new TrivySecurityProvider(runner, () => NOW).scan(
    project,
  );

  assert.equal(result.state, 'invalid-output');
  assert.equal(JSON.stringify(result).includes('SUPER_SECRET'), false);
});
