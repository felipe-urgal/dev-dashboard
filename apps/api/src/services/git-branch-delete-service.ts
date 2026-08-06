import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

const execFileAsync = promisify(execFile);
const CONFIRMATION_TTL_MS = 60_000;
const BRANCH_NAME_PATTERN =
  /^(?!-)(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;
/** Identificador do catálogo (`git-mutation-catalog.ts`) para esta operação. */
const CATALOG_OPERATION_ID = 'branch-delete';

export type GitBranchDeleteErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_BRANCH_INVALID'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_BRANCH_CURRENT'
  | 'GIT_BRANCH_PROTECTED'
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
      if (reference.startsWith(prefix))
        branches.add(reference.slice(prefix.length));
    } catch {
      // O remote pode não possuir HEAD simbólico configurado.
    }
  }
  return branches;
}

export class GitBranchDeleteService {
  /**
   * Mecanismo compartilhado de confirmação (`git-mutation-confirmation-service.ts`),
   * no lugar do `Map` privado que este serviço mantinha — mesma TTL e mesmo
   * comportamento externo (`GIT_MUTATION_CONFIRMATION_REQUIRED`).
   */
  private readonly confirmations = new GitMutationConfirmationService(
    CONFIRMATION_TTL_MS,
  );

  public prepareConfirmation(
    projectId: string,
    branch: string,
  ): GitBranchDeleteConfirmation {
    const target = validateBranch(branch);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      CATALOG_OPERATION_ID,
      target,
    );
    return { token, operation: 'delete-branch', target, expiresAt };
  }

  public async deleteLocalBranch(
    projectPath: string,
    projectId: string,
    branch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    const target = validateBranch(branch);
    this.consumeConfirmation(projectId, target, confirmationToken);

    if (
      !(await gitSucceeds(projectPath, ['rev-parse', '--is-inside-work-tree']))
    ) {
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

    if (
      !(await gitSucceeds(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${target}`,
      ]))
    ) {
      throw new GitBranchDeleteError(
        'GIT_BRANCH_NOT_FOUND',
        `A branch local "${target}" não foi encontrada.`,
      );
    }

    try {
      await runGit(projectPath, [
        'branch',
        '--delete',
        '--force',
        '--',
        target,
      ]);
    } catch {
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
    try {
      this.confirmations.consume(
        projectId,
        CATALOG_OPERATION_ID,
        branch,
        token,
      );
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitBranchDeleteError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para remover a branch.',
        );
      }
      throw error;
    }
  }
}
