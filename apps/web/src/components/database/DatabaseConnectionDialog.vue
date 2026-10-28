<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

import type { SavedDatabaseConnection } from '../../composables/useDatabaseSavedConnections';
import UiButton from '../ui/UiButton.vue';

const props = defineProps<{
  open: boolean;
  draft: MachineDatabaseConnection;
  savedConnections: SavedDatabaseConnection[];
  selectedSavedConnectionId: string;
  loading: boolean;
  error: string;
  testMessage: string;
}>();

const emit = defineEmits<{
  close: [];
  'update:draft': [draft: MachineDatabaseConnection];
  'update-driver': [driver: MachineDatabaseConnection['driver']];
  'select-saved': [id: string];
  'remove-saved': [id: string];
  save: [];
  test: [];
  connect: [];
}>();

const dialog = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function updateDraft(patch: Partial<MachineDatabaseConnection>): void {
  emit('update:draft', { ...props.draft, ...patch });
}

function updatePort(event: Event): void {
  const value = inputValue(event);
  const draft = { ...props.draft };
  if (value) draft.port = Number(value);
  else delete draft.port;
  emit('update:draft', draft);
}

function focusableElements(): HTMLElement[] {
  return [
    ...(dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []),
  ];
}

function focusDialogStart(): void {
  const initial = dialog.value?.querySelector<HTMLElement>(
    '[data-dialog-initial-focus]',
  );
  (initial ?? focusableElements()[0] ?? dialog.value)?.focus();
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = focusableElements();
  if (!focusable.length) {
    event.preventDefault();
    dialog.value?.focus();
    return;
  }

  const active = document.activeElement as HTMLElement | null;
  const index = active ? focusable.indexOf(active) : -1;

  if (event.shiftKey && index <= 0) {
    event.preventDefault();
    focusable.at(-1)?.focus();
  } else if (!event.shiftKey && index === focusable.length - 1) {
    event.preventDefault();
    focusable[0]?.focus();
  }
}

watch(
  () => props.open,
  (open, wasOpen) => {
    if (open && !wasOpen) {
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      void nextTick(focusDialogStart);
      return;
    }

    if (!open && wasOpen) {
      const focusToRestore = previousFocus;
      previousFocus = null;
      void nextTick(() => focusToRestore?.focus());
    }
  },
);

onBeforeUnmount(() => {
  if (props.open) previousFocus?.focus();
});
</script>

<template>
  <div v-if="open" class="database-modal-backdrop" @click.self="emit('close')">
    <section
      ref="dialog"
      class="database-connection-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="database-connection-title"
      :aria-busy="loading"
      tabindex="-1"
      @keydown="handleDialogKeydown"
    >
      <header>
        <div>
          <span class="database-connection-eyebrow">Conexão local</span>
          <h2 id="database-connection-title">Conectar a um serviço</h2>
          <p>As credenciais são usadas somente nesta sessão.</p>
        </div>
        <UiButton
          icon
          variant="ghost"
          aria-label="Fechar"
          @click="emit('close')"
          >×</UiButton
        >
      </header>
      <div class="database-connection-form">
        <div v-if="savedConnections.length" class="database-connection-wide">
          <label for="database-saved-connection">Conexão salva</label>
          <div class="database-connection-saved">
            <select
              id="database-saved-connection"
              :value="selectedSavedConnectionId"
              @change="emit('select-saved', selectValue($event))"
            >
              <option value="">Selecione uma conexão</option>
              <option
                v-for="saved in savedConnections"
                :key="saved.id"
                :value="saved.id"
              >
                {{ saved.label }}
              </option>
            </select>
            <UiButton
              v-if="selectedSavedConnectionId"
              @click="emit('remove-saved', selectedSavedConnectionId)"
            >
              Remover
            </UiButton>
          </div>
        </div>
        <label
          >Banco<select
            data-dialog-initial-focus
            :value="draft.driver"
            @change="
              emit(
                'update-driver',
                selectValue($event) as MachineDatabaseConnection['driver'],
              )
            "
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="mariadb">MariaDB</option>
            <option value="redis">Redis</option>
          </select></label
        >
        <label
          >Host<input
            :value="draft.host ?? ''"
            autocomplete="off"
            @input="updateDraft({ host: inputValue($event) })"
        /></label>
        <label
          >Porta<input
            :value="draft.port ?? ''"
            type="number"
            min="1"
            max="65535"
            @input="updatePort"
        /></label>
        <label
          >Usuário<input
            :value="draft.username ?? ''"
            :placeholder="
              draft.driver === 'redis'
                ? 'Opcional (ACL do Redis)'
                : 'ex.: felipe, root ou postgres'
            "
            autocomplete="off"
            @input="updateDraft({ username: inputValue($event) })"
        /></label>
        <label
          >Senha<input
            :value="draft.password ?? ''"
            type="password"
            autocomplete="new-password"
            @input="updateDraft({ password: inputValue($event) })"
        /></label>
        <label
          >{{
            draft.driver === 'redis' ? 'Banco lógico' : 'Banco'
          }}
          (opcional)<input
            :value="draft.database ?? ''"
            :placeholder="
              draft.driver === 'redis' ? 'db0' : 'Vazio lista todos'
            "
            autocomplete="off"
            @input="updateDraft({ database: inputValue($event) })"
        /></label>
      </div>
      <p v-if="error" class="database-connection-error" role="alert">
        {{ error }}
      </p>
      <p
        v-if="testMessage"
        class="database-connection-success"
        role="status"
        aria-live="polite"
      >
        {{ testMessage }}
      </p>
      <footer>
        <UiButton @click="emit('close')">Cancelar</UiButton>
        <UiButton :disabled="loading" @click="emit('save')">
          Salvar sem senha
        </UiButton>
        <UiButton :disabled="loading" @click="emit('test')">
          {{ loading ? 'Testando…' : 'Testar conexão' }}
        </UiButton>
        <UiButton
          variant="primary"
          :busy="loading"
          :disabled="loading"
          @click="emit('connect')"
        >
          {{ loading ? 'Conectando…' : 'Conectar' }}
        </UiButton>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.database-modal-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 55%);
}

.database-connection-modal {
  display: grid;
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  gap: 16px;
  padding: 22px;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--surface-1);
  box-shadow: var(--shadow-2);
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

header h2 {
  margin: 2px 0 4px;
  font-size: 18px;
}

header p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.database-connection-eyebrow {
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.database-connection-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.database-connection-form label {
  display: grid;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.database-connection-wide {
  grid-column: 1 / -1;
}

input,
select {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 14px;
}

input:focus-visible,
select:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.database-connection-saved {
  display: flex;
  gap: 8px;
}

.database-connection-saved select {
  flex: 1;
}

footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.database-connection-error,
.database-connection-success {
  margin: 0;
  font-size: 13px;
}

.database-connection-error {
  color: var(--danger-text);
}

.database-connection-success {
  color: var(--success-text);
}

@media (max-width: 560px) {
  .database-connection-form {
    grid-template-columns: 1fr;
  }
}
</style>
