import type {
  EnvironmentProfileRepository,
  ProjectDisabledRepository,
  RetentionSettingsRepository,
  WorkspaceRepository,
} from '@dev-dashboard/core';
import type {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import type { ProjectStore } from './store/project-store.js';
import type { GitService } from './services/git-service.js';
import type { GitMutationHistoryService } from './services/git-mutation-history-service.js';
import type { TestDetectionService } from './services/test-detection-service.js';
import type { TestExecutionHistoryService } from './services/test-execution-history-service.js';
import type { DatabaseDetectionService } from './services/database-detection-service.js';
import type { DatabaseSnapshotService } from './services/database-snapshot-service.js';
import type { DatabaseExplorerService } from './services/database-explorer-service.js';
import type { RailsInspectionService } from './services/rails-inspection-service.js';
import type { RailsRuntimeService } from './services/rails-runtime-service.js';
import type { BundlerInspectionService } from './services/bundler-inspection-service.js';
import type { ProjectEnvironmentService } from './services/project-environment-service.js';
import type { ScriptDetectionService } from './services/script-detection-service.js';
import type { ScriptExecutionService } from './services/script-execution-service.js';
import type { ProjectBrowserService } from './services/project-browser-service.js';
import type { ProjectFileService } from './services/project-file-service.js';
import type { ServerHealthCheckService } from './services/server-health-check-service.js';
import type { ProjectWorkspaceEditService } from './services/project-workspace-edit-service.js';
import type { ProjectLanguageServerService } from './services/project-language-server-service.js';
import type { ProjectTerminalService } from './services/project-terminal-service.js';
import type { DetachableExecutionService } from './services/detachable-execution-service.js';
import type { ProjectTestPtyService } from './services/project-test-pty-service.js';
import type { RailsMigrationPtyService } from './services/rails-migration-pty-service.js';
import type { ProjectDependenciesPtyService } from './services/project-dependencies-pty-service.js';
import type { ProjectCoverageService } from './services/project-coverage-service.js';
import type { ProjectCoverageHistoryService } from './services/project-coverage-history-service.js';
import type { SelfUpdateHandoffService } from './services/self-update-handoff-service.js';
import {
  createDatabaseContextDomain,
  createExecutionContextDomain,
  createFoundationContextDomain,
  createProjectContextDomain,
  createSelfUpdateContextDomain,
  type AppContextDomainOptions,
} from './app-context-domains.js';

export interface AppContext {
  workspaceRepository: WorkspaceRepository;
  retentionSettingsRepository: RetentionSettingsRepository;
  environmentProfileRepository: EnvironmentProfileRepository;
  projectDisabledRepository: ProjectDisabledRepository;
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  projectStore: ProjectStore;
  gitService: GitService;
  gitMutationHistoryService: GitMutationHistoryService;
  testDetectionService: TestDetectionService;
  testExecutionHistoryService: TestExecutionHistoryService;
  projectTestPtyService: ProjectTestPtyService;
  projectCoverageService: ProjectCoverageService;
  projectCoverageHistoryService: ProjectCoverageHistoryService;
  databaseDetectionService: DatabaseDetectionService;
  databaseSnapshotService: DatabaseSnapshotService;
  databaseExplorerService: DatabaseExplorerService;
  railsInspectionService: RailsInspectionService;
  railsMigrationPtyService: RailsMigrationPtyService;
  railsRuntimeService: RailsRuntimeService;
  bundlerInspectionService: BundlerInspectionService;
  projectEnvironmentService: ProjectEnvironmentService;
  scriptDetectionService: ScriptDetectionService;
  scriptExecutionService: ScriptExecutionService;
  projectDependenciesPtyService: ProjectDependenciesPtyService;
  projectBrowserService: ProjectBrowserService;
  projectFileService: ProjectFileService;
  serverHealthCheckService: ServerHealthCheckService;
  projectWorkspaceEditService: ProjectWorkspaceEditService;
  projectLanguageServerService: ProjectLanguageServerService;
  projectTerminalService: ProjectTerminalService;
  selfUpdateHandoffService: SelfUpdateHandoffService;
  /** Recurso interno compartilhado pelas superfícies PTY; opcional para preservar contexts customizados de testes. */
  detachableExecutionService?: DetachableExecutionService;
}

export type CreateAppContextOptions = AppContextDomainOptions;

export function createAppContext(
  options: CreateAppContextOptions = {},
): AppContext {
  const foundation = createFoundationContextDomain();

  return {
    ...foundation,
    ...createProjectContextDomain(options),
    ...createExecutionContextDomain(foundation.processManager),
    ...createDatabaseContextDomain(foundation.processManager),
    ...createSelfUpdateContextDomain(options),
  };
}
