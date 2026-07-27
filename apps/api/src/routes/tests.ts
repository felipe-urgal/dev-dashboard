import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
} from 'fastify';

import {
  ProcessManagerError,
  type ProcessManager,
} from '@dev-dashboard/process-manager';

import type { TestExecutionEvent } from '@dev-dashboard/contracts';

import { ApiError } from '../http/api-error.js';
import type { ProjectStore } from '../store/project-store.js';
import { TestFileError, type TestDetectionService } from '../services/test-detection-service.js';
import { TestExecutionSubscriptionError, type TestExecutionHistoryService } from '../services/test-execution-history-service.js';

import {
  commonErrorResponseSchemas,
  managedProcessResponseSchema,
  nullableManagedProcessResponseSchema,
  processLogSnapshotResponseSchema,
  projectTestFileResponseSchema,
  projectTestOverviewResponseSchema,
  testExecutionHistoryResponseSchema,
} from '../http/response-schemas.js';

interface ProjectParams {
  projectId: string;
}

interface TestCommandParams extends ProjectParams {
  commandId: string;
}

interface TestFileStartBody {
  path: string;
}

interface TestLogQuery {
  maxBytes?: number;
}

interface TestOverviewQuery {
  refresh?: boolean;
}

interface TestHistoryQuery {
  page?: number;
  pageSize?: number;
}

interface TestRouteOptions extends FastifyPluginOptions {
  processManager: ProcessManager;
  projectStore: ProjectStore;
  testDetectionService: TestDetectionService;
  testExecutionHistoryService: TestExecutionHistoryService;
}

const projectParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
  },
} as const;

const testCommandParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'commandId'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    commandId: { type: 'string', minLength: 1, maxLength: 80 },
  },
} as const;

const emptyBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const emptyQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

function processManagerApiError(
  error: ProcessManagerError,
): ApiError {
  switch (error.code) {
    case 'PROCESS_NOT_FOUND':
      return new ApiError({
        statusCode: 404,
        code: error.code,
        message: error.message,
      });
    case 'PROCESS_ALREADY_RUNNING':
    case 'PROCESS_IDENTITY_MISMATCH':
    case 'PROCESS_STOP_TIMEOUT':
      return new ApiError({
        statusCode: 409,
        code: error.code,
        message: error.message,
      });
    default:
      return new ApiError({
        statusCode: 400,
        code: error.code,
        message: error.message,
      });
  }
}

function testFileApiError(error: TestFileError): ApiError {
  const statuses: Record<string, number> = {
    TEST_FILE_TARGET_UNSUPPORTED: 400,
    TEST_FILE_NOT_FOUND: 404,
  };
  return new ApiError({
    statusCode: statuses[error.code] ?? 400,
    code: error.code,
    message: error.message,
  });
}

function testExecutionSubscriptionApiError(error: TestExecutionSubscriptionError): ApiError {
  const statuses: Record<string, number> = {
    TEST_EXECUTION_NOT_FOUND: 404,
    TEST_EXECUTION_SUBSCRIBER_LIMIT: 429,
  };
  return new ApiError({
    statusCode: statuses[error.code] ?? 400,
    code: error.code,
    message: error.message,
  });
}

function serializeTestExecutionEvent(event: TestExecutionEvent): string {
  if (event.type === 'state') {
    const managedProcess = event.process;
    return JSON.stringify({
      type: 'state',
      process: {
        id: managedProcess.id,
        projectId: managedProcess.projectId,
        ...(managedProcess.workspaceId !== undefined ? { workspaceId: managedProcess.workspaceId } : {}),
        kind: managedProcess.kind,
        status: managedProcess.status,
        ...(managedProcess.pid !== undefined ? { pid: managedProcess.pid } : {}),
        ...(managedProcess.port !== undefined ? { port: managedProcess.port } : {}),
        ...(managedProcess.url !== undefined ? { url: managedProcess.url } : {}),
        ...(managedProcess.urls !== undefined ? { urls: managedProcess.urls } : {}),
        ...(managedProcess.command !== undefined ? { command: managedProcess.command } : {}),
        ...(managedProcess.args !== undefined ? { args: managedProcess.args } : {}),
        ...(managedProcess.startedAt !== undefined ? { startedAt: managedProcess.startedAt } : {}),
        ...(managedProcess.stoppedAt !== undefined ? { stoppedAt: managedProcess.stoppedAt } : {}),
        ...(managedProcess.exitCode !== undefined ? { exitCode: managedProcess.exitCode } : {}),
      },
    });
  }
  const log = event.log;
  return JSON.stringify({
    type: 'log',
    log: {
      projectId: log.projectId,
      processId: log.processId,
      content: log.content,
      sizeBytes: log.sizeBytes,
      truncated: log.truncated,
      masked: log.masked,
      redactionCount: log.redactionCount,
      readAt: log.readAt,
      ...(log.updatedAt !== undefined ? { updatedAt: log.updatedAt } : {}),
    },
  });
}

function requireProject(
  projectStore: ProjectStore,
  projectId: string,
) {
  const project = projectStore.findProject(projectId);
  if (!project) {
    throw new ApiError({
      statusCode: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    });
  }
  return project;
}

