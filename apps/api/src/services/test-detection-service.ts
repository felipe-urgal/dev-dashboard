import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Project,
  ProjectTestCommand,
  ProjectTestFile,
  ProjectTestOverview,
  ProjectTestRunner,
} from '@dev-dashboard/contracts';

export type TestFileErrorCode = 'TEST_FILE_TARGET_UNSUPPORTED' | 'TEST_FILE_NOT_FOUND';

export class TestFileError extends Error {
  public constructor(public readonly code: TestFileErrorCode, message: string) {
    super(message);
    this.name = 'TestFileError';
  }
}

type NodePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PackageManifest {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(
  projectPath: string,
): Promise<PackageManifest | null> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );

    const parsed: unknown = JSON.parse(contents);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return parsed as PackageManifest;
  } catch {
    return null;
  }
}

async function resolveNodePackageManager(
  projectPath: string,
): Promise<NodePackageManager> {
  if (await pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await pathExists(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (
    (await pathExists(path.join(projectPath, 'bun.lock'))) ||
    (await pathExists(path.join(projectPath, 'bun.lockb')))
  ) {
    return 'bun';
  }
  return 'npm';
}

function hasDependency(
  manifest: PackageManifest,
  name: string,
): boolean {
  return Boolean(
    manifest.devDependencies?.[name] ??
      manifest.dependencies?.[name],
  );
}

function commandForScript(
  packageManager: NodePackageManager,
  scriptName: string,
): { command: string; args: string[] } {
  return { command: packageManager, args: ['run', scriptName] };
}

interface ResolvedCommand {
  command: string;
  args: string[];
}

interface DetectedTestCommand extends Omit<ProjectTestCommand, 'supportsFileTarget'> {
  resolved: ResolvedCommand;
}

async function detectNodeCommands(
  project: Project,
): Promise<DetectedTestCommand[]> {
  const manifest = await readManifest(project.path);
  if (!manifest) {
    return [];
  }

  const scripts = manifest.scripts ?? {};
  const packageManager = await resolveNodePackageManager(project.path);
  const commands: DetectedTestCommand[] = [];

  const scriptEntries: Array<{
    script: string;
    runner: ProjectTestRunner;
    priority: number;
    label: string;
  }> = [];

  const testScript = scripts['test'];
  if (typeof testScript === 'string' && testScript.length > 0) {
    const runner: ProjectTestRunner = /\bvitest\b/i.test(testScript)
      ? 'vitest'
      : /\bjest\b/i.test(testScript)
        ? 'jest'
        : /node\s+--test|node:test/i.test(testScript)
          ? 'node-test'
          : hasDependency(manifest, 'vitest')
            ? 'vitest'
            : hasDependency(manifest, 'jest')
              ? 'jest'
              : 'node-test';
    scriptEntries.push({
      script: 'test',
      runner,
      priority: 10,
      label: `${packageManager} run test`,
    });
  }

  for (const alternative of ['test:unit', 'test:ci']) {
    if (typeof scripts[alternative] === 'string') {
      scriptEntries.push({
        script: alternative,
        runner: /\bvitest\b/i.test(scripts[alternative] ?? '')
          ? 'vitest'
          : /\bjest\b/i.test(scripts[alternative] ?? '')
            ? 'jest'
            : 'node-test',
        priority: 20,
        label: `${packageManager} run ${alternative}`,
      });
    }
  }

  for (const entry of scriptEntries) {
    const resolved = commandForScript(packageManager, entry.script);
    commands.push({
      id: `node-script-${entry.script}`,
      runner: entry.runner,
      label: entry.label,
      description: `Executa o script \`${entry.script}\` do package.json.`,
      origin: 'package-script',
      originDetail: `scripts.${entry.script}`,
      priority: entry.priority,
      resolved,
    });
  }

  // Vitest via binário local, sem script
  if (
    commands.length === 0 &&
    hasDependency(manifest, 'vitest') &&
    (await pathExists(
      path.join(project.path, 'node_modules', '.bin', 'vitest'),
    ))
  ) {
    commands.push({
      id: 'node-vitest-binary',
      runner: 'vitest',
      label: 'vitest run',
      description: 'Executa o binário local do Vitest em modo único.',
      origin: 'binary',
      originDetail: 'node_modules/.bin/vitest',
      priority: 30,
      resolved: {
        command: path.join(
          project.path,
          'node_modules',
          '.bin',
          'vitest',
        ),
        args: ['run'],
      },
    });
  }

  if (
    commands.length === 0 &&
    hasDependency(manifest, 'jest') &&
    (await pathExists(
      path.join(project.path, 'node_modules', '.bin', 'jest'),
    ))
  ) {
    commands.push({
      id: 'node-jest-binary',
      runner: 'jest',
      label: 'jest --ci',
      description: 'Executa o binário local do Jest em modo CI.',
      origin: 'binary',
      originDetail: 'node_modules/.bin/jest',
      priority: 30,
      resolved: {
        command: path.join(
          project.path,
          'node_modules',
          '.bin',
          'jest',
        ),
        args: ['--ci'],
      },
    });
  }

  return commands;
}

async function detectRailsCommands(
  project: Project,
): Promise<DetectedTestCommand[]> {
  const commands: DetectedTestCommand[] = [];
  const gemfilePath = path.join(project.path, 'Gemfile');
  let gemfile = '';

  try {
    gemfile = await readFile(gemfilePath, 'utf8');
  } catch {
    // sem Gemfile — não é Rails
    return commands;
  }

  const hasRspec = /gem\s+["']rspec/i.test(gemfile);
  const hasRails = /gem\s+["']rails/i.test(gemfile);
  const binRailsExists = await pathExists(
    path.join(project.path, 'bin', 'rails'),
  );
  const binRspecExists = await pathExists(
    path.join(project.path, 'bin', 'rspec'),
  );
  const hasSpecDir = await pathExists(
    path.join(project.path, 'spec'),
  );
  const hasTestDir = await pathExists(
    path.join(project.path, 'test'),
  );

  if (hasRspec || binRspecExists || hasSpecDir) {
    commands.push({
      id: 'rails-rspec',
      runner: 'rspec',
      label: binRspecExists ? 'bin/rspec' : 'bundle exec rspec',
      description: 'Executa a suíte completa do RSpec.',
      origin: binRspecExists ? 'binary' : hasSpecDir ? 'directory' : 'gemfile',
      originDetail: binRspecExists
        ? 'bin/rspec'
        : hasSpecDir
          ? 'spec/'
          : 'Gemfile',
      priority: 10,
      resolved: binRspecExists
        ? { command: path.join(project.path, 'bin', 'rspec'), args: [] }
        : { command: 'bundle', args: ['exec', 'rspec'] },
    });
  }

  if (hasRails && hasTestDir) {
    commands.push(
      binRailsExists
        ? {
            id: 'rails-test',
            runner: 'rails-test',
            label: 'bin/rails test',
            description: 'Executa a task de teste do Rails.',
            origin: 'binary',
            originDetail: 'bin/rails',
            priority: 20,
            resolved: {
              command: path.join(project.path, 'bin', 'rails'),
              args: ['test'],
            },
          }
        : {
            id: 'rails-test',
            runner: 'rails-test',
            label: 'bundle exec rails test',
            description: 'Executa a task de teste do Rails via bundle.',
            origin: 'gemfile',
            originDetail: 'Gemfile',
            priority: 20,
            resolved: {
              command: 'bundle',
              args: ['exec', 'rails', 'test'],
            },
          },
    );
  } else if (hasTestDir && !hasRails) {
    commands.push({
      id: 'ruby-minitest',
      runner: 'minitest',
      label: 'bundle exec rake test',
      description: 'Executa a task de teste do Rake para Minitest.',
      origin: 'directory',
      originDetail: 'test/',
      priority: 30,
      resolved: {
        command: 'bundle',
        args: ['exec', 'rake', 'test'],
      },
    });
  }

  return commands;
}

async function detectPythonCommands(
  project: Project,
): Promise<DetectedTestCommand[]> {
  // Só oferece pytest se houver sinal explícito de Python + pytest.
  const hasPytestIni = await pathExists(
    path.join(project.path, 'pytest.ini'),
  );
  const hasConftest = await pathExists(
    path.join(project.path, 'conftest.py'),
  );

  let pyprojectDeclaresPytest = false;
  try {
    const pyproject = await readFile(
      path.join(project.path, 'pyproject.toml'),
      'utf8',
    );
    pyprojectDeclaresPytest =
      /\[tool\.pytest(\.[a-z_]+)?\]/i.test(pyproject) ||
      /(^|\s)pytest(\s*[><=~!]|\s*$)/im.test(pyproject);
  } catch {
    // pyproject.toml ausente ou ilegível
  }

  let requirementsDeclaresPytest = false;
  for (const candidate of [
    'requirements.txt',
    'requirements-dev.txt',
    'dev-requirements.txt',
  ]) {
    try {
      const contents = await readFile(
        path.join(project.path, candidate),
        'utf8',
      );
      if (/(^|\s)pytest(\s|$|[><=~!])/im.test(contents)) {
        requirementsDeclaresPytest = true;
        break;
      }
    } catch {
      // arquivo ausente
    }
  }

  const supported =
    hasPytestIni ||
    hasConftest ||
    pyprojectDeclaresPytest ||
    requirementsDeclaresPytest;

  if (!supported) {
    return [];
  }

  const originDetail = hasPytestIni
    ? 'pytest.ini'
    : hasConftest
      ? 'conftest.py'
      : pyprojectDeclaresPytest
        ? 'pyproject.toml'
        : 'requirements*.txt';

  return [
    {
      id: 'python-pytest',
      runner: 'pytest',
      label: 'pytest',
      description: 'Executa o pytest na raiz do projeto.',
      origin: hasPytestIni || pyprojectDeclaresPytest
        ? 'python-config'
        : 'directory',
      originDetail,
      priority: 40,
      resolved: { command: 'pytest', args: [] },
    },
  ];
}

const FILE_TARGET_PATTERNS: Partial<Record<ProjectTestRunner, RegExp>> = {
  vitest: /\.(test|spec)\.[tj]sx?$/i,
  jest: /\.(test|spec)\.[tj]sx?$/i,
  'node-test': /\.(test|spec)\.[tj]sx?$/i,
  rspec: /_spec\.rb$/i,
  'rails-test': /_test\.rb$/i,
  pytest: /^(test_.*|.*_test)\.py$/i,
};

const IGNORED_TEST_SCAN_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
  'vendor',
  'log',
]);

const MAX_TEST_FILES = 500;
const MAX_TEST_SCAN_DEPTH = 8;

async function findTestFiles(
  projectPath: string,
  pattern: RegExp,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDirectory: string, relativeDirectory: string, depth: number): Promise<void> {
    if (results.length >= MAX_TEST_FILES || depth > MAX_TEST_SCAN_DEPTH) {
      return;
    }

    let entries;
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_TEST_FILES) return;
      if (entry.name.startsWith('.')) continue;

      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (IGNORED_TEST_SCAN_DIRECTORIES.has(entry.name)) continue;
        await walk(path.join(currentDirectory, entry.name), relativePath, depth + 1);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(relativePath);
      }
    }
  }

  await walk(projectPath, '', 0);
  return results.sort((left, right) => left.localeCompare(right));
}

