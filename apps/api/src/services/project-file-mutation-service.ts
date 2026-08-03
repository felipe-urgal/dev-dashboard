import { createHash, randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectFileCreateRequest,
  ProjectFileKind,
  ProjectFileMutationApplyRequest,
  ProjectFileMutationPreview,
  ProjectFileMutationPreviewRequest,
  ProjectFileMutationResult,
} from '@dev-dashboard/contracts';

export type ProjectFileMutationErrorCode =
  | 'FILE_PATH_INVALID'
  | 'FILE_OUTSIDE_PROJECT'
  | 'FILE_NOT_FOUND'
  | 'FILE_IGNORED'
  | 'FILE_NOT_DIRECTORY'
  | 'FILE_NOT_FILE'
  | 'FILE_NOT_WRITABLE'
  | 'FILE_TOO_LARGE'
  | 'FILE_ALREADY_EXISTS'
  | 'FILE_MUTATION_TOO_LARGE'
  | 'FILE_MUTATION_HIDDEN_CONTENT'
  | 'FILE_MUTATION_CONFIRMATION_INVALID'
  | 'FILE_CHANGED_EXTERNALLY'
  | 'FILE_WRITE_FAILED';

export class ProjectFileMutationError extends Error {
  public constructor(
    public readonly code: ProjectFileMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectFileMutationError';
  }
}

interface MutationImpact {
  kind: ProjectFileKind;
  affectedFiles: number;
  affectedDirectories: number;
  totalBytes: number;
  fingerprint: string;
}

interface PendingMutation {
  root: string;
  operation: ProjectFileMutationPreviewRequest['operation'];
  path: string;
  destinationPath: string | undefined;
  impact: MutationImpact;
  requiresPhrase: boolean;
  expiresAt: number;
}

const MAX_FILE_SIZE = 512 * 1024;
const MAX_MUTATION_ENTRIES = 2_000;
const MAX_MUTATION_BYTES = 100 * 1024 * 1024;
const CONFIRMATION_TTL_MS = 5 * 60 * 1_000;

const ignoredPaths = [
  '.git',
  'node_modules',
  'vendor/bundle',
  'coverage',
  'dist',
  'build',
  'tmp/log',
] as const;

function normalizeRelativePath(value: string): string {
  if (value.includes('\0') || value.includes('\\') || path.isAbsolute(value)) {
    throw new ProjectFileMutationError(
      'FILE_PATH_INVALID',
      'O caminho deve ser relativo ao projeto.',
    );
  }

  if (value === '') return '';
  const segments = value.split('/');
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new ProjectFileMutationError(
      'FILE_PATH_INVALID',
      'O caminho contém segmentos inválidos.',
    );
  }

  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../')) {
    throw new ProjectFileMutationError(
      'FILE_PATH_INVALID',
      'O caminho informado não é válido.',
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
  const normalized = relativePath.toLowerCase();
  const name = path.posix.basename(normalized);
  return (
    normalized === 'config/master.key'
    || name === 'id_rsa'
    || name === 'id_ed25519'
    || name.startsWith('.env')
    || name.endsWith('.pem')
    || name.endsWith('.key')
  );
}

function assertVisiblePath(relativePath: string): void {
  if (isIgnoredPath(relativePath) || isSensitivePath(relativePath)) {
    throw new ProjectFileMutationError(
      'FILE_IGNORED',
      'Este caminho não pode ser alterado pelo editor embutido.',
    );
  }
}

async function canonicalRoot(projectPath: string): Promise<string> {
  try {
    return await realpath(projectPath);
  } catch {
    throw new ProjectFileMutationError(
      'FILE_NOT_WRITABLE',
      'Não foi possível acessar a raiz do projeto.',
    );
  }
}

