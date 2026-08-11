import type { FastifyReply } from 'fastify';

import type { ProcessLogSnapshot } from '@dev-dashboard/contracts';

const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

function snapshotKey(log: ProcessLogSnapshot): string {
  return `${log.updatedAt ?? ''}:${log.sizeBytes}`;
}

/**
 * Transforma leitura de log por polling num fluxo SSE de push: o cliente
 * recebe um snapshot assim que conecta e outro sempre que `readNext`
 * detecta mudança (tamanho/`updatedAt`), sem precisar ficar reconsultando.
 * `readNext` continua sendo a mesma leitura por arquivo já usada pela rota
 * request/response (`readManagedLog`/`readWorkerLog`) — aqui só trocamos
 * quem inicia a leitura (servidor, não o navegador).
 */
export function streamLogSnapshots(
  reply: FastifyReply,
  initial: ProcessLogSnapshot,
  readNext: () => Promise<ProcessLogSnapshot>,
): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let lastKey = '';

  const close = (): void => {
    clearInterval(poll);
    clearInterval(heartbeat);
    if (!reply.raw.writableEnded) reply.raw.end();
  };

  const send = (log: ProcessLogSnapshot): void => {
    lastKey = snapshotKey(log);
    if (!reply.raw.write(`data: ${JSON.stringify(log)}\n\n`)) close();
  };

  // `poll`/`heartbeat` precisam existir antes do primeiro `send`, já que uma
  // falha de escrita nesse primeiro envio já chama `close` (que os limpa).
  const poll = setInterval(() => {
    readNext()
      .then((log) => {
        if (snapshotKey(log) !== lastKey) send(log);
      })
      .catch(close);
  }, POLL_INTERVAL_MS);
  poll.unref();

  const heartbeat = setInterval(
    () => reply.raw.write(': acompanhamento ativo\n\n'),
    HEARTBEAT_INTERVAL_MS,
  );
  heartbeat.unref();

  send(initial);
  reply.raw.once('close', close);
}
