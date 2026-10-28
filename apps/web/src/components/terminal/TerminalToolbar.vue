<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import { TERMINAL_FONT_SIZE } from '../../utils/terminal-preferences';
import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

defineProps<{
  title: string;
  state: 'connecting' | 'connected' | 'closed';
  /** Pasta do projeto, abreviada (ex.: ~/Projetos/app). */
  location: string;
  kindLabel: string;
  maximized: boolean;
  fontSize: number;
  copyShortcut: string;
  searchOpen: boolean;
}>();

const emit = defineEmits<{
  copy: [];
  clear: [];
  search: [];
  restart: [];
  close: [];
  'toggle-maximized': [];
  'set-font-size': [size: number];
}>();

const fontMenuOpen = ref(false);
const fontMenu = ref<HTMLElement | null>(null);

function closeOnOutsideClick(event: MouseEvent): void {
  if (fontMenu.value && !fontMenu.value.contains(event.target as Node)) {
    fontMenuOpen.value = false;
  }
}

onMounted(() => window.addEventListener('click', closeOnOutsideClick));
onBeforeUnmount(() => window.removeEventListener('click', closeOnOutsideClick));

const stateLabel = {
  connecting: 'Conectando',
  connected: 'Conectado',
  closed: 'Encerrada',
} as const;
</script>

<template>
  <div class="terminal-toolbar">
    <span class="terminal-toolbar-dot" :data-state="state" aria-hidden="true" />
    <strong>{{ title }}</strong>
    <span class="terminal-toolbar-state">{{ stateLabel[state] }}</span>
    <UiTag mono :title="location">{{ location }}</UiTag>
    <UiTag mono>{{ kindLabel }}</UiTag>

    <span class="terminal-toolbar-spacer" />

    <UiButton
      icon
      size="sm"
      variant="ghost"
      :title="`Copiar seleção (${copyShortcut})`"
      aria-label="Copiar seleção"
      @click="emit('copy')"
    >
      <ClipboardDocumentIcon aria-hidden="true" />
    </UiButton>
    <UiButton
      icon
      size="sm"
      variant="ghost"
      :class="{ 'terminal-toolbar-active': searchOpen }"
      title="Buscar no histórico (Ctrl+F)"
      aria-label="Buscar no histórico"
      :aria-pressed="searchOpen"
      @click="emit('search')"
    >
      <MagnifyingGlassIcon aria-hidden="true" />
    </UiButton>
    <UiButton
      icon
      size="sm"
      variant="ghost"
      title="Limpar tela"
      aria-label="Limpar tela"
      @click="emit('clear')"
    >
      <TrashIcon aria-hidden="true" />
    </UiButton>

    <span ref="fontMenu" class="terminal-toolbar-font">
      <UiButton
        icon
        size="sm"
        variant="ghost"
        title="Tamanho da fonte"
        aria-label="Tamanho da fonte"
        aria-haspopup="true"
        :aria-expanded="fontMenuOpen"
        @click="fontMenuOpen = !fontMenuOpen"
      >
        <span class="terminal-toolbar-aa">Aa</span>
      </UiButton>
      <div v-if="fontMenuOpen" class="terminal-toolbar-popover" role="group">
        <span>Tamanho</span>
        <span class="terminal-toolbar-stepper">
          <button
            type="button"
            aria-label="Diminuir fonte"
            :disabled="fontSize <= TERMINAL_FONT_SIZE.min"
            @click="emit('set-font-size', fontSize - 1)"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Aumentar fonte"
            :disabled="fontSize >= TERMINAL_FONT_SIZE.max"
            @click="emit('set-font-size', fontSize + 1)"
          >
            +
          </button>
        </span>
        <small>{{ fontSize }}px · salvo neste navegador</small>
      </div>
    </span>

    <UiButton
      icon
      size="sm"
      variant="ghost"
      title="Reiniciar sessão"
      aria-label="Reiniciar sessão"
      @click="emit('restart')"
    >
      <ArrowPathIcon aria-hidden="true" />
    </UiButton>
    <UiButton
      icon
      size="sm"
      variant="ghost"
      :title="maximized ? 'Restaurar' : 'Tela cheia'"
      :aria-label="maximized ? 'Restaurar' : 'Tela cheia'"
      @click="emit('toggle-maximized')"
    >
      <component
        :is="maximized ? ArrowsPointingInIcon : ArrowsPointingOutIcon"
        aria-hidden="true"
      />
    </UiButton>
    <UiButton
      icon
      size="sm"
      variant="ghost"
      class="terminal-toolbar-close"
      title="Encerrar sessão"
      aria-label="Encerrar sessão"
      @click="emit('close')"
    >
      <XMarkIcon aria-hidden="true" />
    </UiButton>
  </div>
</template>

<style scoped>
.terminal-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.terminal-toolbar-state {
  color: var(--text-dim);
  font-size: 12px;
}

.terminal-toolbar-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border-strong);
}

.terminal-toolbar-dot[data-state='connected'] {
  background: var(--success-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-text) 22%, transparent);
}

.terminal-toolbar-dot[data-state='connecting'] {
  background: var(--warning-text);
}

.terminal-toolbar-dot[data-state='closed'] {
  background: var(--danger-text);
}

.terminal-toolbar-spacer {
  flex: 1 1 0;
}

.terminal-toolbar-aa {
  font-size: 13px;
  font-weight: 700;
}

.terminal-toolbar-font {
  position: relative;
}

.terminal-toolbar-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  width: 200px;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--surface-1);
  box-shadow: 0 16px 40px rgb(0 0 0 / 40%);
  font-size: 13px;
}

.terminal-toolbar-popover small {
  grid-column: 1 / -1;
  color: var(--text-dim);
}

.terminal-toolbar-stepper {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.terminal-toolbar-stepper button {
  width: 32px;
  height: 30px;
  border: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.terminal-toolbar-stepper button:hover:not(:disabled) {
  background: var(--surface-2);
}

.terminal-toolbar-stepper button:disabled {
  color: var(--text-dim);
  cursor: default;
}

.terminal-toolbar-active {
  color: var(--accent);
  background: var(--accent-soft);
}

.terminal-toolbar-close {
  color: var(--danger-text);
}
</style>
