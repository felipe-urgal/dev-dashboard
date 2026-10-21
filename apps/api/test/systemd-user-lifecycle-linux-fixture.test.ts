import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rmdir,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';
import { SystemdServiceInventory } from '../src/services/systemd-service-inventory.js';
import { SystemdUserLifecycleService } from '../src/services/systemd-user-lifecycle-service.js';

const execAsync = promisify(execFile);
const ENABLED = process.env.DD_SYSTEMD_USER_FIXTURE_E2E === '1';
const REVISION = 'a'.repeat(64);
const HASH = 'b'.repeat(64);

async function systemctl(args: string[]): Promise<string> {
  const { stdout } = await execAsync('systemctl', ['--user', ...args], {
    timeout: 8_000,
    maxBuffer: 32 * 1024,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  return stdout;
}

function property(text: string, key: string): string {
  const line = text.split(/\r?\n/).find((row) => row.startsWith(key + '='));
  return line?.slice(key.length + 1) ?? '';
}

async function ownedDirectory(dir: string, created: string[]): Promise<void> {
  try {
    await mkdir(dir, { mode: 0o700 });
    created.push(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const info = await lstat(dir);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid()
  ) {
    throw new Error('User fixture directory must be owned and not a symlink.');
  }
}

async function fragment(unit: string): Promise<string> {
  return property(
    await systemctl(['show', '--property=FragmentPath', '--', unit]),
    'FragmentPath',
  );
}

test(
  'opt-in Linux disposable systemd --user lifecycle: Start, Restart, Stop, revoke',
  {
    skip: ENABLED
      ? false
      : 'requires DD_SYSTEMD_USER_FIXTURE_E2E=1 and a dedicated systemd user session',
    timeout: 75_000,
  },
  async () => {
    if (
      process.platform !== 'linux' ||
      !process.getuid ||
      process.getuid() === 0
    ) {
      throw new Error('A non-root Linux test user is required.');
    }
    const home = process.env.HOME;
    const config =
      process.env.XDG_CONFIG_HOME ?? (home ? path.join(home, '.config') : '');
    if (
      !home ||
      !path.isAbsolute(home) ||
      !path.resolve(config).startsWith(path.resolve(home) + path.sep)
    ) {
      throw new Error('Config must be inside an absolute dedicated HOME.');
    }
    const homeStat = await lstat(home);
    if (
      !homeStat.isDirectory() ||
      homeStat.isSymbolicLink() ||
      homeStat.uid !== process.getuid()
    ) {
      throw new Error('HOME must be an owned, non-symlink directory.');
    }
    assert.equal((await stat('/usr/bin/sleep')).isFile(), true);
    // An explicit opt-in never degrades to an artificial success/skip.
    await systemctl(['show-environment']);

    const created: string[] = [];
    let unitFile: string | undefined;
    let originalInode: { ino: number; dev: number } | undefined;
    let unit: string | undefined;
    let loaded = false;
    let stateRoot: string | undefined;
    try {
      await ownedDirectory(config, created);
      const systemdDir = path.join(config, 'systemd');
      await ownedDirectory(systemdDir, created);
      const userDir = path.join(systemdDir, 'user');
      await ownedDirectory(userDir, created);

      unit = 'dd-fixture-' + randomUUID().replace(/-/g, '') + '.service';
      unitFile = path.join(userDir, unit);
        const file = await open(unitFile, 'wx', 0o600);
      try {
        const details = await file.stat();
        originalInode = { ino: details.ino, dev: details.dev };
        await file.writeFile(
          '[Unit]\nDescription=Disposable Dashboard user-unit test\n' +
            '[Service]\nType=simple\nExecStart=/usr/bin/sleep 300\n' +
            'Restart=no\nKillMode=control-group\nTimeoutStopSec=5s\n',
        );
      } finally {
        await file.close();
      }
      await systemctl(['daemon-reload']);
      loaded = true;
      assert.equal(
        await realpath(await fragment(unit)),
        await realpath(unitFile),
        'Manager must resolve only the random fixture file',
      );

      stateRoot = await mkdtemp(path.join(os.tmpdir(), 'dd-systemd-fixture-'));
      const ref = 'systemd:user:' + unit;
      const baseRequest = {
        projectId: 'disposable-fixture',
        environmentInstanceId: 'environment:primary:disposable-fixture',
        serviceRef: ref,
        expectedRevision: REVISION,
        planHash: HASH,
      };
      let allowed = false;
      const owner = new SystemdUserLifecycleService(
        {
          inventory: new SystemdServiceInventory({ platform: 'linux' }),
          locks: new ServiceResourceOperationLock({
            stateDirectory: stateRoot,
          }),
          authorize: async (request) =>
            allowed &&
            request.projectId === baseRequest.projectId &&
            request.environmentInstanceId ===
              baseRequest.environmentInstanceId &&
            request.serviceRef === ref &&
            request.expectedRevision === REVISION &&
            request.planHash === HASH,
        },
        { platform: 'linux' },
      );

      await assert.rejects(
        owner.run({ ...baseRequest, action: 'start' }),
        /not explicitly authorized/,
      );
      assert.equal(
        property(
          await systemctl(['show', '--property=ActiveState', '--', unit]),
          'ActiveState',
        ),
        'inactive',
      );

      allowed = true;
      const started = await owner.run({ ...baseRequest, action: 'start' });
      assert.equal(started.outcome, 'changed');
      assert.equal(started.state, 'running');
      assert.equal(started.readiness, 'unknown');
      assert.equal(
        (await owner.run({ ...baseRequest, action: 'start' })).outcome,
        'already-in-target-state',
      );
      const pidBefore = Number(
        property(
          await systemctl(['show', '--property=MainPID', '--', unit]),
          'MainPID',
        ),
      );
      assert.ok(Number.isInteger(pidBefore) && pidBefore > 0);

      const restarted = await owner.run({ ...baseRequest, action: 'restart' });
      assert.equal(restarted.outcome, 'changed');
      assert.equal(restarted.readiness, 'unknown');
      const pidAfter = Number(
        property(
          await systemctl(['show', '--property=MainPID', '--', unit]),
          'MainPID',
        ),
      );
      assert.ok(Number.isInteger(pidAfter) && pidAfter > 0);
      assert.notEqual(
        pidAfter,
        pidBefore,
        'Restart must replace the fixture process, not just remain active',
      );

      allowed = false;
      await assert.rejects(
        owner.run({ ...baseRequest, action: 'stop' }),
        /not explicitly authorized/,
      );
      assert.equal(
        property(
          await systemctl(['show', '--property=ActiveState', '--', unit]),
          'ActiveState',
        ),
        'active',
      );
      allowed = true;
      const stopped = await owner.run({ ...baseRequest, action: 'stop' });
      assert.equal(stopped.state, 'stopped');
      assert.equal(stopped.outcome, 'changed');
      assert.equal(stopped.readiness, 'unknown');
      assert.equal(
        property(
          await systemctl(['show', '--property=ActiveState', '--', unit]),
          'ActiveState',
        ),
        'inactive',
      );
    } finally {
      // Fail closed when the random name has been repointed. Do not stop an
      // unrelated unit, unlink a replaced file, or delete another lease.
      if (unitFile && unit && loaded) {
        const currentFragment = await fragment(unit);
        const current = await lstat(unitFile);
        if (
          path.resolve(currentFragment) !== path.resolve(unitFile) ||
          !current.isFile() ||
          current.isSymbolicLink() ||
          !originalInode ||
          current.ino !== originalInode.ino ||
          current.dev !== originalInode.dev
        ) {
          throw new Error('Fixture identity changed: manual cleanup required.');
        }
        await systemctl(['stop', '--', unit]);
      }
      if (unitFile) {
        const current = await lstat(unitFile).catch(() => null);
        if (
          current &&
          current.isFile() &&
          !current.isSymbolicLink() &&
          originalInode &&
          current.ino === originalInode.ino &&
          current.dev === originalInode.dev
        ) {
          await unlink(unitFile);
        }
      }
      if (loaded) await systemctl(['daemon-reload']);
      if (stateRoot) await rm(stateRoot, { recursive: true, force: true });
      for (const dir of created.reverse()) {
        await rmdir(dir).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST')
            throw error;
        });
      }
    }
  },
);
