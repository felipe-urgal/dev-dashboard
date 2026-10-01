<script setup lang="ts">
import type {
  GitOpenPullRequest,
  GitPullRequestMergeMethod,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  showMerge: boolean;
  showClose: boolean;
  showCreate: boolean;
  showEdit: boolean;
  existingPullRequest: GitOpenPullRequest | null;
  mergeCommandPreview: string;
  closeCommandPreview: string;
  createCommandPreview: string;
  editCommandPreview: string;
  mergeMethod: GitPullRequestMergeMethod;
  mergeConfirmText: string;
  closeConfirmText: string;
  mutationBusy: boolean;
  canConfirmMerge: boolean;
  canConfirmClose: boolean;
  canCreate: boolean;
  canEdit: boolean;
  mergeBlockers: readonly string[];
}>();

const emit = defineEmits<{
  'update:merge-method': [value: GitPullRequestMergeMethod];
  'update:merge-confirm-text': [value: string];
  'update:close-confirm-text': [value: string];
  'cancel-merge': [];
  'cancel-close': [];
  'cancel-create': [];
  'cancel-edit': [];
  merge: [];
  close: [];
  create: [];
  edit: [];
}>();

function onMergeMethodChange(event: Event) {
  emit(
    'update:merge-method',
    (event.target as HTMLSelectElement).value as GitPullRequestMergeMethod,
  );
}

function onMergeTextInput(event: Event) {
  emit('update:merge-confirm-text', (event.target as HTMLInputElement).value);
}

function onCloseTextInput(event: Event) {
  emit('update:close-confirm-text', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div
    v-if="props.showMerge && props.existingPullRequest"
    class="git-pr-confirm"
  >
    <p>
      Isto executará <code>{{ props.mergeCommandPreview }}</code
      >. O repositório alvo está fixado explicitamente no comando.
    </p>
    <ul v-if="props.mergeBlockers.length > 0" class="git-pr-confirm-blockers">
      <li v-for="blocker in props.mergeBlockers" :key="blocker">
        {{ blocker }}
      </li>
    </ul>
    <label>
      <span>Estratégia de merge</span>
      <select
        :value="props.mergeMethod"
        :disabled="props.mutationBusy"
        @change="onMergeMethodChange"
      >
        <option value="squash">Squash</option>
        <option value="merge">Merge</option>
        <option value="rebase">Rebase</option>
      </select>
    </label>
    <label>
      <span>
        Digite o número da PR ({{ props.existingPullRequest.number }}) para
        confirmar
      </span>
      <input
        :value="props.mergeConfirmText"
        type="text"
        :disabled="props.mutationBusy"
        @input="onMergeTextInput"
      />
    </label>
    <div class="git-pr-confirm-actions">
      <button type="button" @click="emit('cancel-merge')">Cancelar</button>
      <button
        type="button"
        class="danger-button"
        :disabled="!props.canConfirmMerge"
        @click="emit('merge')"
      >
        {{ props.mutationBusy ? 'Mesclando…' : 'Confirmar merge' }}
      </button>
    </div>
  </div>

  <div
    v-if="props.showClose && props.existingPullRequest"
    class="git-pr-confirm"
  >
    <p>
      Isto executará <code>{{ props.closeCommandPreview }}</code> — fecha a PR
      #{{ props.existingPullRequest.number }} sem fazer merge.
    </p>
    <label>
      <span>
        Digite o número da PR ({{ props.existingPullRequest.number }}) para
        confirmar
      </span>
      <input
        :value="props.closeConfirmText"
        type="text"
        :disabled="props.mutationBusy"
        @input="onCloseTextInput"
      />
    </label>
    <div class="git-pr-confirm-actions">
      <button type="button" @click="emit('cancel-close')">Cancelar</button>
      <button
        type="button"
        class="danger-button"
        :disabled="!props.canConfirmClose"
        @click="emit('close')"
      >
        {{ props.mutationBusy ? 'Fechando…' : 'Confirmar fechamento' }}
      </button>
    </div>
  </div>

  <div v-if="props.showCreate" class="git-pr-confirm">
    <p>
      Isto executará <code>{{ props.createCommandPreview }}</code> e cria a Pull
      Request diretamente no repositório GitHub selecionado.
    </p>
    <div class="git-pr-confirm-actions">
      <button type="button" @click="emit('cancel-create')">Cancelar</button>
      <button
        type="button"
        :disabled="!props.canCreate"
        @click="emit('create')"
      >
        {{ props.mutationBusy ? 'Criando…' : 'Confirmar criação' }}
      </button>
    </div>
  </div>

  <div
    v-if="props.showEdit && props.existingPullRequest"
    class="git-pr-confirm"
  >
    <p>
      Isto executará <code>{{ props.editCommandPreview }}</code> para atualizar
      o título e a descrição da PR #{{ props.existingPullRequest.number }}.
    </p>
    <div class="git-pr-confirm-actions">
      <button type="button" @click="emit('cancel-edit')">Cancelar</button>
      <button type="button" :disabled="!props.canEdit" @click="emit('edit')">
        {{ props.mutationBusy ? 'Salvando…' : 'Confirmar edição' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.git-pr-confirm-blockers {
  margin: 0;
  padding-left: 18px;
  color: var(--warning-text);
}
</style>
