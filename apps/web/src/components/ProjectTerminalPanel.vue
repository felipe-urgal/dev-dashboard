<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { Project, ProjectTerminalKind } from '@dev-dashboard/contracts';

import {
  fetchProjectTerminalStatus,
  prepareProjectTerminalConfirmation,
  projectTerminalWebSocketUrl,
} from '../api';
import { useXtermSession } from '../composables/useXtermSession';
import { terminalThemes } from '../utils/terminal-theme';
import { currentTheme } from '../utils/visual-preferences';
import TerminalToolbar from './terminal/TerminalToolbar.vue';
import UiButton from './ui/UiButton.vue';

const props = withDefaults(
  defineProps<{
    project: Project;
    kind: ProjectTerminalKind;
    title: string;
    description: string;
    autoStart?: boolean;
    environmentInstanceId?: string | undefined;
  }>(),
  { autoStart: false },
);

type SessionState = 'idle' | 'connecting' | 'connected' | 'closed';

const loadingStatus = ref(true);
const supported = ref(false);
const statusMessage = ref('');
const sessionState = ref<SessionState>('idle');
const errorMessage = ref('');
const lastExitCode = ref<number | null | undefined>(undefined);
const closedByUser = ref(false);
const maximized = ref(false);
const hasAutoStarted = ref(false);
const searchOpen = ref(false);
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

const terminalContainer = ref<HTMLDivElement | null>(null);
let socket: WebSocket | undefined;
let sessionGeneration = 0;
let statusGeneration = 0;

const session = useXtermSession({
  container: terminalContainer,
  interactive: true,
  onInput: (data) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'input', data }));
    }
  },
  onFind: () => openSearch(),
  onResize: ({ cols, rows }) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  },
});

function openSearch(): void {
  searchOpen.value = true;
  void nextTick(() => {
    searchInput.value?.focus();
    searchInput.value?.select();
  });
}

function closeSearch(): void {
  searchOpen.value = false;
  session.clearSearch();
  session.focus();
}

function toggleSearch(): void {
  if (searchOpen.value) closeSearch();
  else openSearch();
}

function runSearch(direction: 'next' | 'previous', incremental = false): void {
  session.find(searchQuery.value, direction, incremental);
}

const searchCountLabel = computed(() => {
  if (!searchQuery.value) return '';
  const { index, count } = session.searchResults.value;
  return count === 0 ? 'sem resultados' : `${index + 1} de ${count}`;
});

const stageBackground = computed(
  () => terminalThemes[currentTheme.value].background,
);
const location = computed(() =>
  props.project.path.replace(/^\/home\/[^/]+/, '~'),
);
const kindLabel = computed(() =>
  props.kind === 'rails-console' ? 'rails console' : 'shell',
);

/** `silent` reconsulta a disponibilidade sem trocar a tela por "verificando". */
async function loadStatus(silent = false): Promise<void> {
  const generation = ++statusGeneration;
  if (!silent) loadingStatus.value = true;

  try {
    const status = await fetchProjectTerminalStatus(
      props.project.id,
      props.kind,
      props.environmentInstanceId,
    );
    if (generation !== statusGeneration) return;

    supported.value = status.supported;
    statusMessage.value = status.message;
  } catch (error) {
    if (generation !== statusGeneration) return;

    supported.value = false;
    statusMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar a disponibilidade desta sessão.';
  } finally {
    if (generation === statusGeneration) loadingStatus.value = false;
  }

  if (
    generation === statusGeneration &&
    props.autoStart &&
    supported.value &&
    !hasAutoStarted.value &&
    sessionState.value === 'idle'
  ) {
    hasAutoStarted.value = true;
    void startSession();
  }
}

function disconnect(): void {
  sessionGeneration += 1;
  const current = socket;
  socket = undefined;
  current?.close(1000, 'Sessão encerrada pelo usuário');
}

function closeSession(): void {
  disconnect();
  closedByUser.value = true;
  lastExitCode.value = undefined;
  sessionState.value = 'closed';
  maximized.value = false;
  void loadStatus(true);
}

