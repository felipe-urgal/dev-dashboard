import type { FastifyInstance } from 'fastify';

import type { WorkspaceRepositoryErrorCode } from '@dev-dashboard/core';

import type {
  ProcessManagerErrorCode,
  ProjectServerSettingsErrorCode,
} from '@dev-dashboard/process-manager';

export interface ApiErrorDetails {
  path?: string;
  message: string;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_FAVORITES_LIMIT_REACHED'
  | 'PROJECT_DISABLED_LIMIT_REACHED'
  | 'PROJECT_DISABLED'
  | 'EDITOR_NOT_AVAILABLE'
  | 'EDITOR_LAUNCH_FAILED'
  | 'BROWSER_TARGET_NOT_RUNNING'
  | 'BROWSER_NOT_AVAILABLE'
  | 'BROWSER_LAUNCH_FAILED'
  | 'FILE_PATH_INVALID'
  | 'FILE_OUTSIDE_PROJECT'
  | 'FILE_NOT_FOUND'
  | 'FILE_IGNORED'
  | 'FILE_NOT_DIRECTORY'
  | 'FILE_NOT_FILE'
  | 'FILE_TOO_LARGE'
  | 'FILE_BINARY'
  | 'FILE_NOT_READABLE'
  | 'FILE_NOT_WRITABLE'
  | 'FILE_VERSION_INVALID'
  | 'FILE_CHANGED_EXTERNALLY'
  | 'FILE_WRITE_FAILED'
  | 'FILE_SEARCH_INVALID'
  | 'WORKSPACE_EDIT_INVALID'
  | 'WORKSPACE_EDIT_LIMIT_EXCEEDED'
  | 'WORKSPACE_EDIT_CHANGED_EXTERNALLY'
  | 'WORKSPACE_EDIT_CONFIRMATION_REQUIRED'
  | 'WORKSPACE_EDIT_ROLLBACK_FAILED'
  | 'DOCKER_CONFIG_INVALID'
  | 'DOCKER_NOT_CONFIGURED'
  | 'DOCKER_UNAVAILABLE'
  | 'DOCKER_SERVICE_NOT_FOUND'
  | 'DOCKER_SERVICE_REQUIRES_BUILD'
  | 'DOCKER_CONFIRMATION_REQUIRED'
  | 'DOCKER_ACTION_FAILED'
  | 'DOCKER_PORT_CONFLICT'
  | 'DOCKER_SERVICE_EXITED'
  | 'DOCKER_BUILD_UNSUPPORTED'
  | 'PROCESS_START_FAILED'
  | 'WORKSPACE_CREATION_FAILED'
  | 'WORKSPACE_DISABLED'
  | 'WORKSPACE_PROCESS_RUNNING'
  | 'WORKSPACE_SCAN_FAILED'
  | 'DIRECTORY_OUTSIDE_ROOT'
  | 'INVALID_DIRECTORY'
  | 'PROJECT_FAVICON_NOT_FOUND'
  | 'GIT_COMMAND_FAILED'
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_DIFF_PATH_OUTSIDE_PROJECT'
  | 'GIT_DIFF_PATH_INVALID'
  | 'GIT_DIFF_PATH_NOT_IN_DIFF'
  | 'GIT_DIFF_RANGE_INVALID'
  | 'GIT_DIFF_LINES_UNAVAILABLE'
  | 'GIT_BRANCH_INVALID'
  | 'GIT_BRANCH_EXISTS'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_REMOTE_BRANCH_NOT_FOUND'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_NO_UPSTREAM'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_PULL_DIVERGED'
  | 'GIT_PULL_FAILED'
  | 'GIT_PUSH_REJECTED'
  | 'GIT_FORCE_PUSH_CURRENT_BRANCH_REQUIRED'
  | 'GIT_PROTECTED_BRANCH'
  | 'GIT_FORCE_WITH_LEASE_REJECTED'
  | 'GIT_PUSH_FAILED'
  | 'GIT_REMOTE_UNAVAILABLE'
  | 'GIT_REFERENCE_INVALID'
  | 'GIT_REFERENCE_NOT_FOUND'
  | 'GIT_COMMIT_FILE_NOT_FOUND'
  | 'GIT_SYNC_CONFIRMATION_REQUIRED'
  | 'GIT_SYNC_CONFLICT'
  | 'GIT_SYNC_DIVERGED'
  | 'GIT_SYNC_FAILED'
  | 'GIT_COMMIT_MESSAGE_INVALID'
  | 'GIT_NOTHING_TO_COMMIT'
  | 'GIT_COMMIT_FAILED'
  | 'GIT_FILE_PATH_INVALID'
  | 'GIT_FILE_NOT_FOUND'
  | 'GIT_FILE_OPERATION_NOT_ALLOWED'
  | 'GIT_FILE_MUTATION_FAILED'
  | 'GIT_PULL_REQUEST_NOT_PUBLISHED'
  | 'GIT_PULL_REQUEST_BRANCH_IS_DEFAULT'
  | 'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED'
  | 'GIT_PULL_REQUEST_ACTION_NOT_FOUND'
  | 'GIT_PULL_REQUEST_ACTION_INVALID_INPUT'
  | 'GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_PULL_REQUEST_MUTATION_FAILED'
  | 'TEST_COMMAND_NOT_FOUND'
  | 'TEST_START_FAILED'
  | 'TEST_FILE_TARGET_UNSUPPORTED'
  | 'TEST_FILE_NOT_FOUND'
  | 'TEST_CASE_TARGET_UNSUPPORTED'
  | 'TEST_NAME_PATTERN_UNSUPPORTED'
  | 'TEST_EXECUTION_NOT_FOUND'
  | 'TEST_EXECUTION_SUBSCRIBER_LIMIT'
  | 'DATABASE_ENVIRONMENT_NOT_FOUND'
  | 'DATABASE_SERVICE_ACTION_NOT_AVAILABLE'
  | 'DATABASE_SERVICE_ACTION_FAILED'
  | 'DATABASE_SNAPSHOT_UNSUPPORTED'
  | 'DATABASE_SNAPSHOT_TOOL_MISSING'
  | 'DATABASE_SNAPSHOT_NOT_FOUND'
  | 'DATABASE_SNAPSHOT_FAILED'
  | 'DATABASE_SNAPSHOT_TOO_LARGE'
  | 'DATABASE_RESTORE_CONFIRMATION_REQUIRED'
  | 'DATABASE_RESTORE_FAILED'
  | 'RAILS_MUTATION_UNSUPPORTED'
  | 'RAILS_MUTATION_CONFIRMATION_REQUIRED'
  | 'RAILS_MUTATION_FAILED'
  | 'RAILS_GENERATOR_INVALID_INPUT'
  | 'RAILS_GENERATOR_UNSUPPORTED'
  | 'RAILS_GENERATOR_CONFIRMATION_REQUIRED'
  | 'RAILS_GENERATOR_FAILED'
  | 'RAILS_WORKER_UNSUPPORTED'
  | 'RAILS_WORKER_RESTART_UNSUPPORTED'
  | 'SCRIPT_NOT_FOUND'
  | 'SCRIPT_DISABLED'
  | 'SCRIPT_CONFIRMATION_REQUIRED'
  | 'SCRIPT_VARIABLES_INVALID'
  | 'SCRIPT_ALREADY_RUNNING'
  | 'SCRIPT_EXECUTION_NOT_FOUND'
  | 'SCRIPT_MANAGER_AMBIGUOUS'
  | 'SCRIPT_MANAGER_NOT_FOUND'
  | 'SCRIPT_SUBSCRIBER_LIMIT'
  | 'LANGUAGE_SERVER_CONFIRMATION_INVALID'
  | 'LANGUAGE_SERVER_FAILED'
  | 'AI_ASSISTANT_INVALID_REQUEST'
  | 'AI_ASSISTANT_FAILED'
  | 'ENVIRONMENT_PROFILE_INVALID'
  | 'ENVIRONMENT_PROFILE_LIMIT_REACHED'
  | 'ENVIRONMENT_PROFILE_NOT_FOUND'
  | 'ENVIRONMENT_PROFILE_NAME_TAKEN'
  | 'BOOTSTRAP_NOT_ALLOWED'
  | 'INVALID_BROWSER_BOOTSTRAP'
  | 'ORIGIN_NOT_ALLOWED'
  | 'ORIGIN_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'INVALID_LOCAL_TOKEN'
  | WorkspaceRepositoryErrorCode
  | ProcessManagerErrorCode
  | ProjectServerSettingsErrorCode;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details: readonly ApiErrorDetails[] | undefined;

