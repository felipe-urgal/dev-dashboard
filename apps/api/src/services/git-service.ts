import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import type { GitCommit, GitCommitResult, GitDiffFile, GitDiffScope, GitDiffSnapshot, GitFileChange, GitFileDiff, GitFileStatus, GitMutationConfirmation, GitMutationOperation, GitStashEntry, ProjectGitOverview } from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

export const GIT_DIFF_FILE_LIMIT = 262_144;
export const GIT_MUTATION_CONFIRMATION_TTL_MS = 60_000;
export const GIT_BRANCH_NAME_PATTERN = /^(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;

export class GitDiffError extends Error {
  public constructor(public readonly code: 'GIT_NOT_REPOSITORY' | 'GIT_DIFF_PATH_OUTSIDE_PROJECT' | 'GIT_DIFF_PATH_INVALID', message: string) {
    super(message);
    this.name = 'GitDiffError';
  }
}

export type GitMutationErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_BRANCH_INVALID'
  | 'GIT_BRANCH_EXISTS'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_NO_UPSTREAM'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_PULL_DIVERGED'
  | 'GIT_PULL_FAILED'
  | 'GIT_PUSH_REJECTED'
  | 'GIT_PUSH_FAILED'
  | 'GIT_REMOTE_UNAVAILABLE'
  | 'GIT_COMMIT_MESSAGE_INVALID'
  | 'GIT_NOTHING_TO_COMMIT'
  | 'GIT_COMMIT_FAILED'
  | 'GIT_NOTHING_TO_STASH'
  | 'GIT_STASH_PUSH_FAILED'
  | 'GIT_STASH_EMPTY'
  | 'GIT_STASH_CONFLICT'
  | 'GIT_STASH_POP_FAILED';

export class GitMutationError extends Error {
  public constructor(public readonly code: GitMutationErrorCode, message: string) {
    super(message);
    this.name = 'GitMutationError';
  }
}

interface StoredMutationConfirmation {
  token: string;
  projectId: string;
  operation: GitMutationOperation;
  target: string;
  expiresAt: number;
}
const execFileAsync = promisify(execFile);
const LOG_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], { cwd: projectPath, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } });
  return result.stdout;
}

function commandFailureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const withOutput = error as Error & { stdout?: string; stderr?: string };
  return [withOutput.message, withOutput.stdout, withOutput.stderr].filter(Boolean).join('\n');
}
function statusFromCode(code: string): GitFileStatus {
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'conflicted';
  if (code.includes('R')) return 'renamed';
  if (code.includes('C')) return 'copied';
  if (code.includes('A')) return 'added';
  if (code.includes('D')) return 'deleted';
  if (code.includes('T')) return 'type-changed';
  return 'modified';
}
function parseStatus(output: string) {
  let branch: string | undefined; let detached = false; let upstream: string | undefined; let ahead = 0; let behind = 0;
  const files: GitFileChange[] = [];
  const records = output.split('\0').filter(Boolean);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.startsWith('# branch.head ')) { const value = record.slice(14); detached = value === '(detached)'; if (!detached && value !== '(initial)') branch = value; continue; }
    if (record.startsWith('# branch.upstream ')) { upstream = record.slice(18); continue; }
    if (record.startsWith('# branch.ab ')) { const match = /\+(\d+)\s+-(\d+)/.exec(record); if (match) { ahead = Number(match[1]); behind = Number(match[2]); } continue; }
    if (record.startsWith('? ')) { files.push({ path: record.slice(2), indexStatus: '?', worktreeStatus: '?', status: 'untracked' }); continue; }
    if (record.startsWith('! ')) continue;
    if (record.startsWith('1 ')) { const parts = record.split(' '); const code = parts[1] ?? '..'; files.push({ path: parts.slice(8).join(' '), indexStatus: code[0] ?? '.', worktreeStatus: code[1] ?? '.', status: statusFromCode(code) }); continue; }
    if (record.startsWith('2 ')) { const parts = record.split(' '); const code = parts[1] ?? '..'; const currentPath = parts.slice(9).join(' '); const previousPath = records[index + 1]; if (previousPath) index += 1; files.push({ path: currentPath, ...(previousPath ? { previousPath } : {}), indexStatus: code[0] ?? '.', worktreeStatus: code[1] ?? '.', status: statusFromCode(code) }); continue; }
    if (record.startsWith('u ')) { const parts = record.split(' '); const code = parts[1] ?? 'UU'; files.push({ path: parts.slice(10).join(' '), indexStatus: code[0] ?? 'U', worktreeStatus: code[1] ?? 'U', status: 'conflicted' }); }
  }
  return { branch, detached, upstream, ahead, behind, files };
}
function parseCommits(output: string): GitCommit[] {
  return output.split(RECORD_SEPARATOR).map((item) => item.trim()).filter(Boolean).map((record) => {
    const [hash = '', shortHash = '', subject = '', authorName = '', authorEmail = '', authoredAt = ''] = record.split(LOG_SEPARATOR);
    return { hash, shortHash, subject, authorName, authorEmail, authoredAt };
  });
}
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

