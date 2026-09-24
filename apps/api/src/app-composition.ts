import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import {
  AgentAuditStore,
  AgentBudgetStore,
  AgentProviderPreferenceStore,
  AgentRuntimeStateStore,
  AgentTaskLockManager,
  AgentUsageStore,
  AgentWorkflowRuntime,
  BrowserBridge,
  GitAgentTaskStore,
  HttpBrowserBridgeClient,
  createDefaultAgentIntegrationCapabilityRegistry,
  createDefaultAgentIntegrationProviderRegistry,
  createLocalAgentProviderRegistry,
  readBrowserBridgeToken,
  type AgentProviderExecutionRequest,
  type BrowserBridgePort,
} from '@dev-dashboard/agent-runtime';

import type { AppContext } from './app-context.js';
import { DeploymentService } from './deployment/service.js';
import { ProductionOverviewService } from './deployment/production-overview.js';
import { ActivitySnapshotService } from './services/activity-snapshot-service.js';
import {
  AgentRuntimeApiService,
  type AgentRuntimeApiServicePort,
} from './services/agent-runtime-api-service.js';
import { AgentRuntimeRealtimeService } from './services/agent-runtime-realtime-service.js';
import { DockerComposeLifecycleService } from './services/docker-compose-lifecycle-service.js';
import { DockerComposeOwnershipStore } from './services/docker-compose-ownership-store.js';
import { DockerComposePreflightService } from './services/docker-compose-preflight-service.js';
import { DockerComposeProvider } from './services/docker-compose-provider.js';
import { AttentionCenterService } from './services/attention-center-service.js';
import { ProjectDoctorService } from './services/project-doctor-service.js';
import { PortInspectorService } from './services/port-inspector-service.js';
import { PortAllocationLeaseRegistry } from './services/port-registry-service.js';
import { ProjectFileMutationService } from './services/project-file-mutation-service.js';
import { ProjectDependencyHealthService } from './services/project-dependency-health-service.js';
import { ProjectDependencyUpgradePlanService } from './services/project-dependency-upgrade-plan-service.js';
import { GitPullRequestService } from './services/git-pull-request-service.js';
import { GitPullRequestStatusService } from './services/git-pull-request-status-service.js';
import type { ProjectLanguageServerService } from './services/project-language-server-service.js';
import type { ProjectTerminalService } from './services/project-terminal-service.js';
import { DatabaseExplorerSessionStore } from './services/database-explorer-session-store.js';
import { LocalCiDiscoveryService } from './services/local-ci-discovery-service.js';
import { LocalCiExecutionService } from './services/local-ci-execution-service.js';
import { MigrationOverviewService } from './services/migration-overview-service.js';
import { MigrationMutationConfirmationService } from './services/migration-mutation-confirmation-service.js';
import { MigrationMutationExecutionService } from './services/migration-mutation-execution-service.js';
import { MigrationMutationPlanningService } from './services/migration-mutation-planning-service.js';
import type { MigrationMutationProvider } from './services/migration-mutation-provider.js';
import type { MigrationProvider } from './services/migration-provider.js';
import { PrismaMigrationProvider } from './services/prisma-migration-provider.js';
import { RailsMigrationMutationProvider } from './services/rails-migration-mutation-provider.js';
import { ReleaseReadinessService } from './services/release-readiness-service.js';
import { TaskContextService } from './services/task-context-service.js';
import type { SecurityScannerProvider } from './services/security-scanner-provider.js';
import { SecurityScanSnapshotStore } from './services/security-scan-snapshot-store.js';
import { TrivySecurityProvider } from './services/trivy-security-provider.js';
import type { SecurityScanResult } from './services/trivy-security-scanner.js';