async function startSession(): Promise<void> {
  const generation = ++sessionGeneration;
  errorMessage.value = '';
  lastExitCode.value = undefined;
  closedByUser.value = false;
  sessionState.value = 'connecting';
  session.reset();

  try {
    const confirmation = await prepareProjectTerminalConfirmation(
      props.project.id,
      props.kind,
      props.environmentInstanceId,
    );
    if (generation !== sessionGeneration) return;

    const newSocket = new WebSocket(
      projectTerminalWebSocketUrl(
        props.project.id,
        props.kind,
        confirmation.token,
        props.environmentInstanceId,
      ),
    );
    socket = newSocket;

    newSocket.addEventListener('open', () => {
      if (socket !== newSocket) return;
      sessionState.value = 'connected';
      requestAnimationFrame(() => {
        if (session.mount()) session.refit();
      });
    });

    newSocket.addEventListener('message', (event) => {
      if (socket !== newSocket || typeof event.data !== 'string') return;
      let message: {
        type?: string;
        data?: string;
        code?: number | null;
        message?: string;
      };
      try {
        message = JSON.parse(event.data) as typeof message;
      } catch {
        return;
      }
      if (message.type === 'output' && typeof message.data === 'string') {
        session.write(message.data);
      } else if (message.type === 'exit') {
        lastExitCode.value =
          typeof message.code === 'number' ? message.code : null;
      } else if (
        message.type === 'error' &&
        typeof message.message === 'string'
      ) {
        errorMessage.value = message.message;
      }
    });

    newSocket.addEventListener('close', () => {
      if (socket !== newSocket) return;
      socket = undefined;
      sessionState.value = 'closed';
      maximized.value = false;
      void loadStatus(true);
    });

    newSocket.addEventListener('error', () => {
      if (socket !== newSocket) return;
      errorMessage.value = 'A conexão com a sessão de terminal falhou.';
    });
  } catch (error) {
    if (generation !== sessionGeneration) return;

    sessionState.value = 'idle';
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar a sessão.';
  }
}

async function restartSession(): Promise<void> {
  disconnect();
  await startSession();
}

function toggleMaximized(): void {
  maximized.value = !maximized.value;
  requestAnimationFrame(session.refit);
}

async function copySelection(): Promise<void> {
  await session.copySelection();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && maximized.value) maximized.value = false;
  if (event.key === 'Enter' && sessionState.value === 'closed') {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) return;
    void startSession();
  }
}

watch(
  () =>
    `${props.project.id}:${props.kind}:${props.environmentInstanceId ?? 'primary'}`,
  () => {
    disconnect();
    session.dispose();
    searchOpen.value = false;
    sessionState.value = 'idle';
    maximized.value = false;
    errorMessage.value = '';
    lastExitCode.value = undefined;
    closedByUser.value = false;
    hasAutoStarted.value = false;
    void loadStatus();
  },
);

