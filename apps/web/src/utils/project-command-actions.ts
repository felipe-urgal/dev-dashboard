import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

export type ProjectCommandActionId = 'server-start' | 'server-stop';
export type ProjectCommandRisk = 'reversivel' | 'atencao';

export interface ProjectCommandAction {
  id: ProjectCommandActionId;
  label: string;
  description: string;
  risk: ProjectCommandRisk;
}

export function projectCommandActions(
  project: Project,
  process: ManagedProcess | null,
): ProjectCommandAction[] {
  if (!project.capabilities.includes('server')) return [];

  const status = process?.status ?? 'stopped';
  if (status === 'running' || status === 'starting' || status === 'stopping') {
    return status === 'stopping'
      ? []
      : [{
          id: 'server-stop',
          label: 'Parar servidor',
          description: `Interromper o servidor de ${project.name}`,
          risk: 'atencao',
        }];
  }

  return [{
    id: 'server-start',
    label: 'Iniciar servidor',
    description: `Executar o servidor de ${project.name}`,
    risk: 'reversivel',
  }];
}
