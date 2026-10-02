<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  StopCircleIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

import type {
  BundlerOverview,
  Project,
  ProjectScriptCatalog,
} from '@dev-dashboard/contracts';

import {
  fetchProjectBundlerOverview,
  fetchProjectDependencyHealth,
  fetchProjectDependencyUpgradePlan,
  fetchProjectScripts,
  type ProjectDependencyHealth,
  type ProjectDependencyUpgradePlan,
} from '../api';
import { useProjectDependenciesPty } from '../composables/useProjectDependenciesPty';
import { projectScriptDestination } from '../utils/project-script-visibility';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string | undefined;
}>();

const catalog = ref<ProjectScriptCatalog | null>(null);
const health = ref<ProjectDependencyHealth | null>(null);
const upgradePlan = ref<ProjectDependencyUpgradePlan | null>(null);
const bundler = ref<BundlerOverview | null>(null);
const loading = ref(false);
const loadingHealth = ref(false);
const errorMessage = ref('');
const healthErrorMessage = ref('');
let generation = 0;

const isSupportedProject = computed(
  () =>
    props.project.type === 'node' ||
    props.project.type === 'rails' ||
    props.project.capabilities.includes('scripts') ||
    props.project.capabilities.includes('bundler'),
);

const {
  snapshot,
  errorMessage: mutationErrorMessage,
  starting,
  cancelling,
  connecting,
  connectionLost,
  isRunning,
  terminalContainer,
  run,
  cancel,
  reconnect,
  clear,
} = useProjectDependenciesPty(
  () => props.project,
  isSupportedProject,
  () => props.environmentInstanceId,
);

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
  if (health.value?.inventory.packageManager !== 'unknown') {
    const manager = health.value?.inventory.packageManager;
    if (manager === 'yarn') return 'Yarn';
    if (manager === 'bun') return 'Bun';
    return manager ?? 'Node';
  }
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

const upgradeItems = computed(
  () =>
    upgradePlan.value?.items.filter((item) => item.state === 'upgrade') ?? [],
);
const unknownItems = computed(
  () =>
    upgradePlan.value?.items.filter((item) => item.state === 'unknown') ?? [],
);
const advisoryCount = computed(
  () =>
    health.value?.advisories.reduce(
      (total, item) =>
        total +
        (item.state === 'available' && item.complete
          ? item.advisories.length
          : 0),
      0,
    ) ?? 0,
);
const nodeDependencyCount = computed(
  () => health.value?.inventory.dependencies.length ?? 0,
);
const hasNodeHealth = computed(
  () =>
    health.value !== null &&
    (health.value.inventory.status === 'ready' ||
      nodeActions.value.length > 0 ||
      health.value.inventory.dependencies.length > 0),
);
const hasDependencyContext = computed(
  () => hasNodeHealth.value || bundler.value?.supported === true,
);

const executionStateLabel = computed(() => {
  if (!snapshot.value) return '';
  if (isRunning.value)
    return connectionLost.value ? 'Conexão perdida' : 'Executando';
  if (snapshot.value.cancelled) return 'Cancelado';
  return snapshot.value.exitCode === 0 ? 'Sucesso' : 'Falhou';
});
const executionStateTone = computed(() => {
  if (!snapshot.value) return 'neutral';
  if (isRunning.value) return connectionLost.value ? 'warning' : 'running';
  if (snapshot.value.cancelled) return 'neutral';
  return snapshot.value.exitCode === 0 ? 'success' : 'failure';
});
const executionDetails = computed(() => {
  if (!snapshot.value || snapshot.value.status === 'running') return '';
  const started = Date.parse(snapshot.value.startedAt);
  const ended = snapshot.value.endedAt
    ? Date.parse(snapshot.value.endedAt)
    : Number.NaN;
  const duration =
    Number.isFinite(started) && Number.isFinite(ended) && ended >= started
      ? `${Math.max(0, Math.round((ended - started) / 100) / 10)}s`
      : '';
  const exit =
    snapshot.value.exitCode === null ? '' : `exit ${snapshot.value.exitCode}`;
  return [duration, exit].filter(Boolean).join(' · ');
});

