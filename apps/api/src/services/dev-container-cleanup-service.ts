import { execFile } from 'node:child_process';

import type {
  DevelopmentEnvironmentInstance,
  Project,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import {
  DevContainerDockerCleanupAdapterError,
  buildFindDevContainerByOwnershipCommand,
  buildInspectOwnedDevContainerCommand,
  buildRemoveOwnedDevContainerCommand,
  buildStopOwnedDevContainerCommand,
  parseOwnedDevContainerInspectOutput,
  parseOwnedDevContainerLookupOutput,
  type DevContainerDockerStructuredCommand,
} from './dev-container-docker-cleanup-adapter.js';
import type {
  DevContainerOwnershipRecord,
  DevContainerOwnershipStore,
} from './dev-container-ownership-store.js';

const COMMAND_TIMEOUT_MS = 60_000;
const COMMAND_MAX_BUFFER_BYTES = 128 * 1024;

export type DevContainerCleanupInspection =
  | {
      state: 'unowned';
      environmentInstanceId: string;
    }
  | {
      state: 'absent';
      environmentInstanceId: string;
      ownership: DevContainerOwnershipRecord;
    }
  | {
      state: 'present';
      environmentInstanceId: string;
      ownership: DevContainerOwnershipRecord;
      containerId: string;
      running: boolean;
    };

export type DevContainerCleanupResult =
  | {
      state: 'already-absent';
      environmentInstanceId: string;
    }
  | {
      state: 'cleaned';
      environmentInstanceId: string;
      containerId: string;
    };

export type DevContainerCleanupErrorCode =
  | 'DEV_CONTAINER_CLEANUP_ENVIRONMENT_NOT_FOUND'
  | 'DEV_CONTAINER_CLEANUP_OWNERSHIP_REQUIRED'
  | 'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH'
  | 'DEV_CONTAINER_CLEANUP_DOCKER_LOOKUP_FAILED'
  | 'DEV_CONTAINER_CLEANUP_DOCKER_INSPECT_FAILED'
  | 'DEV_CONTAINER_CLEANUP_DOCKER_STOP_FAILED'
  | 'DEV_CONTAINER_CLEANUP_DOCKER_REMOVE_FAILED'
  | 'DEV_CONTAINER_CLEANUP_OWNERSHIP_RELEASE_FAILED';

export class DevContainerCleanupError extends Error {
  public constructor(
    public readonly code: DevContainerCleanupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerCleanupError';
  }
}

interface CommandOptions {
  timeoutMs: number;
  maxBufferBytes: number;
}

export type DevContainerCleanupCommandRunner = (
  command: DevContainerDockerStructuredCommand,
  options: CommandOptions,
) => Promise<string | void>;

type EnvironmentStore = Pick<
  DevelopmentEnvironmentInstanceStore,
  'findById' | 'findPrimaryByProjectId' | 'upsert'
>;

type OwnershipStore = Pick<DevContainerOwnershipStore, 'get' | 'release'>;

function defaultCommandRunner(
  command: DevContainerDockerStructuredCommand,
  options: CommandOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command.program,
      [...command.args],
      {
        encoding: 'utf8',
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function binding(project: Project, instance: DevelopmentEnvironmentInstance) {
  return {
    projectId: project.id,
    environmentInstanceId: instance.id,
    projectPath: instance.source.path,
  };
}

export class DevContainerCleanupService {
  public constructor(
    private readonly environmentStore: EnvironmentStore,
    private readonly ownershipStore: OwnershipStore,
    private readonly runCommand: DevContainerCleanupCommandRunner = defaultCommandRunner,
  ) {}

  public async inspect(
    project: Project,
    environmentInstanceId?: string,
  ): Promise<DevContainerCleanupInspection> {
    const instance = this.requireEnvironment(project, environmentInstanceId);
    const ownership = await this.readOwnership(project, instance);
    if (!ownership) {
      return {
        state: 'unowned',
        environmentInstanceId: instance.id,
      };
    }

    const lookup = await this.findByOwnership(ownership);
    if (lookup.state === 'absent') {
      return {
        state: 'absent',
        environmentInstanceId: instance.id,
        ownership,
      };
    }

    if (
      ownership.phase === 'owned' &&
      ownership.containerId !== lookup.containerId
    ) {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
        'O container encontrado não corresponde ao runtime owned registrado.',
      );
    }

    const snapshot = await this.inspectExact(
      lookup.containerId,
      ownership.ownershipToken,
    );

    return {
      state: 'present',
      environmentInstanceId: instance.id,
      ownership,
      containerId: snapshot.containerId,
      running: snapshot.running,
    };
  }

  public async cleanup(
    project: Project,
    environmentInstanceId?: string,
    expectedOwnershipToken?: string,
  ): Promise<DevContainerCleanupResult> {
    const instance = this.requireEnvironment(project, environmentInstanceId);
    const initial = await this.inspect(project, instance.id);
    if (initial.state === 'unowned') {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_OWNERSHIP_REQUIRED',
        'Cleanup exige ownership comprovado do Dev Container.',
      );
    }

    if (
      expectedOwnershipToken &&
      initial.ownership.ownershipToken !== expectedOwnershipToken
    ) {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
        'O ownership mudou depois da confirmação do cleanup.',
      );
    }

    if (initial.state === 'absent') {
      await this.finalizeOwnership(project, instance, initial.ownership);
      return {
        state: 'already-absent',
        environmentInstanceId: instance.id,
      };
    }

    this.environmentStore.upsert({
      ...instance,
      lifecycle: 'stopping',
    });

    try {
      if (initial.running) {
        await this.runMutation(
          buildStopOwnedDevContainerCommand(initial.containerId),
          'DEV_CONTAINER_CLEANUP_DOCKER_STOP_FAILED',
          'O Docker não conseguiu parar o Dev Container owned.',
        );
      }

      const afterStop = await this.findByOwnership(initial.ownership);
      if (afterStop.state === 'present') {
        if (afterStop.containerId !== initial.containerId) {
          throw new DevContainerCleanupError(
            'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
            'O ownership mudou durante o cleanup do Dev Container.',
          );
        }

        const stopped = await this.inspectExact(
          afterStop.containerId,
          initial.ownership.ownershipToken,
        );
        if (stopped.running) {
          throw new DevContainerCleanupError(
            'DEV_CONTAINER_CLEANUP_DOCKER_STOP_FAILED',
            'O Dev Container permaneceu em execução após o stop.',
          );
        }

        await this.runMutation(
          buildRemoveOwnedDevContainerCommand(afterStop.containerId),
          'DEV_CONTAINER_CLEANUP_DOCKER_REMOVE_FAILED',
          'O Docker não conseguiu remover o Dev Container owned.',
        );

        const afterRemove = await this.findByOwnership(initial.ownership);
        if (afterRemove.state !== 'absent') {
          throw new DevContainerCleanupError(
            'DEV_CONTAINER_CLEANUP_DOCKER_REMOVE_FAILED',
            'O Dev Container ainda existe após a remoção.',
          );
        }
      }

      await this.finalizeOwnership(project, instance, initial.ownership);
      return {
        state: 'cleaned',
        environmentInstanceId: instance.id,
        containerId: initial.containerId,
      };
    } catch (error) {
      this.environmentStore.upsert({
        ...instance,
        lifecycle: 'failed',
      });
      throw error;
    }
  }

  private requireEnvironment(
    project: Project,
    environmentInstanceId?: string,
  ): DevelopmentEnvironmentInstance {
    const instance = environmentInstanceId
      ? this.environmentStore.findById(environmentInstanceId)
      : this.environmentStore.findPrimaryByProjectId(project.id);

    if (!instance || instance.projectId !== project.id) {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_ENVIRONMENT_NOT_FOUND',
        'Ambiente de desenvolvimento não encontrado para cleanup.',
      );
    }
    return instance;
  }

  private async readOwnership(
    project: Project,
    instance: DevelopmentEnvironmentInstance,
  ): Promise<DevContainerOwnershipRecord | undefined> {
    try {
      return await this.ownershipStore.get(binding(project, instance));
    } catch {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
        'O estado persistido de ownership não pôde ser comprovado.',
      );
    }
  }

  private async findByOwnership(ownership: DevContainerOwnershipRecord) {
    let output: string | void;
    try {
      output = await this.runCommand(
        buildFindDevContainerByOwnershipCommand(ownership.ownershipToken),
        {
          timeoutMs: COMMAND_TIMEOUT_MS,
          maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
        },
      );
    } catch {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_DOCKER_LOOKUP_FAILED',
        'O Docker não conseguiu localizar o runtime owned.',
      );
    }

    try {
      return parseOwnedDevContainerLookupOutput(output ?? '');
    } catch (error) {
      if (
        error instanceof DevContainerDockerCleanupAdapterError &&
        error.code === 'DEV_CONTAINER_DOCKER_OWNERSHIP_AMBIGUOUS'
      ) {
        throw new DevContainerCleanupError(
          'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
          'Mais de um container corresponde ao ownership do Dev Container.',
        );
      }
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_DOCKER_LOOKUP_FAILED',
        'A resposta do Docker não comprovou o runtime owned.',
      );
    }
  }

  private async inspectExact(containerId: string, ownershipToken: string) {
    let output: string | void;
    try {
      output = await this.runCommand(
        buildInspectOwnedDevContainerCommand(containerId),
        {
          timeoutMs: COMMAND_TIMEOUT_MS,
          maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
        },
      );
    } catch {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_DOCKER_INSPECT_FAILED',
        'O Docker não conseguiu inspecionar o runtime owned.',
      );
    }

    try {
      return parseOwnedDevContainerInspectOutput(
        output ?? '',
        containerId,
        ownershipToken,
      );
    } catch {
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_OWNERSHIP_MISMATCH',
        'O snapshot do Docker não comprovou containerId e ownership esperados.',
      );
    }
  }

  private async runMutation(
    command: DevContainerDockerStructuredCommand,
    code:
      | 'DEV_CONTAINER_CLEANUP_DOCKER_STOP_FAILED'
      | 'DEV_CONTAINER_CLEANUP_DOCKER_REMOVE_FAILED',
    message: string,
  ): Promise<void> {
    try {
      await this.runCommand(command, {
        timeoutMs: COMMAND_TIMEOUT_MS,
        maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
      });
    } catch {
      throw new DevContainerCleanupError(code, message);
    }
  }

  private async finalizeOwnership(
    project: Project,
    instance: DevelopmentEnvironmentInstance,
    ownership: DevContainerOwnershipRecord,
  ): Promise<void> {
    let released = false;
    try {
      released = await this.ownershipStore.release({
        ...binding(project, instance),
        ownershipToken: ownership.ownershipToken,
      });
    } catch {
      released = false;
    }
    if (!released) {
      this.environmentStore.upsert({
        ...instance,
        lifecycle: 'failed',
      });
      throw new DevContainerCleanupError(
        'DEV_CONTAINER_CLEANUP_OWNERSHIP_RELEASE_FAILED',
        'O runtime foi limpo, mas o ownership não pôde ser liberado.',
      );
    }

    this.environmentStore.upsert({
      ...instance,
      runtime: { kind: 'host' },
      lifecycle: 'ready',
    });
  }
}
