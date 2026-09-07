import { buildApp } from './app.js';
import { readServerConfig } from './server-config.js';
import { createServerShutdown } from './server-shutdown.js';

const config = await readServerConfig();
const app = await buildApp({
  staticDashboardEnabled: config.staticDashboardEnabled,
  localOrigin: config.localOrigin,
  ...(config.browserBootstrapToken
    ? { browserBootstrapToken: config.browserBootstrapToken }
    : {}),
  ...(config.frontendDirectory
    ? { frontendDirectory: config.frontendDirectory }
    : {}),
});
const port = config.port;
const shutdown = createServerShutdown(app);

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
