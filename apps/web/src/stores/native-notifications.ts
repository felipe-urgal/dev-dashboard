import { computed, ref } from 'vue';

import type { Notice, NoticeOrigin, NoticeOutcome } from './notice-center';

export const NATIVE_NOTIFICATIONS_STORAGE_KEY =
  'dev-dashboard:native-notifications';
export const NATIVE_NOTIFICATION_MINIMUM_DURATION_MS = 30_000;

export type NativeNotificationEnableResult =
  'enabled' | 'denied' | 'unsupported' | 'error';

type NoticeRoute = Notice['routeTo'];

function browserSupportsNotifications(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.Notification === 'function'
  );
}

function readStoredPreference(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return (
      window.localStorage.getItem(NATIVE_NOTIFICATIONS_STORAGE_KEY) ===
      'enabled'
    );
  } catch {
    return false;
  }
}

function storePreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    if (enabled) {
      window.localStorage.setItem(NATIVE_NOTIFICATIONS_STORAGE_KEY, 'enabled');
    } else {
      window.localStorage.removeItem(NATIVE_NOTIFICATIONS_STORAGE_KEY);
    }
  } catch {
    // A central de avisos continua funcionando quando o armazenamento é bloqueado.
  }
}

function currentPermission(): NotificationPermission | 'unsupported' {
  return browserSupportsNotifications()
    ? Notification.permission
    : 'unsupported';
}

type NativeNoticeOrigin = Exclude<NoticeOrigin, 'server'>;

const titles = {
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
  build: {
    succeeded: 'Build concluído com sucesso',
    failed: 'Build terminou com falha',
    cancelled: 'Build cancelado',
    stopped: 'Build interrompido',
  },
} as const satisfies Record<NativeNoticeOrigin, Record<NoticeOutcome, string>>;

const nativeOrigins: ReadonlySet<NoticeOrigin> = new Set(
  Object.keys(titles) as NativeNoticeOrigin[],
);

function isNativeNoticeOrigin(
  origin: NoticeOrigin,
): origin is NativeNoticeOrigin {
  return nativeOrigins.has(origin);
}

export function durationInMilliseconds(
  startedAt?: string,
  finishedAt?: string,
  now = Date.now(),
): number | undefined {
  if (!startedAt) return undefined;

  const start = Date.parse(startedAt);
  const finish = finishedAt ? Date.parse(finishedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start)
    return undefined;

  return finish - start;
}

export function createNativeNotificationStore() {
  const supported = ref(browserSupportsNotifications());
  const permission = ref<NotificationPermission | 'unsupported'>(
    currentPermission(),
  );
  const enabled = ref(
    supported.value && permission.value === 'granted' && readStoredPreference(),
  );
  let navigate: ((route: NoticeRoute) => void) | undefined;

  const status = computed(() => {
    if (!supported.value) return 'unsupported' as const;
    if (permission.value === 'denied') return 'denied' as const;
    return enabled.value ? ('enabled' as const) : ('disabled' as const);
  });

  function setNavigator(handler: (route: NoticeRoute) => void): void {
    navigate = handler;
  }

  function disable(): void {
    enabled.value = false;
    storePreference(false);
  }

  function suspend(): void {
    enabled.value = false;
  }

  async function enable(): Promise<NativeNotificationEnableResult> {
    supported.value = browserSupportsNotifications();
    if (!supported.value) {
      permission.value = 'unsupported';
      suspend();
      return 'unsupported';
    }

    try {
      permission.value = Notification.permission;
      if (permission.value === 'default') {
        permission.value = await Notification.requestPermission();
      }
      if (permission.value !== 'granted') {
        suspend();
        return 'denied';
      }

      enabled.value = true;
      storePreference(true);
      return 'enabled';
    } catch {
      suspend();
      return 'error';
    }
  }

  function publish(notice: Notice, durationMs?: number): void {
    if (!enabled.value || !isNativeNoticeOrigin(notice.origin)) return;
    if (
      durationMs === undefined ||
      durationMs < NATIVE_NOTIFICATION_MINIMUM_DURATION_MS
    )
      return;
    if (
      typeof document === 'undefined' ||
      document.visibilityState !== 'hidden'
    )
      return;

    supported.value = browserSupportsNotifications();
    if (!supported.value) {
      permission.value = 'unsupported';
      suspend();
      return;
    }

    permission.value = currentPermission();
    if (permission.value !== 'granted') {
      suspend();
      return;
    }

    try {
      const systemNotification = new Notification(
        titles[notice.origin][notice.outcome],
        {
          body: `${notice.projectName} · ${notice.label}`,
          tag: notice.dedupeKey,
        },
      );
      systemNotification.onclick = () => {
        window.focus();
        navigate?.(notice.routeTo);
        systemNotification.close();
      };
    } catch {
      // Falhas da API nativa nunca impedem o aviso equivalente dentro do dashboard.
    }
  }

  return {
    supported,
    permission,
    enabled,
    status,
    setNavigator,
    enable,
    disable,
    publish,
  };
}

export type NativeNotificationStore = ReturnType<
  typeof createNativeNotificationStore
>;

export const nativeNotificationStore = createNativeNotificationStore();
