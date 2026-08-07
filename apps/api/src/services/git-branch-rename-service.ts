import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';
import { runGit as sharedRunGit } from './shared/run-git.js';

const CONFIRMATION_TTL_MS = 60_000;
const BRANCH_NAME_PATTERN =
  /^(?!-)(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;
/** Identificador do catálogo (`git-mutation-catalog.ts`) para esta operação. */
const CATALOG_OPERATION_ID = 'branch-rename';

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

function renameTarget(currentName: string, nextName: string): string {
  return `${currentName}::${nextName}`;
}

async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  return (await sharedRunGit(projectPath, args)).trim();
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

    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      CATALOG_OPERATION_ID,
      renameTarget(current, next),
    );

    return {
      token,
      operation: 'rename-branch',
      currentName: current,
      nextName: next,
      expiresAt,
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
    this.consumeConfirmation(projectId, current, next, confirmationToken);

    if (
      !(await gitSucceeds(projectPath, ['rev-parse', '--is-inside-work-tree']))
    ) {
      throw new GitBranchRenameError(
        'GIT_NOT_REPOSITORY',
        'O projeto não é um repositório Git.',
      );
    }

    if (
      !(await gitSucceeds(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${current}`,
      ]))
    ) {
      throw new GitBranchRenameError(
        'GIT_BRANCH_NOT_FOUND',
        `A branch local "${current}" não foi encontrada.`,
      );
    }

    if (
      await gitSucceeds(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${next}`,
      ])
    ) {
      throw new GitBranchRenameError(
        'GIT_BRANCH_EXISTS',
        `Já existe uma branch local chamada "${next}".`,
      );
    }

    try {
      await runGit(projectPath, ['branch', '--move', '--', current, next]);
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
    try {
      this.confirmations.consume(
        projectId,
        CATALOG_OPERATION_ID,
        renameTarget(currentName, nextName),
        token,
      );
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitBranchRenameError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para renomear a branch.',
        );
      }
      throw error;
    }
  }
}
