import type { Project } from '@dev-dashboard/contracts';
import type {
  ProcessManager,
  ProcessManagerError,
  ProjectServerSettingsError,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ApiError } from '../../http/api-error.js';
import type { DockerComposeService } from '../../services/docker-compose-service.js';
import type { ProjectStore } from '../../store/project-store.js';
import type { ServerHealthCheckService } from '../../services/server-health-check-service.js';

export const processEnvelopeResponseSchema = (
  processSchema: object,
) => ({
  type: 'object',
  additionalProperties: false,
  required: ['process'],
  properties: {
    process: processSchema,
  },
});

export interface ProcessRouteOptions {
  processManager: ProcessManager;
  serverSettingsRepository: ProjectServerSettingsRepository;
  serverHealthCheckService: ServerHealthCheckService;
  projectStore: ProjectStore;
  dockerComposeService?: DockerComposeService;
}

export interface ProjectParams {
  projectId: string;
}

export interface StartProcessBody {
  port?: number | null;
}

export interface SaveServerSettingsBody {
  port?: number | null;
  healthCheckPath?: string | null;
}

export interface ProcessLogQuery {
  maxBytes?: number;
}

export function processManagerApiError(
  error: ProcessManagerError,
): ApiError {
  switch (error.code) {
    case 'PROCESS_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: error.code,
        message: error.message,
      });

    case 'PROCESS_ALREADY_RUNNING':
    case 'PROCESS_IDENTITY_MISMATCH':
    case 'PROCESS_STOP_TIMEOUT':
    case 'PORT_NOT_AVAILABLE':
      return new ApiError({
        statusCode: 409,
        code: error.code,
        message: error.message,
      });

    default:
      return new ApiError({
        statusCode: 400,
        code: error.code,
        message: error.message,
      });
  }
}

export function serverSettingsApiError(
  error: ProjectServerSettingsError,
): ApiError {
  return new ApiError({
    statusCode: 400,
    code: error.code,
    message: error.message,
  });
}

function publishesHostPort(mapping: string, port: number): boolean {
  const withoutProtocol = mapping.replace(/\/(?:tcp|udp|sctp)$/i, '');
  const segments = withoutProtocol.split(':');

  // Na sintaxe curta do Compose, o penúltimo segmento é sempre a porta
  // publicada no host. Isso cobre tanto `3000:3000` quanto os formatos com
  // endereço explícito (`127.0.0.1:3000:3000` e `[::1]:3000:3000`). Uma porta
  // isolada representa apenas a porta do container e não prova conflito no host.
  if (segments.length < 2) return false;

  return segments.at(-2) === String(port);
}

// Quando o bind da porta do servidor local falha, o container Docker do próprio
// projeto (docker-compose.dev.yml publicando a mesma porta no host) é a causa mais
// comum e a menos óbvia para quem só olha o erro genérico de porta ocupada.
export async function describeDockerPortConflict(
  dockerComposeService: DockerComposeService | undefined,
  project: Project,
  port: number,
): Promise<string | undefined> {
  if (!dockerComposeService) return undefined;

  try {
    const overview = await dockerComposeService.overview(project);
    const conflicting = overview.services.find((service) =>
      service.running &&
      service.ports.some((mapping) => publishesHostPort(mapping, port)));

    if (!conflicting) return undefined;

    return `A porta ${port} já está sendo usada pelo container Docker "${conflicting.name}" deste projeto. Pare o serviço no painel Docker ou configure outra porta para o servidor local.`;
  } catch {
    return undefined;
  }
}

export function requireProject(
  projectStore: ProjectStore,
  projectId: string,
) {
  const project = projectStore.findProject(projectId);

  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }

  return project;
}

export const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;
