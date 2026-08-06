import type {
  GitCommitResult,
  GitMutationConfirmation,
  GitMutationOperation,
} from '@dev-dashboard/contracts';

import {
  GIT_MUTATION_CONFIRMATION_TTL_MS,
  LOG_SEPARATOR,
} from './git-service/constants.js';
import { GitMutationError, GitService } from './git-service.js';
import {
  requireRepository,
  validateBranchName,
  validateCommitMessage,
} from './git-service/mutation-guards.js';
import { runGit } from './git-service/run.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

type DashboardOperation = 'create-branch' | 'commit' | 'amend';

function isDashboardOperation(
  operation: GitMutationOperation,
): operation is DashboardOperation {
  return (
    operation === 'create-branch' ||
    operation === 'commit' ||
    operation === 'amend'
  );
}

/**
 * `commit`/`amend` nunca validaram o alvo (a branch pode mudar entre a
 * confirmação e a execução — ver `consumeDashboardConfirmation` abaixo); só
 * `create-branch` valida. Para reaproveitar o mecanismo compartilhado, que
 * sempre exige que o alvo usado em `prepare` bata com o de `consume`, as
 * confirmações de commit/amend usam este alvo fixo, e o alvo real (branch no
 * momento em que o token é pedido) é ignorado — igual ao comportamento
 * anterior, que nunca o comparava.
 */
const UNSCOPED_TARGET = '*';

/**
 * Ajustes de política do dashboard sobre o serviço Git base.
 *
 * - criar uma branch a partir do HEAD atual mantém alterações locais, como o
 *   próprio `git switch --create` permite;
 * - confirmações de commit e amend continuam de uso único e vinculadas ao
 *   projeto/operação, sem depender de uma segunda leitura da branch atual.
 */
export class DashboardGitService extends GitService {
  /**
   * Mecanismo compartilhado de confirmação (`git-mutation-confirmation-service.ts`),
   * no lugar do `Map` privado que este serviço mantinha antes — mesma TTL e
   * mesmo comportamento externo. Uma instância própria (não a de `GitService`,
   * que esta classe estende mas não reaproveita para as três operações que
   * sobrescreve) preserva o isolamento que já existia entre o `Map` do
   * dashboard e o `Map` genérico de `GitService` para as demais operações.
   */
  private readonly dashboardConfirmations = new GitMutationConfirmationService(
    GIT_MUTATION_CONFIRMATION_TTL_MS,
  );

  public override prepareMutationConfirmation(
    projectId: string,
    operation: GitMutationOperation,
    target: string,
  ): GitMutationConfirmation {
    if (!isDashboardOperation(operation)) {
      return super.prepareMutationConfirmation(projectId, operation, target);
    }

    validateBranchName(target);
    const confirmationTarget =
      operation === 'create-branch' ? target : UNSCOPED_TARGET;
    const { token, expiresAt } = this.dashboardConfirmations.prepare(
      projectId,
      operation,
      confirmationTarget,
    );

    return { token, operation, target, expiresAt };
  }

  private consumeDashboardConfirmation(
    projectId: string,
    operation: DashboardOperation,
    token: string | undefined,
    expectedTarget?: string,
  ): void {
    const confirmationTarget = expectedTarget ?? UNSCOPED_TARGET;
    try {
      this.dashboardConfirmations.consume(
        projectId,
        operation,
        confirmationTarget,
        token,
      );
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitMutationError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para esta operação.',
        );
      }
      throw error;
    }
  }

  public override async createBranch(
    projectPath: string,
    projectId: string,
    name: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(name);
    await requireRepository(projectPath);
    this.consumeDashboardConfirmation(
      projectId,
      'create-branch',
      confirmationToken,
      name,
    );

    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${name}`,
      ]);
      throw new GitMutationError(
        'GIT_BRANCH_EXISTS',
        'Já existe um branch com esse nome.',
      );
    } catch (error) {
      if (error instanceof GitMutationError) throw error;
      // show-ref falha quando a branch não existe — é o caminho esperado.
    }

    try {
      await runGit(projectPath, ['switch', '--create', name]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_BRANCH_INVALID',
        error instanceof Error ? error.message : 'Falha ao criar branch.',
      );
    }

    return { branch: name };
  }

  public override async commit(
    projectPath: string,
    projectId: string,
    message: string,
    includeAllChanges: boolean,
    confirmationToken?: string,
  ): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    this.consumeDashboardConfirmation(projectId, 'commit', confirmationToken);

    if (includeAllChanges) {
      await runGit(projectPath, ['add', '--update']);
    }

    const staged = await runGit(projectPath, [
      'diff',
      '--cached',
      '--name-only',
      '-z',
    ]);
    if (!staged.trim()) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        'Não há alterações staged para commitar.',
      );
    }

    try {
      await runGit(projectPath, ['commit', '-m', message]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        error instanceof Error ? error.message : 'Falha ao commitar.',
      );
    }

    return this.readLatestCommit(projectPath);
  }

  public override async amend(
    projectPath: string,
    projectId: string,
    message: string,
    confirmationToken?: string,
  ): Promise<GitCommitResult> {
    validateCommitMessage(message);
    await requireRepository(projectPath);
    this.consumeDashboardConfirmation(projectId, 'amend', confirmationToken);

    try {
      await runGit(projectPath, ['add', '.']);
      await runGit(projectPath, ['commit', '--amend', '-m', message]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        error instanceof Error
          ? error.message
          : 'Falha ao alterar o último commit.',
      );
    }

    return this.readLatestCommit(projectPath);
  }

  private async readLatestCommit(
    projectPath: string,
  ): Promise<GitCommitResult> {
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
}
