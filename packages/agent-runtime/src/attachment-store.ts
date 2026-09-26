import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { sanitizeAgentConversationContent } from './conversation-store.js';
import { AgentTaskLockManager } from './task-lock.js';

const STORE_VERSION = 1;
const DEFAULT_MAX_ATTACHMENTS = 8;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_FILENAME_CHARS = 180;
const MAX_PREVIEW_CHARS = 8_000;

export const AGENT_ATTACHMENT_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AgentAttachmentMediaType =
  (typeof AGENT_ATTACHMENT_MEDIA_TYPES)[number];

export interface AgentAttachment {
  id: string;
  taskId: string;
  filename: string;
  mediaType: AgentAttachmentMediaType;
  byteSize: number;
  sha256: string;
  source: 'user-upload';
  createdAt: string;
  textPreview?: string;
}

interface PersistedAgentAttachment extends AgentAttachment {
  contentBase64: string;
}

interface PersistedAgentAttachmentState {
  version: 1;
  taskId: string;
  attachments: PersistedAgentAttachment[];
}

export interface AgentAttachmentCreateInput {
  filename: string;
  mediaType: AgentAttachmentMediaType;
  contentBase64: string;
}

export interface AgentAttachmentStoreOptions {
  stateDirectory: string;
  maxAttachments?: number;
  maxBytes?: number;
  lockManager?: AgentTaskLockManager;
  now?: () => string;
  createId?: () => string;
}

export type AgentAttachmentStoreErrorCode =
  | 'AGENT_ATTACHMENT_INVALID'
  | 'AGENT_ATTACHMENT_LIMIT'
  | 'AGENT_ATTACHMENT_CORRUPT'
  | 'AGENT_ATTACHMENT_NOT_FOUND';

export class AgentAttachmentStoreError extends Error {
  constructor(
    readonly code: AgentAttachmentStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentAttachmentStoreError';
  }
}

function key(taskId: string): string {
  return createHash('sha256').update(taskId).digest('hex');
}

function clone(attachment: PersistedAgentAttachment): AgentAttachment {
  const { contentBase64: _contentBase64, ...metadata } = attachment;
  return { ...metadata };
}

function decodeBase64(value: string): Buffer {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > Math.ceil((DEFAULT_MAX_BYTES * 4) / 3) + 16 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new AgentAttachmentStoreError(
      'AGENT_ATTACHMENT_INVALID',
      'Agent attachment content is invalid.',
    );
  }
  const buffer = Buffer.from(value, 'base64');
  if (!buffer.length || buffer.toString('base64') !== value) {
    throw new AgentAttachmentStoreError(
      'AGENT_ATTACHMENT_INVALID',
      'Agent attachment content is invalid.',
    );
  }
  return buffer;
}

function textPreview(
  mediaType: AgentAttachmentMediaType,
  buffer: Buffer,
): string | undefined {
  if (
    mediaType !== 'text/plain' &&
    mediaType !== 'text/markdown' &&
    mediaType !== 'application/json'
  ) {
    return undefined;
  }

  const decoded = buffer.toString('utf8');
  if (Buffer.from(decoded, 'utf8').compare(buffer) !== 0) {
    throw new AgentAttachmentStoreError(
      'AGENT_ATTACHMENT_INVALID',
      'Text attachment must contain valid UTF-8.',
    );
  }

  return sanitizeAgentConversationContent(decoded)
    .replaceAll('\0', '')
    .slice(0, MAX_PREVIEW_CHARS);
}

function assertIdentity(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 256 ||
    value.includes('\0')
  ) {
    throw new AgentAttachmentStoreError(
      'AGENT_ATTACHMENT_INVALID',
      label + ' is invalid.',
    );
  }
}

function assertFilename(value: string): void {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > MAX_FILENAME_CHARS ||
    value.includes('\0') ||
    value.includes('/') ||
    value.includes('\\') ||
    value === '.' ||
    value === '..'
  ) {
    throw new AgentAttachmentStoreError(
      'AGENT_ATTACHMENT_INVALID',
      'Agent attachment filename is invalid.',
    );
  }
}

function isMediaType(value: unknown): value is AgentAttachmentMediaType {
  return (AGENT_ATTACHMENT_MEDIA_TYPES as readonly unknown[]).includes(value);
}

function emptyState(taskId: string): PersistedAgentAttachmentState {
  return { version: STORE_VERSION, taskId, attachments: [] };
}

export class AgentAttachmentStore {
  private readonly maxAttachments: number;
  private readonly maxBytes: number;
  private readonly lockManager: AgentTaskLockManager;
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(private readonly options: AgentAttachmentStoreOptions) {
    if (!options.stateDirectory) {
      throw new AgentAttachmentStoreError(
        'AGENT_ATTACHMENT_INVALID',
        'Agent attachment state directory is required.',
      );
    }
    this.maxAttachments = options.maxAttachments ?? DEFAULT_MAX_ATTACHMENTS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.lockManager =
      options.lockManager ??
      new AgentTaskLockManager({ stateDirectory: options.stateDirectory });
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? randomUUID;
  }

  async list(taskId: string): Promise<AgentAttachment[]> {
    assertIdentity(taskId, 'Agent task id');
    const release = await this.lockManager.acquire('attachments-' + key(taskId), {
      wait: true,
    });
    try {
      return (await this.read(taskId)).attachments.map(clone);
    } finally {
      await release();
    }
  }

