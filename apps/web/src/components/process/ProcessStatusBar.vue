<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NDropdown } from 'naive-ui';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type { ManagedProcessStatus } from '@dev-dashboard/contracts';

import type { ProcessAction } from '../../composables/useProcessControls';
import UiButton from '../ui/UiButton.vue';

const props = withDefaults(
  defineProps<{
    status: ManagedProcessStatus;
    statusLabel: string;
    /** Texto secundário ao lado do status, ex.: "há 2m 10s · PID 1234". */
    statusNote: string;
    /** Rótulos curtos ao lado do status (porta, ambiente, comando…). */
    chips: string[];
    /** URLs de acesso (localhost e endereços da rede), a primeira é a padrão. */
    urls?: string[];
    action: ProcessAction | null;
    startDisabled?: boolean;
    /** Só alguns processos reiniciam num passo (servidor e Sidekiq). */
    canRestart?: boolean;
    /** Texto do botão de iniciar, ex.: "Iniciar Sidekiq". */
    startLabel?: string;
    /** Mostra a engrenagem de configuração. */
    configurable?: boolean;
    settingsDisabled?: boolean;
  }>(),
  {
    urls: () => [],
    startDisabled: false,
    canRestart: true,
    startLabel: 'Iniciar',
    configurable: false,
    settingsDisabled: false,
  },
);

const emit = defineEmits<{
  start: [];
  stop: [];
  restart: [];
  configure: [];
}>();

const selectedUrl = ref(props.urls[0] ?? '');
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.urls,
  (urls) => {
    if (!urls.includes(selectedUrl.value)) selectedUrl.value = urls[0] ?? '';
  },
);

const urlOptions = computed(() =>
  props.urls.map((url) => ({
    key: url,
    label: `${url}${isLocalhost(url) ? '' : '  · rede'}`,
  })),
);

function isLocalhost(url: string): boolean {
  return new URL(url).hostname === 'localhost';
}

async function copyUrl(): Promise<void> {
  if (!selectedUrl.value || !navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(selectedUrl.value);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 2000);
  } catch {
    copied.value = false;
  }
}

/** Rótulo do botão desabilitado enquanto uma transição está em andamento. */
const pendingLabel = computed(() => {
  if (props.action === 'restart') return 'Reiniciando…';
  if (props.action === 'stop' || props.status === 'stopping') return 'Parando…';
  if (props.action === 'start' || props.status === 'starting') {
    return 'Iniciando…';
  }
  return '';
});

const tone = computed(() =>
  props.status === 'running'
    ? 'running'
    : props.status === 'failed'
      ? 'failed'
      : props.status === 'starting' || props.status === 'stopping'
        ? 'pending'
        : 'stopped',
);
</script>

<template>
  <section class="process-bar" aria-label="Resumo do servidor">
    <div class="process-bar-state" :data-tone="tone">
      <span class="process-bar-led" aria-hidden="true" />
      <div>
        <strong>{{ statusLabel }}</strong>
        <small v-if="statusNote">{{ statusNote }}</small>
      </div>
    </div>

    <div class="process-bar-meta">
      <span
        v-for="chip in chips"
        :key="chip"
        class="process-bar-chip"
        :title="chip"
      >
        {{ chip }}
      </span>
    </div>

    <div v-if="selectedUrl && status === 'running'" class="process-bar-url">
      <a
        :href="selectedUrl"
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir aplicação"
      >
        {{ selectedUrl }}
      </a>
      <NDropdown
        v-if="urls.length > 1"
        trigger="click"
        placement="bottom-end"
        :options="urlOptions"
        @select="(key: string) => (selectedUrl = key)"
      >
        <UiButton
          icon
          size="sm"
          variant="ghost"
          aria-label="Escolher endereço de acesso"
          aria-haspopup="menu"
        >
          <ChevronDownIcon aria-hidden="true" />
        </UiButton>
      </NDropdown>
      <UiButton
        icon
        size="sm"
        variant="ghost"
        :aria-label="copied ? 'URL copiada' : 'Copiar URL'"
        :title="copied ? 'URL copiada' : 'Copiar URL'"
        @click="copyUrl"
      >
        <ClipboardDocumentIcon aria-hidden="true" />
      </UiButton>
      <a
        class="process-bar-open"
        :href="selectedUrl"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir aplicação"
        title="Abrir aplicação"
      >
        <ArrowTopRightOnSquareIcon aria-hidden="true" />
      </a>
    </div>

    <span class="process-bar-spacer" />

    <UiButton v-if="pendingLabel" busy disabled>{{ pendingLabel }}</UiButton>
    <template v-else-if="status === 'running'">
      <UiButton v-if="canRestart" @click="emit('restart')">
        <ArrowPathIcon aria-hidden="true" />
        Reiniciar
      </UiButton>
      <UiButton variant="danger" @click="emit('stop')">
        <StopIcon aria-hidden="true" />
        Parar
      </UiButton>
    </template>
    <UiButton
      v-else
      variant="primary"
      :disabled="startDisabled"
      @click="emit('start')"
    >
      <PlayIcon aria-hidden="true" />
      {{ status === 'failed' ? 'Iniciar novamente' : startLabel }}
    </UiButton>

    <UiButton
      v-if="configurable"
      icon
      variant="ghost"
      aria-label="Configurar servidor"
      title="Configurar"
      :disabled="settingsDisabled"
      @click="emit('configure')"
    >
      <Cog6ToothIcon aria-hidden="true" />
    </UiButton>
  </section>
</template>

<style scoped>
.process-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 18px;
  padding: 14px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.process-bar-state {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.process-bar-state strong {
  font-size: 16px;
  letter-spacing: -0.01em;
}

.process-bar-state small {
  margin-left: 8px;
  color: var(--text-dim);
  font-size: 13px;
}

.process-bar-led {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--border-strong);
}

.process-bar-state[data-tone='running'] .process-bar-led {
  background: var(--success-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--success-text) 22%, transparent);
}

.process-bar-state[data-tone='failed'] .process-bar-led {
  background: var(--danger-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger-text) 22%, transparent);
}

.process-bar-state[data-tone='pending'] .process-bar-led {
  background: var(--warning-text);
}

/* Rótulos curtos; os longos (comando) cortam com reticências. */
.process-bar-chip {
  display: block;
  max-width: 320px;
  padding: 2px 10px;
  overflow: hidden;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-3);
  font-family: var(--font-family-mono);
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-bar-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.process-bar-url {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 2px;
  padding: 0 4px 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
}

.process-bar-url > a:first-child {
  overflow: hidden;
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 13px;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-bar-url > a:first-child:hover {
  text-decoration: underline;
}

.process-bar-open {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  color: var(--text-muted);
}

.process-bar-open:hover {
  color: var(--text);
  background: var(--surface-2);
}

.process-bar-open svg {
  width: 16px;
  height: 16px;
}

.process-bar-spacer {
  flex: 1 1 0;
}
</style>
