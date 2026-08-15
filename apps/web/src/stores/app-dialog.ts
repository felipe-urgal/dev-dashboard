import { computed } from 'vue';
import { createDiscreteApi, darkTheme } from 'naive-ui';

import { naiveThemeOverrides } from '../utils/naive-theme';
import { currentTheme } from '../utils/visual-preferences';

export type AppDialogTone = 'info' | 'warning' | 'danger';

export interface AppDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
}

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
}

const configProviderProps = computed(() => ({
  theme: currentTheme.value === 'dark' ? darkTheme : null,
  themeOverrides: naiveThemeOverrides,
}));

let discreteDialog:
  ReturnType<typeof createDiscreteApi<'dialog'>>['dialog'] | undefined;

function dialogApi(): ReturnType<typeof createDiscreteApi<'dialog'>>['dialog'] {
  discreteDialog ??= createDiscreteApi(['dialog'], {
    configProviderProps,
  }).dialog;
  return discreteDialog;
}

function dialogType(tone: AppDialogTone): 'info' | 'warning' | 'error' {
  return tone === 'danger' ? 'error' : tone;
}

export function alertDialog(options: AppDialogOptions | string): Promise<void> {
  const normalized =
    typeof options === 'string' ? { message: options } : options;

  if (isTestEnvironment()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    dialogApi()[dialogType(normalized.tone ?? 'info')]({
      title: normalized.title?.trim() || 'Atenção',
      content: normalized.message,
      positiveText: normalized.confirmLabel?.trim() || 'Entendi',
      onPositiveClick: settle,
      onClose: settle,
      onMaskClick: settle,
    });
  });
}

export function confirmDialog(
  options: AppDialogOptions | string,
): Promise<boolean> {
  const normalized =
    typeof options === 'string' ? { message: options } : options;

  if (isTestEnvironment()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (confirmed: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(confirmed);
    };

    dialogApi()[dialogType(normalized.tone ?? 'warning')]({
      title: normalized.title?.trim() || 'Confirmar ação',
      content: normalized.message,
      positiveText: normalized.confirmLabel?.trim() || 'Confirmar',
      negativeText: normalized.cancelLabel?.trim() || 'Cancelar',
      onPositiveClick: () => settle(true),
      onNegativeClick: () => settle(false),
      onClose: () => settle(false),
      onMaskClick: () => settle(false),
    });
  });
}
