import {
  computed,
  ref,
} from 'vue';

import type { ComputedRef, Ref } from 'vue';

export type NoticeOrigin = 'test' | 'script' | 'server';
export type NoticeOutcome = 'succeeded' | 'failed' | 'cancelled' | 'stopped';

export interface Notice {
  id: string;
  dedupeKey: string;
  origin: NoticeOrigin;
  outcome: NoticeOutcome;
  projectId: string;
  projectName: string;
  label: string;
  createdAt: number;
  read: boolean;
  routeTo: { name: string; params: { projectId: string } };
}

export const NOTICE_LIST_LIMIT = 20;

export function createNoticeCenterStore() {
  const notices: Ref<Notice[]> = ref([]);
  const dedupeSet = new Set<string>();

  const unreadCount: ComputedRef<number> = computed(() =>
    notices.value.filter((notice) => !notice.read).length,
  );

  function publishTerminalNotice(
    input: Omit<Notice, 'id' | 'createdAt' | 'read'>,
  ): void {
    if (dedupeSet.has(input.dedupeKey)) {
      return;
    }

    const notice: Notice = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      read: false,
    };

    notices.value.unshift(notice);
    dedupeSet.add(input.dedupeKey);

    if (notices.value.length > NOTICE_LIST_LIMIT) {
      notices.value = notices.value.slice(0, NOTICE_LIST_LIMIT);
    }
  }

  function markRead(id: string): void {
    const notice = notices.value.find((item) => item.id === id);
    if (notice) {
      notice.read = true;
    }
  }

  function dismiss(id: string): void {
    notices.value = notices.value.filter((notice) => notice.id !== id);
  }

  function clearAll(): void {
    notices.value = [];
  }

  return {
    notices,
    unreadCount,
    publishTerminalNotice,
    markRead,
    dismiss,
    clearAll,
  };
}

export type NoticeCenterStore = ReturnType<typeof createNoticeCenterStore>;

export const noticeCenterStore = createNoticeCenterStore();
