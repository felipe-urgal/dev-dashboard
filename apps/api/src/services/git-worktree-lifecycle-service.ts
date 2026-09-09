import { randomBytes } from 'node:crypto';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import { worktreeEnvironmentInstanceId } from '../store/development-environment-instance-store.js';
import {
  GitWorktreeObserver,
  type GitWorktreeCommandRunner,
  type GitWorktreeSnapshot,
} from './git-worktree-observer.js';
import { runGit } from './shared/run-git.js';

const COMMAND_TIMEOUT_MS = 10_000;
const COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_BRANCH_LENGTH = 256;
const MAX_DIRECTORY_NAME_LENGTH = 160;
const REMOVAL_CONFIRMATION_TTL_MS = 60_000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const SAFE_WORKTREE_ID = /^worktree-[0-9a-f]{20}$/u;

export interface CreateGitWorktreeInput {
  branch: string;
  directoryName: string;
  createBranch?: boolean;
}

export type CreateGitWorktreeState =
  | 'created'
  | 'already-present'
  | 'blocked'
  | 'failed'
  | 'unverified';

export interface CreateGitWorktreeResult {
  state: CreateGitWorktreeState;
  path: string;
  branch: string;
  worktree?: GitWorktreeSnapshot;
  diagnostic?: string;
}

export interface PrepareGitWorktreeRemovalResult {
  state: 'ready' | 'blocked' | 'not-found';
  worktreeId: string;
  environmentInstanceId?: string;
  path?: string;
  branch?: string;
  confirmationToken?: string;
  expiresAt?: string;
  diagnostic?: string;
}

export interface RemoveGitWorktreeInput {
  worktreeId: string;
  confirmationToken: string;
}

export type RemoveGitWorktreeState =
  | 'removed'
  | 'already-absent'
  | 'blocked'
  | 'failed'
  | 'unverified'
  | 'cleanup-required';

export interface RemoveGitWorktreeResult {
  state: RemoveGitWorktreeState;
  worktreeId: string;
  environmentInstanceId?: string;
  path?: string;
  branch?: string;
  diagnostic?: string;
}

export interface GitWorktreeRemovalResourceGuardResult {
  safe: boolean;
  diagnostic?: string;
}

/**
 * A remoção de worktree não ganha autoridade para limpar recursos de outros
 * domínios. O caller precisa fornecer um guard que prove ausência de recursos
 * ativos e faça cleanup somente pela mesma Environment Instance.
 */
export interface GitWorktreeRemovalResourceGuard {
  inspect(
    environmentInstanceId: string,
  ): Promise<GitWorktreeRemovalResourceGuardResult>;
  cleanupRemoved(environmentInstanceId: string): Promise<void>;
}

export interface GitWorktreeLifecycleServiceOptions {
  removalResourceGuard?: GitWorktreeRemovalResourceGuard;
  now?: () => number;
  createConfirmationToken?: () => string;
}

interface RemovalConfirmationRecord {
  token: string;
  projectId: string;
  worktreeId: string;
  environmentInstanceId: string;
  path: string;
  head: string;
  branch?: string;
  expiresAt: number;
}

const failClosedRemovalResourceGuard: GitWorktreeRemovalResourceGuard = {
  async inspect() {
    return {
      safe: false,
      diagnostic:
        'A ownership dos recursos deste ambiente não pôde ser confirmada para remoção.',
    };
  },
  async cleanupRemoved() {
    throw new Error('Cleanup de ownership não configurado.');
  },
};

function defaultRunner(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  return runGit(projectPath, args, {
    timeoutMs: COMMAND_TIMEOUT_MS,
    maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
  });
}

function normalizeBranch(value: string): string | undefined {
  const branch = value.trim();
  if (
    !branch ||
    branch.length > MAX_BRANCH_LENGTH ||
    branch.startsWith('-') ||
    CONTROL_CHARACTERS.test(branch)
  ) {
    return undefined;
  }
  return branch;
}

function normalizeDirectoryName(value: string): string | undefined {
  const directoryName = value.trim();
  if (
    !directoryName ||
    directoryName === '.' ||
    directoryName === '..' ||
    directoryName.length > MAX_DIRECTORY_NAME_LENGTH ||
    CONTROL_CHARACTERS.test(directoryName) ||
    path.isAbsolute(directoryName) ||
    directoryName.includes('/') ||
    directoryName.includes('\\')
  ) {
    return undefined;
  }
  return directoryName;
}

