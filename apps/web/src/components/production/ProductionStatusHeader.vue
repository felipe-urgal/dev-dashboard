<script setup lang="ts">
import { computed, type Component } from 'vue';

import UiTag from '../ui/UiTag.vue';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const props = defineProps<{
  tone: Tone;
  icon: Component;
  title: string;
  description: string;
  label?: string;
  facts?: { label: string; value: string; mono?: boolean; title?: string }[];
}>();

const tagTone = computed(() => (props.tone === 'info' ? 'accent' : props.tone));
</script>

<template>
  <article class="prod-status" :data-tone="tone">
    <div class="prod-status-icon" aria-hidden="true">
      <component :is="icon" />
    </div>

    <div class="prod-status-copy">
      <div class="prod-status-title">
        <h3>{{ title }}</h3>
        <UiTag v-if="label" :tone="tagTone">{{ label }}</UiTag>
      </div>
      <p>{{ description }}</p>
      <dl v-if="facts && facts.length > 0" class="prod-status-facts">
        <div v-for="fact in facts" :key="fact.label">
          <dt>{{ fact.label }}</dt>
          <dd :class="{ 'is-mono': fact.mono }" :title="fact.title">
            {{ fact.value }}
          </dd>
        </div>
      </dl>
    </div>

    <div class="prod-status-actions">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.prod-status {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.prod-status-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: var(--text-muted);
  background: var(--surface-2);
}

.prod-status-icon svg {
  width: 24px;
  height: 24px;
}

.prod-status[data-tone='success'] .prod-status-icon {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 14%, transparent);
}

.prod-status[data-tone='warning'] .prod-status-icon {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 14%, transparent);
}

.prod-status[data-tone='danger'] .prod-status-icon {
  color: var(--danger-text, #f85149);
  background: color-mix(in srgb, var(--danger-text, #f85149) 14%, transparent);
}

.prod-status[data-tone='info'] .prod-status-icon {
  color: var(--accent);
  background: var(--accent-soft);
}

.prod-status-copy {
  min-width: 260px;
  flex: 1 1 360px;
}

.prod-status-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.prod-status-title h3 {
  margin: 0;
  font-size: 17px;
}

.prod-status-copy p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.prod-status-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  margin: 14px 0 0;
}

.prod-status-facts div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.prod-status-facts dt {
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.prod-status-facts dd {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
}

.prod-status-facts dd.is-mono {
  color: var(--accent);
  font-family: var(--font-family-mono);
}

.prod-status-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}
</style>
