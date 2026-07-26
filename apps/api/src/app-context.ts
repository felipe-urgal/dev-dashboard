import { WorkspaceRepository } from '@dev-dashboard/core';

import {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ProjectStore } from './store/project-store.js';
import { GitService } from './services/git-service.js';
import { TestDetectionService } from './services/test-detection-service.js';
import { DatabaseDetectionService } from './services/database-detection-service.js';
import { ScriptDetectionService } from './services/script-detection-service.js';
import { ScriptExecutionService } from './services/script-execution-service.js';
import { ActivityService } from './services/activity-service.js';

export interface AppContext {
  workspaceRepository: WorkspaceRepository;
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  projectStore: ProjectStore;
  gitService: GitService;
  testDetectionService: TestDetectionService;
  databaseDetectionService: DatabaseDetectionService;
  scriptDetectionService: ScriptDetectionService;
  scriptExecutionService: ScriptExecutionService;
  activityService: ActivityService;
}

export function createAppContext(): AppContext {
  const scriptDetectionService = new ScriptDetectionService();
  const processManager = new ProcessManager();
  const projectStore = new ProjectStore();
  const scriptExecutionService = new ScriptExecutionService(scriptDetectionService);
  return {
    workspaceRepository: new WorkspaceRepository(),
    processManager,
    serverSettingsRepository:
      new ProjectServerSettingsRepository(),
    projectStore,
    gitService: new GitService(),
    testDetectionService: new TestDetectionService(),
    databaseDetectionService: new DatabaseDetectionService(),
    scriptDetectionService,
    scriptExecutionService,
    activityService: new ActivityService(projectStore, processManager, scriptExecutionService),
  };
}
