import type {
  ManagedProcess,
  StackLogsSnapshot,
  StackNode,
  StackNodeLog,
} from '@dev-dashboard/contracts';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { StackDefinitionService } from './stack-definition-service.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';

const PROCESS_LOG_MAX_BYTES = 65_536;
const COMPOSE_LOG_TAIL = 200;

export class StackLogsServiceError extends Error {
  public constructor(
    public readonly code: 'STACK_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'StackLogsServiceError';
  }
}

export class StackLogsService {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: {
      stackDefinitionService: Pick<StackDefinitionService, 'findById'>;
      projectStore: Pick<ProjectStore, 'findProject'>;
      developmentEnvironmentInstanceStore: Pick<
        DevelopmentEnvironmentInstanceStore,
        'resolveForProject'
      >;
      dockerComposeLifecycleService: Pick<
        DockerComposeLifecycleService,
        'logs'
      >;
      processManager: Pick<
        ProcessManager,
        | 'listProcesses'
        | 'readServerLog'
        | 'readWorkerLog'
        | 'readTestLog'
      >;
    },
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async read(stackId: string): Promise<StackLogsSnapshot> {
    const stack = this.dependencies.stackDefinitionService.findById(stackId);
    if (!stack) {
      throw new StackLogsServiceError('STACK_NOT_FOUND', 'Stack not found.');
    }

    const readAt = this.now().toISOString();
    const processes = await this.dependencies.processManager
      .listProcesses()
      .catch(() => [] as ManagedProcess[]);
    const processesById = new Map(
      processes.map((process) => [process.id, process]),
    );

    const nodes = await Promise.all(
      stack.nodes.map((node) => this.readNode(node, readAt, processesById)),
    );

    return { stackId, readAt, nodes };
  }

  private async readNode(
    node: StackNode,
    readAt: string,
    processesById: ReadonlyMap<string, ManagedProcess>,
  ): Promise<StackNodeLog> {
    if (node.target.kind === 'compose-service') {
      const resolution = resolveStackComposeProject(
        this.dependencies,
        node.target,
      );
      if (resolution.state !== 'resolved') {
        return {
          nodeId: node.id,
          state: 'unavailable',
          source: 'compose',
          readAt,
          diagnostic: resolution.diagnostic,
        };
      }

      try {
        const log = await this.dependencies.dockerComposeLifecycleService.logs(
          resolution.project,
          {
            service: node.target.service,
            tail: COMPOSE_LOG_TAIL,
          },
        );
        return {
          nodeId: node.id,
          state: log.content ? 'available' : 'empty',
          source: 'compose',
          content: log.content,
          truncated: log.truncated,
          masked: log.masked,
          redactionCount: log.redactionCount,
          readAt: log.readAt,
        };
      } catch {
        return {
          nodeId: node.id,
          state: 'unavailable',
          source: 'compose',
          readAt,
          diagnostic:
            'Compose logs are unavailable for this explicitly associated node.',
        };
      }
    }

    if (node.target.kind === 'process') {
      const process = processesById.get(node.target.processId);
      if (
        !process ||
        process.projectId !== node.target.projectId ||
        process.environmentInstanceId !== node.target.environmentInstanceId
      ) {
        return {
          nodeId: node.id,
          state: 'unavailable',
          source: 'process',
          readAt,
          diagnostic:
            'Managed process ownership no longer matches the Stack definition.',
        };
      }

      if (process.kind === 'script') {
        return {
          nodeId: node.id,
          state: 'unsupported',
          source: 'process',
          readAt,
          diagnostic:
            'Script logs are owned by Script Execution and are not aggregated by Stacks.',
        };
      }

      try {
        const log = await this.readProcessLog(process);
        if (log.processId !== node.target.processId) {
          return {
            nodeId: node.id,
            state: 'unavailable',
            source: 'process',
            readAt,
            diagnostic:
              'Process log identity no longer matches the Stack definition.',
          };
        }

        return {
          nodeId: node.id,
          state: log.content ? 'available' : 'empty',
          source: 'process',
          content: log.content,
          truncated: log.truncated,
          masked: log.masked,
          redactionCount: log.redactionCount,
          readAt: log.readAt,
        };
      } catch {
        return {
          nodeId: node.id,
          state: 'unavailable',
          source: 'process',
          readAt,
          diagnostic: 'Managed process logs could not be read.',
        };
      }
    }

    return {
      nodeId: node.id,
      state: 'unsupported',
      source: 'none',
      readAt,
      diagnostic:
        node.target.kind === 'health-check'
          ? 'Health check nodes do not own a log stream.'
          : 'Environment nodes do not own a log stream.',
    };
  }

  private readProcessLog(process: ManagedProcess) {
    const options = { maxBytes: PROCESS_LOG_MAX_BYTES };
    switch (process.kind) {
      case 'server':
        return this.dependencies.processManager.readServerLog(
          process.projectId,
          options,
          process.environmentInstanceId,
        );
      case 'worker':
      case 'webpack':
        return this.dependencies.processManager.readWorkerLog(
          process.projectId,
          process.kind,
          options,
          process.environmentInstanceId,
        );
      case 'test':
        return this.dependencies.processManager.readTestLog(
          process.projectId,
          options,
          process.environmentInstanceId,
        );
      case 'script':
        throw new Error('Unsupported process log owner.');
    }
  }
}
