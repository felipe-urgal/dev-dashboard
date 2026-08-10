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
  AiExecutionMode,
  AiImplementationExecution,
  AiProviderId,
  Project,
  ProjectAiProviderStatus,
  ProjectAiProvidersStatus,
  ProjectWorkspaceEditPreview,
} from '@dev-dashboard/contracts';

import {
  type AiFallbackMode,
  resolveAiFallbackOffer,
} from '../ai-fallback';
import {
  applyProjectWorkspaceEdit,
  cancelProjectAiImplementation,
  fetchProjectAiImplementation,
  fetchProjectAiProviders,
  startProjectAiImplementation,
  updateProjectAiProviderConsent,
  updateProjectAiSelection,
} from '../api';

const props = defineProps<{
  project: Project;
  projectId: string;
}>();
const emit = defineEmits<{ 'execution-updated': [] }>();

const prompt = ref('');
const model = ref('');
const providerId = ref<AiProviderId>('ollama');
const mode = ref<AiExecutionMode>('fast');
const fallbackMode = ref<AiFallbackMode>('offer');
const providers = ref<ProjectAiProviderStatus[]>([]);
const loading = ref(true);
const starting = ref(false);
const applying = ref(false);
const selectionSaving = ref(false);
const consentSaving = ref(false);
const errorMessage = ref('');
const execution = ref<AiImplementationExecution | null>(null);
const dismissedFallbackExecutionId = ref<string | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

const selectedProvider = computed(
  () =>
    providers.value.find((provider) => provider.id === providerId.value) ??
    null,
);
const models = computed(() => selectedProvider.value?.models ?? []);
const isRunning = computed(() => execution.value?.status === 'running');
const providerReady = computed(
  () =>
    Boolean(selectedProvider.value?.available) &&
    (!selectedProvider.value?.consentRequired ||
      Boolean(selectedProvider.value?.consentGranted)),
);
const canStart = computed(
  () =>
    !loading.value &&
    !isRunning.value &&
    !starting.value &&
    !selectionSaving.value &&
    providerReady.value &&
    Boolean(prompt.value.trim()) &&
    Boolean(model.value),
);
const providerKindLabel = computed(() =>
  selectedProvider.value?.kind === 'cloud' ? 'Cloud' : 'Local',
);
const fallbackOffer = computed(() => {
  if (
    execution.value &&
    dismissedFallbackExecutionId.value === execution.value.id
  ) {
    return null;
  }
  return resolveAiFallbackOffer(
    fallbackMode.value,
    execution.value,
    providerId.value,
    providers.value,
  );
});
const fallbackTarget = computed(() =>
  fallbackOffer.value
    ? (providers.value.find(
        (provider) => provider.id === fallbackOffer.value?.toProvider,
      ) ?? null)
    : null,
);
const fallbackNeedsConsent = computed(
  () =>
    fallbackTarget.value?.kind === 'cloud' &&
    fallbackTarget.value.consentRequired &&
    !fallbackTarget.value.consentGranted,
);
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

function preferredModel(provider: ProjectAiProviderStatus | null): string {
  if (!provider) return '';
  return (
    provider.models.find((candidate) =>
      candidate.capabilities.includes('tools'),
    )?.name ??
    provider.models[0]?.name ??
    ''
  );
}

function providerLabel(provider: AiProviderId): string {
  return (
    providers.value.find((candidate) => candidate.id === provider)?.label ??
    provider
  );
}

function applyProviderStatus(status: ProjectAiProvidersStatus): void {
  providers.value = status.providers;
  providerId.value = status.selectedProvider;
  mode.value = status.selectedMode;
  const availableModels =
    status.providers.find((provider) => provider.id === providerId.value)
      ?.models ?? [];
  if (!availableModels.some((candidate) => candidate.name === model.value)) {
    model.value = preferredModel(selectedProvider.value);
  }
}

function schedulePolling(currentGeneration: number): void {
  if (!isRunning.value || currentGeneration !== generation) return;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => void refresh(currentGeneration), 1_500);
}