  public constructor(options: {
    statusCode: number;
    code: ApiErrorCode;
    message: string;
    details?: readonly ApiErrorDetails[];
  }) {
    super(options.message);

    this.name = 'ApiError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

function validationDetails(validation: unknown): ApiErrorDetails[] {
  if (!Array.isArray(validation)) {
    return [];
  }

  return validation.map((item) => {
    if (typeof item !== 'object' || item === null) {
      return {
        message: 'Valor inválido.',
      };
    }

    const record = item as Record<string, unknown>;

    const instancePath =
      typeof record.instancePath === 'string' ? record.instancePath : '';

    const params =
      typeof record.params === 'object' && record.params !== null
        ? (record.params as Record<string, unknown>)
        : undefined;

    const missingProperty =
      typeof params?.missingProperty === 'string'
        ? params.missingProperty
        : undefined;

    const path = [instancePath, missingProperty].filter(Boolean).join('/');

    const message =
      typeof record.message === 'string' ? record.message : 'Valor inválido.';

    return {
      ...(path
        ? {
            path,
          }
        : {}),
      message,
    };
  });
}

function errorValidation(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('validation' in error)) {
    return undefined;
  }

  return (
    error as {
      validation?: unknown;
    }
  ).validation;
}

function errorStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return undefined;
  }

  const statusCode = (
    error as {
      statusCode?: unknown;
    }
  ).statusCode;

  return typeof statusCode === 'number' ? statusCode : undefined;
}

