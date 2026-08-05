import type {
  GitBranchMutationResult,
  GitCommitResult,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileDiff,
  GitFileLines,
  GitMutationConfirmation,
  GitMutationOperation,
  GitStashEntry,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import { createBranchOperations } from './git-service/branch-operations.js';
import { createCommitOperations } from './git-service/commit-operations.js';
import { GIT_MUTATION_CONFIRMATION_TTL_MS } from './git-service/constants.js';
import { createFileOperations } from './git-service/file-operations.js';
import { validateBranchName, validateMutationPath } from './git-service/mutation-guards.js';
import {
  getDiffSnapshot,
  getFileDiff,
  getFileLines,
  getOverview,
} from './git-service/read-operations.js';
import { createStashOperations } from './git-service/stash-operations.js';
import { GitMutationConfirmationService } from './git-mutation-confirmation-service.js';

export {
  GIT_DIFF_FILE_LIMIT,
  GIT_DIFF_LINES_LIMIT,
  GIT_MUTATION_CONFIRMATION_TTL_MS,
  GIT_BRANCH_NAME_PATTERN,
  SAVE_PREFIX_BY_BRANCH_TYPE,
} from './git-service/constants.js';
export { GitDiffError, GitMutationError } from './git-service/errors.js';
export type { GitMutationErrorCode } from './git-service/errors.js';
export { resolveSavePrefix } from './git-service/save-prefix.js';

export class GitService {
  /**
   * Mecanismo compartilhado de confirmação (`git-mutation-confirmation-service.ts`),
   * injetado em cada módulo de operações por domínio (branch/arquivo/commit/
   * stash) em vez de duplicado — mesma TTL e mesmo comportamento de antes.
   */
  private readonly confirmations = new GitMutationConfirmationService(GIT_MUTATION_CONFIRMATION_TTL_MS);
  private readonly branchOperations = createBranchOperations(this.confirmations);
  private readonly fileOperations = createFileOperations(this.confirmations);
  private readonly commitOperations = createCommitOperations(this.confirmations);
  private readonly stashOperations = createStashOperations(this.confirmations);

  public getOverview(projectPath: string): Promise<ProjectGitOverview> {
    return getOverview(projectPath);
  }

  public getDiffSnapshot(projectPath: string, scope: GitDiffScope = 'combined'): Promise<GitDiffSnapshot> {
    return getDiffSnapshot(projectPath, scope);
  }

  public getFileDiff(projectPath: string, requestedPath: string, scope: GitDiffScope = 'combined'): Promise<GitFileDiff> {
    return getFileDiff(projectPath, requestedPath, scope);
  }

  public getFileLines(
    projectPath: string,
    requestedPath: string,
    scope: GitDiffScope,
    start: number,
    end: number,
  ): Promise<GitFileLines> {
    return getFileLines(projectPath, requestedPath, scope, start, end);
  }

  public prepareMutationConfirmation(projectId: string, operation: GitMutationOperation, target: string): GitMutationConfirmation {
    if (operation === 'discard-file' || operation === 'remove-untracked-file') {
      validateMutationPath(target);
    } else {
      validateBranchName(target);
    }
    const { token, expiresAt } = this.confirmations.prepare(projectId, operation, target);
    return { token, operation, target, expiresAt };
  }

  public createBranch(projectPath: string, projectId: string, name: string, confirmationToken?: string): Promise<{ branch: string }> {
    return this.branchOperations.createBranch(projectPath, projectId, name, confirmationToken);
  }

  public switchBranch(projectPath: string, projectId: string, name: string, confirmationToken?: string): Promise<GitBranchMutationResult> {
    return this.branchOperations.switchBranch(projectPath, projectId, name, confirmationToken);
  }

  public pull(projectPath: string, projectId: string, confirmationToken?: string): Promise<GitBranchMutationResult> {
    return this.branchOperations.pull(projectPath, projectId, confirmationToken);
  }

  public push(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ branch: string }> {
    return this.branchOperations.push(projectPath, projectId, confirmationToken);
  }

  public stageFile(projectPath: string, requestedPath: string): Promise<{ path: string }> {
    return this.fileOperations.stageFile(projectPath, requestedPath);
  }

  public unstageFile(projectPath: string, requestedPath: string): Promise<{ path: string }> {
    return this.fileOperations.unstageFile(projectPath, requestedPath);
  }

  public discardFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    return this.fileOperations.discardFile(projectPath, projectId, requestedPath, confirmationToken);
  }

  public removeUntrackedFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    return this.fileOperations.removeUntrackedFile(projectPath, projectId, requestedPath, confirmationToken);
  }

  public commit(projectPath: string, projectId: string, message: string, includeAllChanges: boolean, confirmationToken?: string): Promise<GitCommitResult> {
    return this.commitOperations.commit(projectPath, projectId, message, includeAllChanges, confirmationToken);
  }

  public amend(projectPath: string, projectId: string, message: string, confirmationToken?: string): Promise<GitCommitResult> {
    return this.commitOperations.amend(projectPath, projectId, message, confirmationToken);
  }

  public save(projectPath: string, projectId: string, message: string, confirmationToken?: string): Promise<GitCommitResult> {
    return this.commitOperations.save(projectPath, projectId, message, confirmationToken);
  }

  public stashPush(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ stash: GitStashEntry }> {
    return this.stashOperations.stashPush(projectPath, projectId, confirmationToken);
  }

  public stashPop(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ popped: GitStashEntry }> {
    return this.stashOperations.stashPop(projectPath, projectId, confirmationToken);
  }
}
