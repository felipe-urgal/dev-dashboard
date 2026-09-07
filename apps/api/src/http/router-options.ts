import type { IncomingMessage, ServerResponse } from 'node:http';

const INVALID_PATH_RESPONSE = JSON.stringify({
  error: 'INVALID_PATH',
  message: 'Caminho inválido.',
});

export function handleMalformedUrl(
  _path: string,
  _request: IncomingMessage,
  response: ServerResponse,
): void {
  response.statusCode = 400;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(INVALID_PATH_RESPONSE);
}
