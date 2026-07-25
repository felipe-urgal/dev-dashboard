import Fastify from 'fastify';

import { directoryRoutes } from './routes/directories.js';

import { healthRoutes } from './routes/health.js';

import { projectRoutes } from './routes/projects.js';

import { processRoutes } from './routes/processes.js';

import { workspaceRoutes } from './routes/workspaces.js';

import { LocalTokenStore } from '@dev-dashboard/core';

import { registerLocalSecurity } from './security/local-security.js';

import { registerApiErrorHandling } from './http/api-error.js';

import {
  createAppContext,
  type AppContext,
} from './app-context.js';

export interface BuildAppOptions {
  localToken?: string;
  allowedOrigins?: readonly string[];
  context?: AppContext;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  registerApiErrorHandling(app);

  const context = options.context ?? createAppContext();

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

  app.register(directoryRoutes, {
    prefix: '/api',
  });

  app.register(workspaceRoutes, {
    prefix: '/api',
    workspaceRepository: context.workspaceRepository,
    processManager: context.processManager,
    projectStore: context.projectStore,
  });

  app.register(projectRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitService: context.gitService,
  });

  app.register(processRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    serverSettingsRepository:
      context.serverSettingsRepository,
    projectStore: context.projectStore,
  });

  return app;
}
