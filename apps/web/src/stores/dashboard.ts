import { computed, ref } from 'vue';

import type { Project, Workspace } from '@dev-dashboard/contracts';

import { ApiRequestError, type WorkspaceScanResponse } from '../api';

import * as dashboardApi from '../api';
import { confirmDialog } from './app-dialog';

export interface DashboardApi {
  createWorkspace: typeof dashboardApi.createWorkspace;
  deleteWorkspace: typeof dashboardApi.deleteWorkspace;
  dismissProject: typeof dashboardApi.dismissProject;
  fetchHealth: typeof dashboardApi.fetchHealth;
  fetchProject: typeof dashboardApi.fetchProject;
  fetchProjects: typeof dashboardApi.fetchProjects;
  fetchWorkspaces: typeof dashboardApi.fetchWorkspaces;
  scanWorkspace: typeof dashboardApi.scanWorkspace;
  updateProjectFavorite: typeof dashboardApi.updateProjectFavorite;
  updateProjectEnabled: typeof dashboardApi.updateProjectEnabled;
  updateWorkspaceRecursiveScan: typeof dashboardApi.updateWorkspaceRecursiveScan;
}

export function createDashboardStore(api: DashboardApi = dashboardApi) {
  const {
    createWorkspace,
    deleteWorkspace,
    dismissProject,
    fetchHealth,
    fetchProject,
    fetchProjects,
    fetchWorkspaces,
    scanWorkspace,
    updateProjectFavorite,
    updateProjectEnabled,
    updateWorkspaceRecursiveScan,
  } = api;

  const projects = ref<Project[]>([]);
  const projectIndex = ref<Record<string, Project>>({});
  const projectsByWorkspace = ref<Record<string, Project[]>>({});
  const workspaces = ref<Workspace[]>([]);
  const selectedWorkspaceId = ref('');

  const newWorkspaceName = ref('');
  const newWorkspacePath = ref('');
  const newWorkspaceRecursiveScan = ref(false);

  const apiConnected = ref(false);
  const loadingProjects = ref(true);
  const scanningWorkspace = ref(false);
  const creatingWorkspace = ref(false);
  const deletingWorkspace = ref(false);
  const favoriteUpdatingIds = ref<string[]>([]);
  const enabledUpdatingIds = ref<string[]>([]);
  const dismissingProjectIds = ref<string[]>([]);
  const recursiveScanUpdatingIds = ref<string[]>([]);

  const errorMessage = ref('');
  const successMessage = ref('');
  const warningCount = ref(0);
  const lastScannedPath = ref('');

  const scannedWorkspaceIds = new Set<string>();
  let initialLoadPromise: Promise<void> | undefined;

  const selectedWorkspace = computed(() =>
    workspaces.value.find(
      (workspace) => workspace.id === selectedWorkspaceId.value,
    ),
  );

  const sortedProjects = computed(() =>
    [...projects.value].sort(
      (left, right) =>
        Number(right.favorite) - Number(left.favorite) ||
        left.name.localeCompare(right.name),
    ),
  );

  const knownProjects = computed(() =>
    Object.values(projectIndex.value).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  );

  function clearMessages(): void {
    errorMessage.value = '';
    successMessage.value = '';
  }

  function rememberProjects(items: Project[]): void {
    const nextIndex = {
      ...projectIndex.value,
    };

    for (const project of items) {
      nextIndex[project.id] = project;
    }

    projectIndex.value = nextIndex;
  }

  function forgetProject(projectId: string): void {
    projects.value = projects.value.filter((project) => project.id !== projectId);

    const nextIndex = {
      ...projectIndex.value,
    };
    delete nextIndex[projectId];
    projectIndex.value = nextIndex;

    projectsByWorkspace.value = Object.fromEntries(
      Object.entries(projectsByWorkspace.value).map(
        ([workspaceId, workspaceProjects]) => [
          workspaceId,
          workspaceProjects.filter((project) => project.id !== projectId),
        ],
      ),
    );
  }

  function replaceProjectFavorite(projectId: string, favorite: boolean): void {
    projects.value = projects.value.map((item) =>
      item.id === projectId ? { ...item, favorite } : item,
    );

    const indexedProject = projectIndex.value[projectId];

    if (indexedProject) {
      projectIndex.value = {
        ...projectIndex.value,
        [projectId]: {
          ...indexedProject,
          favorite,
        },
      };
    }

    projectsByWorkspace.value = Object.fromEntries(
      Object.entries(projectsByWorkspace.value).map(
        ([workspaceId, workspaceProjects]) => [
          workspaceId,
          workspaceProjects.map((item) =>
            item.id === projectId ? { ...item, favorite } : item,
          ),
        ],
      ),
    );
  }

  async function toggleProjectFavorite(project: Project): Promise<void> {
    if (favoriteUpdatingIds.value.includes(project.id)) {
      return;
    }

    const favorite = !project.favorite;
    favoriteUpdatingIds.value = [...favoriteUpdatingIds.value, project.id];
    replaceProjectFavorite(project.id, favorite);

    try {
      const updatedProject = await updateProjectFavorite(project.id, favorite);
      replaceProjectFavorite(updatedProject.id, updatedProject.favorite);
    } catch (error) {
      replaceProjectFavorite(project.id, project.favorite);
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o favorito.';
    } finally {
      favoriteUpdatingIds.value = favoriteUpdatingIds.value.filter(
        (projectId) => projectId !== project.id,
      );
    }
  }

  function replaceProjectEnabled(projectId: string, enabled: boolean): void {
    projects.value = projects.value.map((item) =>
      item.id === projectId ? { ...item, enabled } : item,
    );

    const indexedProject = projectIndex.value[projectId];

    if (indexedProject) {
      projectIndex.value = {
        ...projectIndex.value,
        [projectId]: {
          ...indexedProject,
          enabled,
        },
      };
    }

    projectsByWorkspace.value = Object.fromEntries(
      Object.entries(projectsByWorkspace.value).map(
        ([workspaceId, workspaceProjects]) => [
          workspaceId,
          workspaceProjects.map((item) =>
            item.id === projectId ? { ...item, enabled } : item,
          ),
        ],
      ),
    );
  }

  async function toggleProjectEnabled(project: Project): Promise<void> {
    if (enabledUpdatingIds.value.includes(project.id)) {
      return;
    }

    const enabled = !project.enabled;
    enabledUpdatingIds.value = [...enabledUpdatingIds.value, project.id];
    replaceProjectEnabled(project.id, enabled);

    try {
      const updatedProject = await updateProjectEnabled(project.id, enabled);
      replaceProjectEnabled(updatedProject.id, updatedProject.enabled);
    } catch (error) {
      replaceProjectEnabled(project.id, project.enabled);
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a ativação do projeto.';
    } finally {
      enabledUpdatingIds.value = enabledUpdatingIds.value.filter(
        (projectId) => projectId !== project.id,
      );
    }
  }

  async function removeProject(project: Project): Promise<void> {
    if (dismissingProjectIds.value.includes(project.id)) {
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Remover projeto?',
      message:
        `O projeto "${project.name}" será removido do dashboard. ` +
        'Os arquivos locais não serão apagados. Ele voltará a aparecer quando você escanear o workspace novamente.',
      confirmLabel: 'Remover projeto',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    dismissingProjectIds.value = [...dismissingProjectIds.value, project.id];
    clearMessages();

    try {
      await dismissProject(project.id);
      forgetProject(project.id);
      successMessage.value = `Projeto "${project.name}" removido do dashboard.`;
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível remover o projeto do dashboard.';
    } finally {
      dismissingProjectIds.value = dismissingProjectIds.value.filter(
        (projectId) => projectId !== project.id,
      );
    }
  }

  function replaceWorkspaceRecursiveScan(
    workspaceId: string,
    recursiveScan: boolean,
  ): void {
    workspaces.value = workspaces.value.map((workspace) =>
      workspace.id === workspaceId
        ? { ...workspace, recursiveScan }
        : workspace,
    );
  }

  async function toggleWorkspaceRecursiveScan(
    workspace: Workspace,
  ): Promise<void> {
    if (recursiveScanUpdatingIds.value.includes(workspace.id)) {
      return;
    }

    const recursiveScan = !workspace.recursiveScan;
    recursiveScanUpdatingIds.value = [
      ...recursiveScanUpdatingIds.value,
      workspace.id,
    ];
    replaceWorkspaceRecursiveScan(workspace.id, recursiveScan);
    clearMessages();

    try {
      const updatedWorkspace = await updateWorkspaceRecursiveScan(
        workspace.id,
        recursiveScan,
      );
      replaceWorkspaceRecursiveScan(
        updatedWorkspace.id,
        updatedWorkspace.recursiveScan,
      );
    } catch (error) {
      replaceWorkspaceRecursiveScan(workspace.id, workspace.recursiveScan);
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a preferência de varredura recursiva.';
    } finally {
      recursiveScanUpdatingIds.value = recursiveScanUpdatingIds.value.filter(
        (workspaceId) => workspaceId !== workspace.id,
      );
    }
  }

  function replaceWorkspaceProjects(
    workspaceId: string,
    items: Project[],
  ): void {
    const previousProjects = projectsByWorkspace.value[workspaceId] ?? [];

    const nextIndex = {
      ...projectIndex.value,
    };

    for (const project of previousProjects) {
      if (nextIndex[project.id]?.workspaceId === workspaceId) {
        delete nextIndex[project.id];
      }
    }

    for (const project of items) {
      nextIndex[project.id] = project;
    }

    projectsByWorkspace.value = {
      ...projectsByWorkspace.value,
      [workspaceId]: items,
    };
    projectIndex.value = nextIndex;
  }

  function activateWorkspace(
    workspaceId: string,
    workspaceProjects?: Project[],
  ): void {
    selectedWorkspaceId.value = workspaceId;

    projects.value =
      workspaceProjects ?? projectsByWorkspace.value[workspaceId] ?? [];
  }

  async function scanWorkspaceById(
    workspaceId: string,
    options: {
      activate?: boolean;
      showMessages?: boolean;
      restoreDismissed?: boolean;
    } = {},
  ): Promise<WorkspaceScanResponse> {
    const shouldActivate = options.activate ?? false;
    const shouldShowMessages = options.showMessages ?? false;

    if (shouldActivate) {
      scanningWorkspace.value = true;
      loadingProjects.value = true;
      warningCount.value = 0;
    }

    if (shouldShowMessages) {
      clearMessages();
    }

    try {
      const result = await scanWorkspace(workspaceId, {
        restoreDismissed: options.restoreDismissed,
      });

      replaceWorkspaceProjects(workspaceId, result.projects);
      scannedWorkspaceIds.add(workspaceId);

      if (shouldActivate) {
        activateWorkspace(workspaceId, result.projects);
        warningCount.value = result.warnings.length;
        lastScannedPath.value = result.workspacePath;
      }

      apiConnected.value = true;

      if (shouldShowMessages) {
        successMessage.value = `${result.projects.length} projeto(s) detectado(s).`;
      }

      return result;
    } finally {
      if (shouldActivate) {
        scanningWorkspace.value = false;
        loadingProjects.value = false;
      }
    }
  }

  async function scanSelectedWorkspace(): Promise<void> {
    const workspace = selectedWorkspace.value;

    if (!workspace) {
      projects.value = [];
      lastScannedPath.value = '';
      return;
    }

    try {
      await scanWorkspaceById(workspace.id, {
        activate: true,
        showMessages: true,
      });
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível escanear o workspace.';
    }
  }

  async function rescanSelectedWorkspace(): Promise<void> {
    const workspace = selectedWorkspace.value;

    if (!workspace) {
      projects.value = [];
      lastScannedPath.value = '';
      return;
    }

    try {
      await scanWorkspaceById(workspace.id, {
        activate: true,
        showMessages: true,
        restoreDismissed: true,
      });
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível escanear o workspace.';
    }
  }

  async function loadInitialData(): Promise<boolean> {
    loadingProjects.value = true;
    clearMessages();

    try {
      const health = await fetchHealth();
      apiConnected.value = health.status === 'ok';

      const storedWorkspaces = await fetchWorkspaces();
      workspaces.value = storedWorkspaces;

      const firstWorkspace = storedWorkspaces[0];

      if (firstWorkspace) {
        activateWorkspace(firstWorkspace.id);

        await scanWorkspaceById(firstWorkspace.id, {
          activate: true,
        });

        return true;
      }

      const storedProjects = await fetchProjects();
      projects.value = storedProjects;
      projectsByWorkspace.value = {};
      projectIndex.value = {};
      rememberProjects(storedProjects);
      return true;
    } catch (error) {
      apiConnected.value = false;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o dashboard.';
      return false;
    } finally {
      loadingProjects.value = false;
    }
  }

  function ensureDashboardLoaded(): Promise<void> {
    if (!initialLoadPromise) {
      initialLoadPromise = loadInitialData().then((loaded) => {
        if (!loaded) {
          initialLoadPromise = undefined;
        }
      });
    }

    return initialLoadPromise;
  }

  async function ensureProject(projectId: string): Promise<Project | null> {
    await ensureDashboardLoaded();

    const cachedProject = projectIndex.value[projectId];

    if (cachedProject) {
      if (cachedProject.workspaceId) {
        activateWorkspace(cachedProject.workspaceId);
      }

      return cachedProject;
    }

    try {
      const project = await fetchProject(projectId);
      apiConnected.value = true;
      rememberProjects([project]);

      if (project.workspaceId) {
        const result = await scanWorkspaceById(project.workspaceId);
        activateWorkspace(project.workspaceId, result.projects);

        return projectIndex.value[projectId] ?? project;
      }

      return project;
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 404) {
        throw error;
      }
    }

    for (const workspace of workspaces.value) {
      if (scannedWorkspaceIds.has(workspace.id)) {
        continue;
      }

      const result = await scanWorkspaceById(workspace.id);
      const project = result.projects.find((item) => item.id === projectId);

      if (project) {
        activateWorkspace(workspace.id, result.projects);
        return project;
      }
    }

    return null;
  }

  async function switchWorkspace(workspaceId: string): Promise<void> {
    activateWorkspace(workspaceId);
    await scanSelectedWorkspace();
  }

  async function handleCreateWorkspace(): Promise<void> {
    const name = newWorkspaceName.value.trim();
    const path = newWorkspacePath.value.trim();

    clearMessages();

    if (!name || !path) {
      errorMessage.value = 'Informe o nome e o caminho do workspace.';
      return;
    }

    creatingWorkspace.value = true;

    try {
      const workspace = await createWorkspace({
        name,
        path,
        recursiveScan: newWorkspaceRecursiveScan.value,
      });

      workspaces.value = [...workspaces.value, workspace].sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      activateWorkspace(workspace.id);
      newWorkspaceName.value = '';
      newWorkspacePath.value = '';
      newWorkspaceRecursiveScan.value = false;
      successMessage.value = `Workspace "${workspace.name}" cadastrado.`;

      await scanWorkspaceById(workspace.id, {
        activate: true,
      });
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível cadastrar o workspace.';
    } finally {
      creatingWorkspace.value = false;
    }
  }

  async function handleDeleteWorkspace(): Promise<void> {
    const workspace = selectedWorkspace.value;

    if (!workspace) {
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Remover workspace?',
      message:
        `O workspace "${workspace.name}" será removido do dashboard. ` +
        'Os arquivos locais não serão apagados.',
      confirmLabel: 'Remover workspace',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    deletingWorkspace.value = true;
    clearMessages();

    try {
      await deleteWorkspace(workspace.id);

      workspaces.value = workspaces.value.filter(
        (item) => item.id !== workspace.id,
      );

      const nextProjectsByWorkspace = {
        ...projectsByWorkspace.value,
      };
      delete nextProjectsByWorkspace[workspace.id];
      projectsByWorkspace.value = nextProjectsByWorkspace;
      scannedWorkspaceIds.delete(workspace.id);

      const nextIndex: Record<string, Project> = {};

      for (const project of Object.values(projectIndex.value)) {
        if (!project.workspaceId) {
          nextIndex[project.id] = project;
        }
      }

      for (const items of Object.values(nextProjectsByWorkspace)) {
        for (const project of items) {
          nextIndex[project.id] = project;
        }
      }

      projectIndex.value = nextIndex;

      projects.value = [];
      warningCount.value = 0;
      lastScannedPath.value = '';

      const nextWorkspace = workspaces.value[0];

      if (nextWorkspace) {
        activateWorkspace(nextWorkspace.id);
        await scanSelectedWorkspace();
      } else {
        selectedWorkspaceId.value = '';
        successMessage.value = `Workspace "${workspace.name}" removido.`;
      }
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível remover o workspace.';
    } finally {
      deletingWorkspace.value = false;
    }
  }

  return {
    projects,
    projectIndex,
    projectsByWorkspace,
    workspaces,
    selectedWorkspaceId,
    newWorkspaceName,
    newWorkspacePath,
    newWorkspaceRecursiveScan,
    apiConnected,
    loadingProjects,
    scanningWorkspace,
    creatingWorkspace,
    deletingWorkspace,
    favoriteUpdatingIds,
    enabledUpdatingIds,
    dismissingProjectIds,
    recursiveScanUpdatingIds,
    errorMessage,
    successMessage,
    warningCount,
    lastScannedPath,
    selectedWorkspace,
    sortedProjects,
    knownProjects,
    ensureDashboardLoaded,
    ensureProject,
    scanSelectedWorkspace,
    rescanSelectedWorkspace,
    switchWorkspace,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    toggleProjectFavorite,
    toggleProjectEnabled,
    removeProject,
    toggleWorkspaceRecursiveScan,
  };
}

export type DashboardStore = ReturnType<typeof createDashboardStore>;

export const dashboardStore = createDashboardStore();
