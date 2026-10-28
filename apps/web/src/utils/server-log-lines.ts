import type {
  ProcessLogFilter,
  ProcessLogKind,
  ProcessLogLine,
} from './process-log-lines';
import { splitLogLines } from './process-log-lines';
import { stripAnsiSequences } from './rails-log-parser';

export type ServerLogKind = Exclude<ProcessLogKind, 'job'>;

export const serverLogFilters: ProcessLogFilter[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'err', label: 'Erros', kinds: ['err', 'warn'] },
  { id: 'req', label: 'Requisições', kinds: ['req'] },
  { id: 'sql', label: 'SQL', kinds: ['sql'] },
];

const ERROR_PATTERN =
  /\b(error|fatal|exception|panic)\b|Errno::|\bCompleted 5\d\d\b|\bEADDRINUSE\b/i;
const WARNING_PATTERN = /\bwarn(ing)?\b|DEPRECATION/i;
const SQL_PATTERN =
  /\b(SELECT|INSERT INTO|UPDATE "|DELETE FROM|BEGIN|COMMIT|ROLLBACK)\b|\s\(\d+(\.\d+)?ms\)\s/;
const REQUEST_PATTERN =
  /^\s*(Started|Completed|Processing|Rendered|Rendering)\b|\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/\S*/;
const BOOT_PATTERN = /^\s*(=>|\*|Puma\b|Use Ctrl-C|Booting|Listening)/;

export function classifyServerLogLine(text: string): ServerLogKind {
  if (ERROR_PATTERN.test(text)) return 'err';
  if (WARNING_PATTERN.test(text)) return 'warn';
  if (SQL_PATTERN.test(text)) return 'sql';
  if (REQUEST_PATTERN.test(text)) return 'req';
  if (BOOT_PATTERN.test(text)) return 'boot';
  return 'info';
}

export function parseServerLog(content: string): ProcessLogLine[] {
  return splitLogLines(stripAnsiSequences(content)).map((text, index) => ({
    n: index + 1,
    kind: classifyServerLogLine(text),
    text,
  }));
}
