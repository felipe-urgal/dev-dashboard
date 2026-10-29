<script setup lang="ts">
import { computed } from 'vue';

import type { ProductionPolicies } from '@dev-dashboard/contracts';

import { buildRecoveryGuide } from '../../utils/production-recovery';
import UiButton from '../ui/UiButton.vue';

const props = defineProps<{
  policy: ProductionPolicies['rollback'] | undefined;
  hasBackupCommand: boolean;
  hasRestoreCheck: boolean;
  /** Última versão estável anterior à atual, quando conhecida. */
  previous: {
    revision: string;
    subject?: string | undefined;
    when: string;
  } | null;
  current?: string | undefined;
  open: boolean;
}>();

const emit = defineEmits<{
  'copy-revision': [revision: string];
  'open-terminal': [];
}>();

const guide = computed(() =>
  buildRecoveryGuide({
    policy: props.policy,
    hasBackupCommand: props.hasBackupCommand,
    hasRestoreCheck: props.hasRestoreCheck,
  }),
);
</script>

<template>
  <details class="prod-recovery-guide" :open="open">
    <summary>
      <div>
        <span class="prod-recovery-eyebrow">Recuperação</span>
        <strong>Voltar para a versão anterior</strong>
      </div>
      <small>Guia, sem executar nada</small>
    </summary>

    <div class="prod-recovery-body">
      <p class="prod-recovery-summary">{{ guide.summary }}</p>

      <div v-if="previous" class="prod-recovery-previous">
        <div>
          <span>Versão anterior estável</span>
          <code :title="previous.revision">{{
            previous.revision.slice(0, 8)
          }}</code>
          <strong v-if="previous.subject">{{ previous.subject }}</strong>
          <small>{{ previous.when }}</small>
        </div>
        <UiButton size="sm" @click="emit('copy-revision', previous.revision)">
          Copiar revisão
        </UiButton>
      </div>
      <p v-else class="prod-recovery-note">
        Ainda não há uma versão anterior estável registrada para este projeto.
      </p>

      <ol>
        <li v-for="step in guide.steps" :key="step">{{ step }}</li>
      </ol>

      <div class="prod-recovery-actions">
        <UiButton size="sm" @click="emit('open-terminal')"
          >Abrir Terminal</UiButton
        >
      </div>
    </div>
  </details>
</template>

<style scoped>
.prod-recovery-guide {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.prod-recovery-guide summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  cursor: pointer;
  list-style: none;
}

.prod-recovery-guide summary::-webkit-details-marker {
  display: none;
}

.prod-recovery-guide summary small {
  color: var(--text-dim);
  font-size: 12px;
}

.prod-recovery-eyebrow {
  display: block;
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.prod-recovery-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 20px 18px;
}

.prod-recovery-summary,
.prod-recovery-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.prod-recovery-previous {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-0);
}

.prod-recovery-previous > div {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 13px;
}

.prod-recovery-previous span {
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
}

.prod-recovery-previous code {
  color: var(--accent);
  font-family: var(--font-family-mono);
}

.prod-recovery-previous small {
  color: var(--text-dim);
}

.prod-recovery-guide ol {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
}

.prod-recovery-actions {
  display: flex;
  gap: 8px;
}
</style>
