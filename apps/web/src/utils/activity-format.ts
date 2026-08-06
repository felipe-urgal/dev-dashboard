import type {
  Activity,
  ActivityOrigin,
  ActivityStatus,
} from '@dev-dashboard/contracts';

export function statusLabel(status: ActivityStatus): string {
  switch (status) {
    case 'running':
      return 'Em execução';
    case 'succeeded':
      return 'Concluída';
    case 'failed':
      return 'Falhou';
    case 'cancelled':
      return 'Cancelada';
    default:
      return 'Desconhecida';
  }
}

export function originLabel(origin: ActivityOrigin): string {
  switch (origin) {
    case 'script':
      return 'Catálogo';
    case 'test':
      return 'Testes';
    case 'server':
      return 'Servidor';
  }
}

export function activityDetailPath(activity: Activity): string {
  switch (activity.origin) {
    case 'script':
      return `/projects/${encodeURIComponent(activity.projectId)}/scripts`;
    case 'test':
      return `/projects/${encodeURIComponent(activity.projectId)}/tests`;
    case 'server':
      return `/projects/${encodeURIComponent(activity.projectId)}`;
  }
}

export function formatInstant(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}
