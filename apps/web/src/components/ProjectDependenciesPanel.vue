<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  StopCircleIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

import type { Project, ProjectScriptCatalog } from '@dev-dashboard/contracts';

import { fetchProjectScripts } from '../api';
import { useProjectDependenciesPty } from '../composables/useProjectDependenciesPty';
import { projectScriptDestination } from '../utils/project-script-visibility';

const props = defineProps<{ project: Project }>();

const catalog = ref<ProjectScriptCatalog | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let generation = 0;

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
  clear,
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

const executionSucceeded = computed(
  () => snapshot.value?.status === 'exited' && snapshot.value.exitCode === 0,
);

const executionStateLabel = computed(() => {
  if (!snapshot.value) return '';
  if (isRunning.value) return 'Executando';
  return executionSucceeded.value ? 'Execução concluída' : 'Execução falhou';
});

const executionStateTone = computed(() => {
  if (isRunning.value) return 'running';
  return executionSucceeded.value ? 'success' : 'failure';
});

function copyCommand(command: string): void {
  void navigator.clipboard?.writeText(command).catch(() => undefined);
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

watch(
  () => props.project.id,
  () => {
    catalog.value = null;
    void load();
  },
  { immediate: true },
);
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

    <div v-if="loading && !catalog" class="dependencies-loading" role="status">
      Detectando gerenciadores e ações disponíveis…
    </div>

    <template v-else>
      <div class="dependencies-workspace">
        <aside
          class="dependencies-actions-panel"
          aria-label="Comandos disponíveis"
        >
          <div v-if="actions.length" class="dependencies-groups">
            <section v-if="nodeActions.length" class="dependencies-group">
              <header class="dependencies-group-header">
                <ChevronDownIcon aria-hidden="true" />
                <strong>Node / {{ nodeManager }}</strong>
              </header>

              <div class="dependencies-action-list">
                <article
                  v-for="item in nodeActions"
                  :key="item.id"
                  class="dependencies-action-row"
                  :class="{ 'is-active': snapshot?.actionId === item.id }"
                >
                  <div class="dependencies-action-heading">
                    <strong>{{ item.name }}</strong>
                  </div>

                  <div class="dependencies-action-command">
                    <div class="dependencies-command-field">
                      <code>{{ item.command }}</code>
                      <button
                        type="button"
                        class="dependencies-copy-command"
                        :aria-label="`Copiar comando ${item.command}`"
                        title="Copiar comando"
                        @click="copyCommand(item.command)"
                      >
                        <ClipboardDocumentIcon aria-hidden="true" />
                      </button>
                    </div>

                    <button
                      type="button"
                      class="dependencies-run-command"
                      :class="{
                        'is-primary':
                          nodeActions.length === 1 ||
                          snapshot?.actionId === item.id,
                      }"
                      :disabled="
                        !item.enabled || starting !== null || isRunning
                      "
                      @click="run(item)"
                    >
                      <PlayIcon aria-hidden="true" />
                      {{ starting === item.id ? 'Iniciando…' : 'Executar' }}
                    </button>
                  </div>
                </article>
              </div>
            </section>

            <section v-if="railsActions.length" class="dependencies-group">
              <header class="dependencies-group-header">
                <ChevronDownIcon aria-hidden="true" />
                <strong>Ruby / Bundler</strong>
              </header>

              <div class="dependencies-action-list">
                <article
                  v-for="item in railsActions"
                  :key="item.id"
                  class="dependencies-action-row"
                  :class="{ 'is-active': snapshot?.actionId === item.id }"
                >
                  <div class="dependencies-action-heading">
                    <strong>{{ item.name }}</strong>
                    <span
                      v-if="item.id === 'bundler:update'"
                      class="dependencies-warning"
                    >
                      <ExclamationTriangleIcon aria-hidden="true" />
                      Pode alterar o Gemfile.lock
                    </span>
                  </div>

                  <div class="dependencies-action-command">
                    <div class="dependencies-command-field">
                      <code>{{ item.command }}</code>
                      <button
                        type="button"
                        class="dependencies-copy-command"
                        :aria-label="`Copiar comando ${item.command}`"
                        title="Copiar comando"
                        @click="copyCommand(item.command)"
                      >
                        <ClipboardDocumentIcon aria-hidden="true" />
                      </button>
                    </div>

                    <button
                      type="button"
                      class="dependencies-run-command"
                      :class="{
                        'is-primary': snapshot?.actionId === item.id,
                      }"
                      :disabled="
                        !item.enabled || starting !== null || isRunning
                      "
                      @click="run(item)"
                    >
                      <PlayIcon aria-hidden="true" />
                      {{ starting === item.id ? 'Iniciando…' : 'Executar' }}
                    </button>
                  </div>
                </article>
              </div>
            </section>
          </div>

          <div v-else class="dependencies-empty">
            <strong>Nenhuma ação disponível</strong>
            <span>
              O projeto precisa ter Gemfile, um lockfile Node ou o script build
              no package.json.
            </span>
          </div>
        </aside>

        <section class="dependencies-console" aria-label="Console de execução">
          <header class="dependencies-panel-header dependencies-console-header">
            <div class="dependencies-console-heading">
              <CommandLineIcon aria-hidden="true" />
              <strong>Console</strong>
            </div>

            <div class="dependencies-console-actions">
              <span
                v-if="snapshot"
                class="dependencies-execution-state"
                :class="`is-${executionStateTone}`"
              >
                <span class="dependencies-status-dot" aria-hidden="true"></span>
                {{ executionStateLabel }}
              </span>

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
                v-else-if="snapshot"
                type="button"
                class="dependencies-console-clear"
                @click="clear"
              >
                <TrashIcon aria-hidden="true" />
                Limpar
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

          <div v-if="!snapshot" class="dependencies-console-empty">
            <CommandLineIcon aria-hidden="true" />
            <strong>Pronto para executar</strong>
            <span>Execute um comando para acompanhar a saída aqui.</span>
          </div>

          <div
            ref="terminalContainer"
            v-show="snapshot"
            class="dependencies-terminal"
          ></div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped src="./ProjectDependenciesPanel.css"></style>
