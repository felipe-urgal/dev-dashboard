<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  ClockIcon,
  CommandLineIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  StopCircleIcon,
} from '@heroicons/vue/24/outline';

import type { Project, ProjectScriptCatalog } from '@dev-dashboard/contracts';

import { fetchProjectScripts } from '../api';
import { useProjectDependenciesPty } from '../composables/useProjectDependenciesPty';
import { projectScriptDestination } from '../utils/project-script-visibility';
import StatusBadge from './StatusBadge.vue';

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

function managerName(origin: string): string {
  return origin === 'bundler' ? 'Bundler' : nodeManager.value;
}

function managerClass(origin: string): string {
  return origin === 'bundler' ? 'is-ruby' : 'is-node';
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
    aria-labelledby="dependencies-title"
    :aria-busy="loading"
  >
    <div v-if="errorMessage" class="dependencies-alert" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="loading && !catalog" class="dependencies-empty" role="status">
      Detectando gerenciadores e ações disponíveis…
    </div>

    <template v-else>
      <div
        v-if="actions.length"
        class="dependencies-manager-bar"
        aria-label="Gerenciadores detectados"
      >
        <article v-if="railsActions.length" class="dependencies-manager-card">
          <span class="dependencies-manager-icon"
            ><CubeIcon aria-hidden="true"
          /></span>
          <div>
            <strong>Ruby / Bundler</strong>
            <small>Gemfile e Gemfile.lock detectados</small>
          </div>
          <StatusBadge tone="success">Pronto</StatusBadge>
        </article>

        <article v-if="nodeActions.length" class="dependencies-manager-card">
          <span class="dependencies-manager-icon"
            ><CommandLineIcon aria-hidden="true"
          /></span>
          <div>
            <strong>Node / {{ nodeManager }}</strong>
            <small>Lockfile e script build detectados</small>
          </div>
          <StatusBadge tone="success">Pronto</StatusBadge>
        </article>
      </div>

      <div v-if="actions.length" class="dependencies-table-wrap">
        <table class="dependencies-table">
          <colgroup>
            <col class="dependencies-manager-column" />
            <col class="dependencies-action-column" />
            <col class="dependencies-command-column" />
            <col class="dependencies-button-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Gerenciador</th>
              <th scope="col">Ação</th>
              <th scope="col">Comando</th>
              <th scope="col"><span class="sr-only">Executar</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in actions" :key="item.id">
              <td data-label="Gerenciador">
                <span
                  class="dependencies-manager-name"
                  :class="managerClass(item.origin)"
                >
                  <i aria-hidden="true"></i>
                  {{ managerName(item.origin) }}
                </span>
              </td>
              <td data-label="Ação">
                <strong>{{ item.name }}</strong>
                <small>{{ item.description }}</small>
                <span
                  v-if="item.id === 'bundler:update'"
                  class="dependencies-warning"
                >
                  <ExclamationTriangleIcon aria-hidden="true" />
                  Pode alterar o Gemfile.lock.
                </span>
              </td>
              <td data-label="Comando">
                <code>{{ item.command }}</code>
              </td>
              <td class="dependencies-row-action">
                <button
                  type="button"
                  :disabled="!item.enabled || starting !== null || isRunning"
                  @click="run(item)"
                >
                  <PlayIcon aria-hidden="true" />
                  {{ starting === item.id ? 'Iniciando…' : 'Executar' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="dependencies-empty">
        <strong>Nenhuma ação disponível</strong>
        <span
          >O projeto precisa ter Gemfile, um lockfile Node ou o script build no
          package.json.</span
        >
      </div>

      <section
        class="dependencies-console"
        :class="{ 'dependencies-console-active': snapshot }"
        aria-label="Detalhes da execução"
      >
        <template v-if="snapshot">
          <header class="dependencies-console-header">
            <div class="dependencies-console-title">
              <span :class="`is-${snapshot.status}`">
                <component
                  :is="isRunning ? ArrowPathIcon : StopCircleIcon"
                  aria-hidden="true"
                />
              </span>
              <strong>{{ snapshot.actionName }}</strong>
              <small>exit {{ snapshot.exitCode ?? '—' }}</small>
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
            </div>
          </header>

          <p
            v-if="mutationErrorMessage"
            class="dependencies-alert"
            role="alert"
          >
            {{ mutationErrorMessage }}
          </p>
          <div ref="terminalContainer" class="dependencies-terminal"></div>
        </template>

        <div v-else class="dependencies-empty dependencies-console-empty">
          <ClockIcon aria-hidden="true" />
          <strong>Nenhuma execução selecionada</strong>
          <span>Execute uma ação para acompanhar status e saída.</span>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped src="./ProjectDependenciesPanel.css"></style>
