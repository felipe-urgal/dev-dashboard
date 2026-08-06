import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectCoverageFileSummary,
  ProjectCoverageMetric,
  ProjectCoverageSummary,
  ProjectCoverageTotals,
  ProjectType,
} from '@dev-dashboard/contracts';

/**
 * Formato Node/Istanbul (nyc/c8/Jest/Vitest) — padrão de facto quando
 * cobertura está habilitada, sem exigir configuração adicional.
 */
const ISTANBUL_REPORT_RELATIVE_PATH = path.join(
  'coverage',
  'coverage-final.json',
);

/**
 * Atalho pré-calculado (reporter `json-summary`) — só usado quando
 * `coverage-final.json` não existe ou não pôde ser lido; o bruto continua
 * sendo a fonte principal por trazer o detalhamento necessário para
 * derivar `lines` com a mesma técnica usada no restante do serviço.
 */
const ISTANBUL_SUMMARY_RELATIVE_PATH = path.join(
  'coverage',
  'coverage-summary.json',
);

/** Formato Rails/SimpleCov — caminho padrão gerado pela gem sem configuração adicional. */
const SIMPLECOV_REPORT_RELATIVE_PATH = path.join('coverage', '.resultset.json');

const MAX_COVERAGE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_COVERAGE_FILES = 500;

