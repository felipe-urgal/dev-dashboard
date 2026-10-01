import type { GitCommitResult } from '@dev-dashboard/contracts';

import { LOG_SEPARATOR } from './constants.js';
import { consumeMutationConfirmation } from './confirmation.js';
import { GitMutationError } from './errors.js';
import { requireRepository, validateCommitMessage } from './mutation-guards.js';
import { runGit } from './run.js';
import { resolveSavePrefix } from './save-prefix.js';
import { parseStatus } from './status-parsing.js';
import type { GitMutationConfirmationService } from '../git-mutation-confirmation-service.js';

/** Mutações de commit: registrar, alterar o último (amend) e "salvar tudo" com prefixo automático. */
export function createCommitOperations(
  confirmations: GitMutationConfirmationService,
) {
  async function commit(
    projectPath: string,
    projectId: string,
    message: string,
    _includeAllChanges: boolean,
    confirmationToken?: string,
  ): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    const branch = status.branch ?? 'HEAD';
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'commit',
      branch,
      confirmationToken,
    );

    const committable = status.files.filter(
      (file) => file.status !== 'untracked',
    );
    if (committable.length === 0) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        'Não há alterações rastreadas para commitar. Arquivos não rastreados precisam ser adicionados explicitamente antes.',
      );
    }

    try {
      await runGit(projectPath, ['commit', '-a', '-m', message]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        error instanceof Error ? error.message : 'Falha ao commitar.',
      );
    }

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

  async function amend(
    projectPath: string,
    projectId: string,
    message: string,
    confirmationToken?: string,
  ): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    const branch = status.branch ?? 'HEAD';
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'amend',
      branch,
      confirmationToken,
    );

    let currentSubject = '';
    try {
      currentSubject = (
        await runGit(projectPath, ['log', '-1', '--format=%s'])
      ).trim();
    } catch {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        'Não existe um commit anterior para alterar.',
      );
    }

    const staged = await runGit(projectPath, [
      'diff',
      '--cached',
      '--name-only',
      '-z',
    ]);
    if (!staged.trim() && currentSubject === message.trim()) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        'Não há alterações staged nem mudança na mensagem do último commit.',
      );
    }

    try {
      await runGit(projectPath, ['commit', '--amend', '-m', message]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        error instanceof Error
          ? error.message
          : 'Falha ao alterar o último commit.',
      );
    }

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

  async function save(
    projectPath: string,
    projectId: string,
    message: string,
    confirmationToken?: string,
  ): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    const branch = status.branch ?? 'HEAD';
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'save',
      branch,
      confirmationToken,
    );
    if (status.files.length === 0) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        'Não há alterações na árvore de trabalho para salvar.',
      );
    }
    const prefix = status.detached ? '' : resolveSavePrefix(status.branch);
    const hasConventionalPrefix =
      /^(?:feat|fix|refactor|chore|docs|test)(?:\([^)]*\))?:\s/.test(message);
    const subject =
      prefix && !hasConventionalPrefix ? `${prefix}: ${message}` : message;
    validateCommitMessage(subject);
    await runGit(projectPath, ['add', '--all']);
    const staged = await runGit(projectPath, [
      'diff',
      '--cached',
      '--name-only',
      '-z',
    ]);
    if (!staged.trim()) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        'Não há alterações na árvore de trabalho para salvar.',
      );
    }
    try {
      await runGit(projectPath, ['commit', '-m', subject]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        error instanceof Error ? error.message : 'Falha ao commitar.',
      );
    }
    const log = await runGit(projectPath, [
      'log',
      '-1',
      `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s`,
    ]);
    const [hash = '', shortHash = '', committedSubject = ''] = log
      .trim()
      .split(LOG_SEPARATOR);
    return { hash, shortHash, subject: committedSubject };
  }

  return { commit, amend, save };
}
