import {
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
import { TestDetectionService } from './services/test-detection-service.js';
import { TestExecutionHistoryService } from './services/test-execution-history-service.js';
import { DatabaseDetectionService } from './services/database-detection-service.js';
import { DatabaseSnapshotService } from './services/database-snapshot-service.js';
import { RailsInspectionService } from './services/rails-inspection-service.js';
import { BundlerInspectionService } from './services/bundler-inspection-service.js';
import { ScriptDetectionService } from './services/script-detection-service.js';
import { ScriptExecutionService } from './services/script-execution-service.js';
import { ActivityService } from './services/activity-service.js';
import { ProjectEditorService } from './services/project-editor-service.js';
import { ProjectFileService } from './services/project-file-service.js';
import { ServerHealthCheckService } from './services/server-health-check-service.js';
import { AiAssistantService } from './services/ai-assistant-service.js';

export interface AppContext {
  workspaceRepository: WorkspaceRepository;
  retentionSettingsRepository: RetentionSettingsRepository;
  projectFavoriteRepository: ProjectFavoriteRepository;
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  projectStore: ProjectStore;
  gitService: GitService;
  testDetectionService: TestDetectionService;
  testExecutionHistoryService: TestExecutionHistoryService;
  databaseDetectionService: DatabaseDetectionService;
  databaseSnapshotService: DatabaseSnapshotService;
  railsInspectionService: RailsInspectionService;
  bundlerInspectionService: BundlerInspectionService;
  scriptDetectionService: ScriptDetectionService;
  scriptExecutionService: ScriptExecutionService;
  activityService: ActivityService;
  projectEditorService: ProjectEditorService;
  projectFileService: ProjectFileService;
  serverHealthCheckService: ServerHealthCheckService;
  aiAssistantService: AiAssistantService;
}

export function createAppContext(): AppContext {
  const retentionSettingsRepository = new RetentionSettingsRepository();
  const scriptDetectionService = new ScriptDetectionService();
  const processManager = new ProcessManager();
  const projectStore = new ProjectStore();
  const scriptExecutionService = new ScriptExecutionService(scriptDetectionService);
  const databaseDetectionService = new DatabaseDetectionService();
  const gitService = new DashboardGitService();
  const projectFileService = new ProjectFileService();
  return {
    workspaceRepository: new WorkspaceRepository(),
    retentionSettingsRepository,
    projectFavoriteRepository: new ProjectFavoriteRepository(),
    processManager,
    serverSettingsRepository:
      new ProjectServerSettingsRepository(),
    projectStore,
    gitService,
    testDetectionService: new TestDetectionService(),
    testExecutionHistoryService: new TestExecutionHistoryService(processManager),
    databaseDetectionService,
    databaseSnapshotService: new DatabaseSnapshotService(databaseDetectionService, processManager.stateDirectory),
    railsInspectionService: new RailsInspectionService(),
    bundlerInspectionService: new BundlerInspectionService(),
    scriptDetectionService,
    scriptExecutionService,
    activityService: new ActivityService(projectStore, processManager, scriptExecutionService),
    projectEditorService: new ProjectEditorService(),
    projectFileService,
    serverHealthCheckService: new ServerHealthCheckService(),
    aiAssistantService: new AiAssistantService(projectFileService, gitService),
  };
}
