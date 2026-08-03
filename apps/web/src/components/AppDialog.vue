<script setup lang="ts">
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { appDialogStore } from '../stores/app-dialog';

const dialogElement = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);

const dialog = appDialogStore.dialog;
const isConfirmation = computed(() => dialog.value?.kind === 'confirm');

let previousBodyOverflow = '';
let previouslyFocusedElement: HTMLElement | null = null;
let pageStateCaptured = false;
let unregisterHost: (() => void) | undefined;

function capturePageState(): void {
  if (pageStateCaptured) return;

  pageStateCaptured = true;
  previousBodyOverflow = document.body.style.overflow;
  previouslyFocusedElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  document.body.style.overflow = 'hidden';
}

function restorePageState(): void {
  if (!pageStateCaptured) return;

  pageStateCaptured = false;
  document.body.style.overflow = previousBodyOverflow;
  const focusTarget = previouslyFocusedElement;
  previouslyFocusedElement = null;

  void nextTick(() => {
    focusTarget?.focus();
  });
}

function focusInitialAction(): void {
  void nextTick(() => {
    if (isConfirmation.value) {
      cancelButton.value?.focus();
      return;
    }
    confirmButton.value?.focus();
  });
}

function focusableElements(): HTMLElement[] {
  return [
    ...(dialogElement.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []),
  ];
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    appDialogStore.cancel();
    return;
  }

  if (event.key !== 'Tab') return;

  const focusable = focusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const currentIndex = focusable.indexOf(
    document.activeElement as HTMLElement,
  );

  if (event.shiftKey && currentIndex <= 0) {
    event.preventDefault();
    focusable.at(-1)?.focus();
  } else if (
    !event.shiftKey
    && currentIndex === focusable.length - 1
  ) {
    event.preventDefault();
    focusable[0]?.focus();
  }
}

function handleBackdropClick(): void {
  appDialogStore.cancel();
}

watch(
  dialog,
  (current, previous) => {
    if (current) {
      if (!previous) capturePageState();
      focusInitialAction();
      return;
    }

    restorePageState();
  },
);

onMounted(() => {
  unregisterHost = appDialogStore.registerHost();
});

onBeforeUnmount(() => {
  unregisterHost?.();
  restorePageState();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="dialog"
      class="app-dialog-backdrop"
      role="presentation"
      @mousedown.self="handleBackdropClick"
    >
      <section
        ref="dialogElement"
        class="app-dialog"
        :class="`app-dialog-${dialog.tone}`"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        @keydown="handleKeydown"
      >
        <div class="app-dialog-icon" aria-hidden="true">
          <InformationCircleIcon v-if="dialog.tone === 'info'" />
          <ExclamationTriangleIcon v-else />
        </div>

        <div class="app-dialog-content">
          <span class="section-kicker">
            {{ dialog.kind === 'confirm' ? 'Confirmação' : 'Aviso' }}
          </span>
          <h2 id="app-dialog-title">{{ dialog.title }}</h2>
          <p id="app-dialog-message">{{ dialog.message }}</p>
        </div>

        <footer class="app-dialog-actions">
          <button
            v-if="isConfirmation"
            ref="cancelButton"
            type="button"
            class="secondary-button"
            @click="appDialogStore.cancel"
          >
            {{ dialog.cancelLabel }}
          </button>

          <button
            ref="confirmButton"
            type="button"
            :class="dialog.tone === 'danger' ? 'danger-button' : 'primary-button'"
            @click="appDialogStore.confirm"
          >
            {{ dialog.confirmLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./AppDialog.css"></style>
