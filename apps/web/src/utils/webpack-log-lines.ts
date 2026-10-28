import type {
  ProcessLogFilter,
  ProcessLogKind,
  ProcessLogLine,
} from './process-log-lines';
import { splitLogLines } from './process-log-lines';
import { stripAnsiSequences } from './rails-log-parser';

export const webpackLogFilters: ProcessLogFilter[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'err', label: 'Erros', kinds: ['err'] },
  { id: 'warn', label: 'Avisos', kinds: ['warn'] },
];

const ERROR_PATTERN =
  /\bERROR in\b|Module not found|Failed to compile|✖|\bEADDRINUSE\b|\bError:/i;
const WARNING_PATTERN = /\bWARNING in\b|Compiled with warnings/i;
const COMPILE_PATTERN = /\bCompil(ing|ed)\b|✔/;
const BOOT_PATTERN =
  /Project is running|webpack-dev-server|Loopback|On Your Network|Content not from webpack/i;

export function classifyWebpackLogLine(text: string): ProcessLogKind {
  if (ERROR_PATTERN.test(text)) return 'err';
  if (WARNING_PATTERN.test(text)) return 'warn';
  if (COMPILE_PATTERN.test(text)) return 'job';
  if (BOOT_PATTERN.test(text)) return 'boot';
  return 'info';
}

export function parseWebpackLog(content: string): ProcessLogLine[] {
  return splitLogLines(stripAnsiSequences(content)).map((text, index) => ({
    n: index + 1,
    kind: classifyWebpackLogLine(text),
    text,
  }));
}

/** Porta e versão que o webpack-dev-server imprime ao iniciar. */
export function webpackRuntimeInfo(content: string): {
  port?: string;
  version?: string;
} {
  const port = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/.exec(
    content,
  )?.[1];
  const version = /webpack-dev-server\D{0,3}(\d+\.\d+\.\d+)/.exec(content)?.[1];
  return {
    ...(port ? { port } : {}),
    ...(version ? { version } : {}),
  };
}
