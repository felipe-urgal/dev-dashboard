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

function closeTerminal(): void {
  disconnect();
  disposeTerminal();
  snapshot.value = null;
  errorMessage.value = '';
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
      <div class="tests-pty-header">
        <div class="tests-pty-heading">
          <span class="tests-pty-eyebrow">Execução</span>
          <strong>Testes do projeto</strong>
          <small>Escolha uma suíte e acompanhe a saída em tempo real.</small>
        </div>
        <div class="tests-pty-controls">
          <span
            class="tests-pty-state"
            :class="{ 'tests-pty-state-running': isRunning }"
          >
            {{ isRunning ? 'Em execução' : snapshot ? 'Finalizado' : 'Pronto' }}
          </span>
          <select
          v-model="selectedCommandId"
          :disabled="
            loadingOverview ||
            isRunning ||
            (overview?.commands.length ?? 0) <= 1
          "
          aria-label="Comando de teste"
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
          :disabled="
            loadingOverview || !selectedCommand || isRunning || starting
          "
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

        <button
          v-if="snapshot && !isRunning"
          type="button"
          class="secondary-button"
          @click="closeTerminal"
        >
          Fechar terminal
        </button>
        </div>
      </div>
    </template>

    <p v-if="connecting" class="tests-pty-status">Conectando…</p>
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
:global(.dd-card.project-detail-card.tests-pty-panel) {
  display: flex;
  flex-direction: column;
  align-content: normal;
  grid-template-rows: none;
  min-height: 0;
}

.tests-pty-panel {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  /*gap: var(--space-3);*/
  overflow: hidden;
}

.tests-pty-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 14px 16px;
}

.tests-pty-heading {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.tests-pty-eyebrow {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tests-pty-heading strong {
  color: var(--text);
  font-size: 14px;
}

.tests-pty-heading small {
  color: var(--text-muted);
  font-size: 11px;
}

.tests-pty-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.tests-pty-state {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 10px;
  font-weight: 800;
}

.tests-pty-state-running {
  border-color: var(--success-text);
  color: var(--success-text);
  background: var(--success-surface);
}

.tests-pty-controls select,
.tests-pty-controls .primary-button,
.tests-pty-controls .secondary-button {
  height: 38px;
  box-sizing: border-box;
}

.tests-pty-controls select {
  min-width: 160px;
  max-width: 280px;
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
  flex: 1 1 0;
  min-height: 0;
  height: 0;
  box-sizing: border-box;
  margin: 0;
  width: 100%;
  max-width: 100%;
  background: #10131c;
  border-top: 1px solid #262c40;
  padding: 16px 18px 20px;
  overflow: hidden;
}

.tests-pty-terminal :global(.xterm) {
  width: 100%;
  height: 100%;
  padding-inline: 10px;
}

@media (max-width: 620px) {
  .tests-pty-header {
    align-items: stretch;
    flex-direction: column;
  }

  .tests-pty-controls {
    justify-content: stretch;
  }

  .tests-pty-controls select,
  .tests-pty-controls button {
    flex: 1 1 140px;
  }
}

.tests-pty-terminal :global(.xterm-viewport) {
  background-color: #10131c !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  scrollbar-width: none;
}

.tests-pty-terminal :global(.xterm-viewport::-webkit-scrollbar) {
  display: none;
}
</style>
