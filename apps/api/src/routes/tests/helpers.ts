import type {
  ProcessManager,
  ProcessManagerError,
} from '@dev-dashboard/process-manager';
import type { TestExecutionEvent } from '@dev-dashboard/contracts';

import { ApiError } from '../../http/api-error.js';
import type { ProjectStore } from '../../store/project-store.js';
import type { ProjectCoverageHistoryService } from '../../services/project-coverage-history-service.js';
import type { ProjectCoverageService } from '../../services/project-coverage-service.js';
import type { ProjectTestPtyService } from '../../services/project-test-pty-service.js';
import {
  TestFileError,
  type TestDetectionService,
} from '../../services/test-detection-service.js';
import {
  TestExecutionSubscriptionError,
  type TestExecutionHistoryService,
} from '../../services/test-execution-history-service.js';

export interface ProjectParams {
  projectId: string;
}

export interface TestCommandParams extends ProjectParams {
  commandId: string;
}

export interface TestFileStartBody {
  path: string;
  line?: number;
  namePattern?: string;
}

export interface TestLogQuery {
  maxBytes?: number;
}

export interface TestOverviewQuery {
  refresh?: boolean;
}

export interface TestHistoryQuery {
  page?: number;
  pageSize?: number;
}

export interface TestRouteOptions {
  processManager: ProcessManager;
  projectStore: ProjectStore;
  testDetectionService: TestDetectionService;
  testExecutionHistoryService: TestExecutionHistoryService;
  projectTestPtyService: ProjectTestPtyService;
  projectCoverageService?: ProjectCoverageService;
  projectCoverageHistoryService?: ProjectCoverageHistoryService;
}

export const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

export const testCommandParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'commandId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    commandId: { type: 'string', minLength: 1, maxLength: 80 },
  },
} as const;

export const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

export const emptyQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

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

export function testFileApiError(error: TestFileError): ApiError {
  const statuses: Record<string, number> = {
    TEST_FILE_TARGET_UNSUPPORTED: 400,
    TEST_FILE_NOT_FOUND: 404,
    TEST_CASE_TARGET_UNSUPPORTED: 400,
    TEST_NAME_PATTERN_UNSUPPORTED: 400,
  };
  return new ApiError({
    statusCode: statuses[error.code] ?? 400,
    code: error.code,
    message: error.message,
  });
}

export function testExecutionSubscriptionApiError(
  error: TestExecutionSubscriptionError,
): ApiError {
  const statuses: Record<string, number> = {
    TEST_EXECUTION_NOT_FOUND: 404,
    TEST_EXECUTION_SUBSCRIBER_LIMIT: 429,
  };
  return new ApiError({
    statusCode: statuses[error.code] ?? 400,
    code: error.code,
    message: error.message,
  });
}

export function serializeTestExecutionEvent(event: TestExecutionEvent): string {
  if (event.type === 'state') {
    const managedProcess = event.process;
    return JSON.stringify({
      type: 'state',
      process: {
        id: managedProcess.id,
        projectId: managedProcess.projectId,
        ...(managedProcess.workspaceId !== undefined
          ? { workspaceId: managedProcess.workspaceId }
          : {}),
        kind: managedProcess.kind,
        status: managedProcess.status,
        ...(managedProcess.pid !== undefined
          ? { pid: managedProcess.pid }
          : {}),
        ...(managedProcess.port !== undefined
          ? { port: managedProcess.port }
          : {}),
        ...(managedProcess.url !== undefined
          ? { url: managedProcess.url }
          : {}),
        ...(managedProcess.urls !== undefined
          ? { urls: managedProcess.urls }
          : {}),
        ...(managedProcess.command !== undefined
          ? { command: managedProcess.command }
          : {}),
        ...(managedProcess.args !== undefined
          ? { args: managedProcess.args }
          : {}),
        ...(managedProcess.startedAt !== undefined
          ? { startedAt: managedProcess.startedAt }
          : {}),
        ...(managedProcess.stoppedAt !== undefined
          ? { stoppedAt: managedProcess.stoppedAt }
          : {}),
        ...(managedProcess.exitCode !== undefined
          ? { exitCode: managedProcess.exitCode }
          : {}),
      },
    });
  }
  const log = event.log;
  return JSON.stringify({
    type: 'log',
    log: {
      projectId: log.projectId,
      processId: log.processId,
      content: log.content,
      sizeBytes: log.sizeBytes,
      truncated: log.truncated,
      masked: log.masked,
      redactionCount: log.redactionCount,
      readAt: log.readAt,
      ...(log.updatedAt !== undefined ? { updatedAt: log.updatedAt } : {}),
    },
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
