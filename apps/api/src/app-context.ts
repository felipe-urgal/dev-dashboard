import { WorkspaceRepository } from '@dev-dashboard/core';

import {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ProjectStore } from './store/project-store.js';
import { GitService } from './services/git-service.js';
import { TestDetectionService } from './services/test-detection-service.js';

export interface AppContext {
  workspaceRepository: WorkspaceRepository;
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  projectStore: ProjectStore;
  gitService: GitService;
  testDetectionService: TestDetectionService;
}

export function createAppContext(): AppContext {
  return {
    workspaceRepository: new WorkspaceRepository(),
    processManager: new ProcessManager(),
    serverSettingsRepository:
      new ProjectServerSettingsRepository(),
    projectStore: new ProjectStore(),
    gitService: new GitService(),
    testDetectionService: new TestDetectionService(),
  };
}
