<script setup lang="ts">
import { NModal } from 'naive-ui';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import type {
  MachineDatabaseService,
  MachineDatabaseServiceDetails,
} from '@dev-dashboard/contracts';

import ProjectLogViewer from '../ProjectLogViewer.vue';

defineProps<{
  service: MachineDatabaseService | null;
  details: MachineDatabaseServiceDetails | undefined;
  error: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  close: [];
  reload: [serviceId: string];
}>();

function reachabilityLabel(
  value: MachineDatabaseServiceDetails['reachability'],
): string {
  return {
    reachable: 'Porta acessível',
    unreachable: 'Porta indisponível',
    unknown: 'Não testada',
  }[value];
}
</script>

<template>
  <n-modal
    :show="service !== null"
    preset="card"
    :title="service ? `${service.label} · detalhes` : ''"
    :bordered="false"
    style="width: min(760px, calc(100vw - 32px))"
    role="dialog"
    aria-modal="true"
    @update:show="(show: boolean) => !show && emit('close')"
  >
    <div v-if="service" class="database-details">
      <p v-if="loading && !details" role="status">Consultando detalhes…</p>
      <template v-if="details">
        <dl class="database-details-grid">
          <div>
            <dt>Porta</dt>
            <dd>{{ details.port ?? '—' }}</dd>
          </div>
          <div>
            <dt>PID</dt>
            <dd>{{ details.pid ?? '—' }}</dd>
          </div>
          <div>
            <dt>Versão</dt>
            <dd>{{ details.version ?? '—' }}</dd>
          </div>
          <div>
            <dt>Conexão</dt>
            <dd :data-state="details.reachability">
              {{ reachabilityLabel(details.reachability) }}
            </dd>
          </div>
        </dl>
        <div class="database-details-toolbar">
          <span v-if="details.startedAt"
            >Iniciado em {{ details.startedAt }}</span
          >
          <button
            type="button"
            :disabled="loading"
            @click="emit('reload', service.id)"
          >
            <ArrowPathIcon aria-hidden="true" />
            {{ loading ? 'Testando…' : 'Testar conexão' }}
          </button>
        </div>
        <ProjectLogViewer
          :content="details.logs.join('\n')"
          title="Logs recentes"
          empty-label="Não há logs recentes disponíveis."
          :follow="false"
        />
      </template>
      <p v-if="error" class="database-details-error" role="alert">
        {{ error }}
      </p>
    </div>
  </n-modal>
</template>

<style scoped>
.database-details {
  display: grid;
  gap: 14px;
}

.database-details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin: 0;
}

.database-details-grid > div {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

dt {
  color: var(--text-dim);
  font-size: 11px;
}

dd {
  margin: 2px 0 0;
  color: var(--text);
  font-family: var(--font-family-mono);
  font-size: 13px;
  font-weight: 600;
}

dd[data-state='reachable'] {
  color: var(--success-text);
}

dd[data-state='unreachable'] {
  color: var(--danger-text);
}

.database-details-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
}

.database-details-toolbar button {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.database-details-toolbar button svg {
  width: 14px;
  height: 14px;
}

.database-details-error {
  margin: 0;
  color: var(--danger-text);
  font-size: 13px;
}
</style>
