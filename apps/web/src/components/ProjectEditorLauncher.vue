<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CodeBracketSquareIcon } from '@heroicons/vue/24/outline';

import type { ProjectEditor, ProjectEditorId } from '@dev-dashboard/contracts';
import { fetchProjectEditors, openProjectEditor } from '../api';

const props = defineProps<{ projectId: string }>();

const editors = ref<ProjectEditor[]>([]);
const selectedEditorId = ref<ProjectEditorId>();
const loading = ref(true);
const opening = ref(false);
const feedback = ref('');

const selectedEditor = computed(() =>
  editors.value.find((editor) => editor.id === selectedEditorId.value),
);
const buttonLabel = computed(() => {
  if (opening.value) return 'Abrindo…';
  if (editors.value.length === 1 && selectedEditor.value) {
    return `Abrir no ${selectedEditor.value.name}`;
  }
  return editors.value.length ? 'Abrir editor' : 'Editor indisponível';
});

async function loadEditors(): Promise<void> {
  const requestedProjectId = props.projectId;
  loading.value = true;
  feedback.value = '';
  editors.value = [];
  selectedEditorId.value = undefined;
  try {
    const availability = await fetchProjectEditors(requestedProjectId);
    if (props.projectId !== requestedProjectId) return;
    editors.value = availability.editors;
    selectedEditorId.value =
      availability.preferredEditorId ?? availability.editors[0]?.id;
  } catch (error) {
    if (props.projectId === requestedProjectId) {
      feedback.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar os editores.';
    }
  } finally {
    if (props.projectId === requestedProjectId) loading.value = false;
  }
}

async function openEditor(): Promise<void> {
  if (!selectedEditorId.value || opening.value) return;
  opening.value = true;
  feedback.value = '';
  try {
    const result = await openProjectEditor(
      props.projectId,
      selectedEditorId.value,
    );
    feedback.value = `Projeto aberto no ${result.editor.name}.`;
  } catch (error) {
    feedback.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível abrir o editor.';
  } finally {
    opening.value = false;
  }
}

watch(
  () => props.projectId,
  () => void loadEditors(),
  { immediate: true },
);
</script>

<template>
  <div class="project-editor-launcher">
    <div class="project-editor-controls">
      <select
        v-if="editors.length > 1"
        v-model="selectedEditorId"
        aria-label="Editor"
        :disabled="opening"
      >
        <option v-for="editor in editors" :key="editor.id" :value="editor.id">
          {{ editor.name }}
        </option>
      </select>
      <button
        class="secondary-button project-editor-button"
        type="button"
        :disabled="loading || opening || !selectedEditorId"
        :title="
          !loading && !editors.length
            ? 'Instale um editor compatível ou adicione o comando ao PATH da API.'
            : undefined
        "
        @click="openEditor"
      >
        <CodeBracketSquareIcon aria-hidden="true" />
        {{ loading ? 'Localizando editor…' : buttonLabel }}
      </button>
    </div>
    <p v-if="feedback" class="project-editor-feedback" role="status">
      {{ feedback }}
    </p>
  </div>
</template>

<style scoped>
.project-editor-launcher {
  display: grid;
  justify-items: end;
  gap: 7px;
}

.project-editor-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-editor-controls select {
  min-height: 38px;
  max-width: 170px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
  font-size: var(--font-xs);
}

.project-editor-button {
  min-height: 38px;
  white-space: nowrap;
}

.project-editor-button svg {
  width: 17px;
  height: 17px;
}

.project-editor-feedback {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

@media (max-width: 720px) {
  .project-editor-launcher,
  .project-editor-controls {
    width: 100%;
  }

  .project-editor-controls select,
  .project-editor-button {
    min-width: 0;
    flex: 1;
  }
}
</style>
