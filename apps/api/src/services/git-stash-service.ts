import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import type {
  GitFileStatus,
  GitStashConfirmation,
  GitStashCreateInput,
  GitStashDetail,
  GitStashFile,
  GitStashMutationResult,
  GitStashOperation,
  GitStashSummary,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

const execFileAsync = promisify(execFile);
const FIELD_SEPARATOR = '\u001f';
const CONFIRMATION_TTL_MS = 60_000;
const PATCH_LIMIT = 320_000;
const STASH_REFERENCE_PATTERN = /^stash@\{(\d+)\}$/;
const CONFLICT_PATTERN = /conflict|merge conflict|needs merge|could not restore untracked files/i;

export type GitStashErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_NOTHING_TO_STASH'
  | 'GIT_STASH_REFERENCE_INVALID'
  | 'GIT_STASH_NOT_FOUND'
  | 'GIT_STASH_CONFIRMATION_REQUIRED'
  | 'GIT_STASH_PUSH_FAILED'
  | 'GIT_STASH_APPLY_FAILED'
  | 'GIT_STASH_POP_FAILED'
  | 'GIT_STASH_DROP_FAILED'
  | 'GIT_STASH_CONFLICT';

export class GitStashError extends Error {
  public constructor(
    public readonly code: GitStashErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitStashError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  operation: GitStashOperation;
  target: string;
  expiresAt: number;
}

interface ParsedStashReference {
  index: number;
  reference: string;
  hash: string;
  subject: string;
  createdAt: string;
}

interface ParsedFileStatus {
  status: GitFileStatus;
  previousPath?: string;
}

async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return result.stdout;
}

function failureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const withOutput = error as Error & { stdout?: string; stderr?: string };
  return [withOutput.message, withOutput.stdout, withOutput.stderr]
    .filter(Boolean)
    .join('\n');
}

function validateReference(reference: string): number {
  const match = STASH_REFERENCE_PATTERN.exec(reference);
  const index = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new GitStashError(
      'GIT_STASH_REFERENCE_INVALID',
      'Referência de stash inválida.',
    );
  }
  return index;
}

function validateCreateInput(input: GitStashCreateInput): GitStashCreateInput {
  const message = input.message.trim();
  if (message.length > 200) {
    throw new GitStashError(
      'GIT_STASH_PUSH_FAILED',
      'A mensagem do stash deve ter no máximo 200 caracteres.',
    );
  }
  return {
    message,
    includeUntracked: input.includeUntracked,
    keepIndex: input.keepIndex,
  };
}

async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitStashError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

async function requireCleanWorkingTree(projectPath: string): Promise<void> {
  const output = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
  ]);
  if (output.length > 0) {
    throw new GitStashError(
      'GIT_WORKING_TREE_DIRTY',
      'A árvore de trabalho precisa estar limpa para restaurar um stash com segurança.',
    );
  }
}

async function currentBranch(projectPath: string): Promise<string> {
  const branch = (await runGit(projectPath, ['branch', '--show-current'])).trim();
  return branch || 'HEAD';
}

function statusFromCode(code: string): GitFileStatus {
  const normalized = code[0]?.toUpperCase() ?? 'M';
  if (normalized === 'A') return 'added';
  if (normalized === 'D') return 'deleted';
  if (normalized === 'R') return 'renamed';
  if (normalized === 'C') return 'copied';
  if (normalized === 'T') return 'type-changed';
  return 'modified';
}

function parseNameStatus(output: string): Map<string, ParsedFileStatus> {
  const statuses = new Map<string, ParsedFileStatus>();
  const records = output.split('\0').filter(Boolean);

  for (let index = 0; index < records.length;) {
    const code = records[index++] ?? '';
    const status = statusFromCode(code);
    if (status === 'renamed' || status === 'copied') {
      const previousPath = records[index++] ?? '';
      const currentPath = records[index++] ?? '';
      if (currentPath) statuses.set(currentPath, { status, previousPath });
      continue;
    }
    const filePath = records[index++] ?? '';
    if (filePath) statuses.set(filePath, { status });
  }

  return statuses;
}

