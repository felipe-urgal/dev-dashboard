import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

import type {
  Project,
  ProjectEnvironmentBaselineStatus,
  ProjectEnvironmentContract,
  ProjectEnvironmentContractScope,
  ProjectEnvironmentContractSection,
  ProjectEnvironmentContractVariable,
  ProjectEnvironmentFile,
  ProjectEnvironmentFileSource,
  ProjectEnvironmentFileStatus,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariable,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';
import { isSensitiveEnvironmentProfileVariableName } from '@dev-dashboard/core';

export const PROJECT_ENVIRONMENT_MAX_BYTES = 64 * 1024;

interface EnvironmentFileDescriptor {
  file: string;
  source: ProjectEnvironmentFileSource;
  forceSensitive: boolean;
}

const ENVIRONMENT_FILE_DESCRIPTORS: readonly EnvironmentFileDescriptor[] = [
  { file: '.env', source: 'project', forceSensitive: false },
  { file: '.env.local', source: 'project', forceSensitive: false },
  { file: '.env.development', source: 'project', forceSensitive: false },
  { file: '.env.test', source: 'project', forceSensitive: false },
  { file: '.env.test.example', source: 'project', forceSensitive: false },
  { file: '.env.test.sample', source: 'project', forceSensitive: false },
  { file: '.env.production', source: 'project', forceSensitive: false },
  { file: '.env.production.example', source: 'project', forceSensitive: false },
  { file: '.env.production.sample', source: 'project', forceSensitive: false },
  { file: '.env.docker', source: 'project', forceSensitive: false },
  { file: '.env.example', source: 'project', forceSensitive: false },
  { file: '.env.sample', source: 'project', forceSensitive: false },
  { file: '.env.docker.example', source: 'project', forceSensitive: false },
  { file: '.env.docker.sample', source: 'project', forceSensitive: false },
  {
    file: '.dev-dashboard/.env.check.local',
    source: 'dashboard-check',
    forceSensitive: true,
  },
  {
    file: '.dev-dashboard/.env.production.local',
    source: 'dashboard-production',
    forceSensitive: true,
  },
];

export const PROJECT_ENVIRONMENT_FILES = ENVIRONMENT_FILE_DESCRIPTORS.map(
  ({ file }) => file,
);

interface ParsedEnvironmentVariable {
  name: string;
  value: string;
  sensitive: boolean;
}

interface ReadEnvironmentFile {
  descriptor: EnvironmentFileDescriptor;
  status: ProjectEnvironmentFileStatus;
  variables: ParsedEnvironmentVariable[];
}

interface EnvironmentContractScopeConfig {
  scope: ProjectEnvironmentContractScope;
  baselineFiles: string[];
  sourceFiles: string[];
}

interface VariableIndexEntry {
  sensitive: boolean;
  files: string[];
  values: Set<string>;
}

const CONTRACT_SCOPES: EnvironmentContractScopeConfig[] = [
  {
    scope: 'default',
    baselineFiles: ['.env.example', '.env.sample'],
    sourceFiles: ['.env.local', '.env.development', '.env'],
  },
  {
    scope: 'test',
    baselineFiles: ['.env.test.example', '.env.test.sample'],
    sourceFiles: ['.dev-dashboard/.env.check.local', '.env.test'],
  },
  {
    scope: 'production',
    baselineFiles: ['.env.production.example', '.env.production.sample'],
    sourceFiles: ['.dev-dashboard/.env.production.local', '.env.production'],
  },
  {
    scope: 'docker',
    baselineFiles: ['.env.docker.example', '.env.docker.sample'],
    sourceFiles: ['.env.docker'],
  },
];

const SENSITIVE_CONNECTION_NAME_PATTERN =
  /(?:^|_)(?:DATABASE|REDIS|SMTP|AMQP|BROKER|QUEUE|SENTRY)_URL$/iu;
const SENSITIVE_VALUE_KEY_PATTERN =
  /(?:^|[?&;\s])(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|credential|signature|auth)=/iu;
const SENSITIVE_QUERY_KEY_PATTERN =
  /password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|credential|signature|auth/iu;

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: unknown }).code === code
  );
}

function isPathWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function isSensitiveEnvironmentValue(value: string): boolean {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value)) return true;
  if (SENSITIVE_VALUE_KEY_PATTERN.test(value)) return true;

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return true;
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) return true;
    }
  } catch {
    // Nem todo valor de ambiente é uma URL.
  }

  return false;
}

