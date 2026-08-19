<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { DocumentTextIcon } from '@heroicons/vue/24/outline';

import type { Project, ProjectFileEntry } from '@dev-dashboard/contracts';

import { fetchProjectFileContent, fetchProjectMarkdownFiles } from '../api';
import type { CodeBlock } from '../utils/project-readme-markdown';
import { parseMarkdown } from '../utils/project-readme-markdown';
import ProjectReadmeDocument from './ProjectReadmeDocument.vue';
import ProjectReadmeFileList from './ProjectReadmeFileList.vue';

const props = defineProps<{
  project: Project;
}>();

const loading = ref(false);
const errorMessage = ref('');
const files = ref<ProjectFileEntry[]>([]);
const filesTruncated = ref(false);
const selectedPath = ref('');
const content = ref('');
const copiedBlockId = ref('');

const blocks = computed(() =>
  content.value ? parseMarkdown(content.value) : [],
);

const selectedFile = computed(
  () => files.value.find((file) => file.path === selectedPath.value) ?? null,
);

async function selectFile(path: string): Promise<void> {
  const projectId = props.project.id;
  selectedPath.value = path;
  loading.value = true;
  errorMessage.value = '';

  try {
    const file = await fetchProjectFileContent(projectId, path);
    if (props.project.id === projectId && selectedPath.value === path) {
      content.value = file.content;
    }
  } catch (error) {
    if (props.project.id === projectId && selectedPath.value === path) {
      content.value = '';
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o arquivo selecionado.';
    }
  } finally {
    if (props.project.id === projectId && selectedPath.value === path) {
      loading.value = false;
    }
  }
}

async function loadFiles(): Promise<void> {
  const projectId = props.project.id;
  loading.value = true;
  errorMessage.value = '';
  files.value = [];
  filesTruncated.value = false;
  selectedPath.value = '';
  content.value = '';

  try {
    const result = await fetchProjectMarkdownFiles(projectId);
    if (props.project.id !== projectId) return;

    files.value = result.files;
    filesTruncated.value = result.truncated;

    const first = result.files[0];
    if (first) {
      await selectFile(first.path);
    } else {
      loading.value = false;
    }
  } catch (error) {
    if (props.project.id === projectId) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível listar a documentação do projeto.';
      loading.value = false;
    }
  }
}

async function copyCode(block: CodeBlock): Promise<void> {
  try {
    await navigator.clipboard.writeText(block.content);
    copiedBlockId.value = block.id;
    window.setTimeout(() => {
      if (copiedBlockId.value === block.id) copiedBlockId.value = '';
    }, 1_500);
  } catch {
    copiedBlockId.value = '';
  }
}

watch(
  () => props.project.id,
  () => {
    void loadFiles();
  },
  { immediate: true },
);
</script>

<template>
  <section class="readme-panel" aria-labelledby="project-readme-title">
    <ProjectReadmeFileList
      :files="files"
      :selected-path="selectedPath"
      :loading="loading"
      @select="selectFile"
      @refresh="loadFiles"
    />

    <p v-if="filesTruncated" class="readme-truncated-warning" role="status">
      A lista foi limitada aos primeiros arquivos Markdown encontrados.
    </p>

    <div v-if="loading && !content" class="readme-state" aria-live="polite">
      <span class="readme-loading-icon">•••</span>
      <strong>Carregando documentação</strong>
      <p>Lendo os arquivos Markdown do projeto.</p>
    </div>

    <div v-else-if="errorMessage" class="readme-state readme-state-error">
      <span class="readme-loading-icon">!</span>
      <strong>Não foi possível abrir a documentação</strong>
      <p>{{ errorMessage }}</p>
      <button type="button" class="secondary-button" @click="loadFiles">
        Tentar novamente
      </button>
    </div>

    <div v-else-if="!selectedFile" class="readme-state">
      <DocumentTextIcon class="readme-empty-icon" aria-hidden="true" />
      <strong>Nenhum arquivo Markdown encontrado</strong>
      <p>
        Adicione um arquivo <code>.md</code> ao projeto (por exemplo, um
        README.md na raiz) para exibir a documentação nesta página.
      </p>
    </div>

    <ProjectReadmeDocument
      v-else
      :blocks="blocks"
      :copied-block-id="copiedBlockId"
      @copy-code="copyCode"
    />
  </section>
</template>

<style src="./ProjectReadmePanel.css"></style>