function copyCommand(command: string): void {
  void navigator.clipboard?.writeText(command).catch(() => undefined);
}

function updateLabel(
  update: ProjectDependencyUpgradePlan['items'][number]['update'],
): string {
  if (update === 'major') return 'major';
  if (update === 'minor') return 'minor';
  if (update === 'patch') return 'patch';
  return update === 'none' ? 'atual' : 'incerto';
}

async function loadCatalog(current: number): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const query = new URLSearchParams({ page: '1', pageSize: '100' });
    if (props.environmentInstanceId) {
      query.set('environmentInstanceId', props.environmentInstanceId);
    }
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

async function loadDependencyContext(
  current: number,
  refresh = false,
): Promise<void> {
  loadingHealth.value = true;
  healthErrorMessage.value = '';
  try {
    const healthResult = await fetchProjectDependencyHealth(
      props.project.id,
      props.environmentInstanceId,
      refresh,
    );
    if (current !== generation) return;
    health.value = healthResult;

    const [planResult, bundlerResult] = await Promise.all([
      fetchProjectDependencyUpgradePlan(
        props.project.id,
        props.environmentInstanceId,
      ),
      props.project.type === 'rails'
        ? fetchProjectBundlerOverview(
            props.project.id,
            props.environmentInstanceId,
          )
        : Promise.resolve(null),
    ]);
    if (current !== generation) return;
    upgradePlan.value = planResult;
    bundler.value = bundlerResult;
  } catch (error) {
    if (current === generation) {
      healthErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a saúde das dependências.';
    }
  } finally {
    if (current === generation) loadingHealth.value = false;
  }
}

function refreshHealth(): void {
  void loadDependencyContext(generation, true);
}

