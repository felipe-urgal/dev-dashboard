<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NModal } from 'naive-ui';

import {
  BRANCH_PREFIXES,
  canCreateBranch,
  canRenameBranch,
  newBranchName,
} from '../../utils/git-branches';
import UiButton from '../ui/UiButton.vue';

export type BranchDialog = 'create' | 'rename' | 'delete' | 'delete-remote';

const props = defineProps<{
  dialog: BranchDialog | null;
  /** Branch alvo de renomear/remover. */
  target: string;
  /** Nome exibido no remoto, quando a ação é remover do origin. */
  remoteTarget: string;
  currentBranch: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  create: [name: string];
  rename: [nextName: string];
  remove: [];
}>();

const prefix = ref<string>(BRANCH_PREFIXES[0]);
const suffix = ref('');
const renamed = ref('');
const form = ref<HTMLFormElement | null>(null);

watch(
  () => props.dialog,
  () => {
    prefix.value = BRANCH_PREFIXES[0];
    suffix.value = '';
    renamed.value = props.target;
  },
);

/** O menu devolve o foco ao botão ao fechar; o campo precisa pegá-lo depois. */
function focusField(): void {
  form.value?.querySelector<HTMLInputElement>('input[type=text]')?.focus();
}

const title = computed(
  () =>
    ({
      create: 'Nova branch',
      rename: 'Renomear branch',
      delete: 'Remover branch local',
      'delete-remote': 'Remover branch remota',
    })[props.dialog ?? 'create'],
);

const confirmationTarget = computed(() =>
  props.dialog === 'delete-remote' ? props.remoteTarget : props.target,
);

const canSubmit = computed(() => {
  if (props.busy) return false;
  if (props.dialog === 'create') {
    return canCreateBranch(prefix.value, suffix.value);
  }
  if (props.dialog === 'rename') {
    return canRenameBranch(props.target, renamed.value);
  }
  return true;
});

function submit(): void {
  if (!canSubmit.value) return;
  if (props.dialog === 'create') {
    emit('create', newBranchName(prefix.value, suffix.value));
  } else if (props.dialog === 'rename') {
    emit('rename', renamed.value.trim());
  } else {
    emit('remove');
  }
}
</script>

<template>
  <NModal
    :show="dialog !== null"
    :mask-closable="!busy"
    :close-on-esc="!busy"
    @after-enter="focusField"
    @update:show="(show: boolean) => !show && !busy && emit('close')"
  >
    <form
      ref="form"
      class="git-branch-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @submit.prevent="submit"
    >
      <h3>{{ title }}</h3>

      <template v-if="dialog === 'create'">
        <p>
          Criada e selecionada a partir de
          <code>{{ currentBranch }}</code
          >.
        </p>
        <div class="git-branch-chips" role="group" aria-label="Tipo da branch">
          <button
            v-for="item in BRANCH_PREFIXES"
            :key="item"
            type="button"
            :aria-pressed="prefix === item"
            @click="prefix = item"
          >
            {{ item }}
          </button>
        </div>
        <label class="git-branch-input">
          <code>{{ prefix }}</code>
          <input
            v-model="suffix"
            type="text"
            maxlength="190"
            placeholder="nome-da-branch"
            autocomplete="off"
            aria-label="Nome"
          />
        </label>
      </template>

      <label v-else-if="dialog === 'rename'" class="git-branch-input">
        <input
          v-model="renamed"
          type="text"
          maxlength="200"
          aria-label="Novo nome"
        />
      </label>

      <template v-else>
        <p>
          {{
            dialog === 'delete-remote'
              ? 'A branch será removida do origin. A branch local, se existir, será mantida.'
              : 'A branch local será removida mesmo que possua commits não integrados.'
          }}
          Esta ação não pode ser desfeita. Remover
          <strong>{{ confirmationTarget }}</strong
          >?
        </p>
      </template>

      <footer>
        <UiButton :disabled="busy" @click="emit('close')">Cancelar</UiButton>
        <UiButton
          type="submit"
          :variant="
            dialog === 'create' || dialog === 'rename' ? 'primary' : 'danger'
          "
          :disabled="!canSubmit"
        >
          {{
            dialog === 'create'
              ? 'Criar e trocar'
              : dialog === 'rename'
                ? 'Salvar novo nome'
                : dialog === 'delete-remote'
                  ? 'Remover do origin'
                  : 'Remover branch local'
          }}
        </UiButton>
      </footer>
    </form>
  </NModal>
</template>

<style scoped>
.git-branch-dialog {
  display: flex;
  width: 480px;
  max-width: 92vw;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  color: var(--text);
  background: var(--surface-1);
  box-shadow: 0 16px 40px rgb(0 0 0 / 45%);
}

h3 {
  margin: 0;
  font-size: 16px;
}

p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

code {
  font-family: var(--font-family-mono);
}

.git-branch-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.git-branch-chips button {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.git-branch-chips button[aria-pressed='true'] {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-branch-input {
  display: flex;
  height: 40px;
  align-items: center;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface-0);
}

.git-branch-input code {
  color: var(--text-dim);
}

.git-branch-input input {
  min-width: 0;
  flex: 1;
  border: 0;
  color: var(--text);
  background: transparent;
  font-family: var(--font-family-mono);
  font-size: 13px;
  outline: none;
}

.git-branch-input:focus-within {
  border-color: var(--accent);
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
