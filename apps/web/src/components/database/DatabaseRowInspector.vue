<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  title: string;
  columns: string[];
  row: unknown[] | null;
  rowNumber: number | null;
}>();

const copied = ref('');

const fields = computed(() =>
  props.row
    ? props.columns.map((column, index) => ({
        name: column,
        value: props.row![index],
      }))
    : [],
);

function display(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

async function copyJson(): Promise<void> {
  const record = Object.fromEntries(
    fields.value.map((field) => [field.name, field.value ?? null]),
  );
  try {
    await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    copied.value = 'JSON copiado.';
  } catch {
    copied.value = 'Não foi possível copiar.';
  }
}

watch(
  () => props.row,
  () => {
    copied.value = '';
  },
);
</script>

<template>
  <aside class="database-inspector" aria-label="Inspetor de linha">
    <template v-if="row">
      <header>
        <h2>Linha {{ rowNumber }}</h2>
        <span class="database-inspector-badge">{{ title }}</span>
      </header>
      <dl>
        <div v-for="field in fields" :key="field.name">
          <dt>{{ field.name }}</dt>
          <dd :data-null="field.value === null || field.value === undefined">
            {{ display(field.value) }}
          </dd>
        </div>
      </dl>
      <div class="database-inspector-actions">
        <button type="button" @click="copyJson">Copiar JSON</button>
        <span v-if="copied" role="status">{{ copied }}</span>
      </div>
    </template>
    <p v-else class="database-inspector-empty">
      Selecione uma linha para ver os campos completos.
    </p>
  </aside>
</template>

<style scoped>
.database-inspector {
  display: flex;
  flex: 0 0 300px;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  border-left: 1px solid var(--border);
  background: var(--surface-1);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

h2 {
  margin: 0;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.database-inspector-badge {
  max-width: 160px;
  padding: 2px 10px;
  overflow: hidden;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
  font-family: var(--font-family-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

dl {
  margin: 0;
}

dl > div {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

dt {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 11px;
}

dd {
  margin: 2px 0 0;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}

dd[data-null='true'] {
  color: var(--text-dim);
  font-style: italic;
}

.database-inspector-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--success-text);
  font-size: 12px;
}

.database-inspector-actions button {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.database-inspector-actions button:hover {
  background: var(--surface-2);
}

.database-inspector-empty {
  margin: 0;
  color: var(--text-dim);
  font-size: 13px;
}

@media (max-width: 900px) {
  .database-inspector {
    flex-basis: auto;
    border-top: 1px solid var(--border);
    border-left: 0;
  }
}
</style>
