import { ApiRequestError } from './core';

const DATABASE_EXPLORER_ERROR_MESSAGES = {
  DATABASE_EXPLORER_DRIVER_UNSUPPORTED:
    'Este banco ainda não é suportado pelo explorador.',
  DATABASE_EXPLORER_REMOTE_HOST_NOT_ALLOWED:
    'Por segurança, o explorador aceita somente bancos locais.',
  DATABASE_EXPLORER_CONNECTION_INVALID:
    'Os dados de conexão informados são inválidos.',
  DATABASE_EXPLORER_QUERY_INVALID:
    'A consulta informada não é válida para leitura.',
  DATABASE_EXPLORER_CLIENT_UNAVAILABLE:
    'O cliente deste banco não está instalado nesta máquina.',
  DATABASE_EXPLORER_CREDENTIALS_REJECTED:
    'Não foi possível conectar: confira o usuário e a senha informados.',
  DATABASE_EXPLORER_CONNECTION_FAILED:
    'Não foi possível conectar: verifique se o serviço está instalado e em execução.',
  DATABASE_EXPLORER_DATABASE_UNAVAILABLE:
    'O banco informado não existe ou o usuário não tem acesso a ele.',
  DATABASE_EXPLORER_COMMAND_FAILED:
    'Não foi possível executar a operação no banco.',
  DATABASE_EXPLORER_ABORTED: 'Consulta cancelada.',
  SESSION_EXPIRED:
    'A sessão do Database Explorer expirou. Conecte-se novamente para continuar.',
} as const;

export type DatabaseExplorerErrorCode =
  keyof typeof DATABASE_EXPLORER_ERROR_MESSAGES;

export function isDatabaseExplorerErrorCode(
  value: string | undefined,
): value is DatabaseExplorerErrorCode {
  return (
    value !== undefined &&
    Object.hasOwn(DATABASE_EXPLORER_ERROR_MESSAGES, value)
  );
}

export function formatDatabaseExplorerError(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ApiRequestError) {
    if (isDatabaseExplorerErrorCode(error.code)) {
      return DATABASE_EXPLORER_ERROR_MESSAGES[error.code];
    }
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}
