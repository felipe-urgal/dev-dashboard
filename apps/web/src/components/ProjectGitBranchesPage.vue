<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import type {
  GitBranch,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  loading: boolean;
  busy: boolean;
  remoteRefreshing: string;
}>();

const emit = defineEmits<{
  refresh: [];
  create: [name: string];
  switch: [name: string];
  track: [remoteBranch: string];
  fetchRemote: [remote: string];
}>();

type BranchFilter = 'all' | 'local' | 'origin' | 'upstream';

const filter = ref<BranchFilter>('all');
const search = ref('');
const selectedBranchName = ref('');
const createBranchName = ref('');

const branches = computed(() => props.workspace?.branches ?? []);
const localBranches = computed(() => branches.value.filter((branch) => branch.kind === 'local'));
const originBranches = computed(() => branches.value.filter((branch) => branch.remote === 'origin'));
const upstreamBranches = computed(() => branches.value.filter((branch) => branch.remote === 'upstream'));

const filteredBranches = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR');
  return branches.value.filter((branch) => {
    const matchesFilter = filter.value === 'all'
      || filter.value === 'local' && branch.kind === 'local'
      || filter.value === 'origin' && branch.remote === 'origin'
      || filter.value === 'upstream' && branch.remote === 'upstream';
    const matchesSearch = !query
      || branch.name.toLocaleLowerCase('pt-BR').includes(query)
      || branch.latestCommit?.subject.toLocaleLowerCase('pt-BR').includes(query);
    return matchesFilter && matchesSearch;
  });
});

const selectedBranch = computed(() => {
  return branches.value.find((branch) => branch.name === selectedBranchName.value)
    ?? branches.value.find((branch) => branch.current)
    ?? filteredBranches.value[0]
    ?? null;
});

const selectedLocalExists = computed(() => {
  const branch = selectedBranch.value;
  if (!branch || branch.kind !== 'remote') return false;
  return localBranches.value.some((candidate) => candidate.name === branch.shortName);
});

watch(branches, (items) => {
  if (items.length === 0) {
    selectedBranchName.value = '';
    return;
  }
  if (items.some((branch) => branch.name === selectedBranchName.value)) return;
  selectedBranchName.value = items.find((branch) => branch.current)?.name ?? items[0]!.name;
}, { immediate: true });

