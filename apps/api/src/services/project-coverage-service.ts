import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectCoverageFileSummary,
  ProjectCoverageMetric,
  ProjectCoverageSummary,
  ProjectCoverageTotals,
} from '@dev-dashboard/contracts';

/**
 * Único formato suportado nesta primeira entrega: `coverage/coverage-final.json`
 * (Istanbul raw coverage), o padrão de facto entre nyc/c8/Jest/Vitest quando
 * cobertura está habilitada — nenhum deles precisa de configuração adicional
 * para gerar esse arquivo. SimpleCov (Rails) e relatórios já pré-resumidos
 * (`coverage-summary.json`) ficam como possibilidade futura em
 * `tasks/PENDENCIAS.md`.
 */
const COVERAGE_REPORT_RELATIVE_PATH = path.join(
  'coverage',
  'coverage-final.json',
);

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

export class ProjectCoverageService {
  public async getSummary(
    projectPath: string,
  ): Promise<ProjectCoverageSummary> {
    const reportPath = path.join(projectPath, COVERAGE_REPORT_RELATIVE_PATH);

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
}
