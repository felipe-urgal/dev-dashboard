<script setup lang="ts">
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

const selectedRemote = computed(() =>
  selectedReference.value.split('/')[0] ?? '',
);

const recommendation = computed<GitSyncStrategy>(() => {
  const current = comparison.value;
  if (!current) return 'ff-only';
  if (current.behind > 0 && current.ahead === 0) return 'ff-only';
  if (current.behind > 0 && current.ahead > 0) return 'rebase';
  return 'ff-only';
});

const statusTitle = computed(() => {
  const current = comparison.value;
  if (!current) return 'Selecione uma referência';
  if (current.ahead === 0 && current.behind === 0) return 'Branch sincronizada';
  if (current.ahead > 0 && current.behind === 0) return 'Somente commits locais';
  if (current.ahead === 0 && current.behind > 0) return 'Atualização disponível';
  return 'Históricos divergentes';
});

const statusDescription = computed(() => {
  const current = comparison.value;
  if (!current) return 'A comparação será feita com o HEAD atual.';
  if (current.ahead === 0 && current.behind === 0) {
    return `A branch local já contém tudo de ${current.reference}.`;
  }
  if (current.ahead > 0 && current.behind === 0) {
    return `Há ${current.ahead} commit(s) local(is) que não estão em ${current.reference}.`;
  }
  if (current.ahead === 0 && current.behind > 0) {
    return `${current.reference} possui ${current.behind} commit(s) para integrar.`;
  }
  return `A branch local tem ${current.ahead} commit(s) próprios e está ${current.behind} commit(s) atrás.`;
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

function selectStrategy(value: GitSyncStrategy): void {
  strategy.value = value;
}

function integrate(): void {
  if (!canIntegrate.value) return;
  emit('integrate', {
    reference: selectedReference.value,
    strategy: strategy.value,
  });
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
      <div>
        <span>Sincronização</span>
        <h2>Atualizar, integrar e publicar sem perder o contexto</h2>
        <p>Use o upstream como fonte principal e o origin como destino de publicação.</p>
      </div>
      <button
        class="secondary-button"
        type="button"
        :disabled="remoteRefreshing === 'upstream' || !workspace?.remotes.some((remote) => remote.name === 'upstream')"
        @click="emit('fetchRemote', 'upstream')"
      >
        {{ remoteRefreshing === 'upstream' ? 'Atualizando upstream…' : 'Fetch upstream' }}
      </button>
    </header>

    <div class="git-sync-flow" aria-label="Fluxo de sincronização">
      <article>
        <span class="git-sync-node-icon upstream">↓</span>
        <div><small>Fonte principal</small><strong>{{ selectedReference || 'upstream/main' }}</strong></div>
      </article>
      <span class="git-sync-arrow" aria-hidden="true">→</span>
      <article>
        <span class="git-sync-node-icon local">◆</span>
        <div><small>Branch local</small><strong>{{ overview.branch ?? 'HEAD' }}</strong></div>
      </article>
      <span class="git-sync-arrow" aria-hidden="true">→</span>
      <article>
        <span class="git-sync-node-icon origin">↑</span>
        <div><small>Publicação</small><strong>{{ workspace?.originComparison?.reference ?? `origin/${overview.branch ?? 'branch'}` }}</strong></div>
      </article>
    </div>

    <div class="git-sync-metrics">
      <article>
        <span>Working tree</span>
        <strong :class="overview.clean ? 'sync-good' : 'sync-warning'">
          {{ overview.clean ? 'Limpo' : 'Alterado' }}
        </strong>
        <small>{{ overview.files.length }} arquivo(s) local(is)</small>
      </article>
      <article>
        <span>Comparação selecionada</span>
        <strong v-if="comparison">↑ {{ comparison.ahead }} · ↓ {{ comparison.behind }}</strong>
        <strong v-else>{{ comparing ? 'Comparando…' : 'Indisponível' }}</strong>
        <small>{{ selectedReference || 'Nenhuma referência' }}</small>
      </article>
      <article>
        <span>Origin</span>
        <strong>↑ {{ workspace?.originComparison?.ahead ?? 0 }} · ↓ {{ workspace?.originComparison?.behind ?? 0 }}</strong>
        <small>{{ workspace?.originComparison?.reference ?? 'Branch ainda não publicada' }}</small>
      </article>
      <article>
        <span>Estratégia recomendada</span>
        <strong>{{ recommendation === 'ff-only' ? 'Fast-forward' : 'Rebase' }}</strong>
        <small>{{ recommendation === 'ff-only' ? 'Sem reescrever histórico' : 'Mantém histórico local linear' }}</small>
      </article>
    </div>

    <div class="git-sync-workspace">
      <article class="git-sync-plan">
        <header>
          <div>
            <span>Plano de atualização</span>
            <h3>Escolha a base e a estratégia</h3>
          </div>
          <span class="git-sync-status" :class="{ warning: comparison && comparison.behind > 0 }">
            {{ statusTitle }}
          </span>
        </header>

        <label class="git-sync-reference-field">
          <span>Receber alterações de</span>
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

        <p v-if="comparisonError" class="project-error" role="alert">{{ comparisonError }}</p>
        <div v-else class="git-sync-explanation">
          <strong>{{ statusTitle }}</strong>
          <p>{{ statusDescription }}</p>
        </div>

        <div class="git-sync-strategies" role="radiogroup" aria-label="Estratégia de integração">
          <button
            type="button"
            :class="{ active: strategy === 'ff-only', recommended: recommendation === 'ff-only' }"
            @click="selectStrategy('ff-only')"
          >
            <span>Fast-forward</span>
            <small>Só avança quando não há divergência.</small>
            <b v-if="recommendation === 'ff-only'">Recomendado</b>
          </button>
          <button
            type="button"
            :class="{ active: strategy === 'rebase', recommended: recommendation === 'rebase' }"
            @click="selectStrategy('rebase')"
          >
            <span>Rebase</span>
            <small>Reaplica seus commits sobre a base.</small>
            <b v-if="recommendation === 'rebase'">Recomendado</b>
          </button>
          <button
            type="button"
            :class="{ active: strategy === 'merge' }"
            @click="selectStrategy('merge')"
          >
            <span>Merge</span>
            <small>Preserva os dois históricos em um merge commit.</small>
          </button>
        </div>

        <div v-if="!overview.clean" class="git-sync-blocked">
          Faça commit ou stash das alterações antes de integrar uma referência remota.
        </div>

        <button class="primary-button git-sync-primary" type="button" :disabled="!canIntegrate" @click="integrate">
          {{ busy ? 'Sincronizando…' : actionLabel }}
        </button>
      </article>

      <aside class="git-sync-sidebar">
        <article>
          <header><span>Publicar alterações</span><h3>Origin</h3></header>
          <p>Envie a branch atual para o seu repositório depois de integrar e validar as mudanças.</p>
          <dl>
            <div><dt>Branch</dt><dd>{{ overview.branch ?? 'HEAD' }}</dd></div>
            <div><dt>Tracking</dt><dd>{{ workspace?.originComparison?.reference ?? 'Será configurado no primeiro push' }}</dd></div>
          </dl>
          <div class="git-sync-sidebar-actions">
            <button class="secondary-button" type="button" :disabled="remoteRefreshing === 'origin'" @click="emit('fetchRemote', 'origin')">
              {{ remoteRefreshing === 'origin' ? 'Atualizando…' : 'Fetch origin' }}
            </button>
            <button class="primary-button" type="button" :disabled="busy" @click="emit('push')">Push origin</button>
            <button class="secondary-button" type="button" :disabled="busy" @click="emit('openPullRequest')">
              Abrir pull request
            </button>
          </div>
        </article>

        <article>
          <header><span>Tracking configurado</span><h3>Pull rápido</h3></header>
          <p>Use pull fast-forward somente para atualizar a branch pelo tracking já configurado.</p>
          <code>{{ overview.upstream ?? 'Nenhum tracking configurado' }}</code>
          <button class="secondary-button" type="button" :disabled="busy || !overview.upstream || !overview.clean" @click="emit('pull')">
            Pull tracking
          </button>
        </article>
      </aside>
    </div>
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

.git-sync-heading,
.git-sync-plan > header,
.git-sync-sidebar header,
.git-sync-sidebar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.git-sync-heading h2,
.git-sync-plan h3,
.git-sync-sidebar h3 {
  margin: 3px 0 0;
  color: var(--text);
  font-size: var(--font-lg);
  font-weight: var(--font-weight-strong);
}

.git-sync-heading > div > span,
.git-sync-plan header span,
.git-sync-sidebar header span,
.git-sync-metrics span {
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-sync-heading p,
.git-sync-plan p,
.git-sync-sidebar p {
  margin: 5px 0 0;
  color: var(--text-muted);
  line-height: 1.55;
}

.git-sync-flow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  padding: var(--space-4);
}

.git-sync-flow article {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
}

.git-sync-flow article div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.git-sync-flow small,
.git-sync-metrics small,
.git-sync-sidebar small {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-sync-flow strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-node-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}

.git-sync-node-icon.upstream { background: var(--info-surface); color: var(--info-text); }
.git-sync-node-icon.origin { background: var(--success-surface); color: var(--success-text); }
.git-sync-arrow { color: var(--text-dim); font-size: var(--font-lg); }

.git-sync-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.git-sync-metrics article,
.git-sync-plan,
.git-sync-sidebar article {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.git-sync-metrics article {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: var(--space-4);
}

.git-sync-metrics strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-lg);
  font-weight: var(--font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-good { color: var(--success-text) !important; }
.sync-warning { color: var(--warning-text) !important; }

.git-sync-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, .7fr);
  align-items: start;
  gap: var(--space-4);
}

.git-sync-plan {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}

.git-sync-status {
  border-radius: 999px;
  background: var(--success-surface);
  color: var(--success-text) !important;
  padding: 6px 10px;
}

.git-sync-status.warning {
  background: var(--warning-surface);
  color: var(--warning-text) !important;
}

.git-sync-reference-field {
  display: grid;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-sync-reference-field select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
  padding: 11px 12px;
  font: inherit;
}

.git-sync-explanation,
.git-sync-blocked {
  border-radius: var(--radius-md);
  background: var(--surface-2);
  padding: var(--space-3);
}

.git-sync-explanation strong { color: var(--text); }
.git-sync-explanation p { margin-top: 4px; }

.git-sync-blocked {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-sync-strategies {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.git-sync-strategies button {
  position: relative;
  display: grid;
  gap: 5px;
  min-height: 112px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
  padding: var(--space-3);
  text-align: left;
}

.git-sync-strategies button:hover { border-color: var(--border-strong); }
.git-sync-strategies button.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.git-sync-strategies button span { font-weight: var(--font-weight-strong); }
.git-sync-strategies button small { color: var(--text-muted); line-height: 1.45; }
.git-sync-strategies button b {
  width: fit-content;
  border-radius: 999px;
  background: var(--info-surface);
  color: var(--info-text);
  padding: 3px 7px;
  font-size: var(--font-xs);
}

.git-sync-primary { width: 100%; }

.git-sync-sidebar {
  display: grid;
  gap: var(--space-3);
}

.git-sync-sidebar article {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.git-sync-sidebar dl {
  display: grid;
  gap: var(--space-2);
  margin: 0;
}

.git-sync-sidebar dl div {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: var(--space-2);
}

.git-sync-sidebar dt { color: var(--text-muted); }
.git-sync-sidebar dd {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-sidebar code {
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-muted);
  padding: var(--space-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-sidebar-actions { justify-content: flex-start; flex-wrap: wrap; }

@media (max-width: 1050px) {
  .git-sync-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .git-sync-workspace { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .git-sync-heading { align-items: flex-start; flex-direction: column; }
  .git-sync-flow { grid-template-columns: 1fr; }
  .git-sync-arrow { transform: rotate(90deg); justify-self: center; }
  .git-sync-metrics,
  .git-sync-strategies { grid-template-columns: 1fr; }
}
</style>
