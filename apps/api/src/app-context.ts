import { RetentionSettingsRepository, WorkspaceRepository } from '@dev-dashboard/core';

import {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ProjectStore } from './store/project-store.js';
import { GitService } from './services/git-service.js';
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
import { DockerComposeService } from './services/docker-compose-service.js';
import { ServerHealthCheckService } from './services/server-health-check-service.js';

export interface AppContext {
  workspaceRepository: WorkspaceRepository;
  retentionSettingsRepository: RetentionSettingsRepository;
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
  dockerComposeService: DockerComposeService;
  serverHealthCheckService: ServerHealthCheckService;
}

export function createAppContext(): AppContext {
  const retentionSettingsRepository = new RetentionSettingsRepository();
  const scriptDetectionService = new ScriptDetectionService();
  const processManager = new ProcessManager();
  const projectStore = new ProjectStore();
  const scriptExecutionService = new ScriptExecutionService(scriptDetectionService);
  const databaseDetectionService = new DatabaseDetectionService();
  return {
    workspaceRepository: new WorkspaceRepository(),
    retentionSettingsRepository,
    processManager,
    serverSettingsRepository:
      new ProjectServerSettingsRepository(),
    projectStore,
    gitService: new GitService(),
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
    dockerComposeService: new DockerComposeService({ processManager }),
    serverHealthCheckService: new ServerHealthCheckService(),
  };
}
