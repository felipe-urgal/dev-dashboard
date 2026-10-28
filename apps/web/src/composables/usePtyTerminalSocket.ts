import { onBeforeUnmount, ref } from 'vue';

import { useXtermSession } from './useXtermSession';

/**
 * Conexão WebSocket + terminal (xterm.js) compartilhada pelos painéis que
 * rodam um comando de execução única num PTY destacável (Testes, Migrations
 * Rails). O protocolo de frames é o mesmo em todos: `ready` (snapshot com
 * buffer acumulado), `output` (bytes novos), `exit` (encerramento) e `error`.
 * `onReady`/`onExit`/`onError` cuidam só do estado específico de cada painel
 * (ex. qual operação está rodando); a montagem do terminal e a escrita da
 * saída são genéricas e ficam aqui.
 */
export function usePtyTerminalSocket<
  TSnapshot extends { buffer: string },
>(handlers: {
  onReady: (snapshot: TSnapshot) => void;
  onExit: (
    exitCode: number | null,
    exitSignal: number | null,
    snapshot?: TSnapshot,
  ) => void;
  onError: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const terminalContainer = ref<HTMLDivElement | null>(null);
  const connecting = ref(false);

  let socket: WebSocket | undefined;
  const manuallyClosedSockets = new WeakSet<WebSocket>();

  function sendResize(size: { cols: number; rows: number }): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'resize', ...size }));
  }

  const session = useXtermSession({
    container: terminalContainer,
    lineHeight: 1.35,
    onResize: sendResize,
  });

  function disconnect(): void {
    const current = socket;
    if (!current) return;
    manuallyClosedSockets.add(current);
    current.close(1000, 'Painel fechado');
    if (socket === current) socket = undefined;
  }

  function connect(url: string): void {
    if (socket) return;
    connecting.value = true;
    const newSocket = new WebSocket(url);
    socket = newSocket;

    newSocket.addEventListener('open', () => {
      if (socket !== newSocket) return;
      connecting.value = false;
      handlers.onOpen?.();
    });

    newSocket.addEventListener('message', (event) => {
      if (socket !== newSocket || typeof event.data !== 'string') return;
      let message: {
        type?: string;
        data?: string;
        snapshot?: TSnapshot;
        exitCode?: number | null;
        exitSignal?: number | null;
        message?: string;
      };
      try {
        message = JSON.parse(event.data) as typeof message;
      } catch {
        return;
      }

      if (message.type === 'ready' && message.snapshot) {
        const snapshot = message.snapshot;
        handlers.onReady(snapshot);
        requestAnimationFrame(() => {
          session.mount();
          if (snapshot.buffer) session.write(snapshot.buffer);
        });
      } else if (
        message.type === 'output' &&
        typeof message.data === 'string'
      ) {
        session.mount();
        session.write(message.data);
      } else if (message.type === 'exit') {
        handlers.onExit(
          message.exitCode ?? null,
          message.exitSignal ?? null,
          message.snapshot,
        );
        session.write(
          `\r\n\x1b[90m[execução encerrada, código ${message.exitCode ?? '—'}]\x1b[0m\r\n`,
        );
      } else if (
        message.type === 'error' &&
        typeof message.message === 'string'
      ) {
        handlers.onError(message.message);
      }
    });

    newSocket.addEventListener('close', () => {
      const manual = manuallyClosedSockets.has(newSocket);
      manuallyClosedSockets.delete(newSocket);
      if (socket !== newSocket) return;
      socket = undefined;
      connecting.value = false;
      if (!manual) handlers.onClose?.();
    });

    newSocket.addEventListener('error', () => {
      if (socket !== newSocket) return;
      handlers.onError('A conexão com a execução falhou.');
    });
  }

  onBeforeUnmount(disconnect);

  return {
    terminalContainer,
    connecting,
    connect,
    disconnect,
    disposeTerminal: session.dispose,
    hasTerminalSelection: session.hasSelection,
    copyTerminalSelection: session.copySelection,
    copyShortcutLabel: session.copyShortcutLabel,
  };
}
