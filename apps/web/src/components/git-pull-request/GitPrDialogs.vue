<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { NModal } from 'naive-ui';

import type {
  GitOpenPullRequest,
  GitPullRequestMergeMethod,
} from '@dev-dashboard/contracts';

import UiButton from '../ui/UiButton.vue';

export type PrDialog = 'edit' | 'merge' | 'close';

const MERGE_METHODS: { id: GitPullRequestMergeMethod; label: string }[] = [
  { id: 'squash', label: 'Squash' },
  { id: 'merge', label: 'Merge' },
  { id: 'rebase', label: 'Rebase' },
];

const props = defineProps<{
  dialog: PrDialog | null;
  pullRequest: GitOpenPullRequest | null;
  busy: boolean;
  canEdit: boolean;
  canMerge: boolean;
  canClose: boolean;
  mergeBlockers: readonly string[];
  commandPreview: string;
}>();

const title = defineModel<string>('title', { required: true });
const description = defineModel<string>('description', { required: true });
const mergeMethod = defineModel<GitPullRequestMergeMethod>('mergeMethod', {
  required: true,
});

const emit = defineEmits<{
  cancel: [];
  edit: [];
  merge: [];
  close: [];
}>();

const form = ref<HTMLFormElement | null>(null);
const number = computed(() => props.pullRequest?.number ?? '');

const heading = computed(
  () =>
    ({
      edit: `Editar PR #${number.value}`,
      merge: `Mesclar PR #${number.value}`,
      close: `Fechar PR #${number.value}`,
    })[props.dialog ?? 'edit'],
);

const canSubmit = computed(() =>
  props.dialog === 'edit'
    ? props.canEdit
    : props.dialog === 'merge'
      ? props.canMerge
      : props.canClose,
);

function submit(): void {
  if (!canSubmit.value || props.busy) return;
  if (props.dialog === 'edit') emit('edit');
  else if (props.dialog === 'merge') emit('merge');
  else emit('close');
}

function focusTitle(): void {
  form.value?.querySelector<HTMLInputElement>('input[type=text]')?.focus();
}

watch(
  () => props.dialog,
  async (dialog) => {
    if (dialog !== 'edit') return;
    await nextTick();
    setTimeout(focusTitle, 60);
  },
);
</script>

<template>
  <NModal
    :show="dialog !== null"
    :mask-closable="!busy"
    :close-on-esc="false"
    :auto-focus="false"
    :trap-focus="false"
    @update:show="(show: boolean) => !show && !busy && emit('cancel')"
  >
    <form
      ref="form"
      class="git-pr-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="heading"
      @submit.prevent="submit"
      @keydown.esc="!busy && emit('cancel')"
      @keydown.ctrl.enter.prevent="submit"
    >
      <h3>{{ heading }}</h3>

      <template v-if="dialog === 'edit'">
        <label>
          <span>Título</span>
          <input v-model="title" type="text" maxlength="256" :disabled="busy" />
        </label>
        <label>
          <span>Descrição <small>Markdown</small></span>
          <textarea
            v-model="description"
            rows="10"
            maxlength="20000"
            :disabled="busy"
          />
        </label>
      </template>

      <template v-else-if="dialog === 'merge'">
        <p v-if="pullRequest">
          <strong>{{ pullRequest.title }}</strong>
        </p>
        <div
          class="git-pr-dialog-chips"
          role="group"
          aria-label="Estratégia de merge"
        >
          <button
            v-for="method in MERGE_METHODS"
            :key="method.id"
            type="button"
            :aria-pressed="mergeMethod === method.id"
            :disabled="busy"
            @click="mergeMethod = method.id"
          >
            {{ method.label }}
          </button>
        </div>
        <ul v-if="mergeBlockers.length > 0" class="git-pr-dialog-blockers">
          <li v-for="blocker in mergeBlockers" :key="blocker">{{ blocker }}</li>
        </ul>
      </template>

      <p v-else>
        A PR <strong>#{{ number }}</strong> será fechada sem fazer merge.
        {{ pullRequest?.title }}
      </p>

      <code v-if="commandPreview" class="git-pr-dialog-command">
        $ {{ commandPreview }}
      </code>

      <footer>
        <UiButton :disabled="busy" @click="emit('cancel')">Cancelar</UiButton>
        <UiButton
          type="submit"
          :variant="dialog === 'close' ? 'danger' : 'primary'"
          :disabled="!canSubmit || busy"
          :busy="busy"
        >
          {{
            dialog === 'edit'
              ? busy
                ? 'Salvando…'
                : 'Salvar alterações'
              : dialog === 'merge'
                ? busy
                  ? 'Mesclando…'
                  : 'Mesclar PR'
                : busy
                  ? 'Fechando…'
                  : 'Fechar PR'
          }}
        </UiButton>
      </footer>
    </form>
  </NModal>
</template>

<style scoped>
.git-pr-dialog {
  display: flex;
  width: 600px;
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

input,
textarea {
  width: 100%;
  padding: 10px 12px;
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
textarea:focus {
  border-color: var(--accent);
}

.git-pr-dialog-chips {
  display: flex;
  gap: 6px;
}

.git-pr-dialog-chips button {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.git-pr-dialog-chips button[aria-pressed='true'] {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-pr-dialog-blockers {
  margin: 0;
  padding: 10px 14px 10px 30px;
  border-radius: 10px;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 10%, transparent);
  font-size: 13px;
}

.git-pr-dialog-command {
  overflow: hidden;
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
