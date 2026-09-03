import {
  EnvironmentProfileRepository,
  ProjectDisabledRepository,
  RetentionSettingsRepository,
  WorkspaceRepository,
} from '@dev-dashboard/core';
import {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ProjectStore } from './store/project-store.js';
import { DashboardGitService } from './services/dashboard-git-service.js';
import { GitMutationHistoryService } from './services/git-mutation-history-service.js';
import { TestDetectionService } from './services/test-detection-service.js';
import { TestExecutionHistoryService } from './services/test-execution-history-service.js';
import { DatabaseDetectionService } from './services/database-detection-service.js';
import { DatabaseSnapshotService } from './services/database-snapshot-service.js';
import { DatabaseExplorerService } from './services/database-explorer-service.js';
import { DatabaseReadonlyService } from './services/database-readonly-service.js';
import { RailsInspectionService } from './services/rails-inspection-service.js';
import { RailsRuntimeService } from './services/rails-runtime-service.js';
import { BundlerInspectionService } from './services/bundler-inspection-service.js';
import { ProjectEnvironmentService } from './services/project-environment-service.js';
import { ScriptDetectionService } from './services/script-detection-service.js';
import { ScriptExecutionService } from './services/script-execution-service.js';
import { ProjectBrowserService } from './services/project-browser-service.js';
import { ProjectFileService } from './services/project-file-service.js';
import { ServerHealthCheckService } from './services/server-health-check-service.js';
import { ProjectWorkspaceEditService } from './services/project-workspace-edit-service.js';
import {
  ProjectLanguageServerService,
  type LanguageServerLogger,
} from './services/project-language-server-service.js';
import { ProjectTerminalService } from './services/project-terminal-service.js';
import { DetachableExecutionService } from './services/detachable-execution-service.js';
import { ProjectTestPtyService } from './services/project-test-pty-service.js';
import { RailsMigrationPtyService } from './services/rails-migration-pty-service.js';
import { ProjectDependenciesPtyService } from './services/project-dependencies-pty-service.js';
import { ProjectCoverageService } from './services/project-coverage-service.js';
import { ProjectCoverageHistoryService } from './services/project-coverage-history-service.js';
import {
  SelfUpdateHandoffService,
  type SelfUpdateShutdownRequester,
} from './services/self-update-handoff-service.js';

export interface AppContextDomainOptions {
  languageServerLogger?: LanguageServerLogger;
  selfUpdateShutdownRequester?: SelfUpdateShutdownRequester;
}

export function createFoundationContextDomain() {
  return {
    workspaceRepository: new WorkspaceRepository(),
    retentionSettingsRepository: new RetentionSettingsRepository(),
    environmentProfileRepository: new EnvironmentProfileRepository(),
    projectDisabledRepository: new ProjectDisabledRepository(),
    processManager: new ProcessManager(),
    serverSettingsRepository: new ProjectServerSettingsRepository(),
    projectStore: new ProjectStore(),
  };
}

export function createProjectContextDomain(
  options: AppContextDomainOptions = {},
) {
  const projectFileService = new ProjectFileService();
  const projectWorkspaceEditService = new ProjectWorkspaceEditService(
    projectFileService,
  );
  const projectLanguageServerService = new ProjectLanguageServerService({
    projectFileService,
    ...(options.languageServerLogger
      ? { logger: options.languageServerLogger }
      : {}),
  });

  return {
    gitService: new DashboardGitService(),
    gitMutationHistoryService: new GitMutationHistoryService(),
    projectCoverageService: new ProjectCoverageService(),
    projectCoverageHistoryService: new ProjectCoverageHistoryService(),
    projectEnvironmentService: new ProjectEnvironmentService(),
    projectBrowserService: new ProjectBrowserService(),
    projectFileService,
    serverHealthCheckService: new ServerHealthCheckService(),
    projectWorkspaceEditService,
    projectLanguageServerService,
    projectTerminalService: new ProjectTerminalService(),
  };
}

export function createExecutionContextDomain(processManager: ProcessManager) {
  const scriptDetectionService = new ScriptDetectionService();
  const testDetectionService = new TestDetectionService();
  const detachableExecutionService = new DetachableExecutionService();

  return {
    scriptDetectionService,
    scriptExecutionService: new ScriptExecutionService(scriptDetectionService),
    testDetectionService,
    testExecutionHistoryService: new TestExecutionHistoryService(
      processManager,
    ),
    detachableExecutionService,
    projectTestPtyService: new ProjectTestPtyService(
      detachableExecutionService,
      testDetectionService,
    ),
    railsInspectionService: new RailsInspectionService(),
    railsMigrationPtyService: new RailsMigrationPtyService(
      detachableExecutionService,
    ),
    railsRuntimeService: new RailsRuntimeService(processManager),
    bundlerInspectionService: new BundlerInspectionService(),
    projectDependenciesPtyService: new ProjectDependenciesPtyService(
      detachableExecutionService,
      scriptDetectionService,
    ),
  };
}

export function createDatabaseContextDomain(processManager: ProcessManager) {
  const databaseDetectionService = new DatabaseDetectionService();
  const databaseReadonlyService = new DatabaseReadonlyService();

  return {
    databaseDetectionService,
    databaseSnapshotService: new DatabaseSnapshotService(
      databaseDetectionService,
      processManager.stateDirectory,
    ),
    databaseExplorerService: new DatabaseExplorerService(
      databaseReadonlyService,
    ),
  };
}

function defaultSelfUpdateShutdownRequester(): void {
  setImmediate(() => {
    process.kill(process.pid, 'SIGTERM');
  });
}

export function createSelfUpdateContextDomain(
  options: AppContextDomainOptions = {},
) {
  return {
    selfUpdateHandoffService: new SelfUpdateHandoffService({
      requestShutdown:
        options.selfUpdateShutdownRequester ??
        defaultSelfUpdateShutdownRequester,
    }),
  };
}
