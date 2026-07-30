import Fastify from 'fastify';

import { directoryRoutes } from './routes/directories.js';

import { healthRoutes } from './routes/health.js';

import { projectRoutes } from './routes/projects.js';
import { projectReadmeRoutes } from './routes/project-readme.js';
import { gitWorkspaceRoutes } from './routes/git-workspace.js';
import { gitSyncRoutes } from './routes/git-sync.js';
import { gitPullRequestRoutes } from './routes/git-pull-request.js';
import { gitCommitDetailsRoutes } from './routes/git-commit-details.js';
import { gitCurrentBranchHistoryRoutes } from './routes/git-current-branch-history.js';
import { gitExclusiveBranchHistoryRoutes } from './routes/git-exclusive-branch-history.js';
import { gitStashRoutes } from './routes/git-stash.js';
import { gitBranchDeleteRoutes } from './routes/git-branch-delete.js';

import { processRoutes } from './routes/processes.js';

import { testRoutes } from './routes/tests.js';
import { databaseRoutes } from './routes/database.js';
import { railsRoutes } from './routes/rails.js';
import { bundlerRoutes } from './routes/bundler.js';
import { scriptRoutes } from './routes/scripts.js';
import { activityRoutes } from './routes/activities.js';
import { settingsRoutes } from './routes/settings.js';

import { workspaceRoutes } from './routes/workspaces.js';

import { LocalTokenStore } from '@dev-dashboard/core';

import { registerLocalSecurity } from './security/local-security.js';

import { registerApiErrorHandling } from './http/api-error.js';
import { registerStaticDashboard } from './http/static-dashboard.js';

import {
  createAppContext,
  type AppContext,
} from './app-context.js';

export interface BuildAppOptions {
  localToken?: string;
  allowedOrigins?: readonly string[];
  context?: AppContext;
  frontendDirectory?: string;
  staticDashboardEnabled?: boolean;
  localOrigin?: string;
  sessionSecret?: string;
  browserBootstrapToken?: string;
  sessionTtlSeconds?: number;
  now?: () => number;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  registerApiErrorHandling(app, { registerNotFound: !options.staticDashboardEnabled });

  const context = options.context ?? createAppContext();
  app.addHook('onClose', async () => {
    context.scriptExecutionService.close();
    context.testExecutionHistoryService.close();
  });

  const localToken =
    options.localToken ?? (await new LocalTokenStore().getOrCreate());

  await registerLocalSecurity(app, {
    token: localToken,
    sessionSecret: options.sessionSecret ?? localToken,
    ...(options.browserBootstrapToken
      ? { browserBootstrapToken: options.browserBootstrapToken }
      : {}),
    localOrigin: options.localOrigin ?? 'http://127.0.0.1:4343',
    ...(options.sessionTtlSeconds ? { sessionTtlSeconds: options.sessionTtlSeconds } : {}),
    ...(options.now ? { now: options.now } : {}),
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
    testDetectionService: context.testDetectionService,
  });

  app.register(projectRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitService: context.gitService,
  });

  app.register(gitWorkspaceRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitSyncRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitPullRequestRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitCommitDetailsRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitCurrentBranchHistoryRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitExclusiveBranchHistoryRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitStashRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitBranchDeleteRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(projectReadmeRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(processRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    serverSettingsRepository:
      context.serverSettingsRepository,
    projectStore: context.projectStore,
  });

  app.register(testRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    projectStore: context.projectStore,
    testDetectionService: context.testDetectionService,
    testExecutionHistoryService: context.testExecutionHistoryService,
  });

  app.register(databaseRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    databaseDetectionService: context.databaseDetectionService,
  });

  app.register(railsRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    railsInspectionService: context.railsInspectionService,
  });

  app.register(bundlerRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    bundlerInspectionService: context.bundlerInspectionService,
  });

  app.register(scriptRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    scriptDetectionService: context.scriptDetectionService,
    scriptExecutionService: context.scriptExecutionService,
  });

  app.register(activityRoutes, {
    prefix: '/api',
    activityService: context.activityService,
  });

  app.register(settingsRoutes, {
    prefix: '/api',
    retentionSettingsRepository: context.retentionSettingsRepository,
  });

  if (options.staticDashboardEnabled) {
    if (!options.frontendDirectory) throw new Error('O diretório do frontend é obrigatório para distribuição local.');
    await registerStaticDashboard(app, options.frontendDirectory);
  }

  return app;
}
