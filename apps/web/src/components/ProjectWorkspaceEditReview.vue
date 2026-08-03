<script setup lang="ts">
import { ref } from 'vue';

import type {
  ProjectFileContent,
  ProjectWorkspaceEditPreview,
} from '@dev-dashboard/contracts';

import { applyProjectWorkspaceEdit } from '../api';

const props = defineProps<{
  projectId: string;
  preview: ProjectWorkspaceEditPreview;
}>();

const emit = defineEmits<{
  applied: [files: ProjectFileContent[]];
  cancel: [];
}>();

const applying = ref(false);
const errorMessage = ref('');

async function apply(): Promise<void> {
  if (applying.value) return;
  applying.value = true;
  errorMessage.value = '';
  try {
    const result = await applyProjectWorkspaceEdit(props.projectId, {
      confirmationToken: props.preview.confirmationToken,
    });
    emit('applied', result.files);
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível aplicar a alteração proposta.';
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <section
    class="workspace-edit-review"
    aria-labelledby="workspace-edit-review-title"
  >
    <header>
      <div>
        <span class="section-kicker">Revisão obrigatória</span>
        <h4 id="workspace-edit-review-title">Alteração proposta pelo servidor de linguagem</h4>
        <p>
          Nenhum arquivo foi gravado. Compare o conteúdo atual e o resultado antes
          de confirmar.
        </p>
      </div>
      <span>{{ preview.files.length }} {{ preview.files.length === 1 ? 'arquivo' : 'arquivos' }}</span>
    </header>

    <p v-if="errorMessage" class="alert alert-error" role="alert">
      {{ errorMessage }}
    </p>

    <div class="workspace-edit-files">
      <article v-for="file in preview.files" :key="file.path">
        <h5>{{ file.path }}</h5>
        <div class="workspace-edit-comparison">
          <section>
            <strong>Atual</strong>
            <pre tabindex="0"><code>{{ file.beforeContent }}</code></pre>
          </section>
          <section>
            <strong>Proposto</strong>
            <pre tabindex="0"><code>{{ file.afterContent }}</code></pre>
          </section>
        </div>
      </article>
    </div>

    <footer>
      <button
        type="button"
        class="button"
        :disabled="applying"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="button button-primary"
        :disabled="applying"
        @click="apply"
      >
        {{ applying ? 'Aplicando…' : 'Aplicar alterações' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.workspace-edit-review {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.workspace-edit-review > header,
.workspace-edit-review > footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.workspace-edit-review h4,
.workspace-edit-review h5,
.workspace-edit-review p {
  margin: 0;
}

.workspace-edit-review h4 {
  margin-top: 4px;
}

.workspace-edit-review p {
  margin-top: 5px;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.workspace-edit-review > header > span {
  color: var(--text-muted);
  font-size: var(--font-xs);
  white-space: nowrap;
}

.workspace-edit-files {
  display: grid;
  gap: 12px;
  max-height: 520px;
  overflow: auto;
}

.workspace-edit-files article {
  display: grid;
  gap: 8px;
}

.workspace-edit-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-edit-comparison section {
  min-width: 0;
}

.workspace-edit-comparison strong {
  display: block;
  margin-bottom: 5px;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.workspace-edit-comparison pre {
  min-height: 120px;
  max-height: 300px;
  margin: 0;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text);
  font: 12px/1.55 var(--font-mono);
  white-space: pre;
}

.workspace-edit-review > footer {
  justify-content: flex-end;
}

@media (max-width: 820px) {
  .workspace-edit-comparison {
    grid-template-columns: 1fr;
  }
}
</style>
