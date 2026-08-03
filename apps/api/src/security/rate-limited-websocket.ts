import type { WebSocket } from 'ws';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_MESSAGES = 600;

export interface WebSocketMessageRateLimitOptions {
  windowMs?: number;
  maxMessages?: number;
  now?: () => number;
}

export function withWebSocketMessageRateLimit(
  socket: WebSocket,
  options: WebSocketMessageRateLimitOptions = {},
): WebSocket {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const now = options.now ?? Date.now;

  let windowStartedAt = now();
  let messageCount = 0;
  let limited = false;

  return new Proxy(socket, {
    get(target, property, receiver) {
      if (property === 'on') {
        return (event: string, listener: (...args: unknown[]) => void) => {
          if (event !== 'message') {
            target.on(event, listener);
            return receiver;
          }

          target.on('message', (...args: unknown[]) => {
            if (limited) return;

            const currentTime = now();
            if (currentTime - windowStartedAt >= windowMs) {
              windowStartedAt = currentTime;
              messageCount = 0;
            }

            messageCount += 1;
            if (messageCount > maxMessages) {
              limited = true;
              target.close(1008, 'Limite de mensagens LSP excedido');
              return;
            }

            listener(...args);
          });
          return receiver;
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
