<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronRightIcon } from '@heroicons/vue/24/outline';

import UiButton from '../ui/UiButton.vue';
import UiSearchField from '../ui/UiSearchField.vue';

const props = defineProps<{
  files: readonly string[];
  /** Arquivos com falha na última execução (marcados em vermelho). */
  failedFiles?: readonly string[];
  loading: boolean;
  error: string;
  disabled: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

const selected = defineModel<string[]>('selected', { required: true });

/** Acima disso, as pastas começam recolhidas para a lista não ocupar a tela. */
const COLLAPSE_THRESHOLD = 60;

const query = ref('');
const expanded = ref<Set<string>>(new Set());

interface Group {
  dir: string;
  files: string[];
}

const needle = computed(() => query.value.trim().toLowerCase());

const visibleFiles = computed(() =>
  needle.value
    ? props.files.filter((file) => file.toLowerCase().includes(needle.value))
    : [...props.files],
);

const groups = computed<Group[]>(() => {
  const byDir = new Map<string, string[]>();
  for (const file of visibleFiles.value) {
    const slash = file.lastIndexOf('/');
    const dir = slash >= 0 ? file.slice(0, slash) : '.';
    const list = byDir.get(dir);
    if (list) list.push(file);
    else byDir.set(dir, [file]);
  }
  return [...byDir.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dir, files]) => ({ dir, files }));
});

const selectedSet = computed(() => new Set(selected.value));
const failedSet = computed(() => new Set(props.failedFiles ?? []));

function isOpen(dir: string): boolean {
  return needle.value !== '' || expanded.value.has(dir);
}

function toggleOpen(dir: string): void {
  const next = new Set(expanded.value);
  if (next.has(dir)) next.delete(dir);
  else next.add(dir);
  expanded.value = next;
}

function groupSelectedCount(group: Group): number {
  return group.files.filter((file) => selectedSet.value.has(file)).length;
}

function toggleFile(file: string): void {
  const next = new Set(selected.value);
  if (next.has(file)) next.delete(file);
  else next.add(file);
  selected.value = [...next];
}

function toggleGroup(group: Group): void {
  const next = new Set(selected.value);
  const allSelected = groupSelectedCount(group) === group.files.length;
  for (const file of group.files) {
    if (allSelected) next.delete(file);
    else next.add(file);
  }
  selected.value = [...next];
}

function selectVisible(): void {
  selected.value = [...new Set([...selected.value, ...visibleFiles.value])];
}

function clearSelection(): void {
  selected.value = [];
}

function baseName(file: string): string {
  return file.slice(file.lastIndexOf('/') + 1);
}

watch(
  () => props.files,
  (files) => {
    query.value = '';
    expanded.value =
      files.length <= COLLAPSE_THRESHOLD
        ? new Set(files.map((file) => dirOf(file)))
        : new Set();
  },
  { immediate: true },
);

function dirOf(file: string): string {
  const slash = file.lastIndexOf('/');
  return slash >= 0 ? file.slice(0, slash) : '.';
}
</script>

<template>
  <aside class="test-picker" aria-label="Arquivos de teste">
    <header>
      <strong>Arquivos</strong>
      <span class="test-picker-count">
        {{ selected.length }} de {{ files.length }} selecionados
      </span>
    </header>

    <UiSearchField
      v-model="query"
      label="Buscar arquivo de teste"
      placeholder="Buscar arquivo ou pasta"
    />

    <div class="test-picker-actions">
      <UiButton
        size="sm"
        :disabled="disabled || visibleFiles.length === 0"
        @click="selectVisible"
      >
        {{ needle ? 'Selecionar resultados' : 'Selecionar todos' }}
      </UiButton>
      <UiButton
        size="sm"
        variant="ghost"
        :disabled="disabled || selected.length === 0"
        @click="clearSelection"
      >
        Limpar
      </UiButton>
    </div>

    <p v-if="loading" class="test-picker-note">Listando arquivos…</p>
    <div v-else-if="error" class="test-picker-note is-error" role="alert">
      <span>{{ error }}</span>
      <UiButton size="sm" @click="emit('retry')">Tentar novamente</UiButton>
    </div>
    <p v-else-if="files.length === 0" class="test-picker-note">
      Nenhum arquivo de teste encontrado.
    </p>
    <p v-else-if="groups.length === 0" class="test-picker-note">
      Nenhum arquivo corresponde à busca.
    </p>

    <div v-else class="test-picker-list">
      <section v-for="group in groups" :key="group.dir" class="test-group">
        <div class="test-group-head">
          <button
            type="button"
            class="test-group-toggle"
            :aria-expanded="isOpen(group.dir)"
            :aria-label="`${isOpen(group.dir) ? 'Recolher' : 'Expandir'} ${group.dir}`"
            @click="toggleOpen(group.dir)"
          >
            <ChevronRightIcon
              :data-open="isOpen(group.dir)"
              aria-hidden="true"
            />
          </button>
          <label>
            <input
              type="checkbox"
              :checked="groupSelectedCount(group) === group.files.length"
              :indeterminate="
                groupSelectedCount(group) > 0 &&
                groupSelectedCount(group) < group.files.length
              "
              :disabled="disabled"
              @change="toggleGroup(group)"
            />
            <span class="test-group-name" :title="group.dir">{{
              group.dir
            }}</span>
            <small>{{ group.files.length }}</small>
          </label>
        </div>

        <ul v-if="isOpen(group.dir)">
          <li v-for="file in group.files" :key="file">
            <label
              :title="file"
              :data-failed="failedSet.has(file) || undefined"
            >
              <input
                type="checkbox"
                :checked="selectedSet.has(file)"
                :disabled="disabled"
                @change="toggleFile(file)"
              />
              <span>{{ baseName(file) }}</span>
            </label>
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.test-picker {
  display: flex;
  min-width: 0;
  max-height: calc(100vh - var(--app-topbar-height, 72px) - 120px);
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.test-picker header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.test-picker-count {
  color: var(--text-dim);
  font-size: 12px;
}

.test-picker-actions {
  display: flex;
  gap: 6px;
}

.test-picker-note {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.test-picker-note.is-error {
  color: var(--danger-text, #f85149);
}

.test-picker-list {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  margin: 0 -6px;
  padding: 0 6px;
}

.test-group-head {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 0;
}

.test-group-toggle {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  color: var(--text-dim);
  background: transparent;
  cursor: pointer;
}

.test-group-toggle:hover {
  background: var(--surface-2);
}

.test-group-toggle svg {
  width: 14px;
  height: 14px;
  transition: transform 150ms ease;
}

.test-group-toggle svg[data-open='true'] {
  transform: rotate(90deg);
}

.test-group label,
.test-group-head label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.test-group-head label {
  flex: 1;
  font-weight: 600;
  font-size: 12.5px;
}

.test-group-name {
  overflow: hidden;
  font-family: var(--font-family-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-group-head small {
  margin-left: auto;
  color: var(--text-dim);
  font-weight: 500;
}

.test-group ul {
  margin: 0 0 4px;
  padding: 0 0 0 24px;
  list-style: none;
}

.test-group li label {
  padding: 3px 4px;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 12.5px;
}

.test-group li label:hover {
  background: var(--surface-2);
}

.test-group li label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-group li label[data-failed] span {
  color: var(--danger-text, #f85149);
}

.test-group li label[data-failed] span::before {
  content: '✗ ';
}

.test-picker input[type='checkbox'] {
  accent-color: var(--accent);
}
</style>
