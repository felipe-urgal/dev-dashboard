<script setup lang="ts">
import {
  BellIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PauseCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';
import { useRouter } from 'vue-router';

import {
  noticeCenterStore,
  type Notice,
  type NoticeOrigin,
  type NoticeOutcome,
} from '../stores/notice-center';

const router = useRouter();
const root = ref<HTMLElement>();
const bellButton = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const open = ref(false);
const now = ref(Date.now());
let relativeTimeTimer: number | undefined;

const {
  notices,
  unreadCount,
  markRead,
  markAllRead,
  dismiss,
  clearAll,
} = noticeCenterStore;

const bellLabel = computed(() =>
  unreadCount.value === 0 ? 'Notificações' : `${unreadCount.value} notificação(ões) não lida(s)`,
);

const originLabels: Record<NoticeOrigin, string> = {
  test: 'Testes',
  script: 'Script',
  server: 'Servidor',
};

const noticeTitles: Record<NoticeOrigin, Record<NoticeOutcome, string>> = {
  test: {
    succeeded: 'Testes concluídos com sucesso',
    failed: 'Testes concluídos com falhas',
    cancelled: 'Testes cancelados',
    stopped: 'Testes interrompidos',
  },
  script: {
    succeeded: 'Script concluído com sucesso',
    failed: 'Script terminou com falha',
    cancelled: 'Script cancelado',
    stopped: 'Script interrompido',
  },
  server: {
    succeeded: 'Servidor encerrado com sucesso',
    failed: 'Servidor terminou com falha',
    cancelled: 'Operação do servidor cancelada',
    stopped: 'Servidor interrompido',
  },
};

function noticeTitle(notice: Notice): string {
  return noticeTitles[notice.origin][notice.outcome];
}

function relativeTime(createdAt: number): string {
  const elapsed = Math.max(0, now.value - createdAt);

  if (elapsed < 60_000) return 'agora';
  if (elapsed < 3_600_000) return `há ${Math.max(1, Math.floor(elapsed / 60_000))} min`;
  if (elapsed < 86_400_000) return `há ${Math.max(1, Math.floor(elapsed / 3_600_000))} h`;
  return `há ${Math.max(1, Math.floor(elapsed / 86_400_000))} d`;
}

function formatAbsoluteTime(createdAt: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(createdAt);
}

function toggle(): void {
  if (open.value) {
    close({ restoreFocus: false });
    return;
  }
  open.value = true;
  now.value = Date.now();
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

function openActivity(): void {
  close();
  void router.push({ name: 'activity' });
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
  relativeTimeTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentClick);
  if (relativeTimeTimer !== undefined) {
    window.clearInterval(relativeTimeTimer);
  }
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
      aria-controls="notice-panel"
      @click="toggle"
    >
      <BellIcon aria-hidden="true" />
      <span v-if="unreadCount > 0" class="notice-badge">{{ unreadCount }}</span>
    </button>

    <div
      v-if="open"
      id="notice-panel"
      ref="panel"
      class="notice-panel"
      role="dialog"
      aria-labelledby="notice-panel-title"
      tabindex="-1"
      @keydown="handlePanelKeydown"
    >
      <header class="notice-panel-header">
        <div class="notice-panel-heading">
          <h2 id="notice-panel-title">Notificações</h2>
          <span v-if="unreadCount > 0" class="notice-panel-count" :aria-label="`${unreadCount} não lidas`">
            {{ unreadCount }}
          </span>
        </div>
        <button
          type="button"
          class="notice-header-action"
          :disabled="unreadCount === 0"
          @click="markAllRead"
        >
          Marcar como lidas
        </button>
      </header>

      <section aria-live="polite" class="notice-panel-body">
        <div v-if="notices.length === 0" class="notice-empty">
          <BellIcon aria-hidden="true" />
          <p>Nenhuma notificação no momento.</p>
          <span>Conclusões de testes, scripts e servidores aparecerão aqui.</span>
        </div>

        <ul v-else role="list" class="notice-list">
          <li
            v-for="notice in notices"
            :key="notice.id"
            class="notice-item"
            :class="[
              `notice-item-${notice.outcome}`,
              { 'notice-item-unread': !notice.read },
            ]"
          >
            <span class="notice-status-icon" :class="`notice-status-${notice.outcome}`">
              <CheckCircleIcon v-if="notice.outcome === 'succeeded'" aria-hidden="true" />
              <ExclamationCircleIcon v-else-if="notice.outcome === 'failed'" aria-hidden="true" />
              <PauseCircleIcon v-else aria-hidden="true" />
            </span>

            <button type="button" class="notice-item-body" @click="selectNotice(notice)">
              <span class="notice-item-overline">
                <span>{{ originLabels[notice.origin] }}</span>
                <time :datetime="new Date(notice.createdAt).toISOString()" :title="formatAbsoluteTime(notice.createdAt)">
                  {{ relativeTime(notice.createdAt) }}
                </time>
              </span>
              <strong>{{ noticeTitle(notice) }}</strong>
              <span class="notice-item-meta">{{ notice.projectName }} · {{ notice.label }}</span>
            </button>

            <button
              type="button"
              class="notice-item-dismiss"
              :aria-label="`Descartar notificação de ${notice.projectName}`"
              @click="dismissNotice(notice)"
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <footer class="notice-panel-footer">
        <button type="button" class="notice-activity-link" @click="openActivity">
          Abrir atividade
        </button>
        <button
          type="button"
          class="secondary-button notice-clear-button"
          aria-label="Limpar todas as notificações"
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

.notice-bell-button:hover,
.notice-bell-button[aria-expanded='true'] {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.notice-bell-button > svg {
  width: 18px;
  height: 18px;
}

.notice-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  border: 2px solid var(--surface-1);
  border-radius: 999px;
  background: var(--danger-text);
  color: var(--surface-0);
  font-size: var(--font-xs);
  font-weight: 700;
  line-height: 1;
}

.notice-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 30;
  width: 372px;
  max-width: calc(100vw - 24px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}

.notice-panel-header {
  min-height: 52px;
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.notice-panel-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.notice-panel-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: var(--font-lg);
  font-weight: 700;
  line-height: 1.2;
}

.notice-panel-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: var(--font-sm);
  font-weight: 700;
}

