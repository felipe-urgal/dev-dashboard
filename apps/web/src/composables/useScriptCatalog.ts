import { ref, watch, type Ref } from 'vue';

import type {
  Project,
  ProjectScript,
  ProjectScriptCatalog,
  ProjectScriptOrigin,
  ProjectScriptRisk,
} from '@dev-dashboard/contracts';

import { fetchProjectScripts } from '../api';

export function useScriptCatalog<ScriptSection extends string>(
  getProject: () => Project,
  activeSection: Ref<ScriptSection>,
  catalogSection: ScriptSection,
  errorMessage: Ref<string>,
) {
  const catalog = ref<ProjectScriptCatalog | null>(null);
  const loading = ref(false);
  const search = ref('');
  const origin = ref<ProjectScriptOrigin | ''>('');
  const risk = ref<ProjectScriptRisk | ''>('');
  const page = ref(1);
  const selectedActionId = ref('');

  let generation = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  async function load(): Promise<void> {
    const current = generation;
    const projectId = getProject().id;
    loading.value = true;
    errorMessage.value = '';

    const query = new URLSearchParams({
      page: String(page.value),
      pageSize: '12',
    });
    if (search.value.trim()) query.set('search', search.value.trim());
    if (origin.value) query.set('origin', origin.value);
    if (risk.value) query.set('risk', risk.value);

    try {
      const result = await fetchProjectScripts(projectId, query);
      if (current !== generation || projectId !== getProject().id) return;
      catalog.value = result;
      if (!result.items.some((item) => item.id === selectedActionId.value)) {
        selectedActionId.value = result.items[0]?.id ?? '';
      }
    } catch (error) {
      if (current === generation && projectId === getProject().id) {
        errorMessage.value = error instanceof Error
          ? error.message
          : 'Não foi possível carregar o catálogo.';
      }
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  function selectScript(item: ProjectScript): void {
    selectedActionId.value = item.id;
    activeSection.value = catalogSection;
  }

  watch(
    () => getProject().id,
    () => {
      generation += 1;
      catalog.value = null;
      selectedActionId.value = '';
      page.value = 1;
      void load();
    },
    { immediate: true },
  );

  watch([origin, risk], () => {
    page.value = 1;
    void load();
  });

  watch(search, () => {
    page.value = 1;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void load(), 250);
  });

  return {
    catalog,
    loading,
    errorMessage,
    search,
    origin,
    risk,
    page,
    selectedActionId,
    load,
    selectScript,
  };
}
