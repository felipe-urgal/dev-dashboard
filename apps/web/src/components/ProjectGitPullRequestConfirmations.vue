<script setup lang="ts">
import type {
  GitOpenPullRequest,
  GitPullRequestMergeMethod,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  showMerge: boolean;
  showClose: boolean;
  showCreate: boolean;
  existingPullRequest: GitOpenPullRequest | null;
  mergeCommandPreview: string;
  closeCommandPreview: string;
  createCommandPreview: string;
  mergeMethod: GitPullRequestMergeMethod;
  mergeConfirmText: string;
  closeConfirmText: string;
  mutationBusy: boolean;
  canConfirmMerge: boolean;
  canConfirmClose: boolean;
  canCreate: boolean;
}>();

const emit = defineEmits<{
  'update:merge-method': [value: GitPullRequestMergeMethod];
  'update:merge-confirm-text': [value: string];
  'update:close-confirm-text': [value: string];
  'cancel-merge': [];
  'cancel-close': [];
  'cancel-create': [];
  merge: [];
  close: [];
  create: [];
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
      Isto executará <code>{{ props.mergeCommandPreview }}</code> — mescla a PR
      #{{ props.existingPullRequest.number }} na branch base. Ação irreversível
      pelo dashboard.
    </p>
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
      Isto executará <code>{{ props.createCommandPreview }}</code> — cria a Pull
      Request diretamente no GitHub, sem abrir o navegador.
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
</template>
