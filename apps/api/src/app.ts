import Fastify from 'fastify';
import websocket from '@fastify/websocket';

import { directoryRoutes } from './routes/directories.js';

import { healthRoutes } from './routes/health.js';
import { attentionRoutes } from './routes/attention.js';
import { taskContextRoutes } from './routes/task-contexts.js';
import { activityRoutes } from './routes/activity.js';
import { agentRuntimeRoutes } from './routes/agent-runtime.js';
import { hostServiceRoutes } from './routes/host-services.js';
import { serviceCatalogRoutes } from './routes/service-catalog.js';
import { projectServiceBindingRoutes } from './routes/project-service-bindings.js';
import { serviceRuntimeProfileRoutes } from './routes/service-runtime-profiles.js';
import { serviceLifecyclePlanRoutes } from './routes/service-lifecycle-plans.js';
import { systemdLifecycleCapabilitiesRoutes } from './routes/systemd-lifecycle-capabilities.js';
import { confirmedLifecycleReconciliationRoutes } from './routes/confirmed-lifecycle-reconciliation.js';

import { projectRoutes } from './routes/projects.js';
import { projectCoverageRoutes } from './routes/project-coverage.js';
import { deploymentRoutes } from './routes/deployments.js';
import { productionOverviewRoutes } from './routes/production-overview.js';
import { deploymentSudoRoutes } from './routes/deployment-sudo.js';
import { gitMutationRoutes } from './routes/git-mutations.js';
import { gitMutationHistoryRoutes } from './routes/git-mutation-history.js';
import { projectFileRoutes } from './routes/project-files.js';
import { projectFileMutationRoutes } from './routes/project-file-mutations.js';
import { projectWorkspaceEditRoutes } from './routes/project-workspace-edits.js';
import { projectLanguageServerRoutes } from './routes/project-language-server.js';
import { projectTerminalRoutes } from './routes/project-terminal.js';
import { gitWorkspaceRoutes } from './routes/git-workspace.js';
import { EnvironmentInstanceCleanupService } from './services/environment-instance-cleanup-service.js';
import { GitWorktreeRemovalResourceGuardService } from './services/git-worktree-removal-resource-guard.js';
import { GitSyncProgressService } from './services/git-sync-progress-service.js';
import { SystemdServiceInventory } from './services/systemd-service-inventory.js';
import { SystemdLifecycleCapabilitiesService } from './services/systemd-lifecycle-capabilities-service.js';
import { SystemdUserLifecycleGrantPolicy } from './services/systemd-user-lifecycle-authorization.js';
import { ServiceCatalogService } from './services/service-catalog-service.js';
import { ServiceDiagnosticsService } from './services/service-diagnostics-service.js';
import { ProjectServiceBindingService } from './services/project-service-binding-service.js';
import { ServiceRuntimeProfileService } from './services/service-runtime-profile-service.js';
import { ServiceLifecyclePlanningService } from './services/service-lifecycle-planning-service.js';
import { ConfirmedLifecycleReconciliationService } from './services/confirmed-lifecycle-reconciliation-service.js';
import { ConfirmedLifecycleRecoveryReviewService } from './services/confirmed-lifecycle-recovery-review-service.js';
import { ServiceResourceLeaseInspector } from './services/service-resource-lease-inspector.js';
import { DockerContainerObserver } from './services/docker-container-observer.js';
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
import { databaseExplorerSessionRoutes } from './routes/database-explorer-sessions.js';
import { railsRoutes } from './routes/rails.js';
import { scriptRoutes } from './routes/scripts.js';
import { scriptHistoryRoutes } from './routes/script-history.js';
import { settingsRoutes } from './routes/settings.js';
import { projectBrowserRoutes } from './routes/project-browser.js';

import { workspaceRoutes } from './routes/workspaces.js';

import { LocalTokenStore } from '@dev-dashboard/core';

import { registerLocalSecurity } from './security/local-security.js';

import { registerApiErrorHandling } from './http/api-error.js';
import { handleMalformedUrl } from './http/router-options.js';
import { registerStaticDashboard } from './http/static-dashboard.js';
import {
  createAppComposition,
  registerAppLifecycle,
  type AppCompositionOptions,
} from './app-composition.js';
import { createAppContext, type AppContext } from './app-context.js';

