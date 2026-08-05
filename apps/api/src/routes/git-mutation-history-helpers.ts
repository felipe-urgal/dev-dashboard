import type { GitMutationHistoryService } from '../services/git-mutation-history-service.js';

interface ProjectLike {
  id: string;
  workspaceId?: string;
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Códigos de "confirmação obrigatória" usados pelos diferentes serviços de
 * mutação Git. A maioria reaproveita `GIT_MUTATION_CONFIRMATION_REQUIRED`
 * (mesmo código de `GitMutationConfirmationError`), mas `GitSyncService`
 * preserva seu próprio código externo já testado
 * (`GIT_SYNC_CONFIRMATION_REQUIRED`) — a regra de "não registrar" se aplica
 * aos dois da mesma forma.
 */
const CONFIRMATION_REQUIRED_CODES = new Set([
  'GIT_MUTATION_CONFIRMATION_REQUIRED',
  'GIT_SYNC_CONFIRMATION_REQUIRED',
]);

/**
 * Confirmação ausente/expirada é uma falha de protocolo do cliente antes de
 * qualquer tentativa de mutação — não é o resultado de uma operação Git, por
 * isso não entra no histórico (mesma leitura de "operações somente leitura
 * não entram nesse histórico" aplicada ao passo anterior à execução).
 */
function isConfirmationRequiredError(error: unknown): boolean {
  const code = errorCodeOf(error);
  return code !== undefined && CONFIRMATION_REQUIRED_CODES.has(code);
}

/**
 * Executa uma mutação Git já catalogada e registra o resultado no histórico
 * persistente — sucesso ou falha controlada, nunca a mensagem/erro bruto.
 * Uma falha ao gravar o histórico nunca é propagada: o resultado da mutação
 * em si (retorno ou exceção original) é sempre o que chega ao chamador.
 */
export async function withGitMutationHistory<T>(
  historyService: GitMutationHistoryService,
  project: ProjectLike,
  operationId: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    await historyService.record({
      projectId: project.id,
      ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
      operationId,
      result: 'succeeded',
    }).catch(() => {});
    return result;
  } catch (error) {
    if (!isConfirmationRequiredError(error)) {
      await historyService.record({
        projectId: project.id,
        ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
        operationId,
        result: 'failed',
        errorCode: errorCodeOf(error) ?? 'GIT_COMMAND_FAILED',
      }).catch(() => {});
    }
    throw error;
  }
}
