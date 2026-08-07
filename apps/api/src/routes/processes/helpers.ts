import type {
  ProcessManager,
  ProcessManagerError,
  ProjectServerSettingsError,
  ProjectServerSettingsRepository,
} from '@dev-dashboard/process-manager';

import { ApiError } from '../../http/api-error.js';
import type { ProjectStore } from '../../store/project-store.js';
import type { ServerHealthCheckService } from '../../services/server-health-check-service.js';
import type { PortInspectorService } from '../../services/port-inspector-service.js';

export const processEnvelopeResponseSchema = (processSchema: object) => ({
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
  portInspectorService?: PortInspectorService;
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
  environment?: string | null;
}

export interface ProcessLogQuery {
  maxBytes?: number;
}

export function processManagerApiError(error: ProcessManagerError): ApiError {
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

export function requireProject(projectStore: ProjectStore, projectId: string) {
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

export function requireEnabledProject(
  projectStore: ProjectStore,
  projectId: string,
) {
  const project = requireProject(projectStore, projectId);

  if (!project.enabled) {
    throw new ApiError({
      statusCode: 409,
      code: 'PROJECT_DISABLED',
      message: 'O projeto está desativado.',
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
