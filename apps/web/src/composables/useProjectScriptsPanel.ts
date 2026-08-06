import { computed, onUnmounted, ref, watch } from 'vue';

import type {
  Project,
  ProjectScript,
  ProjectScriptOrigin,
  ProjectScriptRisk,
  ScriptExecution,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import { isRunnableProjectScript } from '../utils/project-script-visibility';
import { useAutoDismiss } from './useAutoDismiss';
import { useScriptCatalog } from './useScriptCatalog';
import { useScriptExecution } from './useScriptExecution';

export type ScriptSection = 'catalog' | 'executions';
export type ScriptCategory =
  | 'all'
  | 'build'
  | 'development'
  | 'tests'
  | 'maintenance'
  | 'deploy'
  | 'utilities';

export const projectScriptOriginLabels: Record<ProjectScriptOrigin, string> = {
  'package-script': 'package.json',
  'package-manager': 'Gerenciador Node',
  bundler: 'Bundler',
  'rails-task': 'Tarefa Rails',
  bin: 'Executável bin/',
};

export const projectScriptRiskLabels: Record<ProjectScriptRisk, string> = {
  'read-only': 'Somente leitura',
  mutable: 'Mutável',
  destructive: 'Destrutivo',
};

export const scriptExecutionStatusLabels: Record<
  ScriptExecutionStatus,
  string
> = {
  running: 'Em execução',
  succeeded: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

export const projectScriptCategoryLabels: Record<ScriptCategory, string> = {
  all: 'Todos os scripts',
  build: 'Build',
  development: 'Desenvolvimento',
  tests: 'Testes',
  maintenance: 'Manutenção',
  deploy: 'Deploy',
  utilities: 'Utilitários',
};

export const projectScriptCategoryIds: ScriptCategory[] = [
  'all',
  'build',
  'development',
  'tests',
  'maintenance',
  'deploy',
  'utilities',
];

export function categoryFor(
  item: ProjectScript,
): Exclude<ScriptCategory, 'all'> {
  const text = `${item.name} ${item.command}`.toLowerCase();
  if (/(deploy|release|publish|ship)/.test(text)) return 'deploy';
  if (/(test|spec|rspec|vitest|jest|lint|rubocop)/.test(text)) return 'tests';
  if (/(build|compile|assets|css|webpack|vite)/.test(text)) return 'build';
  if (/(dev|watch|serve|server|start)/.test(text)) return 'development';
  if (/(setup|prepare|install|migrate|seed|db:|clean|reset)/.test(text))
    return 'maintenance';
  return 'utilities';
}

export function formatScriptExecutionDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function scriptExecutionDuration(item: ScriptExecution | null): string {
  if (!item) return '—';
  const start = new Date(item.startedAt).getTime();
  const end = item.finishedAt
    ? new Date(item.finishedAt).getTime()
    : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function useProjectScriptsPanel(getProject: () => Project) {
  const activeSection = ref<ScriptSection>('catalog');
  const category = ref<ScriptCategory>('all');
  const copiedActionId = ref('');
  const errorMessage = ref('');

  const catalogState = useScriptCatalog(
    getProject,
    activeSection,
    'catalog',
    errorMessage,
  );
  const executionState = useScriptExecution(
    getProject,
    activeSection,
    catalogState.selectedActionId,
    'executions',
    errorMessage,
  );

  useAutoDismiss(errorMessage, '');

  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  watch([catalogState.origin, catalogState.risk], () => {
    category.value = 'all';
  });

  watch(
    () => getProject().id,
    () => {
      activeSection.value = 'catalog';
      category.value = 'all';
    },
  );

  const sectionTitle = computed(
    () =>
      ({
        catalog: 'Catálogo de scripts',
        executions: 'Execuções',
      })[activeSection.value],
  );

  const sectionDescription = computed(
    () =>
      ({
        catalog:
          'Execute somente as tarefas que não pertencem a Servidor, Testes, Banco de dados ou Dependências.',
        executions:
          'Acompanhe o processo ativo, consulte logs e revise o histórico.',
      })[activeSection.value],
  );

  const catalogScripts = computed(() =>
    (catalogState.catalog.value?.items ?? []).filter((item) =>
      isRunnableProjectScript(item, getProject()),
    ),
  );

  const delegatedScriptsCount = computed(
    () =>
      (catalogState.catalog.value?.items.length ?? 0) -
      catalogScripts.value.length,
  );

  const selectedScript = computed<ProjectScript | null>(
    () =>
      catalogScripts.value.find(
        (item) => item.id === catalogState.selectedActionId.value,
      ) ??
      catalogScripts.value[0] ??
      null,
  );

  const visibleScripts = computed(() => {
    if (category.value === 'all') return catalogScripts.value;
    return catalogScripts.value.filter(
      (item) => categoryFor(item) === category.value,
    );
  });

  const categoryCounts = computed(() => {
    const counts: Record<ScriptCategory, number> = {
      all: catalogScripts.value.length,
      build: 0,
      development: 0,
      tests: 0,
      maintenance: 0,
      deploy: 0,
      utilities: 0,
    };
    for (const item of catalogScripts.value) counts[categoryFor(item)] += 1;
    return counts;
  });

  const riskCounts = computed(() => {
    const counts: Record<ProjectScriptRisk, number> = {
      'read-only': 0,
      mutable: 0,
      destructive: 0,
    };
    for (const item of catalogScripts.value) counts[item.risk] += 1;
    return counts;
  });

  function selectSection(section: ScriptSection): void {
    activeSection.value = section;
  }

  async function copyCommand(
    item: ProjectScript,
    command = item.command,
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(command);
      copiedActionId.value = item.id;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copiedActionId.value = '';
      }, 2_000);
    } catch {
      copiedActionId.value = '';
    }
  }

  onUnmounted(() => {
    if (copiedTimer) clearTimeout(copiedTimer);
  });

  return {
    ...catalogState,
    ...executionState,
    activeSection,
    category,
    copiedActionId,
    errorMessage,
    originLabels: projectScriptOriginLabels,
    riskLabels: projectScriptRiskLabels,
    executionStatusLabels: scriptExecutionStatusLabels,
    categoryLabels: projectScriptCategoryLabels,
    categoryIds: projectScriptCategoryIds,
    sectionTitle,
    sectionDescription,
    delegatedScriptsCount,
    selectedScript,
    visibleScripts,
    categoryCounts,
    riskCounts,
    isRefreshing: computed(() => catalogState.loading.value),
    selectSection,
    copyCommand,
  };
}