async function resolveDiffBase(projectPath: string, scope: GitDiffScope): Promise<string | null> {
  if (scope === 'worktree') return null;
  try {
    await runGit(projectPath, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    return 'HEAD';
  } catch {
    return EMPTY_TREE_HASH;
  }
}

function gitDiffArgs(scope: GitDiffScope, base: string | null, extra: readonly string[] = []): string[] {
  if (scope === 'index') return ['diff', '--cached', ...(base ? [base] : []), ...extra];
  if (scope === 'combined') return ['diff', ...(base ? [base] : []), ...extra];
  return ['diff', ...extra];
}

function parseNumstat(output: string, statusByPath: Map<string, GitFileChange>): GitDiffFile[] {
  const files: GitDiffFile[] = [];
  const records = output.split('\0');
  let index = 0;
  while (index < records.length) {
    const record = records[index];
    index += 1;
    if (!record) continue;
    const fields = record.split('\t');
    const additionsRaw = fields[0] ?? '0';
    const deletionsRaw = fields[1] ?? '0';
    const pathPart = fields.slice(2).join('\t');
    const binary = additionsRaw === '-' && deletionsRaw === '-';
    const additions = binary ? 0 : Number.parseInt(additionsRaw, 10) || 0;
    const deletions = binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0;

    let filePath = pathPart;
    let previousPath: string | undefined;
    if (!filePath) {
      previousPath = records[index] ?? '';
      index += 1;
      filePath = records[index] ?? '';
      index += 1;
      if (!filePath) continue;
    }

    const change = statusByPath.get(filePath);
    const effectivePreviousPath = previousPath || change?.previousPath;
    const effectiveStatus = change?.status ?? (previousPath ? 'renamed' : 'modified');
    files.push({
      path: filePath,
      ...(effectivePreviousPath ? { previousPath: effectivePreviousPath } : {}),
      status: effectiveStatus,
      additions,
      deletions,
      binary,
    });
  }
  return files;
}

function ensurePathInsideProject(projectPath: string, requested: string): string {
  if (!requested || requested.includes('\0')) {
    throw new GitDiffError('GIT_DIFF_PATH_INVALID', 'Caminho inválido para diff.');
  }
  const normalizedProject = path.resolve(projectPath);
  const resolved = path.resolve(normalizedProject, requested);
  const relative = path.relative(normalizedProject, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GitDiffError('GIT_DIFF_PATH_OUTSIDE_PROJECT', 'Caminho fora do projeto.');
  }
  return relative || '.';
}

async function assertWorkingTreeClean(projectPath: string): Promise<void> {
  const output = await runGit(projectPath, ['status', '--porcelain=v2', '-z', '--untracked-files=all']);
  const dirty = output.split('\0').some((record) =>
    record.startsWith('1 ') || record.startsWith('2 ') || record.startsWith('u ') || record.startsWith('? '),
  );
  if (dirty) {
    throw new GitMutationError('GIT_WORKING_TREE_DIRTY', 'A árvore de trabalho tem alterações não commitadas ou arquivos não rastreados.');
  }
}

async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitMutationError('GIT_NOT_REPOSITORY', 'O projeto não é um repositório Git.');
  }
}

