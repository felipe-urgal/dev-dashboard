<script setup lang="ts">
import { computed } from 'vue';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/vue/24/outline';

import type { ReadinessItem } from '../../utils/production-readiness';
import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

const props = defineProps<{ items: readonly ReadinessItem[] }>();

const emit = defineEmits<{ action: [id: 'run-tests'] }>();

const warnings = computed(
  () => props.items.filter((item) => item.tone === 'warn').length,
);

const icons = {
  ok: CheckCircleIcon,
  warn: ExclamationTriangleIcon,
  info: InformationCircleIcon,
} as const;
</script>

<template>
  <section
    v-if="items.length > 0"
    class="prod-ready"
    aria-label="Antes de publicar"
  >
    <header>
      <div>
        <span class="prod-ready-eyebrow">Antes de publicar</span>
        <h4>
          {{
            warnings === 0
              ? 'Tudo certo para publicar'
              : warnings === 1
                ? '1 aviso — você ainda pode publicar'
                : `${warnings} avisos — você ainda pode publicar`
          }}
        </h4>
      </div>
      <UiTag :tone="warnings === 0 ? 'success' : 'warning'">
        {{ warnings === 0 ? 'Sem avisos' : `${warnings} de ${items.length}` }}
      </UiTag>
    </header>

    <ul>
      <li v-for="item in items" :key="item.id" :data-tone="item.tone">
        <component :is="icons[item.tone]" aria-hidden="true" />
        <div class="prod-ready-copy">
          <strong>{{ item.label }}</strong>
          <small v-if="item.detail">{{ item.detail }}</small>
        </div>
        <UiButton
          v-if="item.action"
          size="sm"
          @click="emit('action', item.action.id)"
        >
          {{ item.action.label }}
        </UiButton>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.prod-ready {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.prod-ready header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.prod-ready-eyebrow {
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.prod-ready h4 {
  margin: 2px 0 0;
  font-size: 15px;
}

.prod-ready ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.prod-ready li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.prod-ready li:first-child {
  border-top: 0;
}

.prod-ready li > svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.prod-ready li[data-tone='ok'] > svg {
  color: var(--success-text);
}

.prod-ready li[data-tone='warn'] > svg {
  color: var(--warning-text);
}

.prod-ready li[data-tone='info'] > svg {
  color: var(--accent);
}

.prod-ready-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  font-size: 13px;
}

.prod-ready-copy small {
  color: var(--text-dim);
  font-size: 12px;
}
</style>
