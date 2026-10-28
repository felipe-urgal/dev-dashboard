<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

import {
  amendDisabledReason,
  canAmendCommit,
  canCreateCommit,
  deriveCommitScope,
} from '../utils/git-commit-scope';
import GitCommitActions from './git-commit/GitCommitActions.vue';
import GitCommitComposer from './git-commit/GitCommitComposer.vue';
import GitCommitFileList from './git-commit/GitCommitFileList.vue';
import UiButton from './ui/UiButton.vue';

export type CommitMode = 'create' | 'amend';

const props = defineProps<{
  overview: ProjectGitOverview;
  busy: boolean;
  mode: CommitMode;
  pushBranch: string | null;
}>();

const message = defineModel<string>('message', { required: true });

const emit = defineEmits<{
  'update:mode': [value: CommitMode];
  submit: [];
  push: [branch: string];
  'open-history': [];
  'open-diff': [];
}>();

const scope = computed(() => deriveCommitScope(props.overview.files));
const latest = computed(() => props.overview.latestCommit);

const canCreate = computed(() =>
  canCreateCommit({
    message: message.value,
    busy: props.busy,
    scope: scope.value,
  }),
);

const canAmend = computed(() =>
  canAmendCommit({
    message: message.value,
    busy: props.busy,
    scope: scope.value,
    latest: latest.value,
  }),
);

const amendTitle = computed(() =>
  amendDisabledReason({ scope: scope.value, latest: latest.value }),
);

function submit(mode: CommitMode): void {
  if (mode === 'create' ? !canCreate.value : !canAmend.value) return;
  emit('update:mode', mode);
  emit('submit');
}
</script>

<template>
  <section class="git-commit-page">
    <section
      v-if="pushBranch"
      class="git-commit-note is-push"
      aria-label="Novo commit aguardando envio"
    >
      <ArrowUpTrayIcon aria-hidden="true" />
      <span>
        <strong>Commits locais aguardando envio</strong>
        · de <code>{{ pushBranch }}</code> para
        <code>origin/{{ pushBranch }}</code
        >. Se já existir uma Pull Request, o GitHub a atualiza sozinho.
      </span>
      <UiButton
        variant="primary"
        :disabled="busy"
        @click="emit('push', pushBranch)"
      >
        Push
      </UiButton>
    </section>

    <div
      v-if="scope.conflicts.length > 0"
      class="git-commit-note is-conflict"
      role="alert"
    >
      <ExclamationTriangleIcon aria-hidden="true" />
      <span>
        <strong>
          {{ scope.conflicts.length }}
          {{
            scope.conflicts.length === 1
              ? 'arquivo com conflito'
              : 'arquivos com conflito'
          }}.
        </strong>
        Resolva os conflitos antes de criar ou alterar commits.
      </span>
    </div>

    <div
      v-else-if="overview.files.length === 0"
      class="git-commit-note is-clean"
    >
      <CheckCircleIcon aria-hidden="true" />
      <span>
        <strong>Nada para commitar.</strong>
        A árvore está igual ao último commit; ainda dá para alterar a mensagem
        dele (amend).
      </span>
    </div>

    <div class="git-commit-layout">
      <section class="git-commit-card" aria-label="Mensagem do commit">
        <header>Mensagem</header>
        <GitCommitComposer
          v-model:message="message"
          :busy="busy"
          @submit="submit('create')"
        />
        <GitCommitActions
          :can-create="canCreate"
          :can-amend="canAmend"
          :busy="busy"
          :tracked-count="scope.tracked.length"
          :staged-count="scope.staged.length"
          :amend-title="amendTitle"
          :latest="latest"
          @create="submit('create')"
          @amend="submit('amend')"
          @use-last-message="message = latest?.subject ?? ''"
          @open-history="emit('open-history')"
        />
      </section>

      <GitCommitFileList :scope="scope" @open-diff="emit('open-diff')" />
    </div>
  </section>
</template>

<style scoped>
.git-commit-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.git-commit-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  align-items: start;
  gap: 16px;
}

.git-commit-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-commit-card > header {
  padding: 11px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 650;
}

.git-commit-note {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 13.5px;
}

.git-commit-note > svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.git-commit-note > span {
  flex: 1;
}

.git-commit-note code {
  font-family: var(--font-family-mono);
}

.git-commit-note.is-push {
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  background: var(--accent-soft);
}

.git-commit-note.is-push > svg {
  color: var(--accent);
}

.git-commit-note.is-conflict {
  border-color: color-mix(in srgb, var(--danger-text) 35%, transparent);
  background: color-mix(in srgb, var(--danger-text) 12%, transparent);
}

.git-commit-note.is-conflict > svg {
  color: var(--danger-text);
}

.git-commit-note.is-clean {
  color: var(--text-muted);
  background: var(--surface-1);
}

.git-commit-note.is-clean > svg {
  color: var(--success-text);
}

@media (max-width: 1000px) {
  .git-commit-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
