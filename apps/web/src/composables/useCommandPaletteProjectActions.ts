import { ref } from 'vue';

import type {
  ManagedProcess,
  Project,
  ProjectScript,
  ProjectScriptCatalog,
  ProjectTestOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectProcess,
  fetchProjectScripts,
  fetchProjectServerSettings,
  fetchProjectTestProcess,
  fetchProjectTests,
  prepareScriptExecution,
  startProjectProcess,
  startProjectTest,
  startScriptExecution,
  stopProjectProcess,
  stopProjectTest,
} from '../api';

export type CommandPaletteActionOperation =
  | { type: 'server-start' }
  | { type: 'server-stop' }
  | { type: 'test-start'; commandId: string }
  | { type: 'test-stop' }
  | { type: 'script-start'; script: ProjectScript };

export interface UseCommandPaletteProjectActionsOptions {
  isOpen: () => boolean;
  getSelectedProject: () => Project | undefined;
}

/**
 * Estado e ações escopadas ao projeto selecionado na paleta: status de
 * servidor/testes, catálogo de scripts e a execução das ações rápidas.
 * Isolado da montagem da lista de itens (que também depende deste estado,
 * mas não precisa saber como ele é carregado).
 */
export function useCommandPaletteProjectActions(
  options: UseCommandPaletteProjectActionsOptions,
) {
  const projectProcess = ref<ManagedProcess | null>();
  const testProcess = ref<ManagedProcess | null>();
  const testOverview = ref<ProjectTestOverview>();
  const scriptCatalog = ref<ProjectScriptCatalog>();
  const loadedProjectId = ref<string>();
  const loadingActions = ref(false);

  function isSelectedProject(projectId: string): boolean {
    return options.isOpen() && options.getSelectedProject()?.id === projectId;
  }

  async function loadProjectActions(
    project: Project | undefined,
  ): Promise<{ feedback?: string }> {
    projectProcess.value = undefined;
    testProcess.value = undefined;
    testOverview.value = undefined;
    scriptCatalog.value = undefined;
    loadedProjectId.value = undefined;
    loadingActions.value = false;
    if (!project) return {};
    loadingActions.value = true;
    const projectId = project.id;
    const requests: Promise<void>[] = [];
    if (project.capabilities.includes('server'))
      requests.push(
        fetchProjectProcess(projectId).then((value) => {
          if (isSelectedProject(projectId)) projectProcess.value = value;
        }),
      );
    if (project.capabilities.includes('tests'))
      requests.push(
        Promise.all([
          fetchProjectTests(projectId),
          fetchProjectTestProcess(projectId),
        ]).then(([overview, process]) => {
          if (isSelectedProject(projectId)) {
            testOverview.value = overview;
            testProcess.value = process;
          }
        }),
      );
    if (project.capabilities.includes('scripts')) {
      const parameters = new URLSearchParams({ page: '1', pageSize: '100' });
      requests.push(
        fetchProjectScripts(projectId, parameters).then((value) => {
          if (isSelectedProject(projectId)) scriptCatalog.value = value;
        }),
      );
    }
    const results = await Promise.allSettled(requests);
    const feedback =
      options.isOpen() &&
      requests.length &&
      results.every((result) => result.status === 'rejected')
        ? 'Não foi possível consultar as ações autorizadas.'
        : undefined;
    if (isSelectedProject(projectId)) {
      loadedProjectId.value = projectId;
      loadingActions.value = false;
    }
    return { ...(feedback ? { feedback } : {}) };
  }

  async function executeAction(
    projectId: string,
    operation: CommandPaletteActionOperation,
  ): Promise<string> {
    if (operation.type === 'server-start') {
      const settings = await fetchProjectServerSettings(projectId);
      projectProcess.value = await startProjectProcess(projectId, {
        port: settings.port ?? null,
      });
      return 'Servidor iniciado com sucesso.';
    }
    if (operation.type === 'server-stop') {
      projectProcess.value = await stopProjectProcess(projectId);
      return 'Servidor interrompido com sucesso.';
    }
    if (operation.type === 'test-start') {
      testProcess.value = await startProjectTest(
        projectId,
        operation.commandId,
      );
      return 'Testes iniciados com sucesso.';
    }
    if (operation.type === 'test-stop') {
      testProcess.value = await stopProjectTest(projectId);
      return 'Execução de testes interrompida.';
    }
    const token =
      operation.script.risk === 'read-only'
        ? undefined
        : (await prepareScriptExecution(projectId, operation.script.id)).token;
    await startScriptExecution(projectId, operation.script.id, token);
    return `Script “${operation.script.name}” iniciado.`;
  }

  return {
    projectProcess,
    testProcess,
    testOverview,
    scriptCatalog,
    loadedProjectId,
    loadingActions,
    loadProjectActions,
    executeAction,
  };
}
