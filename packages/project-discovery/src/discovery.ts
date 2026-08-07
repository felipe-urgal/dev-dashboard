import { createHash } from 'node:crypto';
import { access, readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  Project,
  ProjectCapability,
  ProjectSource,
  ProjectType,
  Workspace,
} from '@dev-dashboard/contracts';

import { loadProjectTypeRules } from './project-type-rules.js';

interface PackageManifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface DetectProjectOptions {
  workspaceId?: string;
  source?: ProjectSource;
  includeUnknown?: boolean;
}

export interface ScanWorkspaceOptions {
  includeUnknown?: boolean;
  /** Ativa a varredura recursiva (opt-in); por padrão só os filhos diretos são escaneados. */
  recursive?: boolean;
  /** Profundidade máxima de subdiretórios explorados quando `recursive` está ativo. */
  maxDepth?: number;
  /** Número máximo de projetos detectados antes de interromper a varredura. */
  maxProjects?: number;
  /** Tempo máximo (ms) da varredura recursiva antes de retornar um resultado parcial. */
  timeoutMs?: number;
  /**
   * Segue links simbólicos ao descer em subdiretórios durante a varredura recursiva.
   * Desativado por padrão para evitar ciclos e travessia para fora do workspace.
   */
  followSymlinks?: boolean;
}

export interface WorkspaceScanWarning {
  path: string;
  code:
    | 'UNREADABLE_DIRECTORY'
    | 'PROJECT_DETECTION_FAILED'
    | 'SCAN_DEPTH_LIMIT_REACHED'
    | 'SCAN_PROJECT_LIMIT_REACHED'
    | 'SCAN_TIMEOUT';
  message: string;
}

const DEFAULT_RECURSIVE_MAX_DEPTH = 3;
const DEFAULT_RECURSIVE_MAX_PROJECTS = 200;
const DEFAULT_RECURSIVE_TIMEOUT_MS = 5000;

export interface WorkspaceScanResult {
  workspaceId: string;
  workspacePath: string;
  projects: Project[];
  warnings: WorkspaceScanWarning[];
}

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
]);

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function hasAnyPath(
  basePath: string,
  relativePaths: string[],
): Promise<boolean> {
  for (const relativePath of relativePaths) {
    if (await pathExists(path.join(basePath, relativePath))) {
      return true;
    }
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return Object.fromEntries(entries);
}

async function readPackageManifest(
  projectPath: string,
): Promise<PackageManifest | null> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );

    const parsed: unknown = JSON.parse(contents);

    if (!isRecord(parsed)) {
      return null;
    }

    const scripts = toStringRecord(parsed.scripts);
    const dependencies = toStringRecord(parsed.dependencies);
    const devDependencies = toStringRecord(parsed.devDependencies);

    return {
      ...(scripts ? { scripts } : {}),
      ...(dependencies ? { dependencies } : {}),
      ...(devDependencies ? { devDependencies } : {}),
    };
  } catch {
    return null;
  }
}

async function readGemfile(projectPath: string): Promise<string | null> {
  try {
    return await readFile(path.join(projectPath, 'Gemfile'), 'utf8');
  } catch {
    return null;
  }
}

function hasGem(gemfile: string | null, gemName: string): boolean {
  if (!gemfile) {
    return false;
  }

  const expression = new RegExp(`^\\s*gem\\s+["']${gemName}["']`, 'm');

  return expression.test(gemfile);
}

function hasPackageDependency(
  manifest: PackageManifest | null,
  dependencyName: string,
): boolean {
  return Boolean(
    manifest?.dependencies?.[dependencyName] ??
    manifest?.devDependencies?.[dependencyName],
  );
}

function detectProjectType(
  gemfile: string | null,
  hasPackageJson: boolean,
): ProjectType {
  const rules = loadProjectTypeRules();
  const isRails =
    gemfile !== null &&
    new RegExp(rules.rails.gemNamePattern, 'm').test(gemfile);

  if (isRails) {
    return 'rails';
  }

  if (hasPackageJson) {
    return 'node';
  }

  return 'unknown';
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'project';
}

function createProjectId(name: string, projectPath: string): string {
  const hash = createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .slice(0, 8);

  return `${slugify(name)}-${hash}`;
}

