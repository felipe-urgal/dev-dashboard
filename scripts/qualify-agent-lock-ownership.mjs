#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

import { AgentTaskLockManager } from '../packages/agent-runtime/dist/index.js';

const OPT_IN = 'AGENT_LOCK_QUALIFY';
const TIMEOUT_MS = 15_000;
const TARGET_A = 'physical-target-a';
const TARGET_B = 'physical-target-b';

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 16 * 1024,
    shell: false,
  }).trim();
}

async function initRepository(root, name) {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  git(directory, 'init', '-q', '-b', 'main');
  git(directory, 'config', 'user.name', 'Agent Lock Qualification');
  git(directory, 'config', 'user.email', 'qualification@example.invalid');
  await fs.writeFile(path.join(directory, 'README.md'), 'Disposable qualification repository.\n');
  git(directory, 'add', '--', 'README.md');
  git(directory, 'commit', '-q', '-m', 'init disposable fixture');
  assert.equal(git(directory, 'rev-parse', '--show-toplevel'), directory);
  return directory;
}

async function childMain(stateDirectory, key, waitFlag) {
  if (![TARGET_A, TARGET_B].includes(key) ||
      !['wait', 'reject'].includes(waitFlag) ||
      !path.isAbsolute(stateDirectory)) {
    return 2;
  }

  // The actual Git check runs inside each spawned process, not only the
  // orchestrating test. Each process has its own checkout working directory.
  git(process.cwd(), 'rev-parse', '--is-inside-work-tree');
  const manager = new AgentTaskLockManager({ stateDirectory });
  try {
    const release = await manager.acquire(key, {
      wait: waitFlag === 'wait',
      timeoutMs: TIMEOUT_MS,
      pollMs: 25,
    });
    process.stdout.write(JSON.stringify({ event: 'acquired' }) + '\n');
    await new Promise((resolve) => process.stdin.once('data', resolve));
    await release();
    return 0;
  } catch (error) {
    if (error?.code === 'AGENT_TASK_LOCKED') {
      process.stdout.write(JSON.stringify({ event: 'blocked' }) + '\n');
      return 0;
    }
    // No raw exceptions or local paths in qualification output.
    process.stdout.write(JSON.stringify({ event: 'failure' }) + '\n');
    return 1;
  }
}

function launchWorker(cwd, stateDirectory, key, waitFlag) {
  const child = spawn(
    process.execPath,
    [process.argv[1], '--worker', stateDirectory, key, waitFlag],
    { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], shell: false },
  );
  const lineReader = createInterface({ input: child.stdout });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Agent lock worker event timed out.')),
      TIMEOUT_MS,
    );
    const clear = () => clearTimeout(timeout);
    child.once('error', (error) => {
      clear();
      reject(error);
    });
    child.once('exit', (code) => {
      clear();
      reject(new Error('Agent lock worker exited before reporting (code ' + code + ').'));
    });
    lineReader.once('line', (line) => {
      clear();
      try {
        const value = JSON.parse(line);
        assert.ok(['acquired', 'blocked', 'failure'].includes(value.event));
        resolve(value.event);
      } catch {
        reject(new Error('Invalid worker qualification event.'));
      }
    });
  });
  return { child, ready };
}

async function stopWorker(worker) {
  const child = worker.child;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

async function releaseWorker(worker) {
  if (!worker.child.stdin.writable) throw new Error('Lock owner is unavailable.');
  const exited = new Promise((resolve) => worker.child.once('exit', resolve));
  worker.child.stdin.write('release\n');
  const code = await exited;
  assert.equal(code, 0, 'Lock owner release must exit successfully.');
}

async function qualify() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dd-agent-lock-'));
  const workers = [];
  try {
    const [repoA, repoB] = await Promise.all([
      initRepository(root, 'repo-a'),
      initRepository(root, 'repo-b'),
    ]);
    assert.notEqual(repoA, repoB);
    const state = path.join(root, 'locks-state');

    const ownerA = launchWorker(repoA, state, TARGET_A, 'reject');
    workers.push(ownerA);
    assert.equal(await ownerA.ready, 'acquired');

    const contenderA = launchWorker(repoA, state, TARGET_A, 'reject');
    workers.push(contenderA);
    assert.equal(await contenderA.ready, 'blocked');

    const ownerB = launchWorker(repoB, state, TARGET_B, 'reject');
    workers.push(ownerB);
    assert.equal(await ownerB.ready, 'acquired');

    // Two different repository targets must physically hold locks at once.
    const [lockA, lockB] = await Promise.all([
      fs.readFile(path.join(state, 'locks', TARGET_A + '.json'), 'utf8'),
      fs.readFile(path.join(state, 'locks', TARGET_B + '.json'), 'utf8'),
    ]);
    assert.notEqual(JSON.parse(lockA).processId, JSON.parse(lockB).processId);

    const waiterA = launchWorker(repoA, state, TARGET_A, 'wait');
    workers.push(waiterA);
    const beforeRelease = await Promise.race([
      waiterA.ready.then(() => 'acquired-too-early'),
      delay(350).then(() => 'blocked-until-release'),
    ]);
    assert.equal(beforeRelease, 'blocked-until-release');

    await releaseWorker(ownerA);
    assert.equal(await waiterA.ready, 'acquired');

    // SIGKILL simulates an abrupt process death, leaving the ownership file.
    await stopWorker(waiterA);
    const recoveredA = launchWorker(repoA, state, TARGET_A, 'reject');
    workers.push(recoveredA);
    assert.equal(await recoveredA.ready, 'acquired');
    await releaseWorker(recoveredA);
    await releaseWorker(ownerB);

    process.stdout.write(
      JSON.stringify({
        version: 1,
        fixture: 'real-git-repositories-and-node-processes',
        repositoryCount: 2,
        sameTargetImmediateConflict: 'passed',
        differentTargetsParallel: 'passed',
        sameTargetWaitAndRelease: 'passed',
        abandonedPidRecovery: 'passed',
        providerQualification: 'not-executed',
      }) + '\n',
    );
    return 0;
  } finally {
    await Promise.allSettled(workers.map(stopWorker));
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (process.env[OPT_IN] !== '1') {
  process.stderr.write('Physical qualification requires AGENT_LOCK_QUALIFY=1.\n');
  process.exitCode = 2;
} else if (process.argv[2] === '--worker') {
  const [, , , stateDirectory, key, waitFlag] = process.argv;
  process.exitCode = await childMain(stateDirectory, key, waitFlag);
} else if (process.argv.length !== 2) {
  process.stderr.write('No user-provided target paths are supported.\n');
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await qualify();
  } catch {
    process.stderr.write('Physical Agent lock qualification failed.\n');
    process.exitCode = 1;
  }
}
