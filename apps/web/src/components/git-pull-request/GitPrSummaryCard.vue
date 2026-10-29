<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
} from '@heroicons/vue/24/outline';

import type {
  GitOpenPullRequest,
  GitPullRequestCiStatus,
  GitPullRequestReviewState,
} from '@dev-dashboard/contracts';

import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

type Tone = 'neutral' | 'accent' | 'warning' | 'success' | 'danger';

const props = defineProps<{
  pullRequest: GitOpenPullRequest;
  targetRemote: string;
  mutationBusy: boolean;
  mergeBlockers: readonly string[];
}>();

const emit = defineEmits<{ edit: []; merge: []; close: [] }>();

const cockpit = computed(() => props.pullRequest.cockpit ?? null);
const github = computed(() => props.pullRequest.provider === 'github');
const noun = computed(() =>
  props.pullRequest.provider === 'gitlab' ? 'MR' : 'PR',
);
const providerName = computed(() =>
  props.pullRequest.provider === 'gitlab' ? 'GitLab' : 'GitHub',
);

const reviewLabels: Record<GitPullRequestReviewState, [string, Tone]> = {
  approved: ['Aprovada', 'success'],
  'changes-requested': ['Alterações solicitadas', 'danger'],
  'review-required': ['Review pendente', 'warning'],
  unknown: ['Review desconhecido', 'neutral'],
};

const ciLabels: Record<GitPullRequestCiStatus, [string, Tone]> = {
  success: ['Passou', 'success'],
  pending: ['Pendente', 'warning'],
  failure: ['Falhou', 'danger'],
  unknown: ['Desconhecido', 'neutral'],
};

const remoteNotice = computed(() => {
  switch (cockpit.value?.remoteStatus) {
    case 'unauthenticated':
      return 'GitHub sem autenticação para carregar os detalhes remotos.';
    case 'rate-limited':
      return 'GitHub atingiu o limite de consultas; o Git local continua disponível.';
    case 'unavailable':
      return 'Detalhes remotos indisponíveis no momento; o Git local continua disponível.';
    default:
      return '';
  }
});

const facts = computed<{ label: string; value: string; tone: Tone }[]>(() => {
  const data = cockpit.value;
  if (!data || data.remoteStatus !== 'available') return [];
  const list: { label: string; value: string; tone: Tone }[] = [];
  if (props.pullRequest.ciStatus) {
    const [value, tone] = ciLabels[props.pullRequest.ciStatus];
    list.push({ label: 'CI', value, tone });
  }
  const [review, reviewTone] = reviewLabels[data.reviewState];
  list.push({ label: 'Review', value: review, tone: reviewTone });
  if (data.mergeable !== undefined) {
    list.push({
      label: 'Merge',
      value:
        data.mergeable === null
          ? 'Calculando'
          : data.mergeable
            ? 'Mergeável'
            : 'Com bloqueio',
      tone:
        data.mergeable === null
          ? 'neutral'
          : data.mergeable
            ? 'success'
            : 'danger',
    });
  }
  if (props.pullRequest.commentsCount !== undefined) {
    list.push({
      label: 'Comentários',
      value: String(props.pullRequest.commentsCount),
      tone: 'neutral',
    });
  }
  const pending = props.pullRequest.unresolvedConversationsCount;
  if (pending !== undefined) {
    list.push({
      label: 'Conversas pendentes',
      value: String(pending),
      tone: pending > 0 ? 'warning' : 'neutral',
    });
  }
  return list;
});
</script>

