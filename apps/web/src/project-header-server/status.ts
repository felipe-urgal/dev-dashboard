import type { ManagedProcessSnapshot } from './types';

export function statusDescription(process: ManagedProcessSnapshot | null): {
  label: string;
  detail: string;
  tone: string;
} {
  const detail = process?.port
    ? `porta ${process.port}`
    : process?.pid
      ? `PID ${process.pid}`
      : 'sem processo ativo';

  switch (process?.status) {
    case 'running':
      return { label: 'Servidor ativo', detail, tone: 'running' };
    case 'starting':
      return { label: 'Servidor iniciando', detail, tone: 'starting' };
    case 'stopping':
      return { label: 'Servidor parando', detail, tone: 'stopping' };
    case 'failed':
      return { label: 'Servidor falhou', detail, tone: 'failed' };
    default:
      return { label: 'Servidor parado', detail, tone: 'stopped' };
  }
}
