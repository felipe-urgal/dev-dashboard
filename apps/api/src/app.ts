import Fastify from 'fastify';
import websocket from '@fastify/websocket';

import { directoryRoutes } from './routes/directories.js';

import { healthRoutes } from './routes/health.js';
import { attentionRoutes } from './routes/attention.js';
import { taskContextRoutes } from './routes/task-contexts.js';
import { activityRoutes } from './routes/activity.js';
import { agentRuntimeRoutes } from './routes/agent-runtime.js';
import { stackRoutes } from './routes/stacks.js';
import { hostServiceRoutes } from './routes/host-services.js';
import { localServiceRoutes } from './routes/local-services.js';
import { serviceCatalogRoutes } from './routes/service-catalog.js';
import { serviceDiagnosticsRoutes } from './routes/service-diagnostics.js';
import { projectServiceBindingRoutes } from './routes/project-service-bindings.js';
import { serviceRuntimeProfileRoutes } from './routes/service-runtime-profiles.js';
import { serviceLifecyclePlanRoutes } from './routes/service-lifecycle-plans.js';
import { systemdLifecycleCapabilitiesRoutes } from './routes/systemd-lifecycle-capabilities.js';
import { confirmedLifecycleReconciliationRoutes } from './routes/confirmed-lifecycle-reconciliation.js';