interface IstanbulRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface IstanbulFileCoverage {
  path?: unknown;
  statementMap?: Record<string, IstanbulRange>;
  fnMap?: Record<string, unknown>;
  branchMap?: Record<string, unknown>;
  s?: Record<string, number>;
  f?: Record<string, number>;
  b?: Record<string, number[]>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metric(total: number, covered: number): ProjectCoverageMetric {
  const pct = total === 0 ? 100 : Math.round((covered / total) * 10_000) / 100;
  return { total, covered, pct };
}

function addMetric(
  target: ProjectCoverageMetric,
  source: ProjectCoverageMetric,
): ProjectCoverageMetric {
  return metric(target.total + source.total, target.covered + source.covered);
}

function summarizeStatements(
  entry: IstanbulFileCoverage,
): ProjectCoverageMetric {
  const hits = Object.values(entry.s ?? {});
  return metric(hits.length, hits.filter((count) => count > 0).length);
}

function summarizeFunctions(
  entry: IstanbulFileCoverage,
): ProjectCoverageMetric {
  const hits = Object.values(entry.f ?? {});
  return metric(hits.length, hits.filter((count) => count > 0).length);
}

function summarizeBranches(entry: IstanbulFileCoverage): ProjectCoverageMetric {
  const branchHits = Object.values(entry.b ?? {});
  let total = 0;
  let covered = 0;
  for (const paths of branchHits) {
    total += paths.length;
    covered += paths.filter((count) => count > 0).length;
  }
  return metric(total, covered);
}

/**
 * Cobertura de linha não vem pronta no formato bruto do Istanbul — deriva
 * da linha inicial de cada statement, igual à técnica usada pelo próprio
 * `istanbul-lib-coverage` (uma linha conta como coberta se qualquer
 * statement que começa nela tiver hit count > 0).
 */
function summarizeLines(entry: IstanbulFileCoverage): ProjectCoverageMetric {
  const statementMap = entry.statementMap ?? {};
  const hits = entry.s ?? {};
  const hitByLine = new Map<number, number>();
  for (const [id, range] of Object.entries(statementMap)) {
    const line = range?.start?.line;
    if (typeof line !== 'number') continue;
    const hit = hits[id] ?? 0;
    hitByLine.set(line, Math.max(hitByLine.get(line) ?? 0, hit));
  }
  const values = Array.from(hitByLine.values());
  return metric(values.length, values.filter((count) => count > 0).length);
}

function summarizeFile(entry: IstanbulFileCoverage): ProjectCoverageTotals {
  return {
    statements: summarizeStatements(entry),
    branches: summarizeBranches(entry),
    functions: summarizeFunctions(entry),
    lines: summarizeLines(entry),
  };
}

const UNAVAILABLE: ProjectCoverageSummary = { available: false };

interface IstanbulSummaryMetric {
  total?: unknown;
  covered?: unknown;
}

interface IstanbulSummaryFileEntry {
  statements?: IstanbulSummaryMetric;
  branches?: IstanbulSummaryMetric;
  functions?: IstanbulSummaryMetric;
  lines?: IstanbulSummaryMetric;
}

function toSummaryMetric(raw: unknown): ProjectCoverageMetric | null {
  if (!isPlainObject(raw)) return null;
  const total = raw.total;
  const covered = raw.covered;
  if (typeof total !== 'number' || typeof covered !== 'number') return null;
  return metric(total, covered);
}

function toSummaryTotals(raw: unknown): ProjectCoverageTotals | null {
  if (!isPlainObject(raw)) return null;
  const entry = raw as IstanbulSummaryFileEntry;
  const statements = toSummaryMetric(entry.statements);
  const branches = toSummaryMetric(entry.branches);
  const functions = toSummaryMetric(entry.functions);
  const lines = toSummaryMetric(entry.lines);
  if (!statements || !branches || !functions || !lines) return null;
  return { statements, branches, functions, lines };
}

/**
 * SimpleCov grava a cobertura de linha como um array posicional (índice =
 * número da linha - 1); `null` marca uma linha não executável. Em versões
 * mais novas o valor por arquivo é `{lines, branches}`; em mais antigas é o
 * array de linhas diretamente.
 */
type SimpleCovLineHits = Array<number | null>;

interface SimpleCovBranchOutcomes {
  [outcome: string]: number;
}

interface SimpleCovBranchConditions {
  [condition: string]: SimpleCovBranchOutcomes;
}

interface SimpleCovFileCoverage {
  lines?: SimpleCovLineHits;
  branches?: SimpleCovBranchConditions;
}

function isSimpleCovLineHits(value: unknown): value is SimpleCovLineHits {
  return (
    Array.isArray(value) &&
    value.every((item) => item === null || typeof item === 'number')
  );
}

function normalizeSimpleCovFile(value: unknown): SimpleCovFileCoverage | null {
  if (isSimpleCovLineHits(value)) return { lines: value };
  if (!isPlainObject(value)) return null;
  const lines = isSimpleCovLineHits(value.lines) ? value.lines : undefined;
  const branches = isPlainObject(value.branches)
    ? (value.branches as SimpleCovBranchConditions)
    : undefined;
  return {
    ...(lines ? { lines } : {}),
    ...(branches ? { branches } : {}),
  };
}

function summarizeSimpleCovLines(
  hits: SimpleCovLineHits,
): ProjectCoverageMetric {
  const executable = hits.filter((hit): hit is number => hit !== null);
  return metric(executable.length, executable.filter((hit) => hit > 0).length);
}

function summarizeSimpleCovBranches(
  branches: SimpleCovBranchConditions | undefined,
): ProjectCoverageMetric {
  if (!branches) return metric(0, 0);
  let total = 0;
  let covered = 0;
  for (const outcomes of Object.values(branches)) {
    for (const hit of Object.values(outcomes)) {
      total += 1;
      if (hit > 0) covered += 1;
    }
  }
  return metric(total, covered);
}

/**
 * SimpleCov não distingue statements de linhas (statements reusa o mesmo
 * valor de lines) nem mede cobertura de função por método — functions fica
 * sempre 0/0 (100%, "não medido"), decisão explícita do usuário.
 */
function summarizeSimpleCovFile(
  entry: SimpleCovFileCoverage,
): ProjectCoverageTotals {
  const lines = summarizeSimpleCovLines(entry.lines ?? []);
  return {
    statements: lines,
    branches: summarizeSimpleCovBranches(entry.branches),
    functions: metric(0, 0),
    lines,
  };
}

function mergeSimpleCovLineHits(
  target: SimpleCovLineHits | undefined,
  source: SimpleCovLineHits,
): SimpleCovLineHits {
  if (!target) return [...source];
  const length = Math.max(target.length, source.length);
  const merged: SimpleCovLineHits = new Array(length).fill(null);
  for (let index = 0; index < length; index += 1) {
    const left = target[index] ?? null;
    const right = source[index] ?? null;
    merged[index] =
      left === null && right === null ? null : Math.max(left ?? 0, right ?? 0);
  }
  return merged;
}

function mergeSimpleCovBranches(
  target: SimpleCovBranchConditions | undefined,
  source: SimpleCovBranchConditions | undefined,
): SimpleCovBranchConditions | undefined {
  if (!source) return target;
  if (!target) return source;
  const merged: SimpleCovBranchConditions = { ...target };
  for (const [condition, outcomes] of Object.entries(source)) {
    const existing = merged[condition] ? { ...merged[condition] } : {};
    for (const [outcome, hit] of Object.entries(outcomes)) {
      existing[outcome] = Math.max(existing[outcome] ?? 0, hit);
    }
    merged[condition] = existing;
  }
  return merged;
}

export class ProjectCoverageService {
  public async getSummary(
    projectPath: string,
    projectType: ProjectType = 'node',
  ): Promise<ProjectCoverageSummary> {
    return projectType === 'rails'
      ? this.getSimpleCovSummary(projectPath)
      : this.getIstanbulSummary(projectPath);
  }

