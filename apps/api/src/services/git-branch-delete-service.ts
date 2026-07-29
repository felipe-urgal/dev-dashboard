import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CONFIRMATION_TTL_MS = 60_000;
const BRANCH_NAME_PATTERN = /^(?!-)(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;

export type GitBranchDeleteErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_BRANCH_INVALID'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_BRANCH_CURRENT'
  | 'GIT_BRANCH_PROTECTED'
  | 'GIT_BRANCH_NOT_MERGED'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_COMMAND_FAILED';

export class GitBranchDeleteError extends Error {
  public constructor(
    public readonly code: GitBranchDeleteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitBranchDeleteError';
  }
}

export interface GitBranchDeleteConfirmation {
  token: string;
  operation: 'delete-branch';
  target: string;
  expiresAt: string;
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  branch: string;
  expiresAt: number;
}

interface GitCommandFailure extends Error {
  stderr?: string;
  stdout?: string;
}

async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
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

async function gitSucceeds(projectPath: string, args: readonly string[]): Promise<boolean> {
  try {
    await runGit(projectPath, args);
    return true;
  } catch {
    return false;
  }
}

function validateBranch(branch: string): string {
  const value = branch.trim();
  if (!value || value.length > 200 || !BRANCH_NAME_PATTERN.test(value)) {
    throw new GitBranchDeleteError(
      'GIT_BRANCH_INVALID',
      'Informe uma branch local válida para remover.',
    );
  }
  return value;
}

async function protectedBranches(projectPath: string): Promise<Set<string>> {
  const branches = new Set(['main', 'master']);
  for (const remote of ['origin', 'upstream']) {
    try {
      const reference = await runGit(projectPath, [
        'symbolic-ref',
        '--quiet',
        '--short',
        `refs/remotes/${remote}/HEAD`,
      ]);
      const prefix = `${remote}/`;
      if (reference.startsWith(prefix)) branches.add(reference.slice(prefix.length));
    } catch {
      // O remote pode não possuir HEAD simbólico configurado.
    }
  }
  return branches;
}

export class GitBranchDeleteService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public prepareConfirmation(
    projectId: string,
    branch: string,
  ): GitBranchDeleteConfirmation {
    const target = validateBranch(branch);
    this.pruneExpired();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId,
      branch: target,
      expiresAt,
    });
    return {
      token,
      operation: 'delete-branch',
      target,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async deleteLocalBranch(
    projectPath: string,
    projectId: string,
    branch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    const target = validateBranch(branch);
    this.consumeConfirmation(projectId, target, confirmationToken);

    if (!await gitSucceeds(projectPath, ['rev-parse', '--is-inside-work-tree'])) {
      throw new GitBranchDeleteError(
        'GIT_NOT_REPOSITORY',
        'O projeto não é um repositório Git.',
      );
    }

    const current = await runGit(projectPath, ['branch', '--show-current']);
    if (current === target) {
      throw new GitBranchDeleteError(
        'GIT_BRANCH_CURRENT',
        'Não é possível remover a branch atualmente selecionada. Troque de branch primeiro.',
      );
    }

    if ((await protectedBranches(projectPath)).has(target)) {
      throw new GitBranchDeleteError(
        'GIT_BRANCH_PROTECTED',
        `A branch "${target}" é protegida e não pode ser removida pelo dashboard.`,
      );
    }

    if (!await gitSucceeds(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${target}`,
    ])) {
      throw new GitBranchDeleteError(
        'GIT_BRANCH_NOT_FOUND',
        `A branch local "${target}" não foi encontrada.`,
      );
    }

    try {
      await runGit(projectPath, ['branch', '--delete', '--', target]);
    } catch (error) {
      const failure = error as GitCommandFailure;
      const details = `${failure.stderr ?? ''}\n${failure.stdout ?? ''}\n${failure.message}`;
      if (/not fully merged|não está totalmente mesclad/i.test(details)) {
        throw new GitBranchDeleteError(
          'GIT_BRANCH_NOT_MERGED',
          `A branch "${target}" ainda possui commits não integrados. Faça merge/rebase antes de removê-la.`,
        );
      }
      throw new GitBranchDeleteError(
        'GIT_COMMAND_FAILED',
        `Não foi possível remover a branch "${target}".`,
      );
    }

    return { branch: target };
  }

  private consumeConfirmation(
    projectId: string,
    branch: string,
    token: string | undefined,
  ): void {
    this.pruneExpired();
    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.branch !== branch
    ) {
      throw new GitBranchDeleteError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para remover a branch.',
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