async function detectCapabilities(
  projectPath: string,
  type: ProjectType,
  gemfile: string | null,
  manifest: PackageManifest | null,
): Promise<ProjectCapability[]> {
  const capabilities = new Set<ProjectCapability>();

  if (await pathExists(path.join(projectPath, '.git'))) {
    capabilities.add('git');
  }

  if (type === 'rails') {
    capabilities.add('server');
    capabilities.add('bundler');

    if (await pathExists(path.join(projectPath, 'Rakefile'))) {
      capabilities.add('rake');
    }

    if (await pathExists(path.join(projectPath, 'config/database.yml'))) {
      capabilities.add('database');
    }

    if (await hasAnyPath(projectPath, ['spec', 'test'])) {
      capabilities.add('tests');
    }

    if (
      hasGem(gemfile, 'sidekiq') ||
      (await hasAnyPath(projectPath, [
        'config/sidekiq.yml',
        'config/sidekiq.yaml',
      ]))
    ) {
      capabilities.add('sidekiq');
    }
  }

  if (manifest) {
    capabilities.add('scripts');

    const scripts = manifest.scripts ?? {};

    if (
      type === 'node' &&
      ['dev', 'start', 'serve'].some((scriptName) => scriptName in scripts)
    ) {
      capabilities.add('server');
    }

    if (
      'test' in scripts ||
      (await hasAnyPath(projectPath, ['__tests__', 'test', 'tests']))
    ) {
      capabilities.add('tests');
    }
  }

  if (
    hasPackageDependency(manifest, 'webpack') ||
    (await hasAnyPath(projectPath, [
      'config/webpack',
      'webpack.config.js',
      'webpack.config.cjs',
      'webpack.config.mjs',
      'webpack.config.ts',
    ]))
  ) {
    capabilities.add('webpack');
  }

  return [...capabilities].sort();
}

export async function detectProject(
  projectPath: string,
  options: DetectProjectOptions = {},
): Promise<Project | null> {
  const resolvedPath = await realpath(projectPath);
  const projectStats = await stat(resolvedPath);

  if (!projectStats.isDirectory()) {
    return null;
  }

  const name = path.basename(resolvedPath);
  const hasPackageJson = await pathExists(
    path.join(resolvedPath, 'package.json'),
  );

  const [gemfile, manifest] = await Promise.all([
    readGemfile(resolvedPath),
    hasPackageJson ? readPackageManifest(resolvedPath) : Promise.resolve(null),
  ]);

  const type = detectProjectType(gemfile, hasPackageJson);

  if (type === 'unknown' && options.includeUnknown !== true) {
    return null;
  }

  const source =
    options.source ?? (options.workspaceId ? 'workspace' : 'standalone');

  const project: Project = {
    id: createProjectId(name, resolvedPath),
    name,
    path: resolvedPath,
    type,
    source,
    favorite: false,
    enabled: true,
    capabilities: await detectCapabilities(
      resolvedPath,
      type,
      gemfile,
      manifest,
    ),
  };

  if (options.workspaceId) {
    return {
      ...project,
      workspaceId: options.workspaceId,
    };
  }

  return project;
}

interface WalkContext {
  workspaceId: string;
  includeUnknown: boolean | undefined;
  maxDepth: number;
  maxProjects: number;
  followSymlinks: boolean;
  deadlineAt: number;
  projects: Project[];
  warnings: WorkspaceScanWarning[];
  stopped: boolean;
  /**
   * A varredura não-recursiva reaproveita `walkForProjects` com
   * `maxDepth: 0`, mas não deve avisar sobre subdiretórios não explorados —
   * isso é o comportamento normal dela, não um limite atingido. Só a
   * varredura recursiva de fato reporta `SCAN_DEPTH_LIMIT_REACHED`.
   */
  reportDepthLimit: boolean;
}

function requestStop(
  context: WalkContext,
  code: 'SCAN_PROJECT_LIMIT_REACHED' | 'SCAN_TIMEOUT',
  warningPath: string,
  message: string,
): void {
  if (context.stopped) {
    return;
  }

  context.stopped = true;
  context.warnings.push({ path: warningPath, code, message });
}

