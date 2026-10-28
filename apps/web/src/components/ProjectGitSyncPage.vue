<script setup lang="ts">
import { computed } from 'vue';
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';

import type {
  GitSyncOperation,
  GitSyncProgressEvent,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  buildFlowNodes,
  buildTimeline,
  deriveCurrentBranchSync,
  deriveMainSync,
  describeMainDifference,
  type GitSyncInput,
} from '../utils/git-sync-status';
import GitSyncCurrentBranch from './git-sync/GitSyncCurrentBranch.vue';
import GitSyncFlow from './git-sync/GitSyncFlow.vue';
import GitSyncTimeline from './git-sync/GitSyncTimeline.vue';
import UiButton from './ui/UiButton.vue';

const props = defineProps<{
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  busy: boolean;
  checking?: boolean;
  operation?: GitSyncOperation | null;
  progressEvents?: GitSyncProgressEvent[];
  verificationError?: string;
  lastSynchronizationAt?: string | null;
  synchronizationMessage?: string;
  synchronizationError?: string;
}>();

const emit = defineEmits<{
  synchronize: [];
  'update-current-branch': [];
  'clear-console': [];
  'open-commit': [];
}>();

const input = computed<GitSyncInput>(() => ({
  overview: props.overview,
  workspace: props.workspace,
  busy: props.busy,
  checking: props.checking ?? false,
  operation: props.operation ?? null,
  verificationError: props.verificationError ?? '',
}));

const main = computed(() => deriveMainSync(input.value));
const current = computed(() => deriveCurrentBranchSync(input.value));
const nodes = computed(() => buildFlowNodes(input.value));
const timeline = computed(() => buildTimeline(props.progressEvents ?? []));

const hasUpstream = computed(() =>
  (props.workspace?.remotes ?? []).some((remote) => remote.name === 'upstream'),
);

const lastSyncLabel = computed(() => {
  if (!props.lastSynchronizationAt) return 'ainda não executada';

  const date = new Date(props.lastSynchronizationAt);
  if (Number.isNaN(date.getTime())) return props.lastSynchronizationAt;

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
});

const summary = computed(() => {
  switch (main.value.state) {
    case 'checking':
      return { title: 'Verificando referências remotas…', note: '' };
    case 'unavailable':
      return {
        title: 'Sincronização indisponível',
        note: 'Requer a branch main local e o remoto origin.',
      };
    case 'syncing':
      return {
        title: 'Sincronizando…',
        note: 'Acompanhe os passos abaixo.',
      };
    case 'incomplete':
      return {
        title: 'Verificação incompleta',
        note: props.verificationError ?? '',
      };
    case 'synced':
      return {
        title: 'Tudo em dia',
        note: `Última sincronização: ${lastSyncLabel.value}.`,
      };
    case 'dirty':
      return {
        title: describeMainDifference(input.value),
        note: 'Há alterações locais pendentes.',
      };
    default:
      return {
        title: describeMainDifference(input.value),
        note: 'Sincronize para trazer as atualizações.',
      };
  }
});

const changedFiles = computed(() => props.overview.files.length);

const resultError = computed(() => {
  if (props.synchronizationError) return props.synchronizationError;
  const failed = timeline.value.steps.find((step) => step.status === 'error');
  return failed?.message ?? '';
});
</script>

<template>
  <section class="git-sync-page">
    <GitSyncFlow
      :nodes="nodes"
      :summary-title="summary.title"
      :summary-note="summary.note"
      :tone="main.tone"
      :can-sync="main.canSync"
      :syncing="main.state === 'syncing'"
      :branch-name="current.name"
      :fetch-what="hasUpstream ? 'upstream e origin' : 'origin'"
      @synchronize="emit('synchronize')"
    />

    <div v-if="main.state === 'dirty'" class="git-sync-note" role="status">
      <ExclamationTriangleIcon aria-hidden="true" />
      <span>
        <strong>
          {{ changedFiles }}
          {{ changedFiles === 1 ? 'arquivo alterado' : 'arquivos alterados' }}.
        </strong>
        Confirme (commit) as alterações antes de sincronizar.
      </span>
      <UiButton @click="emit('open-commit')">Ir para Commit</UiButton>
    </div>

    <GitSyncCurrentBranch
      v-if="current.show"
      :name="current.name"
      :remote="current.remote"
      :label="current.label"
      :tone="current.tone"
      :can-update="current.canUpdate"
      :busy="current.busy"
      @update="emit('update-current-branch')"
    />

    <GitSyncTimeline
      :timeline="timeline"
      :message="synchronizationMessage ?? ''"
      :error="resultError"
      :last-sync-label="lastSyncLabel"
      :can-clear="
        !busy &&
        !checking &&
        (timeline.steps.length > 0 ||
          Boolean(synchronizationMessage) ||
          Boolean(synchronizationError))
      "
      @clear="emit('clear-console')"
    />
  </section>
</template>

<style scoped>
.git-sync-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.git-sync-note {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--warning-text) 35%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--warning-text) 12%, transparent);
  font-size: 13.5px;
}

.git-sync-note svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  color: var(--warning-text);
}

.git-sync-note span {
  flex: 1;
}
</style>
