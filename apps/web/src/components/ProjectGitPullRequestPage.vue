<script setup lang="ts">
import {
  ArrowTopRightOnSquareIcon,
  CodeBracketIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type {
  GitOpenPullRequest,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  composeProjectGitPullRequest,
  getProjectGitPullRequestStatus,
  type GitPullRequestTargetRemote,
} from '../api';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  busy: boolean;
}>();

const targetRemote = ref<GitPullRequestTargetRemote>('origin');
const baseBranch = ref('main');
const title = ref('');
const description = ref('');
const opening = ref(false);
const checkingExisting = ref(false);
const existingPullRequest = ref<GitOpenPullRequest | null>(null);
const lookupUnavailable = ref(false);
const errorMessage = ref('');
const generatedUrl = ref('');
let lookupGeneration = 0;
let lookupScheduled = false;

const availableTargets = computed(() => {
  const names = new Set(
    (props.workspace?.remotes ?? [])
      .filter((remote) => remote.name === 'origin' || remote.name === 'upstream')
      .map((remote) => remote.name as GitPullRequestTargetRemote),
  );
  return (['origin', 'upstream'] as const).filter((name) => names.has(name));
});

const baseBranches = computed(() => {
  const values = (props.workspace?.branches ?? [])
    .filter((branch) =>
      branch.kind === 'remote'
      && branch.remote === targetRemote.value
      && branch.shortName !== props.overview.branch,
    )
    .map((branch) => branch.shortName);
  return Array.from(new Set(values)).sort((left, right) => {
    const rank = (value: string): number => {
      if (value === 'main') return 0;
      if (value === 'master') return 1;
      if (value === 'develop') return 2;
      return 3;
    };
    return rank(left) - rank(right) || left.localeCompare(right);
  });
});

const branchPublished = computed(() => Boolean(props.overview.upstream));

const canLookup = computed(() =>
  !props.overview.detached
  && Boolean(props.overview.branch)
  && branchPublished.value
  && availableTargets.value.includes(targetRemote.value)
  && Boolean(baseBranch.value.trim()),
);

const canOpen = computed(() =>
  !props.busy
  && !opening.value
  && !checkingExisting.value
  && !existingPullRequest.value
  && canLookup.value
  && Boolean(title.value.trim()),
);

function defaultBase(): string {
  return baseBranches.value.find((branch) => branch === 'main')
    ?? baseBranches.value.find((branch) => branch === 'master')
    ?? baseBranches.value.find((branch) => branch === 'develop')
    ?? baseBranches.value[0]
    ?? 'main';
}

function defaultDescription(): string {
  const subject = props.overview.latestCommit?.subject
    ?? `Alterações da branch ${props.overview.branch ?? ''}`;
  return `## Resumo\n\n${subject}`;
}

function reserveExternalWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  const popup = window.open('', '_blank');
  if (!popup) return null;
  try {
    popup.opener = null;
  } catch {
    // Alguns navegadores tornam opener somente leitura; a navegação ainda é segura no novo contexto.
  }
  return popup;
}

function navigateExternal(popup: Window | null, url: string): boolean {
  if (popup && !popup.closed) {
    try {
      popup.location.href = url;
      return true;
    } catch {
      // Cai no link explícito abaixo quando o navegador impedir a navegação da janela reservada.
    }
  }
  generatedUrl.value = url;
  errorMessage.value = 'O navegador bloqueou a nova aba. Use o botão abaixo para continuar.';
  return false;
}

function closeReservedWindow(popup: Window | null): void {
  if (!popup || popup.closed) return;
  try {
    popup.close();
  } catch {
    // Sem ação: a mensagem de erro da operação é mais importante do que fechar a janela vazia.
  }
}

async function checkExistingPullRequest(): Promise<GitOpenPullRequest | null> {
  const generation = ++lookupGeneration;
  existingPullRequest.value = null;
  lookupUnavailable.value = false;

  if (!canLookup.value) {
    checkingExisting.value = false;
    return null;
  }

  checkingExisting.value = true;
  try {
    const lookup = await getProjectGitPullRequestStatus(
      props.projectId,
      {
        targetRemote: targetRemote.value,
        baseBranch: baseBranch.value.trim(),
      },
    );
    if (generation !== lookupGeneration) return null;
    lookupUnavailable.value = !lookup.checked;
    existingPullRequest.value = lookup.existing ?? null;
    return existingPullRequest.value;
  } catch {
    if (generation !== lookupGeneration) return null;
    lookupUnavailable.value = true;
    existingPullRequest.value = null;
    return null;
  } finally {
    if (generation === lookupGeneration) checkingExisting.value = false;
  }
}

