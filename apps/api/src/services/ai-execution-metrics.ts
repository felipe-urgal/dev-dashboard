import type {
  AiErrorCode,
  AiExecutionMode,
  AiProviderId,
} from '@dev-dashboard/contracts';

/**
 * Subconjunto mÃ­nimo do logger do Fastify (`app.log`) que as executions de IA
 * precisam para mÃ©tricas â evita acoplar os serviÃ§os ao tipo completo de
 * `FastifyBaseLogger`.
 */
export interface AiExecutionMetricsLogger {
  info: (context: Record<string, unknown>, message: string) => void;
}

export interface AiExecutionTerminalMetrics {
  executionKind: 'code-review';
  executionId: string;
  projectId: string;
  provider: AiProviderId;
  mode: AiExecutionMode;
  status: string;
  startedAt: string;
  finishedAt: string;
  errorCode?: AiErrorCode;
}

/**
 * Emite uma mÃ©trica estruturada quando uma execution de IA (implementation ou
 * Code Review) chega a um estado terminal. SÃ³ contexto allowlistado sai daqui
 * â nunca prompt, diff, resumo ou qualquer conteÃºdo do projeto.
 */
export function logAiExecutionTerminal(
  logger: AiExecutionMetricsLogger | undefined,
  metrics: AiExecutionTerminalMetrics,
): void {
  if (!logger) return;
  const durationMs = Math.max(
    0,
    new Date(metrics.finishedAt).getTime() -
      new Date(metrics.startedAt).getTime(),
  );
  logger.info(
    {
      executionKind: metrics.executionKind,
      executionId: metrics.executionId,
      projectId: metrics.projectId,
      provider: metrics.provider,
      mode: metrics.mode,
      status: metrics.status,
      durationMs,
      ...(metrics.errorCode ? { errorCode: metrics.errorCode } : {}),
    },
    'AI execution finished',
  );
}
