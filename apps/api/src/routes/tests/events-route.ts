import type { FastifyInstance } from 'fastify';

import { TestExecutionSubscriptionError } from '../../services/test-execution-history-service.js';
import {
  projectParamsSchema,
  requireProject,
  serializeTestExecutionEvent,
  testExecutionSubscriptionApiError,
  type ProjectParams,
  type TestRouteOptions,
} from './helpers.js';

export function registerTestEventsRoute(
  app: FastifyInstance,
  options: TestRouteOptions,
): void {
  const { projectStore, testExecutionHistoryService } = options;

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/process/events',
    {
      schema: {
        params: projectParamsSchema,
      },
    },
    async (request, reply) => {
      const project = requireProject(projectStore, request.params.projectId);

      let unsubscribe = (): void => undefined;
      let heartbeat: NodeJS.Timeout | undefined;
      let connected = false;
      let closeRequested = false;
      const pending: string[] = [];
      const close = (): void => {
        if (!connected) { closeRequested = true; return; }
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      const write = (frame: string): void => {
        // Não acumulamos snapshots quando o consumidor deixa de acompanhar o ritmo.
        if (!reply.raw.write(frame)) close();
      };

      try {
        unsubscribe = await testExecutionHistoryService.subscribe(project.id, {
          send: (event) => {
            const frame = `event: ${event.type}\ndata: ${serializeTestExecutionEvent(event)}\n\n`;
            if (connected) write(frame);
            else pending.push(frame);
          },
          close,
        });
      } catch (error) {
        if (error instanceof TestExecutionSubscriptionError) {
          throw testExecutionSubscriptionApiError(error);
        }
        throw error;
      }

      // A autenticação e os limites são validados antes de assumir a resposta contínua.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      connected = true;
      for (const frame of pending) write(frame);
      heartbeat = setInterval(() => write(': acompanhamento ativo\n\n'), 15_000);
      heartbeat.unref();
      reply.raw.once('close', close);
      if (closeRequested) close();
    },
  );
}
