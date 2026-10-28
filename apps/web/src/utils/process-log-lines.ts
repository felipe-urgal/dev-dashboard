export type ProcessLogKind =
  'boot' | 'info' | 'req' | 'sql' | 'job' | 'warn' | 'err';

export interface ProcessLogPart {
  text: string;
  tone?: 'accent' | 'dim' | 'ok' | 'err';
}

export interface ProcessLogLine {
  /** Número da linha no log original, estável mesmo com filtros. */
  n: number;
  kind: ProcessLogKind;
  text: string;
  time?: string;
  level?: string;
  /** Ruído técnico (pid, tid) que o console esconde por padrão. */
  tech?: string;
  /** Quando existe, substitui `text` para realçar trechos da linha. */
  parts?: ProcessLogPart[];
}

export interface ProcessLogFilter {
  id: string;
  label: string;
  /** Tipos de linha mostrados; ausente significa todos. */
  kinds?: ProcessLogKind[];
}

export type ProcessLogParser = (content: string) => ProcessLogLine[];

export function splitLogLines(content: string): string[] {
  if (!content) return [];

  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}
