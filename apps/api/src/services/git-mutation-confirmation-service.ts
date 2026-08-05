import { randomBytes } from 'node:crypto';

/**
 * Mecanismo compartilhado de confirmação de mutações Git.
 *
 * Generaliza o padrão que `GitService`, `GitSyncService`,
 * `GitBranchRenameService`, `GitBranchDeleteService`,
 * `GitBranchPublishService` e `GitUndoService` replicavam individualmente:
 * um token aleatório de 32 bytes (64 caracteres hex), vinculado ao projeto,
 * ao identificador de operação do catálogo (`GitMutationCatalogEntry.id`) e
 * ao alvo normalizado (nome de branch, caminho de arquivo etc.), com TTL
 * curto e consumo de uso único.
 *
 * Cada serviço mantém sua própria instância — o vínculo por projeto +
 * operação + alvo já impede reuso entre serviços, mesmo que dois deles
 * emprestassem a mesma instância.
 */

export type GitMutationConfirmationErrorCode = 'GIT_MUTATION_CONFIRMATION_REQUIRED';

export class GitMutationConfirmationError extends Error {
  public constructor(
    public readonly code: GitMutationConfirmationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitMutationConfirmationError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  operationId: string;
  target: string;
  expiresAt: number;
}

export interface PreparedGitMutationConfirmation {
  token: string;
  expiresAt: string;
}

const DEFAULT_TTL_MS = 60_000;

export class GitMutationConfirmationService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  public prepare(
    projectId: string,
    operationId: string,
    target: string,
  ): PreparedGitMutationConfirmation {
    this.pruneExpired();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.ttlMs;
    this.confirmations.set(token, { token, projectId, operationId, target, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  public consume(
    projectId: string,
    operationId: string,
    target: string,
    token: string | undefined,
  ): void {
    this.pruneExpired();
    const record = token ? this.confirmations.get(token) : undefined;
    if (
      !record
      || record.projectId !== projectId
      || record.operationId !== operationId
      || record.target !== target
    ) {
      throw new GitMutationConfirmationError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para esta operação.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [token, record] of this.confirmations) {
      if (record.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