function scheduleExistingLookup(): void {
  if (lookupScheduled) return;
  lookupScheduled = true;
  queueMicrotask(() => {
    lookupScheduled = false;
    void checkExistingPullRequest();
  });
}

watch(
  () => [props.overview.branch, props.overview.upstream, props.workspace] as const,
  () => {
    if (availableTargets.value.includes('upstream')) targetRemote.value = 'upstream';
    else if (availableTargets.value.includes('origin')) targetRemote.value = 'origin';
    baseBranch.value = defaultBase();
    title.value = props.overview.latestCommit?.subject
      ?? props.overview.branch
      ?? '';
    description.value = defaultDescription();
    generatedUrl.value = '';
    errorMessage.value = '';
    existingPullRequest.value = null;
    lookupUnavailable.value = false;
    scheduleExistingLookup();
  },
  { immediate: true },
);

watch(targetRemote, () => {
  baseBranch.value = defaultBase();
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  scheduleExistingLookup();
});

watch(baseBranch, () => {
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  scheduleExistingLookup();
});

onBeforeUnmount(() => {
  lookupGeneration += 1;
});

async function openPullRequest(): Promise<void> {
  if (!canOpen.value) return;

  // Reserva a aba ainda dentro do gesto do usuário. Assim a chamada assíncrona à API
  // não perde a permissão de popup e `noopener` não gera um falso positivo de bloqueio.
  const reservedWindow = reserveExternalWindow();
  opening.value = true;
  errorMessage.value = '';
  generatedUrl.value = '';

  try {
    const existing = await checkExistingPullRequest();
    if (existing) {
      navigateExternal(reservedWindow, existing.url);
      return;
    }

    const pullRequest = await composeProjectGitPullRequest(
      props.projectId,
      {
        targetRemote: targetRemote.value,
        baseBranch: baseBranch.value.trim(),
        title: title.value.trim(),
        description: description.value.trim(),
      },
    );
    navigateExternal(reservedWindow, pullRequest.url);
  } catch (error) {
    closeReservedWindow(reservedWindow);
    errorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível preparar a Pull Request.';
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <section class="git-pr-card">
    <header class="git-pr-heading">
      <div>
        <span>Pull Request</span>
        <h3>Abrir direto no repositório</h3>
        <p>
          Escolha o destino e abra a página do provedor já com título, descrição e branch base preenchidos.
        </p>
      </div>
      <CodeBracketIcon aria-hidden="true" />
    </header>

    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>

    <div v-if="!branchPublished" class="git-pr-warning">
      A branch atual ainda não possui upstream. Publique a branch antes de abrir a Pull Request.
    </div>

    <div v-else-if="checkingExisting" class="git-pr-checking" aria-live="polite">
      Verificando se já existe uma Pull Request aberta para este destino…
    </div>

    <div v-else-if="existingPullRequest" class="git-pr-existing" aria-live="polite">
      <div>
        <span>PR #{{ existingPullRequest.number }} já está aberta</span>
        <strong>{{ existingPullRequest.title }}</strong>
        <small>
          {{ existingPullRequest.sourceBranch }} → {{ targetRemote }}/{{ existingPullRequest.baseBranch }}
        </small>
      </div>
    </div>

    <div v-else-if="lookupUnavailable" class="git-pr-lookup-note">
      Não foi possível verificar automaticamente se já existe uma Pull Request aberta. Você ainda pode continuar, mas vale conferir o repositório antes de criar outra.
    </div>

    <form class="git-pr-form" @submit.prevent="openPullRequest">
      <div class="git-pr-grid">
        <label>
          <span>Origem</span>
          <input
            :value="overview.upstream ?? overview.branch ?? 'HEAD'"
            type="text"
            readonly
          />
        </label>

        <label>
          <span>Destino</span>
          <select v-model="targetRemote" :disabled="opening || busy">
            <option
              v-for="remote in availableTargets"
              :key="remote"
              :value="remote"
            >
              {{ remote }}
            </option>
          </select>
        </label>

        <label>
          <span>Branch base</span>
          <select v-model="baseBranch" :disabled="opening || busy">
            <option
              v-for="branch in baseBranches"
              :key="branch"
              :value="branch"
            >
              {{ branch }}
            </option>
            <option v-if="baseBranches.length === 0" value="main">main</option>
          </select>
        </label>
      </div>

      <label>
        <span>Título</span>
        <input
          v-model="title"
          maxlength="256"
          type="text"
          placeholder="Título da Pull Request"
          :disabled="opening || busy"
        />
      </label>

      <label>
        <span>Descrição</span>
        <textarea
          v-model="description"
          maxlength="20000"
          placeholder="Descreva o que muda nesta Pull Request"
          :disabled="opening || busy"
        />
      </label>

      <div class="git-pr-footer">
        <p>
          O dashboard não armazena credenciais do GitHub/GitLab; ele abre a tela oficial de criação já preenchida.
        </p>
        <a
          v-if="existingPullRequest"
          class="git-pr-existing-action"
          :href="existingPullRequest.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver PR #{{ existingPullRequest.number }}
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
        <a
          v-else-if="generatedUrl"
          class="git-pr-fallback-link"
          :href="generatedUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir página da Pull Request
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
        <button v-else type="submit" :disabled="!canOpen">
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
          {{
            checkingExisting
              ? 'Verificando PR…'
              : opening
                ? 'Preparando…'
                : 'Abrir Pull Request'
          }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.git-pr-card {
  display: grid;
  gap: var(--space-4);
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  padding: 20px;
  box-shadow: var(--shadow-1);
}

.git-pr-heading,
.git-pr-footer,
.git-pr-existing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.git-pr-heading > div,
.git-pr-existing > div {
  display: grid;
  gap: 4px;
}

.git-pr-heading > svg {
  width: 26px;
  height: 26px;
  flex: none;
  color: var(--text-dim);
}

.git-pr-heading span,
.git-pr-form label > span,
.git-pr-existing span {
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: 600;
}

.git-pr-heading h3 {
  margin: 0;
  color: var(--text);
  font-size: var(--font-lg);
}

.git-pr-heading p,
.git-pr-footer p {
  margin: 0;
  color: var(--text-dim);
}

.git-pr-form,
.git-pr-form label {
  display: grid;
  gap: var(--space-2);
}

.git-pr-form {
  gap: var(--space-3);
}

.git-pr-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.git-pr-form input,
.git-pr-form select,
.git-pr-form textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  padding: 10px 12px;
  font: inherit;
}

.git-pr-form input[readonly] {
  background: var(--surface-2);
  color: var(--text-muted);
}

.git-pr-form textarea {
  min-height: 140px;
  resize: vertical;
  line-height: 1.5;
}

.git-pr-form input:focus,
.git-pr-form select:focus,
.git-pr-form textarea:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}

.git-pr-footer button,
.git-pr-fallback-link,
.git-pr-existing-action {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  padding: 9px 14px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
}

.git-pr-footer button svg,
.git-pr-fallback-link svg,
.git-pr-existing-action svg {
  width: 16px;
  height: 16px;
}

.git-pr-footer button:disabled {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
}

.git-pr-warning,
.git-pr-checking,
.git-pr-lookup-note,
.git-pr-existing {
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.git-pr-warning {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-pr-checking,
.git-pr-lookup-note {
  background: var(--surface-2);
  color: var(--text-muted);
}

.git-pr-existing {
  background: var(--success-surface);
  color: var(--success-text);
}

.git-pr-existing strong {
  color: var(--text);
}

.git-pr-existing small {
  color: var(--text-muted);
}

@media (max-width: 800px) {
  .git-pr-grid {
    grid-template-columns: 1fr;
  }

  .git-pr-heading,
  .git-pr-footer,
  .git-pr-existing {
    align-items: stretch;
    flex-direction: column;
  }

  .git-pr-footer button,
  .git-pr-existing-action,
  .git-pr-fallback-link {
    width: 100%;
  }
}
</style>