async function walkForProjects(
  dirPath: string,
  depth: number,
  context: WalkContext,
): Promise<void> {
  if (context.stopped) {
    return;
  }

  if (Date.now() > context.deadlineAt) {
    requestStop(
      context,
      'SCAN_TIMEOUT',
      dirPath,
      `Tempo limite da varredura recursiva atingido; resultado parcial.`,
    );
    return;
  }

  let entries;

  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    context.warnings.push({
      path: dirPath,
      code: 'UNREADABLE_DIRECTORY',
      message:
        error instanceof Error
          ? error.message
          : 'Não foi possível ler o diretório',
    });
    return;
  }

  const candidates = entries
    .filter((entry) => !IGNORED_DIRECTORIES.has(entry.name))
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of candidates) {
    if (context.stopped) {
      return;
    }

    if (context.projects.length >= context.maxProjects) {
      requestStop(
        context,
        'SCAN_PROJECT_LIMIT_REACHED',
        dirPath,
        `Limite de ${context.maxProjects} projetos atingido; resultado parcial.`,
      );
      return;
    }

    if (Date.now() > context.deadlineAt) {
      requestStop(
        context,
        'SCAN_TIMEOUT',
        dirPath,
        `Tempo limite da varredura recursiva atingido; resultado parcial.`,
      );
      return;
    }

    const candidatePath = path.join(dirPath, entry.name);

    try {
      if (entry.isSymbolicLink() && !context.followSymlinks) {
        continue;
      }

      const candidateStats = entry.isDirectory()
        ? null
        : await stat(candidatePath);

      const isDirectory =
        entry.isDirectory() || candidateStats?.isDirectory() === true;

      if (!isDirectory) {
        continue;
      }

      const project = await detectProject(candidatePath, {
        workspaceId: context.workspaceId,
        source: 'workspace',
        ...(context.includeUnknown !== undefined
          ? { includeUnknown: context.includeUnknown }
          : {}),
      });

      if (project) {
        context.projects.push(project);
        continue;
      }

      if (depth < context.maxDepth) {
        await walkForProjects(candidatePath, depth + 1, context);
      } else if (context.reportDepthLimit) {
        context.warnings.push({
          path: candidatePath,
          code: 'SCAN_DEPTH_LIMIT_REACHED',
          message: `Profundidade máxima (${context.maxDepth}) atingida; diretório não explorado.`,
        });
      }
    } catch (error) {
      context.warnings.push({
        path: candidatePath,
        code: 'PROJECT_DETECTION_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível detectar o projeto',
      });
    }
  }
}

export async function scanWorkspace(
  workspace: Pick<Workspace, 'id' | 'path'>,
  options: ScanWorkspaceOptions = {},
): Promise<WorkspaceScanResult> {
  const workspacePath = await realpath(workspace.path);

  const context: WalkContext = options.recursive
    ? {
        workspaceId: workspace.id,
        includeUnknown: options.includeUnknown,
        maxDepth: options.maxDepth ?? DEFAULT_RECURSIVE_MAX_DEPTH,
        maxProjects: options.maxProjects ?? DEFAULT_RECURSIVE_MAX_PROJECTS,
        followSymlinks: options.followSymlinks ?? false,
        deadlineAt:
          Date.now() + (options.timeoutMs ?? DEFAULT_RECURSIVE_TIMEOUT_MS),
        projects: [],
        warnings: [],
        stopped: false,
        reportDepthLimit: true,
      }
    : {
        // Varredura de só os filhos diretos: reaproveita walkForProjects com
        // maxDepth 0 (não desce além do primeiro nível) e sem os limites de
        // projetos/tempo/símlinks da varredura recursiva, que não fazem
        // sentido para um único nível.
        workspaceId: workspace.id,
        includeUnknown: options.includeUnknown,
        maxDepth: 0,
        maxProjects: Infinity,
        followSymlinks: true,
        deadlineAt: Infinity,
        projects: [],
        warnings: [],
        stopped: false,
        reportDepthLimit: false,
      };

  await walkForProjects(workspacePath, 0, context);

  return {
    workspaceId: workspace.id,
    workspacePath,
    projects: context.projects,
    warnings: context.warnings,
  };
}