function ensureTestPathInsideProject(projectPath: string, requested: string): string {
  if (!requested || requested.includes('\0')) {
    throw new TestFileError('TEST_FILE_NOT_FOUND', 'Caminho de arquivo de teste inválido.');
  }
  const normalizedProject = path.resolve(projectPath);
  const resolved = path.resolve(normalizedProject, requested);
  const relative = path.relative(normalizedProject, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TestFileError('TEST_FILE_NOT_FOUND', 'Caminho de arquivo de teste fora do projeto.');
  }
  return relative;
}

const NPM_SCRIPT_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

function composeFileCommand(resolved: ResolvedCommand, filePath: string): ResolvedCommand {
  const isPackageScriptInvocation = NPM_SCRIPT_RUNNERS.has(resolved.command) && resolved.args[0] === 'run';
  if (isPackageScriptInvocation) {
    return { command: resolved.command, args: [...resolved.args, '--', filePath] };
  }
  return { command: resolved.command, args: [...resolved.args, filePath] };
}

export class TestDetectionService {
  private readonly cache = new Map<string, DetectedTestCommand[]>();

  public invalidate(projectId?: string): void {
    if (projectId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(projectId);
    }
  }

  public async getOverview(
    project: Project,
  ): Promise<ProjectTestOverview> {
    const commands = await this.detect(project);

    return {
      supported: commands.length > 0,
      commands: commands
        .map(({ resolved: _resolved, ...rest }) => ({
          ...rest,
          supportsFileTarget: Boolean(FILE_TARGET_PATTERNS[rest.runner]),
        }))
        .sort((left, right) => left.priority - right.priority),
    };
  }

