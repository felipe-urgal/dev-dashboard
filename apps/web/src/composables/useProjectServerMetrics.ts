import { computed, onBeforeUnmount, ref, type Ref } from 'vue';

import type {
  ManagedProcess,
  ManagedProcessStatus,
  Project,
} from '@dev-dashboard/contracts';

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTime(value: string | undefined): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function useProjectServerMetrics(
  getProject: () => Project,
  managedProcess: Ref<ManagedProcess | null>,
  processStatus: Ref<ManagedProcessStatus>,
) {
  const now = ref(Date.now());
  const clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 1_000);

  const environmentLabel = computed(() => {
    const type = getProject().type;
    return type === 'rails' || type === 'node' ? 'development' : 'local';
  });

  const commandLabel = computed(() => {
    const process = managedProcess.value;
    if (process?.command) {
      return [process.command, ...(process.args ?? [])].join(' ');
    }

    if (getProject().type === 'rails') return 'bin/dev';
    if (getProject().type === 'node') return 'npm run dev';
    return 'Detectado ao iniciar';
  });

  const uptimeLabel = computed(() => {
    const startedAt = managedProcess.value?.startedAt;
    if (!startedAt || processStatus.value !== 'running') return '—';

    const started = new Date(startedAt).getTime();
    if (!Number.isFinite(started)) return '—';

    return formatDuration(Math.max(0, now.value - started));
  });

  const startedAtLabel = computed(() =>
    formatTime(managedProcess.value?.startedAt),
  );

  onBeforeUnmount(() => clearInterval(clockTimer));

  return {
    commandLabel,
    environmentLabel,
    startedAtLabel,
    uptimeLabel,
  };
}
