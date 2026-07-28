import {
  onScopeDispose,
  watch,
  type Ref,
} from 'vue';

export const ALERT_AUTO_DISMISS_MS = 5_000;

export function useAutoDismiss<T>(
  target: Ref<T>,
  emptyValue: T,
  delay = ALERT_AUTO_DISMISS_MS,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = watch(target, (value) => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (value === emptyValue) {
      return;
    }

    timer = setTimeout(() => {
      target.value = emptyValue;
      timer = undefined;
    }, delay);
  });

  onScopeDispose(() => {
    stop();
    if (timer) {
      clearTimeout(timer);
    }
  });
}
