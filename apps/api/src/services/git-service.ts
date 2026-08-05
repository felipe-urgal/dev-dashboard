import { unlink } from 'node:fs/promises';
import path from 'node:path';

import type {
  GitBranchMutationResult,
  GitCommit,
  GitCommitResult,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileChange,
  GitFileDiff,
  GitFileLines,
  GitMutationConfirmation,
  GitMutationOperation,
  GitStashEntry,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import {
  GIT_DIFF_FILE_LIMIT,
  GIT_DIFF_LINES_LIMIT,
  GIT_MUTATION_CONFIRMATION_TTL_MS,
  LOG_SEPARATOR,
  RECORD_SEPARATOR,
} from './git-service/constants.js';
import {
  resolveDiffBase,
  gitDiffArgs,
  parseNumstat,
  ensurePathInsideProject,
  readIndexBlob,
  readWorkingTreeFile,
} from './git-service/diff-helpers.js';
import { GitDiffError, GitMutationError } from './git-service/errors.js';
import {
  assertWorkingTreeClean,
  ensureMutationPathInsideProject,
  requireOriginRemote,
  requireRepository,
  validateBranchName,
  validateCommitMessage,
  validateMutationPath,
} from './git-service/mutation-guards.js';
import { runGit, commandFailureText } from './git-service/run.js';
import { computeProjectChangeImpact } from './project-change-impact-service.js';
import { resolveSavePrefix } from './git-service/save-prefix.js';
import { parseCommits, parseStatus } from './git-service/status-parsing.js';
import { listStashEntries } from './git-service/stash.js';
import { REMOTE_UNAVAILABLE_PATTERN } from './git-service/constants.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

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
   * usado em vez de um `Map` privado próprio deste serviço — mesma TTL e
   * mesmo comportamento de antes, agora generalizado para os demais serviços
   * Git migrarem nas próximas etapas.
   */
  private readonly confirmations = new GitMutationConfirmationService(GIT_MUTATION_CONFIRMATION_TTL_MS);

  public async getOverview(projectPath: string): Promise<ProjectGitOverview> {
    try { await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']); } catch { return { repository: false, detached: false, ahead: 0, behind: 0, clean: true, files: [], recentCommits: [], stashes: [] }; }
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    let commits: GitCommit[] = [];
    try { commits = parseCommits(await runGit(projectPath, ['log', '-n', '20', `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s${LOG_SEPARATOR}%an${LOG_SEPARATOR}%ae${LOG_SEPARATOR}%aI${RECORD_SEPARATOR}`])); } catch { /* repositório sem commits */ }
    const stashes = await listStashEntries(projectPath);
    return { repository: true, ...(status.branch ? { branch: status.branch } : {}), detached: status.detached, ...(status.upstream ? { upstream: status.upstream } : {}), ahead: status.ahead, behind: status.behind, clean: status.files.length === 0, files: status.files, ...(commits[0] ? { latestCommit: commits[0] } : {}), recentCommits: commits, stashes };
  }

  public async getDiffSnapshot(projectPath: string, scope: GitDiffScope = 'combined'): Promise<GitDiffSnapshot> {
    try {
      await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      return { repository: false, scope, files: [] };
    }
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const statusByPath = new Map<string, GitFileChange>();
    for (const file of status.files) statusByPath.set(file.path, file);
    const base = await resolveDiffBase(projectPath, scope);
    const numstat = await runGit(projectPath, [...gitDiffArgs(scope, base, ['--numstat', '-z'])]);
    const files = parseNumstat(numstat, statusByPath);
    return { repository: true, scope, files };
  }

  public async getFileDiff(projectPath: string, requestedPath: string, scope: GitDiffScope = 'combined'): Promise<GitFileDiff> {
    try {
      await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      throw new GitDiffError('GIT_NOT_REPOSITORY', 'O projeto não é um repositório Git.');
    }
    const safePath = ensurePathInsideProject(projectPath, requestedPath);
    const statusOutput = await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
    const status = parseStatus(statusOutput);
    const change = status.files.find((file) => file.path === safePath);

    let raw = '';
    let binary = false;
    const base = await resolveDiffBase(projectPath, scope);
    try {
      raw = await runGit(projectPath, [...gitDiffArgs(scope, base, ['--', safePath])]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/binary files? .* differ/i.test(message)) {
        binary = true;
      } else {
        throw error;
      }
    }
    if (!binary && /^Binary files /m.test(raw)) binary = true;

    const truncated = raw.length > GIT_DIFF_FILE_LIMIT;
    const trimmed = truncated ? raw.slice(0, GIT_DIFF_FILE_LIMIT) : raw;
    const masked = maskSensitiveLogContent(trimmed);
    return {
      path: safePath,
      scope,
      status: change?.status ?? 'modified',
      binary,
      content: binary ? '' : masked.content,
      truncated,
      masked: masked.masked,
      redactionCount: masked.redactionCount,
    };
  }

  /**
   * Lê uma faixa de linhas do lado "novo" de um arquivo que já aparece no diff
   * do escopo pedido — é o que alimenta a expansão de contexto na interface.
   *
   * O navegador nunca escolhe um caminho livre: além da checagem de contenção
   * no projeto, o caminho precisa estar na lista de arquivos do próprio diff.
   */
  public async getFileLines(
    projectPath: string,
    requestedPath: string,
    scope: GitDiffScope,
    start: number,
    end: number,
  ): Promise<GitFileLines> {
    try {
      await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      throw new GitDiffError('GIT_NOT_REPOSITORY', 'O projeto não é um repositório Git.');
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new GitDiffError('GIT_DIFF_RANGE_INVALID', 'Faixa de linhas inválida.');
    }
    if (end - start + 1 > GIT_DIFF_LINES_LIMIT) {
      throw new GitDiffError('GIT_DIFF_RANGE_INVALID', `A faixa excede ${GIT_DIFF_LINES_LIMIT} linhas.`);
    }

    const safePath = ensurePathInsideProject(projectPath, requestedPath);
    const snapshot = await this.getDiffSnapshot(projectPath, scope);
    const entry = snapshot.files.find((file) => file.path === safePath);
    if (!entry) {
      throw new GitDiffError('GIT_DIFF_PATH_NOT_IN_DIFF', 'O arquivo não faz parte do diff deste escopo.');
    }
    if (entry.binary) {
      throw new GitDiffError('GIT_DIFF_LINES_UNAVAILABLE', 'Arquivo binário não tem expansão de contexto.');
    }
    if (entry.status === 'deleted') {
      throw new GitDiffError('GIT_DIFF_LINES_UNAVAILABLE', 'Arquivo removido não tem conteúdo para expandir.');
    }

    const content = scope === 'index'
      ? await readIndexBlob(projectPath, safePath)
      : await readWorkingTreeFile(projectPath, safePath);

    const allLines = content.split('\n');
    if (allLines.at(-1) === '') allLines.pop();
    const totalLines = allLines.length;
    const effectiveStart = Math.min(start, totalLines + 1);
    const effectiveEnd = Math.min(end, totalLines);
    const slice = effectiveEnd < effectiveStart ? [] : allLines.slice(effectiveStart - 1, effectiveEnd);

    const masked = maskSensitiveLogContent(slice.join('\n'));
    return {
      path: safePath,
      scope,
      start: effectiveStart,
      end: effectiveEnd < effectiveStart ? effectiveStart - 1 : effectiveEnd,
      totalLines,
      lines: slice.length === 0 ? [] : masked.content.split('\n'),
      masked: masked.masked,
      redactionCount: masked.redactionCount,
    };
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

  private consumeMutationConfirmation(projectId: string, operation: GitMutationOperation, target: string, token: string | undefined): void {
    try {
      this.confirmations.consume(projectId, operation, target, token);
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitMutationError(error.code, error.message);
      }
      throw error;
    }
  }

  public async createBranch(projectPath: string, projectId: string, name: string, confirmationToken?: string): Promise<{ branch: string }> {
    validateBranchName(name);
    await requireRepository(projectPath);
    this.consumeMutationConfirmation(projectId, 'create-branch', name, confirmationToken);
    try {
      await runGit(projectPath, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
      throw new GitMutationError('GIT_BRANCH_EXISTS', 'Já existe um branch com esse nome.');
    } catch (error) {
      if (error instanceof GitMutationError) throw error;
      // show-ref falha quando o branch não existe — é o caminho esperado
    }
    await assertWorkingTreeClean(projectPath);
    try {
      await runGit(projectPath, ['switch', '--create', name]);
    } catch (error) {
      throw new GitMutationError('GIT_BRANCH_INVALID', error instanceof Error ? error.message : 'Falha ao criar branch.');
    }
    return { branch: name };
  }

  public async switchBranch(projectPath: string, projectId: string, name: string, confirmationToken?: string): Promise<GitBranchMutationResult> {
    validateBranchName(name);
    await requireRepository(projectPath);
    this.consumeMutationConfirmation(projectId, 'switch-branch', name, confirmationToken);
    try {
      await runGit(projectPath, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
    } catch {
      throw new GitMutationError('GIT_BRANCH_NOT_FOUND', 'Branch não encontrado.');
    }
    await assertWorkingTreeClean(projectPath);
    const previousSha = (await runGit(projectPath, ['rev-parse', 'HEAD'])).trim();
    try {
      await runGit(projectPath, ['switch', name]);
    } catch (error) {
      throw new GitMutationError('GIT_BRANCH_INVALID', error instanceof Error ? error.message : 'Falha ao trocar de branch.');
    }
    const currentSha = (await runGit(projectPath, ['rev-parse', 'HEAD'])).trim();
    const impact = await computeProjectChangeImpact(projectPath, previousSha, currentSha);
    return { branch: name, impact };
  }

  public async pull(projectPath: string, projectId: string, confirmationToken?: string): Promise<GitBranchMutationResult> {
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    if (status.detached || !status.branch) {
      throw new GitMutationError('GIT_DETACHED_HEAD', 'Não é possível fazer pull em um HEAD destacado.');
    }
    const branch = status.branch;
    this.consumeMutationConfirmation(projectId, 'pull', branch, confirmationToken);
    if (!status.upstream) {
      throw new GitMutationError('GIT_NO_UPSTREAM', 'O branch atual não tem upstream configurado.');
    }
    await assertWorkingTreeClean(projectPath);
    const previousSha = (await runGit(projectPath, ['rev-parse', 'HEAD'])).trim();
    try {
      await runGit(projectPath, ['pull', '--ff-only']);
    } catch (error) {
      const details = commandFailureText(error);
      if (/not possible to fast-forward/i.test(details)) {
        throw new GitMutationError('GIT_PULL_DIVERGED', 'O branch local divergiu do remoto; resolva manualmente antes de tentar novamente.');
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError('GIT_REMOTE_UNAVAILABLE', 'Não foi possível acessar o remoto configurado.');
      }
      throw new GitMutationError('GIT_PULL_FAILED', details);
    }
    const currentSha = (await runGit(projectPath, ['rev-parse', 'HEAD'])).trim();
    const impact = await computeProjectChangeImpact(projectPath, previousSha, currentSha);
    return { branch, impact };
  }

  public async push(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ branch: string }> {
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    if (status.detached || !status.branch) {
      throw new GitMutationError('GIT_DETACHED_HEAD', 'Não é possível fazer push em um HEAD destacado.');
    }
    const branch = status.branch;
    this.consumeMutationConfirmation(projectId, 'push', branch, confirmationToken);
    await requireOriginRemote(projectPath);
    try {
      if (status.upstream) {
        await runGit(projectPath, ['push']);
      } else {
        await runGit(projectPath, ['push', '--set-upstream', 'origin', branch]);
      }
    } catch (error) {
      const details = commandFailureText(error);
      if (/\[rejected\]|non-fast-forward|fetch first/i.test(details)) {
        throw new GitMutationError('GIT_PUSH_REJECTED', 'O remoto tem commits que o branch local não possui; faça pull antes de enviar.');
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError('GIT_REMOTE_UNAVAILABLE', 'Não foi possível acessar o remoto configurado.');
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }
    return { branch };
  }

  public async stageFile(
    projectPath: string,
    requestedPath: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(projectPath, requestedPath);
    const status = parseStatus(await runGit(projectPath, [
      'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all',
    ]));
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file) {
      throw new GitMutationError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo não possui alterações para adicionar ao staged.',
      );
    }
    try {
      await runGit(projectPath, ['add', '--', safePath]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_FILE_MUTATION_FAILED',
        error instanceof Error ? error.message : 'Falha ao adicionar o arquivo ao staged.',
      );
    }
    return { path: safePath };
  }

  public async unstageFile(
    projectPath: string,
    requestedPath: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(projectPath, requestedPath);
    const status = parseStatus(await runGit(projectPath, [
      'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all',
    ]));
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file || file.indexStatus === '.' || file.indexStatus === '?') {
      throw new GitMutationError(
        'GIT_FILE_OPERATION_NOT_ALLOWED',
        'O arquivo não está staged.',
      );
    }
    try {
      await runGit(projectPath, ['restore', '--staged', '--', safePath]);
    } catch {
      try {
        await runGit(projectPath, ['reset', '--', safePath]);
      } catch (error) {
        throw new GitMutationError(
          'GIT_FILE_MUTATION_FAILED',
          error instanceof Error ? error.message : 'Falha ao remover o arquivo do staged.',
        );
      }
    }
    return { path: safePath };
  }

  public async discardFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(projectPath, requestedPath);
    const status = parseStatus(await runGit(projectPath, [
      'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all',
    ]));
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file) {
      throw new GitMutationError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo modificado não foi encontrado.',
      );
    }
    if (file.status === 'untracked' || file.worktreeStatus === '.') {
      throw new GitMutationError(
        'GIT_FILE_OPERATION_NOT_ALLOWED',
        'Somente alterações rastreadas fora do staged podem ser desfeitas.',
      );
    }
    this.consumeMutationConfirmation(
      projectId,
      'discard-file',
      safePath,
      confirmationToken,
    );
    try {
      await runGit(projectPath, ['restore', '--worktree', '--', safePath]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_FILE_MUTATION_FAILED',
        error instanceof Error ? error.message : 'Falha ao desfazer as alterações do arquivo.',
      );
    }
    return { path: safePath };
  }

  public async removeUntrackedFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensureMutationPathInsideProject(projectPath, requestedPath);
    const status = parseStatus(await runGit(projectPath, [
      'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all',
    ]));
    const file = status.files.find((candidate) => candidate.path === safePath);
    if (!file) {
      throw new GitMutationError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo novo não foi encontrado.',
      );
    }
    if (file.status !== 'untracked') {
      throw new GitMutationError(
        'GIT_FILE_OPERATION_NOT_ALLOWED',
        'Somente arquivos não rastreados podem ser removidos por esta ação.',
      );
    }
    this.consumeMutationConfirmation(
      projectId,
      'remove-untracked-file',
      safePath,
      confirmationToken,
    );
    try {
      await unlink(path.join(projectPath, safePath));
    } catch (error) {
      throw new GitMutationError(
        'GIT_FILE_MUTATION_FAILED',
        error instanceof Error ? error.message : 'Falha ao remover o arquivo novo.',
      );
    }
    return { path: safePath };
  }

  public async commit(projectPath: string, projectId: string, message: string, includeAllChanges: boolean, confirmationToken?: string): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const branch = status.branch ?? 'HEAD';
    this.consumeMutationConfirmation(projectId, 'commit', branch, confirmationToken);
    if (includeAllChanges) {
      await runGit(projectPath, ['add', '--update']);
    }
    const staged = await runGit(projectPath, ['diff', '--cached', '--name-only', '-z']);
    if (!staged.trim()) {
      throw new GitMutationError('GIT_NOTHING_TO_COMMIT', 'Não há alterações staged para commitar.');
    }
    try {
      await runGit(projectPath, ['commit', '-m', message]);
    } catch (error) {
      throw new GitMutationError('GIT_COMMIT_FAILED', error instanceof Error ? error.message : 'Falha ao commitar.');
    }
    const log = await runGit(projectPath, ['log', '-1', `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s`]);
    const [hash = '', shortHash = '', subject = ''] = log.trim().split(LOG_SEPARATOR);
    return { hash, shortHash, subject };
  }

  public async amend(projectPath: string, projectId: string, message: string, confirmationToken?: string): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const branch = status.branch ?? 'HEAD';
    this.consumeMutationConfirmation(projectId, 'amend', branch, confirmationToken);
    try {
      await runGit(projectPath, ['add', '.']);
      await runGit(projectPath, ['commit', '--amend', '-m', message]);
    } catch (error) {
      throw new GitMutationError('GIT_COMMIT_FAILED', error instanceof Error ? error.message : 'Falha ao alterar o último commit.');
    }
    const log = await runGit(projectPath, ['log', '-1', `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s`]);
    const [hash = '', shortHash = '', subject = ''] = log.trim().split(LOG_SEPARATOR);
    return { hash, shortHash, subject };
  }

  public async save(projectPath: string, projectId: string, message: string, confirmationToken?: string): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const branch = status.branch ?? 'HEAD';
    this.consumeMutationConfirmation(projectId, 'save', branch, confirmationToken);
    if (status.files.length === 0) {
      throw new GitMutationError('GIT_NOTHING_TO_COMMIT', 'Não há alterações na árvore de trabalho para salvar.');
    }
    const prefix = status.detached ? '' : resolveSavePrefix(status.branch);
    const hasConventionalPrefix = /^(?:feat|fix|refactor|chore|docs|test)(?:\([^)]*\))?:\s/.test(message);
    const subject = prefix && !hasConventionalPrefix
      ? `${prefix}: ${message}`
      : message;
    validateCommitMessage(subject);
    await runGit(projectPath, ['add', '--all']);
    const staged = await runGit(projectPath, ['diff', '--cached', '--name-only', '-z']);
    if (!staged.trim()) {
      throw new GitMutationError('GIT_NOTHING_TO_COMMIT', 'Não há alterações na árvore de trabalho para salvar.');
    }
    try {
      await runGit(projectPath, ['commit', '-m', subject]);
    } catch (error) {
      throw new GitMutationError('GIT_COMMIT_FAILED', error instanceof Error ? error.message : 'Falha ao commitar.');
    }
    const log = await runGit(projectPath, ['log', '-1', `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s`]);
    const [hash = '', shortHash = '', committedSubject = ''] = log.trim().split(LOG_SEPARATOR);
    return { hash, shortHash, subject: committedSubject };
  }

  public async stashPush(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ stash: GitStashEntry }> {
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const branch = status.branch ?? 'HEAD';
    this.consumeMutationConfirmation(projectId, 'stash-push', branch, confirmationToken);
    const hasTrackedChanges = status.files.some((file) => file.status !== 'untracked');
    if (!hasTrackedChanges) {
      throw new GitMutationError('GIT_NOTHING_TO_STASH', 'Não há alterações rastreadas para guardar no stash.');
    }
    try {
      await runGit(projectPath, ['stash', 'push']);
    } catch (error) {
      throw new GitMutationError('GIT_STASH_PUSH_FAILED', error instanceof Error ? error.message : 'Falha ao guardar o stash.');
    }
    const created = (await listStashEntries(projectPath))[0];
    if (!created) {
      throw new GitMutationError('GIT_STASH_PUSH_FAILED', 'Stash criado mas não encontrado na listagem.');
    }
    return { stash: created };
  }

  public async stashPop(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ popped: GitStashEntry }> {
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const branch = status.branch ?? 'HEAD';
    this.consumeMutationConfirmation(projectId, 'stash-pop', branch, confirmationToken);
    const top = (await listStashEntries(projectPath))[0];
    if (!top) {
      throw new GitMutationError('GIT_STASH_EMPTY', 'Não há nenhum stash para restaurar.');
    }
    await assertWorkingTreeClean(projectPath);
    const beforeHead = (await runGit(projectPath, ['rev-parse', 'HEAD'])).trim();
    try {
      await runGit(projectPath, ['stash', 'pop']);
    } catch (error) {
      try {
        await runGit(projectPath, ['reset', '--hard', beforeHead]);
      } catch {
        // A árvore de trabalho é restaurada em melhor esforço; o erro original do pop é o relevante.
      }
      const details = commandFailureText(error);
      if (/conflict/i.test(details)) {
        throw new GitMutationError('GIT_STASH_CONFLICT', 'Não foi possível restaurar o stash sem conflitos; a árvore de trabalho foi mantida limpa e o stash foi preservado.');
      }
      throw new GitMutationError('GIT_STASH_POP_FAILED', details);
    }
    return { popped: top };
  }
}
