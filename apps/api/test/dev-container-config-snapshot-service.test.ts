import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DevContainerConfigSnapshotError,
  DevContainerConfigSnapshotService,
} from '../src/services/dev-container-config-snapshot-service.js';

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

test('snapshot copia bytes confirmados para arquivo privado e dispose remove tudo', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-config-snapshot-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const state = path.join(root, 'state', 'snapshots');
  await mkdir(path.join(workspace, '.devcontainer'), { recursive: true });
  const content =
    '{\n  // segredo permanece apenas no snapshot privado\n  "image": "node:22"\n}\n';
  const configPath = path.join(workspace, '.devcontainer', 'devcontainer.json');
  await writeFile(configPath, content);

  const service = new DevContainerConfigSnapshotService(
    state,
    () => 'snapshot-1',
  );
  const snapshot = await service.create({
    workspaceFolder: workspace,
    configSource: '.devcontainer/devcontainer.json',
    expectedConfigurationHash: sha256(content),
  });

  assert.equal(snapshot.originalConfigPath, configPath);
  assert.equal(snapshot.configurationHash, sha256(content));
  assert.equal(await readFile(snapshot.overrideConfigPath, 'utf8'), content);

  if (process.platform !== 'win32') {
    const directoryMode =
      (await lstat(path.dirname(snapshot.overrideConfigPath))).mode & 0o777;
    const fileMode = (await lstat(snapshot.overrideConfigPath)).mode & 0o777;
    assert.equal(directoryMode, 0o700);
    assert.equal(fileMode, 0o600);
  }

  await snapshot.dispose();
  await snapshot.dispose();
  await assert.rejects(
    () => access(snapshot.overrideConfigPath),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT',
      ),
  );
  assert.equal(await readFile(configPath, 'utf8'), content);
});

test('dispose permanece idempotente depois de remover o snapshot', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-config-snapshot-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  const content = '{}\n';
  await writeFile(path.join(workspace, '.devcontainer.json'), content);

  const snapshot = await new DevContainerConfigSnapshotService(
    path.join(root, 'snapshots'),
    () => 'snapshot-idempotent',
  ).create({
    workspaceFolder: workspace,
    configSource: '.devcontainer.json',
    expectedConfigurationHash: sha256(content),
  });

  await snapshot.dispose();
  await snapshot.dispose();
  await assert.rejects(() => access(snapshot.overrideConfigPath));
});

test('snapshot falha fechado quando conteúdo não corresponde ao hash confirmado', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-config-snapshot-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  await writeFile(
    path.join(workspace, '.devcontainer.json'),
    '{"image":"node:20"}\n',
  );

  const service = new DevContainerConfigSnapshotService(
    path.join(root, 'snapshots'),
  );

  await assert.rejects(
    () =>
      service.create({
        workspaceFolder: workspace,
        configSource: '.devcontainer.json',
        expectedConfigurationHash: sha256('{"image":"node:22"}\n'),
      }),
    (error: unknown) =>
      error instanceof DevContainerConfigSnapshotError &&
      error.code === 'DEV_CONTAINER_CONFIG_SNAPSHOT_CHANGED',
  );
});

test('snapshot rejeita symlink e configuração acima do limite', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-config-snapshot-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));

  const external = path.join(root, 'external.json');
  await writeFile(external, '{}\n');
  const linkedWorkspace = path.join(root, 'linked');
  await mkdir(linkedWorkspace);
  await symlink(external, path.join(linkedWorkspace, '.devcontainer.json'));

  const service = new DevContainerConfigSnapshotService(
    path.join(root, 'snapshots'),
  );
  await assert.rejects(
    () =>
      service.create({
        workspaceFolder: linkedWorkspace,
        configSource: '.devcontainer.json',
        expectedConfigurationHash: sha256('{}\n'),
      }),
    (error: unknown) =>
      error instanceof DevContainerConfigSnapshotError &&
      error.code === 'DEV_CONTAINER_CONFIG_SNAPSHOT_SOURCE_INVALID',
  );

  const largeWorkspace = path.join(root, 'large');
  await mkdir(largeWorkspace);
  const oversized = Buffer.alloc(1024 * 1024 + 1, 0x78);
  await writeFile(path.join(largeWorkspace, '.devcontainer.json'), oversized);
  await assert.rejects(
    () =>
      service.create({
        workspaceFolder: largeWorkspace,
        configSource: '.devcontainer.json',
        expectedConfigurationHash: sha256(oversized),
      }),
    (error: unknown) =>
      error instanceof DevContainerConfigSnapshotError &&
      error.code === 'DEV_CONTAINER_CONFIG_SNAPSHOT_SOURCE_INVALID',
  );
});

test('snapshot rejeita root relativo e identificador interno inseguro', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-config-snapshot-'),
  );
  context.after(async () => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  const content = '{}\n';
  await writeFile(path.join(workspace, '.devcontainer.json'), content);

  const relativeRoot = new DevContainerConfigSnapshotService('snapshots');
  await assert.rejects(
    () =>
      relativeRoot.create({
        workspaceFolder: workspace,
        configSource: '.devcontainer.json',
        expectedConfigurationHash: sha256(content),
      }),
    (error: unknown) =>
      error instanceof DevContainerConfigSnapshotError &&
      error.code === 'DEV_CONTAINER_CONFIG_SNAPSHOT_INPUT_INVALID',
  );

  const unsafeId = new DevContainerConfigSnapshotService(
    path.join(root, 'snapshots'),
    () => '../escape',
  );
  await assert.rejects(
    () =>
      unsafeId.create({
        workspaceFolder: workspace,
        configSource: '.devcontainer.json',
        expectedConfigurationHash: sha256(content),
      }),
    (error: unknown) =>
      error instanceof DevContainerConfigSnapshotError &&
      error.code === 'DEV_CONTAINER_CONFIG_SNAPSHOT_WRITE_FAILED',
  );
});

test('snapshot rejeita workspace relativo e hash inválido antes de tocar o filesystem', async () => {
  const service = new DevContainerConfigSnapshotService('/tmp/snapshots');

  for (const input of [
    {
      workspaceFolder: 'workspace/project',
      configSource: '.devcontainer.json' as const,
      expectedConfigurationHash: 'a'.repeat(64),
    },
    {
      workspaceFolder: '/workspace/project',
      configSource: '.devcontainer.json' as const,
      expectedConfigurationHash: 'hash-invalido',
    },
  ]) {
    await assert.rejects(
      () => service.create(input),
      (error: unknown) =>
        error instanceof DevContainerConfigSnapshotError &&
        error.code === 'DEV_CONTAINER_CONFIG_SNAPSHOT_INPUT_INVALID',
    );
  }
});
