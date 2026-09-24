import { spawn } from 'node:child_process';

import type {
  DevelopmentEnvironmentInstance,
  Project,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { DevContainerCleanupService } from './dev-container-cleanup-service.js';
import type {
  DevContainerConfigSnapshot,
  DevContainerConfigSnapshotService,
} from './dev-container-config-snapshot-service.js';
import type { DevContainerLifecycleConfirmationService } from './dev-container-lifecycle-confirmation-service.js';
import type { DevContainerLifecyclePlanningService } from './dev-container-lifecycle-planning-service.js';
import type {
  DevContainerOwnershipRecord,
  DevContainerOwnershipStore,
} from './dev-container-ownership-store.js';
import {
  buildDevContainerUpCommand,
  parseDevContainerUpOutput,
  type DevContainerUpStructuredCommand,
} from './dev-container-up-adapter.js';

const COMMAND_TIMEOUT_MS = 30 * 60_000;
const COMMAND_KILL_GRACE_MS = 5_000;
const OUTPUT_TAIL_BYTES = 512 * 1024;

export interface DevContainerStartInput {
  environmentInstanceId?: string;
  confirmationToken?: string;
}

export interface DevContainerStartResult {
  environmentInstanceId: string;
  runtime: 'devcontainer';
  containerId: string;
}

export type DevContainerStartErrorCode =
  | 'DEV_CONTAINER_START_ENVIRONMENT_NOT_READY'
  | 'DEV_CONTAINER_START_CONFIRMATION_REQUIRED'
  | 'DEV_CONTAINER_START_CONFIG_CHANGED'
  | 'DEV_CONTAINER_START_OWNERSHIP_FAILED'
  | 'DEV_CONTAINER_START_COMMAND_FAILED'
  | 'DEV_CONTAINER_START_STATE_FAILED'
  | 'DEV_CONTAINER_START_ROLLBACK_FAILED';

export class DevContainerStartError extends Error {
  public constructor(
    public readonly code: DevContainerStartErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerStartError';
  }
}

interface StartCommandOptions {
  cwd: string;
  timeoutMs: number;
  outputTailBytes: number;
}

export type DevContainerStartCommandRunner = (
  command: DevContainerUpStructuredCommand,
  options: StartCommandOptions,
) => Promise<string>;

type PlanningService = Pick<DevContainerLifecyclePlanningService, 'plan'>;
type ConfirmationService = Pick<
  DevContainerLifecycleConfirmationService,
  'consume'
>;
type SnapshotService = Pick<DevContainerConfigSnapshotService, 'create'>;
type OwnershipStore = Pick<DevContainerOwnershipStore, 'reserve' | 'attach'>;
type CleanupService = Pick<DevContainerCleanupService, 'cleanup'>;
type EnvironmentStore = Pick<
  DevelopmentEnvironmentInstanceStore,
  'findById' | 'findPrimaryByProjectId' | 'upsert'
>;

function appendTail(current: Buffer, chunk: Buffer, maxBytes: number): Buffer {
  const next = Buffer.concat([current, chunk]);
  return next.byteLength > maxBytes
    ? next.subarray(next.byteLength - maxBytes)
    : next;
}

function defaultCommandRunner(
  command: DevContainerUpStructuredCommand,
  options: StartCommandOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.program, [...command.args], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let tail = Buffer.alloc(0);
    let settled = false;
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, COMMAND_KILL_GRACE_MS);
    }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      tail = appendTail(tail, buffer, options.outputTailBytes);
    });

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(error);
    });

    child.once('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timedOut) {
        reject(new Error('Dev Container command timed out.'));
        return;
      }
      resolve(tail.toString('utf8'));
    });
  });
}

function selectedInstance(
  store: EnvironmentStore,
  project: Project,
  environmentInstanceId?: string,
): DevelopmentEnvironmentInstance | null {
  const instance = environmentInstanceId
    ? store.findById(environmentInstanceId)
    : store.findPrimaryByProjectId(project.id);
  return instance?.projectId === project.id ? instance : null;
}

function binding(
  project: Project,
  instance: DevelopmentEnvironmentInstance,
  configSource: '.devcontainer/devcontainer.json' | '.devcontainer.json',
) {
  return {
    projectId: project.id,
    environmentInstanceId: instance.id,
    projectPath: instance.source.path,
    configSource,
  };
}

export class DevContainerStartService {
  public constructor(
    private readonly planningService: PlanningService,
    private readonly confirmationService: ConfirmationService,
    private readonly snapshotService: SnapshotService,
    private readonly ownershipStore: OwnershipStore,
    private readonly cleanupService: CleanupService,
    private readonly environmentStore: EnvironmentStore,
    private readonly runCommand: DevContainerStartCommandRunner = defaultCommandRunner,
  ) {}

