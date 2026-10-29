<script setup lang="ts">
import { computed } from 'vue';
import { ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline';

import type { GitPullRequestProvider } from '@dev-dashboard/contracts';

import type { GitPullRequestTargetRemote } from '../../api';
import UiButton from '../ui/UiButton.vue';

const props = defineProps<{
  overviewBranch: string | null;
  sourceReference: string;
  availableTargets: readonly GitPullRequestTargetRemote[];
  baseBranches: readonly string[];
  provider: GitPullRequestProvider | null;
  opening: boolean;
  busy: boolean;
  mutationBusy: boolean;
  generatedUrl: string;
  checkingExisting: boolean;
  existingNumber?: number | undefined;
  existingUrl?: string | undefined;
  canOpen: boolean;
  canCreateViaGh: boolean;
  commandPreview: string;
}>();

const targetRemote = defineModel<GitPullRequestTargetRemote>('targetRemote', {
  required: true,
});
const baseBranch = defineModel<string>('baseBranch', { required: true });
const title = defineModel<string>('title', { required: true });
const description = defineModel<string>('description', { required: true });
const draft = defineModel<boolean>('draft', { required: true });

const emit = defineEmits<{
  'open-external': [];
  create: [];
  cancel: [];
}>();

const locked = computed(
  () => props.opening || props.busy || props.mutationBusy,
);
</script>

<template>
  <form class="git-pr-form" @submit.prevent="emit('create')">
    <div class="git-pr-form-main">
      <label>
        <span>Título</span>
        <input
          v-model="title"
          type="text"
          maxlength="256"
          placeholder="Título da Pull Request"
          :disabled="locked"
        />
      </label>

      <label>
        <span>Descrição <small>Markdown</small></span>
        <textarea
          v-model="description"
          rows="14"
          maxlength="20000"
          placeholder="Descreva o que muda nesta Pull Request"
          :disabled="locked"
        />
      </label>
    </div>

    <aside class="git-pr-form-side">
      <div class="git-pr-form-route" aria-label="Comparação das branches">
        <div>
          <small>De</small>
          <strong>{{ overviewBranch ?? 'HEAD' }}</strong>
          <code>{{ sourceReference }}</code>
        </div>
        <span aria-hidden="true">↓</span>
        <div>
          <small>Para</small>
          <strong>{{ targetRemote }}/{{ baseBranch }}</strong>
        </div>
      </div>

      <label v-if="availableTargets.length > 1">
        <span>Destino</span>
        <select v-model="targetRemote" :disabled="locked">
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
        <select v-model="baseBranch" :disabled="locked">
          <option v-for="branch in baseBranches" :key="branch" :value="branch">
            {{ branch }}
          </option>
          <option v-if="baseBranches.length === 0" :value="baseBranch">
            {{ baseBranch }}
          </option>
        </select>
      </label>

      <label
        v-if="provider === 'github'"
        class="git-pr-form-check git-pr-draft"
      >
        <input v-model="draft" type="checkbox" :disabled="locked" />
        <span>Criar como rascunho</span>
      </label>
    </aside>

    <footer class="git-pr-form-footer">
      <code
        v-if="provider === 'github' && commandPreview"
        :title="commandPreview"
      >
        $ {{ commandPreview }}
      </code>
      <span class="git-pr-form-spacer" />

      <UiButton :disabled="mutationBusy" @click="emit('cancel')">
        Cancelar
      </UiButton>

      <a
        v-if="existingUrl"
        class="git-pr-form-link"
        :href="existingUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        Ver PR #{{ existingNumber }}
        <ArrowTopRightOnSquareIcon aria-hidden="true" />
      </a>
      <a
        v-else-if="generatedUrl"
        class="git-pr-form-link"
        :href="generatedUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        Continuar no provedor
        <ArrowTopRightOnSquareIcon aria-hidden="true" />
      </a>
      <template v-else>
        <UiButton
          class="git-pr-external-action"
          :disabled="!canOpen || opening"
          @click="emit('open-external')"
        >
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
          {{
            checkingExisting
              ? 'Verificando PR…'
              : opening
                ? 'Preparando…'
                : provider === 'gitlab'
                  ? 'Abrir no GitLab'
                  : 'Abrir comparação'
          }}
        </UiButton>
        <UiButton
          v-if="provider === 'github'"
          type="submit"
          variant="primary"
          class="git-pr-primary"
          :disabled="!canCreateViaGh || mutationBusy"
          :busy="mutationBusy"
        >
          {{ mutationBusy ? 'Criando…' : 'Criar Pull Request' }}
        </UiButton>
      </template>
    </footer>
  </form>
</template>

<style scoped>
.git-pr-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px 20px;
  align-items: start;
}

@media (max-width: 900px) {
  .git-pr-form {
    grid-template-columns: minmax(0, 1fr);
  }
}

.git-pr-form-main,
.git-pr-form-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label > span {
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
}

small {
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 500;
}

input[type='text'],
textarea,
select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 13.5px;
  outline: none;
}

textarea {
  resize: vertical;
  font-family: var(--font-family-mono);
  font-size: 13px;
  line-height: 1.5;
}

input:focus,
textarea:focus,
select:focus {
  border-color: var(--accent);
}

.git-pr-form-route {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-0);
}

.git-pr-form-route > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.git-pr-form-route strong {
  overflow-wrap: anywhere;
  font-family: var(--font-family-mono);
  font-size: 13px;
}

.git-pr-form-route code {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.git-pr-form-route > span {
  color: var(--text-dim);
}

.git-pr-form-check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: 13px;
}

.git-pr-form-footer {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.git-pr-form-footer code {
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-pr-form-spacer {
  flex: 1 1 0;
}

.git-pr-form-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.git-pr-form-link svg {
  width: 14px;
  height: 14px;
}
</style>
