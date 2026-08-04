export type LogExportOrigin = 'servidor' | 'testes' | 'script';

export interface ExportableLogSnapshot {
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

export interface LogExportOptions {
  projectName: string;
  origin: LogExportOrigin;
  snapshot: ExportableLogSnapshot;
  identifier?: string;
  capturedAt?: string;
}

export interface PreparedLogExport {
  filename: string;
  content: string;
}

const ORIGIN_LABELS: Record<LogExportOrigin, string> = {
  servidor: 'Servidor',
  testes: 'Testes',
  script: 'Script',
};

function formatCaptureTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function safeMetadataValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim() || '—';
}

export function safeLogFilenameSegment(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);

  return normalized || 'log';
}

export function prepareLogExport(options: LogExportOptions): PreparedLogExport | null {
  if (!options.snapshot.content.trim()) return null;

  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const projectName = safeMetadataValue(options.projectName);
  const identifierValue = options.identifier
    ? safeMetadataValue(options.identifier)
    : undefined;
  const project = safeLogFilenameSegment(projectName);
  const origin = safeLogFilenameSegment(options.origin);
  const identifier = identifierValue
    ? `-${safeLogFilenameSegment(identifierValue)}`
    : '';
  const timestamp = safeLogFilenameSegment(formatCaptureTime(capturedAt));
  const maskedLabel = options.snapshot.masked
    ? `Sim (${options.snapshot.redactionCount} substituição(ões))`
    : 'Não';

  const header = [
    'Dev Dashboard — Exportação segura de log',
    `Projeto: ${projectName}`,
    `Origem: ${ORIGIN_LABELS[options.origin]}`,
    ...(identifierValue ? [`Identificação: ${identifierValue}`] : []),
    `Capturado em: ${safeMetadataValue(formatCaptureTime(capturedAt))}`,
    `Trecho truncado: ${options.snapshot.truncated ? 'Sim' : 'Não'}`,
    `Conteúdo mascarado: ${maskedLabel}`,
    '',
    '--- início do snapshot ---',
    '',
  ].join('\n');

  return {
    filename: `dev-dashboard-${project}-${origin}${identifier}-${timestamp}.log`,
    content: `${header}${options.snapshot.content}`,
  };
}

export function exportLogSnapshot(options: LogExportOptions): boolean {
  const prepared = prepareLogExport(options);
  if (!prepared) return false;

  const blob = new Blob([prepared.content], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = prepared.filename;
  link.hidden = true;
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return true;
}
