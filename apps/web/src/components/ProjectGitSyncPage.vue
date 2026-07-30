<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  ref,
  watch,
} from 'vue';

import type {
  GitSyncStrategy,
  GitTrackingComparison,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import { compareProjectGitReference } from '../api/git-workspace';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  busy: boolean;
  remoteRefreshing: string;
}>();

const emit = defineEmits<{
  fetchRemote: [remote: string];
  integrate: [payload: { reference: string; strategy: GitSyncStrategy }];
  pull: [];
  push: [];
  openPullRequest: [];
}>();

const selectedReference = ref('');
const strategy = ref<GitSyncStrategy>('ff-only');
const comparison = ref<GitTrackingComparison | null>(null);
const comparing = ref(false);
const comparisonError = ref('');
let comparisonGeneration = 0;

const remoteBranches = computed(() =>
  props.workspace?.branches.filter((branch) => branch.kind === 'remote') ?? [],
);

const upstreamBranches = computed(() =>
  remoteBranches.value.filter((branch) => branch.remote === 'upstream'),
);

const originBranches = computed(() =>
  remoteBranches.value.filter((branch) => branch.remote === 'origin'),
);

const originComparison = computed(() => props.workspace?.originComparison ?? null);

const originReference = computed(() =>
  originComparison.value?.reference ?? `origin/${props.overview.branch ?? 'branch'}`,
);

const commitsToIntegrate = computed(() => comparison.value?.behind ?? 0);
const commitsToPublish = computed(() => originComparison.value?.ahead ?? 0);

const recommendation = computed<GitSyncStrategy>(() => {
  const current = comparison.value;
  if (!current) return 'ff-only';
  if (current.behind > 0 && current.ahead > 0) return 'rebase';
  return 'ff-only';
});

const canIntegrate = computed(() =>
  Boolean(selectedReference.value)
  && Boolean(comparison.value)
  && comparison.value!.behind > 0
  && props.overview.clean
  && !props.busy,
);

const actionLabel = computed(() => {
  const labels: Record<GitSyncStrategy, string> = {
    'ff-only': 'Avançar com fast-forward',
    rebase: 'Reaplicar commits com rebase',
    merge: 'Integrar com merge',
  };
  return labels[strategy.value];
});

const pipelineStatusTitle = computed(() => {
  if (comparing.value) return 'Comparando branches';
  if (comparisonError.value) return 'Comparação indisponível';
  if (!props.overview.clean) return 'Alterações locais pendentes';
  if (commitsToIntegrate.value > 0) return 'Atualização disponível';
  if (commitsToPublish.value > 0) return 'Pronto para publicar';
  return 'Tudo sincronizado';
});

const pipelineStatusDescription = computed(() => {
  if (comparing.value) return `Verificando diferenças entre ${selectedReference.value} e a branch local.`;
  if (comparisonError.value) return comparisonError.value;
  if (!props.overview.clean) {
    return 'Faça commit ou stash das alterações locais antes de integrar uma referência remota.';
  }
  if (commitsToIntegrate.value > 0) {
    return `${selectedReference.value} possui ${commitsToIntegrate.value} commit(s) para integrar.`;
  }
  if (commitsToPublish.value > 0) {
    return `A branch local possui ${commitsToPublish.value} commit(s) para publicar no origin.`;
  }
  return 'Sua branch local está alinhada com a base e com o destino de publicação.';
});

const primaryActionLabel = computed(() => {
  if (props.busy) return 'Sincronizando…';
  if (canIntegrate.value) return actionLabel.value;
  if (props.remoteRefreshing === 'upstream') return 'Buscando atualizações…';
  return 'Buscar atualizações';
});

const primaryActionDisabled = computed(() =>
  props.busy
  || comparing.value
  || props.remoteRefreshing === 'upstream'
  || !props.workspace?.remotes.some((remote) => remote.name === 'upstream'),
);

async function loadComparison(reference: string): Promise<void> {
  const generation = ++comparisonGeneration;
  comparison.value = null;
  comparisonError.value = '';
  if (!reference) return;

  comparing.value = true;
  try {
    const result = await compareProjectGitReference(props.projectId, reference);
    if (generation !== comparisonGeneration) return;
    comparison.value = result;
    strategy.value = result.behind > 0 && result.ahead > 0
      ? 'rebase'
      : 'ff-only';
  } catch (error) {
    if (generation !== comparisonGeneration) return;
    comparisonError.value = error instanceof Error
      ? error.message
      : 'Não foi possível comparar as branches.';
  } finally {
    if (generation === comparisonGeneration) comparing.value = false;
  }
}

function integrate(): void {
  if (!canIntegrate.value) return;
  emit('integrate', {
    reference: selectedReference.value,
    strategy: strategy.value,
  });
}

