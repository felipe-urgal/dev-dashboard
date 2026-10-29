import { mkdir, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import type {
  ProjectTestRunner,
  TestFailure,
  TestRunResult,
} from '@dev-dashboard/contracts';

import type { ResolvedCommand } from './test-detection/types.js';

const NPM_SCRIPT_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const RESULTS_DIRECTORY = path.join(os.tmpdir(), 'dev-dashboard-test-results');
const MAX_RESULT_BYTES = 20 * 1024 * 1024;
const MAX_FAILURES = 200;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_STACK_LINES = 12;

export interface StructuredReporterPlan {
  runner: ProjectTestRunner;
  resolved: ResolvedCommand;
  /** Variáveis a mesclar no ambiente do processo de teste. */
  env: Record<string, string>;
  outFile: string;
}

export function supportsStructuredReporter(runner: ProjectTestRunner): boolean {
  return (
    runner === 'rspec' ||
    runner === 'vitest' ||
    runner === 'jest' ||
    runner === 'node-test'
  );
}

/** Acrescenta flags ao runner, respeitando o `--` de scripts npm. */
function appendRunnerArgs(
  resolved: ResolvedCommand,
  extra: readonly string[],
): ResolvedCommand {
  const isPackageScript =
    NPM_SCRIPT_RUNNERS.has(resolved.command) && resolved.args[0] === 'run';
  const needsSeparator = isPackageScript && !resolved.args.includes('--');
  return {
    command: resolved.command,
    args: [...resolved.args, ...(needsSeparator ? ['--'] : []), ...extra],
  };
}

/**
 * Prepara o reporter estruturado de cada runner sem tirar a saída legível do
 * terminal: o resultado vai para um arquivo temporário, lido ao final.
 * Retorna `null` quando o runner não tem reporter suportado.
 */
export async function planStructuredReporter(
  runner: ProjectTestRunner,
  resolved: ResolvedCommand,
  baseEnv: Record<string, string | undefined> = {},
): Promise<StructuredReporterPlan | null> {
  if (!supportsStructuredReporter(runner)) return null;
  await mkdir(RESULTS_DIRECTORY, { recursive: true });
  const outFile = path.join(RESULTS_DIRECTORY, `${randomUUID()}.out`);

  switch (runner) {
    case 'rspec':
      return {
        resolved: appendRunnerArgs(resolved, [
          '--format',
          'progress',
          '--format',
          'json',
          '--out',
          outFile,
        ]),
        env: {},
        outFile,
        runner,
      };
    case 'vitest':
      return {
        resolved: appendRunnerArgs(resolved, [
          '--reporter=default',
          '--reporter=json',
          `--outputFile=${outFile}`,
        ]),
        env: {},
        outFile,
        runner,
      };
    case 'jest':
      return {
        resolved: appendRunnerArgs(resolved, [
          '--json',
          `--outputFile=${outFile}`,
        ]),
        env: {},
        outFile,
        runner,
      };
    case 'node-test': {
      const existing = baseEnv.NODE_OPTIONS?.trim();
      const options = [
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=tap',
        `--test-reporter-destination=${outFile}`,
      ].join(' ');
      return {
        resolved,
        env: { NODE_OPTIONS: existing ? `${existing} ${options}` : options },
        outFile,
        runner,
      };
    }
    default:
      return null;
  }
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** Normaliza um caminho do runner para relativo ao projeto, sem `./`. */
function relativeToProject(file: string, projectPath: string): string {
  const withoutScheme = file.replace(/^file:\/\//, '');
  const absolute = path.isAbsolute(withoutScheme)
    ? withoutScheme
    : path.resolve(projectPath, withoutScheme);
  const relative = path.relative(projectPath, absolute);
  if (!relative || relative.startsWith('..')) return withoutScheme;
  return relative.split(path.sep).join('/');
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function stackLines(value: string | readonly string[] | undefined): string[] {
  if (!value) return [];
  const lines = Array.isArray(value) ? [...value] : String(value).split('\n');
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_STACK_LINES);
}

export function parseRspecJson(
  text: string,
  projectPath: string,
): TestRunResult | null {
  let data: {
    examples?: Array<{
      status?: string;
      file_path?: string;
      line_number?: number;
      full_description?: string;
      exception?: { message?: string; class?: string; backtrace?: string[] };
    }>;
    summary?: {
      duration?: number;
      example_count?: number;
      failure_count?: number;
      pending_count?: number;
    };
  };
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(data.examples)) return null;

  const failures: TestFailure[] = [];
  let passed = 0;
  let pending = 0;
  for (const example of data.examples) {
    if (example.status === 'passed') passed += 1;
    else if (example.status === 'pending') pending += 1;
    else if (example.status === 'failed' && failures.length < MAX_FAILURES) {
      const file = relativeToProject(example.file_path ?? '', projectPath);
      failures.push({
        id: `${file}:${example.line_number ?? failures.length}`,
        runner: 'rspec',
        name: example.full_description ?? 'Exemplo sem descrição',
        message: truncate(
          example.exception?.message ?? example.exception?.class ?? 'Falhou',
          MAX_MESSAGE_LENGTH,
        ),
        ...(file
          ? {
              location: {
                path: file,
                ...(example.line_number ? { line: example.line_number } : {}),
              },
            }
          : {}),
        stack: stackLines(example.exception?.backtrace),
      });
    }
  }

  const failed = data.summary?.failure_count ?? failures.length;
  return {
    runner: 'rspec',
    summary: {
      total: data.summary?.example_count ?? data.examples.length,
      passed,
      failed,
      pending: data.summary?.pending_count ?? pending,
      ...(data.summary?.duration !== undefined
        ? { durationMs: Math.round(data.summary.duration * 1000) }
        : {}),
    },
    failures,
    failedFiles: uniqueSorted(
      failures.flatMap((failure) =>
        failure.location ? [failure.location.path] : [],
      ),
    ),
  };
}

/** Formato JSON compartilhado por Vitest e Jest. */
export function parseVitestJson(
  text: string,
  projectPath: string,
  runner: 'vitest' | 'jest' = 'vitest',
): TestRunResult | null {
  let data: {
    numTotalTests?: number;
    numPassedTests?: number;
    numFailedTests?: number;
    numPendingTests?: number;
    numTodoTests?: number;
    startTime?: number;
    testResults?: Array<{
      name?: string;
      startTime?: number;
      endTime?: number;
      assertionResults?: Array<{
        fullName?: string;
        title?: string;
        status?: string;
        failureMessages?: string[];
        location?: { line?: number; column?: number };
      }>;
    }>;
  };
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(data.testResults)) return null;

  const failures: TestFailure[] = [];
  let durationMs = 0;
  for (const file of data.testResults) {
    const filePath = relativeToProject(file.name ?? '', projectPath);
    if (file.startTime !== undefined && file.endTime !== undefined) {
      durationMs += Math.max(0, file.endTime - file.startTime);
    }
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== 'failed' || failures.length >= MAX_FAILURES)
        continue;
      const [message = 'Falhou', ...rest] = (assertion.failureMessages ?? [])
        .join('\n')
        .split('\n');
      failures.push({
        id: `${filePath}:${assertion.fullName ?? failures.length}`,
        runner,
        name: assertion.fullName ?? assertion.title ?? 'Teste sem nome',
        message: truncate(message, MAX_MESSAGE_LENGTH),
        ...(filePath
          ? {
              location: {
                path: filePath,
                ...(assertion.location?.line
                  ? { line: assertion.location.line }
                  : {}),
              },
            }
          : {}),
        stack: stackLines(rest),
      });
    }
  }

  const passed = data.numPassedTests ?? 0;
  const failed = data.numFailedTests ?? failures.length;
  const pending = (data.numPendingTests ?? 0) + (data.numTodoTests ?? 0);
  return {
    runner,
    summary: {
      total: data.numTotalTests ?? passed + failed + pending,
      passed,
      failed,
      pending,
      ...(durationMs > 0 ? { durationMs } : {}),
    },
    failures,
    failedFiles: uniqueSorted(
      failures.flatMap((failure) =>
        failure.location ? [failure.location.path] : [],
      ),
    ),
  };
}