import { projectRoutes } from './routes/projects.js';
import { projectDoctorRoutes } from './routes/project-doctor.js';
import { devContainerRoutes } from './routes/dev-container.js';
import { releaseReadinessRoutes } from './routes/release-readiness.js';
import { dependencyHealthRoutes } from './routes/dependency-health.js';
import { dependencyUpgradePlanRoutes } from './routes/dependency-upgrade-plan.js';
import { migrationRoutes } from './routes/migrations.js';
import { localCiRoutes } from './routes/local-ci.js';
import { dockerComposeRoutes } from './routes/docker-compose.js';
import { projectCoverageRoutes } from './routes/project-coverage.js';
import { deploymentRoutes } from './routes/deployments.js';
import { productionOverviewRoutes } from './routes/production-overview.js';
import { deploymentSudoRoutes } from './routes/deployment-sudo.js';
import { gitMutationRoutes } from './routes/git-mutations.js';
import { gitMutationHistoryRoutes } from './routes/git-mutation-history.js';
import { projectReadmeRoutes } from './routes/project-readme.js';
import { projectFileRoutes } from './routes/project-files.js';
import { projectFileMutationRoutes } from './routes/project-file-mutations.js';
import { projectWorkspaceEditRoutes } from './routes/project-workspace-edits.js';
import { projectLanguageServerRoutes } from './routes/project-language-server.js';
import { projectTerminalRoutes } from './routes/project-terminal.js';
import { dashboardTerminalRoutes } from './routes/dashboard-terminal.js';
import { gitWorkspaceRoutes } from './routes/git-workspace.js';
import { EnvironmentInstanceCleanupService } from './services/environment-instance-cleanup-service.js';
import { GitWorktreeRemovalResourceGuardService } from './services/git-worktree-removal-resource-guard.js';
import { GitSyncProgressService } from './services/git-sync-progress-service.js';
import { DashboardTerminalService } from './services/dashboard-terminal-service.js';
import { StackDefinitionService } from './services/stack-definition-service.js';
import { StackDependencyDiscoveryService } from './services/stack-dependency-discovery-service.js';
import { StackCheckService } from './services/stack-check-service.js';
import { StackComposeHealthAdapter } from './services/stack-compose-health-adapter.js';
import { StackHealthCheckAdapter } from './services/stack-health-check-adapter.js';
import { StackLogsService } from './services/stack-logs-service.js';
import { StackRestartService } from './services/stack-restart-service.js';
import { StackStartService } from './services/stack-start-service.js';
import type { StackOperationJournal } from './services/stack-operation-journal.js';
import { StackStopService } from './services/stack-stop-service.js';
import { SystemdServiceInventory } from './services/systemd-service-inventory.js';
import { LocalServiceManager } from './services/local-service-manager.js';
import { SystemdLifecycleCapabilitiesService } from './services/systemd-lifecycle-capabilities-service.js';
import { SystemdUserLifecycleGrantPolicy } from './services/systemd-user-lifecycle-authorization.js';
import { ServiceCatalogService } from './services/service-catalog-service.js';
import { ServiceDiagnosticsService } from './services/service-diagnostics-service.js';
import { SystemdJournalReader } from './services/systemd-journal-reader.js';
import { ProjectServiceBindingService } from './services/project-service-binding-service.js';
import { ServiceRuntimeProfileService } from './services/service-runtime-profile-service.js';
import { ServiceLifecyclePlanningService } from './services/service-lifecycle-planning-service.js';
import { ConfirmedLifecycleReconciliationService } from './services/confirmed-lifecycle-reconciliation-service.js';
import { ConfirmedLifecycleRecoveryReviewService } from './services/confirmed-lifecycle-recovery-review-service.js';
import { ServiceResourceLeaseInspector } from './services/service-resource-lease-inspector.js';
import { DockerContainerObserver } from './services/docker-container-observer.js';
import { gitWorktreeRoutes } from './routes/git-worktrees.js';
import { gitSyncRoutes } from './routes/git-sync.js';
import { gitPullRequestRoutes } from './routes/git-pull-request.js';
import { gitPullRequestMutationRoutes } from './routes/git-pull-request-mutations.js';
import { githubIssuesRoutes } from './routes/github-issues.js';
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
import { bundlerRoutes } from './routes/bundler.js';
import { projectEnvironmentRoutes } from './routes/project-environment.js';
import { scriptRoutes } from './routes/scripts.js';
import { scriptHistoryRoutes } from './routes/script-history.js';
import { dependenciesPtyRoutes } from './routes/dependencies-pty-routes.js';
import { settingsRoutes } from './routes/settings.js';
import { projectBrowserRoutes } from './routes/project-browser.js';
import { securityCenterRoutes } from './routes/security-center.js';

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
  localServiceManager?: Pick<
    LocalServiceManager,
    'snapshot' | 'plan' | 'apply'
  >;
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
  stackOperationJournal?: StackOperationJournal;
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
  // Do not enable operation journaling for real host mutations by default:
  // a partial request may hold a conservative claim until manual review exists.
  const stackOperationJournal = options.stackOperationJournal;
  const composition = createAppComposition(context, {
    ...options,
    ...(stackOperationJournal
      ? { stackOperationJobs: stackOperationJournal }
      : {}),
  });
  const dashboardTerminalService = new DashboardTerminalService();
  const stackDefinitionService = new StackDefinitionService({
    stackStore: context.stackStore,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
  });
  app.addHook('onClose', () => {
    dashboardTerminalService.close();
  });
  const {
    databaseExplorerSessionStore,
    projectDoctorService,
    devContainerDiscoveryService,
    devContainerLifecyclePlanningService,
    devContainerLifecycleConfirmationService,
    devContainerStartService,
    devContainerCleanupService,
    devContainerStopConfirmationService,
    devContainerLifecycleExecutionService,
    devContainerRecoveryService,
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
    releaseReadinessService,
    dependencyHealthService,
    dependencyUpgradePlanService,
    migrationOverviewService,
    migrationMutationPlanningService,
    migrationMutationConfirmationService,
    migrationMutationExecutionService,
    localCiDiscoveryService,
    localCiExecutionService,
    dockerComposeProvider,
    dockerComposePreflightService,
    dockerComposeLifecycleService,
    dockerComposeLifecycleConfirmationService,
    dockerComposeLifecycleExecutionService,
    dockerComposeOwnershipStore,
    securityScannerProvider,
    securityScanSnapshotStore,
    agentRuntimeApiService,
    agentRuntimeRealtimeService,
  } = composition;
  registerAppLifecycle(app, context, composition);
  const stackDependencyDiscoveryService = new StackDependencyDiscoveryService({
    stackDefinitionService,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    dockerComposeProvider,
  });
  const stackComposeHealthAdapter = new StackComposeHealthAdapter({
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    ownershipStore: dockerComposeOwnershipStore,
    provider: dockerComposeProvider,
  });
  const stackHealthCheckAdapter = new StackHealthCheckAdapter({
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    processManager: context.processManager,
  });
  const stackCheckService = new StackCheckService(
    {
      stackStore: context.stackStore,
      developmentEnvironmentInstanceStore:
        context.developmentEnvironmentInstanceStore,
      processManager: context.processManager,
      composeHealthAdapter: stackComposeHealthAdapter,
      healthCheckAdapter: stackHealthCheckAdapter,
    },
    options.now ? { now: () => new Date(options.now!()) } : {},
  );
  const stackLogsService = new StackLogsService(
    {
      stackDefinitionService,
      projectStore: context.projectStore,
      developmentEnvironmentInstanceStore:
        context.developmentEnvironmentInstanceStore,
      dockerComposeLifecycleService,
      processManager: context.processManager,
    },
    options.now ? { now: () => new Date(options.now!()) } : {},
  );
  const stackRestartService = new StackRestartService({
    stackCheckService,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    dockerComposeLifecycleService,
    activityEvents: context.activityEventRepository,
  });
  const stackStartService = new StackStartService({
    stackCheckService,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    dockerComposeLifecycleService,
    activityEvents: context.activityEventRepository,
  });
  const stackStopService = new StackStopService({
    stackCheckService,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    dockerComposeLifecycleService,
    processManager: context.processManager,
    activityEvents: context.activityEventRepository,
  });

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
  app.register(localServiceRoutes, {
    prefix: '/api',
    manager:
      options.localServiceManager ??
      new LocalServiceManager({
        stateDirectory: context.processManager.stateDirectory,
      }),
    journal: new SystemdJournalReader(),
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

  app.register(serviceDiagnosticsRoutes, {
    prefix: '/api',
    diagnostics:
      options.serviceDiagnostics ??
      new ServiceDiagnosticsService(
        {
          projects: context.projectStore,
          bindings: context.projectServiceBindingStore,
          catalog,
          compose: dockerComposeLifecycleService,
          processes: context.processManager,
          activity: activitySnapshotService,
          journal: new SystemdJournalReader(),
        },
        options.now ? { now: () => new Date(options.now!()) } : {},
      ),
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

  app.register(stackRoutes, {
    prefix: '/api',
    ...(stackOperationJournal ? { stackOperationJournal } : {}),
    stackDefinitionService,
    stackDependencyDiscoveryService,
    stackCheckService,
    stackLogsService,
    stackRestartService,
    stackStartService,
    stackStopService,
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
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
  });

  app.register(devContainerRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    devContainerDiscoveryService,
    devContainerLifecyclePlanningService,
    devContainerLifecycleConfirmationService,
    devContainerStartService,
    devContainerCleanupService,
    devContainerStopConfirmationService,
    devContainerLifecycleExecutionService,
    devContainerRecoveryService,
  });

  app.register(releaseReadinessRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    releaseReadinessService,
  });

  app.register(dependencyHealthRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    dependencyHealthService,
  });

  app.register(dependencyUpgradePlanRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    dependencyUpgradePlanService,
  });

  app.register(migrationRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    migrationOverviewService,
    migrationMutationPlanningService,
    migrationMutationConfirmationService,
    migrationMutationExecutionService,
  });

  app.register(localCiRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    localCiDiscoveryService,
    localCiExecutionService,
  });

  app.register(dockerComposeRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    dockerComposeProvider,
    dockerComposePreflightService,
    dockerComposeLifecycleService,
    dockerComposeLifecycleConfirmationService,
    dockerComposeLifecycleExecutionService,
    dockerComposeOwnershipStore,
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
  app.register(gitWorktreeRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    gitWorktreeObserver: context.gitWorktreeObserver,
    gitWorktreeLifecycleService: context.gitWorktreeLifecycleService,
    removalResourceGuard: gitWorktreeRemovalResourceGuard,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    environmentInstanceCleanupService,
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
  app.register(githubIssuesRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
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
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    projectTerminalService,
  });
  app.register(dashboardTerminalRoutes, {
    prefix: '/api',
    dashboardTerminalService,
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
  app.register(bundlerRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    bundlerInspectionService: context.bundlerInspectionService,
  });
  app.register(projectEnvironmentRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    projectEnvironmentService: context.projectEnvironmentService,
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
  app.register(dependenciesPtyRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    projectDependenciesPtyService: context.projectDependenciesPtyService,
  });
  app.register(settingsRoutes, {
    prefix: '/api',
    environmentProfileRepository: context.environmentProfileRepository,
  });
  app.register(securityCenterRoutes, {
    prefix: '/api',
    projectStore: context.projectStore,
    securityScannerProvider,
    securityScanSnapshotStore,
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
