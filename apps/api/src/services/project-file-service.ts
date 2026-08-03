import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, type Dirent } from 'node:fs';
import {
  access,
  chmod,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import type {
  ProjectDirectoryListing,
  ProjectFileContent,
  ProjectFileEntry,
  ProjectFileSearchMatch,
  ProjectFileSearchResult,
} from '@dev-dashboard/contracts';

export type ProjectFileErrorCode =
  | 'FILE_PATH_INVALID'
  | 'FILE_OUTSIDE_PROJECT'
  | 'FILE_NOT_FOUND'
  | 'FILE_IGNORED'
  | 'FILE_NOT_DIRECTORY'
  | 'FILE_NOT_FILE'
  | 'FILE_TOO_LARGE'
  | 'FILE_BINARY'
  | 'FILE_NOT_READABLE'
  | 'FILE_NOT_WRITABLE'
  | 'FILE_VERSION_INVALID'
  | 'FILE_CHANGED_EXTERNALLY'
  | 'FILE_WRITE_FAILED'
  | 'FILE_SEARCH_INVALID';

export class ProjectFileError extends Error {
  public constructor(
    public readonly code: ProjectFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

const MAX_FILE_SIZE = 512 * 1024;
const MAX_DIRECTORY_ENTRIES = 500;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCHED_FILES = 2_000;
const MAX_SEARCH_DEPTH = 12;
const decoder = new TextDecoder('utf-8', { fatal: true });

const ignoredPaths = [
  '.git',
  'node_modules',
  'vendor/bundle',
  'coverage',
  'dist',
  'build',
  'tmp/log',
] as const;

const languageByExtension: Record<string, string> = {
  '.adoc': 'asciidoc',
  '.bash': 'shell',
  '.c': 'c',
  '.cc': 'cpp',
  '.coffee': 'coffeescript',
  '.cpp': 'cpp',
  '.css': 'css',
  '.erb': 'html',
  '.gemspec': 'ruby',
  '.go': 'go',
  '.graphql': 'graphql',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsx': 'javascript',
  '.md': 'markdown',
  '.mdown': 'markdown',
  '.php': 'php',
  '.py': 'python',
  '.rb': 'ruby',
  '.rdoc': 'plaintext',
  '.rs': 'rust',
  '.scss': 'scss',
  '.sh': 'shell',
  '.sql': 'sql',
  '.svelte': 'svelte',
  '.toml': 'toml',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.txt': 'plaintext',
  '.vue': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

function normalizeRelativePath(value: string): string {
  if (value.includes('\0') || value.includes('\\') || path.isAbsolute(value)) {
    throw new ProjectFileError(
      'FILE_PATH_INVALID',
      'O caminho do arquivo deve ser relativo ao projeto.',
    );
  }

  if (value === '') return '';

  const segments = value.split('/');
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new ProjectFileError(
      'FILE_PATH_INVALID',
      'O caminho do arquivo contém segmentos inválidos.',
    );
  }

  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../')) {
    throw new ProjectFileError(
      'FILE_PATH_INVALID',
      'O caminho do arquivo não é válido.',
    );
  }

  return normalized;
}

function isWithinRoot(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function isIgnoredPath(relativePath: string): boolean {
  return ignoredPaths.some(
    (ignored) =>
      relativePath === ignored || relativePath.startsWith(`${ignored}/`),
  );
}

function isSensitivePath(relativePath: string): boolean {
  const name = path.posix.basename(relativePath).toLowerCase();
  return (
    name === 'config/master.key' ||
    relativePath.toLowerCase() === 'config/master.key' ||
    name === 'id_rsa' ||
    name === 'id_ed25519' ||
    name.startsWith('.env') ||
    name.endsWith('.pem') ||
    name.endsWith('.key')
  );
}

function shouldHide(relativePath: string): boolean {
  return isIgnoredPath(relativePath) || isSensitivePath(relativePath);
}

function languageFor(relativePath: string): string {
  const name = path.posix.basename(relativePath).toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'gemfile' || name === 'rakefile' || name === 'guardfile') {
    return 'ruby';
  }
  if (name === 'makefile') return 'makefile';
  return languageByExtension[path.posix.extname(name)] ?? 'plaintext';
}

function isBinary(buffer: Buffer): boolean {
  const inspected = buffer.subarray(0, Math.min(buffer.length, 8 * 1024));
  if (inspected.includes(0)) return true;
  try {
    decoder.decode(buffer);
    return false;
  } catch {
    return true;
  }
}

function versionFor(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function publicPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

async function canonicalRoot(projectPath: string): Promise<string> {
  try {
    return await realpath(projectPath);
  } catch {
    throw new ProjectFileError(
      'FILE_NOT_READABLE',
      'Não foi possível acessar a raiz do projeto.',
    );
  }
}

async function resolveExistingPath(
  root: string,
  relativePath: string,
): Promise<string> {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized && shouldHide(normalized)) {
    throw new ProjectFileError(
      'FILE_IGNORED',
      'Este caminho não fica disponível no editor embutido.',
    );
  }

  const candidate = path.resolve(root, ...normalized.split('/').filter(Boolean));
  let canonical: string;
  try {
    canonical = await realpath(candidate);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new ProjectFileError('FILE_NOT_FOUND', 'Arquivo não encontrado.');
    }
    throw new ProjectFileError(
      'FILE_NOT_READABLE',
      'Não foi possível acessar o arquivo.',
    );
  }

  if (!isWithinRoot(root, canonical)) {
    throw new ProjectFileError(
      'FILE_OUTSIDE_PROJECT',
      'O caminho solicitado está fora da raiz do projeto.',
    );
  }

  return canonical;
}

async function isWritable(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function safeEntry(
  root: string,
  parent: string,
  entry: Dirent,
): Promise<ProjectFileEntry | null> {
  const relativePath = publicPath(parent, entry.name);
  if (shouldHide(relativePath)) return null;

  let canonical: string;
  try {
    canonical = await realpath(path.resolve(root, ...relativePath.split('/')));
  } catch {
    return null;
  }
  if (!isWithinRoot(root, canonical)) return null;

  let stats;
  try {
    stats = await stat(canonical);
  } catch {
    return null;
  }

  if (stats.isDirectory()) {
    return { path: relativePath, name: entry.name, kind: 'directory' };
  }
  if (!stats.isFile()) return null;

  return {
    path: relativePath,
    name: entry.name,
    kind: 'file',
    language: languageFor(relativePath),
    size: stats.size,
  };
}

export class ProjectFileService {
  public async listDirectory(
    projectPath: string,
    relativePath = '',
  ): Promise<ProjectDirectoryListing> {
    const root = await canonicalRoot(projectPath);
    const normalized = normalizeRelativePath(relativePath);
    const target = await resolveExistingPath(root, normalized);
    const stats = await stat(target);
    if (!stats.isDirectory()) {
      throw new ProjectFileError(
        'FILE_NOT_DIRECTORY',
        'O caminho solicitado não é um diretório.',
      );
    }

    let dirents: Dirent[];
    try {
      dirents = await readdir(target, { withFileTypes: true });
    } catch {
      throw new ProjectFileError(
        'FILE_NOT_READABLE',
        'Não foi possível listar este diretório.',
      );
    }

    const entries = (
      await Promise.all(
        dirents
          .slice(0, MAX_DIRECTORY_ENTRIES + 1)
          .map((entry) => safeEntry(root, normalized, entry)),
      )
    )
      .filter((entry): entry is ProjectFileEntry => Boolean(entry))
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
        return left.name.localeCompare(right.name, 'pt-BR');
      });

    return {
      path: normalized,
      entries: entries.slice(0, MAX_DIRECTORY_ENTRIES),
      truncated: dirents.length > MAX_DIRECTORY_ENTRIES,
    };
  }

  public async readFile(
    projectPath: string,
    relativePath: string,
  ): Promise<ProjectFileContent> {
    const root = await canonicalRoot(projectPath);
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) {
      throw new ProjectFileError(
        'FILE_PATH_INVALID',
        'Informe o caminho relativo do arquivo.',
      );
    }
    const target = await resolveExistingPath(root, normalized);
    const stats = await stat(target);
    if (!stats.isFile()) {
      throw new ProjectFileError(
        'FILE_NOT_FILE',
        'O caminho solicitado não é um arquivo.',
      );
    }
    if (stats.size > MAX_FILE_SIZE) {
      throw new ProjectFileError(
        'FILE_TOO_LARGE',
        'O arquivo ultrapassa o limite de 512 KB.',
      );
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(target);
    } catch {
      throw new ProjectFileError(
        'FILE_NOT_READABLE',
        'Não foi possível ler o arquivo.',
      );
    }
    if (isBinary(buffer)) {
      throw new ProjectFileError(
        'FILE_BINARY',
        'Arquivos binários não podem ser abertos no editor.',
      );
    }

    const content = buffer.toString('utf8');
    return {
      path: normalized,
      name: path.posix.basename(normalized),
      language: languageFor(normalized),
      content,
      version: versionFor(buffer),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      writable: await isWritable(target),
    };
  }

  public async writeFile(
    projectPath: string,
    relativePath: string,
    content: string,
    expectedVersion: string,
  ): Promise<ProjectFileContent> {
    if (!/^[a-f0-9]{64}$/.test(expectedVersion)) {
      throw new ProjectFileError(
        'FILE_VERSION_INVALID',
        'A versão esperada do arquivo não é válida.',
      );
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE) {
      throw new ProjectFileError(
        'FILE_TOO_LARGE',
        'O conteúdo ultrapassa o limite de 512 KB.',
      );
    }

    const root = await canonicalRoot(projectPath);
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) {
      throw new ProjectFileError(
        'FILE_PATH_INVALID',
        'Informe o caminho relativo do arquivo.',
      );
    }
    const target = await resolveExistingPath(root, normalized);
    const stats = await stat(target);
    if (!stats.isFile()) {
      throw new ProjectFileError(
        'FILE_NOT_FILE',
        'O caminho solicitado não é um arquivo.',
      );
    }

    let currentBuffer: Buffer;
    try {
      currentBuffer = await readFile(target);
    } catch {
      throw new ProjectFileError(
        'FILE_NOT_READABLE',
        'Não foi possível ler o arquivo antes de salvar.',
      );
    }
    if (isBinary(currentBuffer)) {
      throw new ProjectFileError(
        'FILE_BINARY',
        'Arquivos binários não podem ser alterados no editor.',
      );
    }
    if (versionFor(currentBuffer) !== expectedVersion) {
      throw new ProjectFileError(
        'FILE_CHANGED_EXTERNALLY',
        'O arquivo mudou no disco desde que foi aberto.',
      );
    }
    if (!(await isWritable(target))) {
      throw new ProjectFileError(
        'FILE_NOT_WRITABLE',
        'O arquivo não possui permissão de escrita.',
      );
    }

    const mode = stats.mode & 0o777;
    const temporaryPath = path.join(
      path.dirname(target),
      `.${path.basename(target)}.dev-dashboard-${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      handle = await open(temporaryPath, 'wx', mode);
      await handle.writeFile(content, { encoding: 'utf8' });
      await handle.sync();
      await handle.close();
      handle = undefined;
      await chmod(temporaryPath, mode);

      const latestStats = await lstat(target);
      if (!latestStats.isFile() || latestStats.isSymbolicLink()) {
        throw new ProjectFileError(
          'FILE_CHANGED_EXTERNALLY',
          'O arquivo mudou no disco durante o salvamento.',
        );
      }
      const latestCanonical = await realpath(target);
      if (latestCanonical !== target || !isWithinRoot(root, latestCanonical)) {
        throw new ProjectFileError(
          'FILE_OUTSIDE_PROJECT',
          'O destino do salvamento saiu da raiz do projeto.',
        );
      }
      const latestBuffer = await readFile(target);
      if (versionFor(latestBuffer) !== expectedVersion) {
        throw new ProjectFileError(
          'FILE_CHANGED_EXTERNALLY',
          'O arquivo mudou no disco durante o salvamento.',
        );
      }

      await rename(temporaryPath, target);
    } catch (error) {
      if (error instanceof ProjectFileError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
        throw new ProjectFileError(
          'FILE_NOT_WRITABLE',
          'O arquivo não pôde ser gravado por falta de permissão.',
        );
      }
      throw new ProjectFileError(
        'FILE_WRITE_FAILED',
        'Não foi possível salvar o arquivo de forma atômica.',
      );
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }

    return this.readFile(projectPath, normalized);
  }

  public async search(
    projectPath: string,
    rawQuery: string,
    requestedLimit = 50,
  ): Promise<ProjectFileSearchResult> {
    const query = rawQuery.trim();
    if (query.length < 2 || query.length > 100) {
      throw new ProjectFileError(
        'FILE_SEARCH_INVALID',
        'A busca deve conter entre 2 e 100 caracteres.',
      );
    }
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_SEARCH_RESULTS);
    const root = await canonicalRoot(projectPath);
    const queue: Array<{ relativePath: string; depth: number }> = [
      { relativePath: '', depth: 0 },
    ];
    const items: ProjectFileSearchMatch[] = [];
    let scannedFiles = 0;
    let truncated = false;
    const normalizedQuery = query.toLocaleLowerCase('pt-BR');

    while (queue.length > 0 && items.length < limit) {
      const current = queue.shift();
      if (!current) break;
      if (current.depth > MAX_SEARCH_DEPTH) {
        truncated = true;
        continue;
      }

      let listing: ProjectDirectoryListing;
      try {
        listing = await this.listDirectory(projectPath, current.relativePath);
      } catch {
        continue;
      }
      truncated ||= listing.truncated;

      for (const entry of listing.entries) {
        if (entry.kind === 'directory') {
          queue.push({ relativePath: entry.path, depth: current.depth + 1 });
          continue;
        }
        if (scannedFiles >= MAX_SEARCHED_FILES) {
          truncated = true;
          break;
        }
        scannedFiles += 1;
        if ((entry.size ?? 0) > MAX_FILE_SIZE) continue;

        let file: ProjectFileContent;
        try {
          file = await this.readFile(projectPath, entry.path);
        } catch {
          continue;
        }

        const lines = file.content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? '';
          const column = line.toLocaleLowerCase('pt-BR').indexOf(normalizedQuery);
          if (column < 0) continue;
          items.push({
            path: file.path,
            name: file.name,
            language: file.language,
            line: index + 1,
            column: column + 1,
            preview: line.trim().slice(0, 240),
          });
          if (items.length >= limit) {
            truncated = true;
            break;
          }
        }
        if (items.length >= limit) break;
      }
      if (scannedFiles >= MAX_SEARCHED_FILES) break;
    }

    return { query, items, truncated, scannedFiles };
  }
}
