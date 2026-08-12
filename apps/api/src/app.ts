import Fastify from 'fastify';
import websocket from '@fastify/websocket';

import { directoryRoutes } from './routes/directories.js';

import { healthRoutes } from './routes/health.js';

import { projectRoutes } from './routes/projects.js';
import { projectDoctorRoutes } from './routes/project-doctor.js';
import { projectCoverageRoutes } from './routes/project-coverage.js';
import { gitMutationRoutes } from './routes/git-mutations.js';
import { gitMutationHistoryRoutes } from './routes/git-mutation-history.js';
import { projectReadmeRoutes } from './routes/project-readme.js';
import { projectFileRoutes } from './routes/project-files.js';
import { projectFileMutationRoutes } from './routes/project-file-mutations.js';
import { projectWorkspaceEditRoutes } from './routes/project-workspace-edits.js';
import { projectLanguageServerRoutes } from './routes/project-language-server.js';
import { projectTerminalRoutes } from './routes/project-terminal.js';
import { gitWorkspaceRoutes } from './routes/git-workspace.js';
import { gitSyncRoutes } from './routes/git-sync.js';
import { gitPullRequestRoutes } from './routes/git-pull-request.js';
import { gitPullRequestMutationRoutes } from './routes/git-pull-request-mutations.js';
import { gitUndoRoutes } from './routes/git-undo.js';
import { gitCommitDetailsRoutes } from './routes/git-commit-details.js';
import { gitCurrentBranchHistoryRoutes } from './routes/git-current-branch-history.js';
import { gitExclusiveBranchHistoryRoutes } from './routes/git-exclusive-branch-history.js';
import { gitBranchDeleteRoutes } from './routes/git-branch-delete.js';
import { gitBranchRenameRoutes } from './routes/git-branch-rename.js';
import { gitFileMutationRoutes } from './routes/git-file-mutations.js';

import { processRoutes } from './routes/processes.js';

import { testRoutes } from './routes/tests.js';
import { testRelatedRoutes } from './routes/test-related.js';
import { databaseRoutes } from './routes/database.js';
import { railsRoutes } from './routes/rails.js';
import { bundlerRoutes } from './routes/bundler.js';
import { projectEnvironmentRoutes } from './routes/project-environment.js';
import { scriptRoutes } from './routes/scripts.js';
import { scriptHistoryRoutes } from './routes/script-history.js';
import { dependenciesPtyRoutes } from './routes/dependencies-pty-routes.js';
import { settingsRoutes } from './routes/settings.js';
import { projectBrowserRoutes } from './routes/project-browser.js';
import { aiAssistantRoutes } from './routes/ai-assistant.js';
import { aiProviderRoutes } from './routes/ai-providers.js';

import { workspaceRoutes } from './routes/workspaces.js';

import { LocalTokenStore } from '@dev-dashboard/core';

import { registerLocalSecurity } from './security/local-security.js';

import { registerApiErrorHandling } from './http/api-error.js';
import { registerStaticDashboard } from './http/static-dashboard.js';
import { ProjectDoctorService } from './services/project-doctor-service.js';
import { PortInspectorService } from './services/port-inspector-service.js';
import { ProjectFileMutationService } from './services/project-file-mutation-service.js';
import { ProjectLanguageServerService } from './services/project-language-server-service.js';
import { ProjectTerminalService } from './services/project-terminal-service.js';