function normalizeWorktreeId(value: string): string | undefined {
  const worktreeId = value.trim();
  return SAFE_WORKTREE_ID.test(worktreeId) ? worktreeId : undefined;
}

function targetPathFor(project: Project, directoryName: string): string {
  return path.join(path.dirname(path.resolve(project.path)), directoryName);
}

function isManagedLinkedWorktree(
  project: Project,
  worktree: GitWorktreeSnapshot,
): boolean {
  const projectPath = path.resolve(project.path);
  const worktreePath = path.resolve(worktree.path);
  return (
    worktree.kind === 'linked' &&
    !worktree.bare &&
    worktreePath !== projectPath &&
    path.dirname(worktreePath) === path.dirname(projectPath)
  );
}

function blocked(
  targetPath: string,
  branch: string,
  diagnostic: string,
): CreateGitWorktreeResult {
  return { state: 'blocked', path: targetPath, branch, diagnostic };
}

export class GitWorktreeLifecycleService {
  private readonly observer: GitWorktreeObserver;
  private readonly removalResourceGuard: GitWorktreeRemovalResourceGuard;
  private readonly now: () => number;
  private readonly createConfirmationToken: () => string;
  private readonly removalConfirmations = new Map<
    string,
    RemovalConfirmationRecord
  >();

  public constructor(
    private readonly runCommand: GitWorktreeCommandRunner = defaultRunner,
    observer?: GitWorktreeObserver,
    options: GitWorktreeLifecycleServiceOptions = {},
  ) {
    this.observer = observer ?? new GitWorktreeObserver(runCommand);
    this.removalResourceGuard =
      options.removalResourceGuard ?? failClosedRemovalResourceGuard;
    this.now = options.now ?? Date.now;
    this.createConfirmationToken =
      options.createConfirmationToken ??
      (() => randomBytes(32).toString('hex'));
  }

  public async create(
    project: Project,
    input: CreateGitWorktreeInput,
  ): Promise<CreateGitWorktreeResult> {
    const branch = normalizeBranch(input.branch);
    const directoryName = normalizeDirectoryName(input.directoryName);
    const fallbackPath = path.dirname(path.resolve(project.path));

    if (!branch) {
      return blocked(
        fallbackPath,
        input.branch.trim(),
        'A branch informada não pode ser usada para criar um worktree.',
      );
    }
    if (!directoryName) {
      return blocked(
        fallbackPath,
        branch,
        'O diretório do worktree precisa ser um nome simples ao lado do projeto.',
      );
    }

    const targetPath = targetPathFor(project, directoryName);
    const before = await this.observer.inspect(project);
    if (before.state !== 'ready') {
      return blocked(
        targetPath,
        branch,
        'O estado atual dos worktrees não pôde ser confirmado com segurança.',
      );
    }

    const atTarget = before.worktrees.find(
      (worktree) =>
        path.normalize(worktree.path) === path.normalize(targetPath),
    );
    if (atTarget) {
      if (atTarget.branch === branch) {
        return {
          state: 'already-present',
          path: targetPath,
          branch,
          worktree: atTarget,
        };
      }
      return blocked(
        targetPath,
        branch,
        'Já existe outro worktree usando o diretório escolhido.',
      );
    }

    const branchInUse = before.worktrees.find(
      (worktree) => worktree.branch === branch,
    );
    if (branchInUse) {
      return blocked(
        targetPath,
        branch,
        'A branch já está vinculada a outro worktree.',
      );
    }

    try {
      await this.runCommand(project.path, [
        'check-ref-format',
        '--branch',
        branch,
      ]);
    } catch {
      return blocked(
        targetPath,
        branch,
        'A branch informada não possui um nome aceito pelo Git.',
      );
    }

    const args = input.createBranch
      ? ['worktree', 'add', '-b', branch, '--', targetPath]
      : ['worktree', 'add', '--', targetPath, branch];

    try {
      await this.runCommand(project.path, args);
    } catch {
      return {
        state: 'failed',
        path: targetPath,
        branch,
        diagnostic:
          'Git não conseguiu criar o worktree. Verifique se a branch e o diretório ainda estão disponíveis.',
      };
    }

    const after = await this.observer.inspect(project);
    if (after.state !== 'ready') {
      return {
        state: 'unverified',
        path: targetPath,
        branch,
        diagnostic:
          'O comando foi executado, mas o novo worktree não pôde ser confirmado com segurança.',
      };
    }

    const created = after.worktrees.find(
      (worktree) =>
        path.normalize(worktree.path) === path.normalize(targetPath),
    );
    if (!created || created.branch !== branch) {
      return {
        state: 'unverified',
        path: targetPath,
        branch,
        diagnostic:
          'O Git respondeu ao comando, mas o worktree esperado não apareceu no snapshot confirmado.',
      };
    }

    return {
      state: 'created',
      path: targetPath,
      branch,
      worktree: created,
    };
  }

