import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import {
  worktreeEnvironmentInstanceId,
  type DevelopmentEnvironmentInstanceStore,
} from '../store/development-environment-instance-store.js';
import type { GitWorktreeLifecycleService } from './git-worktree-lifecycle-service.js';
import type { GitWorktreeObserver } from './git-worktree-observer.js';

const MAX_SLUG_LENGTH = 72;
const SAFE_SEGMENT = /[^a-z0-9]+/gu;

export interface AgentTaskWorkspaceProvisioningInput {
  issueNumber: number;
  issueTitle: string;
}

export type AgentTaskWorkspaceProvisioningState =
  'ready' | 'blocked' | 'failed' | 'unverified';

export interface AgentTaskWorkspaceProvisioningResult {
  state: AgentTaskWorkspaceProvisioningState;
  branch: string;
  directoryName: string;
  environmentInstanceId?: string;
  worktreeId?: string;
  path?: string;
  reused?: boolean;
  diagnostic?: string;
}

type WorktreeLifecycle = Pick<GitWorktreeLifecycleService, 'create'>;
type WorktreeObserver = Pick<GitWorktreeObserver, 'inspect'>;
type EnvironmentStore = Pick<
  DevelopmentEnvironmentInstanceStore,
  'reconcileWorktrees'
>;

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(SAFE_SEGMENT, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/gu, '');
}

function projectDirectorySegment(project: Project): string {
  const segment = slugify(path.basename(path.resolve(project.path)));
  return segment || 'project';
}

export function agentTaskWorkspaceNames(
  project: Project,
  input: AgentTaskWorkspaceProvisioningInput,
): { branch: string; directoryName: string } {
  if (!Number.isSafeInteger(input.issueNumber) || input.issueNumber <= 0) {
    throw new Error('Agent task issue number is invalid.');
  }

  const title = slugify(input.issueTitle) || 'task';
  return {
    branch: `feature/${input.issueNumber}-${title}`,
    directoryName: `${projectDirectorySegment(project)}-agent-${input.issueNumber}`,
  };
}

export class AgentTaskWorkspaceProvisioningService {
  public constructor(
    private readonly lifecycle: WorktreeLifecycle,
    private readonly observer: WorktreeObserver,
    private readonly environmentStore: EnvironmentStore,
  ) {}

  public async provision(
    project: Project,
    input: AgentTaskWorkspaceProvisioningInput,
  ): Promise<AgentTaskWorkspaceProvisioningResult> {
    let names: { branch: string; directoryName: string };
    try {
      names = agentTaskWorkspaceNames(project, input);
    } catch {
      return {
        state: 'blocked',
        branch: '',
        directoryName: '',
        diagnostic:
          'A issue não possui identidade válida para provisionar o workspace.',
      };
    }

    const created = await this.lifecycle.create(project, {
      branch: names.branch,
      directoryName: names.directoryName,
      createBranch: true,
      reuseBranch: true,
    });
    if (created.state !== 'created' && created.state !== 'already-present') {
      return {
        state:
          created.state === 'blocked'
            ? 'blocked'
            : created.state === 'failed'
              ? 'failed'
              : 'unverified',
        ...names,
        path: created.path,
        ...(created.diagnostic ? { diagnostic: created.diagnostic } : {}),
      };
    }

    const inspection = await this.observer.inspect(project);
    if (inspection.state !== 'ready') {
      return {
        state: 'unverified',
        ...names,
        path: created.path,
        diagnostic:
          'O worktree foi criado ou reutilizado, mas não pôde ser reconciliado com segurança.',
      };
    }

    const worktree = inspection.worktrees.find(
      (candidate) =>
        candidate.kind === 'linked' &&
        candidate.branch === names.branch &&
        path.normalize(candidate.path) === path.normalize(created.path),
    );
    if (!worktree) {
      return {
        state: 'unverified',
        ...names,
        path: created.path,
        diagnostic:
          'O worktree esperado não apareceu no snapshot confirmado após o provisionamento.',
      };
    }

    const instances = this.environmentStore.reconcileWorktrees(
      project.id,
      inspection.worktrees,
    );
    const environmentInstanceId = worktreeEnvironmentInstanceId(
      project.id,
      worktree.id,
    );
    const environment = instances.find(
      (candidate) => candidate.id === environmentInstanceId,
    );
    if (!environment || environment.lifecycle === 'degraded') {
      return {
        state: 'unverified',
        ...names,
        path: worktree.path,
        worktreeId: worktree.id,
        diagnostic:
          'A Environment Instance do worktree não pôde ser confirmada após o provisionamento.',
      };
    }

    return {
      state: 'ready',
      ...names,
      environmentInstanceId,
      worktreeId: worktree.id,
      path: worktree.path,
      reused: created.state === 'already-present',
    };
  }
}
