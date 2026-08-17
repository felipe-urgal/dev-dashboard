<script setup lang="ts">
import {
  BellIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PauseCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { NPopover } from 'naive-ui';
import { useRouter } from 'vue-router';

import {
  noticeCenterStore,
  type Notice,
  type NoticeOrigin,
  type NoticeOutcome,
} from '../stores/notice-center';

const router = useRouter();
const bellButton = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const open = ref(false);
const now = ref(Date.now());
let relativeTimeTimer: number | undefined;

const { notices, unreadCount, markRead, markAllRead, dismiss, clearAll } =
  noticeCenterStore;

const bellLabel = computed(() =>
  unreadCount.value === 0
    ? 'Notificações'
    : `${unreadCount.value} notificação(ões) não lida(s)`,
);

const originLabels: Record<NoticeOrigin, string> = {
  test: 'Testes',
  script: 'Script',
  server: 'Servidor',
  build: 'Build',
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
  build: {
    succeeded: 'Build concluído com sucesso',
    failed: 'Build terminou com falha',
    cancelled: 'Build cancelado',
    stopped: 'Build interrompido',
  },
};

function noticeTitle(notice: Notice): string {
  return noticeTitles[notice.origin][notice.outcome];
}

function relativeTime(createdAt: number): string {
  const elapsed = Math.max(0, now.value - createdAt);

  if (elapsed < 60_000) return 'agora';
  if (elapsed < 3_600_000)
    return `há ${Math.max(1, Math.floor(elapsed / 60_000))} min`;
  if (elapsed < 86_400_000)
    return `há ${Math.max(1, Math.floor(elapsed / 3_600_000))} h`;
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

function handlePanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
  }
}

onMounted(() => {
  relativeTimeTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});

onBeforeUnmount(() => {
  if (relativeTimeTimer !== undefined) {
    window.clearInterval(relativeTimeTimer);
  }
});
</script>

<template>
  <NPopover
    v-model:show="open"
    trigger="manual"
    placement="bottom-end"
    raw
    :show-arrow="false"
    class="notice-panel-popover"
    @clickoutside="close"
  >
    <template #trigger>
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
    </template>

    <div
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
          <span
            v-if="unreadCount > 0"
            class="notice-panel-count"
            :aria-label="`${unreadCount} não lidas`"
          >
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
          <span
            >Conclusões de testes, scripts, builds e servidores aparecerão
            aqui.</span
          >
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
            <span
              class="notice-status-icon"
              :class="`notice-status-${notice.outcome}`"
            >
              <CheckCircleIcon
                v-if="notice.outcome === 'succeeded'"
                aria-hidden="true"
              />
              <ExclamationCircleIcon
                v-else-if="notice.outcome === 'failed'"
                aria-hidden="true"
              />
              <PauseCircleIcon v-else aria-hidden="true" />
            </span>

            <button
              type="button"
              class="notice-item-body"
              @click="selectNotice(notice)"
            >
              <span class="notice-item-overline">
                <span>{{ originLabels[notice.origin] }}</span>
                <time
                  :datetime="new Date(notice.createdAt).toISOString()"
                  :title="formatAbsoluteTime(notice.createdAt)"
                >
                  {{ relativeTime(notice.createdAt) }}
                </time>
              </span>
              <strong>{{ noticeTitle(notice) }}</strong>
              <span class="notice-item-meta"
                >{{ notice.projectName }} · {{ notice.label }}</span
              >
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
  </NPopover>
</template>

<style scoped src="./NoticeCenter.css"></style>
