import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { detectProject, scanWorkspace } from '../src/index.js';

async function withNodeProject(
  scripts: Record<string, string>,
  run: (projectPath: string) => Promise<void>,
): Promise<void> {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-production-contract-'),
  );

  try {
    await writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: 'fixture-production', private: true, scripts }),
    );
    await run(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

async function writeProductionManifest(
  projectPath: string,
  production: Record<string, unknown>,
): Promise<void> {
  const manifestDirectory = path.join(projectPath, '.dev-dashboard');
  await mkdir(manifestDirectory, { recursive: true });
  await writeFile(
    path.join(manifestDirectory, 'production.json'),
    JSON.stringify({ version: 1, production }, null, 2),
  );
}

const localPolicies = {
  backup: 'required-before-deploy',
  migrations: 'startup',
  rollback: 'manual-restore',
};

const vercelPolicies = {
  backup: 'external',
  migrations: 'before-deploy',
  rollback: 'provider-only-when-schema-compatible',
};

const disabledPolicies = {
  backup: 'not-configured',
  migrations: 'not-configured',
  rollback: 'not-configured',
};

test('manifesto ausente não cria capability nem warning de produção', async () => {
  await withNodeProject({ dev: 'vite' }, async (projectPath) => {
    const project = await detectProject(projectPath);
    assert.ok(project);
    assert.equal(project.production, undefined);
    assert.equal(project.productionWarning, undefined);
    assert.equal(project.capabilities.includes('production'), false);
  });
});

test('contrato command válido é normalizado e adiciona capability production', async () => {
  await withNodeProject(
    {
      'prod:status': 'systemctl status fixture',
      'prod:check': 'npm test',
      'prod:backup': 'node backup.mjs',
      'prod:deploy': 'node deploy.mjs',
      'prod:verify': 'node verify.mjs',
      'prod:logs': 'journalctl -u fixture',
    },
    async (projectPath) => {
      await writeProductionManifest(projectPath, {
        enabled: true,
        strategy: 'command',
        provider: 'systemd',
        branch: 'main',
        documentation: 'docs/production.md',
        commands: {
          status: 'prod:status',
          check: 'prod:check',
          backup: 'prod:backup',
          deploy: 'prod:deploy',
          verify: 'prod:verify',
          logs: 'prod:logs',
        },
        health: { type: 'http', url: 'http://127.0.0.1:8787/ready' },
        policies: localPolicies,
      });

      const project = await detectProject(projectPath);
      assert.ok(project?.production);
      assert.equal(project.production.version, 1);
      assert.equal(project.production.strategy, 'command');
      assert.equal(project.production.provider, 'systemd');
      assert.equal(project.production.commands.deploy, 'prod:deploy');
      assert.equal(project.productionWarning, undefined);
      assert.ok(project.capabilities.includes('production'));
    },
  );
});

test('contrato git-managed valida preflight sem exigir deploy local', async () => {
  await withNodeProject(
    {
      'prod:check': 'pnpm check',
      'prod:migrate': 'prisma migrate deploy',
      'prod:verify': 'node verify.mjs',
    },
    async (projectPath) => {
      await writeProductionManifest(projectPath, {
        enabled: true,
        strategy: 'git-managed',
        provider: 'vercel',
        branch: 'main',
        commands: {
          check: 'prod:check',
          migrate: 'prod:migrate',
          verify: 'prod:verify',
        },
        external: { project: 'controle-gastos' },
        policies: vercelPolicies,
      });

      const project = await detectProject(projectPath);
      assert.ok(project?.production);
      assert.equal(project.production.provider, 'vercel');
      assert.equal(project.production.commands.deploy, undefined);
      assert.ok(project.capabilities.includes('production'));
    },
  );
});

test('identificadores sem conteúdo útil são rejeitados pelo contrato', async () => {
  const scripts = {
    'prod:status': 'node status.mjs',
    'prod:check': 'npm test',
    'prod:deploy': 'node deploy.mjs',
    'prod:verify': 'node verify.mjs',
  };

  await withNodeProject(scripts, async (projectPath) => {
    await writeProductionManifest(projectPath, {
      enabled: true,
      strategy: 'command',
      provider: 'systemd',
      branch: '   ',
      commands: {
        status: 'prod:status',
        check: 'prod:check',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      policies: localPolicies,
    });

    const project = await detectProject(projectPath);
    assert.equal(project?.production, undefined);
    assert.equal(
      project?.productionWarning?.code,
      'PRODUCTION_CONTRACT_INVALID_SHAPE',
    );
  });

  await withNodeProject(
    {
      'prod:check': 'pnpm check',
      'prod:verify': 'node verify.mjs',
    },
    async (projectPath) => {
      await writeProductionManifest(projectPath, {
        enabled: true,
        strategy: 'git-managed',
        provider: 'vercel',
        branch: 'main',
        commands: {
          check: 'prod:check',
          verify: 'prod:verify',
        },
        external: { project: '   ' },
        policies: vercelPolicies,
      });

      const project = await detectProject(projectPath);
      assert.equal(project?.production, undefined);
      assert.equal(
        project?.productionWarning?.code,
        'PRODUCTION_CONTRACT_INVALID_SHAPE',
      );
    },
  );
});

test('contrato disabled válido continua detectável sem habilitar deploy público', async () => {
  await withNodeProject(
    {
      'prod:status': 'node production-gate.mjs status',
      'prod:check': 'pnpm check',
      'prod:deploy': 'node production-gate.mjs deploy',
      'prod:verify': 'node production-gate.mjs verify',
    },
    async (projectPath) => {
      await writeProductionManifest(projectPath, {
        enabled: false,
        strategy: 'disabled',
        provider: 'none',
        branch: 'main',
        reasonCode: 'production-readiness-gate',
        blockedBy: ['backup-dr', 'production-security'],
        commands: {
          status: 'prod:status',
          check: 'prod:check',
          deploy: 'prod:deploy',
          verify: 'prod:verify',
        },
        policies: disabledPolicies,
      });

      const project = await detectProject(projectPath);
      assert.ok(project?.production);
      assert.equal(project.production.enabled, false);
      assert.equal(project.production.reasonCode, 'production-readiness-gate');
      assert.ok(project.capabilities.includes('production'));
    },
  );
});

test('JSON inválido gera warning estruturado e nunca cria capability', async () => {
  await withNodeProject({ 'prod:check': 'npm test' }, async (projectPath) => {
    const manifestDirectory = path.join(projectPath, '.dev-dashboard');
    await mkdir(manifestDirectory, { recursive: true });
    await writeFile(
      path.join(manifestDirectory, 'production.json'),
      '{"version":1,"production":',
    );

    const project = await detectProject(projectPath);
    assert.ok(project);
    assert.equal(project.production, undefined);
    assert.equal(
      project.productionWarning?.code,
      'PRODUCTION_CONTRACT_INVALID_JSON',
    );
    assert.equal(project.capabilities.includes('production'), false);
  });
});

test('script canônico declarado mas inexistente falha de forma identificável', async () => {
  await withNodeProject(
    {
      'prod:status': 'node status.mjs',
      'prod:check': 'npm test',
      'prod:verify': 'node verify.mjs',
    },
    async (projectPath) => {
      await writeProductionManifest(projectPath, {
        enabled: true,
        strategy: 'command',
        provider: 'docker-compose',
        branch: 'main',
        commands: {
          status: 'prod:status',
          check: 'prod:check',
          deploy: 'prod:deploy',
          verify: 'prod:verify',
        },
        policies: localPolicies,
      });

      const project = await detectProject(projectPath);
      assert.ok(project);
      assert.equal(project.production, undefined);
      assert.equal(
        project.productionWarning?.code,
        'PRODUCTION_CONTRACT_SCRIPT_MISSING',
      );
      assert.equal(project.capabilities.includes('production'), false);
    },
  );
});

test('manifesto não pode mapear operação canônica para script arbitrário', async () => {
  await withNodeProject(
    {
      'prod:status': 'node status.mjs',
      'prod:check': 'npm test',
      'prod:deploy': 'node deploy.mjs',
      'prod:verify': 'node verify.mjs',
      postinstall: 'rm -rf /tmp/example',
    },
    async (projectPath) => {
      await writeProductionManifest(projectPath, {
        enabled: true,
        strategy: 'command',
        provider: 'systemd',
        branch: 'main',
        commands: {
          status: 'prod:status',
          check: 'prod:check',
          deploy: 'postinstall',
          verify: 'prod:verify',
        },
        policies: localPolicies,
      });

      const project = await detectProject(projectPath);
      assert.ok(project);
      assert.equal(project.production, undefined);
      assert.equal(
        project.productionWarning?.code,
        'PRODUCTION_CONTRACT_INVALID_SHAPE',
      );
      assert.equal(project.capabilities.includes('production'), false);
    },
  );
});

test('scan do workspace preserva contrato ou warning por projeto', async () => {
  const workspacePath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-production-workspace-'),
  );

  try {
    const validPath = path.join(workspacePath, 'valid-project');
    const invalidPath = path.join(workspacePath, 'invalid-project');
    await Promise.all([mkdir(validPath), mkdir(invalidPath)]);

    await Promise.all([
      writeFile(
        path.join(validPath, 'package.json'),
        JSON.stringify({
          scripts: {
            'prod:status': 'node status.mjs',
            'prod:check': 'npm test',
            'prod:deploy': 'node deploy.mjs',
            'prod:verify': 'node verify.mjs',
          },
        }),
      ),
      writeFile(
        path.join(invalidPath, 'package.json'),
        JSON.stringify({ scripts: { 'prod:check': 'npm test' } }),
      ),
    ]);

    await writeProductionManifest(validPath, {
      enabled: true,
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
      commands: {
        status: 'prod:status',
        check: 'prod:check',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      policies: localPolicies,
    });

    const invalidManifestDirectory = path.join(invalidPath, '.dev-dashboard');
    await mkdir(invalidManifestDirectory, { recursive: true });
    await writeFile(
      path.join(invalidManifestDirectory, 'production.json'),
      '{not-json',
    );

    const result = await scanWorkspace({ id: 'workspace', path: workspacePath });
    const validProject = result.projects.find(
      (project) => project.name === 'valid-project',
    );
    const invalidProject = result.projects.find(
      (project) => project.name === 'invalid-project',
    );

    assert.ok(validProject?.production);
    assert.ok(validProject.capabilities.includes('production'));
    assert.equal(
      invalidProject?.productionWarning?.code,
      'PRODUCTION_CONTRACT_INVALID_JSON',
    );
    assert.equal(invalidProject?.capabilities.includes('production'), false);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