  private async getIstanbulSummary(
    projectPath: string,
  ): Promise<ProjectCoverageSummary> {
    const finalResult = await this.getIstanbulFinalSummary(projectPath);
    if (finalResult.available) return finalResult;
    return this.getIstanbulSummaryFileSummary(projectPath);
  }

  private async getIstanbulFinalSummary(
    projectPath: string,
  ): Promise<ProjectCoverageSummary> {
    const reportPath = path.join(projectPath, ISTANBUL_REPORT_RELATIVE_PATH);

    let stats;
    try {
      stats = await stat(reportPath);
    } catch {
      return UNAVAILABLE;
    }
    if (!stats.isFile() || stats.size > MAX_COVERAGE_FILE_BYTES) {
      return UNAVAILABLE;
    }

    let parsed: unknown;
    try {
      const raw = await readFile(reportPath, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      return UNAVAILABLE;
    }
    if (!isPlainObject(parsed)) {
      return UNAVAILABLE;
    }

    const files: ProjectCoverageFileSummary[] = [];
    let total: ProjectCoverageTotals = {
      statements: metric(0, 0),
      branches: metric(0, 0),
      functions: metric(0, 0),
      lines: metric(0, 0),
    };

    for (const [absolutePath, value] of Object.entries(parsed)) {
      if (!isPlainObject(value)) continue;
      const relative = path.relative(projectPath, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;

      const entry = value as IstanbulFileCoverage;
      const summary = summarizeFile(entry);
      total = {
        statements: addMetric(total.statements, summary.statements),
        branches: addMetric(total.branches, summary.branches),
        functions: addMetric(total.functions, summary.functions),
        lines: addMetric(total.lines, summary.lines),
      };
      files.push({ path: relative.split(path.sep).join('/'), ...summary });
    }

    files.sort((left, right) => left.path.localeCompare(right.path));

    return {
      available: true,
      generatedAt: stats.mtime.toISOString(),
      total,
      files: files.slice(0, MAX_COVERAGE_FILES),
    };
  }

  /**
   * Atalho: lê o `coverage-summary.json` já pré-calculado pelo reporter
   * `json-summary`, sem precisar derivar `lines` a partir de statementMap —
   * o próprio arquivo já traz os quatro totais prontos por arquivo. Só é
   * tentado quando `coverage-final.json` não está disponível.
   */
  private async getIstanbulSummaryFileSummary(
    projectPath: string,
  ): Promise<ProjectCoverageSummary> {
    const reportPath = path.join(projectPath, ISTANBUL_SUMMARY_RELATIVE_PATH);

    let stats;
    try {
      stats = await stat(reportPath);
    } catch {
      return UNAVAILABLE;
    }
    if (!stats.isFile() || stats.size > MAX_COVERAGE_FILE_BYTES) {
      return UNAVAILABLE;
    }

    let parsed: unknown;
    try {
      const raw = await readFile(reportPath, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      return UNAVAILABLE;
    }
    if (!isPlainObject(parsed)) {
      return UNAVAILABLE;
    }

    const total = toSummaryTotals(parsed.total);
    if (!total) return UNAVAILABLE;

    const files: ProjectCoverageFileSummary[] = [];
    for (const [absolutePath, value] of Object.entries(parsed)) {
      if (absolutePath === 'total') continue;
      const relative = path.relative(projectPath, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;

      const fileTotals = toSummaryTotals(value);
      if (!fileTotals) continue;
      files.push({ path: relative.split(path.sep).join('/'), ...fileTotals });
    }

    files.sort((left, right) => left.path.localeCompare(right.path));

    return {
      available: true,
      generatedAt: stats.mtime.toISOString(),
      total,
      files: files.slice(0, MAX_COVERAGE_FILES),
    };
  }

  private async getSimpleCovSummary(
    projectPath: string,
  ): Promise<ProjectCoverageSummary> {
    const reportPath = path.join(projectPath, SIMPLECOV_REPORT_RELATIVE_PATH);

    let stats;
    try {
      stats = await stat(reportPath);
    } catch {
      return UNAVAILABLE;
    }
    if (!stats.isFile() || stats.size > MAX_COVERAGE_FILE_BYTES) {
      return UNAVAILABLE;
    }

    let parsed: unknown;
    try {
      const raw = await readFile(reportPath, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      return UNAVAILABLE;
    }
    if (!isPlainObject(parsed)) {
      return UNAVAILABLE;
    }

    // Une os arquivos vistos em todas as suítes (ex. "RSpec", "Cucumber"):
    // linhas pelo maior hit count, branches pelo maior hit count por outcome.
    const merged = new Map<
      string,
      { lines?: SimpleCovLineHits; branches?: SimpleCovBranchConditions }
    >();

    for (const suite of Object.values(parsed)) {
      if (!isPlainObject(suite) || !isPlainObject(suite.coverage)) continue;
      for (const [absolutePath, value] of Object.entries(suite.coverage)) {
        const relative = path.relative(projectPath, absolutePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue;

        const fileCoverage = normalizeSimpleCovFile(value);
        if (!fileCoverage) continue;

        const existing = merged.get(relative);
        const nextLines = fileCoverage.lines
          ? mergeSimpleCovLineHits(existing?.lines, fileCoverage.lines)
          : existing?.lines;
        const nextBranches = mergeSimpleCovBranches(
          existing?.branches,
          fileCoverage.branches,
        );
        merged.set(relative, {
          ...(nextLines ? { lines: nextLines } : {}),
          ...(nextBranches ? { branches: nextBranches } : {}),
        });
      }
    }

    const files: ProjectCoverageFileSummary[] = [];
    let total: ProjectCoverageTotals = {
      statements: metric(0, 0),
      branches: metric(0, 0),
      functions: metric(0, 0),
      lines: metric(0, 0),
    };

    for (const [relative, entry] of merged.entries()) {
      const summary = summarizeSimpleCovFile(entry);
      total = {
        statements: addMetric(total.statements, summary.statements),
        branches: addMetric(total.branches, summary.branches),
        functions: addMetric(total.functions, summary.functions),
        lines: addMetric(total.lines, summary.lines),
      };
      files.push({ path: relative.split(path.sep).join('/'), ...summary });
    }

    files.sort((left, right) => left.path.localeCompare(right.path));

    return {
      available: true,
      generatedAt: stats.mtime.toISOString(),
      total,
      files: files.slice(0, MAX_COVERAGE_FILES),
    };
  }
}
