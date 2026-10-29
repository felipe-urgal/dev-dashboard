<script setup lang="ts">
import { computed, watch } from 'vue';
import { PlayIcon, ServerStackIcon } from '@heroicons/vue/24/outline';

import type {
  ManagedProcess,
  Project,
  RailsWorkerId,
} from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';
import { useProjectServerMetrics } from '../composables/useProjectServerMetrics';
import {
  parseSidekiqLog,
  sidekiqLogFilters,
  sidekiqRuntimeInfo,
} from '../utils/sidekiq-log-lines';
import {
  parseWebpackLog,
  webpackLogFilters,
  webpackRuntimeInfo,
} from '../utils/webpack-log-lines';
import ProcessConsole from './process/ProcessConsole.vue';
import ProcessStatusBar from './process/ProcessStatusBar.vue';
import UiButton from './ui/UiButton.vue';

const props = defineProps<{
  project: Project;
  workerId: RailsWorkerId;
  environmentInstanceId?: string | undefined;
}>();

const worker = useProjectRailsWorker(
  () => props.project,
  props.workerId,
  props.workerId === 'sidekiq',
  true,
  () => props.environmentInstanceId,
);

useAutoDismiss(worker.errorMessage, '');

const { uptimeLabel } = useProjectServerMetrics(
  () => props.project,
  worker.managedProcess,
  worker.status,
);

watch(
  () =>
    [props.project.id, worker.detected.value, worker.canStop.value] as const,
  ([, detected, canFollowLogs]) => {
    if (detected && canFollowLogs) {
      worker.startLogStream();
    } else if (!canFollowLogs) {
      worker.stopLogStream();
      // O stream só acompanha o processo enquanto ele roda. Ao terminar (ou ao
      // abrir a aba com ele já parado) lê o log final: é nele que está o erro
      // de quem morre logo ao iniciar.
      if (detected) void worker.refreshLog();
    }
  },
);

const WORKERS = {
  sidekiq: {
    name: 'Sidekiq',
    processLabel: 'Sidekiq',
    defaultCommand: 'bundle exec sidekiq',
    description:
      'Processa os jobs em segundo plano. Precisa do Redis ativo para iniciar.',
    parse: parseSidekiqLog,
    filters: sidekiqLogFilters,
    technical: true,
    canRestart: true,
  },
  webpack: {
    name: 'Webpack',
    processLabel: 'webpack-dev-server',
    defaultCommand: 'bin/webpack-dev-server',
    description: 'Compila os assets do projeto em tempo real.',
    parse: parseWebpackLog,
    filters: webpackLogFilters,
    technical: false,
    canRestart: false,
  },
} as const;

const meta = computed(() => WORKERS[props.workerId]);

function commandOf(process: ManagedProcess | null): string {
  if (!process?.command) return meta.value.defaultCommand;
  return [process.command, ...(process.args ?? [])]
    .join(' ')
    .replace(`${props.project.path}/`, '');
}

/** Chips lidos do que o próprio processo imprime ao iniciar. */
const chips = computed(() => {
  const content = worker.log.value?.content ?? '';
  const list: string[] = [];

  if (props.workerId === 'sidekiq') {
    const info = sidekiqRuntimeInfo(content);
    if (info.redis) list.push(info.redis);
    if (info.version) list.push(`Sidekiq ${info.version}`);
  } else {
    const info = webpackRuntimeInfo(content);
    if (info.port) list.push(`:${info.port}`);
    if (info.version) list.push(`webpack-dev-server ${info.version}`);
  }

  list.push(commandOf(worker.managedProcess.value));
  return list;
});