  public async start(
    project: Project,
    input: DevContainerStartInput = {},
  ): Promise<DevContainerStartResult> {
    const preflight = await this.planningService.plan(project, {
      ...(input.environmentInstanceId
        ? { environmentInstanceId: input.environmentInstanceId }
        : {}),
    });
    const instance = selectedInstance(
      this.environmentStore,
      project,
      preflight.environmentInstanceId,
    );

    if (
      !instance ||
      instance.id !== preflight.environmentInstanceId ||
      instance.runtime.kind !== 'host' ||
      instance.lifecycle !== 'ready'
    ) {
      throw new DevContainerStartError(
        'DEV_CONTAINER_START_ENVIRONMENT_NOT_READY',
        'A Environment Instance não está pronta para criar um Dev Container.',
      );
    }

    try {
      this.confirmationService.consume(preflight, input.confirmationToken);
    } catch {
      throw new DevContainerStartError(
        'DEV_CONTAINER_START_CONFIRMATION_REQUIRED',
        'Uma confirmação válida e atual é obrigatória para criar o Dev Container.',
      );
    }

    if (
      !preflight.configSource ||
      !preflight.configurationHash ||
      !preflight.configuration ||
      (preflight.configuration.kind !== 'image' &&
        preflight.configuration.kind !== 'dockerfile')
    ) {
      throw new DevContainerStartError(
        'DEV_CONTAINER_START_CONFIG_CHANGED',
        'O preflight não possui evidência suficiente para criar o Dev Container.',
      );
    }

    let snapshot: DevContainerConfigSnapshot;
    try {
      snapshot = await this.snapshotService.create({
        workspaceFolder: instance.source.path,
        configSource: preflight.configSource,
        expectedConfigurationHash: preflight.configurationHash,
      });
    } catch {
      throw new DevContainerStartError(
        'DEV_CONTAINER_START_CONFIG_CHANGED',
        'A configuração Dev Container mudou depois da confirmação.',
      );
    }

    if (snapshot.configurationHash !== preflight.configurationHash) {
      await snapshot.dispose().catch(() => undefined);
      throw new DevContainerStartError(
        'DEV_CONTAINER_START_CONFIG_CHANGED',
        'O snapshot Dev Container não corresponde ao fingerprint confirmado.',
      );
    }

    let ownership: DevContainerOwnershipRecord;
    try {
      ownership = await this.ownershipStore.reserve(
        binding(project, instance, preflight.configSource),
      );
    } catch {
      await snapshot.dispose().catch(() => undefined);
      throw new DevContainerStartError(
        'DEV_CONTAINER_START_OWNERSHIP_FAILED',
        'Não foi possível reservar ownership para o Dev Container.',
      );
    }

    let rollbackRequired = true;

    try {
      try {
        this.environmentStore.upsert({
          ...instance,
          lifecycle: 'starting',
        });
      } catch {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_STATE_FAILED',
          'Não foi possível persistir o início do lifecycle Dev Container.',
        );
      }

      let output: string;
      try {
        output = await this.runCommand(
          buildDevContainerUpCommand({
            workspaceFolder: instance.source.path,
            configSource: preflight.configSource,
            overrideConfigPath: snapshot.overrideConfigPath,
            ownershipToken: ownership.ownershipToken,
          }),
          {
            cwd: instance.source.path,
            timeoutMs: COMMAND_TIMEOUT_MS,
            outputTailBytes: OUTPUT_TAIL_BYTES,
          },
        );
      } catch {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_COMMAND_FAILED',
          'A Dev Container CLI não conseguiu criar o runtime.',
        );
      }

      let envelope;
      try {
        envelope = parseDevContainerUpOutput(output);
      } catch {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_COMMAND_FAILED',
          'A Dev Container CLI não retornou uma confirmação estruturada do runtime.',
        );
      }

      if (envelope.outcome !== 'success') {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_COMMAND_FAILED',
          'A Dev Container CLI informou falha ao criar o runtime.',
        );
      }

      if (envelope.composeProjectName) {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_CONFIG_CHANGED',
          'A criação resolveu para Docker Compose e foi bloqueada pelo lifecycle.',
        );
      }

      try {
        ownership = await this.ownershipStore.attach({
          environmentInstanceId: instance.id,
          ownershipToken: ownership.ownershipToken,
          containerId: envelope.containerId,
        });
      } catch {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_OWNERSHIP_FAILED',
          'O runtime criado não pôde ser associado ao ownership reservado.',
        );
      }

      try {
        await snapshot.dispose();
      } catch {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_STATE_FAILED',
          'O snapshot privado da configuração não pôde ser removido.',
        );
      }

      try {
        this.environmentStore.upsert({
          ...instance,
          runtime: {
            kind: 'devcontainer',
            runtimeId: envelope.containerId,
          },
          lifecycle: 'ready',
        });
      } catch {
        throw new DevContainerStartError(
          'DEV_CONTAINER_START_STATE_FAILED',
          'O runtime foi criado, mas a Environment Instance não pôde ser atualizada.',
        );
      }

      rollbackRequired = false;
      return {
        environmentInstanceId: instance.id,
        runtime: 'devcontainer',
        containerId: envelope.containerId,
      };
    } catch (error) {
      throw error instanceof DevContainerStartError
        ? error
        : new DevContainerStartError(
            'DEV_CONTAINER_START_COMMAND_FAILED',
            'A criação do Dev Container falhou.',
          );
    } finally {
      if (rollbackRequired) {
        await snapshot.dispose().catch(() => undefined);

        try {
          await this.cleanupService.cleanup(project, instance.id);
        } catch {
          throw new DevContainerStartError(
            'DEV_CONTAINER_START_ROLLBACK_FAILED',
            'A criação falhou e o rollback do Dev Container não pôde ser comprovado.',
          );
        }
      }
    }
  }
}
