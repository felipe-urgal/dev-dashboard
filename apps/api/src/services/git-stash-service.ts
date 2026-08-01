import { randomBytes } from 'node:crypto';

import type {
  GitStashConfirmation,
  GitStashCreateInput,
  GitStashDetail,
  GitStashMutationResult,
  GitStashOperation,
  GitStashSummary,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import { CONFIRMATION_TTL_MS, CONFLICT_PATTERN, PATCH_LIMIT } from './git-stash/constants.js';
import { GitStashError } from './git-stash/errors.js';
import { filesFor, parseReferences, summaryFor, type ParsedStashReference } from './git-stash/reference-parsing.js';
import {
  currentBranch,
  requireCleanWorkingTree,
  requireRepository,
  rollbackWorkingTree,
} from './git-stash/repository-guards.js';
import { failureText, runGit } from './git-stash/run.js';
import { validateCreateInput, validateReference } from './git-stash/validation.js';

export { GitStashError } from './git-stash/errors.js';
export type { GitStashErrorCode } from './git-stash/errors.js';

interface StoredConfirmation {
  token: string;
  projectId: string;
  operation: GitStashOperation;
  target: string;
  expiresAt: number;
}

export class GitStashService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public async list(projectPath: string): Promise<GitStashSummary[]> {
    await requireRepository(projectPath);
    const references = await parseReferences(projectPath);
    return Promise.all(references.map((reference) => summaryFor(projectPath, reference)));
  }

  public async inspect(projectPath: string, reference: string): Promise<GitStashDetail> {
    validateReference(reference);
    await requireRepository(projectPath);
    const parsed = await this.requireStash(projectPath, reference);
    const [summary, files, rawPatch] = await Promise.all([
      summaryFor(projectPath, parsed),
      filesFor(projectPath, reference),
      runGit(projectPath, [
        'stash',
        'show',
        '--include-untracked',
        '--patch',
        '--no-ext-diff',
        reference,
      ]),
    ]);
    const truncated = rawPatch.length > PATCH_LIMIT;
    const visiblePatch = truncated ? rawPatch.slice(0, PATCH_LIMIT) : rawPatch;
    const masked = maskSensitiveLogContent(visiblePatch);
    return {
      ...summary,
      files,
      patch: masked.content,
      truncated,
      masked: masked.masked,
      redactionCount: masked.redactionCount,
    };
  }

  public prepareConfirmation(
    projectId: string,
    operation: GitStashOperation,
    target: string,
  ): GitStashConfirmation {
    if (operation !== 'create') validateReference(target);
    if (operation === 'create' && (!target || target.length > 200)) {
      throw new GitStashError(
        'GIT_STASH_REFERENCE_INVALID',
        'Branch atual inválida para criar o stash.',
      );
    }
    this.pruneExpiredConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
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

  public async create(
    projectPath: string,
    projectId: string,
    input: GitStashCreateInput,
    confirmationToken?: string,
  ): Promise<GitStashMutationResult> {
    const validated = validateCreateInput(input);
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    this.consumeConfirmation(projectId, 'create', branch, confirmationToken);

    const status = await runGit(projectPath, [
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
    ]);
    const records = status.split('\0').filter(Boolean);
    const hasTrackedChanges = records.some((record) =>
      record.startsWith('1 ') || record.startsWith('2 ') || record.startsWith('u '),
    );
    const hasUntrackedChanges = records.some((record) => record.startsWith('? '));
    if (!hasTrackedChanges && !(validated.includeUntracked && hasUntrackedChanges)) {
      throw new GitStashError(
        'GIT_NOTHING_TO_STASH',
        validated.includeUntracked
          ? 'Não há alterações para guardar no stash.'
          : 'Não há alterações rastreadas para guardar. Ative a inclusão de arquivos não rastreados.',
      );
    }

    const args = ['stash', 'push'];
    if (validated.includeUntracked) args.push('--include-untracked');
    if (validated.keepIndex) args.push('--keep-index');
    if (validated.message) args.push('--message', validated.message);

    try {
      await runGit(projectPath, args);
    } catch (error) {
      throw new GitStashError('GIT_STASH_PUSH_FAILED', failureText(error));
    }

    const created = (await this.list(projectPath))[0];
    if (!created) {
      throw new GitStashError(
        'GIT_STASH_PUSH_FAILED',
        'O stash foi criado, mas não foi encontrado na listagem.',
      );
    }
    return { stash: created, applied: false, removed: false };
  }

  public async apply(
    projectPath: string,
    projectId: string,
    reference: string,
    confirmationToken?: string,
  ): Promise<GitStashMutationResult> {
    return this.restore(
      projectPath,
      projectId,
      reference,
      'apply',
      confirmationToken,
    );
  }

  public async pop(
    projectPath: string,
    projectId: string,
    reference: string,
    confirmationToken?: string,
  ): Promise<GitStashMutationResult> {
    return this.restore(
      projectPath,
      projectId,
      reference,
      'pop',
      confirmationToken,
    );
  }

  public async drop(
    projectPath: string,
    projectId: string,
    reference: string,
    confirmationToken?: string,
  ): Promise<GitStashMutationResult> {
    validateReference(reference);
    await requireRepository(projectPath);
    this.consumeConfirmation(projectId, 'drop', reference, confirmationToken);
    const parsed = await this.requireStash(projectPath, reference);
    const stash = await summaryFor(projectPath, parsed);
    try {
      await runGit(projectPath, ['stash', 'drop', reference]);
    } catch (error) {
      throw new GitStashError('GIT_STASH_DROP_FAILED', failureText(error));
    }
    return { stash, applied: false, removed: true };
  }

  private async restore(
    projectPath: string,
    projectId: string,
    reference: string,
    operation: 'apply' | 'pop',
    confirmationToken?: string,
  ): Promise<GitStashMutationResult> {
    validateReference(reference);
    await requireRepository(projectPath);
    this.consumeConfirmation(projectId, operation, reference, confirmationToken);
    const parsed = await this.requireStash(projectPath, reference);
    const stash = await summaryFor(projectPath, parsed);
    await requireCleanWorkingTree(projectPath);
    const previousHead = (await runGit(projectPath, ['rev-parse', 'HEAD'])).trim();

    try {
      await runGit(projectPath, ['stash', operation, '--index', reference]);
    } catch (error) {
      await rollbackWorkingTree(projectPath, previousHead);
      const details = failureText(error);
      if (CONFLICT_PATTERN.test(details)) {
        throw new GitStashError(
          'GIT_STASH_CONFLICT',
          'A restauração encontrou conflitos e foi desfeita automaticamente. O stash foi preservado.',
        );
      }
      throw new GitStashError(
        operation === 'apply' ? 'GIT_STASH_APPLY_FAILED' : 'GIT_STASH_POP_FAILED',
        details,
      );
    }

    return {
      stash,
      applied: true,
      removed: operation === 'pop',
    };
  }

  private async requireStash(
    projectPath: string,
    reference: string,
  ): Promise<ParsedStashReference> {
    const parsed = (await parseReferences(projectPath))
      .find((candidate) => candidate.reference === reference);
    if (!parsed) {
      throw new GitStashError(
        'GIT_STASH_NOT_FOUND',
        `O stash "${reference}" não foi encontrado.`,
      );
    }
    return parsed;
  }

  private consumeConfirmation(
    projectId: string,
    operation: GitStashOperation,
    target: string,
    token: string | undefined,
  ): void {
    this.pruneExpiredConfirmations();
    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.operation !== operation
      || confirmation.target !== target
    ) {
      throw new GitStashError(
        'GIT_STASH_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para esta operação de stash.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpiredConfirmations(): void {
    const now = Date.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
