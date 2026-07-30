import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CONFIRMATION_TTL_MS = 60_000;
const BRANCH_NAME_PATTERN = /^(?!-)(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;

export type GitBranchRenameErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_BRANCH_INVALID'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_BRANCH_EXISTS'
  | 'GIT_BRANCH_PROTECTED'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_COMMAND_FAILED';

export class GitBranchRenameError extends Error {
  public constructor(
    public readonly code: GitBranchRenameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitBranchRenameError';
  }
}

export interface GitBranchRenameConfirmation {
  token: string;
  operation: 'rename-branch';
  currentName: string;
  nextName: string;
  expiresAt: string;
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  currentName: string;
  nextName: string;
  expiresAt: number;
}

async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return result.stdout.trim();
}

async function gitSucceeds(
  projectPath: string,
  args: readonly string[],
): Promise<boolean> {
  try {
    await runGit(projectPath, args);
    return true;
  } catch {
    return false;
  }
}

function validateBranchName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 200 || !BRANCH_NAME_PATTERN.test(value)) {
    throw new GitBranchRenameError(
      'GIT_BRANCH_INVALID',
      'Informe um nome de branch válido.',
    );
  }
  return value;
}

function assertNotProtected(name: string): void {
  if (name === 'main' || name === 'master') {
    throw new GitBranchRenameError(
      'GIT_BRANCH_PROTECTED',
      `A branch "${name}" é protegida e não pode ser renomeada pelo dashboard.`,
    );
  }
}

export class GitBranchRenameService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public prepareConfirmation(
    projectId: string,
    currentName: string,
    nextName: string,
  ): GitBranchRenameConfirmation {
    const current = validateBranchName(currentName);
    const next = validateBranchName(nextName);
    assertNotProtected(current);
    assertNotProtected(next);
    if (current === next) {
      throw new GitBranchRenameError(
        'GIT_BRANCH_INVALID',
        'O novo nome precisa ser diferente do nome atual.',
      );
    }

    this.pruneExpired();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId,
      currentName: current,
      nextName: next,
      expiresAt,
    });

    return {
      token,
      operation: 'rename-branch',
      currentName: current,
      nextName: next,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async renameLocalBranch(
    projectPath: string,
    projectId: string,
    currentName: string,
    nextName: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    const current = validateBranchName(currentName);
    const next = validateBranchName(nextName);
    assertNotProtected(current);
    assertNotProtected(next);
    this.consumeConfirmation(
      projectId,
      current,
      next,
      confirmationToken,
    );

    if (!await gitSucceeds(projectPath, ['rev-parse', '--is-inside-work-tree'])) {
      throw new GitBranchRenameError(
        'GIT_NOT_REPOSITORY',
        'O projeto não é um repositório Git.',
      );
    }

    if (!await gitSucceeds(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${current}`,
    ])) {
      throw new GitBranchRenameError(
        'GIT_BRANCH_NOT_FOUND',
        `A branch local "${current}" não foi encontrada.`,
      );
    }

    if (await gitSucceeds(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${next}`,
    ])) {
      throw new GitBranchRenameError(
        'GIT_BRANCH_EXISTS',
        `Já existe uma branch local chamada "${next}".`,
      );
    }

    try {
      await runGit(projectPath, [
        'branch',
        '--move',
        '--',
        current,
        next,
      ]);
    } catch {
      throw new GitBranchRenameError(
        'GIT_COMMAND_FAILED',
        `Não foi possível renomear a branch "${current}".`,
      );
    }

    return { branch: next };
  }

  private consumeConfirmation(
    projectId: string,
    currentName: string,
    nextName: string,
    token: string | undefined,
  ): void {
    this.pruneExpired();
    const confirmation = token
      ? this.confirmations.get(token)
      : undefined;
    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.currentName !== currentName
      || confirmation.nextName !== nextName
    ) {
      throw new GitBranchRenameError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para renomear a branch.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