async function refresh(currentGeneration = generation): Promise<void> {
  try {
    const result = await fetchProjectAiImplementation(props.projectId);
    if (currentGeneration !== generation) return;
    execution.value = result.execution;
    if (result.execution?.status === 'failed') {
      const providerStatus = await fetchProjectAiProviders(props.projectId);
      if (currentGeneration !== generation) return;
      applyProviderStatus(providerStatus);
    }
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
    const [providerStatus, result] = await Promise.all([
      fetchProjectAiProviders(props.projectId),
      fetchProjectAiImplementation(props.projectId),
    ]);
    if (currentGeneration !== generation) return;
    applyProviderStatus(providerStatus);
    execution.value = result.execution;
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

async function saveSelection(): Promise<void> {
  if (selectionSaving.value || isRunning.value) return;
  selectionSaving.value = true;
  errorMessage.value = '';
  try {
    const status = await updateProjectAiSelection(
      props.projectId,
      providerId.value,
      mode.value,
    );
    applyProviderStatus(status);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar a seleção de IA.';
  } finally {
    selectionSaving.value = false;
  }
}

async function changeProvider(): Promise<void> {
  model.value = preferredModel(selectedProvider.value);
  await saveSelection();
}

async function setConsent(granted: boolean): Promise<void> {
  if (consentSaving.value || providerId.value !== 'openai') return;
  consentSaving.value = true;
  errorMessage.value = '';
  try {
    const status = await updateProjectAiProviderConsent(
      props.projectId,
      providerId.value,
      granted,
    );
    applyProviderStatus(status);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível atualizar o consentimento cloud.';
  } finally {
    consentSaving.value = false;
  }
}

function dismissFallback(): void {
  if (execution.value) dismissedFallbackExecutionId.value = execution.value.id;
}

async function prepareFallback(): Promise<void> {
  const offer = fallbackOffer.value;
  const target = fallbackTarget.value;
  if (!offer || !target || !execution.value || selectionSaving.value) return;

  dismissedFallbackExecutionId.value = execution.value.id;
  providerId.value = target.id;
  model.value = preferredModel(target);
  prompt.value = execution.value.prompt;
  await saveSelection();
}

async function start(): Promise<void> {
  if (!canStart.value) return;
  starting.value = true;
  errorMessage.value = '';
  dismissedFallbackExecutionId.value = null;
  try {
    const result = await startProjectAiImplementation(
      props.projectId,
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
      props.projectId,
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
      props.projectId,
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
      <div class="ai-assistant-execution-options">
        <label>
          Executar com
          <select
            v-model="providerId"
            :disabled="loading || isRunning || selectionSaving"
            @change="changeProvider"
          >
            <option
              v-for="candidate in providers"
              :key="candidate.id"
              :value="candidate.id"
              :disabled="!candidate.available"
            >
              {{ candidate.label }} ·
              {{ candidate.kind === 'cloud' ? 'Cloud' : 'Local' }}
              {{ candidate.available ? '' : '· indisponível' }}
            </option>
          </select>
        </label>

        <fieldset class="ai-assistant-mode" :disabled="loading || isRunning">
          <legend>Modo</legend>
          <label>
            <input
              v-model="mode"
              type="radio"
              value="fast"
              @change="saveSelection"
            />
            Rápido
          </label>
          <label>
            <input
              v-model="mode"
              type="radio"
              value="complete"
              @change="saveSelection"
            />
            Completo
          </label>
        </fieldset>
      </div>

      <div v-if="selectedProvider" class="ai-assistant-provider-summary">
        <strong>{{ selectedProvider.label }} · {{ providerKindLabel }}</strong>
        <span>{{ selectedProvider.message }}</span>
      </div>

      <div
        v-if="fallbackOffer && fallbackTarget"
        class="ai-assistant-cloud-consent ai-assistant-fallback-offer"
      >
        <div>
          <strong>
            {{ providerLabel(fallbackOffer.fromProvider) }} falhou ·
            {{ fallbackTarget.label }} disponível
          </strong>
          <p>
            {{ fallbackOffer.reason }} A continuação reaproveita somente o
            pedido original; histórico e resultados de ferramentas não são
            enviados ao outro provider.
            <template v-if="fallbackNeedsConsent">
              Antes de enviar código à cloud, você ainda precisará autorizar
              este projeto.
            </template>
          </p>
        </div>
        <span class="ai-assistant-fallback-actions">
          <button
            class="secondary-button"
            type="button"
            @click="dismissFallback"
          >
            Agora não
          </button>
          <button
            class="primary-button"
            type="button"
            :disabled="selectionSaving"
            @click="prepareFallback"
          >
            Usar {{ fallbackTarget.label }}
          </button>
        </span>
      </div>

      <div
        v-if="
          selectedProvider?.kind === 'cloud' &&
          selectedProvider.available &&
          !selectedProvider.consentGranted
        "
        class="ai-assistant-cloud-consent"
      >
        <div>
          <strong>Autorizar envio de código à OpenAI?</strong>
          <p>
            O consentimento vale somente para este projeto e pode ser revogado.
            Segredos continuam mascarados antes de sair da máquina.
          </p>
        </div>
        <button
          class="secondary-button"
          type="button"
          :disabled="consentSaving"
          @click="setConsent(true)"
        >
          {{ consentSaving ? 'Salvando...' : 'Autorizar neste projeto' }}
        </button>
      </div>

      <label for="ai-implementation-prompt">O que você quer implementar?</label>
      <textarea
        id="ai-implementation-prompt"
        v-model="prompt"
        :disabled="loading || isRunning"
        maxlength="8000"
        placeholder="Ex.: adicionar autenticação por token na API e cobrir o fluxo com testes."
      />

      <details class="ai-assistant-advanced">
        <summary>Opções avançadas</summary>
        <div>
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
          <label>
            Fallback
            <select v-model="fallbackMode" :disabled="loading || isRunning">
              <option value="offer">Oferecer alternativa</option>
              <option value="off">Desativado</option>
            </select>
          </label>
          <button
            v-if="
              selectedProvider?.kind === 'cloud' &&
              selectedProvider.consentGranted
            "
            class="ai-assistant-revoke"
            type="button"
            :disabled="consentSaving || isRunning"
            @click="setConsent(false)"
          >
            Revogar acesso cloud deste projeto
          </button>
        </div>
      </details>

      <div class="ai-assistant-composer-actions">
        <p class="ai-assistant-background-note">
          Você pode sair desta aba; a execução continuará em segundo plano.
        </p>
        <button
          class="primary-button ai-assistant-start"
          type="button"
          :disabled="!canStart"
          @click="start"
        >
          <SparklesIcon aria-hidden="true" />
          {{ starting ? 'Iniciando...' : 'Iniciar' }}
        </button>
      </div>
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