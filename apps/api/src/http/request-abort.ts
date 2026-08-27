import type { IncomingMessage, ServerResponse } from 'node:http';

export interface HttpAbortScope {
  signal: AbortSignal;
  dispose(): void;
}

export function createHttpAbortScope(
  request: IncomingMessage,
  response: ServerResponse,
): HttpAbortScope {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  const onRequestAborted = () => abort();
  const onResponseClose = () => {
    if (!response.writableEnded) abort();
  };

  request.once('aborted', onRequestAborted);
  response.once('close', onResponseClose);

  if (request.aborted || (response.destroyed && !response.writableEnded)) {
    abort();
  }

  return {
    signal: controller.signal,
    dispose() {
      request.off('aborted', onRequestAborted);
      response.off('close', onResponseClose);
    },
  };
}
