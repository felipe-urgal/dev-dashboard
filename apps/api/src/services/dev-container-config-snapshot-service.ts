import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DevContainerConfigurationSource } from './dev-container-discovery-service.js';

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_WORKSPACE_PATH_LENGTH = 4096;
const CONFIG_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SNAPSHOT_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/u;

export interface DevContainerConfigSnapshotInput {
  workspaceFolder: string;
  configSource: DevContainerConfigurationSource;
  expectedConfigurationHash: string;
}

export interface DevContainerConfigSnapshot {
  originalConfigPath: string;
  overrideConfigPath: string;
  configurationHash: string;
  dispose(): Promise<void>;
}

export type DevContainerConfigSnapshotErrorCode =
  | 'DEV_CONTAINER_CONFIG_SNAPSHOT_INPUT_INVALID'
  | 'DEV_CONTAINER_CONFIG_SNAPSHOT_SOURCE_INVALID'
  | 'DEV_CONTAINER_CONFIG_SNAPSHOT_CHANGED'
  | 'DEV_CONTAINER_CONFIG_SNAPSHOT_WRITE_FAILED';

export class DevContainerConfigSnapshotError extends Error {
  public constructor(
    public readonly code: DevContainerConfigSnapshotErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerConfigSnapshotError';
  }
}

function validConfigSource(
  value: unknown,
): value is DevContainerConfigurationSource {
  return (
    value === '.devcontainer/devcontainer.json' ||
    value === '.devcontainer.json'
  );
}

export class DevContainerConfigSnapshotService {
  public constructor(
    private readonly snapshotRoot: string,
    private readonly createId: () => string = () => randomUUID(),
  ) {}

  public async create(
    input: DevContainerConfigSnapshotInput,
  ): Promise<DevContainerConfigSnapshot> {
    if (
      typeof input.workspaceFolder !== 'string' ||
      input.workspaceFolder.length === 0 ||
      input.workspaceFolder.length > MAX_WORKSPACE_PATH_LENGTH ||
      !path.isAbsolute(input.workspaceFolder) ||
      !path.isAbsolute(this.snapshotRoot) ||
      !validConfigSource(input.configSource) ||
      !CONFIG_HASH_PATTERN.test(input.expectedConfigurationHash)
    ) {
      throw new DevContainerConfigSnapshotError(
        'DEV_CONTAINER_CONFIG_SNAPSHOT_INPUT_INVALID',
        'O snapshot de configuração Dev Container não possui autoridade válida.',
      );
    }

    const workspaceFolder = path.resolve(input.workspaceFolder);
    const originalConfigPath = path.join(workspaceFolder, input.configSource);
    const before = await this.safeLstat(originalConfigPath);

    const handle = await open(originalConfigPath, 'r').catch(() => {
      throw new DevContainerConfigSnapshotError(
        'DEV_CONTAINER_CONFIG_SNAPSHOT_SOURCE_INVALID',
        'A configuração Dev Container não pôde ser aberta com segurança.',
      );
    });

    let content: Buffer;
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.size > MAX_CONFIG_BYTES ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino
      ) {
        throw new DevContainerConfigSnapshotError(
          'DEV_CONTAINER_CONFIG_SNAPSHOT_SOURCE_INVALID',
          'A configuração Dev Container mudou antes de ser aberta.',
        );
      }

      content = await handle.readFile();
      if (content.byteLength > MAX_CONFIG_BYTES) {
        throw new DevContainerConfigSnapshotError(
          'DEV_CONTAINER_CONFIG_SNAPSHOT_CHANGED',
          'A configuração Dev Container cresceu além do limite durante o snapshot.',
        );
      }
      const after = await handle.stat();
      if (
        after.dev !== opened.dev ||
        after.ino !== opened.ino ||
        after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs
      ) {
        throw new DevContainerConfigSnapshotError(
          'DEV_CONTAINER_CONFIG_SNAPSHOT_CHANGED',
          'A configuração Dev Container mudou durante a criação do snapshot.',
        );
      }
    } finally {
      await handle.close();
    }

    const configurationHash = createHash('sha256')
      .update(content)
      .digest('hex');
    if (configurationHash !== input.expectedConfigurationHash) {
      throw new DevContainerConfigSnapshotError(
        'DEV_CONTAINER_CONFIG_SNAPSHOT_CHANGED',
        'A configuração Dev Container mudou depois da confirmação.',
      );
    }

    const snapshotId = this.createId();
    if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) {
      throw new DevContainerConfigSnapshotError(
        'DEV_CONTAINER_CONFIG_SNAPSHOT_WRITE_FAILED',
        'O identificador interno do snapshot Dev Container é inválido.',
      );
    }

    const snapshotDirectory = path.join(this.snapshotRoot, snapshotId);
    const overrideConfigPath = path.join(
      snapshotDirectory,
      'devcontainer.json',
    );

    try {
      await mkdir(this.snapshotRoot, {
        recursive: true,
        mode: 0o700,
      });
      await mkdir(snapshotDirectory, {
        recursive: false,
        mode: 0o700,
      });
      await writeFile(overrideConfigPath, content, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch {
      await rm(snapshotDirectory, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
      throw new DevContainerConfigSnapshotError(
        'DEV_CONTAINER_CONFIG_SNAPSHOT_WRITE_FAILED',
        'O snapshot privado da configuração Dev Container não pôde ser criado.',
      );
    }

    let disposed = false;
    return {
      originalConfigPath,
      overrideConfigPath,
      configurationHash,
      dispose: async () => {
        if (disposed) return;
        await rm(snapshotDirectory, {
          recursive: true,
          force: true,
        });
        disposed = true;
      },
    };
  }

  private async safeLstat(
    target: string,
  ): Promise<Awaited<ReturnType<typeof lstat>>> {
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(target);
    } catch {
      throw new DevContainerConfigSnapshotError(
        'DEV_CONTAINER_CONFIG_SNAPSHOT_SOURCE_INVALID',
        'A configuração Dev Container não pôde ser inspecionada.',
      );
    }

    if (!info.isFile() || info.size > MAX_CONFIG_BYTES) {
      throw new DevContainerConfigSnapshotError(
        'DEV_CONTAINER_CONFIG_SNAPSHOT_SOURCE_INVALID',
        'A configuração Dev Container precisa ser um arquivo regular limitado.',
      );
    }
    return info;
  }
}