function runPrimaryAction(): void {
  if (canIntegrate.value) {
    integrate();
    return;
  }
  emit('fetchRemote', 'upstream');
}

watch(
  () => props.workspace,
  (workspace) => {
    const preferred = workspace?.upstreamComparison?.reference
      ?? workspace?.originComparison?.reference
      ?? upstreamBranches.value[0]?.name
      ?? originBranches.value[0]?.name
      ?? '';
    if (!selectedReference.value || !remoteBranches.value.some((branch) => branch.name === selectedReference.value)) {
      selectedReference.value = preferred;
    }
  },
  { immediate: true },
);

watch(selectedReference, (reference) => {
  void loadComparison(reference);
}, { immediate: true });
</script>

<template>
  <section class="git-sync-page">
    <header class="git-sync-heading">
      <div class="git-sync-heading-copy">
        <span>Sincronização</span>
        <h2>Pipeline de sincronização</h2>
        <p>Veja o caminho das alterações e execute a próxima ação com segurança.</p>
      </div>

      <div class="git-sync-controls">
        <label>
          <span>Base de comparação</span>
          <select v-model="selectedReference" :disabled="busy || comparing">
            <optgroup v-if="upstreamBranches.length" label="Upstream">
              <option v-for="branch in upstreamBranches" :key="branch.name" :value="branch.name">
                {{ branch.name }}
              </option>
            </optgroup>
            <optgroup v-if="originBranches.length" label="Origin">
              <option v-for="branch in originBranches" :key="branch.name" :value="branch.name">
                {{ branch.name }}
              </option>
            </optgroup>
          </select>
        </label>

        <label>
          <span>Estratégia</span>
          <select v-model="strategy" :disabled="busy">
            <option value="ff-only">Fast-forward</option>
            <option value="rebase">Rebase</option>
            <option value="merge">Merge</option>
          </select>
        </label>

        <InformationCircleIcon
          class="git-sync-help-icon"
          aria-label="A estratégia recomendada é ajustada conforme a comparação entre as branches."
        />
      </div>
    </header>

    <section class="git-sync-pipeline-card">
      <div class="git-sync-pipeline" aria-label="Fluxo de sincronização">
        <article class="git-sync-node">
          <span class="git-sync-node-icon upstream">
            <ArrowDownTrayIcon aria-hidden="true" />
          </span>
          <small>Fonte principal</small>
          <strong>{{ selectedReference || 'upstream/main' }}</strong>
        </article>

        <div class="git-sync-connector">
          <span>{{ commitsToIntegrate }} commit(s) para integrar</span>
          <div aria-hidden="true">
            <CheckCircleIcon :class="{ active: commitsToIntegrate === 0 }" />
          </div>
        </div>

        <article class="git-sync-node">
          <span class="git-sync-node-icon local">
            <ShareIcon aria-hidden="true" />
          </span>
          <small>Branch local</small>
          <strong>{{ overview.branch ?? 'HEAD' }}</strong>
        </article>

        <div class="git-sync-connector">
          <span>{{ commitsToPublish }} commit(s) para publicar</span>
          <div aria-hidden="true">
            <CheckCircleIcon :class="{ active: commitsToPublish === 0 }" />
          </div>
        </div>

        <article class="git-sync-node">
          <span class="git-sync-node-icon origin">
            <ArrowUpTrayIcon aria-hidden="true" />
          </span>
          <small>Publicação</small>
          <strong>{{ originReference }}</strong>
        </article>
      </div>

      <div
        class="git-sync-status-panel"
        :class="{
          warning: !overview.clean || commitsToIntegrate > 0,
          error: Boolean(comparisonError),
        }"
      >
        <component
          :is="comparisonError ? InformationCircleIcon : CheckCircleIcon"
          class="git-sync-status-icon"
          aria-hidden="true"
        />
        <div>
          <strong>{{ pipelineStatusTitle }}</strong>
          <p>{{ pipelineStatusDescription }}</p>
          <small v-if="recommendation === 'rebase'">Estratégia recomendada: Rebase</small>
        </div>
        <button
          class="primary-button git-sync-primary"
          type="button"
          :disabled="primaryActionDisabled"
          @click="runPrimaryAction"
        >
          <ArrowPathIcon aria-hidden="true" />
          {{ primaryActionLabel }}
        </button>
      </div>
    </section>

    <section class="git-sync-quick-actions">
      <div>
        <span>Ações rápidas</span>
        <p>Operações diretas para atualizar, publicar ou preparar a revisão da branch.</p>
      </div>
      <div class="git-sync-actions git-sync-sidebar-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="remoteRefreshing === 'upstream'"
          @click="emit('fetchRemote', 'upstream')"
        >
          <ArrowDownTrayIcon aria-hidden="true" />
          {{ remoteRefreshing === 'upstream' ? 'Atualizando…' : 'Fetch upstream' }}
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="busy || !overview.upstream || !overview.clean"
          @click="emit('pull')"
        >
          <ArrowPathIcon aria-hidden="true" />
          Pull tracking
        </button>
        <button
          class="primary-button git-sync-publish-button"
          type="button"
          :disabled="busy"
          @click="emit('push')"
        >
          <ArrowUpTrayIcon aria-hidden="true" />
          Publicar
        </button>
        <button
          class="secondary-button git-sync-open-pr-button"
          type="button"
          :disabled="busy"
          @click="emit('openPullRequest')"
        >
          <ShareIcon aria-hidden="true" />
          Abrir pull request
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.git-sync-page {
  display: grid;
  gap: var(--space-4);
  font-family: var(--font-family);
  font-size: var(--font-md);
  font-weight: var(--font-weight-body);
}

