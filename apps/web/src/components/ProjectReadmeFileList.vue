<script setup lang="ts">
import { ArrowPathIcon } from '@heroicons/vue/24/outline';

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
</script>

<template>
  <nav class="readme-file-list">
    <div
      v-if="props.files.length > 1"
      class="readme-file-list-item"
      aria-label="Arquivos Markdown do projeto"
    >
      <button
        v-for="file in props.files"
        :key="file.path"
        type="button"
        class="readme-file-item"
        :class="{ 'readme-file-item-active': file.path === props.selectedPath }"
        :aria-current="file.path === props.selectedPath ? 'true' : undefined"
        :disabled="props.loading && file.path === props.selectedPath"
        @click="emit('select', file.path)"
      >
        {{ file.path }}
      </button>
    </div>

    <button
      type="button"
      class="readme-refresh-button"
      :disabled="props.loading"
      @click="emit('refresh')"
    >
      <ArrowPathIcon aria-hidden="true" />
      {{ props.loading ? 'Atualizando...' : 'Atualizar' }}
    </button>
  </nav>
</template>
