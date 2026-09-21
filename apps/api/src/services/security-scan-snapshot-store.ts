import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import type {
  SecurityFinding,
  SecurityFindingCategory,
  SecurityFindingSeverity,
  SecurityScanResult,
} from './trivy-security-scanner.js';

const STATE_VERSION = 1;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_FINDINGS = 1_000;
const FRESHNESS_MS = 24 * 60 * 60 * 1_000;
const HEX_FINGERPRINT = /^[a-f0-9]{64}$/u;

export type SecurityScanFreshnessState = 'fresh' | 'stale';

export interface SecurityScanFreshness {
  state: SecurityScanFreshnessState;
  observedAt: string;
  ageMs: number;
  maxAgeMs: number;
}

export interface SecurityScanSnapshot {
  result: SecurityScanResult;
  storedAt: string;
  freshness: SecurityScanFreshness;
}

interface PersistedSnapshot {
  version: 1;
  projectId: string;
  projectPath: string;
  storedAt: string;
  result: SecurityScanResult;
}

export interface SecurityScanSnapshotStoreOptions {
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    normalized.includes('\0')
  ) {
    return undefined;
  }
  return normalized;
}

function normalizedDate(value: unknown): string | undefined {
  const text = boundedString(value, 64);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function safeFile(value: unknown): string | undefined {
  const text = boundedString(value, 1_024)?.replaceAll('\\', '/');
  if (!text || path.posix.isAbsolute(text) || /^[A-Za-z]:\//u.test(text)) {
    return undefined;
  }
  const normalized = path.posix.normalize(text).replace(/^\.\//u, '');
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    return undefined;
  }
  return normalized;
}

function safeReference(value: unknown): string | undefined {
  const text = boundedString(value, 2_048);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function category(value: unknown): SecurityFindingCategory | undefined {
  return value === 'secret' || value === 'misconfiguration' ? value : undefined;
}

function severity(value: unknown): SecurityFindingSeverity | undefined {
  switch (value) {
    case 'unknown':
    case 'low':
    case 'medium':
    case 'high':
    case 'critical':
      return value;
    default:
      return undefined;
  }
}

function parseFinding(value: unknown): SecurityFinding | undefined {
  if (!isRecord(value) || value.provider !== 'trivy') return undefined;
  const parsedCategory = category(value.category);
  const parsedSeverity = severity(value.severity);
  const ruleId = boundedString(value.ruleId, 128);
  const title = boundedString(value.title, 240);
  const file = safeFile(value.file);
  const fingerprint = boundedString(value.fingerprint, 64);
  const observedAt = normalizedDate(value.observedAt);
  if (
    !parsedCategory ||
    !parsedSeverity ||
    !ruleId ||
    !title ||
    !file ||
    !fingerprint ||
    !HEX_FINGERPRINT.test(fingerprint) ||
    !observedAt
  ) {
    return undefined;
  }

  const line =
    typeof value.line === 'number' &&
    Number.isInteger(value.line) &&
    value.line > 0
      ? value.line
      : undefined;
  const remediation =
    value.remediation === undefined
      ? undefined
      : boundedString(value.remediation, 1_000);
  if (value.remediation !== undefined && !remediation) return undefined;
  const reference =
    value.reference === undefined ? undefined : safeReference(value.reference);
  if (value.reference !== undefined && !reference) return undefined;

  return {
    provider: 'trivy',
    category: parsedCategory,
    ruleId,
    severity: parsedSeverity,
    title,
    file,
    ...(line === undefined ? {} : { line }),
    ...(remediation === undefined ? {} : { remediation }),
    ...(reference === undefined ? {} : { reference }),
    fingerprint,
    observedAt,
  };
}

function parseResult(value: unknown): SecurityScanResult | undefined {
  if (!isRecord(value) || value.provider !== 'trivy') return undefined;
  const observedAt = normalizedDate(value.observedAt);
  if (!observedAt || !Array.isArray(value.findings)) return undefined;
  if (value.findings.length > MAX_FINDINGS) return undefined;

  const findings = value.findings.map(parseFinding);
  if (findings.some((finding) => finding === undefined)) return undefined;
  return {
    provider: 'trivy',
    observedAt,
    findings: findings as SecurityFinding[],
  };
}

function parsePersistedSnapshot(value: unknown): PersistedSnapshot | undefined {
  if (!isRecord(value) || value.version !== STATE_VERSION) return undefined;
  const projectId = boundedString(value.projectId, 256);
  const projectPath = boundedString(value.projectPath, 4_096);
  const storedAt = normalizedDate(value.storedAt);
  const result = parseResult(value.result);
  if (
    !projectId ||
    !projectPath ||
    !path.isAbsolute(projectPath) ||
    !storedAt ||
    !result
  ) {
    return undefined;
  }
  return {
    version: STATE_VERSION,
    projectId,
    projectPath: path.resolve(projectPath),
    storedAt,
    result,
  };
}

function snapshotFileName(projectId: string): string {
  return `${createHash('sha256').update(projectId).digest('hex')}.json`;
}

export class SecurityScanSnapshotStore {
  private readonly now: () => Date;

  public constructor(
    private readonly stateDirectory: string,
    options: SecurityScanSnapshotStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async get(
    project: Project,
  ): Promise<SecurityScanSnapshot | undefined> {
    const statePath = this.statePath(project.id);
    try {
      const info = await stat(statePath);
      if (!info.isFile() || info.size > MAX_SNAPSHOT_BYTES) return undefined;
      let persisted: unknown;
      try {
        persisted = JSON.parse(await readFile(statePath, 'utf8')) as unknown;
      } catch {
        return undefined;
      }
      const parsed = parsePersistedSnapshot(persisted);
      if (
        !parsed ||
        parsed.projectId !== project.id ||
        parsed.projectPath !== path.resolve(project.path)
      ) {
        return undefined;
      }
      return this.toSnapshot(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  public async save(
    project: Project,
    result: SecurityScanResult,
  ): Promise<SecurityScanSnapshot> {
    const normalized = parseResult(result);
    if (!normalized) {
      throw new Error('Resultado sanitizado de Security Center inválido.');
    }

    const persisted: PersistedSnapshot = {
      version: STATE_VERSION,
      projectId: project.id,
      projectPath: path.resolve(project.path),
      storedAt: this.now().toISOString(),
      result: normalized,
    };
    const content = `${JSON.stringify(persisted, null, 2)}\n`;
    if (Buffer.byteLength(content, 'utf8') > MAX_SNAPSHOT_BYTES) {
      throw new Error('Snapshot do Security Center excedeu o limite seguro.');
    }

    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const statePath = this.statePath(project.id);
    const temporary = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, statePath);
    return this.toSnapshot(persisted);
  }

  private statePath(projectId: string): string {
    return path.join(this.stateDirectory, snapshotFileName(projectId));
  }

  private toSnapshot(persisted: PersistedSnapshot): SecurityScanSnapshot {
    const observedAtMs = new Date(persisted.result.observedAt).getTime();
    const ageMs = Math.max(0, this.now().getTime() - observedAtMs);
    return {
      result: persisted.result,
      storedAt: persisted.storedAt,
      freshness: {
        state: ageMs <= FRESHNESS_MS ? 'fresh' : 'stale',
        observedAt: persisted.result.observedAt,
        ageMs,
        maxAgeMs: FRESHNESS_MS,
      },
    };
  }
}