onMounted(() => {
  void loadStatus();
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  statusGeneration += 1;
  disconnect();
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="terminal-panel">
    <div
      v-if="loadingStatus"
      class="terminal-state"
      role="status"
      aria-live="polite"
    >
      <span class="terminal-state-dot" aria-hidden="true" />
      <p>Verificando disponibilidade da sessão…</p>
    </div>

    <div v-else-if="!supported" class="terminal-state">
      <strong>Terminal indisponível para este projeto</strong>
      <p>{{ statusMessage }}</p>
      <UiButton @click="loadStatus()">Verificar de novo</UiButton>
    </div>

    <div v-else-if="sessionState === 'idle'" class="terminal-state">
      <strong>{{ description }}</strong>
      <p class="terminal-warning">
        Esta sessão permite comandos interativos no ambiente selecionado.
        Execute apenas comandos em que você confia.
      </p>
      <UiButton variant="primary" @click="startSession">
        Iniciar sessão
      </UiButton>
      <p v-if="errorMessage" class="terminal-error" role="alert">
        {{ errorMessage }}
      </p>
    </div>

    <template v-else>
      <div
        v-if="maximized"
        class="terminal-backdrop"
        @click="toggleMaximized"
      />
      <section
        class="terminal-frame"
        :class="{ 'terminal-frame-maximized': maximized }"
        :aria-label="title"
      >
        <TerminalToolbar
          :title="title"
          :state="sessionState"
          :location="location"
          :kind-label="kindLabel"
          :maximized="maximized"
          :font-size="session.fontSize.value"
          :copy-shortcut="session.copyShortcutLabel"
          :search-open="searchOpen"
          @search="toggleSearch"
          @copy="copySelection"
          @clear="session.clear"
          @restart="restartSession"
          @close="closeSession"
          @toggle-maximized="toggleMaximized"
          @set-font-size="session.setFontSize"
        />

        <div class="terminal-stage" :style="{ background: stageBackground }">
          <div ref="terminalContainer" class="terminal-body" />

          <div v-if="searchOpen" class="terminal-search" role="search">
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              placeholder="Buscar no histórico"
              aria-label="Buscar no histórico"
              @input="runSearch('next', true)"
              @keydown.enter.exact.prevent="runSearch('next')"
              @keydown.shift.enter.prevent="runSearch('previous')"
              @keydown.esc.stop.prevent="closeSearch"
            />
            <small>{{ searchCountLabel }}</small>
            <UiButton
              icon
              size="sm"
              variant="ghost"
              aria-label="Resultado anterior"
              @click="runSearch('previous')"
            >
              <ChevronUpIcon aria-hidden="true" />
            </UiButton>
            <UiButton
              icon
              size="sm"
              variant="ghost"
              aria-label="Próximo resultado"
              @click="runSearch('next')"
            >
              <ChevronDownIcon aria-hidden="true" />
            </UiButton>
            <UiButton
              icon
              size="sm"
              variant="ghost"
              aria-label="Fechar busca"
              @click="closeSearch"
            >
              <XMarkIcon aria-hidden="true" />
            </UiButton>
          </div>

          <div
            v-if="sessionState === 'connecting'"
            class="terminal-connecting"
            role="status"
            aria-live="polite"
          >
            <span class="terminal-spinner" aria-hidden="true" />
            Conectando ao ambiente…
          </div>

          <div v-if="sessionState === 'closed'" class="terminal-ended">
            <div>
              <strong>Sessão encerrada</strong>
              <small v-if="closedByUser">Encerrada por você.</small>
              <small v-else-if="lastExitCode !== undefined">
                O processo finalizou com código {{ lastExitCode ?? '—' }}. O
                histórico acima continua disponível.
              </small>
              <small v-else>A conexão com o terminal foi encerrada.</small>
            </div>
            <UiButton variant="primary" @click="startSession">
              Nova sessão <kbd>Enter</kbd>
            </UiButton>
          </div>
        </div>

        <p v-if="errorMessage" class="terminal-error" role="alert">
          {{ errorMessage }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.terminal-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-0);
}

.terminal-state {
  display: grid;
  min-height: 100%;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 32px;
  color: var(--text-muted);
  text-align: center;
}

.terminal-state p,
.terminal-state strong {
  margin: 0;
}

.terminal-state strong {
  color: var(--text);
  font-size: 16px;
}

.terminal-state-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--warning-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning-text) 12%, transparent);
}

.terminal-warning {
  max-width: 560px;
  color: var(--warning-text);
  font-size: 12px;
  line-height: 1.5;
}

.terminal-error {
  margin: 8px 12px 12px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 13px;
}

.terminal-backdrop {
  position: fixed;
  z-index: 90;
  inset: 0;
  background: rgb(10 12 20 / 55%);
  backdrop-filter: blur(2px);
}

.terminal-frame {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-0);
}

.terminal-frame-maximized {
  position: fixed;
  /* Acima da barra global (z-index 60). */
  z-index: 100;
  inset: 0;
  width: auto;
  height: auto;
}

.terminal-stage {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
}

.terminal-body {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  overflow: hidden;
  padding: 14px 18px 18px;
}

.terminal-body :deep(.xterm) {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.terminal-body :deep(.xterm-viewport) {
  max-width: 100%;
  overflow-x: hidden !important;
  overflow-y: auto;
}

.terminal-search {
  position: absolute;
  z-index: 5;
  top: 10px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface-1);
  box-shadow: 0 10px 28px rgb(0 0 0 / 35%);
}

.terminal-search input {
  width: 200px;
  border: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  outline: none;
}

.terminal-search small {
  min-width: 70px;
  color: var(--text-dim);
  font-size: 12px;
  text-align: right;
}

.terminal-connecting {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface-0) 75%, transparent);
  font-size: 13px;
}

.terminal-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: terminal-spin 1s linear infinite;
}

@keyframes terminal-spin {
  to {
    transform: rotate(360deg);
  }
}

.terminal-ended {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-strong);
  background: color-mix(in srgb, var(--surface-1) 94%, transparent);
  backdrop-filter: blur(4px);
}

.terminal-ended strong {
  display: block;
  font-size: 14px;
}

.terminal-ended small {
  color: var(--text-dim);
  font-size: 13px;
}

.terminal-ended kbd {
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, currentcolor 45%, transparent);
  border-radius: 5px;
  font-family: var(--font-family-mono);
  font-size: 11px;
}

@media (max-width: 720px) {
  .terminal-body {
    padding: 10px 12px 14px;
  }

  .terminal-ended {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
