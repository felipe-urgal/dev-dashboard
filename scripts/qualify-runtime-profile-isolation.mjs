import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const IMAGE = 'postgres:16-alpine';
const LABEL = 'dev-dashboard.runtime-profile-qualification';
const ROLES = ['gastos-primary-test', 'gastos-worktree-test', 'gastos-production-fixture', 'loto-primary-test'];

function command(binary, args, { allowFailure = false } = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 131072, shell: false });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    // Do not log arguments: the initial Docker run contains a disposable password.
    throw new Error(binary + ' ' + (args[0] || 'command') + ' failed (exit ' + (result.status ?? 'unavailable') + ').');
  }
  return (result.stdout || '').trim();
}
const docker = (...args) => command('docker', args);
const sql = (container, statement) => docker('exec', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-c', statement);

async function ready(container) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (command('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-q'], { allowFailure: true }) !== null) return;
    await delay(500);
  }
  throw new Error('Disposable PostgreSQL did not become ready.');
}

function worktreeIsolation(root, volumes) {
  const repo = path.join(root, 'repository');
  const qa = path.join(root, 'worktrees', 'qa');
  const review = path.join(root, 'worktrees', 'production-review');
  mkdirSync(repo, { recursive: true });
  mkdirSync(path.dirname(qa), { recursive: true });
  command('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  command('git', ['-C', repo, 'config', 'user.name', 'Runtime Qualification']);
  command('git', ['-C', repo, 'config', 'user.email', 'qualification@example.invalid']);
  writeFileSync(path.join(repo, 'README.md'), 'Disposable repository for issue #1120.\n');
  command('git', ['-C', repo, 'add', 'README.md']);
  command('git', ['-C', repo, 'commit', '-q', '-m', 'init disposable repository']);
  command('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'qa', qa, 'HEAD']);
  command('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'production-review', review, 'HEAD']);
  const dirs = [repo, qa, review];
  assert.equal(new Set(dirs.map((dir) => path.resolve(dir))).size, 3);
  assert.equal(new Set(volumes).size, 4);
  for (let i = 0; i < dirs.length; i++) {
    const marker = path.join(dirs[i], '.qualification-volume');
    writeFileSync(marker, volumes[i] + '\n');
    assert.equal(readFileSync(marker, 'utf8').trim(), volumes[i]);
  }
  assert.equal(readFileSync(path.join(qa, '.qualification-volume'), 'utf8').trim(), volumes[1]);
  assert.equal(readFileSync(path.join(review, '.qualification-volume'), 'utf8').trim(), volumes[2]);
  assert.equal(existsSync(path.join(qa, 'README.md')), true);
  assert.equal(existsSync(path.join(review, 'README.md')), true);
  // Identical descriptive database roles do not resolve to another checkout or volume.
}

async function main() {
  if (process.env.RUNTIME_ISOLATION_QUALIFY !== '1') {
    process.stderr.write('Refusing Docker work: RUNTIME_ISOLATION_QUALIFY=1 is required.\n');
    return 2;
  }
  if (process.argv.length !== 2) {
    process.stderr.write('No target/resource arguments are supported.\n');
    return 2;
  }
  const prefix = 'dd1120-' + randomBytes(7).toString('hex');
  const volumes = [];
  const containers = new Set();
  let tempRoot;
  let exitCode = 0;
  try {
    docker('info', '--format', '{{.ServerVersion}}');
    docker('image', 'inspect', IMAGE);
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dev-dashboard-1120-'));
    async function start(role, persistedVolume) {
      const password = randomBytes(24).toString('hex');
      const volume = persistedVolume || prefix + '-' + role;
      const container = prefix + '-' + role;
      if (!persistedVolume) {
        docker('volume', 'create', '--label', LABEL + '=' + prefix, volume);
        volumes.push(volume);
      }
      docker('run', '-d', '--pull=never', '--name', container, '--network', 'none',
        '--label', LABEL + '=' + prefix,
        '--mount', 'type=volume,source=' + volume + ',target=/var/lib/postgresql/data',
        '--env', 'POSTGRES_PASSWORD=' + password, IMAGE);
      containers.add(container);
      assert.equal(docker('inspect', '--format', '{{.HostConfig.NetworkMode}}', container), 'none');
      const ports = docker('inspect', '--format', '{{json .HostConfig.PortBindings}}', container);
      assert.equal(ports === 'null' || ports === '{}', true);
      const mounts = JSON.parse(docker('inspect', '--format', '{{json .Mounts}}', container));
      assert.equal(mounts.some((mount) => mount.Type === 'volume' && mount.Name === volume && mount.Destination === '/var/lib/postgresql/data'), true);
      await ready(container);
      return { container, volume };
    }
    const databases = [];
    for (const role of ROLES) databases.push(await start(role));
    const baseline = ['primary-test', 'worktree-test', 'production-fixture', 'loto'];
    for (let i = 0; i < databases.length; i++) {
      sql(databases[i].container, 'CREATE TABLE qualification_marker (value text NOT NULL)');
      sql(databases[i].container, "INSERT INTO qualification_marker VALUES ('" + baseline[i] + "')");
    }
    for (let i = 0; i < databases.length; i++) {
      assert.equal(sql(databases[i].container, 'SELECT value FROM qualification_marker'), baseline[i]);
    }
    worktreeIsolation(tempRoot, volumes);
    // The production-shaped fixture is never written again after seeding.
    sql(databases[0].container, "UPDATE qualification_marker SET value = 'primary-changed'");
    assert.equal(sql(databases[0].container, 'SELECT value FROM qualification_marker'), 'primary-changed');
    for (let i = 1; i < databases.length; i++) {
      assert.equal(sql(databases[i].container, 'SELECT value FROM qualification_marker'), baseline[i]);
    }
    // Recreate only the test container against its dedicated volume.
    docker('rm', '-f', databases[0].container);
    containers.delete(databases[0].container);
    const restarted = await start(ROLES[0], databases[0].volume);
    assert.equal(sql(restarted.container, 'SELECT value FROM qualification_marker'), 'primary-changed');
    for (let i = 1; i < databases.length; i++) {
      assert.equal(sql(databases[i].container, 'SELECT value FROM qualification_marker'), baseline[i]);
    }
    process.stdout.write('PASS: four disposable PostgreSQL volumes; isolated real worktrees; no network or published ports; persistent test-only changes.\n');
  } catch (error) {
    exitCode = 1;
    process.stderr.write('Isolation qualification failed: ' + (error instanceof Error ? error.message : 'unknown') + '\n');
  } finally {
    // Cleanup is restricted to resource names allocated in THIS invocation.
    for (const container of [...containers].reverse()) {
      if (command('docker', ['rm', '-f', container], { allowFailure: true }) === null) {
        exitCode = 1;
        process.stderr.write('Disposable container cleanup failed.\n');
      }
    }
    for (const volume of [...volumes].reverse()) {
      if (command('docker', ['volume', 'rm', volume], { allowFailure: true }) === null) {
        exitCode = 1;
        process.stderr.write('Disposable volume cleanup failed.\n');
      }
    }
    if (tempRoot) rmSync(tempRoot, { force: true, recursive: true });
  }
  return exitCode;
}

process.exitCode = await main();
