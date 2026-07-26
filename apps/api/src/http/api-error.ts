import type { FastifyInstance } from 'fastify';

import type {
  WorkspaceRepositoryErrorCode,
} from '@dev-dashboard/core';

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
  | 'PROCESS_START_FAILED'
  | 'WORKSPACE_CREATION_FAILED'
  | 'WORKSPACE_DISABLED'
  | 'WORKSPACE_PROCESS_RUNNING'
  | 'WORKSPACE_SCAN_FAILED'
  | 'DIRECTORY_OUTSIDE_ROOT'
  | 'INVALID_DIRECTORY'
  | 'PROJECT_FAVICON_NOT_FOUND'
  | 'GIT_COMMAND_FAILED'
  | 'TEST_COMMAND_NOT_FOUND'
  | 'TEST_START_FAILED'
  | 'DATABASE_ENVIRONMENT_NOT_FOUND'
  | 'DATABASE_START_NOT_AVAILABLE'
  | 'DATABASE_START_FAILED'
  | 'SCRIPT_NOT_FOUND'
  | 'SCRIPT_DISABLED'
  | 'SCRIPT_CONFIRMATION_REQUIRED'
  | 'SCRIPT_ALREADY_RUNNING'
  | 'SCRIPT_EXECUTION_NOT_FOUND'
  | 'SCRIPT_MANAGER_AMBIGUOUS'
  | 'SCRIPT_MANAGER_NOT_FOUND'
  | 'SCRIPT_SUBSCRIBER_LIMIT'
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
      typeof record.instancePath === 'string'
        ? record.instancePath
        : '';

    const params =
      typeof record.params === 'object' && record.params !== null
        ? (record.params as Record<string, unknown>)
        : undefined;

    const missingProperty =
      typeof params?.missingProperty === 'string'
        ? params.missingProperty
        : undefined;

    const path = [instancePath, missingProperty]
      .filter(Boolean)
      .join('/');

    const message =
      typeof record.message === 'string'
        ? record.message
        : 'Valor inválido.';

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
  if (
    typeof error !== 'object' ||
    error === null ||
    !('validation' in error)
  ) {
    return undefined;
  }

  return (
    error as {
      validation?: unknown;
    }
  ).validation;
}

function errorStatusCode(
  error: unknown
): number | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("statusCode" in error)
  ) {
    return undefined;
  }

  const statusCode = (
    error as {
      statusCode?: unknown;
    }
  ).statusCode;

  return typeof statusCode === "number"
    ? statusCode
    : undefined;
}

function clientErrorCode(
  statusCode: number
): ApiErrorCode {
  switch (statusCode) {
    case 401:
      return "UNAUTHORIZED";

    case 403:
      return "FORBIDDEN";

    case 404:
      return "NOT_FOUND";

    case 409:
      return "CONFLICT";

    default:
      return "BAD_REQUEST";
  }
}

function clientErrorMessage(
  statusCode: number
): string {
  switch (statusCode) {
    case 401:
      return "Autenticação necessária.";

    case 403:
      return "A operação não é permitida.";

    case 404:
      return "Recurso não encontrado.";

    case 409:
      return "A requisição conflita com o estado atual.";

    default:
      return "A requisição não pôde ser processada.";
  }
}


export function registerApiErrorHandling(app: FastifyInstance, options: { registerNotFound?: boolean } = {}): void {
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

const statusCode =
  errorStatusCode(error);

if (
  statusCode !== undefined &&
  statusCode >= 400 &&
  statusCode < 500
) {
  return reply.code(statusCode).send({
    error: clientErrorCode(statusCode),
    message:
      clientErrorMessage(statusCode)
  });
}

request.log.error(
  {
    err: error
  },
  "Unhandled API error"
);

return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a operação.',
    });
  });
}