async function resolveExistingPath(
  root: string,
  relativePath: string,
): Promise<string> {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    throw new ProjectFileMutationError(
      'FILE_PATH_INVALID',
      'A raiz do projeto não pode ser alterada.',
    );
  }
  assertVisiblePath(normalized);

  const candidate = path.resolve(root, ...normalized.split('/'));
  let candidateStats;
  try {
    candidateStats = await lstat(candidate);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new ProjectFileMutationError(
        'FILE_NOT_FOUND',
        'O caminho solicitado não existe.',
      );
    }
    throw new ProjectFileMutationError(
      'FILE_NOT_WRITABLE',
      'Não foi possível acessar o caminho solicitado.',
    );
  }
  if (candidateStats.isSymbolicLink()) {
    throw new ProjectFileMutationError(
      'FILE_OUTSIDE_PROJECT',
      'Links simbólicos não podem ser alterados pelo editor.',
    );
  }

  const canonical = await realpath(candidate);
  if (canonical !== candidate || !isWithinRoot(root, canonical)) {
    throw new ProjectFileMutationError(
      'FILE_OUTSIDE_PROJECT',
      'O caminho solicitado saiu da raiz canônica do projeto.',
    );
  }
  return canonical;
}

async function resolveDestination(
  root: string,
  relativePath: string,
): Promise<{ normalized: string; target: string }> {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    throw new ProjectFileMutationError(
      'FILE_PATH_INVALID',
      'A raiz do projeto não pode ser usada como destino.',
    );
  }
  assertVisiblePath(normalized);

  const parentRelative = path.posix.dirname(normalized);
  const parentPath = parentRelative === '.' ? root : path.resolve(
    root,
    ...parentRelative.split('/'),
  );
  let canonicalParent: string;
  try {
    canonicalParent = await realpath(parentPath);
  } catch {
    throw new ProjectFileMutationError(
      'FILE_NOT_DIRECTORY',
      'O diretório de destino não existe.',
    );
  }
  if (canonicalParent !== parentPath || !isWithinRoot(root, canonicalParent)) {
    throw new ProjectFileMutationError(
      'FILE_OUTSIDE_PROJECT',
      'O diretório de destino saiu da raiz canônica do projeto.',
    );
  }
  const parentStats = await stat(canonicalParent);
  if (!parentStats.isDirectory()) {
    throw new ProjectFileMutationError(
      'FILE_NOT_DIRECTORY',
      'O destino precisa estar dentro de um diretório existente.',
    );
  }

  return {
    normalized,
    target: path.join(canonicalParent, path.posix.basename(normalized)),
  };
}

async function assertDestinationAvailable(target: string): Promise<void> {
  try {
    await lstat(target);
    throw new ProjectFileMutationError(
      'FILE_ALREADY_EXISTS',
      'Já existe um arquivo ou diretório neste destino.',
    );
  } catch (error) {
    if (error instanceof ProjectFileMutationError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new ProjectFileMutationError(
        'FILE_NOT_WRITABLE',
        'Não foi possível validar o destino da operação.',
      );
    }
  }
}

function fingerprintPart(
  relativePath: string,
  kind: ProjectFileKind,
  size: number,
  modifiedAt: number,
  mode: number,
): string {
  return `${relativePath}\0${kind}\0${size}\0${modifiedAt}\0${mode}\n`;
}

async function scanImpact(
  root: string,
  target: string,
  relativePath: string,
): Promise<MutationImpact> {
  const hash = createHash('sha256');
  let affectedFiles = 0;
  let affectedDirectories = 0;
  let totalBytes = 0;
  let rootKind: ProjectFileKind | undefined;

  async function visit(
    absolutePath: string,
    publicPath: string,
  ): Promise<void> {
    assertVisiblePath(publicPath);
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new ProjectFileMutationError(
        'FILE_OUTSIDE_PROJECT',
        'A operação inclui um link simbólico e foi bloqueada.',
      );
    }

    const canonical = await realpath(absolutePath);
    if (canonical !== absolutePath || !isWithinRoot(root, canonical)) {
      throw new ProjectFileMutationError(
        'FILE_OUTSIDE_PROJECT',
        'A operação saiu da raiz canônica do projeto.',
      );
    }

    if (stats.isFile()) {
      rootKind ??= 'file';
      affectedFiles += 1;
      totalBytes += stats.size;
      hash.update(fingerprintPart(
        publicPath,
        'file',
        stats.size,
        stats.mtimeMs,
        stats.mode,
      ));
    } else if (stats.isDirectory()) {
      rootKind ??= 'directory';
      affectedDirectories += 1;
      hash.update(fingerprintPart(
        publicPath,
        'directory',
        0,
        stats.mtimeMs,
        stats.mode,
      ));
      let entries: Dirent[];
      try {
        entries = await readdir(absolutePath, { withFileTypes: true });
      } catch {
        throw new ProjectFileMutationError(
          'FILE_NOT_WRITABLE',
          'Não foi possível inspecionar o diretório antes da operação.',
        );
      }
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const childPath = `${publicPath}/${entry.name}`;
        if (isIgnoredPath(childPath) || isSensitivePath(childPath)) {
          throw new ProjectFileMutationError(
            'FILE_MUTATION_HIDDEN_CONTENT',
            'A operação inclui conteúdo protegido que não aparece no explorer.',
          );
        }
        await visit(path.join(absolutePath, entry.name), childPath);
      }
    } else {
      throw new ProjectFileMutationError(
        'FILE_MUTATION_HIDDEN_CONTENT',
        'A operação inclui um tipo de arquivo não suportado.',
      );
    }

    if (affectedFiles + affectedDirectories > MAX_MUTATION_ENTRIES) {
      throw new ProjectFileMutationError(
        'FILE_MUTATION_TOO_LARGE',
        'A operação ultrapassa o limite de 2.000 itens.',
      );
    }
    if (totalBytes > MAX_MUTATION_BYTES) {
      throw new ProjectFileMutationError(
        'FILE_MUTATION_TOO_LARGE',
        'A operação ultrapassa o limite de 100 MB.',
      );
    }
  }

  await visit(target, relativePath);
  return {
    kind: rootKind ?? 'file',
    affectedFiles,
    affectedDirectories,
    totalBytes,
    fingerprint: hash.digest('hex'),
  };
}

