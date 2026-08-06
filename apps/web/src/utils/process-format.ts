import type {
  ManagedProcess,
  ManagedProcessKind,
  ManagedProcessStatus,
} from '@dev-dashboard/contracts';

const TERMINAL_STATUSES: readonly ManagedProcessStatus[] = [
  'stopped',
  'failed',
];

export function kindLabel(kind: ManagedProcessKind): string {
  switch (kind) {
    case 'server':
      return 'Servidor';
    case 'test':
      return 'Testes';
    case 'webpack':
      return 'Webpack';
    case 'worker':
      return 'Worker';
    case 'script':
      return 'Script';
  }
}

export function processStatusLabel(status: ManagedProcessStatus): string {
  switch (status) {
    case 'starting':
      return 'Iniciando';
    case 'running':
      return 'Em execução';
    case 'stopping':
      return 'Encerrando';
    case 'stopped':
      return 'Parado';
    case 'failed':
      return 'Falhou';
  }
}

export function processDetailPath(process: ManagedProcess): string {
  const base = `/projects/${encodeURIComponent(process.projectId)}`;
  if (process.kind === 'test') return `${base}/tests`;
  return base;
}

function isTerminalStatus(status: ManagedProcessStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.includes(status);
}

export function processDurationReference(
  process: ManagedProcess,
  nowMs: number,
): number {
  if (isTerminalStatus(process.status) && process.stoppedAt) {
    const stoppedMs = new Date(process.stoppedAt).getTime();
    if (!Number.isNaN(stoppedMs)) return stoppedMs;
  }
  return nowMs;
}

export function formatDuration(
  startedAtIso: string | undefined,
  referenceMs: number,
): string {
  if (!startedAtIso) return '—';
  const startedMs = new Date(startedAtIso).getTime();
  if (Number.isNaN(startedMs)) return '—';
  const elapsed = Math.max(0, referenceMs - startedMs);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
