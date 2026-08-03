import { randomBytes } from 'node:crypto';

import type {
  GitCommitResult,
  GitMutationConfirmation,
  GitMutationOperation,
} from '@dev-dashboard/contracts';

import {
  GIT_MUTATION_CONFIRMATION_TTL_MS,
  LOG_SEPARATOR,
} from './git-service/constants.js';
import {
  GitMutationError,
  GitService,
} from './git-service.js';
import {
  requireRepository,
  validateBranchName,
  validateCommitMessage,
} from './git-service/mutation-guards.js';
import { runGit } from './git-service/run.js';

interface StoredDashboardConfirmation {
  token: string;
  projectId: string;
  operation: 'create-branch' | 'commit' | 'amend';
  target: string;
  expiresAt: number;
}

function isDashboardOperation(
  operation: GitMutationOperation,
): operation is StoredDashboardConfirmation['operation'] {
  return operation === 'create-branch'
    || operation === 'commit'
    || operation === 'amend';
}

/**
 * Ajustes de política do dashboard sobre o serviço Git base.
 *
 * - criar uma branch a partir do HEAD atual mantém alterações locais, como o
 *   próprio `git switch --create` permite;
 * - confirmações de commit e amend continuam de uso único e vinculadas ao
 *   projeto/operação, sem depender de uma segunda leitura da branch atual.
 */
export class DashboardGitService extends GitService {
  private readonly dashboardConfirmations = new Map<
    string,
    StoredDashboardConfirmation
  >();

  public override prepareMutationConfirmation(
    projectId: string,
    operation: GitMutationOperation,
    target: string,
  ): GitMutationConfirmation {
    if (!isDashboardOperation(operation)) {
      return super.prepareMutationConfirmation(projectId, operation, target);
    }

    validateBranchName(target);
    this.pruneDashboardConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + GIT_MUTATION_CONFIRMATION_TTL_MS;
    this.dashboardConfirmations.set(token, {
      token,
      projectId,
      operation,
      target,
      expiresAt,
    });

    return {
      token,
      operation,
      target,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  private consumeDashboardConfirmation(
    projectId: string,
    operation: StoredDashboardConfirmation['operation'],
    token: string | undefined,
    expectedTarget?: string,
  ): void {
    this.pruneDashboardConfirmations();
    const record = token
      ? this.dashboardConfirmations.get(token)
      : undefined;
    const invalidTarget = expectedTarget !== undefined
      && record?.target !== expectedTarget;

    if (
      !record
      || record.projectId !== projectId
      || record.operation !== operation
      || invalidTarget
    ) {
      throw new GitMutationError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para esta operação.',
      );
    }

    this.dashboardConfirmations.delete(token!);
  }

  private pruneDashboardConfirmations(): void {
    const now = Date.now();
    for (const [token, record] of this.dashboardConfirmations) {
      if (record.expiresAt <= now) {
        this.dashboardConfirmations.delete(token);
      }
    }
  }

  public override async createBranch(
    projectPath: string,
    projectId: string,
    name: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(name);
    await requireRepository(projectPath);
    this.consumeDashboardConfirmation(
      projectId,
      'create-branch',
      confirmationToken,
      name,
    );

    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${name}`,
      ]);
      throw new GitMutationError(
        'GIT_BRANCH_EXISTS',
        'Já existe um branch com esse nome.',
      );
    } catch (error) {
      if (error instanceof GitMutationError) throw error;
      // show-ref falha quando a branch não existe — é o caminho esperado.
    }

    try {
      await runGit(projectPath, ['switch', '--create', name]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_BRANCH_INVALID',
        error instanceof Error ? error.message : 'Falha ao criar branch.',
      );
    }

    return { branch: name };
  }

  public override async commit(
    projectPath: string,
    projectId: string,
    message: string,
    includeAllChanges: boolean,
    confirmationToken?: string,
  ): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    this.consumeDashboardConfirmation(
      projectId,
      'commit',
      confirmationToken,
    );

    if (includeAllChanges) {
      await runGit(projectPath, ['add', '--update']);
    }

    const staged = await runGit(projectPath, [
      'diff',
      '--cached',
      '--name-only',
      '-z',
    ]);
    if (!staged.trim()) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        'Não há alterações staged para commitar.',
      );
    }

    try {
      await runGit(projectPath, ['commit', '-m', message]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        error instanceof Error ? error.message : 'Falha ao commitar.',
      );
    }

    return this.readLatestCommit(projectPath);
  }

  public override async amend(
    projectPath: string,
    projectId: string,
    message: string,
    confirmationToken?: string,
  ): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    this.consumeDashboardConfirmation(
      projectId,
      'amend',
      confirmationToken,
    );

    try {
      await runGit(projectPath, ['add', '.']);
      await runGit(projectPath, ['commit', '--amend', '-m', message]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        error instanceof Error
          ? error.message
          : 'Falha ao alterar o último commit.',
      );
    }

    return this.readLatestCommit(projectPath);
  }

  private async readLatestCommit(
    projectPath: string,
  ): Promise<GitCommitResult> {
    const log = await runGit(projectPath, [
      'log',
      '-1',
      `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s`,
    ]);
    const [hash = '', shortHash = '', subject = ''] = log
      .trim()
      .split(LOG_SEPARATOR);
    return { hash, shortHash, subject };
  }
}
