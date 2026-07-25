import { buildApp } from './app.js';
import { readServerConfig } from './server-config.js';

const config = await readServerConfig();
const app = await buildApp({
  staticDashboardEnabled: config.staticDashboardEnabled,
  localOrigin: config.localOrigin,
  ...(config.browserBootstrapToken
    ? { browserBootstrapToken: config.browserBootstrapToken }
    : {}),
  ...(config.frontendDirectory ? { frontendDirectory: config.frontendDirectory } : {}),
});
const port = config.port;

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
    host: config.host,
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
