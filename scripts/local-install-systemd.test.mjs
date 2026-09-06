import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

import {
  buildSystemdUnit,
  systemdPathValue,
} from './local-install.mjs';

test('serializa paths de diretivas systemd sem aspas literais', () => {
  assert.equal(
    systemdPathValue('/tmp/dev dashboard/%cache'),
    '/tmp/dev\\x20dashboard/\\x25cache',
  );

  const unit = buildSystemdUnit({
    repositoryRoot: '/home/test/dev dashboard',
    nodePath: '/opt/node/bin/node',
    origin: 'http://dev-dashboard.localhost:4343',
    configDirectory: '/home/test/.config/dev dashboard',
    stateDirectory: '/home/test/.local/state/dev-dashboard',
    runtimePath: '/opt/node/bin:/usr/bin:/bin',
  });

  assert.match(
    unit,
    /^WorkingDirectory=\/home\/test\/dev\\x20dashboard$/m,
  );
  assert.match(
    unit,
    /^EnvironmentFile=-\/home\/test\/dev\\x20dashboard\/\.env\.local$/m,
  );
  assert.match(
    unit,
    /^EnvironmentFile=\/home\/test\/\.config\/dev\\x20dashboard\/local-runtime\.env$/m,
  );
  assert.doesNotMatch(unit, /^WorkingDirectory="/m);
  assert.doesNotMatch(unit, /^EnvironmentFile=-?"/m);
});

test('systemd-analyze aceita a unit gerada no Linux quando disponível', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('systemd é específico do Linux');
    return;
  }

  const probe = spawnSync('systemd-analyze', ['--version'], {
    encoding: 'utf8',
  });
  if (probe.error?.code === 'ENOENT') {
    t.skip('systemd-analyze não está disponível');
    return;
  }
  assert.equal(probe.status, 0, probe.stderr || probe.stdout);

  const root = await mkdtemp(path.join(tmpdir(), 'dev dashboard-systemd-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const repositoryRoot = path.join(root, 'repo with space');
  const configDirectory = path.join(root, 'config with space');
  const stateDirectory = path.join(root, 'state');
  const runtimeDirectory = path.join(root, 'runtime');
  await mkdir(path.join(repositoryRoot, 'scripts'), { recursive: true });
  await mkdir(configDirectory, { recursive: true });
  await mkdir(stateDirectory, { recursive: true });
  await mkdir(path.join(runtimeDirectory, 'systemd'), { recursive: true });
  await writeFile(path.join(repositoryRoot, '.env.local'), '');
  await writeFile(path.join(configDirectory, 'local-runtime.env'), '');

  const unit = buildSystemdUnit({
    repositoryRoot,
    nodePath: process.execPath,
    origin: 'http://dev-dashboard.localhost:4343',
    configDirectory,
    stateDirectory,
    runtimePath: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
  });
  const unitPath = path.join(root, 'dev-dashboard.service');
  await writeFile(unitPath, unit);

  const verified = spawnSync(
    'systemd-analyze',
    ['verify', '--user', unitPath],
    {
      encoding: 'utf8',
      env: { ...process.env, XDG_RUNTIME_DIR: runtimeDirectory },
    },
  );

  assert.equal(
    verified.status,
    0,
    [verified.stdout, verified.stderr].filter(Boolean).join('\n'),
  );
});