function validateBranchName(name: string): void {
  if (!name || name.length > 200 || !GIT_BRANCH_NAME_PATTERN.test(name)) {
    throw new GitMutationError('GIT_BRANCH_INVALID', 'Nome de branch inválido.');
  }
}

const REMOTE_UNAVAILABLE_PATTERN = /could not resolve host|connection (refused|timed out)|could not read from remote repository|permission denied|authentication failed|could not read username|no route to host/i;

async function requireOriginRemote(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['remote', 'get-url', 'origin']);
  } catch {
    throw new GitMutationError('GIT_REMOTE_NOT_CONFIGURED', 'Nenhum remoto "origin" configurado para este projeto.');
  }
}

const COMMIT_MESSAGE_MAX_LENGTH = 500;

function validateCommitMessage(message: string): void {
  if (!message || message.trim().length === 0 || message.length > COMMIT_MESSAGE_MAX_LENGTH) {
    throw new GitMutationError('GIT_COMMIT_MESSAGE_INVALID', 'Mensagem de commit inválida.');
  }
}

async function listStashEntries(projectPath: string): Promise<GitStashEntry[]> {
  let output = '';
  try {
    output = await runGit(projectPath, ['stash', 'list', `--format=%gd${LOG_SEPARATOR}%s${LOG_SEPARATOR}%cI`]);
  } catch {
    return [];
  }
  return output.split('\n').filter(Boolean).map((line) => {
    const [ref = '', message = '', date = ''] = line.split(LOG_SEPARATOR);
    const match = /stash@\{(\d+)\}/.exec(ref);
    return { index: match?.[1] ? Number(match[1]) : 0, message, createdAt: date };
  });
}

export class GitService {
  private readonly mutationConfirmations = new Map<string, StoredMutationConfirmation>();

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

  public prepareMutationConfirmation(projectId: string, operation: GitMutationOperation, target: string): GitMutationConfirmation {
    validateBranchName(target);
    this.pruneExpiredMutations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + GIT_MUTATION_CONFIRMATION_TTL_MS;
    this.mutationConfirmations.set(token, { token, projectId, operation, target, expiresAt });
    return { token, operation, target, expiresAt: new Date(expiresAt).toISOString() };
  }

  private consumeMutationConfirmation(projectId: string, operation: GitMutationOperation, target: string, token: string | undefined): void {
    this.pruneExpiredMutations();
    const record = token ? this.mutationConfirmations.get(token) : undefined;
    if (!record || record.projectId !== projectId || record.operation !== operation || record.target !== target) {
      throw new GitMutationError('GIT_MUTATION_CONFIRMATION_REQUIRED', 'Confirmação obrigatória para esta operação.');
    }
    this.mutationConfirmations.delete(token!);
  }

  private pruneExpiredMutations(): void {
    const now = Date.now();
    for (const [token, record] of this.mutationConfirmations) {
      if (record.expiresAt <= now) this.mutationConfirmations.delete(token);
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

  public async switchBranch(projectPath: string, projectId: string, name: string, confirmationToken?: string): Promise<{ branch: string }> {
    validateBranchName(name);
    await requireRepository(projectPath);
    this.consumeMutationConfirmation(projectId, 'switch-branch', name, confirmationToken);
    try {
      await runGit(projectPath, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
    } catch {
      throw new GitMutationError('GIT_BRANCH_NOT_FOUND', 'Branch não encontrado.');
    }
    await assertWorkingTreeClean(projectPath);
    try {
      await runGit(projectPath, ['switch', name]);
    } catch (error) {
      throw new GitMutationError('GIT_BRANCH_INVALID', error instanceof Error ? error.message : 'Falha ao trocar de branch.');
    }
    return { branch: name };
  }

  public async pull(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ branch: string }> {
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
    return { branch };
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
