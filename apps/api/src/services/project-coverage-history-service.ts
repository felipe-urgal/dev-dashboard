import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  ProjectCoverageFileSummary,
  ProjectCoverageHistory,
  ProjectCoverageHistoryEntry,
  ProjectCoverageSummary,
  ProjectCoverageTotals,
} from '@dev-dashboard/contracts';

import {
  captureTestExecutionGitIdentity,
  type TestExecutionGitIdentity,
} from './test-execution-identity.js';

const HISTORY_VERSION = 2;
const DEFAULT_HISTORY_LIMIT = 50;

type CoverageIdentityCapture = (
  projectPath: string,
) => Promise<TestExecutionGitIdentity>;

interface StoredHistory {
  version: 1 | 2;
  items: ProjectCoverageHistoryEntry[];
}

function isMetric(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const metric = value as Record<string, unknown>;
  return (
    typeof metric.total === 'number' &&
    typeof metric.covered === 'number' &&
    typeof metric.pct === 'number'
  );
}

function isTotals(value: unknown): value is ProjectCoverageTotals {
  if (!value || typeof value !== 'object') return false;
  const totals = value as Record<string, unknown>;
  return (
    isMetric(totals.statements) &&
    isMetric(totals.branches) &&
    isMetric(totals.functions) &&
    isMetric(totals.lines)
  );
}

function isFileSummary(value: unknown): value is ProjectCoverageFileSummary {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.path === 'string' && file.path.length > 0 && isTotals(file)
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isValidEntry(value: unknown): value is ProjectCoverageHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.generatedAt === 'string' &&
    Number.isFinite(Date.parse(entry.generatedAt)) &&
    typeof entry.recordedAt === 'string' &&
    Number.isFinite(Date.parse(entry.recordedAt)) &&
    isTotals(entry.total) &&
    (entry.files === undefined ||
      (Array.isArray(entry.files) && entry.files.every(isFileSummary))) &&
    isOptionalString(entry.gitRevision) &&
    isOptionalString(entry.gitDirtyFingerprint) &&
    isOptionalString(entry.environmentInstanceId)
  );
}

function sanitizeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function readHistoryLimit(): number {
  const parsed = Number.parseInt(
    process.env.DEV_DASHBOARD_COVERAGE_HISTORY_LIMIT ?? '',
    10,
  );
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_HISTORY_LIMIT;
}

/**
 * Grava um snapshot do artifact de coverage já lido pelo dashboard. A v2
 * preserva totais, arquivos e identidade Git suficiente para permitir um
 * delta posterior somente quando a comparação for comprovadamente segura.
 */
export class ProjectCoverageHistoryService {
  private readonly stateDirectory: string;
  private readonly historyLimit: number;

  public constructor(
    stateDirectory = process.env.DEV_DASHBOARD_STATE_DIR?.trim() ||
      path.join(homedir(), '.local', 'state', 'dev-dashboard'),
    historyLimit = readHistoryLimit(),
    private readonly captureIdentity: CoverageIdentityCapture = captureTestExecutionGitIdentity,
  ) {
    this.stateDirectory = path.resolve(stateDirectory, 'coverage-history');
    this.historyLimit = historyLimit;
  }

  public async record(
    projectId: string,
    summary: ProjectCoverageSummary,
    projectPath?: string,
  ): Promise<void> {
    if (!summary.available || !summary.total || !summary.generatedAt) return;

    const items = await this.load(projectId);
    if (items.some((item) => item.generatedAt === summary.generatedAt)) {
      return;
    }

    const identity = projectPath
      ? await this.captureIdentity(projectPath).catch(() => ({}))
      : {};
    const entry: ProjectCoverageHistoryEntry = {
      id: randomUUID(),
      generatedAt: summary.generatedAt,
      recordedAt: new Date().toISOString(),
      total: summary.total,
      ...(summary.files ? { files: summary.files } : {}),
      ...identity,
    };
    items.unshift(entry);
    await this.save(projectId, items.slice(0, this.historyLimit));
  }

  public async history(projectId: string): Promise<ProjectCoverageHistory> {
    const items = await this.load(projectId);
    return { items, total: items.length };
  }

  private filePath(projectId: string): string {
    return path.join(
      this.stateDirectory,
      `${sanitizeProjectId(projectId)}.json`,
    );
  }

  private async load(
    projectId: string,
  ): Promise<ProjectCoverageHistoryEntry[]> {
    try {
      const raw = await readFile(this.filePath(projectId), 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredHistory>;
      if (
        !([1, HISTORY_VERSION] as const).includes(parsed.version as 1 | 2) ||
        !Array.isArray(parsed.items)
      ) {
        return [];
      }
      return parsed.items.filter(isValidEntry);
    } catch {
      return [];
    }
  }

  private async save(
    projectId: string,
    items: ProjectCoverageHistoryEntry[],
  ): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const target = this.filePath(projectId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const stored: StoredHistory = {
      version: HISTORY_VERSION,
      items: items.slice(0, this.historyLimit),
    };
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
    await rename(temporary, target);
  }
}
