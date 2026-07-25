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
}

export function createAppContext(): AppContext {
  const scriptDetectionService = new ScriptDetectionService();
  return {
    workspaceRepository: new WorkspaceRepository(),
    processManager: new ProcessManager(),
    serverSettingsRepository:
      new ProjectServerSettingsRepository(),
    projectStore: new ProjectStore(),
    gitService: new GitService(),
    testDetectionService: new TestDetectionService(),
    databaseDetectionService: new DatabaseDetectionService(),
    scriptDetectionService,
    scriptExecutionService: new ScriptExecutionService(scriptDetectionService),
  };
}
