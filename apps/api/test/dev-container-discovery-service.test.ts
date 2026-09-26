import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  DevContainerDiscoveryService,
  type DevContainerCommandRunner,
} from '../src/services/dev-container-discovery-service.js';

const NOW = new Date('2026-09-21T22:00:00.000Z');

function project(root: string): Project {
  return {
    id: 'project-devcontainer',
    name: 'Projeto',
    path: root,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: [],
  };
}

test('projeto sem configuração não executa a Dev Container CLI', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));

  let calls = 0;
  const runner: DevContainerCommandRunner = async () => {
    calls += 1;
    return '';
  };

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));

  assert.equal(result.state, 'not-configured');
  assert.equal(calls, 0);
});

test('inspeciona somente versão e read-configuration com argv estruturado', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.devcontainer'));
  await writeFile(
    path.join(root, '.devcontainer', 'devcontainer.json'),
    '{}\n',
  );

  const calls: Array<{ args: readonly string[]; cwd: string }> = [];
  const runner: DevContainerCommandRunner = async (command, options) => {
    calls.push({ args: [...command.args], cwd: options.cwd });

    if (command.args[0] === '--version') {
      return '0.80.1\n';
    }

    return JSON.stringify({
      configuration: {
        name: 'Workspace seguro',
        image: 'node:22',
      },
    });
  };

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));

  assert.equal(result.state, 'available');
  assert.equal(result.configSource, '.devcontainer/devcontainer.json');
  assert.equal(result.cliVersion, '0.80.1');
  assert.equal(
    result.configurationHash,
    'ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356',
  );
  assert.deepEqual(result.configuration, {
    kind: 'image',
    name: 'Workspace seguro',
    lifecycleHooks: [],
  });
  assert.deepEqual(calls, [
    {
      args: ['--version'],
      cwd: root,
    },
    {
      args: [
        'read-configuration',
        '--workspace-folder',
        root,
        '--include-configuration',
        '--log-format',
        'json',
      ],
      cwd: root,
    },
  ]);
});

test('discovery falha fechado quando a configuração muda durante read-configuration', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, '.devcontainer.json');
  await writeFile(configPath, '{}\n');

  const runner: DevContainerCommandRunner = async (command) => {
    if (command.args[0] === '--version') {
      return '0.80.1\n';
    }

    await writeFile(configPath, '{"image":"node:20"}\n');
    return JSON.stringify({
      configuration: {
        image: 'node:22',
      },
    });
  };

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));

  assert.equal(result.state, 'unavailable');
  assert.equal(result.configurationHash, undefined);
  assert.match(result.diagnostic ?? '', /mudou durante o discovery/i);
});

test('resume compose e lifecycle sem transportar env, commands ou secrets', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, '.devcontainer.json'), '{}\n');

  const runner: DevContainerCommandRunner = async (command) => {
    if (command.args[0] === '--version') {
      return '0.80.1\n';
    }

    return JSON.stringify({
      configuration: {
        name: 'API',
        dockerComposeFile: ['docker-compose.yml'],
        service: 'api',
        remoteEnv: { TOKEN: 'super-secret' },
        containerEnv: { PRIVATE_KEY: 'private-secret' },
        initializeCommand: 'echo initialize-secret',
        postCreateCommand: ['bash', '-lc', 'echo post-create-secret'],
        mounts: ['source=/private/path,target=/workspace,type=bind'],
      },
    });
  };

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));
  const serialized = JSON.stringify(result);

  assert.equal(result.state, 'available');
  assert.deepEqual(result.configuration, {
    kind: 'compose',
    name: 'API',
    service: 'api',
    lifecycleHooks: ['initializeCommand', 'postCreateCommand'],
    composeUsesDefaultConfiguration: true,
  });
  assert.equal(serialized.includes('super-secret'), false);
  assert.equal(serialized.includes('private-secret'), false);
  assert.equal(serialized.includes('initialize-secret'), false);
  assert.equal(serialized.includes('post-create-secret'), false);
  assert.equal(serialized.includes('/private/path'), false);
});

test('não marca Compose alternativo como compatível com o provider padrão', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.devcontainer'));
  await writeFile(
    path.join(root, '.devcontainer', 'devcontainer.json'),
    '{}\n',
  );

  const runner: DevContainerCommandRunner = async (command) => {
    if (command.args[0] === '--version') {
      return '0.80.1\n';
    }

    return JSON.stringify({
      configuration: {
        dockerComposeFile: ['docker-compose.dev.yml'],
        service: 'api',
      },
    });
  };

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));

  assert.equal(result.state, 'available');
  assert.equal(result.configuration?.kind, 'compose');
  assert.equal(
    result.configuration?.composeUsesDefaultConfiguration,
    false,
  );
});

test('CLI ausente vira estado suportado sem vazar erro bruto', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, '.devcontainer.json'), '{}\n');

  const runner: DevContainerCommandRunner = async () => {
    const error = new Error(
      'spawn devcontainer ENOENT from /private/secret/path',
    ) as Error & { code?: string };
    error.code = 'ENOENT';
    throw error;
  };

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));

  assert.equal(result.state, 'cli-missing');
  assert.equal(JSON.stringify(result).includes('/private/secret/path'), false);
});

test('saída estruturada inválida falha fechado e não preserva stdout', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, '.devcontainer.json'), '{}\n');

  const runner: DevContainerCommandRunner = async (command) =>
    command.args[0] === '--version' ? '0.80.1\n' : '{"secret":"token"';

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));

  assert.equal(result.state, 'invalid-output');
  assert.equal(JSON.stringify(result).includes('token'), false);
});

test('ignora symlink de configuração para não atravessar a raiz do projeto', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-'),
  );
  const external = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-devcontainer-external-'),
  );
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  });

  await writeFile(path.join(external, 'devcontainer.json'), '{}\n');
  await symlink(
    path.join(external, 'devcontainer.json'),
    path.join(root, '.devcontainer.json'),
  );

  let calls = 0;
  const runner: DevContainerCommandRunner = async () => {
    calls += 1;
    return '';
  };

  const result = await new DevContainerDiscoveryService(
    runner,
    () => NOW,
  ).inspect(project(root));

  assert.equal(result.state, 'not-configured');
  assert.equal(calls, 0);
});