function formatDate(value: string | undefined): string {
  if (!value) return 'Data não disponível';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function branchSource(branch: GitBranch): string {
  if (branch.kind === 'local') return 'Branch local';
  if (branch.remote === 'origin') return 'Remote de publicação';
  if (branch.remote === 'upstream') return 'Remote principal';
  return `Remote ${branch.remote ?? 'desconhecido'}`;
}

function trackingLabel(branch: GitBranch): string {
  if (branch.kind === 'remote') return branch.name;
  return branch.upstream ?? 'Sem tracking configurado';
}

function stateLabel(branch: GitBranch): string {
  if (branch.current) return 'Atual';
  if (branch.kind === 'remote') return branch.remote ?? 'Remota';
  if (!branch.upstream) return 'Sem tracking';
  if (branch.ahead > 0 && branch.behind > 0) return 'Divergiu';
  if (branch.ahead > 0) return `${branch.ahead} à frente`;
  if (branch.behind > 0) return `${branch.behind} atrás`;
  return 'Sincronizada';
}

function stateTone(branch: GitBranch): string {
  if (branch.current) return 'current';
  if (branch.kind === 'remote') return branch.remote === 'upstream' ? 'upstream' : 'origin';
  if (branch.ahead > 0 && branch.behind > 0) return 'danger';
  if (branch.ahead > 0 || branch.behind > 0 || !branch.upstream) return 'warning';
  return 'success';
}

function submitCreate(): void {
  const name = createBranchName.value.trim();
  if (!name) return;
  emit('create', name);
  createBranchName.value = '';
}

function selectBranch(branch: GitBranch): void {
  selectedBranchName.value = branch.name;
}
</script>

<template>
  <section class="git-branches-page">
    <header class="branches-page-heading">
      <div>
        <span class="section-kicker">Branches</span>
        <h2>Gerencie linhas de trabalho locais e remotas</h2>
        <p>Encontre uma branch, veja tracking e último commit, ou crie uma branch local a partir de origin/upstream.</p>
      </div>
      <button
        type="button"
        class="secondary-button"
        :disabled="loading"
        @click="emit('refresh')"
      >
        {{ loading ? 'Atualizando…' : 'Atualizar lista' }}
      </button>
    </header>

    <div class="branch-metrics" aria-label="Resumo de branches">
      <article>
        <span>Atual</span>
        <strong>{{ overview.detached ? 'HEAD destacado' : overview.branch ?? 'Sem commits' }}</strong>
        <small>{{ overview.upstream ?? 'Sem tracking' }}</small>
      </article>
      <article>
        <span>Locais</span>
        <strong>{{ localBranches.length }}</strong>
        <small>disponíveis para checkout</small>
      </article>
      <article>
        <span>Origin</span>
        <strong>{{ originBranches.length }}</strong>
        <small>branches publicadas</small>
      </article>
      <article>
        <span>Upstream</span>
        <strong>{{ upstreamBranches.length }}</strong>
        <small>branches da fonte principal</small>
      </article>
    </div>

    <div class="branch-create-card">
      <div>
        <span class="section-kicker">Nova branch</span>
        <h3>Criar a partir do HEAD atual</h3>
        <p>A árvore de trabalho deve estar limpa para trocar de contexto com segurança.</p>
      </div>
      <form @submit.prevent="submitCreate">
        <label>
          <span>Nome da branch</span>
          <input
            v-model="createBranchName"
            type="text"
            maxlength="200"
            placeholder="feature/nova-funcionalidade"
            :disabled="busy"
          />
        </label>
        <button
          type="submit"
          class="primary-button"
          :disabled="busy || !createBranchName.trim()"
        >
          Criar e trocar
        </button>
      </form>
    </div>

    <div class="branch-browser-card">
      <div class="branch-browser-toolbar">
        <div class="branch-filter-tabs" aria-label="Filtrar branches">
          <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">Todas</button>
          <button type="button" :class="{ active: filter === 'local' }" @click="filter = 'local'">Locais</button>
          <button type="button" :class="{ active: filter === 'origin' }" @click="filter = 'origin'">Origin</button>
          <button type="button" :class="{ active: filter === 'upstream' }" @click="filter = 'upstream'">Upstream</button>
        </div>
        <label class="branch-search">
          <span class="sr-only">Buscar branch</span>
          <input v-model="search" type="search" placeholder="Buscar branch ou commit…" />
        </label>
        <span class="branch-result-count">{{ filteredBranches.length }} resultado(s)</span>
      </div>

      <div class="branch-browser-layout">
        <aside class="branch-list" aria-label="Lista de branches">
          <button
            v-for="branch in filteredBranches"
            :key="`${branch.kind}-${branch.name}`"
            type="button"
            class="git-table-row branches-table branch-list-item"
            :class="{ selected: selectedBranch?.name === branch.name }"
            @click="selectBranch(branch)"
          >
            <span class="branch-kind-icon" :class="`branch-kind-${branch.kind}`" aria-hidden="true">
              {{ branch.kind === 'local' ? '⑂' : '◌' }}
            </span>
            <span class="branch-list-copy">
              <strong>{{ branch.name }}</strong>
              <small>{{ branch.latestCommit?.subject || trackingLabel(branch) }}</small>
            </span>
            <span class="branch-state" :class="`branch-state-${stateTone(branch)}`">
              {{ stateLabel(branch) }}
            </span>
          </button>
          <div v-if="filteredBranches.length === 0" class="branch-empty-state">
            Nenhuma branch corresponde aos filtros atuais.
          </div>
        </aside>

        <article v-if="selectedBranch" class="branch-detail-panel">
          <header>
            <div>
              <span class="section-kicker">{{ branchSource(selectedBranch) }}</span>
              <h3>{{ selectedBranch.name }}</h3>
            </div>
            <span class="branch-state" :class="`branch-state-${stateTone(selectedBranch)}`">
              {{ stateLabel(selectedBranch) }}
            </span>
          </header>

          <dl class="branch-detail-grid">
            <div>
              <dt>Tipo</dt>
              <dd>{{ selectedBranch.kind === 'local' ? 'Local' : 'Remota' }}</dd>
            </div>
            <div>
              <dt>Tracking</dt>
              <dd><code>{{ trackingLabel(selectedBranch) }}</code></dd>
            </div>
            <div>
              <dt>À frente</dt>
              <dd>{{ selectedBranch.ahead }}</dd>
            </div>
            <div>
              <dt>Atrás</dt>
              <dd>{{ selectedBranch.behind }}</dd>
            </div>
          </dl>

          <section class="branch-commit-detail">
            <span class="section-kicker">Último commit</span>
            <template v-if="selectedBranch.latestCommit">
              <div class="branch-commit-heading">
                <code>{{ selectedBranch.latestCommit.shortHash }}</code>
                <strong>{{ selectedBranch.latestCommit.subject }}</strong>
              </div>
              <p>
                {{ selectedBranch.latestCommit.authorName }} ·
                {{ formatDate(selectedBranch.latestCommit.authoredAt) }}
              </p>
            </template>
            <p v-else>Nenhum commit disponível para esta referência.</p>
          </section>

          <div v-if="selectedBranch.kind === 'local'" class="branch-detail-actions">
            <button
              type="button"
              class="primary-button"
              :disabled="busy || selectedBranch.current"
              @click="emit('switch', selectedBranch.name)"
            >
              {{ selectedBranch.current ? 'Branch atual' : 'Trocar para esta branch' }}
            </button>
          </div>

          <div v-else class="branch-detail-actions remote-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="remoteRefreshing === selectedBranch.remote || !selectedBranch.remote"
              @click="selectedBranch.remote && emit('fetchRemote', selectedBranch.remote)"
            >
              {{ remoteRefreshing === selectedBranch.remote ? 'Atualizando…' : `Fetch ${selectedBranch.remote}` }}
            </button>
            <button
              type="button"
              class="primary-button"
              :disabled="busy || selectedLocalExists"
              @click="emit('track', selectedBranch.name)"
            >
              {{ selectedLocalExists ? 'Branch local já existe' : 'Criar local e trocar' }}
            </button>
          </div>

          <p v-if="selectedBranch.kind === 'remote'" class="branch-action-hint">
            A branch local será criada como <code>{{ selectedBranch.shortName }}</code> e ficará rastreando <code>{{ selectedBranch.name }}</code>.
          </p>
        </article>

        <div v-else class="branch-detail-panel branch-empty-state">
          Selecione uma branch para ver os detalhes.
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="./ProjectGitBranchesPage.css"></style>
