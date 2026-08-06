import { randomBytes, timingSafeEqual } from 'node:crypto';

import { chmod, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import path from 'node:path';

import { resolveConfigDirectory } from './config-directory.js';

const TOKEN_FILE_NAME = 'api-token';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export type LocalTokenStoreErrorCode = 'INVALID_TOKEN_FILE';

export class LocalTokenStoreError extends Error {
  public readonly code: LocalTokenStoreErrorCode;

  public constructor(code: LocalTokenStoreErrorCode, message: string) {
    super(message);

    this.name = 'LocalTokenStoreError';
    this.code = code;
  }
}

function isErrnoCode(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function parseToken(contents: string): string {
  const token = contents.trim();

  if (!TOKEN_PATTERN.test(token)) {
    throw new LocalTokenStoreError(
      'INVALID_TOKEN_FILE',
      'O arquivo do token local possui formato inválido.',
    );
  }

  return token;
}

export function secureTokenEqual(
  candidate: string | undefined,
  expected: string,
): boolean {
  if (!candidate) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate, 'utf8');

  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export class LocalTokenStore {
  private readonly configDirectory: string;
  private readonly tokenFile: string;

  public constructor(configDirectory = resolveConfigDirectory()) {
    this.configDirectory = configDirectory;
    this.tokenFile = path.join(configDirectory, TOKEN_FILE_NAME);
  }

  public get filePath(): string {
    return this.tokenFile;
  }

  public async read(): Promise<string> {
    const contents = await readFile(this.tokenFile, 'utf8');

    const token = parseToken(contents);

    await chmod(this.tokenFile, 0o600);

    return token;
  }

  public async getOrCreate(): Promise<string> {
    await mkdir(this.configDirectory, {
      recursive: true,
      mode: 0o700,
    });

    await chmod(this.configDirectory, 0o700);

    try {
      return await this.read();
    } catch (error) {
      if (!isErrnoCode(error, 'ENOENT')) {
        throw error;
      }
    }

    const token = randomBytes(32).toString('hex');

    const temporaryFile = path.join(
      this.configDirectory,
      [
        `.${TOKEN_FILE_NAME}`,
        process.pid,
        randomBytes(8).toString('hex'),
        'tmp',
      ].join('.'),
    );

    try {
      await writeFile(temporaryFile, `${token}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });

      try {
        // O hard link publica somente um arquivo já
        // completamente escrito e falha se outro
        // processo venceu a corrida.
        await link(temporaryFile, this.tokenFile);

        await chmod(this.tokenFile, 0o600);

        return token;
      } catch (error) {
        if (isErrnoCode(error, 'EEXIST')) {
          return await this.read();
        }

        throw error;
      }
    } finally {
      await rm(temporaryFile, {
        force: true,
      });
    }
  }
}
