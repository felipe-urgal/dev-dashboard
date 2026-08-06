import { spawn } from 'node:child_process';
import path from 'node:path';

import type { Project, ProjectTestRunner } from '@dev-dashboard/contracts';

import type { TestDetectionService } from './test-detection-service.js';

interface ResolvedCommand {
  command: string;
  args: string[];
}

export interface RelatedTestSelection {
  baseBranch: string;
  currentBranch: string;
  changedFiles: string[];
  testFiles: string[];
  resolved: ResolvedCommand;
}

export type RelatedTestErrorCode =
  'RELATED_TESTS_GIT_UNAVAILABLE' | 'RELATED_TESTS_COMMAND_NOT_FOUND';

export class RelatedTestError extends Error {
  public constructor(
    public readonly code: RelatedTestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RelatedTestError';
  }
}

const MAX_GIT_OUTPUT_BYTES = 1_048_576;
const MAX_RELATED_TEST_FILES = 100;
const NPM_SCRIPT_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

function normalizeRelativePath(value: string): string | null {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..')
  ) {
    return null;
  }
  return normalized;
}

async function runGit(
  cwd: string,
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let exceededLimit = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_GIT_OUTPUT_BYTES) {
        exceededLimit = true;
        child.kill('SIGTERM');
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr) > MAX_GIT_OUTPUT_BYTES) {
        exceededLimit = true;
        child.kill('SIGTERM');
      }
    });
    child.on('error', () => {
      if (options.allowFailure) resolve(null);
      else
        reject(
          new RelatedTestError(
            'RELATED_TESTS_GIT_UNAVAILABLE',
            'Não foi possível consultar o Git deste projeto.',
          ),
        );
    });
    child.on('close', (code) => {
      if (exceededLimit) {
        reject(
          new RelatedTestError(
            'RELATED_TESTS_GIT_UNAVAILABLE',
            'A consulta de alterações do Git excedeu o limite permitido.',
          ),
        );
        return;
      }
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      if (options.allowFailure) {
        resolve(null);
        return;
      }
      reject(
        new RelatedTestError(
          'RELATED_TESTS_GIT_UNAVAILABLE',
          stderr.trim() ||
            'Não foi possível consultar as alterações da branch.',
        ),
      );
    });
  });
}

function lines(value: string | null): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map(normalizeRelativePath)
    .filter((entry): entry is string => entry !== null);
}

