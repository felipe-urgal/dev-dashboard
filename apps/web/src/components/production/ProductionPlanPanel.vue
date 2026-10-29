<script setup lang="ts">
import { PlayIcon, ShieldExclamationIcon } from '@heroicons/vue/24/outline';

import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

export interface ProductionPlanStepView {
  id: string;
  label: string;
  script: string;
  mutating: boolean;
  irreversible: boolean;
}

defineProps<{
  title: string;
  branch: string;
  projectName: string;
  revision: string;
  steps: readonly ProductionPlanStepView[];
  busy: boolean;
  confirmLabel: string;
  notice?: string;
}>();

const emit = defineEmits<{ cancel: []; confirm: [] }>();
</script>

<template>
  <section class="prod-plan" aria-labelledby="prod-plan-title">
    <header>
      <div>
        <span class="prod-plan-eyebrow">Revisar antes de publicar</span>
        <h4 id="prod-plan-title" tabindex="-1">{{ title }}</h4>
      </div>
      <div class="prod-plan-target">
        <span>{{ projectName }}</span>
        <code :title="revision">{{ branch }} · {{ revision.slice(0, 8) }}</code>
      </div>
    </header>

    <ol>
      <li v-for="(step, index) in steps" :key="step.id">
        <span class="prod-plan-number">{{ index + 1 }}</span>
        <div class="prod-plan-step">
          <strong>{{ step.label }}</strong>
          <code>{{ step.script }}</code>
        </div>
        <div class="prod-plan-flags">
          <UiTag v-if="step.mutating" tone="warning">Muda estado</UiTag>
          <UiTag v-if="step.irreversible" tone="danger">Irreversível</UiTag>
          <UiTag v-if="!step.mutating">Só leitura</UiTag>
        </div>
      </li>
    </ol>

    <p class="prod-plan-notice">
      <ShieldExclamationIcon aria-hidden="true" />
      {{
        notice ??
        'A confirmação vale só para este projeto, branch e revisão. Se algo mudar antes de iniciar, a API recusa a execução.'
      }}
    </p>

    <footer>
      <UiButton :disabled="busy" @click="emit('cancel')">Cancelar</UiButton>
      <UiButton
        variant="primary"
        :busy="busy"
        :disabled="busy"
        @click="emit('confirm')"
      >
        <PlayIcon aria-hidden="true" />
        {{ confirmLabel }}
      </UiButton>
    </footer>
  </section>
</template>

<style scoped>
.prod-plan {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--accent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 6%, var(--surface-1));
}

.prod-plan header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.prod-plan-eyebrow {
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.prod-plan h4 {
  margin: 2px 0 0;
  font-size: 16px;
  outline: none;
}

.prod-plan-target {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 13px;
  font-weight: 600;
}

.prod-plan-target code {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
  font-weight: 500;
}

.prod-plan ol {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-1);
  list-style: none;
}

.prod-plan li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
}

.prod-plan li:first-child {
  border-top: 0;
}

.prod-plan-number {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 700;
}

.prod-plan-step {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.prod-plan-step code {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.prod-plan-flags {
  display: flex;
  gap: 6px;
}

.prod-plan-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-muted);
  font-size: 12.5px;
}

.prod-plan-notice svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: var(--warning-text);
}

.prod-plan footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