function parseNumstat(
  output: string,
  statuses: Map<string, ParsedFileStatus>,
): GitStashFile[] {
  const files: GitStashFile[] = [];
  const records = output.split('\0');
  let index = 0;

  while (index < records.length) {
    const record = records[index++];
    if (!record) continue;
    const fields = record.split('\t');
    const additionsRaw = fields[0] ?? '0';
    const deletionsRaw = fields[1] ?? '0';
    let filePath = fields.slice(2).join('\t');
    let previousPath: string | undefined;

    if (!filePath) {
      previousPath = records[index++] ?? '';
      filePath = records[index++] ?? '';
      if (!filePath) continue;
    }

    const status = statuses.get(filePath);
    const binary = additionsRaw === '-' || deletionsRaw === '-';
    files.push({
      path: filePath,
      ...(status?.previousPath || previousPath
        ? { previousPath: status?.previousPath || previousPath }
        : {}),
      status: status?.status ?? (previousPath ? 'renamed' : 'modified'),
      additions: binary ? 0 : Number.parseInt(additionsRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0,
      binary,
    });
  }

  return files;
}

function parseSubject(subject: string): { branch: string; message: string } {
  const match = /^(?:WIP on|On) ([^:]+):\s*(.*)$/.exec(subject.trim());
  if (!match) {
    return {
      branch: 'HEAD',
      message: subject.trim() || 'Stash sem mensagem',
    };
  }
  return {
    branch: match[1]?.trim() || 'HEAD',
    message: match[2]?.trim() || 'Stash sem mensagem',
  };
}

async function parseReferences(projectPath: string): Promise<ParsedStashReference[]> {
  const output = await runGit(projectPath, [
    'stash',
    'list',
    '-n',
    '50',
    `--format=%gd${FIELD_SEPARATOR}%H${FIELD_SEPARATOR}%gs${FIELD_SEPARATOR}%cI`,
  ]);

  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line): ParsedStashReference[] => {
      const [reference = '', hash = '', subject = '', createdAt = ''] = line.split(FIELD_SEPARATOR);
      const match = STASH_REFERENCE_PATTERN.exec(reference);
      if (!match?.[1]) return [];
      return [{
        index: Number.parseInt(match[1], 10),
        reference,
        hash,
        subject,
        createdAt,
      }];
    });
}

async function includesUntracked(projectPath: string, reference: string): Promise<boolean> {
  try {
    await runGit(projectPath, ['rev-parse', '--verify', '--quiet', `${reference}^3`]);
    return true;
  } catch {
    return false;
  }
}

async function filesFor(projectPath: string, reference: string): Promise<GitStashFile[]> {
  const [nameStatus, numstat] = await Promise.all([
    runGit(projectPath, [
      'stash',
      'show',
      '--include-untracked',
      '--name-status',
      '-z',
      reference,
    ]),
    runGit(projectPath, [
      'stash',
      'show',
      '--include-untracked',
      '--numstat',
      '-z',
      reference,
    ]),
  ]);
  return parseNumstat(numstat, parseNameStatus(nameStatus));
}

async function summaryFor(
  projectPath: string,
  parsed: ParsedStashReference,
): Promise<GitStashSummary> {
  const [files, hasUntracked] = await Promise.all([
    filesFor(projectPath, parsed.reference),
    includesUntracked(projectPath, parsed.reference),
  ]);
  const subject = parseSubject(parsed.subject);
  return {
    index: parsed.index,
    reference: parsed.reference,
    hash: parsed.hash,
    message: subject.message,
    branch: subject.branch,
    createdAt: parsed.createdAt,
    fileCount: files.length,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    includesUntracked: hasUntracked,
  };
}

async function rollbackWorkingTree(projectPath: string, head: string): Promise<void> {
  try {
    await runGit(projectPath, ['reset', '--hard', head]);
    await runGit(projectPath, ['clean', '-fd']);
  } catch {
    // O erro original da aplicação do stash é mais relevante.
  }
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
