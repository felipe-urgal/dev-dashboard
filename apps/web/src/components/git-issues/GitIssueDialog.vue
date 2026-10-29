<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { NModal } from 'naive-ui';

import type { GithubIssue } from '../../api/github-issues';
import UiButton from '../ui/UiButton.vue';

const TITLE_LIMIT = 256;

const props = defineProps<{
  /** `null` fecha o diálogo; `edit` exige `issue`. */
  mode: 'create' | 'edit' | null;
  issue: GithubIssue | null;
  busy: boolean;
  error: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [title: string, body: string];
}>();

const title = ref('');
const body = ref('');
const form = ref<HTMLFormElement | null>(null);

watch(
  () => props.mode,
  async (mode) => {
    title.value = mode === 'edit' ? (props.issue?.title ?? '') : '';
    body.value = mode === 'edit' ? (props.issue?.body ?? '') : '';
    if (mode === null) return;
    await nextTick();
    setTimeout(focusTitle, 60);
  },
);

const heading = computed(() =>
  props.mode === 'edit' ? `Editar issue #${props.issue?.number}` : 'Nova issue',
);
const canSave = computed(
  () =>
    !props.busy &&
    title.value.trim() !== '' &&
    title.value.length <= TITLE_LIMIT,
);

function submit(): void {
  if (canSave.value) emit('save', title.value.trim(), body.value);
}

/** O modal monta fora do fluxo normal: `autofocus` não é confiável. */
function focusTitle(): void {
  form.value?.querySelector<HTMLInputElement>('input')?.focus();
}
</script>

<template>
  <NModal
    :show="mode !== null"
    :mask-closable="!busy"
    :close-on-esc="false"
    :auto-focus="false"
    :trap-focus="false"
    @after-enter="focusTitle"
    @update:show="(show: boolean) => !show && !busy && emit('close')"
  >
    <form
      ref="form"
      class="git-issue-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="heading"
      @submit.prevent="submit"
      @keydown.esc="!busy && emit('close')"
      @keydown.ctrl.enter.prevent="submit"
      @keydown.meta.enter.prevent="submit"
    >
      <h3>{{ heading }}</h3>

      <label>
        <span>
          Título
          <small :data-over="title.length > TITLE_LIMIT">
            {{ title.length }}/{{ TITLE_LIMIT }}
          </small>
        </span>
        <input
          v-model="title"
          type="text"
          autocomplete="off"
          placeholder="Resumo curto do problema ou da tarefa"
          :disabled="busy"
        />
      </label>

      <label>
        <span>Descrição <small>Markdown</small></span>
        <textarea
          v-model="body"
          rows="9"
          maxlength="20000"
          placeholder="Contexto, passos para reproduzir, resultado esperado…"
          :disabled="busy"
        />
      </label>

      <p v-if="error" class="project-error" role="alert">{{ error }}</p>

      <footer>
        <small>Ctrl + Enter para salvar</small>
        <UiButton :disabled="busy" @click="emit('close')">Cancelar</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :disabled="!canSave"
          :busy="busy"
        >
          {{
            busy
              ? 'Salvando…'
              : mode === 'edit'
                ? 'Salvar alterações'
                : 'Criar issue'
          }}
        </UiButton>
      </footer>
    </form>
  </NModal>
</template>

<style scoped>
.git-issue-dialog {
  display: flex;
  width: 640px;
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

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label > span {
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
}

small {
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 500;
}

small[data-over='true'] {
  color: var(--danger-text, #f85149);
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

footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

footer small {
  margin-right: auto;
}
</style>