import { createAppContext, type AppContext } from './app-context.js';

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
  projectDoctorService?: ProjectDoctorService;
  portInspectorService?: PortInspectorService;
  projectLanguageServerService?: ProjectLanguageServerService;
  projectTerminalService?: ProjectTerminalService;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024,
      perMessageDeflate: false,
    },
  });

  registerApiErrorHandling(app, {
    registerNotFound: !options.staticDashboardEnabled,
  });

  const context =
    options.context ??
    createAppContext({
      languageServerLogger: app.log,
      aiExecutionMetricsLogger: app.log,
    });
  const projectDoctorService =
    options.projectDoctorService ??
    new ProjectDoctorService(options.now ? { now: options.now } : {});
  const portInspectorService =
    options.portInspectorService ?? new PortInspectorService();
  const projectFileMutationService = new ProjectFileMutationService(
    options.now ?? Date.now,
  );
  const projectWorkspaceEditService = context.projectWorkspaceEditService;
  const projectLanguageServerService =
    options.projectLanguageServerService ??
    context.projectLanguageServerService;
  const projectTerminalService =
    options.projectTerminalService ?? context.projectTerminalService;
  app.addHook('onClose', async () => {
    context.aiImplementationExecutionService.close();
    context.gitAiCodeReviewService.close();
    context.scriptExecutionService.close();
    context.testExecutionHistoryService.close();
    projectLanguageServerService.close();
    projectTerminalService.close();
  });

  const localToken =
    options.localToken ?? (await new LocalTokenStore().getOrCreate());

  await registerLocalSecurity(app, {
    token: localToken,
    ...(options.sessionSecret ? { sessionSecret: options.sessionSecret } : {}),
    ...(options.browserBootstrapToken
      ? { browserBootstrapToken: options.browserBootstrapToken }
      : {}),
    localOrigin: options.localOrigin ?? 'http://127.0.0.1:4343',
    ...(options.sessionTtlSeconds
      ? { sessionTtlSeconds: options.sessionTtlSeconds }
      : {}),
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
    projectDisabledRepository: context.projectDisabledRepository,
    processManager: context.processManager,
    projectStore: context.projectStore,
    testDetectionService: context.testDetectionService,
  });

  app.register(projectRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectDisabledRepository: context.projectDisabledRepository,
    gitService: context.gitService,
  });

  app.register(projectDoctorRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectDoctorService,
  });

  app.register(projectCoverageRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectCoverageService: context.projectCoverageService,
    projectCoverageHistoryService: context.projectCoverageHistoryService,
  });

  app.register(gitMutationRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitService: context.gitService,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(gitMutationHistoryRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(gitWorkspaceRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(gitSyncRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(gitPullRequestRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitAiCodeReviewService: context.gitAiCodeReviewService,
  });

  app.register(gitPullRequestMutationRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(gitUndoRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitMutationHistoryService: context.gitMutationHistoryService,
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

  app.register(gitBranchDeleteRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(gitBranchRenameRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(gitFileMutationRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitService: context.gitService,
    gitMutationHistoryService: context.gitMutationHistoryService,
  });

  app.register(projectReadmeRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectFileService: context.projectFileService,
  });

  app.register(projectFileRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectFileService: context.projectFileService,
  });

  app.register(projectFileMutationRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectFileMutationService,
  });

  app.register(projectWorkspaceEditRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectWorkspaceEditService,
  });

  app.register(projectLanguageServerRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectLanguageServerService,
  });

  app.register(projectTerminalRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectTerminalService,
  });

  app.register(projectBrowserRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    processManager: context.processManager,
    projectBrowserService: context.projectBrowserService,
  });

  app.register(aiProviderRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    aiProviderResolver: context.aiProviderResolver,
  });

  app.register(aiAssistantRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    aiProviderResolver: context.aiProviderResolver,
    aiImplementationExecutionService: context.aiImplementationExecutionService,
  });

  app.register(processRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    serverSettingsRepository: context.serverSettingsRepository,
    serverHealthCheckService: context.serverHealthCheckService,
    projectStore: context.projectStore,
    portInspectorService,
  });

  app.register(testRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    projectStore: context.projectStore,
    testDetectionService: context.testDetectionService,
    testExecutionHistoryService: context.testExecutionHistoryService,
    projectTestPtyService: context.projectTestPtyService,
  });

  app.register(testRelatedRoutes, {
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
    databaseSnapshotService: context.databaseSnapshotService,
  });

  app.register(railsRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    railsInspectionService: context.railsInspectionService,
    railsRuntimeService: context.railsRuntimeService,
    railsMigrationPtyService: context.railsMigrationPtyService,
  });

  app.register(bundlerRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    bundlerInspectionService: context.bundlerInspectionService,
  });

  app.register(projectEnvironmentRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectEnvironmentService: context.projectEnvironmentService,
  });

  app.register(scriptRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    scriptDetectionService: context.scriptDetectionService,
    scriptExecutionService: context.scriptExecutionService,
  });

  app.register(scriptHistoryRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    scriptExecutionService: context.scriptExecutionService,
  });

  app.register(dependenciesPtyRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectDependenciesPtyService: context.projectDependenciesPtyService,
  });

  app.register(settingsRoutes, {
    prefix: '/api',
    environmentProfileRepository: context.environmentProfileRepository,
  });

  if (options.staticDashboardEnabled) {
    if (!options.frontendDirectory)
      throw new Error(
        'O diretório do frontend é obrigatório para distribuição local.',
      );
    await registerStaticDashboard(app, options.frontendDirectory);
  }

  return app;
}
