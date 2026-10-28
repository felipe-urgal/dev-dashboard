import type {
  ProcessLogFilter,
  ProcessLogKind,
  ProcessLogLine,
  ProcessLogPart,
} from './process-log-lines';
import { splitLogLines } from './process-log-lines';
import { stripAnsiSequences } from './rails-log-parser';

export const sidekiqLogFilters: ProcessLogFilter[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'err', label: 'Erros', kinds: ['err', 'warn'] },
  { id: 'job', label: 'Jobs', kinds: ['job'] },
];

// 2026-10-28T15:41:09.648Z pid=331839 tid=79nw class=Foo jid=abc INFO: start
const LINE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z?\s+(.*?)\s*\b(DEBUG|INFO|WARN|ERROR|FATAL):\s?(.*)$/;
const BOOT_PATTERN =
  /^(Booted Rails|Running in ruby|Sidekiq [\d.]+ connecting|See LICENSE|Upgrade to Sidekiq)/;

function kindForLevel(level: string): ProcessLogKind | null {
  if (level === 'WARN') return 'warn';
  if (level === 'ERROR' || level === 'FATAL') return 'err';
  return null;
}

function parseContext(context: string) {
  const technical: string[] = [];
  const rest: string[] = [];
  let jobClass: string | undefined;

  for (const token of context.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('pid=') || token.startsWith('tid=')) {
      technical.push(token);
    } else if (token.startsWith('class=')) {
      jobClass = token.slice('class='.length);
    } else {
      rest.push(token);
    }
  }

  return { tech: technical.join(' '), jobClass, rest: rest.join(' ') };
}

function parseLine(raw: string, n: number): ProcessLogLine {
  const match = LINE_PATTERN.exec(raw);
  if (!match) return { n, kind: 'info', text: raw };

  const [, time = '', context = '', level = 'INFO', message = ''] = match;
  const { tech, jobClass, rest } = parseContext(context);
  const levelKind = kindForLevel(level);

  const base = { n, time, level, ...(tech ? { tech } : {}) };

  if (jobClass) {
    const parts: ProcessLogPart[] = [
      {
        text: message,
        ...(message === 'fail' ? { tone: 'err' as const } : {}),
        ...(message === 'done' ? { tone: 'ok' as const } : {}),
      },
      { text: ` ${jobClass}`, tone: 'accent' },
      ...(rest ? [{ text: `  ${rest}`, tone: 'dim' as const }] : []),
    ];
    return {
      ...base,
      kind: levelKind ?? (message === 'fail' ? 'err' : 'job'),
      text: `${message} ${jobClass} ${rest}`.trim(),
      parts,
    };
  }

  const text = rest ? `${message} ${rest}` : message;
  return {
    ...base,
    kind: levelKind ?? (BOOT_PATTERN.test(message) ? 'boot' : 'info'),
    text,
  };
}

export function parseSidekiqLog(content: string): ProcessLogLine[] {
  return splitLogLines(stripAnsiSequences(content)).map((raw, index) =>
    parseLine(raw, index + 1),
  );
}

/** Versão e Redis que o Sidekiq imprime ao iniciar. */
export function sidekiqRuntimeInfo(content: string): {
  version?: string;
  redis?: string;
} {
  const version = /Sidekiq (\d+\.\d+\.\d+)/.exec(content)?.[1];
  const redis = /url(?:=>|:)\s*"(rediss?:\/\/[^"\s]+)"/.exec(content)?.[1];
  return {
    ...(version ? { version } : {}),
    ...(redis ? { redis } : {}),
  };
}
