import type { FastifyInstance } from 'fastify';

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
  | 'VALIDATION_ERROR';

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

export function registerApiErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({
      error: 'NOT_FOUND',
      message: 'Endpoint não encontrado.',
    });
  });

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

    request.log.error(
      {
        error,
      },
      'Unhandled API error',
    );

    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a operação.',
    });
  });
}