const statusNote = computed(() => {
  const process = worker.managedProcess.value;
  if (worker.status.value === 'running') {
    return [
      uptimeLabel.value !== '—' ? `há ${uptimeLabel.value}` : '',
      process?.pid ? `PID ${process.pid}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (worker.status.value === 'failed' && process?.exitCode !== undefined) {
    return `código de saída ${process.exitCode}`;
  }
  return '';
});
</script>

<template>
  <div class="rails-runtime-panel" :data-worker-id="workerId">
    <p v-if="worker.errorMessage.value" class="process-alert" role="alert">
      {{ worker.errorMessage.value }}
    </p>

    <p
      v-if="worker.loading.value && !worker.detected.value"
      class="process-note"
    >
      Verificando se {{ meta.processLabel }} está disponível no projeto…
    </p>

    <div v-else-if="!worker.detected.value" class="process-note">
      <ServerStackIcon aria-hidden="true" />
      <strong>{{ meta.processLabel }} não foi detectado.</strong>
      <p>
        O painel será habilitado automaticamente quando o projeto possuir a
        dependência ou o binstub correspondente.
      </p>
    </div>

    <template v-else>
      <ProcessStatusBar
        :status="worker.status.value"
        :status-label="`${meta.name} · ${worker.statusLabel.value}`"
        :status-note="statusNote"
        :chips="chips"
        :action="worker.currentAction.value"
        :can-restart="meta.canRestart"
        :start-label="`Iniciar ${meta.name}`"
        @start="worker.start()"
        @stop="worker.stop()"
        @restart="worker.restart()"
      />

      <p
        v-if="worker.status.value === 'failed' && !worker.errorMessage.value"
        class="process-alert"
        role="alert"
      >
        {{ meta.name }} encerrou com falha<template
          v-if="worker.managedProcess.value?.exitCode !== undefined"
        >
          (código {{ worker.managedProcess.value.exitCode }})</template
        >. Consulte o log abaixo e tente iniciar novamente.
      </p>

      <ProcessConsole
        :content="worker.log.value?.content ?? ''"
        :parse="meta.parse"
        :filters="meta.filters"
        :technical="meta.technical"
        :running="worker.status.value === 'running'"
        :masked-count="worker.log.value?.redactionCount ?? 0"
        :clearable="worker.detected.value"
        :clearing="worker.clearingLog.value"
        title="Log"
        @clear="worker.clearLog()"
      >
        <template #empty>
          <p
            v-if="
              worker.status.value === 'running' ||
              worker.status.value === 'starting'
            "
            class="process-waiting"
          >
            $ aguardando saída de {{ meta.processLabel }}…
          </p>
          <div v-else class="process-stopped">
            <ServerStackIcon aria-hidden="true" />
            <strong>{{ meta.name }} parado</strong>
            <p>{{ meta.description }}</p>
            <code>$ {{ commandOf(worker.managedProcess.value) }}</code>
            <UiButton variant="primary" @click="worker.start()">
              <PlayIcon aria-hidden="true" />
              Iniciar {{ meta.name }}
            </UiButton>
          </div>
        </template>
      </ProcessConsole>
    </template>
  </div>
</template>

<style scoped>
.rails-runtime-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.process-alert {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--danger-text) 35%, transparent);
  border-radius: 12px;
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 12%, transparent);
  font-size: 13px;
}

.process-note {
  display: grid;
  justify-items: center;
  gap: 10px;
  margin: 0;
  padding: 40px 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  background: var(--surface-1);
  text-align: center;
}

.process-note svg {
  width: 32px;
  height: 32px;
  color: var(--text-dim);
}

.process-note p,
.process-note strong {
  margin: 0;
}

.process-waiting {
  margin: 0;
  padding: 0 16px;
  color: var(--text-dim);
}

.process-stopped {
  display: flex;
  max-width: 480px;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: auto;
  padding: 40px 16px;
  font-family: var(--font-family);
  text-align: center;
}

.process-stopped > svg {
  width: 40px;
  height: 40px;
  color: var(--text-dim);
}

.process-stopped strong {
  font-size: 16px;
}

.process-stopped p {
  margin: 0;
  color: var(--text-dim);
}

.process-stopped code {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-family: var(--font-family-mono);
  font-size: 13px;
}
</style>