  async get(taskId: string, attachmentId: string): Promise<AgentAttachment | null> {
    const attachments = await this.list(taskId);
    return attachments.find((item) => item.id === attachmentId) ?? null;
  }

  async create(
    taskId: string,
    input: AgentAttachmentCreateInput,
  ): Promise<AgentAttachment> {
    assertIdentity(taskId, 'Agent task id');
    assertFilename(input.filename);
    if (!isMediaType(input.mediaType)) {
      throw new AgentAttachmentStoreError(
        'AGENT_ATTACHMENT_INVALID',
        'Agent attachment media type is not supported.',
      );
    }

    const buffer = decodeBase64(input.contentBase64);
    if (buffer.length > this.maxBytes) {
      throw new AgentAttachmentStoreError(
        'AGENT_ATTACHMENT_LIMIT',
        'Agent attachment exceeds the per-file size limit.',
      );
    }

    const release = await this.lockManager.acquire('attachments-' + key(taskId), {
      wait: true,
    });
    try {
      const state = await this.read(taskId);
      if (state.attachments.length >= this.maxAttachments) {
        throw new AgentAttachmentStoreError(
          'AGENT_ATTACHMENT_LIMIT',
          'Agent task reached the attachment count limit.',
        );
      }
      if (
        state.attachments.reduce((total, item) => total + item.byteSize, 0) +
          buffer.length >
        MAX_TOTAL_BYTES
      ) {
        throw new AgentAttachmentStoreError(
          'AGENT_ATTACHMENT_LIMIT',
          'Agent task attachments exceed the total size limit.',
        );
      }

      const id = this.createId().trim();
      assertIdentity(id, 'Agent attachment id');
      const createdAt = this.now();
      if (!Number.isFinite(Date.parse(createdAt))) {
        throw new AgentAttachmentStoreError(
          'AGENT_ATTACHMENT_INVALID',
          'Agent attachment timestamp is invalid.',
        );
      }

      const attachment: PersistedAgentAttachment = {
        id,
        taskId,
        filename: input.filename.trim(),
        mediaType: input.mediaType,
        byteSize: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        source: 'user-upload',
        createdAt,
        ...(textPreview(input.mediaType, buffer)
          ? { textPreview: textPreview(input.mediaType, buffer) }
          : {}),
        contentBase64: buffer.toString('base64'),
      };
      await this.write({
        ...state,
        attachments: [...state.attachments, attachment],
      });
      return clone(attachment);
    } finally {
      await release();
    }
  }

  private directory(): string {
    return path.join(this.options.stateDirectory, 'attachments');
  }

  private pathFor(taskId: string): string {
    return path.join(this.directory(), key(taskId) + '.json');
  }

  private async read(taskId: string): Promise<PersistedAgentAttachmentState> {
    try {
      const target = this.pathFor(taskId);
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 6 * 1024 * 1024) {
        throw new AgentAttachmentStoreError(
          'AGENT_ATTACHMENT_CORRUPT',
          'Agent attachment state file is invalid.',
        );
      }
      const parsed = JSON.parse(await fs.readFile(target, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new AgentAttachmentStoreError(
          'AGENT_ATTACHMENT_CORRUPT',
          'Agent attachment state is invalid.',
        );
      }
      const state = parsed as PersistedAgentAttachmentState;
      if (
        state.version !== STORE_VERSION ||
        state.taskId !== taskId ||
        !Array.isArray(state.attachments) ||
        state.attachments.length > this.maxAttachments
      ) {
        throw new AgentAttachmentStoreError(
          'AGENT_ATTACHMENT_CORRUPT',
          'Agent attachment state is invalid.',
        );
      }
      for (const attachment of state.attachments) {
        assertIdentity(attachment.id, 'Agent attachment id');
        if (
          attachment.taskId !== taskId ||
          !isMediaType(attachment.mediaType) ||
          !Number.isSafeInteger(attachment.byteSize) ||
          attachment.byteSize <= 0 ||
          attachment.byteSize > this.maxBytes ||
          typeof attachment.contentBase64 !== 'string' ||
          typeof attachment.sha256 !== 'string' ||
          attachment.sha256.length !== 64 ||
          attachment.source !== 'user-upload' ||
          !Number.isFinite(Date.parse(attachment.createdAt))
        ) {
          throw new AgentAttachmentStoreError(
            'AGENT_ATTACHMENT_CORRUPT',
            'Agent attachment entry is invalid.',
          );
        }
        assertFilename(attachment.filename);
      }
      return state;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return emptyState(taskId);
      }
      if (error instanceof AgentAttachmentStoreError) throw error;
      throw new AgentAttachmentStoreError(
        'AGENT_ATTACHMENT_CORRUPT',
        'Agent attachment state could not be read.',
      );
    }
  }

  private async write(state: PersistedAgentAttachmentState): Promise<void> {
    await fs.mkdir(this.directory(), { recursive: true, mode: 0o700 });
    const target = this.pathFor(state.taskId);
    const temporary =
      target + '.' + process.pid + '.' + randomBytes(6).toString('hex');
    try {
      await fs.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await fs.rename(temporary, target);
      await fs.chmod(target, 0o600);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