export interface BuildAppOptions extends AppCompositionOptions {
  hostServiceInventory?: Pick<SystemdServiceInventory, 'inspect'>;
  serviceCatalog?: Pick<ServiceCatalogService, 'inspect'>;
  systemdCapabilities?: Pick<SystemdLifecycleCapabilitiesService, 'inspect'>;
  /** Trusted server bootstrap only; never a browser-selected path. */
  systemdUserGrantPolicyPath?: string;
  serviceDiagnostics?: Pick<ServiceDiagnosticsService, 'read'>;
  serviceResourceLeaseInspector?: Pick<
    ServiceResourceLeaseInspector,
    'inspect'
  >;
  localToken?: string;
  allowedOrigins?: readonly string[];
  context?: AppContext;
  frontendDirectory?: string;
  staticDashboardEnabled?: boolean;
  localOrigin?: string;
  sessionSecret?: string;
  browserBootstrapToken?: string;
  sessionTtlSeconds?: number;
  /** Trusted server injection only. Disabled until recovery review is supported. */
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
    routerOptions: {
      onBadUrl: handleMalformedUrl,
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
    });
  const composition = createAppComposition(context, options);
  const {
    databaseExplorerSessionStore,
    devContainerCleanupService,
    portInspectorService,
    projectFileMutationService,
    projectWorkspaceEditService,
    projectLanguageServerService,
    projectTerminalService,
    deploymentService,
    productionOverviewService,
    taskContextService,
    activitySnapshotService,
    confirmedLifecycleJobs,
    attentionCenterService,
    dockerComposeProvider,
    dockerComposeOwnershipStore,
    agentRuntimeApiService,
    agentRuntimeRealtimeService,
  } = composition;
  registerAppLifecycle(app, context, composition);
  const gitSyncProgressService = new GitSyncProgressService();

  const gitWorktreeRemovalResourceGuard =
    new GitWorktreeRemovalResourceGuardService({
      processManager: context.processManager,
      projectStore: context.projectStore,
      developmentEnvironmentInstanceStore:
        context.developmentEnvironmentInstanceStore,
      projectTerminalService,
      dockerComposeOwnershipStore,
      devContainerCleanupService,
    });

  const environmentInstanceCleanupService =
    new EnvironmentInstanceCleanupService({
      processManager: context.processManager,
      projectTerminalService,
      projectStore: context.projectStore,
      dockerComposeOwnershipStore,
      devContainerCleanupService,
      developmentEnvironmentInstanceStore:
        context.developmentEnvironmentInstanceStore,
      ...(context.detachableExecutionService
        ? {
            detachableExecutionService: context.detachableExecutionService,
          }
        : {}),
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
      ? { allowedOrigins: options.allowedOrigins }
      : {}),
  });

  app.register(healthRoutes, { prefix: '/api' });
  app.register(directoryRoutes, { prefix: '/api' });

  app.register(workspaceRoutes, {
    prefix: '/api',
    workspaceRepository: context.workspaceRepository,
    projectDisabledRepository: context.projectDisabledRepository,
    processManager: context.processManager,
    projectStore: context.projectStore,
    testDetectionService: context.testDetectionService,
  });

  app.register(attentionRoutes, {
    prefix: '/api',
    workspaceRepository: context.workspaceRepository,
    projectStore: context.projectStore,
    attentionCenterService,
  });

  app.register(taskContextRoutes, {
    prefix: '/api',
    taskContextService,
  });

  app.register(activityRoutes, {
    prefix: '/api',
    activitySnapshotService,
  });

  app.register(agentRuntimeRoutes, {
    prefix: '/api',
    agentRuntimeApiService,
    agentRuntimeRealtimeService,
  });

  const systemdInventory =
    options.hostServiceInventory ?? new SystemdServiceInventory();
  app.register(hostServiceRoutes, {
    prefix: '/api',
    inventory: systemdInventory,
  });

  const catalog =
    options.serviceCatalog ??
    new ServiceCatalogService({
      systemd: systemdInventory,
      containers: new DockerContainerObserver(),
      processManager: context.processManager,
      portInspector: portInspectorService,
      projectStore: context.projectStore,
      composeProvider: dockerComposeProvider,
      composeOwnership: dockerComposeOwnershipStore,
    });
  app.register(serviceCatalogRoutes, {
    prefix: '/api',
    catalog,
  });

  app.register(projectServiceBindingRoutes, {
    prefix: '/api',
    bindings: new ProjectServiceBindingService({
      store: context.projectServiceBindingStore,
      profiles: context.serviceRuntimeProfileStore,
      projectStore: context.projectStore,
      environmentStore: context.developmentEnvironmentInstanceStore,
      catalog,
      composeProvider: dockerComposeProvider,
      composeOwnership: dockerComposeOwnershipStore,
    }),
  });

  app.register(serviceRuntimeProfileRoutes, {
    prefix: '/api',
    profiles: new ServiceRuntimeProfileService({
      profiles: context.serviceRuntimeProfileStore,
      projects: context.projectStore,
      environments: context.developmentEnvironmentInstanceStore,
      bindings: context.projectServiceBindingStore,
    }),
  });

  const systemdCapabilities =
    options.systemdCapabilities ??
    new SystemdLifecycleCapabilitiesService(
      {
        projects: context.projectStore,
        environments: context.developmentEnvironmentInstanceStore,
        bindings: context.projectServiceBindingStore,
        inventory: systemdInventory,
        grants: new SystemdUserLifecycleGrantPolicy({
          ...(options.systemdUserGrantPolicyPath
            ? { policyPath: options.systemdUserGrantPolicyPath }
            : {}),
          ...(options.now ? { now: () => new Date(options.now!()) } : {}),
        }),
      },
      options.now ? { now: () => new Date(options.now!()) } : {},
    );
  app.register(systemdLifecycleCapabilitiesRoutes, {
    prefix: '/api',
    capabilities: systemdCapabilities,
  });
  app.register(serviceLifecyclePlanRoutes, {
    prefix: '/api',
    planner: new ServiceLifecyclePlanningService({
      bindings: context.projectServiceBindingStore,
      profiles: context.serviceRuntimeProfileStore,
      projects: context.projectStore,
      environments: context.developmentEnvironmentInstanceStore,
      catalog,
      systemdCapabilities,
    }),
  });

  const lifecycleReconciliation = new ConfirmedLifecycleReconciliationService({
    journal: confirmedLifecycleJobs,
    projects: context.projectStore,
    catalog,
  });
  app.register(confirmedLifecycleReconciliationRoutes, {
    prefix: '/api',
    reconciliation: lifecycleReconciliation,
    recovery: new ConfirmedLifecycleRecoveryReviewService(
      {
        reconciliation: lifecycleReconciliation,
        leases:
          options.serviceResourceLeaseInspector ??
          new ServiceResourceLeaseInspector(
            context.processManager.stateDirectory,
          ),
        activity: context.activityEventRepository,
      },
      options.now ? { now: () => new Date(options.now!()) } : {},
    ),
  });

  app.register(projectRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectDisabledRepository: context.projectDisabledRepository,
    gitService: context.gitService,
  });

  app.register(projectCoverageRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    projectCoverageService: context.projectCoverageService,
    projectCoverageHistoryService: context.projectCoverageHistoryService,
  });

  app.register(deploymentRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    deploymentService,
  });

  app.register(productionOverviewRoutes, {
    prefix: '/api',
    workspaceRepository: context.workspaceRepository,
    projectStore: context.projectStore,
    productionOverviewService,
  });

  app.register(deploymentSudoRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
  });

  app.register(gitMutationRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitService: context.gitService,
    gitMutationHistoryService: context.gitMutationHistoryService,
    gitSyncProgressService,
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
    gitSyncProgressService,
  });
  app.register(gitPullRequestRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
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
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    projectTerminalService,
  });
  app.register(projectBrowserRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    processManager: context.processManager,
    projectBrowserService: context.projectBrowserService,
  });

  app.register(processRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    serverSettingsRepository: context.serverSettingsRepository,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    portInspectorService,
  });

  app.register(testRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    testDetectionService: context.testDetectionService,
    testExecutionHistoryService: context.testExecutionHistoryService,
    projectTestPtyService: context.projectTestPtyService,
    projectCoverageService: context.projectCoverageService,
    projectCoverageHistoryService: context.projectCoverageHistoryService,
  });
  app.register(testRelatedRoutes, {
    prefix: '/api',
    processManager: context.processManager,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    testDetectionService: context.testDetectionService,
    testExecutionHistoryService: context.testExecutionHistoryService,
  });

  app.register(databaseRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    databaseDetectionService: context.databaseDetectionService,
    databaseSnapshotService: context.databaseSnapshotService,
    databaseExplorerService: context.databaseExplorerService,
  });
  app.register(databaseExplorerSessionRoutes, {
    prefix: '/api',
    databaseExplorerService: context.databaseExplorerService,
    databaseExplorerSessionStore,
  });

  app.register(railsRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    railsInspectionService: context.railsInspectionService,
    railsRuntimeService: context.railsRuntimeService,
    railsMigrationPtyService: context.railsMigrationPtyService,
  });
  app.register(scriptRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    scriptDetectionService: context.scriptDetectionService,
    scriptExecutionService: context.scriptExecutionService,
  });
  app.register(scriptHistoryRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    scriptExecutionService: context.scriptExecutionService,
  });
  app.register(settingsRoutes, {
    prefix: '/api',
    environmentProfileRepository: context.environmentProfileRepository,
  });

  if (options.staticDashboardEnabled) {
    if (!options.frontendDirectory) {
      throw new Error(
        'O diretório do frontend é obrigatório para distribuição local.',
      );
    }
    await registerStaticDashboard(app, options.frontendDirectory, {
      ...(options.browserBootstrapToken
        ? { browserBootstrapToken: options.browserBootstrapToken }
        : {}),
    });
  }

  return app;
}