  public async resolveCommand(
    project: Project,
    commandId: string,
  ): Promise<ResolvedCommand | null> {
    const commands = await this.detect(project);
    const command = commands.find((entry) => entry.id === commandId);
    return command ? command.resolved : null;
  }

  public async listTestFiles(
    project: Project,
    commandId: string,
  ): Promise<ProjectTestFile[] | null> {
    const commands = await this.detect(project);
    const command = commands.find((entry) => entry.id === commandId);
    if (!command) return null;

    const pattern = FILE_TARGET_PATTERNS[command.runner];
    if (!pattern) return [];

    const files = await findTestFiles(project.path, pattern);
    return files.map((filePath) => ({ path: filePath }));
  }

  public async resolveFileCommand(
    project: Project,
    commandId: string,
    filePath: string,
  ): Promise<ResolvedCommand | null> {
    const commands = await this.detect(project);
    const command = commands.find((entry) => entry.id === commandId);
    if (!command) return null;

    const pattern = FILE_TARGET_PATTERNS[command.runner];
    if (!pattern) {
      throw new TestFileError('TEST_FILE_TARGET_UNSUPPORTED', 'Este comando não suporta executar um arquivo específico.');
    }

    const safePath = ensureTestPathInsideProject(project.path, filePath);
    if (!pattern.test(path.basename(safePath))) {
      throw new TestFileError('TEST_FILE_NOT_FOUND', 'O arquivo informado não corresponde a um arquivo de teste reconhecido.');
    }

    return composeFileCommand(command.resolved, safePath);
  }

  private async detect(
    project: Project,
  ): Promise<DetectedTestCommand[]> {
    const cached = this.cache.get(project.id);
    if (cached) {
      return cached;
    }

    const commands: DetectedTestCommand[] = [];

    if (project.type === 'node') {
      commands.push(...(await detectNodeCommands(project)));
    } else if (project.type === 'rails') {
      commands.push(...(await detectRailsCommands(project)));
    }

    commands.push(...(await detectPythonCommands(project)));

    this.cache.set(project.id, commands);
    return commands;
  }
}
