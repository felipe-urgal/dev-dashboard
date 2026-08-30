<script setup lang="ts">
import type { MachineDatabaseConnection } from '@dev-dashboard/contracts';

import type { SavedDatabaseConnection } from '../../composables/useDatabaseSavedConnections';

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
</script>

<template>
  <div v-if="open" class="database-modal-backdrop" @click.self="emit('close')">
    <section
      class="database-connection-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="database-connection-title"
    >
      <div class="database-modal-heading">
        <div>
          <span class="database-machine-eyebrow">Conexão local</span>
          <h2 id="database-connection-title">Conectar a um serviço</h2>
          <p>As credenciais são usadas somente nesta sessão.</p>
        </div>
        <button type="button" aria-label="Fechar" @click="emit('close')">
          ×
        </button>
      </div>
      <div class="database-connection-form">
        <div v-if="savedConnections.length" class="database-saved-connections">
          <label for="database-saved-connection">Conexão salva</label>
          <div class="database-saved-connection-control">
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
            <button
              v-if="selectedSavedConnectionId"
              type="button"
              class="database-saved-remove"
              @click="emit('remove-saved', selectedSavedConnectionId)"
            >
              Remover
            </button>
          </div>
        </div>
        <label
          >Banco<select
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
            placeholder="ex.: felipe, root ou postgres"
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
          >Banco (opcional)<input
            :value="draft.database ?? ''"
            placeholder="Vazio lista todos"
            autocomplete="off"
            @input="updateDraft({ database: inputValue($event) })"
        /></label>
      </div>
      <p v-if="error" class="database-machine-details-error" role="alert">
        {{ error }}
      </p>
      <p v-if="testMessage" class="database-machine-success" role="status">
        {{ testMessage }}
      </p>
      <div class="database-modal-actions">
        <button type="button" @click="emit('close')">Cancelar</button>
        <button type="button" :disabled="loading" @click="emit('save')">
          Salvar sem senha
        </button>
        <button type="button" :disabled="loading" @click="emit('test')">
          {{ loading ? 'Testando…' : 'Testar conexão' }}</button
        ><button
          type="button"
          class="database-primary-button"
          :disabled="loading"
          @click="emit('connect')"
        >
          {{ loading ? 'Conectando…' : 'Conectar e continuar' }}
        </button>
      </div>
    </section>
  </div>
</template>
