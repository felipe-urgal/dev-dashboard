import type { FastifyInstance } from 'fastify';

import type { AppContext } from './app-context.js';
import { DeploymentService } from './deployment/service.js';
import { ProductionOverviewService } from './deployment/production-overview.js';
import { AttentionCenterService } from './services/attention-center-service.js';
import { ProjectDoctorService } from './services/project-doctor-service.js';
import { PortInspectorService } from './services/port-inspector-service.js';
import { ProjectFileMutationService } from './services/project-file-mutation-service.js';
import type { ProjectLanguageServerService } from './services/project-language-server-service.js';
import type { ProjectTerminalService } from './services/project-terminal-service.js';
import { DatabaseExplorerSessionStore } from './services/database-explorer-session-store.js';

export interface AppCompositionOptions {
  now?: () => number;
  projectDoctorService?: ProjectDoctorService;
  portInspectorService?: PortInspectorService;
  projectLanguageServerService?: ProjectLanguageServerService;
  projectTerminalService?: ProjectTerminalService;
  deploymentService?: DeploymentService;
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

  return {
    databaseExplorerSessionStore,
    projectDoctorService,
    portInspectorService,
    projectFileMutationService,
    projectWorkspaceEditService: context.projectWorkspaceEditService,
    projectLanguageServerService,
    projectTerminalService,
    deploymentService,
    productionOverviewService,
    attentionCenterService,
  };
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
  app.addHook('onClose', async () => {
    context.scriptExecutionService.close();
    context.testExecutionHistoryService.close();
    await context.detachableExecutionService?.close();
    composition.databaseExplorerSessionStore.close();
    composition.projectLanguageServerService.close();
    composition.projectTerminalService.close();
    composition.deploymentService.close();
  });
}
