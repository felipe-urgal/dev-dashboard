import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { onBeforeUnmount, ref } from 'vue';

import { MAX_TERMINAL_SCROLLBACK_LINES } from '../utils/terminal-limits';

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
  onExit: (exitCode: number | null, exitSignal: number | null) => void;
  onError: (message: string) => void;
}) {
  const terminalContainer = ref<HTMLDivElement | null>(null);
  const connecting = ref(false);

  let terminal: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let socket: WebSocket | undefined;

  function sendResize(): void {
    if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: 'resize',
        cols: terminal.cols,
        rows: terminal.rows,
      }),
    );
  }

  function mountTerminal(): void {
    if (!terminalContainer.value || terminal) return;
    terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontSize: 13,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
      lineHeight: 1.35,
      theme: { background: '#10131c', foreground: '#dbe0f2' },
      // Mantém uma janela recente no navegador. O buffer destacável completo
      // continua limitado e persistido no backend para reconexão.
      scrollback: MAX_TERMINAL_SCROLLBACK_LINES,
    });
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalContainer.value);
    fitAddon.fit();
    sendResize();
    // No primeiro paint o container às vezes ainda não assumiu a largura
    // final (troca de aba, layout do Card ainda assentando) e o fit()
    // acima mede menos colunas do que caberiam — reaplica no próximo frame,
    // quando o layout já estabilizou.
    requestAnimationFrame(() => {
      fitAddon?.fit();
      sendResize();
    });
    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit();
      sendResize();
    });
    resizeObserver.observe(terminalContainer.value);
  }

  function disposeTerminal(): void {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    terminal?.dispose();
    terminal = undefined;
    fitAddon = undefined;
  }

  function disconnect(): void {
    socket?.close(1000, 'Painel fechado');
    socket = undefined;
  }

  function connect(url: string): void {
    if (socket) return;
    connecting.value = true;
    const newSocket = new WebSocket(url);
    socket = newSocket;

    newSocket.addEventListener('open', () => {
      if (socket !== newSocket) return;
      connecting.value = false;
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
          mountTerminal();
          if (snapshot.buffer) terminal?.write(snapshot.buffer);
        });
      } else if (
        message.type === 'output' &&
        typeof message.data === 'string'
      ) {
        mountTerminal();
        terminal?.write(message.data);
      } else if (message.type === 'exit') {
        handlers.onExit(message.exitCode ?? null, message.exitSignal ?? null);
        terminal?.write(
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
      if (socket !== newSocket) return;
      socket = undefined;
      connecting.value = false;
    });

    newSocket.addEventListener('error', () => {
      if (socket !== newSocket) return;
      handlers.onError('A conexão com a execução falhou.');
    });
  }

  onBeforeUnmount(() => {
    disconnect();
    disposeTerminal();
  });

  return {
    terminalContainer,
    connecting,
    connect,
    disconnect,
    disposeTerminal,
  };
}
