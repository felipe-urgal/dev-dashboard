export type LogExperienceSource =
  'server' | 'sidekiq' | 'webpack' | 'test' | 'script' | 'dependency';

export type LogExperienceTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type LogExperienceIssueKind =
  'error' | 'warning' | 'slow' | 'retry' | 'failure' | 'build';

export interface LogExperienceLine {
  id: string;
  index: number;
  raw: string;
  text: string;
  time?: string | undefined;
  tag: string;
  tone: LogExperienceTone;
  durationMs?: number | undefined;
  issueKind?: LogExperienceIssueKind | undefined;
}

export interface LogExperienceIssue {
  id: string;
  kind: LogExperienceIssueKind;
  tone: Exclude<LogExperienceTone, 'neutral'>;
  title: string;
  summary: string;
  detail?: string;
  count: number;
  firstLineIndex: number;
  lastLineIndex: number;
  durationMs?: number | undefined;
}

export interface LogExperienceSummary {
  errors: number;
  warnings: number;
  slow: number;
  retries: number;
  failures: number;
}

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const TIME_PATTERN = /(?:^|\s)(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)(?:\s|$)/;
const DURATION_PATTERN = /\b(\d+(?:\.\d+)?)\s*(ms|s)\b/gi;
const HTTP_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i;
const STATUS_PATTERN = /\b([1-5]\d{2})\b/;

const ERROR_PATTERN =
  /\b(error|exception|fatal|panic|nomethoderror|typeerror|syntaxerror|referenceerror|enoent|econnrefused|unhandled|failed|failure)\b/i;
const WARNING_PATTERN =
  /\b(warn|warning|deprecated|deprecation|caution|notice)\b/i;
const SUCCESS_PATTERN =
  /\b(done|ready|success|succeeded|successful|passed|complete|completed|compiled|finished)\b/i;
const RETRY_PATTERN = /\b(retry|retrying|retried)\b/i;
const TEST_FAILURE_PATTERN =
  /(?:^|\s)(?:F|E|FAIL|FAILED|Failures?:|Failure\/Error:|AssertionError)\b/i;
const TEST_SUCCESS_PATTERN = /^\s*(?:✓|✔|PASS\b|\.+$)/i;
const WEBPACK_PATTERN = /\b(compiling|compiled|build|building|webpack)\b/i;
const SIDEKIQ_PATTERN = /\b(sidekiq|jid=|queue=|class=|perform|job)\b/i;
const SQL_PATTERN = /\b(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b/i;

function cleanLine(line: string): string {
  return line.replace(ANSI_PATTERN, '').replace(/\r$/, '');
}

function parseDurationMs(text: string): number | undefined {
  let slowest: number | undefined;
  DURATION_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(DURATION_PATTERN)) {
    const value = Number.parseFloat(match[1] ?? '');
    if (!Number.isFinite(value)) continue;
    const milliseconds =
      (match[2] ?? '').toLowerCase() === 's' ? value * 1_000 : value;
    slowest = Math.max(slowest ?? 0, milliseconds);
  }

  return slowest;
}

function sourceSlowThreshold(source: LogExperienceSource): number {
  switch (source) {
    case 'webpack':
      return 2_000;
    case 'sidekiq':
      return 5_000;
    case 'test':
      return 10_000;
    case 'dependency':
    case 'script':
      return 5_000;
    default:
      return 1_000;
  }
}

function tagForLine(text: string, source: LogExperienceSource): string {
  const http = text.match(HTTP_PATTERN)?.[1]?.toUpperCase();
  if (http) return http;
  if (source === 'sidekiq') {
    if (RETRY_PATTERN.test(text)) return 'RETRY';
    if (ERROR_PATTERN.test(text)) return 'FAIL';
    if (/\b(start|started|performing|busy)\b/i.test(text)) return 'START';
    if (/\b(done|complete|completed|success)\b/i.test(text)) return 'DONE';
    if (SIDEKIQ_PATTERN.test(text)) return 'JOB';
    return 'SIDEKIQ';
  }
  if (source === 'webpack') {
    if (ERROR_PATTERN.test(text)) return 'ERROR';
    if (WARNING_PATTERN.test(text)) return 'WARN';
    if (/\bcompiling\b/i.test(text)) return 'BUILD';
    if (/\bcompiled\b/i.test(text)) return 'DONE';
    return 'WEBPACK';
  }
  if (source === 'test') {
    if (TEST_SUCCESS_PATTERN.test(text)) return 'PASS';
    if (TEST_FAILURE_PATTERN.test(text) || ERROR_PATTERN.test(text))
      return 'FAIL';
    if (WARNING_PATTERN.test(text)) return 'WARN';
    return 'TEST';
  }
  if (SQL_PATTERN.test(text)) return 'SQL';
  if (ERROR_PATTERN.test(text)) return 'ERROR';
  if (WARNING_PATTERN.test(text)) return 'WARN';
  if (WEBPACK_PATTERN.test(text)) return 'BUILD';
  return source === 'dependency'
    ? 'BUILD'
    : source === 'script'
      ? 'SCRIPT'
      : 'INFO';
}

