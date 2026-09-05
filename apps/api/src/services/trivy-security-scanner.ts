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

const MAX_FINDINGS = 1_000;
const MAX_RULE_ID_LENGTH = 128;
const MAX_FILE_LENGTH = 1_024;
const MAX_TITLE_LENGTH = 240;
const MAX_REMEDIATION_LENGTH = 1_000;
const MAX_REFERENCE_LENGTH = 2_048;
const SAFE_RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function safeRuleId(value: unknown): string | undefined {
  const ruleId = boundedString(value, MAX_RULE_ID_LENGTH);
  return ruleId && SAFE_RULE_ID.test(ruleId) ? ruleId : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function severity(value: unknown): SecurityFindingSeverity {
  const normalized = boundedString(value, 16)?.toLowerCase();
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
  const value = boundedString(target, MAX_FILE_LENGTH)?.replaceAll('\\', '/');
  if (!value || path.posix.isAbsolute(value) || /^[A-Za-z]:\//u.test(value)) return undefined;

  const normalized = path.posix.normalize(value).replace(/^\.\//, '');
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('\0')
  ) {
    return undefined;
  }
  return normalized;
}

function safeReference(value: unknown): string | undefined {
  const reference = boundedString(value, MAX_REFERENCE_LENGTH);
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

function parseSecrets(
  result: UnknownRecord,
  file: string,
  observedAt: string,
  limit: number,
): SecurityFinding[] {
  const secrets = Array.isArray(result.Secrets) ? result.Secrets : [];
  const findings: SecurityFinding[] = [];

  for (const candidate of secrets) {
    if (findings.length >= limit) break;
    if (!isRecord(candidate)) continue;
    const ruleId = safeRuleId(candidate.RuleID);
    if (!ruleId) continue;

    const line = positiveInteger(candidate.StartLine);
    findings.push(
      buildFinding(
        {
          category: 'secret',
          ruleId,
          severity: severity(candidate.Severity),
          title: `Secret detectado (${ruleId})`,
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
  limit: number,
): SecurityFinding[] {
  const items = Array.isArray(result.Misconfigurations) ? result.Misconfigurations : [];
  const findings: SecurityFinding[] = [];

  for (const candidate of items) {
    if (findings.length >= limit) break;
    if (!isRecord(candidate)) continue;
    const ruleId = safeRuleId(candidate.ID) ?? safeRuleId(candidate.AVDID);
    if (!ruleId) continue;

    const line = positiveInteger(candidate.StartLine);
    const title = boundedString(candidate.Title, MAX_TITLE_LENGTH);
    const remediation = boundedString(candidate.Resolution, MAX_REMEDIATION_LENGTH);
    const reference = safeReference(candidate.PrimaryURL);

    findings.push(
      buildFinding(
        {
          category: 'misconfiguration',
          ruleId,
          severity: severity(candidate.Severity),
          title: title ?? `Misconfiguration detectada (${ruleId})`,
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
    if (findings.length >= MAX_FINDINGS) break;
    if (!isRecord(result)) continue;
    const file = safeRelativeFile(result.Target);
    if (!file) continue;

    const remaining = MAX_FINDINGS - findings.length;
    findings.push(...parseSecrets(result, file, observedAt, remaining));
    if (findings.length >= MAX_FINDINGS) break;
    findings.push(
      ...parseMisconfigurations(result, file, observedAt, MAX_FINDINGS - findings.length),
    );
  }

  return { provider: 'trivy', observedAt, findings };
}
