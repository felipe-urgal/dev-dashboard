import {
  EnvironmentProfileRepository,
  ProjectFavoriteRepository,
  RetentionSettingsRepository,
  WorkspaceRepository,
} from '@dev-dashboard/core';

import {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ProjectStore } from './store/project-store.js';
import { GitService } from './services/git-service.js';
import { DashboardGitService } from './services/dashboard-git-service.js';
import { GitMutationHistoryService } from './services/git-mutation-history-service.js';
import { TestDetectionService } from './services/test-detection-service.js';
import { TestExecutionHistoryService } from './services/test-execution-history-service.js';
import { DatabaseDetectionService } from './services/database-detection-service.js';
import { DatabaseSnapshotService } from './services/database-snapshot-service.js';
import { RailsInspectionService } from './services/rails-inspection-service.js';
import { RailsRuntimeService } from './services/rails-runtime-service.js';
import { BundlerInspectionService } from './services/bundler-inspection-service.js';
import { ProjectEnvironmentService } from './services/project-environment-service.js';
import { ScriptDetectionService } from './services/script-detection-service.js';
import { ScriptExecutionService } from './services/script-execution-service.js';
import { ActivityService } from './services/activity-service.js';
import { ProjectEditorService } from './services/project-editor-service.js';
import { ProjectBrowserService } from './services/project-browser-service.js';
import { ProjectFileService } from './services/project-file-service.js';
import { ServerHealthCheckService } from './services/server-health-check-service.js';
import { AiAssistantService } from './services/ai-assistant-service.js';
import { ProjectWorkspaceEditService } from './services/project-workspace-edit-service.js';
import { ProjectLanguageServerService } from './services/project-language-server-service.js';
import { ProjectTerminalService } from './services/project-terminal-service.js';
import { ProjectCoverageService } from './services/project-coverage-service.js';
import { ProjectCoverageHistoryService } from './services/project-coverage-history-service.js';

export interface AppContext {
  workspaceRepository: WorkspaceRepository;
  retentionSettingsRepository: RetentionSettingsRepository;
  environmentProfileRepository: EnvironmentProfileRepository;
  projectFavoriteRepository: ProjectFavoriteRepository;
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  projectStore: ProjectStore;
  gitService: GitService;
  gitMutationHistoryService: GitMutationHistoryService;
  testDetectionService: TestDetectionService;
  testExecutionHistoryService: TestExecutionHistoryService;
  projectCoverageService: ProjectCoverageService;
  projectCoverageHistoryService: ProjectCoverageHistoryService;
  databaseDetectionService: DatabaseDetectionService;
  databaseSnapshotService: DatabaseSnapshotService;
  railsInspectionService: RailsInspectionService;
  railsRuntimeService: RailsRuntimeService;
  bundlerInspectionService: BundlerInspectionService;
  projectEnvironmentService: ProjectEnvironmentService;
  scriptDetectionService: ScriptDetectionService;
  scriptExecutionService: ScriptExecutionService;
  activityService: ActivityService;
  projectEditorService: ProjectEditorService;
  projectBrowserService: ProjectBrowserService;
  projectFileService: ProjectFileService;
  serverHealthCheckService: ServerHealthCheckService;
  projectWorkspaceEditService: ProjectWorkspaceEditService;
  projectLanguageServerService: ProjectLanguageServerService;
  projectTerminalService: ProjectTerminalService;
  aiAssistantService: AiAssistantService;
}

export function createAppContext(): AppContext {
  const retentionSettingsRepository = new RetentionSettingsRepository();
  const scriptDetectionService = new ScriptDetectionService();
  const processManager = new ProcessManager();
  const projectStore = new ProjectStore();
  const scriptExecutionService = new ScriptExecutionService(
    scriptDetectionService,
  );
  const databaseDetectionService = new DatabaseDetectionService();
  const gitService = new DashboardGitService();
  const gitMutationHistoryService = new GitMutationHistoryService();
  const projectFileService = new ProjectFileService();
  const projectWorkspaceEditService = new ProjectWorkspaceEditService(
    projectFileService,
  );
  const projectLanguageServerService = new ProjectLanguageServerService({
    projectFileService,
  });
  const projectTerminalService = new ProjectTerminalService();
  return {
    workspaceRepository: new WorkspaceRepository(),
    retentionSettingsRepository,
    environmentProfileRepository: new EnvironmentProfileRepository(),
    projectFavoriteRepository: new ProjectFavoriteRepository(),
    processManager,
    serverSettingsRepository: new ProjectServerSettingsRepository(),
    projectStore,
    gitService,
    gitMutationHistoryService,
    testDetectionService: new TestDetectionService(),
    testExecutionHistoryService: new TestExecutionHistoryService(
      processManager,
    ),
    projectCoverageService: new ProjectCoverageService(),
    projectCoverageHistoryService: new ProjectCoverageHistoryService(),
    databaseDetectionService,
    databaseSnapshotService: new DatabaseSnapshotService(
      databaseDetectionService,
      processManager.stateDirectory,
    ),
    railsInspectionService: new RailsInspectionService(),
    railsRuntimeService: new RailsRuntimeService(processManager),
    bundlerInspectionService: new BundlerInspectionService(),
    projectEnvironmentService: new ProjectEnvironmentService(),
    scriptDetectionService,
    scriptExecutionService,
    activityService: new ActivityService(
      projectStore,
      processManager,
      scriptExecutionService,
    ),
    projectEditorService: new ProjectEditorService(),
    projectBrowserService: new ProjectBrowserService(),
    projectFileService,
    serverHealthCheckService: new ServerHealthCheckService(),
    projectWorkspaceEditService,
    projectLanguageServerService,
    projectTerminalService,
    aiAssistantService: new AiAssistantService(
      projectFileService,
      gitService,
      undefined,
      projectWorkspaceEditService,
      projectLanguageServerService,
    ),
  };
}