export const testRoutes: FastifyPluginAsync<TestRouteOptions> = async (
  app,
  options,
) => {
  const { processManager, projectStore, testDetectionService, testExecutionHistoryService } = options;

  app.get<{ Params: ProjectParams; Querystring: TestOverviewQuery }>(
    '/projects/:projectId/tests',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            refresh: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['tests'],
            properties: {
              tests: projectTestOverviewResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      if (request.query.refresh) {
        testDetectionService.invalidate(project.id);
      }
      const tests = await testDetectionService.getOverview(project);
      return { tests };
    },
  );

  app.get<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/process',
    {
      schema: {
        params: projectParamsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['process'],
            properties: {
              process: nullableManagedProcessResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const managedProcess = await processManager.getTestProcess(project.id);
      return { process: managedProcess };
    },
  );

  app.get<{ Params: ProjectParams; Querystring: TestLogQuery }>(
    '/projects/:projectId/tests/process/logs',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            maxBytes: {
              type: 'integer',
              minimum: 1,
              maximum: 262_144,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['log'],
            properties: {
              log: processLogSnapshotResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const log = await processManager.readTestLog(project.id, {
          ...(request.query.maxBytes !== undefined
            ? { maxBytes: request.query.maxBytes }
            : {}),
        });
        return { log };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/process/logs',
    {
      schema: {
        params: projectParamsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['log'],
            properties: {
              log: processLogSnapshotResponseSchema,
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const log = await processManager.clearTestLog(project.id);
        return { log };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );

  app.post<{ Params: TestCommandParams }>(
    '/projects/:projectId/tests/:commandId/start',
    {
      schema: {
        params: testCommandParamsSchema,
        body: emptyBodySchema,
        querystring: emptyQuerystringSchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['process'],
            properties: { process: managedProcessResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(projectStore, request.params.projectId);
      const resolved = await testDetectionService.resolveCommand(
        project,
        request.params.commandId,
      );

      if (!resolved) {
        throw new ApiError({
          statusCode: 404,
          code: 'TEST_COMMAND_NOT_FOUND',
          message: 'Comando de teste não encontrado para este projeto.',
        });
      }

      try {
        await testExecutionHistoryService.reconcile(project.id);
        const managedProcess = await processManager.startTest(project, {
          id: request.params.commandId,
          command: resolved.command,
          args: resolved.args,
        });
        await testExecutionHistoryService.recordStart(project.id, managedProcess);
        return reply.code(201).send({ process: managedProcess });
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        request.log.error(
          { err: error, projectId: project.id },
          'Test start failed',
        );
        throw new ApiError({
          statusCode: 500,
          code: 'TEST_START_FAILED',
          message: 'Não foi possível iniciar a execução dos testes.',
        });
      }
    },
  );

  app.get<{ Params: TestCommandParams }>(
    '/projects/:projectId/tests/:commandId/files',
    {
      schema: {
        params: testCommandParamsSchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['files'],
            properties: {
              files: { type: 'array', items: projectTestFileResponseSchema },
            },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const files = await testDetectionService.listTestFiles(
        project,
        request.params.commandId,
      );

      if (!files) {
        throw new ApiError({
          statusCode: 404,
          code: 'TEST_COMMAND_NOT_FOUND',
          message: 'Comando de teste não encontrado para este projeto.',
        });
      }

      return { files };
    },
  );

  app.post<{ Params: TestCommandParams; Body: TestFileStartBody }>(
    '/projects/:projectId/tests/:commandId/files/start',
    {
      schema: {
        params: testCommandParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1, maxLength: 2048 },
          },
        },
        querystring: emptyQuerystringSchema,
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['process'],
            properties: { process: managedProcessResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request, reply) => {
      const project = requireProject(projectStore, request.params.projectId);

      let resolved;
      try {
        resolved = await testDetectionService.resolveFileCommand(
          project,
          request.params.commandId,
          request.body.path,
        );
      } catch (error) {
        if (error instanceof TestFileError) {
          throw testFileApiError(error);
        }
        throw error;
      }

      if (!resolved) {
        throw new ApiError({
          statusCode: 404,
          code: 'TEST_COMMAND_NOT_FOUND',
          message: 'Comando de teste não encontrado para este projeto.',
        });
      }

      try {
        await testExecutionHistoryService.reconcile(project.id);
        const managedProcess = await processManager.startTest(project, {
          id: `${request.params.commandId}:file`,
          command: resolved.command,
          args: resolved.args,
        });
        await testExecutionHistoryService.recordStart(project.id, managedProcess);
        return reply.code(201).send({ process: managedProcess });
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        request.log.error(
          { err: error, projectId: project.id },
          'Test file start failed',
        );
        throw new ApiError({
          statusCode: 500,
          code: 'TEST_START_FAILED',
          message: 'Não foi possível iniciar a execução do arquivo de teste.',
        });
      }
    },
  );

  app.post<{ Params: ProjectParams }>(
    '/projects/:projectId/tests/process/stop',
    {
      schema: {
        params: projectParamsSchema,
        body: emptyBodySchema,
        querystring: emptyQuerystringSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['process'],
            properties: { process: managedProcessResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      try {
        const managedProcess = await processManager.stopTest(project.id);
        return { process: managedProcess };
      } catch (error) {
        if (error instanceof ProcessManagerError) {
          throw processManagerApiError(error);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: ProjectParams; Querystring: TestHistoryQuery }>(
    '/projects/:projectId/tests/history',
    {
      schema: {
        params: projectParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['history'],
            properties: { history: testExecutionHistoryResponseSchema },
          },
          ...commonErrorResponseSchemas,
        },
      },
    },
    async (request) => {
      const project = requireProject(projectStore, request.params.projectId);
      const history = await testExecutionHistoryService.history(
        project.id,
        request.query.page,
        request.query.pageSize,
      );
      return { history };
    },
  );

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
};