function clientErrorCode(statusCode: number): ApiErrorCode {
  switch (statusCode) {
    case 401:
      return 'UNAUTHORIZED';

    case 403:
      return 'FORBIDDEN';

    case 404:
      return 'NOT_FOUND';

    case 409:
      return 'CONFLICT';

    default:
      return 'BAD_REQUEST';
  }
}

function clientErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 401:
      return 'Autenticação necessária.';

    case 403:
      return 'A operação não é permitida.';

    case 404:
      return 'Recurso não encontrado.';

    case 409:
      return 'A requisição conflita com o estado atual.';

    default:
      return 'A requisição não pôde ser processada.';
  }
}

export function registerApiErrorHandling(
  app: FastifyInstance,
  options: { registerNotFound?: boolean } = {},
): void {
  if (options.registerNotFound !== false) {
    app.setNotFoundHandler(async (_request, reply) => {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'Endpoint não encontrado.',
      });
    });
  }

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...(error.details
          ? {
              details: error.details,
            }
          : {}),
      });
    }

    const details = validationDetails(errorValidation(error));

    if (details.length > 0) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'A requisição possui dados inválidos.',
        details,
      });
    }

    const statusCode = errorStatusCode(error);

    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: clientErrorCode(statusCode),
        message: clientErrorMessage(statusCode),
      });
    }

    request.log.error(
      {
        err: error,
      },
      'Unhandled API error',
    );

    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a operação.',
    });
  });
}
