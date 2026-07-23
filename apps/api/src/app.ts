import Fastify, { type FastifyInstance } from 'fastify';

import { healthRoutes } from './routes/health.js';

import { projectRoutes } from './routes/projects.js';

import { processRoutes } from './routes/processes.js';

import { workspaceRoutes } from './routes/workspaces.js';

import { LocalTokenStore } from '@dev-dashboard/core';

import { registerLocalSecurity } from './security/local-security.js';

export interface BuildAppOptions {
  localToken?: string;
  allowedOrigins?: readonly string[];
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  const localToken =
    options.localToken ?? (await new LocalTokenStore().getOrCreate());

  await registerLocalSecurity(app, {
    token: localToken,
    ...(options.allowedOrigins
      ? {
          allowedOrigins: options.allowedOrigins,
        }
      : {}),
  });

  app.register(healthRoutes, {
    prefix: '/api',
  });

  app.register(workspaceRoutes, {
    prefix: '/api',
  });

  app.register(projectRoutes, {
    prefix: '/api',
  });

  app.register(processRoutes, {
    prefix: '/api',
  });

  return app;
}
