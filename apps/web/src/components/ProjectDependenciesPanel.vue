<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  StopCircleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type { Project, ProjectScriptCatalog } from '@dev-dashboard/contracts';

import { fetchProjectScripts } from '../api';
import { useProjectDependenciesPty } from '../composables/useProjectDependenciesPty';
import { projectScriptDestination } from '../utils/project-script-visibility';

const props = defineProps<{ project: Project }>();

const catalog = ref<ProjectScriptCatalog | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const clock = ref(Date.now());
let generation = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;

const isSupportedProject = computed(() => Boolean(props.project.type));

const {
  snapshot,
  errorMessage: mutationErrorMessage,
  starting,
  cancelling,
  connecting,
  isRunning,
  terminalContainer,
  run,
  cancel,
} = useProjectDependenciesPty(() => props.project, isSupportedProject);

const actions = computed(() =>
  (catalog.value?.items ?? []).filter(
    (item) => projectScriptDestination(item, props.project) === 'dependencies',
  ),
);

const railsActions = computed(() =>
  actions.value.filter((item) => item.origin === 'bundler'),
);

const nodeActions = computed(() =>
  actions.value.filter(
    (item) =>
      item.origin === 'package-manager' ||
      (item.origin === 'package-script' && item.id === 'package-script:build'),
  ),
);

const nodeManager = computed(() => {
  const command = nodeActions.value[0]?.command
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  if (command === 'yarn') return 'Yarn';
  if (command === 'pnpm') return 'pnpm';
  if (command === 'bun') return 'Bun';
  if (command === 'npm') return 'npm';
  return 'Node';
});

const executedAction = computed(() =>
  snapshot.value
    ? actions.value.find((item) => item.id === snapshot.value?.actionId)
    : undefined,
);

const executionSucceeded = computed(
  () => snapshot.value?.status === 'exited' && snapshot.value.exitCode === 0,
);

const executionStateLabel = computed(() => {
  if (isRunning.value) return 'Executando';
  return executionSucceeded.value ? 'Concluído' : 'Falhou';
});

const executionDuration = computed(() => {
  const current = snapshot.value;
  if (!current) return '';

  const startedAt = Date.parse(current.startedAt);
  const endedAt = current.endedAt ? Date.parse(current.endedAt) : clock.value;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return '';

  const totalSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
});

const executionExitLabel = computed(() => {
  const current = snapshot.value;
  if (!current || isRunning.value) return '';
  if (current.exitCode !== null) return `código ${current.exitCode}`;
  if (current.exitSignal !== null) return `sinal ${current.exitSignal}`;
  return 'sem código de saída';
});

function updateClockTimer(running: boolean): void {
  if (clockTimer !== undefined) {
    clearInterval(clockTimer);
    clockTimer = undefined;
  }
  clock.value = Date.now();
  if (running) {
    clockTimer = setInterval(() => {
      clock.value = Date.now();
    }, 1_000);
  }
}

function runAgain(): void {
  if (executedAction.value) void run(executedAction.value);
}

