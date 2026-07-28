<script setup lang="ts">
import { BellIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { noticeCenterStore, type Notice, type NoticeOrigin, type NoticeOutcome } from '../stores/notice-center';

const router = useRouter();
const root = ref<HTMLElement>();
const bellButton = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const open = ref(false);

const { notices, unreadCount, markRead, dismiss, clearAll } = noticeCenterStore;

const bellLabel = computed(() =>
  unreadCount.value === 0 ? 'Avisos' : `${unreadCount.value} aviso(s) não lido(s)`,
);

const originLabels: Record<NoticeOrigin, string> = {
  test: 'Testes',
  script: 'Script',
  server: 'Servidor',
};

const outcomeLabels: Record<NoticeOutcome, string> = {
  succeeded: 'concluíram com sucesso',
  failed: 'falharam',
  cancelled: 'foram cancelados',
  stopped: 'foram interrompidos',
};

function noticeText(notice: Notice): string {
  const origem = originLabels[notice.origin];
  const desfecho = outcomeLabels[notice.outcome];
  return `${origem} de ${notice.projectName} ${desfecho} — ${notice.label}`;
}

function toggle(): void {
  if (open.value) {
    close({ restoreFocus: false });
    return;
  }
  open.value = true;
  void nextTick(() => {
    panel.value?.focus();
  });
}

function close(options: { restoreFocus?: boolean } = {}): void {
  if (!open.value) return;
  open.value = false;
  if (options.restoreFocus ?? true) {
    bellButton.value?.focus();
  }
}

function selectNotice(notice: Notice): void {
  markRead(notice.id);
  close();
  void router.push(notice.routeTo);
}

function dismissNotice(notice: Notice): void {
  dismiss(notice.id);
}

function handleDocumentClick(event: MouseEvent): void {
  if (!open.value) return;
  const target = event.target as Node;
  if (root.value && !root.value.contains(target)) {
    close();
  }
}

function handlePanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentClick);
});
</script>

<template>
  <div ref="root" class="notice-center">
    <button
      ref="bellButton"
      type="button"
      class="notice-bell-button"
      :aria-label="bellLabel"
      :aria-expanded="open"
      @click="toggle"
    >
      <BellIcon aria-hidden="true" />
      <span v-if="unreadCount > 0" class="notice-badge">{{ unreadCount }}</span>
    </button>

    <div
      v-if="open"
      ref="panel"
      class="notice-panel"
      tabindex="-1"
      @keydown="handlePanelKeydown"
    >
      <aside aria-live="polite" role="status" class="notice-panel-body">
        <p v-if="notices.length === 0" class="notice-empty">Nenhum aviso no momento.</p>
        <ul v-else role="list" class="notice-list">
          <li v-for="notice in notices" :key="notice.id" class="notice-item" :class="{ 'notice-item-unread': !notice.read }">
            <button type="button" class="notice-item-body" @click="selectNotice(notice)">
              {{ noticeText(notice) }}
            </button>
            <button
              type="button"
              class="notice-item-dismiss"
              aria-label="Descartar aviso"
              @click="dismissNotice(notice)"
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </li>
        </ul>
      </aside>

      <footer class="notice-panel-footer">
        <button
          type="button"
          class="secondary-button"
          aria-label="Limpar todos os avisos"
          :disabled="notices.length === 0"
          @click="clearAll"
        >
          Limpar tudo
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.notice-center {
  position: relative;
}

.notice-bell-button {
  position: relative;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}

.notice-bell-button:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.notice-bell-button > svg {
  width: 18px;
  height: 18px;
}

.notice-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--danger-text);
  color: var(--surface-0);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.notice-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  width: 320px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}

.notice-panel-body {
  max-height: 320px;
  overflow-y: auto;
}

.notice-empty {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-muted);
  font-size: var(--font-md);
}

.notice-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-item {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.notice-item:last-child {
  border-bottom: none;
}

.notice-item-unread {
  background: var(--accent-soft);
}

.notice-item-body {
  flex: 1;
  padding: var(--space-3);
  border: none;
  background: transparent;
  color: var(--text);
  font-size: var(--font-md);
  text-align: left;
  cursor: pointer;
}

.notice-item-body:hover {
  background: var(--surface-3);
}

.notice-item-dismiss {
  display: grid;
  place-items: center;
  width: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.notice-item-dismiss:hover {
  color: var(--text);
}

.notice-item-dismiss > svg {
  width: 14px;
  height: 14px;
}

.notice-panel-footer {
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}
</style>
