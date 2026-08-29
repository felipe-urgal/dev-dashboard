import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '../src/api/core';
import {
  formatDatabaseExplorerError,
  isDatabaseExplorerErrorCode,
} from '../src/api/database-explorer-errors';

describe('database explorer error contract', () => {
  it('formata códigos conhecidos sem depender da mensagem retornada pelo backend', () => {
    const error = new ApiRequestError({
      status: 400,
      code: 'DATABASE_EXPLORER_CREDENTIALS_REJECTED',
      message: 'mensagem que pode mudar no backend',
    });

    expect(formatDatabaseExplorerError(error, 'fallback')).toBe(
      'Não foi possível conectar: confira o usuário e a senha informados.',
    );
  });

  it.each([
    'DATABASE_EXPLORER_DRIVER_UNSUPPORTED',
    'DATABASE_EXPLORER_REMOTE_HOST_NOT_ALLOWED',
    'DATABASE_EXPLORER_CONNECTION_INVALID',
    'DATABASE_EXPLORER_QUERY_INVALID',
    'DATABASE_EXPLORER_CLIENT_UNAVAILABLE',
    'DATABASE_EXPLORER_CREDENTIALS_REJECTED',
    'DATABASE_EXPLORER_CONNECTION_FAILED',
    'DATABASE_EXPLORER_DATABASE_UNAVAILABLE',
    'DATABASE_EXPLORER_COMMAND_FAILED',
    'DATABASE_EXPLORER_ABORTED',
    'SESSION_EXPIRED',
  ])('reconhece o código estável %s', (code) => {
    expect(isDatabaseExplorerErrorCode(code)).toBe(true);
  });

  it('preserva a mensagem de ApiRequestError fora do contrato do explorer', () => {
    const error = new ApiRequestError({
      status: 408,
      code: 'TIMEOUT',
      message: 'A API demorou para responder. Tente novamente.',
    });

    expect(formatDatabaseExplorerError(error, 'fallback')).toBe(
      'A API demorou para responder. Tente novamente.',
    );
  });

  it('preserva erros genéricos sem interpretar texto ou código', () => {
    expect(
      formatDatabaseExplorerError(new Error('Falha inesperada.'), 'fallback'),
    ).toBe('Falha inesperada.');
  });

  it('não aceita objetos que apenas imitam o contrato de ApiRequestError', () => {
    expect(
      formatDatabaseExplorerError(
        {
          code: 'DATABASE_EXPLORER_CREDENTIALS_REJECTED',
          message: 'mensagem solta',
        },
        'fallback seguro',
      ),
    ).toBe('fallback seguro');
  });

  it('usa fallback determinístico para valores e códigos malformados', () => {
    expect(formatDatabaseExplorerError(null, 'fallback seguro')).toBe(
      'fallback seguro',
    );
    expect(isDatabaseExplorerErrorCode('OUTRO_CODIGO')).toBe(false);
    expect(isDatabaseExplorerErrorCode('toString')).toBe(false);
    expect(isDatabaseExplorerErrorCode(undefined)).toBe(false);
  });
});
