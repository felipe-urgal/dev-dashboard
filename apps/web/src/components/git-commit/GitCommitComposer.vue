<script setup lang="ts">
import { computed } from 'vue';

import {
  COMMIT_MESSAGE_MAX,
  COMMIT_PREFIXES,
  COMMIT_SUBJECT_SOFT_LIMIT,
  activeCommitPrefix,
  applyCommitPrefix,
  joinCommitMessage,
  splitCommitMessage,
} from '../../utils/git-commit-scope';

const props = defineProps<{ busy: boolean }>();

/** Mensagem inteira: assunto, linha em branco e corpo. */
const message = defineModel<string>('message', { required: true });

const emit = defineEmits<{ submit: [] }>();

const parts = computed(() => splitCommitMessage(message.value));
const activePrefix = computed(() => activeCommitPrefix(parts.value.subject));
const subjectTooLong = computed(
  () => parts.value.subject.length > COMMIT_SUBJECT_SOFT_LIMIT,
);
const nearLimit = computed(
  () => message.value.length > COMMIT_MESSAGE_MAX - 50,
);

function setSubject(subject: string): void {
  message.value = joinCommitMessage(subject, parts.value.body);
}

function setBody(body: string): void {
  message.value = joinCommitMessage(parts.value.subject, body);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    emit('submit');
  }
}
</script>

<template>
  <div class="git-commit-composer">
    <div class="git-commit-prefixes" role="group" aria-label="Prefixo">
      <button
        v-for="prefix in COMMIT_PREFIXES"
        :key="prefix"
        type="button"
        :aria-pressed="activePrefix === prefix"
        :disabled="props.busy"
        @click="setSubject(applyCommitPrefix(parts.subject, prefix))"
      >
        {{ prefix }}:
      </button>
    </div>

    <label class="git-commit-field">
      <span>
        Assunto
        <small :data-warn="subjectTooLong || undefined">
          {{ parts.subject.length }}/{{ COMMIT_SUBJECT_SOFT_LIMIT }}
        </small>
      </span>
      <input
        :value="parts.subject"
        type="text"
        maxlength="200"
        placeholder="Resuma a mudança em uma linha"
        aria-label="Mensagem do commit"
        :disabled="props.busy"
        @input="setSubject(($event.target as HTMLInputElement).value)"
        @keydown="handleKeydown"
      />
    </label>

    <label class="git-commit-field">
      <span>
        Corpo <em>(opcional)</em>
        <small :data-warn="nearLimit || undefined">
          {{ message.length }}/{{ COMMIT_MESSAGE_MAX }}
        </small>
      </span>
      <textarea
        :value="parts.body"
        :maxlength="COMMIT_MESSAGE_MAX"
        placeholder="Explique o porquê, não o quê."
        aria-label="Corpo do commit"
        :disabled="props.busy"
        @input="setBody(($event.target as HTMLTextAreaElement).value)"
        @keydown="handleKeydown"
      />
    </label>
  </div>
</template>

<style scoped>
.git-commit-composer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.git-commit-prefixes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.git-commit-prefixes button {
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-muted);
  background: transparent;
  font-family: var(--font-family-mono);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.git-commit-prefixes button[aria-pressed='true'] {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-commit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.git-commit-field > span {
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.git-commit-field em {
  margin-left: 4px;
  color: var(--text-dim);
  font-style: normal;
  font-weight: 500;
}

.git-commit-field small {
  margin-left: auto;
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
  font-weight: 500;
}

.git-commit-field small[data-warn] {
  color: var(--warning-text);
}

.git-commit-field input,
.git-commit-field textarea {
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  outline: none;
}

.git-commit-field input {
  height: 42px;
  padding: 0 12px;
  font-size: 14px;
}

.git-commit-field textarea {
  min-height: 92px;
  padding: 10px 12px;
  font-size: 13.5px;
  line-height: 1.5;
  resize: vertical;
}

.git-commit-field input:focus,
.git-commit-field textarea:focus {
  border-color: var(--accent);
}
</style>
