import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ProductionContractDraft } from '@dev-dashboard/contracts';
import { validateProductionManifest } from '@dev-dashboard/project-discovery';

import {
  ContractSetupError,
  ProductionContractSetupService,
} from '../src/deployment/contract-setup.js';

async function makeProject(scripts: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dd-contract-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'demo', scripts }),
  );
  return root;
}

const closedPolicies = {
  backup: 'not-configured',
  migrations: 'not-configured',
  rollback: 'not-configured',
} as const;

test('detecta os scripts prod:* e se já existe um manifesto', async () => {
  const root = await makeProject({
    test: 'vitest',
    'prod:status': 'echo',
    'prod:check': 'echo',
  });
  try {
    const info = await new ProductionContractSetupService().info(root);
    assert.deepEqual(info.scripts, ['prod:check', 'prod:status']);
    assert.equal(info.manifestExists, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('o preview aponta os scripts que faltam e a estratégia self-update é normalizada', async () => {
  const root = await makeProject({ 'prod:status': 'echo' });
  try {
    const service = new ProductionContractSetupService();
    const draft: ProductionContractDraft = {
      strategy: 'self-update',
      provider: 'systemd',
      branch: 'main',
      // O cliente pede mais do que o self-update aceita: o servidor normaliza.
      commands: ['status', 'check', 'deploy'],
      healthUrl: '',
      policies: {
        backup: 'required-before-deploy',
        migrations: 'startup',
        rollback: 'manual-restore',
      },
    };

    const preview = await service.preview(root, draft);

    assert.equal(preview.valid, false);
    assert.deepEqual(preview.missingScripts, ['prod:check']);
    assert.deepEqual(preview.manifest.production.commands, {
      status: 'prod:status',
      check: 'prod:check',
    });
    assert.equal(preview.manifest.production.provider, 'none');
    assert.deepEqual(preview.manifest.production.policies, closedPolicies);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('grava um contrato válido que o discovery reconhece e não sobrescreve sem confirmação', async () => {
  const root = await makeProject({
    'prod:status': 'echo',
    'prod:check': 'echo',
    'prod:deploy': 'echo',
    'prod:verify': 'echo',
    'prod:backup': 'echo',
  });
  try {
    const service = new ProductionContractSetupService();
    const draft: ProductionContractDraft = {
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
      commands: ['status', 'check', 'backup', 'deploy', 'verify'],
      healthUrl: 'http://127.0.0.1:8787/ready',
      policies: {
        backup: 'required-before-deploy',
        migrations: 'startup',
        rollback: 'manual-restore',
      },
    };

    const written = await service.write(root, draft, { overwrite: false });
    assert.equal(written.valid, true);

    const detected = validateProductionManifest(
      JSON.parse(
        await readFile(
          path.join(root, '.dev-dashboard/production.json'),
          'utf8',
        ),
      ),
      {
        'prod:status': 'echo',
        'prod:check': 'echo',
        'prod:deploy': 'echo',
        'prod:verify': 'echo',
        'prod:backup': 'echo',
      },
    );
    assert.equal(detected.contract?.strategy, 'command');
    assert.equal(detected.contract?.health?.url, 'http://127.0.0.1:8787/ready');

    await assert.rejects(
      () => service.write(root, draft, { overwrite: false }),
      (error: unknown) =>
        error instanceof ContractSetupError && error.code === 'ALREADY_EXISTS',
    );
    const replaced = await service.write(root, draft, { overwrite: true });
    assert.equal(replaced.valid, true);
    assert.match(
      await readFile(path.join(root, '.dev-dashboard/production.json'), 'utf8'),
      /"strategy": "command"/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('recusa gravar um contrato inválido e não cria o arquivo', async () => {
  const root = await makeProject({});
  try {
    await assert.rejects(
      () =>
        new ProductionContractSetupService().write(
          root,
          {
            strategy: 'git-managed',
            provider: 'vercel',
            branch: 'main',
            commands: ['check', 'verify'],
            policies: closedPolicies,
          },
          { overwrite: false },
        ),
      (error: unknown) =>
        error instanceof ContractSetupError && error.code === 'INVALID_DRAFT',
    );
    assert.equal(
      (await new ProductionContractSetupService().info(root)).manifestExists,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
