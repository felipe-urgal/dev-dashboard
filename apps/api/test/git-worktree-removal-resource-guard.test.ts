import assert from 'node:assert/strict';
import test from 'node:test';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

import { GitWorktreeRemovalResourceGuardService } from '../src/services/git-worktree-removal-resource-guard.js';
import {
  DevelopmentEnvironmentInstanceStore,
  primaryEnvironmentInstanceId,
  worktreeEnvironmentInstanceId,
} from '../src/store/development-environment-instance-store.js';
import { ProjectStore } from '../src/store/project-store.js';

const PROJECT_ID = 'project-a';
const WORKTREE_ID = 'worktree-0123456789abcdefabcd';
const WORKTREE_PATH = '/workspace/project-a-feature';

function project(): Project {
  return {
    id: PROJECT_ID,
    workspaceId: 'workspace-a',
    name: 'Projeto A',
    path: '/workspace/project-a',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['git'],
  };
}

function setup() {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/workspace',
    projects: [project()],
    warnings: [],
  });
  const environmentStore = new DevelopmentEnvironmentInstanceStore(
    projectStore,
  );
  environmentStore.reconcileWorktrees(PROJECT_ID, [
    {
      id: WORKTREE_ID,
      path: WORKTREE_PATH,
      kind: 'linked',
    },
  ]);

  const environmentInstanceId = worktreeEnvironmentInstanceId(
    PROJECT_ID,
    WORKTREE_ID,
  );
  let processes: ManagedProcess[] = [];
  let terminalSessions = 0;

  const guard = new GitWorktreeRemovalResourceGuardService({
    processManager: {
      listProcesses: async () => processes,
    },
    projectStore,
    developmentEnvironmentInstanceStore: environmentStore,
    projectTerminalService: {
      status: (_project, kind, executionContext) => ({
        kind,
        environmentInstanceId: executionContext?.environmentInstanceId,
        supported: true,
        activeSessions: terminalSessions,
        message: 'ok',
      }),
    },
  });

  return {
    guard,
    environmentStore,
    environmentInstanceId,
    setProcesses(next: ManagedProcess[]) {
      processes = next;
    },
    setTerminalSessions(next: number) {
      terminalSessions = next;
    },
  };
}

test('guard permite remoção quando somente recursos inativos ou de outra Environment Instance existem', async () => {
  const fixture = setup();
  fixture.setProcesses([
    {
      id: 'stopped-owned',
      projectId: PROJECT_ID,
      environmentInstanceId: fixture.environmentInstanceId,
      kind: 'server',
      status: 'stopped',
    },
    {
      id: 'running-primary',
      projectId: PROJECT_ID,
      environmentInstanceId: primaryEnvironmentInstanceId(PROJECT_ID),
      kind: 'worker',
      status: 'running',
    },
  ]);

  assert.deepEqual(await fixture.guard.inspect(fixture.environmentInstanceId), {
    safe: true,
  });
  await assert.doesNotReject(() =>
    fixture.guard.cleanupRemoved(fixture.environmentInstanceId),
  );
});

test('guard bloqueia processo ativo da Environment Instance e processo legado sem ownership', async () => {
  const fixture = setup();
  fixture.setProcesses([
    {
      id: 'running-owned',
      projectId: PROJECT_ID,
      environmentInstanceId: fixture.environmentInstanceId,
      kind: 'server',
      status: 'running',
    },
  ]);

  const owned = await fixture.guard.inspect(fixture.environmentInstanceId);
  assert.equal(owned.safe, false);
  assert.match(owned.diagnostic ?? '', /processo gerenciado ativo/i);

  fixture.setProcesses([
    {
      id: 'running-legacy',
      projectId: PROJECT_ID,
      kind: 'server',
      status: 'running',
    },
  ]);
  const legacy = await fixture.guard.inspect(fixture.environmentInstanceId);
  assert.equal(legacy.safe, false);
  assert.match(legacy.diagnostic ?? '', /sem Environment Instance/i);
});

test('guard bloqueia terminal ativo e runtime cujo cleanup ainda não é suportado', async () => {
  const fixture = setup();
  fixture.setTerminalSessions(1);

  const terminal = await fixture.guard.inspect(fixture.environmentInstanceId);
  assert.equal(terminal.safe, false);
  assert.match(terminal.diagnostic ?? '', /terminal ativa/i);

  fixture.setTerminalSessions(0);
  const instance = fixture.environmentStore.findById(
    fixture.environmentInstanceId,
  );
  assert.ok(instance);
  fixture.environmentStore.upsert({
    ...instance,
    runtime: { kind: 'devcontainer', runtimeId: 'container-1' },
  });

  const devcontainer = await fixture.guard.inspect(
    fixture.environmentInstanceId,
  );
  assert.equal(devcontainer.safe, false);
  assert.match(devcontainer.diagnostic ?? '', /runtime associado/i);
});