.notice-header-action,
.notice-activity-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: var(--font-sm);
  font-weight: 700;
  cursor: pointer;
}

.notice-header-action:hover:not(:disabled),
.notice-activity-link:hover {
  color: var(--accent-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.notice-header-action:disabled {
  color: var(--text-dim);
  cursor: default;
}

.notice-panel-body {
  max-height: 360px;
  overflow-y: auto;
}

.notice-empty {
  min-height: 170px;
  padding: var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.notice-empty > svg {
  width: 30px;
  height: 30px;
  margin-bottom: var(--space-3);
  color: var(--text-dim);
}

.notice-empty p {
  margin: 0 0 var(--space-1);
  color: var(--text);
  font-size: var(--font-md);
  font-weight: 700;
}

.notice-empty span {
  max-width: 260px;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.5;
}

.notice-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-item {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 34px;
  align-items: center;
  min-height: 76px;
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
  background: var(--surface-1);
}

.notice-item:last-child {
  border-bottom: none;
}

.notice-item-unread {
  border-left-color: var(--accent);
  background: var(--accent-soft);
}

.notice-item:hover {
  background: var(--surface-2);
}

.notice-status-icon {
  width: 34px;
  height: 34px;
  margin-left: var(--space-3);
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
}

.notice-status-icon > svg {
  width: 19px;
  height: 19px;
}

.notice-status-succeeded {
  background: var(--success-surface);
  color: var(--success-text);
}

.notice-status-failed {
  background: var(--danger-surface);
  color: var(--danger-text);
}

.notice-status-cancelled,
.notice-status-stopped {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.notice-item-body {
  min-width: 0;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.notice-item-overline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: 700;
  letter-spacing: 0.035em;
  line-height: 1.4;
  text-transform: uppercase;
}

.notice-item-overline time {
  flex: none;
  color: var(--text-dim);
  font-weight: var(--font-weight-body);
  letter-spacing: 0;
  text-transform: none;
}

.notice-item-body strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-md);
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-item-meta {
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-item-dismiss {
  align-self: stretch;
  display: grid;
  place-items: center;
  width: 34px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}

.notice-item-dismiss:hover {
  color: var(--text);
}

.notice-item-dismiss > svg {
  width: 15px;
  height: 15px;
}

.notice-panel-footer {
  min-height: 50px;
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  background: var(--surface-2);
}

.notice-clear-button {
  min-height: 32px;
  padding-inline: var(--space-3);
  font-size: var(--font-sm);
}

@media (max-width: 480px) {
  .notice-panel {
    position: fixed;
    top: 64px;
    right: 12px;
    left: 12px;
    width: auto;
    max-width: none;
  }
}
</style>