function yamlValue(block: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm').exec(block);
  if (!match) return undefined;
  const value = match[1]!.trim();
  return value.replace(/^'(.*)'$/s, '$1').replace(/^"(.*)"$/s, '$1');
}

/** TAP 13 emitido por `node --test --test-reporter=tap`. */
export function parseNodeTap(
  text: string,
  projectPath: string,
): TestRunResult | null {
  const lines = text.split('\n');
  if (!lines.some((line) => /^TAP version/.test(line))) return null;

  const failures: TestFailure[] = [];
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let total = 0;
  let durationMs: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const summary =
      /^# (tests|pass|fail|skipped|todo|duration_ms) ([\d.]+)/.exec(
        lines[index]!,
      );
    if (summary) {
      const value = Number(summary[2]);
      if (summary[1] === 'tests') total = value;
      else if (summary[1] === 'pass') passed = value;
      else if (summary[1] === 'fail') failed = value;
      else if (summary[1] === 'skipped' || summary[1] === 'todo')
        pending += value;
      else durationMs = Math.round(value);
      continue;
    }

    const failure = /^(\s*)not ok \d+ - (.*)$/.exec(lines[index]!);
    if (!failure) continue;

    const indent = failure[1]!.length;
    const body: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]!;
      if (/^\s*(ok|not ok) \d+ /.test(line) || /^# /.test(line)) break;
      body.push(line);
      if (
        line.trim() === '...' &&
        line.length - line.trimStart().length >= indent
      )
        break;
    }
    const block = body.join('\n');
    // Falha agregada (arquivo/suíte) não é um teste: o detalhe vem nos filhos.
    if (yamlValue(block, 'failureType') === 'subtestsFailed') continue;
    if (failures.length >= MAX_FAILURES) continue;

    const locationRaw = yamlValue(block, 'location');
    const locationMatch = locationRaw
      ? /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(locationRaw)
      : null;
    const file = locationMatch?.[1]
      ? relativeToProject(locationMatch[1], projectPath)
      : '';
    const line = locationMatch?.[2] ? Number(locationMatch[2]) : undefined;
    const stackMatch = /stack: \|-?\n((?:\s{4}.*\n?)*)/.exec(block);
    const expected = yamlValue(block, 'expected');
    const actual = yamlValue(block, 'actual');

    failures.push({
      id: `${file}:${failure[2]}`,
      runner: 'node-test',
      name: failure[2]!,
      message: truncate(
        yamlValue(block, 'error') ?? 'Falhou',
        MAX_MESSAGE_LENGTH,
      ),
      ...(file ? { location: { path: file, ...(line ? { line } : {}) } } : {}),
      ...(expected !== undefined ? { expected } : {}),
      ...(actual !== undefined ? { actual } : {}),
      stack: stackLines(stackMatch?.[1]),
    });
  }

  return {
    runner: 'node-test',
    summary: {
      total,
      passed,
      failed,
      pending,
      ...(durationMs !== undefined ? { durationMs } : {}),
    },
    failures,
    failedFiles: uniqueSorted(
      failures.flatMap((failure) =>
        failure.location ? [failure.location.path] : [],
      ),
    ),
  };
}

export async function readStructuredResult(
  runner: ProjectTestRunner,
  outFile: string,
  projectPath: string,
): Promise<TestRunResult | null> {
  let text: string;
  try {
    const buffer = await readFile(outFile);
    if (buffer.length === 0 || buffer.length > MAX_RESULT_BYTES) return null;
    text = buffer.toString('utf8');
  } catch {
    return null;
  }

  switch (runner) {
    case 'rspec':
      return parseRspecJson(text, projectPath);
    case 'vitest':
      return parseVitestJson(text, projectPath, 'vitest');
    case 'jest':
      return parseVitestJson(text, projectPath, 'jest');
    case 'node-test':
      return parseNodeTap(text, projectPath);
    default:
      return null;
  }
}

export async function discardStructuredResult(outFile: string): Promise<void> {
  await rm(outFile, { force: true });
}
