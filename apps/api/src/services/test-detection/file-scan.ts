import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectTestRunner } from '@dev-dashboard/contracts';

import { TestFileError } from './errors.js';
import type { ResolvedCommand } from './types.js';

export const FILE_TARGET_PATTERNS: Partial<Record<ProjectTestRunner, RegExp>> =
  {
    vitest: /\.(test|spec)\.[tj]sx?$/i,
    jest: /\.(test|spec)\.[tj]sx?$/i,
    'node-test': /\.(test|spec)\.[tj]sx?$/i,
    rspec: /_spec\.rb$/i,
    'rails-test': /_test\.rb$/i,
    pytest: /^(test_.*|.*_test)\.py$/i,
  };

/**
 * Runners que aceitam `arquivo:linha` na linha de comando para rodar só o
 * exemplo/grupo daquela linha (RSpec resolve `describe`/`it` sozinho a
 * partir da linha, sem precisar de nome ou parser de AST no dashboard).
 */
export const CASE_TARGET_RUNNERS: ReadonlySet<ProjectTestRunner> = new Set([
  'rspec',
]);

/**
 * Runners que resolvem caso/`describe` específico por padrão de nome (não
 * por linha) via `-t`/`--test-name-pattern` — diferente de `CASE_TARGET_RUNNERS`,
 * que resolve por `arquivo:linha` sem precisar de nome.
 */
export const NAME_PATTERN_TARGET_RUNNERS: ReadonlySet<ProjectTestRunner> =
  new Set(['vitest', 'jest', 'node-test']);

const NAME_PATTERN_FLAG: Partial<Record<ProjectTestRunner, string>> = {
  vitest: '-t',
  jest: '-t',
  'node-test': '--test-name-pattern',
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

export async function findTestFiles(
  projectPath: string,
  pattern: RegExp,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(
    currentDirectory: string,
    relativeDirectory: string,
    depth: number,
  ): Promise<void> {
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

      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        if (IGNORED_TEST_SCAN_DIRECTORIES.has(entry.name)) continue;
        await walk(
          path.join(currentDirectory, entry.name),
          relativePath,
          depth + 1,
        );
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(relativePath);
      }
    }
  }

  await walk(projectPath, '', 0);
  return results.sort((left, right) => left.localeCompare(right));
}

export function ensureTestPathInsideProject(
  projectPath: string,
  requested: string,
): string {
  if (!requested || requested.includes('\0')) {
    throw new TestFileError(
      'TEST_FILE_NOT_FOUND',
      'Caminho de arquivo de teste inválido.',
    );
  }
  const normalizedProject = path.resolve(projectPath);
  const resolved = path.resolve(normalizedProject, requested);
  const relative = path.relative(normalizedProject, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TestFileError(
      'TEST_FILE_NOT_FOUND',
      'Caminho de arquivo de teste fora do projeto.',
    );
  }
  return relative;
}

const NPM_SCRIPT_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

export function composeFileCommand(
  resolved: ResolvedCommand,
  filePath: string,
): ResolvedCommand {
  const isPackageScriptInvocation =
    NPM_SCRIPT_RUNNERS.has(resolved.command) && resolved.args[0] === 'run';
  if (isPackageScriptInvocation) {
    return {
      command: resolved.command,
      args: [...resolved.args, '--', filePath],
    };
  }
  return { command: resolved.command, args: [...resolved.args, filePath] };
}

export function composeNamePatternArgs(
  resolved: ResolvedCommand,
  runner: ProjectTestRunner,
  namePattern: string,
): ResolvedCommand {
  const flag = NAME_PATTERN_FLAG[runner];
  if (!flag) return resolved;
  return {
    command: resolved.command,
    args: [...resolved.args, flag, namePattern],
  };
}
