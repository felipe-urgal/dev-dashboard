import {
  classifyTestLogSemanticTone,
  isTestLogErrorLine,
  isTestLogWarningLine,
} from '../utils/test-log-tone';

export type TestLogTab = 'log' | 'errors' | 'warnings' | 'details';
export type TestLogLineTone =
  'default' | 'success' | 'error' | 'warning' | 'muted';

export interface TestLogLine {
  number: number;
  text: string;
  tone: TestLogLineTone;
}

export interface TestRunSummary {
  targetFile: string;
  passed?: number;
  failed?: number;
  duration: string;
  runner: string;
  runnerVersion?: string;
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function matchNumber(
  value: string,
  pattern: RegExp,
): number | undefined {
  const match = pattern.exec(value);
  if (!match?.[1]) return undefined;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

export function isErrorLine(value: string): boolean {
  return isTestLogErrorLine(value);
}

export function isWarningLine(value: string): boolean {
  return isTestLogWarningLine(value);
}

export function isDetailLine(value: string): boolean {
  return /\b(?:run|test files?|tests?|examples?|assertions?|start at|duration|finished in|done in|seed|environment|transform|setup|collect|prepare)\b/i.test(
    value,
  );
}

export function logLineTone(value: string): TestLogLineTone {
  return classifyTestLogSemanticTone(value);
}

export function extractTargetFile(value: string): string | undefined {
  const candidates = value.match(
    /[\w./@-]+(?:\.spec|\.test|_spec|_test)\.(?:[cm]?[jt]sx?|rb|py)/gi,
  );
  return candidates?.at(-1);
}

export function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

export function formatDurationBetween(
  startedAt?: string,
  finishedAt?: string,
): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';

  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
