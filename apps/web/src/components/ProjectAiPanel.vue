<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  ProjectAiStatus,
  ProjectWorkspaceEditPreview,
} from '@dev-dashboard/contracts';

import { fetchProjectAiStatus, streamProjectAiChat } from '../api';

const props = defineProps<{
  projectId: string;
  activeFilePath: string;
  activeFileLanguage: string;
  selectedText: string;
}>();

const emit = defineEmits<{
  'workspace-edit-proposed': [preview: ProjectWorkspaceEditPreview];
}>();

interface TranscriptEntry {
  role: 'user' | 'assistant';
  content: string;
}

const status = ref<ProjectAiStatus | null>(null);
const loadingStatus = ref(true);
const selectedModel = ref('');
const draft = ref('');
const transcript = ref<TranscriptEntry[]>([]);
const streaming = ref(false);
const errorMessage = ref('');
const activityLog = ref<string[]>([]);
const transcriptContainer = ref<HTMLElement | null>(null);
let stickToBottom = true;

let activeStream: { close: () => void; done: Promise<void> } | undefined;

const modelOptions = computed(() => status.value?.models ?? []);
const canSend = computed(() =>
  !streaming.value
  && draft.value.trim().length > 0
  && Boolean(selectedModel.value),
);

async function loadStatus(): Promise<void> {
  loadingStatus.value = true;
  errorMessage.value = '';
  try {
    status.value = await fetchProjectAiStatus(props.projectId);
    if (!selectedModel.value) {
      selectedModel.value = status.value.models[0]?.name ?? '';
    }
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível consultar o assistente de IA.';
  } finally {
    loadingStatus.value = false;
  }
}

function contextBlock(): string {
  if (props.selectedText.trim()) {
    return `\n\nTrecho selecionado em ${props.activeFilePath} (${props.activeFileLanguage}):\n\`\`\`${props.activeFileLanguage}\n${props.selectedText}\n\`\`\``;
  }
  if (props.activeFilePath) {
    return `\n\nArquivo atual: ${props.activeFilePath} (${props.activeFileLanguage}). Use a ferramenta read_project_file se precisar do conteúdo.`;
  }
  return '';
}

function quickAction(instruction: string): void {
  draft.value = `${instruction}${contextBlock()}`;
}

const STICK_TO_BOTTOM_THRESHOLD_PX = 24;

function handleTranscriptScroll(): void {
  const container = transcriptContainer.value;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  stickToBottom = distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
}

/**
 * Rola só o próprio container do transcript (nunca a página): `scrollIntoView`
 * rolaria qualquer ancestral necessário para trazer o elemento à vista,
 * incluindo o documento, arrastando a página inteira a cada delta de streaming.
 * Fora do envio de uma mensagem nova (`force`), só gruda no fim se o usuário já
 * estava lá — assim dá para rolar para cima e ler durante o streaming sem ser
 * puxado de volta a cada token.
 */
async function scrollToEnd(force = false): Promise<void> {
  await nextTick();
  const container = transcriptContainer.value;
  if (!container || (!force && !stickToBottom)) return;
  container.scrollTop = container.scrollHeight;
  stickToBottom = true;
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  const userMessage: TranscriptEntry = { role: 'user', content: draft.value };
  const history: AiChatMessage[] = [
    ...transcript.value.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user', content: userMessage.content },
  ];
  transcript.value = [...transcript.value, userMessage];
  draft.value = '';
  errorMessage.value = '';
  activityLog.value = [];
  streaming.value = true;
  void scrollToEnd(true);

  let assistantContent = '';
  const finish = (): void => {
    streaming.value = false;
    activeStream = undefined;
  };

  activeStream = streamProjectAiChat(
    props.projectId,
    selectedModel.value,
    history,
    (event: AiChatStreamEvent) => {
      if (event.type === 'message-delta') {
        assistantContent += event.content;
        const withoutLast = assistantContent === event.content
          ? transcript.value
          : transcript.value.slice(0, -1);
        transcript.value = [...withoutLast, { role: 'assistant', content: assistantContent }];
        void scrollToEnd();
        return;
      }
      if (event.type === 'tool-call') {
        activityLog.value = [...activityLog.value, `Executando ${event.tool}…`];
        return;
      }
      if (event.type === 'tool-result') {
        activityLog.value = [...activityLog.value, `${event.tool}: ${event.summary}`];
        return;
      }
      if (event.type === 'workspace-edit-proposed') {
        emit('workspace-edit-proposed', event.preview);
        return;
      }
      if (event.type === 'done') {
        finish();
        return;
      }
      if (event.type === 'error') {
        errorMessage.value = event.message;
        finish();
      }
    },
  );

  try {
    await activeStream.done;
  } catch (error) {
    if (streaming.value) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'A conexão com o assistente de IA foi interrompida.';
    }
  } finally {
    finish();
  }
}