export class ProjectFileMutationService {
  private readonly pending = new Map<string, PendingMutation>();

  public constructor(
    private readonly now: () => number = Date.now,
  ) {}

  public async createEntry(
    projectPath: string,
    input: ProjectFileCreateRequest,
  ): Promise<ProjectFileMutationResult> {
    const root = await canonicalRoot(projectPath);
    const destination = await resolveDestination(root, input.path);
    await assertDestinationAvailable(destination.target);

    if (
      input.kind === 'file'
      && Buffer.byteLength(input.content ?? '', 'utf8') > MAX_FILE_SIZE
    ) {
      throw new ProjectFileMutationError(
        'FILE_TOO_LARGE',
        'O conteúdo inicial ultrapassa o limite de 512 KB.',
      );
    }

    try {
      if (input.kind === 'directory') {
        await mkdir(destination.target, { mode: 0o755 });
      } else {
        const handle = await open(destination.target, 'wx', 0o644);
        try {
          await handle.writeFile(input.content ?? '', { encoding: 'utf8' });
          await handle.sync();
        } finally {
          await handle.close();
        }
      }

      const canonical = await realpath(destination.target);
      if (canonical !== destination.target || !isWithinRoot(root, canonical)) {
        await rm(destination.target, { recursive: true, force: true });
        throw new ProjectFileMutationError(
          'FILE_OUTSIDE_PROJECT',
          'O item criado saiu da raiz canônica do projeto.',
        );
      }
    } catch (error) {
      if (error instanceof ProjectFileMutationError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        throw new ProjectFileMutationError(
          'FILE_ALREADY_EXISTS',
          'O destino passou a existir durante a criação.',
        );
      }
      if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
        throw new ProjectFileMutationError(
          'FILE_NOT_WRITABLE',
          'Não foi possível criar o item por falta de permissão.',
        );
      }
      throw new ProjectFileMutationError(
        'FILE_WRITE_FAILED',
        'Não foi possível criar o item solicitado.',
      );
    }

