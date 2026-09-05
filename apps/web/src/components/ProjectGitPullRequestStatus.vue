<script setup lang="ts">
import { computed } from 'vue';

import type {
  GitOpenPullRequest,
  GitPullRequestCiStatus,
  GitPullRequestReviewState,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  branchPublished: boolean;
  checkingExisting: boolean;
  existingPullRequest: GitOpenPullRequest | null;
  lookupUnavailable: boolean;
  targetRemote: string;
  mutationBusy: boolean;
}>();

const emit = defineEmits<{
  'toggle-merge': [];
  'toggle-close': [];
}>();

const cockpit = computed(() => props.existingPullRequest?.cockpit ?? null);

const reviewLabels: Record<GitPullRequestReviewState, string> = {
  approved: 'Aprovada',
  'changes-requested': 'Alterações solicitadas',
  'review-required': 'Review pendente',
  unknown: 'Review desconhecido',
};

const checkLabels: Record<GitPullRequestCiStatus, string> = {
  success: 'Passou',
  pending: 'Pendente',
  failure: 'Falhou',
  unknown: 'Desconhecido',
};

function remoteStatusLabel(status: NonNullable<typeof cockpit.value>['remoteStatus']): string {
  switch (status) {
    case 'unauthenticated':
      return 'GitHub sem autenticação para carregar os detalhes remotos.';
    case 'rate-limited':
      return 'GitHub atingiu o limite de consultas; o Git local continua disponível.';
    case 'unavailable':
      return 'Detalhes remotos indisponíveis no momento; o Git local continua disponível.';
    default:
      return '';
  }
}
</script>

<template>
  <div v-if="!branchPublished" class="git-pr-warning">
    A branch atual ainda não possui upstream. Publique a branch antes de abrir a
    Pull Request.
  </div>

  <div v-else-if="checkingExisting" class="git-pr-checking" aria-live="polite">
    Verificando se já existe uma Pull Request aberta para este destino…
  </div>

  <div
    v-else-if="existingPullRequest"
    class="git-pr-existing"
    aria-live="polite"
  >
    <div class="git-pr-existing-content">
      <div class="git-pr-existing-summary">
        <span>PR #{{ existingPullRequest.number }} já está aberta</span>
        <strong>{{ existingPullRequest.title }}</strong>
        <small>
          {{ existingPullRequest.sourceBranch }} → {{ targetRemote }}/{{
            existingPullRequest.baseBranch
          }}
        </small>
      </div>

      <div v-if="cockpit" class="git-pr-cockpit">
        <p
          v-if="cockpit.remoteStatus !== 'available'"
          class="git-pr-cockpit-degraded"
          role="status"
        >
          {{ remoteStatusLabel(cockpit.remoteStatus) }}
        </p>

        <template v-else>
          <dl class="git-pr-cockpit-facts">
            <div v-if="cockpit.headSha">
              <dt>Head</dt>
              <dd><code>{{ cockpit.headSha.slice(0, 8) }}</code></dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{{ cockpit.draft ? 'Rascunho' : 'Pronta para review' }}</dd>
            </div>
            <div>
              <dt>Review</dt>
              <dd>{{ reviewLabels[cockpit.reviewState] }}</dd>
            </div>
            <div v-if="cockpit.mergeable !== undefined">
              <dt>Merge</dt>
              <dd>
                {{
                  cockpit.mergeable === null
                    ? 'Calculando'
                    : cockpit.mergeable
                      ? 'Mergeável'
                      : 'Com bloqueio'
                }}
              </dd>
            </div>
          </dl>

          <p
            v-if="cockpit.requestedReviewers.length > 0"
            class="git-pr-cockpit-reviewers"
          >
            Reviewers: {{ cockpit.requestedReviewers.join(', ') }}
          </p>

          <ul v-if="cockpit.checks.length > 0" class="git-pr-cockpit-checks">
            <li v-for="check in cockpit.checks" :key="`${check.name}:${check.detailsUrl ?? ''}`">
              <span
                class="git-pr-check-state"
                :class="`git-pr-check-state-${check.status}`"
              >
                {{ checkLabels[check.status] }}
              </span>
              <a
                v-if="check.detailsUrl"
                :href="check.detailsUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ check.name }}
              </a>
              <span v-else>{{ check.name }}</span>
            </li>
          </ul>
        </template>
      </div>
    </div>

    <div class="git-pr-gh-actions">
      <button
        type="button"
        :disabled="mutationBusy"
        @click="emit('toggle-merge')"
      >
        Mesclar com gh
      </button>
      <button
        type="button"
        class="danger-button"
        :disabled="mutationBusy"
        @click="emit('toggle-close')"
      >
        Fechar com gh
      </button>
    </div>
  </div>

  <div v-else-if="lookupUnavailable" class="git-pr-lookup-note">
    Não foi possível verificar automaticamente se já existe uma Pull Request
    aberta. Você ainda pode continuar, mas vale conferir o repositório antes de
    criar outra.
  </div>
</template>

<style scoped>
.git-pr-warning,
.git-pr-checking,
.git-pr-lookup-note,
.git-pr-existing {
  padding: var(--space-3);
}

.git-pr-warning {
  border: 1px solid color-mix(in srgb, var(--warning-text) 30%, var(--border));
  border-radius: var(--radius-md);
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-pr-checking,
.git-pr-lookup-note {
  background: var(--surface-2);
  color: var(--text-muted);
}

.git-pr-existing {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--success-text) 30%, var(--border));
  border-radius: var(--radius-md);
  background: var(--success-surface);
  color: var(--success-text);
}

.git-pr-existing-content,
.git-pr-existing-summary {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.git-pr-existing strong {
  color: var(--text);
}

.git-pr-existing small,
.git-pr-cockpit-reviewers {
  color: var(--text-muted);
}

.git-pr-cockpit {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid color-mix(in srgb, var(--success-text) 18%, var(--border));
  color: var(--text);
}

.git-pr-cockpit-degraded,
.git-pr-cockpit-reviewers {
  margin: 0;
  font-size: var(--font-xs);
  line-height: 1.5;
}

.git-pr-cockpit-degraded {
  color: var(--warning-text);
}

.git-pr-cockpit-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0;
}

.git-pr-cockpit-facts > div {
  display: grid;
  gap: 2px;
}

.git-pr-cockpit-facts dt {
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.git-pr-cockpit-facts dd {
  margin: 0;
  font-size: var(--font-xs);
  font-weight: 700;
}

.git-pr-cockpit-checks {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.git-pr-cockpit-checks li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--font-xs);
}

.git-pr-cockpit-checks a {
  color: var(--accent);
  overflow-wrap: anywhere;
}

.git-pr-check-state {
  flex: none;
  min-width: 62px;
  font-weight: 800;
}

.git-pr-check-state-success {
  color: var(--success-text);
}

.git-pr-check-state-pending,
.git-pr-check-state-unknown {
  color: var(--text-muted);
}

.git-pr-check-state-failure {
  color: var(--danger-text);
}

.git-pr-gh-actions {
  display: flex;
  flex: none;
  gap: var(--space-2);
}

.git-pr-gh-actions button {
  min-height: 36px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text);
  padding: 6px 12px;
  font: inherit;
  font-weight: 600;
}

@media (max-width: 800px) {
  .git-pr-existing {
    align-items: stretch;
    flex-direction: column;
  }

  .git-pr-gh-actions,
  .git-pr-gh-actions button {
    width: 100%;
  }
}
</style>
