<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { Project, ProjectTestOverview } from '@dev-dashboard/contracts';

import {
  cancelProjectTestPty,
  fetchProjectTestPtyStatus,
  fetchProjectTests,
  projectTestPtyWebSocketUrl,
  startProjectTestPty,
  type ProjectTestPtyStatusSnapshot,
} from '../api';
import { usePtyTerminalSocket } from '../composables/usePtyTerminalSocket';
import Card from './Card.vue';

const props = defineProps<{ project: Project }>();

const overview = ref<ProjectTestOverview | null>(null);
const loadingOverview = ref(false);
const selectedCommandId = ref('');
const snapshot = ref<ProjectTestPtyStatusSnapshot | null>(null);
const starting = ref(false);
const cancelling = ref(false);
const errorMessage = ref('');

const { terminalContainer, connecting, connect, disconnect, disposeTerminal } =
  usePtyTerminalSocket<ProjectTestPtyStatusSnapshot & { buffer: string }>({
    onReady: (readySnapshot) => {
      snapshot.value = readySnapshot;
    },
    onExit: (exitCode, exitSignal) => {
      if (snapshot.value) {
        snapshot.value = {
          ...snapshot.value,
          status: 'exited',
          exitCode,
          exitSignal,
        };
      }
    },
    onError: (message) => {
      errorMessage.value = message;
    },
  });

const isRunning = computed(() => snapshot.value?.status === 'running');
const selectedCommand = computed(() =>
  overview.value?.commands.find(
    (command) => command.id === selectedCommandId.value,
  ),
);
const exitLabel = computed(() => {
  if (!snapshot.value || snapshot.value.status !== 'exited') return '';
  const code = snapshot.value.exitCode;
  return code === 0
    ? 'Concluído com sucesso'
    : `Encerrado (código ${code ?? '—'})`;
});

async function loadOverview(): Promise<void> {
  loadingOverview.value = true;
  try {
    overview.value = await fetchProjectTests(props.project.id);
    if (!selectedCommandId.value && (overview.value.commands.length ?? 0) > 0) {
      selectedCommandId.value = overview.value.commands[0]!.id;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os comandos de teste.';
  } finally {
    loadingOverview.value = false;
  }
}

async function loadStatusAndReconnect(): Promise<void> {
  try {
    snapshot.value = await fetchProjectTestPtyStatus(props.project.id);
    if (snapshot.value) connect(projectTestPtyWebSocketUrl(props.project.id));
  } catch {
    // best-effort: se a consulta inicial falhar, o botão "Executar" ainda funciona.
  }
}

async function start(): Promise<void> {
  if (!selectedCommandId.value || isRunning.value || starting.value) return;
  errorMessage.value = '';
  starting.value = true;
  disposeTerminal();
  try {
    snapshot.value = await startProjectTestPty(
      props.project.id,
      selectedCommandId.value,
    );
    connect(projectTestPtyWebSocketUrl(props.project.id));
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar os testes.';
    // Já existe uma execução em andamento (ex. de uma tentativa anterior
    // que falhou no meio do caminho) — reconecta pra mostrar o estado
    // real e liberar o botão "Cancelar", em vez de deixar a tela travada
    // sem nenhuma ação possível.
    await loadStatusAndReconnect();
  } finally {
    starting.value = false;
  }
}

async function cancel(): Promise<void> {
  cancelling.value = true;
  try {
    await cancelProjectTestPty(props.project.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar a execução.';
  } finally {
    cancelling.value = false;
  }
}

watch(
  () => props.project.id,
  () => {
    disconnect();
    disposeTerminal();
    snapshot.value = null;
    errorMessage.value = '';
    selectedCommandId.value = '';
    overview.value = null;
    void loadOverview();
    void loadStatusAndReconnect();
  },
  { immediate: true },
);
</script>

<template>
  <Card padded class="project-detail-card tests-pty-panel">
    <template #header>
      <h3>Testes</h3>
    </template>

    <p class="tests-pty-note">
      Prova de conceito: roda a suíte completa num terminal de verdade — cores e
      formatação idênticas ao que você veria rodando o comando localmente.
      Execução por arquivo/caso específico e testes relacionados à branch ainda
      não migraram para cá.
    </p>

    <div class="tests-pty-controls">
      <select
        v-model="selectedCommandId"
        :disabled="
          loadingOverview || isRunning || (overview?.commands.length ?? 0) <= 1
        "
      >
        <option v-if="loadingOverview" value="">Carregando…</option>
        <option
          v-for="command in overview?.commands ?? []"
          :key="command.id"
          :value="command.id"
        >
          {{ command.label }}
        </option>
      </select>

      <button
        type="button"
        class="primary-button"
        :disabled="!selectedCommand || isRunning || starting"
        @click="start"
      >
        {{ starting ? 'Iniciando…' : 'Executar suíte completa' }}
      </button>

      <button
        v-if="isRunning"
        type="button"
        class="secondary-button"
        :disabled="cancelling"
        @click="cancel"
      >
        {{ cancelling ? 'Cancelando…' : 'Cancelar' }}
      </button>
    </div>

    <p v-if="connecting" class="tests-pty-status">Conectando…</p>
    <p v-else-if="isRunning" class="tests-pty-status">Executando…</p>
    <p v-else-if="exitLabel" class="tests-pty-status">{{ exitLabel }}</p>

    <p v-if="errorMessage" class="tests-pty-error" role="alert">
      {{ errorMessage }}
    </p>

    <div
      v-if="snapshot"
      ref="terminalContainer"
      class="tests-pty-terminal"
    ></div>
  </Card>
</template>

<style scoped>
.tests-pty-panel {
  display: grid;
  gap: var(--space-3);
}

.tests-pty-note {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.tests-pty-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.tests-pty-status {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.tests-pty-error {
  color: var(--danger-text);
  background: var(--danger-surface);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin: 0;
  font-size: var(--font-sm);
}

.tests-pty-terminal {
  height: 420px;
  background: #10131c;
  border: 1px solid #262c40;
  border-radius: var(--radius-md);
  padding: var(--space-3);
  overflow: hidden;
}
</style>