function isSensitiveEnvironmentVariable(
  name: string,
  value: string,
  forceSensitive: boolean,
): boolean {
  return (
    forceSensitive ||
    isSensitiveEnvironmentProfileVariableName(name) ||
    SENSITIVE_CONNECTION_NAME_PATTERN.test(name) ||
    isSensitiveEnvironmentValue(value)
  );
}

function parseDotenv(
  contents: string,
  forceSensitive: boolean,
): ParsedEnvironmentVariable[] {
  const parsed = parseEnv(contents);
  return Object.entries(parsed)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => {
      const normalizedValue = value ?? '';
      return {
        name,
        value: normalizedValue,
        sensitive: isSensitiveEnvironmentVariable(
          name,
          normalizedValue,
          forceSensitive,
        ),
      };
    });
}

async function readEnvironmentFile(
  projectPath: string,
  descriptor: EnvironmentFileDescriptor,
): Promise<ReadEnvironmentFile | null> {
  let root: string;
  try {
    root = await realpath(projectPath);
  } catch {
    return {
      descriptor,
      status: 'unreadable',
      variables: [],
    };
  }

  const target = path.resolve(root, descriptor.file);
  if (!isPathWithin(root, target)) {
    return {
      descriptor,
      status: 'invalid',
      variables: [],
    };
  }

  let stats;
  try {
    stats = await lstat(target);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null;
    return {
      descriptor,
      status: 'unreadable',
      variables: [],
    };
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    return {
      descriptor,
      status: 'invalid',
      variables: [],
    };
  }
  if (stats.size > PROJECT_ENVIRONMENT_MAX_BYTES) {
    return {
      descriptor,
      status: 'too-large',
      variables: [],
    };
  }

  let canonical: string;
  try {
    canonical = await realpath(target);
  } catch {
    return {
      descriptor,
      status: 'unreadable',
      variables: [],
    };
  }
  if (canonical !== target || !isPathWithin(root, canonical)) {
    return {
      descriptor,
      status: 'invalid',
      variables: [],
    };
  }

  let contents: string;
  try {
    contents = await readFile(canonical, 'utf8');
  } catch {
    return {
      descriptor,
      status: 'unreadable',
      variables: [],
    };
  }

  try {
    return {
      descriptor,
      status: 'available',
      variables: parseDotenv(contents, descriptor.forceSensitive),
    };
  } catch {
    return {
      descriptor,
      status: 'invalid',
      variables: [],
    };
  }
}

function maskSensitiveValue(
  variable: ParsedEnvironmentVariable,
): ProjectEnvironmentVariable {
  if (variable.sensitive) return { name: variable.name, sensitive: true };
  return variable;
}

function availableVariables(
  files: Map<string, ReadEnvironmentFile>,
): Map<string, ParsedEnvironmentVariable[]> {
  const available = new Map<string, ParsedEnvironmentVariable[]>();
  for (const [file, entry] of files) {
    if (entry.status === 'available') available.set(file, entry.variables);
  }
  return available;
}

function buildVariableIndex(
  files: Map<string, ParsedEnvironmentVariable[]>,
  selectedFiles: string[],
): Map<string, VariableIndexEntry> {
  const index = new Map<string, VariableIndexEntry>();

  for (const file of selectedFiles) {
    for (const variable of files.get(file) ?? []) {
      const current = index.get(variable.name);
      if (current) {
        current.sensitive ||= variable.sensitive;
        current.files.push(file);
        current.values.add(variable.value);
      } else {
        index.set(variable.name, {
          sensitive: variable.sensitive,
          files: [file],
          values: new Set([variable.value]),
        });
      }
    }
  }

  return index;
}

function getBaselineStatus(
  candidateCount: number,
): ProjectEnvironmentBaselineStatus {
  if (candidateCount === 1) return 'resolved';
  if (candidateCount > 1) return 'ambiguous';
  return 'missing';
}