async function resolveBaseRef(
  projectPath: string,
): Promise<{ ref: string; label: string }> {
  const originHead = await runGit(
    projectPath,
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
    { allowFailure: true },
  );
  const candidates = [
    'main',
    originHead,
    'origin/main',
    'master',
    'origin/master',
    'upstream/main',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of Array.from(new Set(candidates))) {
    const exists = await runGit(
      projectPath,
      ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`],
      { allowFailure: true },
    );
    if (exists) {
      return {
        ref: candidate,
        label: candidate.replace(/^(origin|upstream)\//, ''),
      };
    }
  }

  return { ref: 'HEAD', label: 'HEAD' };
}

async function collectChangedFiles(
  projectPath: string,
  baseRef: string,
): Promise<string[]> {
  const mergeBase = await runGit(projectPath, ['merge-base', 'HEAD', baseRef], {
    allowFailure: true,
  });

  const [committed, unstaged, staged, untracked] = await Promise.all([
    mergeBase
      ? runGit(projectPath, [
          'diff',
          '--name-only',
          '--diff-filter=ACMR',
          `${mergeBase}...HEAD`,
        ])
      : Promise.resolve(''),
    runGit(projectPath, ['diff', '--name-only', '--diff-filter=ACMR']),
    runGit(projectPath, [
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=ACMR',
    ]),
    runGit(projectPath, ['ls-files', '--others', '--exclude-standard']),
  ]);

  return Array.from(
    new Set([
      ...lines(committed),
      ...lines(unstaged),
      ...lines(staged),
      ...lines(untracked),
    ]),
  ).sort((left, right) => left.localeCompare(right));
}

function sourceStem(filePath: string): string {
  const extension = path.posix.extname(filePath);
  return path.posix
    .basename(filePath, extension)
    .replace(/_(spec|test)$/i, '')
    .replace(/\.(spec|test)$/i, '')
    .replace(/^test_/i, '');
}

function normalizedTestStem(filePath: string): string {
  return sourceStem(filePath);
}

function directCandidates(
  changedFile: string,
  runner: ProjectTestRunner,
): string[] {
  const directory = path.posix.dirname(changedFile);
  const extension = path.posix.extname(changedFile);
  const basename = path.posix.basename(changedFile, extension);
  const withoutRoot = changedFile.replace(/^(app|src)\//, '');
  const withoutRootDirectory = path.posix.dirname(withoutRoot);
  const withoutRootExtension = path.posix.extname(withoutRoot);
  const withoutRootBase = path.posix.basename(
    withoutRoot,
    withoutRootExtension,
  );
  const candidates: string[] = [];

  if (runner === 'rspec' && extension === '.rb') {
    candidates.push(
      `spec/${withoutRootDirectory === '.' ? '' : `${withoutRootDirectory}/`}${withoutRootBase}_spec.rb`,
    );
    if (changedFile.startsWith('lib/')) {
      candidates.push(`spec/${changedFile.slice(0, -3)}_spec.rb`);
    }
  } else if (runner === 'rails-test' && extension === '.rb') {
    candidates.push(
      `test/${withoutRootDirectory === '.' ? '' : `${withoutRootDirectory}/`}${withoutRootBase}_test.rb`,
    );
    if (changedFile.startsWith('lib/')) {
      candidates.push(`test/${changedFile.slice(0, -3)}_test.rb`);
    }
  } else if (runner === 'pytest' && extension === '.py') {
    const prefix = directory === '.' ? '' : `${directory}/`;
    candidates.push(
      `${prefix}test_${basename}.py`,
      `${prefix}${basename}_test.py`,
    );
    const testsDirectory =
      directory === '.' ? 'tests' : `tests/${directory.replace(/^src\//, '')}`;
    candidates.push(
      `${testsDirectory}/test_${basename}.py`,
      `${testsDirectory}/${basename}_test.py`,
    );
  } else if (
    runner === 'vitest' ||
    runner === 'jest' ||
    runner === 'node-test'
  ) {
    if (/\.[cm]?[jt]sx?$/i.test(extension)) {
      const prefix = directory === '.' ? '' : `${directory}/`;
      candidates.push(
        `${prefix}${basename}.test${extension}`,
        `${prefix}${basename}.spec${extension}`,
        `${prefix}__tests__/${basename}.test${extension}`,
        `${prefix}__tests__/${basename}.spec${extension}`,
      );
    }
  }

  return candidates.map((candidate) => candidate.replaceAll('//', '/'));
}

export function findRelatedTestFiles(
  changedFiles: string[],
  availableTestFiles: string[],
  runner: ProjectTestRunner,
): string[] {
  const available = new Set(availableTestFiles);
  const selected = new Set<string>();

  for (const changedFile of changedFiles) {
    if (available.has(changedFile)) selected.add(changedFile);

    for (const candidate of directCandidates(changedFile, runner)) {
      if (available.has(candidate)) selected.add(candidate);
    }

    const changedStem = sourceStem(changedFile);
    if (!changedStem) continue;
    for (const testFile of availableTestFiles) {
      if (normalizedTestStem(testFile) === changedStem) selected.add(testFile);
    }
  }

  return Array.from(selected)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_RELATED_TEST_FILES);
}

function composeRelatedCommand(
  resolved: ResolvedCommand,
  testFiles: string[],
): ResolvedCommand {
  const packageScript =
    NPM_SCRIPT_RUNNERS.has(resolved.command) && resolved.args[0] === 'run';
  return {
    command: resolved.command,
    args: packageScript
      ? [...resolved.args, '--', ...testFiles]
      : [...resolved.args, ...testFiles],
  };
}

export class RelatedTestService {
  public constructor(
    private readonly testDetectionService: TestDetectionService,
  ) {}

  public async resolve(
    project: Project,
    commandId: string,
  ): Promise<RelatedTestSelection> {
    const overview = await this.testDetectionService.getOverview(project);
    const command = overview.commands.find((entry) => entry.id === commandId);
    const resolved = await this.testDetectionService.resolveCommand(
      project,
      commandId,
    );
    if (!command || !resolved) {
      throw new RelatedTestError(
        'RELATED_TESTS_COMMAND_NOT_FOUND',
        'Comando de teste não encontrado para este projeto.',
      );
    }
    if (!command.supportsFileTarget) {
      throw new RelatedTestError(
        'RELATED_TESTS_COMMAND_NOT_FOUND',
        'Este runner não suporta selecionar testes relacionados por arquivo.',
      );
    }

    const currentBranch =
      (await runGit(
        project.path,
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        { allowFailure: true },
      )) ?? 'HEAD';
    const base = await resolveBaseRef(project.path);
    const changedFiles = await collectChangedFiles(project.path, base.ref);
    const available =
      (await this.testDetectionService.listTestFiles(project, commandId)) ?? [];
    const testFiles = findRelatedTestFiles(
      changedFiles,
      available.map((entry) => entry.path),
      command.runner,
    );

    return {
      baseBranch: base.label,
      currentBranch,
      changedFiles,
      testFiles,
      resolved: composeRelatedCommand(resolved, testFiles),
    };
  }
}
