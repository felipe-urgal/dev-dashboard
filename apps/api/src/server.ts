import { buildApp } from './app.js';

const DEFAULT_PORT = 4343;
const HOST = '127.0.0.1';

function resolvePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${value}`);
  }

  return port;
}

const app = await buildApp();
const port = resolvePort(process.env.DEV_DASHBOARD_API_PORT);

async function shutdown(signal: string): Promise<void> {
  app.log.info(
    {
      signal,
    },
    'Encerrando Dev Dashboard API',
  );

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(
      {
        error,
      },
      'Falha ao encerrar Dev Dashboard API',
    );

    process.exit(1);
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  const address = await app.listen({
    host: HOST,
    port,
  });

  app.log.info(
    {
      address,
    },
    'Dev Dashboard API iniciada',
  );
} catch (error) {
  app.log.error(
    {
      error,
    },
    'Falha ao iniciar Dev Dashboard API',
  );

  process.exitCode = 1;
}
