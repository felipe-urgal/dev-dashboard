import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Project,
  ProjectTestCommand,
  ProjectTestOverview,
  ProjectTestRunner,
} from '@dev-dashboard/contracts';

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
  if (packageManager === 'npm') {
    return { command: 'npm', args: ['run', scriptName, '--silent'] };
  }
  return { command: packageManager, args: ['run', scriptName] };
}

interface ResolvedCommand {
  command: string;
  args: string[];
}

interface DetectedTestCommand extends ProjectTestCommand {
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

  if (hasRails && binRailsExists && hasTestDir) {
    commands.push({
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
    });
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
  const hasPytestConfig =
    (await pathExists(path.join(project.path, 'pytest.ini'))) ||
    (await pathExists(path.join(project.path, 'pyproject.toml')));
  const hasTestsDir = await pathExists(
    path.join(project.path, 'tests'),
  );

  if (!hasPytestConfig && !hasTestsDir) {
    return [];
  }

  return [
    {
      id: 'python-pytest',
      runner: 'pytest',
      label: 'pytest',
      description: 'Executa o pytest na raiz do projeto.',
      origin: hasPytestConfig ? 'python-config' : 'directory',
      originDetail: hasPytestConfig ? 'pytest.ini/pyproject.toml' : 'tests/',
      priority: 40,
      resolved: { command: 'pytest', args: [] },
    },
  ];
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
        .map(({ resolved: _resolved, ...rest }) => rest)
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