function buildContractSection(
  files: Map<string, ParsedEnvironmentVariable[]>,
  config: EnvironmentContractScopeConfig,
): ProjectEnvironmentContractSection | null {
  const baselineCandidates = config.baselineFiles.filter((file) =>
    files.has(file),
  );
  const sourceFiles = config.sourceFiles.filter((file) => files.has(file));

  if (baselineCandidates.length === 0 && sourceFiles.length === 0) return null;

  const baselineStatus = getBaselineStatus(baselineCandidates.length);
  const baseline =
    baselineStatus === 'resolved' ? (baselineCandidates[0] ?? null) : null;
  const candidateVariables = buildVariableIndex(files, baselineCandidates);
  const baselineVariables = baseline
    ? buildVariableIndex(files, [baseline])
    : new Map<string, VariableIndexEntry>();
  const sourceVariables = buildVariableIndex(files, sourceFiles);
  const names = new Set<string>([
    ...candidateVariables.keys(),
    ...sourceVariables.keys(),
  ]);
  const variables: ProjectEnvironmentContractVariable[] = [];

  for (const name of [...names].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const candidate = candidateVariables.get(name);
    const expected = baselineVariables.get(name);
    const actual = sourceVariables.get(name);
    const sensitive = Boolean(
      candidate?.sensitive ||
      actual?.sensitive ||
      isSensitiveEnvironmentProfileVariableName(name) ||
      SENSITIVE_CONNECTION_NAME_PATTERN.test(name),
    );

    if (baselineStatus !== 'resolved') {
      variables.push({
        name,
        sensitive,
        status: 'unknown',
        baseline: null,
        sources: actual?.files ?? [],
        required: null,
        suggestedAction:
          baselineStatus === 'ambiguous' ? 'choose-baseline' : 'document',
      });
      continue;
    }

    if (expected && !actual) {
      variables.push({
        name,
        sensitive,
        status: 'missing',
        baseline,
        sources: [],
        required: true,
        suggestedAction: 'configure',
      });
      continue;
    }

    if (!expected && actual) {
      variables.push({
        name,
        sensitive,
        status: 'undocumented',
        baseline,
        sources: actual.files,
        required: null,
        suggestedAction: 'document',
      });
      continue;
    }

    const sources = actual?.files ?? [];
    const conflict = sources.length > 1 && (actual?.values.size ?? 0) > 1;
    variables.push({
      name,
      sensitive,
      status: conflict
        ? 'conflicting-source'
        : sources.length > 1
          ? 'duplicate'
          : 'present',
      baseline,
      sources,
      required: true,
      suggestedAction: sources.length > 1 ? 'review-source' : 'none',
    });
  }

  return {
    scope: config.scope,
    baselineStatus,
    baseline,
    baselineCandidates,
    sourceFiles,
    variables,
  };
}

export class ProjectEnvironmentService {
  private async readRecognizedFiles(
    project: Project,
  ): Promise<Map<string, ReadEnvironmentFile>> {
    const entries = await Promise.all(
      ENVIRONMENT_FILE_DESCRIPTORS.map(async (descriptor) => ({
        descriptor,
        result: await readEnvironmentFile(project.path, descriptor),
      })),
    );

    const files = new Map<string, ReadEnvironmentFile>();
    for (const { descriptor, result } of entries) {
      if (result) files.set(descriptor.file, result);
    }
    return files;
  }

  public async getOverview(
    project: Project,
  ): Promise<ProjectEnvironmentOverview> {
    const inspectedFiles = await this.readRecognizedFiles(project);
    const files: ProjectEnvironmentFile[] = [];

    for (const descriptor of ENVIRONMENT_FILE_DESCRIPTORS) {
      const inspected = inspectedFiles.get(descriptor.file);
      if (!inspected) continue;
      files.push({
        file: descriptor.file,
        status: inspected.status,
        source: descriptor.source,
        variables:
          inspected.status === 'available'
            ? inspected.variables.map(maskSensitiveValue)
            : [],
      });
    }

    return { files };
  }

  public async getContract(
    project: Project,
  ): Promise<ProjectEnvironmentContract> {
    const inspectedFiles = await this.readRecognizedFiles(project);
    const files = availableVariables(inspectedFiles);
    const sections = CONTRACT_SCOPES.map((config) =>
      buildContractSection(files, config),
    ).filter(
      (section): section is ProjectEnvironmentContractSection =>
        section !== null,
    );

    return { sections };
  }

  public async getVariableValue(
    project: Project,
    file: string,
    name: string,
  ): Promise<ProjectEnvironmentVariableValue | null> {
    const descriptor = ENVIRONMENT_FILE_DESCRIPTORS.find(
      (entry) => entry.file === file,
    );
    if (!descriptor) return null;

    const inspected = await readEnvironmentFile(project.path, descriptor);
    if (!inspected || inspected.status !== 'available') return null;

    const variable = inspected.variables.find((entry) => entry.name === name);
    if (!variable) return null;

    return {
      file,
      name: variable.name,
      value: variable.value,
      sensitive: variable.sensitive,
    };
  }
}
