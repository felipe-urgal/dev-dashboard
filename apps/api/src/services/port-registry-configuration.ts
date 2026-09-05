import type {
  DeclaredProjectPort,
  DeclaredProjectPortConfidence,
  DeclaredProjectPortSource,
  PortRegistryConfiguration,
  ReservedPort,
  ReservedPortScope,
} from '@dev-dashboard/contracts';

const MAX_CONFIGURATION_BYTES = 256 * 1024;
const MAX_ITEMS = 5_000;
const MAX_TEXT_LENGTH = 4_096;

const RESERVED_SCOPES = new Set<ReservedPortScope>([
  'work',
  'infrastructure',
  'user',
]);
const DECLARATION_SOURCES = new Set<DeclaredProjectPortSource>([
  'config',
  'package-script',
  'compose',
  'project-profile',
  'manual',
]);
const DECLARATION_CONFIDENCES = new Set<DeclaredProjectPortConfidence>([
  'certain',
  'strong',
  'weak',
]);

export class PortRegistryConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PortRegistryConfigurationError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new PortRegistryConfigurationError(`${field} deve ser texto.`);
  }
  const result = value.trim();
  if (!result || result.length > MAX_TEXT_LENGTH) {
    throw new PortRegistryConfigurationError(`${field} é inválido.`);
  }
  return result;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return normalizedText(value, field);
}

function normalizedPort(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
    throw new PortRegistryConfigurationError(`${field} deve ser uma porta válida.`);
  }
  return Number(value);
}

function normalizeReserved(value: unknown, index: number): ReservedPort {
  const record = asRecord(value);
  if (!record) {
    throw new PortRegistryConfigurationError(`reserved[${index}] deve ser objeto.`);
  }
  if (!RESERVED_SCOPES.has(record.scope as ReservedPortScope)) {
    throw new PortRegistryConfigurationError(`reserved[${index}].scope é inválido.`);
  }
  const owner = optionalText(record.owner, `reserved[${index}].owner`);
  const role = optionalText(record.role, `reserved[${index}].role`);
  const description = optionalText(
    record.description,
    `reserved[${index}].description`,
  );

  return {
    port: normalizedPort(record.port, `reserved[${index}].port`),
    scope: record.scope as ReservedPortScope,
    ...(owner ? { owner } : {}),
    ...(role ? { role } : {}),
    ...(description ? { description } : {}),
  };
}

function normalizeDeclaration(
  value: unknown,
  index: number,
): DeclaredProjectPort {
  const record = asRecord(value);
  if (!record) {
    throw new PortRegistryConfigurationError(`declared[${index}] deve ser objeto.`);
  }
  if (!DECLARATION_SOURCES.has(record.source as DeclaredProjectPortSource)) {
    throw new PortRegistryConfigurationError(`declared[${index}].source é inválido.`);
  }
  if (
    !DECLARATION_CONFIDENCES.has(
      record.confidence as DeclaredProjectPortConfidence,
    )
  ) {
    throw new PortRegistryConfigurationError(
      `declared[${index}].confidence é inválido.`,
    );
  }
  if (record.active !== undefined && typeof record.active !== 'boolean') {
    throw new PortRegistryConfigurationError(`declared[${index}].active é inválido.`);
  }

  return {
    projectId: normalizedText(record.projectId, `declared[${index}].projectId`),
    port: normalizedPort(record.port, `declared[${index}].port`),
    role: normalizedText(record.role, `declared[${index}].role`),
    source: record.source as DeclaredProjectPortSource,
    confidence: record.confidence as DeclaredProjectPortConfidence,
    ...(record.active === false ? { active: false } : {}),
  };
}

function normalizedItems(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    throw new PortRegistryConfigurationError(`${field} deve ser uma lista válida.`);
  }
  return value;
}

function normalizeConfiguration(value: unknown): PortRegistryConfiguration {
  const record = asRecord(value);
  if (!record || record.version !== 1) {
    throw new PortRegistryConfigurationError(
      'Configuração do Port Registry deve usar version=1.',
    );
  }

  const reserved = normalizedItems(record.reserved, 'reserved').map(
    normalizeReserved,
  );
  const declared = normalizedItems(record.declared, 'declared').map(
    normalizeDeclaration,
  );

  let ignoredProjectPaths: string[] | undefined;
  if (record.ignoredProjectPaths !== undefined) {
    ignoredProjectPaths = normalizedItems(
      record.ignoredProjectPaths,
      'ignoredProjectPaths',
    ).map((item, index) =>
      normalizedText(item, `ignoredProjectPaths[${index}]`),
    );
  }

  return {
    version: 1,
    reserved: reserved.sort(
      (left, right) =>
        left.port - right.port ||
        (left.owner ?? '').localeCompare(right.owner ?? '') ||
        (left.role ?? '').localeCompare(right.role ?? ''),
    ),
    declared: declared.sort(
      (left, right) =>
        left.port - right.port ||
        left.projectId.localeCompare(right.projectId) ||
        left.role.localeCompare(right.role),
    ),
    ...(ignoredProjectPaths
      ? { ignoredProjectPaths: [...new Set(ignoredProjectPaths)].sort() }
      : {}),
  };
}

export function importPortRegistryConfiguration(
  contents: string,
): PortRegistryConfiguration {
  if (Buffer.byteLength(contents, 'utf8') > MAX_CONFIGURATION_BYTES) {
    throw new PortRegistryConfigurationError(
      'Configuração do Port Registry excede o limite permitido.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new PortRegistryConfigurationError(
      'Configuração do Port Registry não contém JSON válido.',
    );
  }

  return normalizeConfiguration(parsed);
}

export function exportPortRegistryConfiguration(
  configuration: PortRegistryConfiguration,
): string {
  return `${JSON.stringify(normalizeConfiguration(configuration), null, 2)}\n`;
}
