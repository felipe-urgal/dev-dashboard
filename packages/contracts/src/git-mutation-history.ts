import type { GitMutationRiskLevel } from './git-mutation-catalog.js';

export type GitMutationHistoryResult = 'succeeded' | 'failed';

/**
 * Um evento do histórico de mutações Git — metadados operacionais apenas.
 * Nunca deve conter mensagem de commit, nome sensível, caminho, patch,
 * stdout/stderr ou token de confirmação.
 */
export interface GitMutationHistoryEvent {
  id: string;
  projectId: string;
  workspaceId?: string;
  /** Identificador do catálogo (`GitMutationCatalogEntry.id`). */
  operationId: string;
  risk: GitMutationRiskLevel;
  /** Instante definido pelo servidor no momento do registro. */
  occurredAt: string;
  result: GitMutationHistoryResult;
  /** Código de erro controlado (`ApiErrorCode`), presente somente quando `result` é `failed`. */
  errorCode?: string;
}

export interface GitMutationHistoryPage {
  projectId: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  events: GitMutationHistoryEvent[];
}
