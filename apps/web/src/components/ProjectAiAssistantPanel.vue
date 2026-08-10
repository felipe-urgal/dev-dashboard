<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';

import {
  CheckIcon,
  DocumentMagnifyingGlassIcon,
  SparklesIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type {
  AiChatStreamEvent,
  AiImplementationExecution,
  AiModelInfo,
  Project,
  ProjectWorkspaceEditPreview,
} from '@dev-dashboard/contracts';

import {
  applyProjectWorkspaceEdit,
  cancelProjectAiImplementation,
  fetchProjectAiImplementation,
  fetchProjectAiStatus,
  startProjectAiImplementation,
} from '../api';

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{ 'execution-updated': [] }>();

const prompt = ref('');
const model = ref('');
const loading = ref(true);
const starting = ref(false);
const applying = ref(false);
const errorMessage = ref('');
const execution = ref<AiImplementationExecution | null>(null);
const models = ref<AiModelInfo[]>([]);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

const isRunning = computed(() => execution.value?.status === 'running');
const message = computed(
  () =>
    execution.value?.events
      .filter(
        (
          event,
        ): event is Extract<AiChatStreamEvent, { type: 'message-delta' }> =>
          event.type === 'message-delta',
      )
      .map((event) => event.content)
      .join('') ?? '',
);
const preview = computed<ProjectWorkspaceEditPreview | null>(() => {
  const event = execution.value?.events
    .slice()
    .reverse()
    .find((item) => item.type === 'workspace-edit-proposed');
  return event?.type === 'workspace-edit-proposed' ? event.preview : null;
});
const visibleEvents = computed(() =>
  (execution.value?.events ?? []).filter(
    (event) => event.type !== 'message-delta' && event.type !== 'done',
  ),
);

function statusLabel(status: AiImplementationExecution['status']): string {
  return {
    running: 'Em execução',
    succeeded: 'Concluída',
    failed: 'Falhou',
    cancelled: 'Cancelada',
  }[status];
}

function eventLabel(event: AiChatStreamEvent): string {
  if (event.type === 'tool-call')
    return `Consultando ${event.tool.replaceAll('_', ' ')}`;
  if (event.type === 'tool-result')
    return event.ok ? event.summary : `Não foi possível: ${event.summary}`;
  if (event.type === 'workspace-edit-proposed')
    return 'Prévia de alterações preparada';
  if (event.type === 'error') return event.message;
  return '';
}

function schedulePolling(currentGeneration: number): void {
  if (!isRunning.value || currentGeneration !== generation) return;
  pollTimer = setTimeout(() => void refresh(currentGeneration), 1_500);
}

async function refresh(currentGeneration = generation): Promise<void> {
  try {
    const result = await fetchProjectAiImplementation(props.project.id);
    if (currentGeneration !== generation) return;
    execution.value = result.execution;
    emit('execution-updated');
  } catch (error) {
    if (currentGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a execução.';
    }
  } finally {
    if (currentGeneration === generation) {
      loading.value = false;
      schedulePolling(currentGeneration);
    }
  }
}

async function initialize(): Promise<void> {
  const currentGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  clearTimeout(pollTimer);
  try {
    const [status, result] = await Promise.all([
      fetchProjectAiStatus(props.project.id),
      fetchProjectAiImplementation(props.project.id),
    ]);
    if (currentGeneration !== generation) return;
    models.value = status.models;
    model.value =
      status.models.find((candidate) =>
        candidate.capabilities.includes('tools'),
      )?.name ??
      status.models[0]?.name ??
      '';
    execution.value = result.execution;
    if (!status.available) errorMessage.value = status.message;
  } catch (error) {
    if (currentGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar o assistente.';
    }
  } finally {
    if (currentGeneration === generation) {
      loading.value = false;
      schedulePolling(currentGeneration);
    }
  }
}

async function start(): Promise<void> {
  if (!prompt.value.trim() || !model.value || starting.value) return;
  starting.value = true;
  errorMessage.value = '';
  try {
    const result = await startProjectAiImplementation(
      props.project.id,
      model.value,
      prompt.value.trim(),
    );
    execution.value = result.execution;
    prompt.value = '';
    emit('execution-updated');
    schedulePolling(generation);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar a implementação.';
  } finally {
    starting.value = false;
  }
}

async function cancel(): Promise<void> {
  if (!execution.value || !isRunning.value) return;
  try {
    const result = await cancelProjectAiImplementation(
      props.project.id,
      execution.value.id,
    );
    execution.value = result.execution;
    emit('execution-updated');
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar a execução.';
  }
}

async function applyPreview(): Promise<void> {
  if (
    !preview.value ||
    applying.value ||
    execution.value?.status !== 'succeeded'
  )
    return;
  applying.value = true;
  errorMessage.value = '';
  try {
    await applyProjectWorkspaceEdit(
      props.project.id,
      preview.value.confirmationToken,
    );
    emit('execution-updated');
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível aplicar as alterações.';
  } finally {
    applying.value = false;
  }
}

void initialize();
onUnmounted(() => {
  generation += 1;
  clearTimeout(pollTimer);
});
</script>

<template>
  <section class="ai-assistant-panel">
    <header class="ai-assistant-heading">
      <div>
        <span>FERRAMENTAS DO PROJETO</span>
        <h2>Assistente IA</h2>
        <p>
          Descreva o que deseja implementar. A IA pesquisa o projeto e prepara
          uma prévia para sua aprovação.
        </p>
      </div>
      <DocumentMagnifyingGlassIcon aria-hidden="true" />
    </header>

    <div class="ai-assistant-composer">
      <label for="ai-implementation-prompt">O que você quer implementar?</label>
      <textarea
        id="ai-implementation-prompt"
        v-model="prompt"
        :disabled="loading || isRunning"
        maxlength="8000"
        placeholder="Ex.: adicionar autenticação por token na API e cobrir o fluxo com testes."
      />
      <div class="ai-assistant-composer-actions">
        <label>
          Modelo
          <select v-model="model" :disabled="loading || isRunning">
            <option value="" disabled>Selecione um modelo</option>
            <option
              v-for="candidate in models"
              :key="candidate.name"
              :value="candidate.name"
            >
              {{ candidate.name }}
            </option>
          </select>
        </label>
        <button
          class="primary-button ai-assistant-start"
          type="button"
          :disabled="loading || isRunning || !prompt.trim() || !model"
          @click="start"
        >
          <SparklesIcon aria-hidden="true" />
          {{ starting ? 'Iniciando...' : 'Iniciar' }}
        </button>
      </div>
      <p class="ai-assistant-background-note">
        Você pode sair desta aba; a execução continuará em segundo plano.
      </p>
    </div>

    <p v-if="errorMessage" class="ai-assistant-error">{{ errorMessage }}</p>

    <div class="ai-assistant-workbench">
      <section class="ai-assistant-activity" aria-live="polite">
        <header>
          <strong>Atividade ao vivo</strong
          ><span
            v-if="execution"
            :class="['ai-assistant-status', `is-${execution.status}`]"
            >{{ statusLabel(execution.status) }}</span
          >
        </header>
        <p v-if="!execution" class="ai-assistant-empty">
          Inicie uma solicitação para acompanhar as decisões da IA aqui.
        </p>
        <template v-else>
          <ol class="ai-assistant-events">
            <li
              v-for="(event, index) in visibleEvents"
              :key="`${event.type}-${index}`"
            >
              {{ eventLabel(event) }}
            </li>
            <li v-if="isRunning" class="is-pending">A IA está trabalhando…</li>
          </ol>
          <p v-if="message" class="ai-assistant-response">{{ message }}</p>
          <button
            v-if="isRunning"
            class="secondary-button"
            type="button"
            @click="cancel"
          >
            <StopIcon aria-hidden="true" /> Cancelar execução
          </button>
        </template>
      </section>

      <section class="ai-assistant-preview">
        <header>
          <strong>Prévia de alterações</strong
          ><span v-if="preview">{{ preview.files.length }} arquivo(s)</span>
        </header>
        <p v-if="!preview" class="ai-assistant-empty">
          Os arquivos sugeridos aparecerão aqui antes de qualquer escrita no
          projeto.
        </p>
        <template v-else>
          <ul>
            <li v-for="file in preview.files" :key="file.path">
              <CheckIcon aria-hidden="true" /><code>{{ file.path }}</code>
            </li>
          </ul>
          <button
            class="primary-button"
            type="button"
            :disabled="execution?.status !== 'succeeded' || applying"
            @click="applyPreview"
          >
            <CheckIcon aria-hidden="true" />
            {{ applying ? 'Aplicando...' : 'Aprovar alterações' }}
          </button>
          <small v-if="execution?.status !== 'succeeded'"
            >A aprovação fica disponível após a IA concluir a análise.</small
          >
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped src="./ProjectAiAssistantPanel.css"></style>
