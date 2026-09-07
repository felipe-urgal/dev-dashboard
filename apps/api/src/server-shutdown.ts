export const DEFAULT_API_SHUTDOWN_TIMEOUT_MS = 8_000;

interface ShutdownLogger {
  info(bindings: Record<string, unknown>, message: string): void;
  error(bindings: Record<string, unknown>, message: string): void;
}

export interface ShutdownApp {
  close(): Promise<void>;
  log: ShutdownLogger;
}

export interface ShutdownTimer {
  clear(): void;
}

export type ShutdownScheduler = (
  callback: () => void,
  timeoutMs: number,
) => ShutdownTimer;

export interface ServerShutdownOptions {
  timeoutMs?: number;
  exit?: (code: number) => void;
  schedule?: ShutdownScheduler;
}

function defaultSchedule(
  callback: () => void,
  timeoutMs: number,
): ShutdownTimer {
  const timer = setTimeout(callback, timeoutMs);
  return {
    clear() {
      clearTimeout(timer);
    },
  };
}

/**
 * Encerra a API de forma graciosa, mas com deadline menor que o timeout do
 * worker de self-update. Assim, um recurso preso em `app.close()` não impede
 * o handoff externo de observar a API antiga como encerrada e prosseguir.
 */
export function createServerShutdown(
  app: ShutdownApp,
  options: ServerShutdownOptions = {},
): (signal: string) => Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_API_SHUTDOWN_TIMEOUT_MS;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const schedule = options.schedule ?? defaultSchedule;
  let running: Promise<void> | null = null;

  return (signal: string): Promise<void> => {
    if (running) return running;

    app.log.info({ signal }, 'Encerrando Dev Dashboard API');
    running = (async () => {
      const deadline = schedule(() => {
        app.log.error(
          { signal, timeoutMs },
          'Shutdown gracioso excedeu o limite; forçando encerramento da API',
        );
        exit(0);
      }, timeoutMs);

      try {
        await app.close();
        deadline.clear();
        exit(0);
      } catch (error) {
        deadline.clear();
        app.log.error({ error, signal }, 'Falha ao encerrar Dev Dashboard API');
        exit(1);
      }
    })();

    return running;
  };
}