async function load(): Promise<void> {
  const current = ++generation;
  loading.value = true;
  errorMessage.value = '';
  try {
    const query = new URLSearchParams({ page: '1', pageSize: '100' });
    const result = await fetchProjectScripts(props.project.id, query);
    if (current !== generation) return;
    catalog.value = result;
  } catch (error) {
    if (current === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar dependências e builds.';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}

watch(isRunning, updateClockTimer, { immediate: true });

watch(
  () => props.project.id,
  () => {
    catalog.value = null;
    void load();
  },
  { immediate: true },
);

onBeforeUnmount(() => updateClockTimer(false));
</script>

<template>
  <section
    class="dependencies-panel"
    aria-label="Dependências do projeto"
    :aria-busy="loading"
  >
    <div v-if="errorMessage" class="dependencies-alert" role="alert">
      {{ errorMessage }}
    </div>

    <div
      v-if="mutationErrorMessage && !snapshot"
      class="dependencies-alert"
      role="alert"
    >
      {{ mutationErrorMessage }}
    </div>

    <div v-if="loading && !catalog" class="dependencies-empty" role="status">
      Detectando gerenciadores e ações disponíveis…
    </div>

    <template v-else>
      <div v-if="actions.length" class="dependencies-groups">
        <section v-if="railsActions.length" class="dependencies-group">
          <header class="dependencies-group-header">
            <div>
              <strong>Ruby / Bundler</strong>
              <small>Gemfile detectado</small>
            </div>
          </header>

          <div class="dependencies-action-list">
            <article
              v-for="item in railsActions"
              :key="item.id"
              class="dependencies-action-row"
            >
              <div class="dependencies-action-copy">
                <strong>{{ item.name }}</strong>
                <small>{{ item.description }}</small>
                <span
                  v-if="item.id === 'bundler:update'"
                  class="dependencies-warning"
                >
                  <ExclamationTriangleIcon aria-hidden="true" />
                  Pode alterar o Gemfile.lock.
                </span>
              </div>
              <code>{{ item.command }}</code>
              <button
                type="button"
                :disabled="!item.enabled || starting !== null || isRunning"
                @click="run(item)"
              >
                <PlayIcon aria-hidden="true" />
                {{ starting === item.id ? 'Iniciando…' : 'Executar' }}
              </button>
            </article>
          </div>
        </section>

        <section v-if="nodeActions.length" class="dependencies-group">
          <header class="dependencies-group-header">
            <div>
              <strong>Node / {{ nodeManager }}</strong>
              <small>Instalação e build detectados</small>
            </div>
          </header>

          <div class="dependencies-action-list">
            <article
              v-for="item in nodeActions"
              :key="item.id"
              class="dependencies-action-row"
            >
              <div class="dependencies-action-copy">
                <strong>{{ item.name }}</strong>
                <small>{{ item.description }}</small>
              </div>
              <code>{{ item.command }}</code>
              <button
                type="button"
                :disabled="!item.enabled || starting !== null || isRunning"
                @click="run(item)"
              >
                <PlayIcon aria-hidden="true" />
                {{ starting === item.id ? 'Iniciando…' : 'Executar' }}
              </button>
            </article>
          </div>
        </section>
      </div>

      <div v-else class="dependencies-empty">
        <strong>Nenhuma ação disponível</strong>
        <span
          >O projeto precisa ter Gemfile, um lockfile Node ou o script build no
          package.json.</span
        >
      </div>

      <section
        v-if="snapshot"
        class="dependencies-console"
        aria-label="Detalhes da execução"
      >
        <header class="dependencies-console-header">
          <div class="dependencies-console-title">
            <span
              :class="{
                'is-running': isRunning,
                'is-success': executionSucceeded,
                'is-failure': !isRunning && !executionSucceeded,
              }"
            >
              <ArrowPathIcon
                v-if="isRunning"
                class="is-spinning"
                aria-hidden="true"
              />
              <CheckCircleIcon
                v-else-if="executionSucceeded"
                aria-hidden="true"
              />
              <XCircleIcon v-else aria-hidden="true" />
            </span>
            <div class="dependencies-console-title-copy">
              <strong>{{ snapshot.actionName }}</strong>
              <small>
                {{ executionStateLabel }}
                <template v-if="executionDuration">
                  · {{ executionDuration }}
                </template>
                <template v-if="executionExitLabel">
                  · {{ executionExitLabel }}
                </template>
              </small>
            </div>
          </div>

          <div class="dependencies-console-actions">
            <button
              v-if="isRunning"
              type="button"
              class="is-danger"
              :disabled="cancelling"
              @click="cancel"
            >
              <StopCircleIcon aria-hidden="true" />
              {{ cancelling ? 'Cancelando…' : 'Cancelar' }}
            </button>
            <button
              v-else-if="executedAction"
              type="button"
              :disabled="starting !== null"
              @click="runAgain"
            >
              <PlayIcon aria-hidden="true" />
              Executar novamente
            </button>
          </div>
        </header>

        <p v-if="connecting && isRunning" class="dependencies-status">
          Conectando ao terminal…
        </p>
        <p
          v-if="mutationErrorMessage"
          class="dependencies-alert dependencies-console-alert"
          role="alert"
        >
          {{ mutationErrorMessage }}
        </p>
        <div ref="terminalContainer" class="dependencies-terminal"></div>
      </section>
    </template>
  </section>
</template>

<style scoped src="./ProjectDependenciesPanel.css"></style>
