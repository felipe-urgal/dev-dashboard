<script setup lang="ts">
import { ArrowPathIcon, DocumentTextIcon } from '@heroicons/vue/24/outline';

import type { ProjectFileEntry } from '@dev-dashboard/contracts';

const props = defineProps<{
  files: readonly ProjectFileEntry[];
  selectedPath: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  select: [path: string];
  refresh: [];
}>();

function fileDirectory(file: ProjectFileEntry): string {
  const lastSeparator = file.path.lastIndexOf('/');
  return lastSeparator >= 0
    ? file.path.slice(0, lastSeparator)
    : 'Raiz do projeto';
}
</script>

<template>
  <aside class="readme-file-browser" aria-label="Arquivos Markdown do projeto">
    <header class="readme-file-browser-header">
      <div>
        <strong>Arquivos</strong>
        <span>{{ props.files.length }}</span>
      </div>

      <button
        type="button"
        class="readme-browser-refresh"
        :disabled="props.loading"
        :aria-label="
          props.loading ? 'Atualizando documentação' : 'Atualizar documentação'
        "
        :title="props.loading ? 'Atualizando...' : 'Atualizar'"
        @click="emit('refresh')"
      >
        <ArrowPathIcon aria-hidden="true" />
      </button>
    </header>

    <div class="readme-file-browser-body">
      <section class="readme-file-group readme-project-files">
        <div class="readme-file-group-label">
          <span>Projeto</span>
          <strong>{{ props.files.length }}</strong>
        </div>

        <button
          v-for="file in props.files"
          :key="file.path"
          type="button"
          class="readme-file-item"
          :class="{
            'readme-file-item-active': file.path === props.selectedPath,
          }"
          :aria-current="file.path === props.selectedPath ? 'true' : undefined"
          :disabled="props.loading && file.path === props.selectedPath"
          @click="emit('select', file.path)"
        >
          <DocumentTextIcon aria-hidden="true" />
          <span class="readme-file-item-copy">
            <strong>{{ file.name }}</strong>
            <span>{{ fileDirectory(file) }}</span>
          </span>
        </button>

        <p v-if="!props.files.length" class="readme-file-group-empty">
          Nenhum Markdown do projeto nesta leitura.
        </p>
      </section>
    </div>
  </aside>
</template>
