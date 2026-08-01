import { open, stat, truncate } from 'node:fs/promises';

import type { ProcessLogSnapshot } from '@dev-dashboard/contracts';

import { isErrnoException, ProcessManagerError } from './errors.js';
import { maskSensitiveLogContent } from './log-protection.js';
import {
  readStoredProcess,
  resolveLogFile,
  type ManagedKind,
  type ProcessStoreContext,
} from './process-store.js';

export interface ReadServerLogOptions {
  maxBytes?: number;
}

export async function readManagedLog(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
  options: ReadServerLogOptions = {},
): Promise<ProcessLogSnapshot> {
  const storedProcess = await readStoredProcess(context, projectId, kind);

  if (!storedProcess) {
    throw new ProcessManagerError(
      'PROCESS_NOT_FOUND',
      'Nenhum processo gerenciado foi encontrado.',
    );
  }

  const maxBytes = options.maxBytes ?? 65_536;

  if (
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 262_144
  ) {
    throw new ProcessManagerError(
      'INVALID_LOG_LIMIT',
      'O limite do log deve estar entre 1 e 262144 bytes.',
    );
  }

  try {
    const logPath = resolveLogFile(context, projectId, kind);

    const logStats = await stat(logPath);

    const startPosition = Math.max(0, logStats.size - maxBytes);

    const length = logStats.size - startPosition;
    const buffer = Buffer.alloc(length);

    const logHandle = await open(logPath, 'r');

    try {
      await logHandle.read(buffer, 0, length, startPosition);
    } finally {
      await logHandle.close();
    }

    let content = buffer.toString('utf8');
    const truncated = startPosition > 0;

    // Quando começamos no meio do arquivo, removemos
    // a primeira linha possivelmente incompleta.
    if (truncated) {
      const firstLineBreak = content.indexOf('\n');

      if (firstLineBreak >= 0) {
        content = content.slice(firstLineBreak + 1);
      }
    }

    const maskedContent = maskSensitiveLogContent(content);

    return {
      projectId,
      processId: storedProcess.id,
      content: maskedContent.content,
      masked: maskedContent.masked,
      redactionCount: maskedContent.redactionCount,
      sizeBytes: logStats.size,
      truncated,
      updatedAt: logStats.mtime.toISOString(),
      readAt: new Date().toISOString(),
    };
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return {
        projectId,
        processId: storedProcess.id,
        content: '',
        sizeBytes: 0,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: new Date().toISOString(),
      };
    }

    throw error;
  }
}

export async function clearManagedLog(
  context: ProcessStoreContext,
  projectId: string,
  kind: ManagedKind,
): Promise<ProcessLogSnapshot> {
  const storedProcess = await readStoredProcess(context, projectId, kind);

  if (!storedProcess) {
    throw new ProcessManagerError(
      'PROCESS_NOT_FOUND',
      'Nenhum processo gerenciado foi encontrado.',
    );
  }

  const logPath = resolveLogFile(context, projectId, kind);

  try {
    await truncate(logPath, 0);

    const logStats = await stat(logPath);

    return {
      projectId,
      processId: storedProcess.id,
      content: '',
      sizeBytes: 0,
      truncated: false,
      masked: false,
      redactionCount: 0,
      updatedAt: logStats.mtime.toISOString(),
      readAt: new Date().toISOString(),
    };
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return {
        projectId,
        processId: storedProcess.id,
        content: '',
        sizeBytes: 0,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: new Date().toISOString(),
      };
    }

    throw error;
  }
}
