import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import type {
  CreateEnvironmentProfileInput,
  EnvironmentProfile,
  EnvironmentProfileLimits,
  EnvironmentProfileVariable,
  UpdateEnvironmentProfileInput,
} from '@dev-dashboard/contracts';

import { resolveConfigDirectory } from './config-directory.js';

export const ENVIRONMENT_PROFILE_LIMITS: EnvironmentProfileLimits = {
  maxProfiles: 50,
  maxVariablesPerProfile: 30,
  maxNameLength: 100,
  maxValueLength: 4096,
};

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

// Variáveis com estes termos no nome nunca têm o valor persistido — apenas o
// nome é guardado, para que o formulário lembre o que pedir sem armazenar o
// segredo em si.
const SENSITIVE_NAME_PATTERN = /SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|_KEY$|^KEY$|APIKEY/i;

export function isSensitiveEnvironmentProfileVariableName(name: string): boolean {
  return SENSITIVE_NAME_PATTERN.test(name);
}

interface EnvironmentProfileConfig {
  version: 1;
  profiles: EnvironmentProfile[];
}

export class EnvironmentProfileRepositoryError extends Error {
  public constructor(
    public readonly code:
      | 'ENVIRONMENT_PROFILE_INVALID'
      | 'ENVIRONMENT_PROFILE_LIMIT_REACHED'
      | 'ENVIRONMENT_PROFILE_NOT_FOUND'
      | 'ENVIRONMENT_PROFILE_NAME_TAKEN',
    message: string,
  ) {
    super(message);
    this.name = 'EnvironmentProfileRepositoryError';
  }
}

function isValidProfileName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= ENVIRONMENT_PROFILE_LIMITS.maxNameLength;
}

function sanitizeVariables(variables: unknown): EnvironmentProfileVariable[] {
  if (!Array.isArray(variables)) {
    throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', 'A lista de variáveis é inválida.');
  }
  if (variables.length > ENVIRONMENT_PROFILE_LIMITS.maxVariablesPerProfile) {
    throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', `O perfil aceita no máximo ${ENVIRONMENT_PROFILE_LIMITS.maxVariablesPerProfile} variáveis.`);
  }
  const seen = new Set<string>();
  const sanitized: EnvironmentProfileVariable[] = [];
  for (const entry of variables) {
    if (typeof entry !== 'object' || entry === null) {
      throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', 'Cada variável precisa ser um objeto.');
    }
    const record = entry as Record<string, unknown>;
    const name = record.name;
    if (typeof name !== 'string' || !VARIABLE_NAME_PATTERN.test(name)) {
      throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', 'O nome de uma variável é inválido.');
    }
    if (seen.has(name)) {
      throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', `A variável "${name}" está duplicada.`);
    }
    seen.add(name);
    const rawValue = record.value;
    if (rawValue !== undefined && typeof rawValue !== 'string') {
      throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', `O valor da variável "${name}" é inválido.`);
    }
    if (typeof rawValue === 'string' && rawValue.length > ENVIRONMENT_PROFILE_LIMITS.maxValueLength) {
      throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', `O valor da variável "${name}" excede o tamanho máximo.`);
    }
    // Nunca persiste valor para nomes sensíveis, mesmo que o cliente envie um — evita
    // que um segredo digitado uma vez fique retido em disco.
    const value = typeof rawValue === 'string' && rawValue.length > 0 && !isSensitiveEnvironmentProfileVariableName(name)
      ? rawValue
      : undefined;
    sanitized.push(value !== undefined ? { name, value } : { name });
  }
  return sanitized;
}

function parseConfig(contents: string): EnvironmentProfile[] {
  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('A configuração de perfis de ambiente possui formato inválido.');
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.profiles)) {
    throw new Error('A versão da configuração de perfis de ambiente não é suportada.');
  }
  return (candidate.profiles as unknown[])
    .filter((entry): entry is EnvironmentProfile => {
      if (typeof entry !== 'object' || entry === null) return false;
      const record = entry as Record<string, unknown>;
      return typeof record.id === 'string' && isValidProfileName(record.name) && Array.isArray(record.variables);
    })
    .slice(0, ENVIRONMENT_PROFILE_LIMITS.maxProfiles);
}

export class EnvironmentProfileRepository {
  private readonly directory: string;
  private readonly file: string;
  private profiles: EnvironmentProfile[];
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(directory = resolveConfigDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, 'environment-profiles.json');
    try {
      this.profiles = parseConfig(readFileSync(this.file, 'utf8'));
    } catch {
      this.profiles = [];
    }
  }

  public get filePath(): string {
    return this.file;
  }

  public list(): EnvironmentProfile[] {
    return this.profiles.map((profile) => ({ ...profile, variables: profile.variables.map((variable) => ({ ...variable })) }));
  }

  public async create(input: CreateEnvironmentProfileInput): Promise<EnvironmentProfile> {
    if (!isValidProfileName(input.name)) {
      throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', 'O nome do perfil é inválido.');
    }
    const name = input.name.trim();
    const variables = sanitizeVariables(input.variables);

    return this.enqueue(async () => {
      if (this.profiles.some((profile) => profile.name === name)) {
        throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_NAME_TAKEN', 'Já existe um perfil com este nome.');
      }
      if (this.profiles.length >= ENVIRONMENT_PROFILE_LIMITS.maxProfiles) {
        throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_LIMIT_REACHED', 'O limite de perfis de ambiente foi atingido.');
      }
      const now = new Date().toISOString();
      const profile: EnvironmentProfile = { id: randomUUID(), name, variables, createdAt: now, updatedAt: now };
      await this.persist([...this.profiles, profile]);
      return profile;
    });
  }

  public async update(id: string, input: UpdateEnvironmentProfileInput): Promise<EnvironmentProfile> {
    if (!isValidProfileName(input.name)) {
      throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_INVALID', 'O nome do perfil é inválido.');
    }
    const name = input.name.trim();
    const variables = sanitizeVariables(input.variables);

    return this.enqueue(async () => {
      const index = this.profiles.findIndex((profile) => profile.id === id);
      if (index === -1) {
        throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_NOT_FOUND', 'Perfil de ambiente não encontrado.');
      }
      if (this.profiles.some((profile) => profile.id !== id && profile.name === name)) {
        throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_NAME_TAKEN', 'Já existe um perfil com este nome.');
      }
      const current = this.profiles[index] as EnvironmentProfile;
      const updated: EnvironmentProfile = { ...current, name, variables, updatedAt: new Date().toISOString() };
      const next = [...this.profiles];
      next[index] = updated;
      await this.persist(next);
      return updated;
    });
  }

  public async remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const next = this.profiles.filter((profile) => profile.id !== id);
      if (next.length === this.profiles.length) {
        throw new EnvironmentProfileRepositoryError('ENVIRONMENT_PROFILE_NOT_FOUND', 'Perfil de ambiente não encontrado.');
      }
      await this.persist(next);
    });
  }

  private async persist(next: EnvironmentProfile[]): Promise<void> {
    await fsPromises.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporaryFile = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    const config: EnvironmentProfileConfig = { version: 1, profiles: next };
    await fsPromises.writeFile(temporaryFile, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fsPromises.rename(temporaryFile, this.file);
    this.profiles = next;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
