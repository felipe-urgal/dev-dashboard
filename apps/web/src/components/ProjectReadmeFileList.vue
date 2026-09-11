<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  ArrowPathIcon,
  ChevronRightIcon,
  DocumentTextIcon,
} from '@heroicons/vue/24/outline';

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

const dependenciesOpen = ref(false);

function isDependencyPath(path: string): boolean {
  return /(^|\/)node_modules(\/|$)/.test(path);
}

const projectFiles = computed(() =>
  props.files.filter((file) => !isDependencyPath(file.path)),
);

const dependencyFiles = computed(() =>
  props.files.filter((file) => isDependencyPath(file.path)),
);

function fileDirectory(file: ProjectFileEntry): string {
  const lastSeparator = file.path.lastIndexOf('/');
  return lastSeparator >= 0
    ? file.path.slice(0, lastSeparator)
    : 'Raiz do projeto';
}

function handleDependenciesToggle(event: Event): void {
  dependenciesOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}

watch(
  () => props.selectedPath,
  (path) => {
    if (isDependencyPath(path)) dependenciesOpen.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <aside class="readme-file-browser" aria-label="Arquivos Markdown do projeto">
    <header class="readme-file-browser-header">
      <div>
        <span>Documentação</span>
        <strong>Arquivos</strong>
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
          <strong>{{ projectFiles.length }}</strong>
        </div>

        <button
          v-for="file in projectFiles"
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

        <p v-if="!projectFiles.length" class="readme-file-group-empty">
          Nenhum Markdown do projeto nesta leitura.
        </p>
      </section>

      <details
        v-if="dependencyFiles.length"
        class="readme-dependency-group"
        :open="dependenciesOpen"
        @toggle="handleDependenciesToggle"
      >
        <summary class="readme-file-group-label">
          <span class="readme-dependency-label">
            <ChevronRightIcon aria-hidden="true" />
            Dependências
          </span>
          <strong class="readme-dependency-summary-count">
            {{ dependencyFiles.length }}
          </strong>
        </summary>

        <div class="readme-dependency-files">
          <button
            v-for="file in dependencyFiles"
            :key="file.path"
            type="button"
            class="readme-file-item"
            :class="{
              'readme-file-item-active': file.path === props.selectedPath,
            }"
            :aria-current="
              file.path === props.selectedPath ? 'true' : undefined
            "
            :disabled="props.loading && file.path === props.selectedPath"
            @click="emit('select', file.path)"
          >
            <DocumentTextIcon aria-hidden="true" />
            <span class="readme-file-item-copy">
              <strong>{{ file.name }}</strong>
              <span>{{ fileDirectory(file) }}</span>
            </span>
          </button>
        </div>
      </details>
    </div>

    <footer class="readme-file-browser-footer">
      {{ props.files.length }} arquivo{{
        props.files.length === 1 ? '' : 's'
      }}
      Markdown
    </footer>
  </aside>
</template>
