<script setup lang="ts">
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';

import UiButton from '../ui/UiButton.vue';

defineProps<{
  branch: string;
  busy: boolean;
  canForcePush: boolean;
}>();

const acknowledged = defineModel<boolean>('acknowledged', { required: true });

const emit = defineEmits<{ 'force-push': [] }>();
</script>

<template>
  <section class="git-pr-force-push" aria-label="Confirmação de push forçado">
    <ExclamationTriangleIcon aria-hidden="true" />
    <div class="git-pr-force-push-body">
      <strong>Push forçado detectado</strong>
      <p>
        O histórico de <code>origin/{{ branch }}</code> será reescrito. Atualize
        a branch remota se quiser evitar o force push.
      </p>
      <label class="git-pr-force-push-confirm">
        <input v-model="acknowledged" type="checkbox" :disabled="busy" />
        <span>Entendo que o histórico remoto será reescrito</span>
      </label>
    </div>
    <UiButton :disabled="!canForcePush" @click="emit('force-push')">
      Forçar atualização no origin
    </UiButton>
  </section>
</template>

<style scoped>
.git-pr-force-push {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--warning-text) 40%, transparent);
  border-radius: 14px;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 8%, var(--surface-1));
  font-size: 13px;
}

.git-pr-force-push > svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.git-pr-force-push-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.git-pr-force-push p {
  margin: 0;
  color: var(--text-muted);
}

.git-pr-force-push code {
  font-family: var(--font-family-mono);
}

.git-pr-force-push-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
}
</style>
