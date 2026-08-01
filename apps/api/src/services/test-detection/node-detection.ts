import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project, ProjectTestRunner } from '@dev-dashboard/contracts';

import { pathExists } from './fs-helpers.js';
import type { DetectedTestCommand } from './types.js';

type NodePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PackageManifest {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
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

export async function detectNodeCommands(
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