function cancel(): void {
  activeStream?.close();
  streaming.value = false;
  activeStream = undefined;
}

watch(() => props.projectId, () => {
  cancel();
  transcript.value = [];
  activityLog.value = [];
  errorMessage.value = '';
  selectedModel.value = '';
  void loadStatus();
});

onMounted(() => void loadStatus());
onBeforeUnmount(() => cancel());
</script>

<template>
  <section class="ai-panel" aria-labelledby="ai-panel-title">
    <header class="ai-panel-header">
      <div>
        <span class="section-kicker">Ollama local</span>
        <h3 id="ai-panel-title">IA</h3>
      </div>
      <select
        v-if="modelOptions.length > 0"
        v-model="selectedModel"
        class="ai-panel-model"
        aria-label="Modelo de IA"
      >
        <option v-for="model in modelOptions" :key="model.name" :value="model.name">
          {{ model.name }}
        </option>
      </select>
    </header>

    <p v-if="loadingStatus" class="ai-panel-placeholder" role="status">
      Verificando o Ollama local…
    </p>
    <p v-else-if="!status?.available" class="ai-panel-placeholder" role="status">
      {{ status?.message ?? 'Assistente de IA indisponível.' }}
    </p>
    <template v-else>
      <div class="ai-panel-actions">
        <button type="button" @click="quickAction('Explique o que este trecho faz.')">
          Explicar
        </button>
        <button type="button" @click="quickAction('Encontre o problema neste trecho e sugira uma correção.')">
          Corrigir
        </button>
        <button type="button" @click="quickAction('Sugira testes automatizados para este trecho.')">
          Gerar testes
        </button>
        <button type="button" @click="quickAction('Sugira uma refatoração para este trecho, explicando o motivo.')">
          Refatorar
        </button>
      </div>

      <div
        ref="transcriptContainer"
        class="ai-panel-transcript"
        role="log"
        aria-label="Conversa com o assistente de IA"
        @scroll="handleTranscriptScroll"
      >
        <p v-if="transcript.length === 0" class="ai-panel-placeholder">
          Pergunte sobre o arquivo atual, uma seleção ou o projeto. As respostas não são
          salvas entre sessões.
        </p>
        <div
          v-for="(entry, index) in transcript"
          :key="index"
          class="ai-panel-message"
          :class="`ai-panel-message-${entry.role}`"
        >
          <strong>{{ entry.role === 'user' ? 'Você' : 'Assistente' }}</strong>
          <pre>{{ entry.content }}</pre>
        </div>
        <p v-if="activityLog.length > 0" class="ai-panel-activity" role="status">
          {{ activityLog.at(-1) }}
        </p>
      </div>

      <p v-if="errorMessage" class="alert alert-error ai-panel-error" role="alert">
        {{ errorMessage }}
      </p>

      <form class="ai-panel-composer" @submit.prevent="send">
        <label class="sr-only" for="ai-panel-input">Mensagem para o assistente de IA</label>
        <textarea
          id="ai-panel-input"
          v-model="draft"
          rows="3"
          placeholder="Pergunte algo sobre este projeto…"
          :disabled="streaming"
          @keydown.enter.exact.prevent="send"
        />
        <div class="ai-panel-composer-actions">
          <button
            v-if="streaming"
            type="button"
            class="button"
            @click="cancel"
          >
            Cancelar
          </button>
          <button
            v-else
            type="submit"
            class="button button-primary"
            :disabled="!canSend"
          >
            Enviar
          </button>
        </div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.ai-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 0;
  height: 100%;
  padding: 12px;
  border-inline-start: 1px solid var(--border);
  background: var(--surface-1);
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-panel-model {
  max-width: 55%;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--font-xs);
}

.ai-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-panel-actions button {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--font-xs);
  cursor: pointer;
}

.ai-panel-actions button:hover {
  background: var(--accent-soft);
}

.ai-panel-transcript {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.ai-panel-message {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: var(--font-sm);
}

.ai-panel-message-user {
  background: var(--accent-soft);
}

.ai-panel-message pre {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.ai-panel-activity {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.ai-panel-placeholder {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.ai-panel-error {
  margin: 0;
}

.ai-panel-composer {
  display: grid;
  gap: 6px;
}

.ai-panel-composer textarea {
  resize: vertical;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
  color: var(--text);
  font: inherit;
  font-size: var(--font-sm);
}

.ai-panel-composer-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
