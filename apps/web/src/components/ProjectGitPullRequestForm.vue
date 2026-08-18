<script setup lang="ts">
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';

import type { GitPullRequestTargetRemote as ApiGitPullRequestTargetRemote } from '../api';
import ProjectGitPullRequestFooter from './ProjectGitPullRequestFooter.vue';

const props = defineProps<{
  overviewBranch: string | null;
  availableTargets: readonly ApiGitPullRequestTargetRemote[];
  baseBranches: readonly string[];
  targetRemote: ApiGitPullRequestTargetRemote;
  baseBranch: string;
  title: string;
  description: string;
  opening: boolean;
  busy: boolean;
  forcePushBranch: string | null;
  forcePushAcknowledged: boolean;
  changedFilesCount: number;
  commitCount: number;
  ahead: number;
  behind: number;
  mutationBusy: boolean;
  canForcePush: boolean;
  existingNumber: number | undefined;
  existingUrl: string | undefined;
  generatedUrl: string;
  checkingExisting: boolean;
  canOpen: boolean;
  existingPullRequest: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  'update:target-remote': [value: ApiGitPullRequestTargetRemote];
  'update:base-branch': [value: string];
  'update:title': [value: string];
  'update:description': [value: string];
  'update:force-push-acknowledged': [value: boolean];
  'force-push': [];
  open: [];
  'toggle-create': [];
}>();

function onTargetRemoteChange(event: Event) {
  emit(
    'update:target-remote',
    (event.target as HTMLSelectElement).value as ApiGitPullRequestTargetRemote,
  );
}

function onBaseBranchChange(event: Event) {
  emit('update:base-branch', (event.target as HTMLSelectElement).value);
}

function onTitleInput(event: Event) {
  emit('update:title', (event.target as HTMLInputElement).value);
}

function onDescriptionInput(event: Event) {
  emit('update:description', (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <form class="git-pr-form" @submit.prevent="emit('submit')">
    <section class="git-pr-branch-summary" aria-label="Comparação das branches">
      <div class="git-pr-branch-card">
        <span>Branch de origem</span>
        <strong>{{ `origin/${props.overviewBranch ?? 'HEAD'}` }}</strong>
        <small>Último commit local</small>
      </div>
      <span class="git-pr-branch-arrow" aria-hidden="true">→</span>
      <div class="git-pr-branch-card">
        <span>Destino do PR</span>
        <strong>{{ props.targetRemote }}</strong>
        <small>Branch base: {{ props.baseBranch }}</small>
      </div>
    </section>

    <section class="git-pr-change-summary" aria-label="Resumo das alterações">
      <div>
        <strong>{{ props.changedFilesCount }}</strong>
        <span>Arquivos alterados</span>
      </div>
      <div>
        <strong>{{ props.ahead }}</strong>
        <span>Commits locais à frente</span>
      </div>
      <div>
        <strong>{{ props.behind }}</strong>
        <span>Commits remotos à frente</span>
      </div>
      <div>
        <strong>{{ props.commitCount }}</strong>
        <span>Commits no histórico</span>
      </div>
    </section>

    <div class="git-pr-grid">
      <label>
        <span>Branch de origem</span>
        <input
          :value="`origin/${props.overviewBranch ?? 'HEAD'}`"
          type="text"
          readonly
        />
      </label>

      <label>
        <span>Destino do PR</span>
        <select
          :value="props.targetRemote"
          :disabled="props.opening || props.busy"
          @change="onTargetRemoteChange"
        >
          <option
            v-for="remote in props.availableTargets"
            :key="remote"
            :value="remote"
          >
            {{ remote }}
          </option>
        </select>
      </label>

      <label>
        <span>Branch base</span>
        <select
          :value="props.baseBranch"
          :disabled="props.opening || props.busy"
          @change="onBaseBranchChange"
        >
          <option
            v-for="branch in props.baseBranches"
            :key="branch"
            :value="branch"
          >
            {{ branch }}
          </option>
          <option v-if="props.baseBranches.length === 0" value="main">
            main
          </option>
        </select>
      </label>
    </div>

    <label>
      <span>Título</span>
      <input
        :value="props.title"
        maxlength="256"
        type="text"
        placeholder="Título da Pull Request"
        :disabled="props.opening || props.busy"
        @input="onTitleInput"
      />
    </label>

    <label>
      <span>Descrição</span>
      <textarea
        :value="props.description"
        maxlength="20000"
        placeholder="Descreva o que muda nesta Pull Request"
        :disabled="props.opening || props.busy"
        @input="onDescriptionInput"
      />
    </label>

    <section
      v-if="props.forcePushBranch"
      class="git-pr-force-push"
      aria-label="Confirmação de push forçado"
    >
      <ExclamationTriangleIcon aria-hidden="true" />
      <div>
        <strong>Push forçado detectado</strong>
        <p>
          O histórico de <code>origin/{{ props.forcePushBranch }}</code> será
          reescrito. Atualize a branch remota se quiser evitar o force push.
        </p>
        <label class="git-pr-force-push-confirm">
          <input
            :checked="props.forcePushAcknowledged"
            type="checkbox"
            :disabled="props.busy || props.mutationBusy"
            @change="
              emit(
                'update:force-push-acknowledged',
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          <span>Entendo que o histórico remoto será reescrito</span>
        </label>
      </div>
      <button
        type="button"
        :disabled="!props.canForcePush"
        @click="emit('force-push')"
      >
        Forçar atualização no origin
      </button>
    </section>

    <ProjectGitPullRequestFooter
      :existing-number="props.existingNumber"
      :existing-url="props.existingUrl"
      :generated-url="props.generatedUrl"
      :checking-existing="props.checkingExisting"
      :opening="props.opening"
      :can-open="props.canOpen"
      :mutation-busy="props.mutationBusy"
      :existing-pull-request="props.existingPullRequest"
      @open="emit('open')"
      @toggle-create="emit('toggle-create')"
    />
  </form>
</template>