  public async prepareRemoval(
    project: Project,
    worktreeIdInput: string,
  ): Promise<PrepareGitWorktreeRemovalResult> {
    this.sweepRemovalConfirmations();
    const worktreeId = normalizeWorktreeId(worktreeIdInput);
    if (!worktreeId) {
      return {
        state: 'blocked',
        worktreeId: worktreeIdInput.trim(),
        diagnostic: 'A identidade do worktree é inválida para remoção.',
      };
    }

    const inspected = await this.observer.inspect(project);
    if (inspected.state !== 'ready') {
      return {
        state: 'blocked',
        worktreeId,
        diagnostic:
          'O estado atual dos worktrees não pôde ser confirmado com segurança.',
      };
    }

    const worktree = inspected.worktrees.find((item) => item.id === worktreeId);
    if (!worktree) return { state: 'not-found', worktreeId };

    const preflightDiagnostic = await this.removalPreflight(project, worktree);
    if (preflightDiagnostic) {
      return {
        state: 'blocked',
        worktreeId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic: preflightDiagnostic,
      };
    }

    const environmentInstanceId = worktreeEnvironmentInstanceId(
      project.id,
      worktree.id,
    );
    const ownership = await this.inspectRemovalOwnership(environmentInstanceId);
    if (!ownership.safe) {
      return {
        state: 'blocked',
        worktreeId,
        environmentInstanceId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic:
          ownership.diagnostic ??
          'Existem recursos do ambiente que impedem a remoção segura do worktree.',
      };
    }

    const token = this.createConfirmationToken();
    const expiresAt = this.now() + REMOVAL_CONFIRMATION_TTL_MS;
    this.removalConfirmations.set(token, {
      token,
      projectId: project.id,
      worktreeId,
      environmentInstanceId,
      path: worktree.path,
      head: worktree.head,
      ...(worktree.branch ? { branch: worktree.branch } : {}),
      expiresAt,
    });

    return {
      state: 'ready',
      worktreeId,
      environmentInstanceId,
      path: worktree.path,
      ...(worktree.branch ? { branch: worktree.branch } : {}),
      confirmationToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async remove(
    project: Project,
    input: RemoveGitWorktreeInput,
  ): Promise<RemoveGitWorktreeResult> {
    this.sweepRemovalConfirmations();
    const worktreeId = normalizeWorktreeId(input.worktreeId);
    const token = input.confirmationToken.trim();
    const record = token ? this.removalConfirmations.get(token) : undefined;

    if (
      !worktreeId ||
      !record ||
      record.projectId !== project.id ||
      record.worktreeId !== worktreeId
    ) {
      return {
        state: 'blocked',
        worktreeId: worktreeId ?? input.worktreeId.trim(),
        diagnostic: 'A confirmação de remoção está ausente, inválida ou expirada.',
      };
    }
    this.removalConfirmations.delete(token);

    const inspected = await this.observer.inspect(project);
    if (inspected.state !== 'ready') {
      return {
        state: 'blocked',
        worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: record.path,
        ...(record.branch ? { branch: record.branch } : {}),
        diagnostic:
          'O estado atual dos worktrees não pôde ser revalidado antes da remoção.',
      };
    }

    const worktree = inspected.worktrees.find((item) => item.id === worktreeId);
    if (!worktree) {
      const ownership = await this.inspectRemovalOwnership(
        record.environmentInstanceId,
      );
      if (!ownership.safe) {
        return {
          state: 'blocked',
          worktreeId,
          environmentInstanceId: record.environmentInstanceId,
          path: record.path,
          ...(record.branch ? { branch: record.branch } : {}),
          diagnostic:
            ownership.diagnostic ??
            'A origem já não existe, mas o cleanup do ambiente ainda não é seguro.',
        };
      }
      return this.cleanupRemovedEnvironment(record, 'already-absent');
    }

    if (
      worktree.path !== record.path ||
      worktree.head !== record.head ||
      worktree.branch !== record.branch
    ) {
      return {
        state: 'blocked',
        worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic:
          'O worktree mudou desde a confirmação. Revise o estado atual antes de remover.',
      };
    }

    const preflightDiagnostic = await this.removalPreflight(project, worktree);
    if (preflightDiagnostic) {
      return {
        state: 'blocked',
        worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic: preflightDiagnostic,
      };
    }

    const ownership = await this.inspectRemovalOwnership(
      record.environmentInstanceId,
    );
    if (!ownership.safe) {
      return {
        state: 'blocked',
        worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic:
          ownership.diagnostic ??
          'Existem recursos do ambiente que impedem a remoção segura do worktree.',
      };
    }

    try {
      await this.runCommand(project.path, [
        'worktree',
        'remove',
        '--',
        worktree.path,
      ]);
    } catch {
      return {
        state: 'failed',
        worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic:
          'Git não conseguiu remover o worktree após a revalidação. Revise o estado atual e tente novamente.',
      };
    }

    const after = await this.observer.inspect(project);
    if (after.state !== 'ready') {
      return {
        state: 'unverified',
        worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic:
          'O comando foi executado, mas a remoção do worktree não pôde ser confirmada com segurança.',
      };
    }
    if (after.worktrees.some((item) => item.id === worktreeId)) {
      return {
        state: 'unverified',
        worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: worktree.path,
        ...(worktree.branch ? { branch: worktree.branch } : {}),
        diagnostic:
          'O Git respondeu ao comando, mas o worktree ainda aparece no snapshot confirmado.',
      };
    }

    return this.cleanupRemovedEnvironment(record, 'removed');
  }

  private async removalPreflight(
    project: Project,
    worktree: GitWorktreeSnapshot,
  ): Promise<string | undefined> {
    if (!isManagedLinkedWorktree(project, worktree)) {
      return 'Somente linked worktrees irmãos do checkout principal podem ser removidos por este lifecycle.';
    }
    if (worktree.locked) {
      return 'O worktree está locked no Git e não pode ser removido por este fluxo.';
    }
    if (worktree.prunable) {
      return 'O worktree está prunable e precisa ser reconciliado antes da remoção estruturada.';
    }

    try {
      const status = await this.runCommand(worktree.path, [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
      ]);
      if (status.length > 0) {
        return 'O worktree possui alterações locais. Faça commit, descarte ou mova as alterações antes de remover.';
      }
    } catch {
      return 'O estado dirty/clean do worktree não pôde ser confirmado com segurança.';
    }

    return undefined;
  }

  private async inspectRemovalOwnership(
    environmentInstanceId: string,
  ): Promise<GitWorktreeRemovalResourceGuardResult> {
    try {
      return await this.removalResourceGuard.inspect(environmentInstanceId);
    } catch {
      return {
        safe: false,
        diagnostic:
          'A ownership dos recursos deste ambiente não pôde ser confirmada para remoção.',
      };
    }
  }

  private async cleanupRemovedEnvironment(
    record: RemovalConfirmationRecord,
    successState: 'removed' | 'already-absent',
  ): Promise<RemoveGitWorktreeResult> {
    try {
      await this.removalResourceGuard.cleanupRemoved(
        record.environmentInstanceId,
      );
    } catch {
      return {
        state: 'cleanup-required',
        worktreeId: record.worktreeId,
        environmentInstanceId: record.environmentInstanceId,
        path: record.path,
        ...(record.branch ? { branch: record.branch } : {}),
        diagnostic:
          'O worktree já não existe, mas o cleanup dos recursos pertencentes ao ambiente não pôde ser concluído.',
      };
    }

    return {
      state: successState,
      worktreeId: record.worktreeId,
      environmentInstanceId: record.environmentInstanceId,
      path: record.path,
      ...(record.branch ? { branch: record.branch } : {}),
    };
  }

  private sweepRemovalConfirmations(): void {
    const now = this.now();
    for (const [token, record] of this.removalConfirmations) {
      if (record.expiresAt <= now) this.removalConfirmations.delete(token);
    }
  }
}