watch(
  () => `${props.project.id}:${props.environmentInstanceId ?? 'primary'}`,
  () => {
    const current = ++generation;
    catalog.value = null;
    health.value = null;
    upgradePlan.value = null;
    bundler.value = null;
    void loadCatalog(current);
    void loadDependencyContext(current);
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
      <section
        class="dependencies-health-strip"
        aria-label="Saúde das dependências"
      >
        <div class="dependencies-health-summary">
          <span>
            {{ environmentInstanceId ? 'Environment Instance' : 'Principal' }}
          </span>
          <template v-if="hasNodeHealth">
            <strong>{{ nodeManager }}</strong>
            <span>{{ nodeDependencyCount }} deps</span>
            <span>{{ upgradeItems.length }} updates</span>
            <span>{{ advisoryCount }} advisories</span>
            <span v-if="health?.runtime.version"
              >Node {{ health.runtime.version }}</span
            >
          </template>
          <template v-if="bundler?.supported">
            <strong>Bundler</strong>
            <span>
              {{ bundler.check?.satisfied ? 'gems OK' : 'gems pendentes' }}
            </span>
            <span>{{ bundler.outdated.length }} updates</span>
          </template>
          <span v-if="loadingHealth">Atualizando…</span>
        </div>
        <button
          type="button"
          class="dependencies-health-refresh"
          :disabled="loadingHealth"
          @click="refreshHealth"
        >
          {{ loadingHealth ? 'Atualizando…' : 'Atualizar saúde' }}
        </button>
      </section>

      <p
        v-if="healthErrorMessage"
        class="dependencies-alert dependencies-health-alert"
        role="alert"
      >
        {{ healthErrorMessage }}
      </p>

      <details v-if="hasDependencyContext" class="dependencies-health-context">
        <summary>
          <span>Saúde e plano de atualização</span>
          <small>
            {{ upgradeItems.length }} upgrade(s) ·
            {{ unknownItems.length }} incerto(s)
          </small>
        </summary>
        <div class="dependencies-health-grid">
          <section v-if="hasNodeHealth" aria-label="Dependency Health Node">
            <header>
              <strong>Node / {{ nodeManager }}</strong>
              <span>{{
                health?.inventory.lockfileName ?? 'sem lockfile'
              }}</span>
            </header>
            <p
              v-for="warning in health?.inventory.warnings ?? []"
              :key="warning"
              class="dependencies-health-warning"
            >
              {{ warning }}
            </p>
            <ul v-if="upgradeItems.length" class="dependencies-upgrade-list">
              <li v-for="item in upgradeItems" :key="item.name">
                <strong>{{ item.name }}</strong>
                <code
                  >{{ item.currentVersion ?? '?' }} →
                  {{ item.targetVersion ?? '?' }}</code
                >
                <span>{{ updateLabel(item.update) }}</span>
              </li>
            </ul>
            <p v-else-if="upgradePlan?.status === 'ready'">
              Nenhum upgrade comparável foi encontrado.
            </p>
            <p v-if="advisoryCount > 0" class="dependencies-health-danger">
              {{ advisoryCount }} advisory(s) conhecido(s) na versão resolvida
              atual.
            </p>
            <p v-if="unknownItems.length">
              {{ unknownItems.length }} dependência(s) permanecem inconclusivas
              por falta de evidência.
            </p>
          </section>

          <section v-if="bundler?.supported" aria-label="Saúde Bundler">
            <header>
              <strong>Ruby / Bundler</strong>
              <span>{{ bundler.outdated.length }} desatualizada(s)</span>
            </header>
            <p
              :class="{
                'dependencies-health-danger':
                  bundler.check && !bundler.check.satisfied,
              }"
            >
              {{ bundler.check?.message || 'Bundle inspecionado.' }}
            </p>
            <ul
              v-if="bundler.outdated.length"
              class="dependencies-upgrade-list"
            >
              <li v-for="gem in bundler.outdated" :key="gem.name">
                <strong>{{ gem.name }}</strong>
                <code>{{ gem.installed }} → {{ gem.newest }}</code>
                <span>{{ gem.requested ?? 'range não informado' }}</span>
              </li>
            </ul>
          </section>
        </div>
      </details>

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
                      :title="
                        !item.enabled
                          ? 'Gerenciador não resolvido ou ação bloqueada'
                          : undefined
                      "
                      @click="run(item)"
                    >
                      <PlayIcon aria-hidden="true" />
                      {{
                        !item.enabled
                          ? 'Indisponível'
                          : starting === item.id
                            ? 'Iniciando…'
                            : 'Executar'
                      }}
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
                      :class="{ 'is-primary': snapshot?.actionId === item.id }"
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
              O projeto precisa declarar um gerenciador Node/lockfile, um
              Gemfile ou o script build no package.json.
            </span>
          </div>
        </aside>

        <section class="dependencies-console" aria-label="Console de execução">
          <header class="dependencies-panel-header dependencies-console-header">
            <div class="dependencies-console-heading">
              <CommandLineIcon aria-hidden="true" />
              <strong>Console</strong>
              <small v-if="snapshot">{{ snapshot.actionName }}</small>
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
              <small v-if="executionDetails">{{ executionDetails }}</small>

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
          <div
            v-if="connectionLost && isRunning"
            class="dependencies-connection-lost"
          >
            <span>
              A execução continua ativa, mas a conexão com a saída foi
              interrompida.
            </span>
            <button type="button" @click="reconnect">Reconectar</button>
          </div>
          <p
            v-if="mutationErrorMessage"
            class="dependencies-alert dependencies-console-alert"
            role="alert"
          >
            {{ mutationErrorMessage }}
          </p>
          <p v-if="snapshot?.truncated" class="dependencies-status">
            A saída anterior foi truncada pelo limite de retenção do terminal.
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