<template>
  <article class="git-pr-summary" aria-live="polite">
    <header class="git-pr-summary-head">
      <div class="git-pr-summary-title">
        <UiTag :tone="cockpit?.draft ? 'neutral' : 'success'">
          {{ cockpit?.draft ? 'Rascunho' : 'Aberta' }}
        </UiTag>
        <code>{{ noun }} #{{ pullRequest.number }}</code>
        <a
          :href="pullRequest.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="`Abrir no ${providerName}`"
        >
          {{ pullRequest.title }}
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
        <code v-if="cockpit?.headSha" class="git-pr-summary-sha">{{
          cockpit.headSha.slice(0, 8)
        }}</code>
      </div>
    </header>

    <p v-if="remoteNotice" class="git-pr-summary-notice" role="status">
      {{ remoteNotice }}
    </p>

    <dl v-if="facts.length > 0" class="git-pr-summary-facts">
      <div v-for="fact in facts" :key="fact.label">
        <dt>{{ fact.label }}</dt>
        <dd>
          <UiTag :tone="fact.tone">{{ fact.value }}</UiTag>
        </dd>
      </div>
    </dl>

    <p
      v-if="cockpit && cockpit.requestedReviewers.length > 0"
      class="git-pr-summary-reviewers"
    >
      Reviewers: {{ cockpit.requestedReviewers.join(', ') }}
    </p>

    <ul
      v-if="cockpit && cockpit.checks.length > 0"
      class="git-pr-summary-checks"
    >
      <li
        v-for="check in cockpit.checks"
        :key="`${check.name}:${check.detailsUrl ?? ''}`"
      >
        <span
          class="git-pr-summary-dot"
          :data-status="check.status"
          :title="ciLabels[check.status][0]"
        />
        <a
          v-if="check.detailsUrl"
          :href="check.detailsUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ check.name }}
        </a>
        <span v-else>{{ check.name }}</span>
        <small>{{ ciLabels[check.status][0] }}</small>
      </li>
    </ul>

    <ul
      v-if="github && mergeBlockers.length > 0"
      class="git-pr-summary-blockers"
    >
      <li v-for="blocker in mergeBlockers" :key="blocker">{{ blocker }}</li>
    </ul>

    <footer v-if="github" class="git-pr-summary-actions">
      <UiButton :disabled="mutationBusy" @click="emit('edit')">
        <PencilSquareIcon aria-hidden="true" />
        Editar
      </UiButton>
      <UiButton
        variant="danger"
        :disabled="mutationBusy"
        @click="emit('close')"
      >
        Fechar PR
      </UiButton>
      <UiButton
        variant="primary"
        :disabled="mutationBusy || mergeBlockers.length > 0"
        :title="mergeBlockers[0] ?? 'Mesclar Pull Request'"
        @click="emit('merge')"
      >
        Mesclar PR
      </UiButton>
    </footer>
  </article>
</template>

<style scoped>
.git-pr-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-pr-summary-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.git-pr-summary-title code {
  font-family: var(--font-family-mono);
}

.git-pr-summary-title code {
  color: var(--text-muted);
  font-size: 13px;
}

.git-pr-summary-title a {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
  text-decoration: none;
}

.git-pr-summary-title a:hover {
  text-decoration: underline;
}

.git-pr-summary-title a svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--text-dim);
}

.git-pr-summary-sha {
  margin-left: auto;
  color: var(--text-dim);
}

.git-pr-summary-notice,
.git-pr-summary-reviewers {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.git-pr-summary-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin: 0;
}

.git-pr-summary-facts div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.git-pr-summary-facts dt {
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.git-pr-summary-facts dd {
  margin: 0;
}

.git-pr-summary-checks {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  list-style: none;
}

.git-pr-summary-checks li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}

.git-pr-summary-checks li:first-child {
  border-top: 0;
}

.git-pr-summary-checks a {
  color: var(--text);
  text-decoration: none;
}

.git-pr-summary-checks a:hover {
  text-decoration: underline;
}

.git-pr-summary-checks small {
  margin-left: auto;
  color: var(--text-dim);
}

.git-pr-summary-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--border-strong);
}

.git-pr-summary-dot[data-status='success'] {
  background: var(--success-text);
}

.git-pr-summary-dot[data-status='pending'] {
  background: var(--warning-text);
}

.git-pr-summary-dot[data-status='failure'] {
  background: var(--danger-text, #f85149);
}

.git-pr-summary-blockers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 10px 14px 10px 30px;
  border-radius: 10px;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 10%, transparent);
  font-size: 13px;
}

.git-pr-summary-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
</style>
