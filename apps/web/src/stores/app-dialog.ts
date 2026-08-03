import {
  readonly,
  shallowRef,
} from 'vue';

export type AppDialogTone = 'info' | 'warning' | 'danger';
export type AppDialogKind = 'alert' | 'confirm';

export interface AppDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
}

export interface AppDialogRequest {
  id: number;
  kind: AppDialogKind;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: AppDialogTone;
}

interface PendingDialog {
  request: AppDialogRequest;
  resolve: (confirmed: boolean) => void;
}

const dialog = shallowRef<AppDialogRequest | null>(null);
const queue: PendingDialog[] = [];

let activeDialog: PendingDialog | undefined;
let nextDialogId = 1;
let hostCount = 0;

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined'
    && process.env.NODE_ENV === 'test';
}

function defaultTitle(kind: AppDialogKind): string {
  return kind === 'alert' ? 'Atenção' : 'Confirmar ação';
}

function defaultConfirmLabel(kind: AppDialogKind): string {
  return kind === 'alert' ? 'Entendi' : 'Confirmar';
}

function openNextDialog(): void {
  if (dialog.value || queue.length === 0) return;

  activeDialog = queue.shift();
  dialog.value = activeDialog?.request ?? null;
}

function enqueueDialog(
  kind: AppDialogKind,
  options: AppDialogOptions,
): Promise<boolean> {
  if (hostCount === 0 && isTestEnvironment()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    queue.push({
      request: {
        id: nextDialogId,
        kind,
        title: options.title?.trim() || defaultTitle(kind),
        message: options.message,
        confirmLabel:
          options.confirmLabel?.trim() || defaultConfirmLabel(kind),
        cancelLabel: options.cancelLabel?.trim() || 'Cancelar',
        tone: options.tone ?? (kind === 'alert' ? 'info' : 'warning'),
      },
      resolve,
    });
    nextDialogId += 1;
    openNextDialog();
  });
}

function finishDialog(confirmed: boolean): void {
  const pending = activeDialog;
  activeDialog = undefined;
  dialog.value = null;
  pending?.resolve(confirmed);
  queueMicrotask(openNextDialog);
}

export function alertDialog(
  options: AppDialogOptions | string,
): Promise<void> {
  const normalized = typeof options === 'string'
    ? { message: options }
    : options;

  return enqueueDialog('alert', normalized).then(() => undefined);
}

export function confirmDialog(
  options: AppDialogOptions | string,
): Promise<boolean> {
  const normalized = typeof options === 'string'
    ? { message: options }
    : options;

  return enqueueDialog('confirm', normalized);
}

function registerHost(): () => void {
  hostCount += 1;
  openNextDialog();

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    hostCount = Math.max(0, hostCount - 1);
  };
}

export const appDialogStore = {
  dialog: readonly(dialog),
  confirm: () => finishDialog(true),
  cancel: () => finishDialog(false),
  registerHost,
};
