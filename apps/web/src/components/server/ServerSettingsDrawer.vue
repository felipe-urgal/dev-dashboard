<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';

import UiButton from '../ui/UiButton.vue';

defineProps<{
  /** Projetos Node escolhem um `.env.*`; Rails usa sempre `development`. */
  selectableEnvironment: boolean;
  availableEnvironments: string[];
  environmentLabel: string;
  commandLabel: string;
  loading: boolean;
  saving: boolean;
  busy: boolean;
  errorMessage: string;
}>();

const port = defineModel<string | number>('port', { required: true });
const environment = defineModel<string>('environment', { required: true });

const emit = defineEmits<{ save: []; close: [] }>();

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div class="server-drawer-scrim" @click.self="emit('close')">
    <aside
      class="server-settings-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-settings-title"
    >
      <header>
        <div>
          <h3 id="server-settings-title">Configurar servidor</h3>
          <p>Porta, ambiente e comando detectado.</p>
        </div>
        <UiButton
          icon
          variant="ghost"
          aria-label="Fechar configurações"
          :disabled="saving"
          @click="emit('close')"
        >
          <XMarkIcon aria-hidden="true" />
        </UiButton>
      </header>

      <label class="server-drawer-field">
        <span>Porta</span>
        <input
          v-model="port"
          class="server-port-input"
          type="number"
          min="1024"
          max="65535"
          inputmode="numeric"
          placeholder="Automática"
          :disabled="loading || busy"
        />
        <small
          >Deixe em branco para usar uma porta disponível (1024–65535).</small
        >
      </label>

      <label class="server-drawer-field">
        <span>Ambiente</span>
        <select
          v-if="selectableEnvironment && availableEnvironments.length > 0"
          v-model="environment"
          class="server-environment-select"
          :disabled="loading || busy"
        >
          <option value="">Padrão (.env / .env.local)</option>
          <option
            v-for="name in availableEnvironments"
            :key="name"
            :value="name"
          >
            {{ `.env.${name}` }}
          </option>
        </select>
        <output v-else>{{ environmentLabel }}</output>
        <small>Usa os arquivos .env e .env.local existentes.</small>
      </label>

      <div class="server-drawer-field">
        <span>Comando detectado</span>
        <output class="server-drawer-code">{{ commandLabel }}</output>
        <small>Somente leitura.</small>
      </div>

      <p v-if="errorMessage" class="server-drawer-error" role="alert">
        {{ errorMessage }}
      </p>

      <footer>
        <UiButton :disabled="saving" @click="emit('close')">Cancelar</UiButton>
        <UiButton
          variant="primary"
          :busy="saving"
          :disabled="saving || loading || busy"
          @click="emit('save')"
        >
          {{ saving ? 'Salvando…' : 'Salvar' }}
        </UiButton>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.server-drawer-scrim {
  position: fixed;
  z-index: 100;
  inset: 0;
  background: rgb(0 0 0 / 45%);
}

.server-settings-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  width: min(400px, 100vw);
  flex-direction: column;
  border-left: 1px solid var(--border-strong);
  background: var(--surface-1);
  box-shadow: 0 16px 40px rgb(0 0 0 / 45%);
}

.server-settings-drawer > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 20px 12px;
}

h3 {
  margin: 0;
  font-size: 16px;
}

header p {
  margin: 2px 0 0;
  color: var(--text-dim);
  font-size: 13px;
}

.server-drawer-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 20px;
}

.server-drawer-field > span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.server-drawer-field input,
.server-drawer-field select,
.server-drawer-field output {
  display: flex;
  height: 38px;
  align-items: center;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
}

.server-drawer-field input:focus-visible,
.server-drawer-field select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.server-drawer-field output.server-drawer-code {
  height: auto;
  min-height: 38px;
  padding-block: 9px;
  color: var(--text-muted);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.server-drawer-field small {
  color: var(--text-dim);
  font-size: 12px;
}

.server-drawer-error {
  margin: 0 20px;
  color: var(--danger-text);
  font-size: 13px;
}

.server-settings-drawer > footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}
</style>