    return {
      operation: 'create',
      path: destination.normalized,
      kind: input.kind,
    };
  }

  public async previewMutation(
    projectPath: string,
    input: ProjectFileMutationPreviewRequest,
  ): Promise<ProjectFileMutationPreview> {
    this.removeExpiredConfirmations();
    const root = await canonicalRoot(projectPath);
    const normalized = normalizeRelativePath(input.path);
    const source = await resolveExistingPath(root, normalized);
    const impact = await scanImpact(root, source, normalized);

    let destinationPath: string | undefined;
    if (input.operation === 'rename') {
      if (!input.destinationPath) {
        throw new ProjectFileMutationError(
          'FILE_PATH_INVALID',
          'Informe o novo caminho para renomear.',
        );
      }
      const destination = await resolveDestination(root, input.destinationPath);
      if (destination.normalized === normalized) {
        throw new ProjectFileMutationError(
          'FILE_PATH_INVALID',
          'O novo caminho precisa ser diferente do atual.',
        );
      }
      await assertDestinationAvailable(destination.target);
      destinationPath = destination.normalized;
    }

    const requiresPhrase =
      input.operation === 'delete'
      && impact.kind === 'directory'
      && (impact.affectedFiles > 0 || impact.affectedDirectories > 1);
    const confirmationToken = randomUUID();
    const expiresAt = this.now() + CONFIRMATION_TTL_MS;
    this.pending.set(confirmationToken, {
      root,
      operation: input.operation,
      path: normalized,
      destinationPath,
      impact,
      requiresPhrase,
      expiresAt,
    });

    return {
      confirmationToken,
      operation: input.operation,
      path: normalized,
      ...(destinationPath ? { destinationPath } : {}),
      kind: impact.kind,
      affectedFiles: impact.affectedFiles,
      affectedDirectories: impact.affectedDirectories,
      totalBytes: impact.totalBytes,
      requiresPhrase,
      ...(requiresPhrase ? { confirmationPhrase: normalized } : {}),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async applyMutation(
    projectPath: string,
    input: ProjectFileMutationApplyRequest,
  ): Promise<ProjectFileMutationResult> {
    const pending = this.pending.get(input.confirmationToken);
    this.pending.delete(input.confirmationToken);
    if (!pending || pending.expiresAt <= this.now()) {
      throw new ProjectFileMutationError(
        'FILE_MUTATION_CONFIRMATION_INVALID',
        'A confirmação expirou ou já foi utilizada.',
      );
    }
    if (
      pending.requiresPhrase
      && input.confirmationPhrase !== pending.path
    ) {
      throw new ProjectFileMutationError(
        'FILE_MUTATION_CONFIRMATION_INVALID',
        'Digite o caminho exato para confirmar esta exclusão.',
      );
    }

    const root = await canonicalRoot(projectPath);
    if (root !== pending.root) {
      throw new ProjectFileMutationError(
        'FILE_CHANGED_EXTERNALLY',
        'A raiz do projeto mudou depois da confirmação.',
      );
    }
    const source = await resolveExistingPath(root, pending.path);
    const currentImpact = await scanImpact(root, source, pending.path);
    if (currentImpact.fingerprint !== pending.impact.fingerprint) {
      throw new ProjectFileMutationError(
        'FILE_CHANGED_EXTERNALLY',
        'O conteúdo afetado mudou depois da confirmação.',
      );
    }

    try {
      if (pending.operation === 'rename') {
        const destination = await resolveDestination(
          root,
          pending.destinationPath ?? '',
        );
        await assertDestinationAvailable(destination.target);
        await rename(source, destination.target);
        const canonical = await realpath(destination.target);
        if (canonical !== destination.target || !isWithinRoot(root, canonical)) {
          throw new ProjectFileMutationError(
            'FILE_OUTSIDE_PROJECT',
            'O destino renomeado saiu da raiz canônica do projeto.',
          );
        }
        return {
          operation: 'rename',
          path: pending.path,
          destinationPath: destination.normalized,
          kind: pending.impact.kind,
        };
      }

      if (pending.impact.kind === 'directory') {
        const empty =
          pending.impact.affectedFiles === 0
          && pending.impact.affectedDirectories === 1;
        if (empty) await rmdir(source);
        else await rm(source, { recursive: true, force: false });
      } else {
        await rm(source, { force: false });
      }
      return {
        operation: 'delete',
        path: pending.path,
        kind: pending.impact.kind,
      };
    } catch (error) {
      if (error instanceof ProjectFileMutationError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        throw new ProjectFileMutationError(
          'FILE_ALREADY_EXISTS',
          'O destino ou conteúdo mudou durante a operação.',
        );
      }
      if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
        throw new ProjectFileMutationError(
          'FILE_NOT_WRITABLE',
          'A operação foi bloqueada por falta de permissão.',
        );
      }
      throw new ProjectFileMutationError(
        'FILE_WRITE_FAILED',
        'Não foi possível concluir a operação no arquivo.',
      );
    }
  }

  private removeExpiredConfirmations(): void {
    const now = this.now();
    for (const [token, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(token);
    }
  }
}
