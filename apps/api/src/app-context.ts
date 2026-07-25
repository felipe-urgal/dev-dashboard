import { WorkspaceRepository } from '@dev-dashboard/core';

import {
  ProcessManager,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ProjectStore } from './store/project-store.js';

export interface AppContext {
  workspaceRepository: WorkspaceRepository;
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  projectStore: ProjectStore;
}

export function createAppContext(): AppContext {
  return {
    workspaceRepository: new WorkspaceRepository(),
    processManager: new ProcessManager(),
    serverSettingsRepository:
      new ProjectServerSettingsRepository(),
    projectStore: new ProjectStore(),
  };
}
