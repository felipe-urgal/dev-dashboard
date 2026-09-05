import { createHash } from 'node:crypto';
import path from 'node:path';

export type SecurityFindingCategory = 'secret' | 'misconfiguration';
export type SecurityFindingSeverity = 'unknown' | 'low' | 'medium' | 'high' | 'critical';

export interface SecurityFinding {
  provider: 'trivy';
  category: SecurityFindingCategory;
  ruleId: string;
  severity: SecurityFindingSeverity;
  title: string;
  file: string;
  line?: number;
  remediation?: string;
  reference?: string;
  fingerprint: string;
  observedAt: string;
}

export interface SecurityScanResult {
  provider: 'trivy';
  observedAt: string;
  findings: SecurityFinding[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function severity(value: unknown): SecurityFindingSeverity {
  const normalized = stringValue(value)?.toLowerCase();
  switch (normalized) {
    case 'low':
    case 'medium':
    case 'high':
    case 'critical':
      return normalized;
    default:
      return 'unknown';
  }
}

function safeRelativeFile(target: unknown): string | undefined {
  const value = stringValue(target)?.replaceAll('\\', '/');
  if (!value || path.posix.isAbsolute(value)) return undefined;

  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) return undefined;
  return normalized.replace(/^\.\//, '');
}

function safeReference(value: unknown): string | undefined {
  const reference = stringValue(value);
  if (!reference) return undefined;

  try {
    const url = new URL(reference);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function fingerprint(input: {
  category: SecurityFindingCategory;
  ruleId: string;
  file: string;
  line?: number;
}): string {
  return createHash('sha256')
    .update(`${input.category}\0${input.ruleId}\0${input.file}\0${input.line ?? 0}`)
    .digest('hex');
}

function buildFinding(
  input: Omit<SecurityFinding, 'provider' | 'fingerprint' | 'observedAt'>,
  observedAt: string,
): SecurityFinding {
  const base = {
    provider: 'trivy' as const,
    ...input,
    observedAt,
  };

  return {
    ...base,
    fingerprint: fingerprint(base),
  };
}

function parseSecrets(result: UnknownRecord, file: string, observedAt: string): SecurityFinding[] {
  const secrets = Array.isArray(result.Secrets) ? result.Secrets : [];
  const findings: SecurityFinding[] = [];

  for (const candidate of secrets) {
    if (!isRecord(candidate)) continue;
    const ruleId = stringValue(candidate.RuleID);
    if (!ruleId) continue;

    const line = positiveInteger(candidate.StartLine);
    findings.push(
      buildFinding(
        {
          category: 'secret',
          ruleId,
          severity: severity(candidate.Severity),
          title: stringValue(candidate.Title) ?? `Secret detectado (${ruleId})`,
          file,
          ...(line === undefined ? {} : { line }),
        },
        observedAt,
      ),
    );
  }

  return findings;
}

function parseMisconfigurations(
  result: UnknownRecord,
  file: string,
  observedAt: string,
): SecurityFinding[] {
  const items = Array.isArray(result.Misconfigurations) ? result.Misconfigurations : [];
  const findings: SecurityFinding[] = [];

  for (const candidate of items) {
    if (!isRecord(candidate)) continue;
    const ruleId = stringValue(candidate.ID) ?? stringValue(candidate.AVDID);
    if (!ruleId) continue;

    const line = positiveInteger(candidate.StartLine);
    const remediation = stringValue(candidate.Resolution);
    const reference = safeReference(candidate.PrimaryURL);

    findings.push(
      buildFinding(
        {
          category: 'misconfiguration',
          ruleId,
          severity: severity(candidate.Severity),
          title: stringValue(candidate.Title) ?? `Misconfiguration detectada (${ruleId})`,
          file,
          ...(line === undefined ? {} : { line }),
          ...(remediation === undefined ? {} : { remediation }),
          ...(reference === undefined ? {} : { reference }),
        },
        observedAt,
      ),
    );
  }

  return findings;
}

export function parseTrivySecurityReport(payload: unknown, observedAt: string): SecurityScanResult {
  if (!isRecord(payload)) {
    throw new Error('Relatório Trivy inválido: objeto raiz ausente.');
  }

  const results = Array.isArray(payload.Results) ? payload.Results : [];
  const findings: SecurityFinding[] = [];

  for (const result of results) {
    if (!isRecord(result)) continue;
    const file = safeRelativeFile(result.Target);
    if (!file) continue;

    findings.push(...parseSecrets(result, file, observedAt));
    findings.push(...parseMisconfigurations(result, file, observedAt));
  }

  return { provider: 'trivy', observedAt, findings };
}
