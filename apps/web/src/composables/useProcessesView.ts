import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type {
  ManagedProcess,
  ManagedProcessStatus,
  Workspace,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  cleanupManagedProcesses,
  fetchManagedProcesses,
  fetchProjects,
  fetchWorkspaces,
  type ProcessesQuery,
} from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { useAutoDismiss } from './useAutoDismiss';
import { RequestGeneration } from '../utils/request-generation';

interface ProjectOption {
  id: string;
  name: string;
  workspaceId?: string;
}

type ProcessStatusFilter = '' | 'active' | 'stopped' | 'failed';

const ACTIVE_STATUSES = new Set<ManagedProcessStatus>([
  'starting',
  'running',
  'stopping',
]);

const TERMINAL_STATUSES = new Set<ManagedProcessStatus>(['stopped', 'failed']);

/**
 * Estado e ações da tela de processos gerenciados: filtros, carregamento de
 * workspaces/projetos/processos, contagens do resumo e a limpeza de
 * finalizados. Isolado do template para manter a view focada em marcação.
 */
export function useProcessesView() {
  const workspaces = ref<Workspace[]>([]);
  const projects = ref<ProjectOption[]>([]);
  const items = ref<ManagedProcess[]>([]);

  const workspaceFilter = ref('');
  const projectFilter = ref('');
  const kindFilter = ref<'' | 'server' | 'test' | 'compose-build'>('');
  const statusFilter = ref<ProcessStatusFilter>('');

  const loading = ref(false);
  const referenceErrorMessage = ref('');
  const processesErrorMessage = ref('');
  const cleanupMessage = ref('');
  const cleanupFailed = ref(false);
  const cleanupRunning = ref(false);
  const now = ref(Date.now());

  useAutoDismiss(referenceErrorMessage, '');
  useAutoDismiss(processesErrorMessage, '');
  useAutoDismiss(cleanupMessage, '');

  const generation = new RequestGeneration();
  let controller: AbortController | undefined;
  let clockInterval: ReturnType<typeof setInterval> | undefined;

  function isActiveStatus(status: ManagedProcessStatus): boolean {
    return ACTIVE_STATUSES.has(status);
  }

  function isTerminalStatus(status: ManagedProcessStatus): boolean {
    return TERMINAL_STATUSES.has(status);
  }

  function matchesStatusFilter(process: ManagedProcess): boolean {
    if (!statusFilter.value) return true;
    if (statusFilter.value === 'active') {
      return isActiveStatus(process.status);
    }
    return process.status === statusFilter.value;
  }

  function processOrder(process: ManagedProcess): number {
    if (isActiveStatus(process.status)) return 0;
    if (process.status === 'stopped') return 1;
    return 2;
  }

  const eligibleProjects = computed(() =>
    workspaceFilter.value
      ? projects.value.filter(
          (project) => project.workspaceId === workspaceFilter.value,
        )
      : projects.value,
  );

  const visibleItems = computed(() =>
    [...items.value].filter(matchesStatusFilter).sort((left, right) => {
      const statusDifference = processOrder(left) - processOrder(right);
      if (statusDifference !== 0) return statusDifference;

      const leftStartedAt = left.startedAt
        ? new Date(left.startedAt).getTime()
        : 0;
      const rightStartedAt = right.startedAt
        ? new Date(right.startedAt).getTime()
        : 0;
      return rightStartedAt - leftStartedAt;
    }),
  );

  const hasVisibleItems = computed(() => visibleItems.value.length > 0);

  const activeCount = computed(
    () =>
      items.value.filter((process) => isActiveStatus(process.status)).length,
  );

  const stoppedCount = computed(
    () => items.value.filter((process) => process.status === 'stopped').length,
  );

  const failedCount = computed(
    () => items.value.filter((process) => process.status === 'failed').length,
  );

  const terminalCount = computed(
    () =>
      items.value.filter((process) => isTerminalStatus(process.status)).length,
  );

  const projectNameById = computed(() => {
    const map = new Map<string, string>();
    for (const project of projects.value) {
      map.set(project.id, project.name);
    }
    return map;
  });

  const projectWorkspaceById = computed(() => {
    const map = new Map<string, string>();
    for (const project of projects.value) {
      if (project.workspaceId) {
        map.set(project.id, project.workspaceId);
      }
    }
    return map;
  });

  const workspaceNameById = computed(() => {
    const map = new Map<string, string>();
    for (const workspace of workspaces.value) {
      map.set(workspace.id, workspace.name);
    }
    return map;
  });

  function workspaceNameFor(process: ManagedProcess): string {
    const workspaceId =
      process.workspaceId ?? projectWorkspaceById.value.get(process.projectId);
    if (!workspaceId) return '—';
    return workspaceNameById.value.get(workspaceId) ?? workspaceId;
  }

  async function loadReferenceData(): Promise<void> {
    try {
      const [loadedWorkspaces, loadedProjects] = await Promise.all([
        fetchWorkspaces(),
        fetchProjects(),
      ]);
      workspaces.value = loadedWorkspaces;
      projects.value = loadedProjects.map((project) => ({
        id: project.id,
        name: project.name,
        ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
      }));
      referenceErrorMessage.value = '';
    } catch (error) {
      referenceErrorMessage.value =
        error instanceof ApiRequestError
          ? error.message
          : 'Não foi possível carregar workspaces e projetos.';
    }
  }

  async function loadProcesses(): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    const token = generation.invalidate();
    loading.value = true;
    processesErrorMessage.value = '';

    const query: ProcessesQuery = {
      signal: controller.signal,
    };
    if (workspaceFilter.value) {
      query.workspaceId = workspaceFilter.value;
    }
    if (projectFilter.value) {
      query.projectId = projectFilter.value;
    }
    if (kindFilter.value) query.kind = kindFilter.value;

    try {
      const result = await fetchManagedProcesses(query);
      if (!generation.isCurrent(token)) return;
      items.value = result;
    } catch (error) {
      if (controller?.signal.aborted) return;
      if (!generation.isCurrent(token)) return;
      processesErrorMessage.value =
        error instanceof ApiRequestError
          ? error.message
          : 'Não foi possível carregar os processos gerenciados.';
      items.value = [];
    } finally {
      if (generation.isCurrent(token)) {
        loading.value = false;
      }
    }
  }

  async function runCleanup(): Promise<void> {
    if (cleanupRunning.value || terminalCount.value === 0) {
      return;
    }

    const total = terminalCount.value;
    const confirmed = await confirmDialog({
      title: 'Limpar processos finalizados?',
      message:
        `Serão removidos ${total} processo${total === 1 ? '' : 's'} ` +
        `finalizado${total === 1 ? '' : 's'} e seus logs. ` +
        'Processos em execução serão preservados.',
      confirmLabel: 'Limpar processos',
      tone: 'danger',
    });
    if (!confirmed) return;

    cleanupRunning.value = true;
    cleanupMessage.value = '';
    cleanupFailed.value = false;

    try {
      const removed = await cleanupManagedProcesses();
      await loadProcesses();
      cleanupMessage.value =
        removed === 0
          ? 'Nenhum processo finalizado foi encontrado.'
          : `${removed} processo${removed === 1 ? '' : 's'} finalizado${removed === 1 ? '' : 's'} removido${removed === 1 ? '' : 's'}. Processos em execução foram preservados.`;
    } catch (error) {
      cleanupFailed.value = true;
      cleanupMessage.value =
        error instanceof ApiRequestError
          ? error.message
          : 'Não foi possível concluir a limpeza.';
    } finally {
      cleanupRunning.value = false;
    }
  }

  watch(workspaceFilter, () => {
    if (projectFilter.value) {
      const stillEligible = eligibleProjects.value.some(
        (project) => project.id === projectFilter.value,
      );
      if (!stillEligible) projectFilter.value = '';
    }
  });

  watch(
    [workspaceFilter, projectFilter, kindFilter],
    () => {
      void loadProcesses();
    },
    { flush: 'post' },
  );

  onMounted(async () => {
    await loadReferenceData();
    await loadProcesses();
    clockInterval = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onBeforeUnmount(() => {
    controller?.abort();
    if (clockInterval) clearInterval(clockInterval);
  });

  return {
    workspaces,
    projects,
    items,
    workspaceFilter,
    projectFilter,
    kindFilter,
    statusFilter,
    loading,
    referenceErrorMessage,
    processesErrorMessage,
    cleanupMessage,
    cleanupFailed,
    cleanupRunning,
    now,
    eligibleProjects,
    visibleItems,
    hasVisibleItems,
    activeCount,
    stoppedCount,
    failedCount,
    terminalCount,
    projectNameById,
    workspaceNameFor,
    loadProcesses,
    runCleanup,
  };
}