function toneAndIssueForLine(
  text: string,
  source: LogExperienceSource,
  durationMs: number | undefined,
): Pick<LogExperienceLine, 'tone' | 'issueKind'> {
  const status = Number.parseInt(text.match(STATUS_PATTERN)?.[1] ?? '', 10);
  if (Number.isFinite(status) && status >= 500) {
    return { tone: 'danger', issueKind: 'error' };
  }
  if (source === 'test' && TEST_SUCCESS_PATTERN.test(text)) {
    return { tone: 'success' };
  }
  if (TEST_FAILURE_PATTERN.test(text)) {
    return { tone: 'danger', issueKind: 'failure' };
  }
  if (ERROR_PATTERN.test(text)) {
    return {
      tone: 'danger',
      issueKind: source === 'test' ? 'failure' : 'error',
    };
  }
  if (RETRY_PATTERN.test(text) && source === 'sidekiq') {
    return { tone: 'warning', issueKind: 'retry' };
  }
  if (WARNING_PATTERN.test(text)) {
    return { tone: 'warning', issueKind: 'warning' };
  }
  if (
    durationMs !== undefined &&
    durationMs >= sourceSlowThreshold(source) &&
    !/\b(total|elapsed|finished in|suite)\b/i.test(text)
  ) {
    return { tone: 'warning', issueKind: 'slow' };
  }
  if (SUCCESS_PATTERN.test(text)) return { tone: 'success' };
  if (
    WEBPACK_PATTERN.test(text) ||
    SIDEKIQ_PATTERN.test(text) ||
    HTTP_PATTERN.test(text)
  ) {
    return { tone: 'info' };
  }
  return { tone: 'neutral' };
}

export function parseLogExperience(
  content: string,
  source: LogExperienceSource,
): LogExperienceLine[] {
  return content
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.trim().length > 0)
    .map((raw, index) => {
      const durationMs = parseDurationMs(raw);
      const classification = toneAndIssueForLine(raw, source, durationMs);
      const time = raw.match(TIME_PATTERN)?.[1];
      const text = time ? raw.replace(time, '').trimStart() : raw;

      return {
        id: `${index}:${raw.slice(0, 64)}`,
        index,
        raw,
        text,
        time,
        tag: tagForLine(raw, source),
        durationMs,
        ...classification,
      };
    });
}

function normalizedIssueKey(line: LogExperienceLine): string {
  return line.text
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, '<id>')
    .replace(/\b\d+(?:\.\d+)?(?:ms|s)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function issueTitle(
  line: LogExperienceLine,
  source: LogExperienceSource,
): string {
  if (line.issueKind === 'retry') return 'Job entrou em retry';
  if (line.issueKind === 'slow') {
    if (source === 'webpack') return 'Build lento';
    if (source === 'sidekiq') return 'Job lento';
    if (source === 'test') return 'Etapa de teste lenta';
    return 'Execução lenta';
  }
  if (line.issueKind === 'failure') return 'Falha de teste';
  if (line.issueKind === 'warning') return 'Aviso relevante';
  return source === 'webpack' ? 'Erro de compilação' : 'Erro detectado';
}

function issueTone(
  kind: LogExperienceIssueKind,
): Exclude<LogExperienceTone, 'neutral'> {
  if (kind === 'error' || kind === 'failure') return 'danger';
  if (kind === 'warning' || kind === 'retry' || kind === 'slow') {
    return 'warning';
  }
  return 'info';
}

export function buildLogDiagnostics(
  lines: LogExperienceLine[],
  source: LogExperienceSource,
): LogExperienceIssue[] {
  const issues = new Map<string, LogExperienceIssue>();

  for (const line of lines) {
    if (!line.issueKind) continue;
    const key = `${line.issueKind}:${normalizedIssueKey(line)}`;
    const existing = issues.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastLineIndex = line.index;
      existing.durationMs =
        Math.max(existing.durationMs ?? 0, line.durationMs ?? 0) || undefined;
      continue;
    }

    const detail =
      line.text.length > 220 ? `${line.text.slice(0, 217)}…` : line.text;
    issues.set(key, {
      id: key,
      kind: line.issueKind,
      tone: issueTone(line.issueKind),
      title: issueTitle(line, source),
      summary: detail,
      detail,
      count: 1,
      firstLineIndex: line.index,
      lastLineIndex: line.index,
      durationMs: line.durationMs,
    });
  }

  return [...issues.values()].sort((left, right) => {
    const toneWeight = {
      danger: 3,
      warning: 2,
      info: 1,
      success: 0,
    } as const;
    const weight = toneWeight[right.tone] - toneWeight[left.tone];
    if (weight !== 0) return weight;
    return right.lastLineIndex - left.lastLineIndex;
  });
}

export function summarizeLogDiagnostics(
  issues: LogExperienceIssue[],
): LogExperienceSummary {
  return issues.reduce<LogExperienceSummary>(
    (summary, issue) => {
      if (issue.kind === 'error') summary.errors += issue.count;
      if (issue.kind === 'warning') summary.warnings += issue.count;
      if (issue.kind === 'slow') summary.slow += issue.count;
      if (issue.kind === 'retry') summary.retries += issue.count;
      if (issue.kind === 'failure') summary.failures += issue.count;
      return summary;
    },
    { errors: 0, warnings: 0, slow: 0, retries: 0, failures: 0 },
  );
}
