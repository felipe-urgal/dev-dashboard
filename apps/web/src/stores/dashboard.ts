import {
  computed,
  ref,
} from 'vue';

import type {
  Project,
  Workspace,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  createWorkspace,
  deleteWorkspace,
  fetchHealth,
  fetchProject,
  fetchProjects,
  fetchWorkspaces,
  scanWorkspace,
  type WorkspaceScanResponse,
} from '../api';

const projects = ref<Project[]>([]);
const projectIndex = ref<Record<string, Project>>({});
const projectsByWorkspace = ref<Record<string, Project[]>>({});
const workspaces = ref<Workspace[]>([]);
const selectedWorkspaceId = ref('');

const newWorkspaceName = ref('');
const newWorkspacePath = ref('');

const apiConnected = ref(false);
const loadingProjects = ref(true);
const scanningWorkspace = ref(false);
const creatingWorkspace = ref(false);
const deletingWorkspace = ref(false);

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

const railsProjects = computed(
  () =>
    projects.value.filter((project) => project.type === 'rails')
      .length,
);

const nodeProjects = computed(
  () =>
    projects.value.filter((project) => project.type === 'node')
      .length,
);

const gitProjects = computed(
  () =>
    projects.value.filter((project) =>
      project.capabilities.includes('git'),
    ).length,
);

const sortedProjects = computed(() =>
  [...projects.value].sort((left, right) =>
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

function activateWorkspace(
  workspaceId: string,
  workspaceProjects?: Project[],
): void {
  selectedWorkspaceId.value = workspaceId;

  projects.value =
    workspaceProjects ??
    projectsByWorkspace.value[workspaceId] ??
    [];
}

async function scanWorkspaceById(
  workspaceId: string,
  options: {
    activate?: boolean;
    showMessages?: boolean;
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
    const result = await scanWorkspace(workspaceId);

    projectsByWorkspace.value = {
      ...projectsByWorkspace.value,
      [workspaceId]: result.projects,
    };

    rememberProjects(result.projects);
    scannedWorkspaceIds.add(workspaceId);

    if (shouldActivate) {
      activateWorkspace(workspaceId, result.projects);
      warningCount.value = result.warnings.length;
      lastScannedPath.value = result.workspacePath;
    }

    apiConnected.value = true;

    if (shouldShowMessages) {
      successMessage.value =
        `${result.projects.length} projeto(s) detectado(s).`;
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

async function loadInitialData(): Promise<void> {
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

      return;
    }

    const storedProjects = await fetchProjects();
    projects.value = storedProjects;
    rememberProjects(storedProjects);
  } catch (error) {
    apiConnected.value = false;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o dashboard.';
  } finally {
    loadingProjects.value = false;
  }
}

function ensureDashboardLoaded(): Promise<void> {
  if (!initialLoadPromise) {
    initialLoadPromise = loadInitialData().catch((error) => {
      initialLoadPromise = undefined;
      throw error;
    });
  }

  return initialLoadPromise;
}

async function ensureProject(
  projectId: string,
): Promise<Project | null> {
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
    const project = result.projects.find(
      (item) => item.id === projectId,
    );

    if (project) {
      activateWorkspace(workspace.id, result.projects);
      return project;
    }
  }

  return null;
}

async function handleWorkspaceSelection(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement;
  activateWorkspace(target.value);
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
    });

    workspaces.value = [...workspaces.value, workspace].sort(
      (left, right) => left.name.localeCompare(right.name),
    );

    activateWorkspace(workspace.id);
    newWorkspaceName.value = '';
    newWorkspacePath.value = '';
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

  const confirmed = window.confirm(
    `Remover o workspace "${workspace.name}" do dashboard? ` +
      'Os arquivos locais não serão apagados.',
  );

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
      successMessage.value =
        `Workspace "${workspace.name}" removido.`;
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

export const dashboardStore = {
  projects,
  workspaces,
  selectedWorkspaceId,
  newWorkspaceName,
  newWorkspacePath,
  apiConnected,
  loadingProjects,
  scanningWorkspace,
  creatingWorkspace,
  deletingWorkspace,
  errorMessage,
  successMessage,
  warningCount,
  lastScannedPath,
  selectedWorkspace,
  railsProjects,
  nodeProjects,
  gitProjects,
  sortedProjects,
  ensureDashboardLoaded,
  ensureProject,
  scanSelectedWorkspace,
  handleWorkspaceSelection,
  handleCreateWorkspace,
  handleDeleteWorkspace,
};