export interface AgentBrowserRuntimePort {
  bridge: BrowserBridgePort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export interface AppCompositionOptions {
  now?: () => number;
  dockerComposeProvider?: Pick<DockerComposeProvider, 'inspect'>;
  dockerComposePreflightService?: Pick<
    DockerComposePreflightService,
    'inspect'
  >;
  dockerComposeLifecycleService?: Pick<
    DockerComposeLifecycleService,
    'start' | 'stop' | 'restart' | 'logs' | 'reconcile'
  >;
  dockerComposeOwnershipStore?: Pick<
    DockerComposeOwnershipStore,
    'get' | 'claim' | 'release'
  >;
  projectDoctorService?: ProjectDoctorService;
  portInspectorService?: PortInspectorService;
  projectLanguageServerService?: ProjectLanguageServerService;
  projectTerminalService?: ProjectTerminalService;
  deploymentService?: DeploymentService;
  releaseReadinessService?: Pick<ReleaseReadinessService, 'getSnapshot'>;
  dependencyHealthService?: Pick<ProjectDependencyHealthService, 'inspect'>;
  dependencyUpgradePlanService?: Pick<
    ProjectDependencyUpgradePlanService,
    'inspect'
  >;
  migrationProviders?: readonly MigrationProvider[];
  migrationMutationProviders?: readonly MigrationMutationProvider[];
  localCiDiscoveryService?: Pick<LocalCiDiscoveryService, 'discover'>;
  localCiExecutionService?: Pick<
    LocalCiExecutionService,
    'start' | 'get' | 'reattach' | 'cancel' | 'shutdown'
  >;
  securityScannerProvider?: SecurityScannerProvider<SecurityScanResult>;
  securityScanSnapshotStore?: Pick<SecurityScanSnapshotStore, 'get' | 'save'>;
  agentBrowserRuntime?: AgentBrowserRuntimePort;
  agentRuntimeApiService?: AgentRuntimeApiServicePort;
}

/**
 * Constrói somente serviços que pertencem ao lifecycle de uma instância do
 * Fastify. Serviços compartilhados/estruturais continuam no AppContext.
 */
export function createAppComposition(
  context: AppContext,
  options: AppCompositionOptions = {},
) {
  const databaseExplorerSessionStore = new DatabaseExplorerSessionStore(
    options.now ? { now: options.now } : {},
  );
  const projectDoctorService =
    options.projectDoctorService ??
    new ProjectDoctorService(options.now ? { now: options.now } : {});
  const portInspectorService =
    options.portInspectorService ?? new PortInspectorService();
  const dockerComposeProvider =
    options.dockerComposeProvider ?? new DockerComposeProvider();
  const dockerComposePreflightService =
    options.dockerComposePreflightService ??
    new DockerComposePreflightService(portInspectorService);
  const dockerComposePortLeaseRegistry = new PortAllocationLeaseRegistry();
  const dockerComposeOwnershipStore =
    options.dockerComposeOwnershipStore ??
    new DockerComposeOwnershipStore(
      path.join(
        context.processManager.stateDirectory,
        'docker-compose-ownership.json',
      ),
      options.now ? { now: () => new Date(options.now!()) } : {},
    );
  const dockerComposeLifecycleService =
    options.dockerComposeLifecycleService ??
    new DockerComposeLifecycleService(
      dockerComposeProvider,
      dockerComposePreflightService,
      undefined,
      {
        ownershipStore: dockerComposeOwnershipStore,
        portLeaseRegistry: dockerComposePortLeaseRegistry,
        ...(options.now ? { now: () => new Date(options.now!()) } : {}),
      },
    );
  const projectFileMutationService = new ProjectFileMutationService(
    options.now ?? Date.now,
  );
  const projectLanguageServerService =
    options.projectLanguageServerService ??
    context.projectLanguageServerService;
  const projectTerminalService =
    options.projectTerminalService ?? context.projectTerminalService;
  const deploymentService =
    options.deploymentService ??
    new DeploymentService({
      selfUpdateHandoffService: context.selfUpdateHandoffService,
      ...(options.now ? { now: options.now } : {}),
    });
  const productionOverviewService = new ProductionOverviewService({
    deploymentReader: deploymentService,
    ...(options.now ? { now: options.now } : {}),
  });
  const attentionCenterService = new AttentionCenterService({
    processReader: context.processManager,
    gitReader: context.gitService,
    testHistoryReader: context.testExecutionHistoryService,
    doctorReader: projectDoctorService,
    productionReader: productionOverviewService,
    ...(options.now ? { now: options.now } : {}),
  });
  const now = options.now;
  const railsMigrationMutationProvider = new RailsMigrationMutationProvider(
    context.railsInspectionService,
  );
  const migrationOverviewService = new MigrationOverviewService(
    [
      ...(options.migrationProviders ?? []),
      railsMigrationMutationProvider,
      new PrismaMigrationProvider(),
    ],
    now ? { now: () => new Date(now()) } : {},
  );
  const migrationMutationPlanningService = new MigrationMutationPlanningService(
    options.migrationMutationProviders ?? [railsMigrationMutationProvider],
    migrationOverviewService,
    context.developmentEnvironmentInstanceStore,
    now ? { now: () => new Date(now()) } : {},
  );
  const migrationMutationConfirmationService =
    new MigrationMutationConfirmationService(
      undefined,
      options.now ?? Date.now,
    );
  const migrationMutationExecutionService = context.detachableExecutionService
    ? new MigrationMutationExecutionService(
        migrationMutationPlanningService,
        migrationMutationConfirmationService,
        context.detachableExecutionService,
      )
    : undefined;
  const securityScanSnapshotStore =
    options.securityScanSnapshotStore ??
    new SecurityScanSnapshotStore(
      path.join(context.processManager.stateDirectory, 'security-center'),
      options.now ? { now: () => new Date(options.now!()) } : {},
    );
  const pullRequestLookup = new GitPullRequestService();
  const pullRequestStatus = new GitPullRequestStatusService();
  const releaseReadinessService =
    options.releaseReadinessService ??
    new ReleaseReadinessService(
      context.gitService,
      context.testExecutionHistoryService,
      projectDoctorService,
      migrationOverviewService,
      {
        ...(options.now ? { now: options.now } : {}),
        pullRequestLookup,
        pullRequestStatus,
        productionOverview: productionOverviewService,
        securityScanSnapshotReader: securityScanSnapshotStore,
      },
    );
  const taskContextService = new TaskContextService(
    context.projectStore,
    context.developmentEnvironmentInstanceStore,
    context.gitService,
    context.taskContextRepository,
    options.now ? () => new Date(options.now!()) : () => new Date(),
    {
      pullRequestLookup,
      pullRequestStatus,
      readiness: releaseReadinessService,
    },
  );
  const dependencyHealthService =
    options.dependencyHealthService ??
    new ProjectDependencyHealthService(
      options.now ? { now: () => new Date(options.now!()) } : {},
    );
  const dependencyUpgradePlanService =
    options.dependencyUpgradePlanService ??
    new ProjectDependencyUpgradePlanService({ dependencyHealthService });
  const localCiDiscoveryService =
    options.localCiDiscoveryService ?? new LocalCiDiscoveryService();
  const localCiExecutionService =
    options.localCiExecutionService ??
    (context.detachableExecutionService
      ? new LocalCiExecutionService(
          localCiDiscoveryService,
          context.detachableExecutionService,
        )
      : undefined);
  const securityScannerProvider =
    options.securityScannerProvider ?? new TrivySecurityProvider();

  const agentBrowserRuntime = options.agentRuntimeApiService
    ? null
    : options.agentBrowserRuntime ??
      createAgentBrowserRuntime(
        path.join(context.processManager.stateDirectory, 'agent-runtime'),
        options.now,
      );
  const agentRuntimeApiService =
    options.agentRuntimeApiService ??
    createAgentRuntimeApiService(
      context,
      options,
      taskContextService,
      agentBrowserRuntime?.bridge ?? null,
    );
  const agentRuntimeRealtimeService = new AgentRuntimeRealtimeService(
    agentRuntimeApiService,
  );
  const activitySnapshotService = new ActivitySnapshotService({
    eventStore: context.activityEventRepository,
    gitHistory: context.gitMutationHistoryService,
    testHistory: context.testExecutionHistoryService,
    scriptHistory: context.scriptExecutionService,
    processReader: context.processManager,
    projectStore: context.projectStore,
    agentRuntime: agentRuntimeApiService,
    ...(options.now ? { now: () => new Date(options.now!()) } : {}),
  });

  return {
    databaseExplorerSessionStore,
    projectDoctorService,
    portInspectorService,
    dockerComposeProvider,
    dockerComposePreflightService,
    dockerComposeLifecycleService,
    dockerComposeOwnershipStore,
    dockerComposePortLeaseRegistry,
    projectFileMutationService,
    projectWorkspaceEditService: context.projectWorkspaceEditService,
    projectLanguageServerService,
    projectTerminalService,
    deploymentService,
    productionOverviewService,
    taskContextService,
    activitySnapshotService,
    attentionCenterService,
    releaseReadinessService,
    migrationOverviewService,
    migrationMutationPlanningService,
    migrationMutationConfirmationService,
    migrationMutationExecutionService,
    localCiDiscoveryService,
    localCiExecutionService,
    dependencyHealthService,
    dependencyUpgradePlanService,
    securityScannerProvider,
    securityScanSnapshotStore,
    agentBrowserRuntime,
    agentRuntimeApiService,
    agentRuntimeRealtimeService,
  };
}

function createAgentBrowserRuntime(
  stateDirectory: string,
  now?: () => number,
): AgentBrowserRuntimePort {
  const bridgeServer = new BrowserBridge({
    stateDir: stateDirectory,
    ...(now ? { now } : {}),
  });

  return {
    bridge: new HttpBrowserBridgeClient({
      getToken: () => readBrowserBridgeToken(stateDirectory),
    }),
    start: async () => {
      await bridgeServer.start();
    },
    close: async () => {
      await bridgeServer.close();
    },
  };
}

function createAgentRuntimeApiService(
  context: AppContext,
  options: AppCompositionOptions,
  taskContextService: Pick<TaskContextService, 'snapshot'>,
  browserBridge: BrowserBridgePort | null,
): AgentRuntimeApiService {
  const stateDirectory = path.join(
    context.processManager.stateDirectory,
    'agent-runtime',
  );
  const taskStore = new GitAgentTaskStore({
    repositoryDirectory: path.join(stateDirectory, 'tasks'),
  });
  const auditStore = new AgentAuditStore({ stateDirectory });
  const usageStore = new AgentUsageStore({ stateDirectory });
  const budgetStore = new AgentBudgetStore({ stateDirectory });
  const providerPreferenceStore = new AgentProviderPreferenceStore({
    stateDirectory,
  });
  const resolveCwd = (request: AgentProviderExecutionRequest): string => {
    const executionContext =
      context.developmentEnvironmentInstanceStore.resolveForProject(
        request.projectId,
        request.environmentInstanceId,
      );
    if (!executionContext || executionContext.runtime !== 'host') {
      throw new Error('Agent execution environment is unavailable.');
    }
    return executionContext.cwd;
  };
  const providerRegistry = createLocalAgentProviderRegistry({
    resolveAutomaticPreference: async (request) => {
      const preference = await providerPreferenceStore.get(request.projectId);
      return preference
        ? {
            preferredProviderId: preference.preferredProviderId,
            fallbackOrder: preference.fallbackOrder,
          }
        : null;
    },
    resolveCwd,
    ...(browserBridge
      ? {
          browser: {
            bridge: browserBridge,
            resolveCwd,
            ...(options.now
              ? { now: () => new Date(options.now!()).toISOString() }
              : {}),
          },
        }
      : {}),
    ...(options.now
      ? { now: () => new Date(options.now!()).toISOString() }
      : {}),
  });
  const workflowRuntime = new AgentWorkflowRuntime({
    taskStore,
    providerRegistry,
    checkpointStore: auditStore,
    executionResultStore: auditStore,
    gitRefVerifier: {
      verify: async (task, reference) => {
        const executionContext =
          context.developmentEnvironmentInstanceStore.resolveForProject(
            task.projectId,
            task.environmentInstanceId,
          );
        if (!executionContext || executionContext.runtime !== 'host') {
          return false;
        }

        try {
          const overview = await context.gitService.getOverview(
            executionContext.cwd,
          );
          return (
            overview.repository &&
            !overview.detached &&
            overview.branch === reference.branch &&
            overview.latestCommit?.hash.toLowerCase() ===
              reference.commitHash.toLowerCase()
          );
        } catch {
          return false;
        }
      },
    },
    runtimeStateStore: new AgentRuntimeStateStore({
      stateDirectory,
      ...(options.now ? { now: () => new Date(options.now!()) } : {}),
    }),
    lockManager: new AgentTaskLockManager({
      stateDirectory,
      ...(options.now ? { now: options.now } : {}),
    }),
    ...(options.now
      ? { now: () => new Date(options.now!()).toISOString() }
      : {}),
  });

  return new AgentRuntimeApiService({
    taskStore,
    auditStore,
    providerRegistry,
    providerPreferenceStore,
    integrationCapabilityRegistry:
      createDefaultAgentIntegrationCapabilityRegistry(),
    integrationProviderRegistry:
      createDefaultAgentIntegrationProviderRegistry(),
    workflowRuntime,
    projectStore: context.projectStore,
    developmentEnvironmentInstanceStore:
      context.developmentEnvironmentInstanceStore,
    taskContextRepository: context.taskContextRepository,
    taskContextSnapshotReader: taskContextService,
    activityEventStore: context.activityEventRepository,
    usageStore,
    budgetStore,
    ...(options.now
      ? { now: () => new Date(options.now!()).toISOString() }
      : {}),
  });
}

export type AppComposition = ReturnType<typeof createAppComposition>;

/**
 * Centraliza o shutdown dos recursos que sobrevivem a uma requisição. A
 * ordem preserva o comportamento anterior e adiciona o fechamento explícito
 * dos PTYs destacáveis compartilhados.
 */
export function registerAppLifecycle(
  app: FastifyInstance,
  context: AppContext,
  composition: AppComposition,
): void {
  app.addHook('onListen', async () => {
    try {
      await composition.agentBrowserRuntime?.start();
    } catch (error) {
      app.log.warn({ err: error }, 'agent browser bridge unavailable');
    }
  });

  app.addHook('onClose', async () => {
    context.scriptExecutionService.close();
    context.testExecutionHistoryService.close();
    composition.localCiExecutionService?.shutdown();
    composition.agentRuntimeRealtimeService.close();
    await composition.agentRuntimeApiService.shutdown();
    await composition.agentBrowserRuntime?.close();
    await context.detachableExecutionService?.close();
    composition.databaseExplorerSessionStore.close();
    composition.projectLanguageServerService.close();
    composition.projectTerminalService.close();
    composition.deploymentService.close();
  });
}