.git-sync-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-5);
}

.git-sync-heading-copy > span,
.git-sync-controls label > span,
.git-sync-node small,
.git-sync-quick-actions > div:first-child > span {
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-sync-heading h2 {
  margin: 3px 0 0;
  color: var(--text);
  font-size: var(--font-lg);
  font-weight: var(--font-weight-strong);
}

.git-sync-heading p,
.git-sync-status-panel p,
.git-sync-quick-actions p {
  margin: 5px 0 0;
  color: var(--text-muted);
  line-height: 1.5;
}

.git-sync-controls {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
}

.git-sync-controls label {
  display: grid;
  min-width: 190px;
  gap: 6px;
}

.git-sync-controls select {
  min-height: 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  padding: 8px 34px 8px 11px;
  font: inherit;
}

.git-sync-help-icon {
  width: 20px;
  height: 20px;
  margin-bottom: 9px;
  color: var(--text-dim);
}

.git-sync-pipeline-card,
.git-sync-quick-actions {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.git-sync-pipeline-card {
  overflow: hidden;
}

.git-sync-pipeline {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(130px, .7fr) minmax(150px, 1fr) minmax(130px, .7fr) minmax(150px, 1fr);
  align-items: center;
  gap: var(--space-3);
  min-height: 190px;
  padding: var(--space-5);
}

.git-sync-node {
  display: grid;
  justify-items: center;
  min-width: 0;
  gap: 7px;
  text-align: center;
}

.git-sync-node strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-lg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-node-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
}

.git-sync-node-icon svg {
  width: 24px;
  height: 24px;
}

.git-sync-node-icon.upstream {
  background: var(--info-surface);
  color: var(--info-text);
}

.git-sync-node-icon.origin {
  background: var(--success-surface);
  color: var(--success-text);
}

.git-sync-connector {
  display: grid;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: var(--font-sm);
  text-align: center;
}

.git-sync-connector div {
  position: relative;
  height: 20px;
}

.git-sync-connector div::before {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
  background: var(--border-strong);
  content: '';
}

.git-sync-connector svg {
  position: relative;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--surface-1);
  color: var(--text-dim);
}

.git-sync-connector svg.active {
  color: var(--success-text);
}

.git-sync-status-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  border-top: 1px solid var(--border);
  background: var(--success-surface);
  padding: var(--space-4) var(--space-5);
}

.git-sync-status-panel.warning {
  background: var(--warning-surface);
}

.git-sync-status-panel.error {
  background: var(--danger-surface);
}

.git-sync-status-panel strong {
  color: var(--text);
  font-weight: var(--font-weight-strong);
}

.git-sync-status-panel small {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
}

.git-sync-status-icon {
  width: 25px;
  height: 25px;
  color: var(--success-text);
}

.git-sync-status-panel.warning .git-sync-status-icon {
  color: var(--warning-text);
}

.git-sync-status-panel.error .git-sync-status-icon {
  color: var(--danger-text);
}

.git-sync-primary,
.git-sync-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.git-sync-primary svg,
.git-sync-actions button svg {
  width: 17px;
  height: 17px;
}

.git-sync-quick-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
}

.git-sync-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (max-width: 1050px) {
  .git-sync-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .git-sync-controls {
    width: 100%;
  }

  .git-sync-controls label {
    flex: 1;
  }

  .git-sync-pipeline {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .git-sync-connector {
    justify-self: center;
    width: 180px;
  }

  .git-sync-connector div {
    transform: rotate(90deg);
  }

  .git-sync-quick-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .git-sync-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .git-sync-controls {
    display: grid;
    grid-template-columns: 1fr;
  }

  .git-sync-help-icon {
    display: none;
  }

  .git-sync-status-panel {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-sync-primary {
    grid-column: 1 / -1;
    width: 100%;
  }

  .git-sync-actions {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 500px) {
  .git-sync-actions {
    grid-template-columns: 1fr;
  }
}
</style>
