import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ComposeService,
  ComposeServiceAction,
  ComposeServiceActionConfirmation,
  ComposeServiceActionResult,
  ComposeServiceLogs,
  Project,
  ProjectComposeOverview,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';
import { parse as parseYaml } from 'yaml';

const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;
const CONFIRMATION_TTL_MS = 60_000;
const LOG_LIMIT_BYTES = 262_144;
const LOG_TAIL_LINES = 200;

export type DockerComposeErrorCode =
  | 'DOCKER_CONFIG_INVALID'
  | 'DOCKER_NOT_CONFIGURED'
  | 'DOCKER_UNAVAILABLE'
  | 'DOCKER_SERVICE_NOT_FOUND'
  | 'DOCKER_SERVICE_REQUIRES_BUILD'
  | 'DOCKER_CONFIRMATION_REQUIRED'
  | 'DOCKER_ACTION_FAILED';

export class DockerComposeError extends Error {
  public constructor(
    public readonly code: DockerComposeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DockerComposeError';
  }
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<CommandResult>;

interface DetectedCompose {
  composeFile: string;
  composeFileName: string;
  services: Omit<ComposeService, 'running'>[];
}

interface ConfirmationRecord {
  projectId: string;
  serviceName: string;
  action: 'stop' | 'restart';
  expiresAt: number;
}

export interface DockerComposeServiceOptions {
  runCommand?: CommandRunner;
  now?: () => number;
}

const execFileAsync = promisify(execFile);
const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string | number =>
        typeof entry === 'string' || typeof entry === 'number')
      .map(String);
  }
  const record = asRecord(value);
  return record ? Object.keys(record) : [];
}

function portList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') return [String(entry)];
    const port = asRecord(entry);
    if (!port) return [];
    const target = typeof port.target === 'string' || typeof port.target === 'number'
      ? String(port.target)
      : '';
    const published = typeof port.published === 'string' || typeof port.published === 'number'
      ? String(port.published)
      : '';
    if (!target) return [];
    return [published ? `${published}:${target}` : target];
  });
}

function serviceFrom(name: string, value: unknown): Omit<ComposeService, 'running'> {
  const service = asRecord(value) ?? {};
  return {
    name,
    ...(typeof service.image === 'string' ? { image: service.image } : {}),
    requiresBuild: service.build !== undefined && typeof service.image !== 'string',
    ports: portList(service.ports),
    dependsOn: stringList(service.depends_on),
  };
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === 'ENOENT',
  );
}

function truncateLog(content: string): { content: string; sizeBytes: number; truncated: boolean } {
  const full = Buffer.from(content, 'utf8');
  if (full.byteLength <= LOG_LIMIT_BYTES) {
    return { content, sizeBytes: full.byteLength, truncated: false };
  }
  const tail = full.subarray(full.byteLength - LOG_LIMIT_BYTES).toString('utf8');
  const firstLineBreak = tail.indexOf('\n');
  const completeTail = firstLineBreak >= 0 ? tail.slice(firstLineBreak + 1) : tail;
  return {
    content: completeTail,
    sizeBytes: full.byteLength,
    truncated: true,
  };
}

export class DockerComposeService {
  private readonly runCommand: CommandRunner;
  private readonly now: () => number;
  private readonly confirmations = new Map<string, ConfirmationRecord>();

  public constructor(options: DockerComposeServiceOptions = {}) {
    this.runCommand = options.runCommand ?? defaultCommandRunner;
    this.now = options.now ?? Date.now;
  }

  private async detect(project: Project): Promise<DetectedCompose | null> {
    let composeFileName: string | undefined;
    for (const candidate of COMPOSE_FILES) {
      try {
        await access(path.join(project.path, candidate));
        composeFileName = candidate;
        break;
      } catch {
        // Tenta o próximo nome conhecido.
      }
    }
    if (!composeFileName) return null;

    const composeFile = path.join(project.path, composeFileName);
    try {
      const parsed = asRecord(parseYaml(await readFile(composeFile, 'utf8')));
      const services = asRecord(parsed?.services);
      if (!services) {
        throw new Error('services ausente');
      }
      return {
        composeFile,
        composeFileName,
        services: Object.entries(services).map(([name, value]) => serviceFrom(name, value)),
      };
    } catch {
      throw new DockerComposeError(
        'DOCKER_CONFIG_INVALID',
        `O arquivo ${composeFileName} não contém uma configuração Compose válida.`,
      );
    }
  }

  private requireService(detected: DetectedCompose | null, serviceName: string) {
    if (!detected) {
      throw new DockerComposeError(
        'DOCKER_NOT_CONFIGURED',
        'O projeto não possui um arquivo Docker Compose reconhecido.',
      );
    }
    const service = detected.services.find((candidate) => candidate.name === serviceName);
    if (!service) {
      throw new DockerComposeError(
        'DOCKER_SERVICE_NOT_FOUND',
        'O serviço não existe no arquivo Compose atual.',
      );
    }
    return service;
  }

  private async dockerAvailable(project: Project): Promise<boolean> {
    try {
      await this.runCommand('docker', ['compose', 'version'], { cwd: project.path });
      return true;
    } catch {
      return false;
    }
  }

  public async overview(project: Project): Promise<ProjectComposeOverview> {
    const detected = await this.detect(project);
    if (!detected) {
      return { configured: false, dockerAvailable: false, services: [] };
    }
    const dockerAvailable = await this.dockerAvailable(project);
    let runningServices = new Set<string>();
    if (dockerAvailable) {
      try {
        const result = await this.runCommand('docker', [
          'compose', '-f', detected.composeFile, 'ps', '--status', 'running', '--services',
        ], { cwd: project.path });
        runningServices = new Set(result.stdout.split(/\r?\n/).filter(Boolean));
      } catch {
        // O arquivo continua configurado mesmo quando o daemon está indisponível.
      }
    }
    return {
      configured: true,
      dockerAvailable,
      composeFile: detected.composeFileName,
      services: detected.services.map((service) => ({
        ...service,
        running: runningServices.has(service.name),
      })),
    };
  }

  public async prepareConfirmation(
    project: Project,
    serviceName: string,
    action: 'stop' | 'restart',
  ): Promise<ComposeServiceActionConfirmation> {
    this.requireService(await this.detect(project), serviceName);
    this.pruneExpiredConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, { projectId: project.id, serviceName, action, expiresAt });
    return { token, serviceName, action, expiresAt: new Date(expiresAt).toISOString() };
  }

  private requireConfirmation(
    projectId: string,
    serviceName: string,
    action: 'stop' | 'restart',
    token: string | undefined,
  ): string {
    this.pruneExpiredConfirmations();
    const record = token ? this.confirmations.get(token) : undefined;
    if (
      !record
      || record.projectId !== projectId
      || record.serviceName !== serviceName
      || record.action !== action
      || record.expiresAt <= this.now()
    ) {
      throw new DockerComposeError(
        'DOCKER_CONFIRMATION_REQUIRED',
        'Confirme novamente a ação sobre o serviço Docker.',
      );
    }
    return token!;
  }

  private consumeConfirmation(
    projectId: string,
    serviceName: string,
    action: 'stop' | 'restart',
    token: string | undefined,
  ): void {
    this.confirmations.delete(
      this.requireConfirmation(projectId, serviceName, action, token),
    );
  }

  private pruneExpiredConfirmations(): void {
    const now = this.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }

  public async runAction(
    project: Project,
    serviceName: string,
    action: ComposeServiceAction,
    confirmationToken?: string,
  ): Promise<ComposeServiceActionResult> {
    const detected = await this.detect(project);
    const service = this.requireService(detected, serviceName);
    if (action === 'start' && service.requiresBuild) {
      throw new DockerComposeError(
        'DOCKER_SERVICE_REQUIRES_BUILD',
        'Este serviço exige build manual antes de poder ser iniciado pelo dashboard.',
      );
    }
    const needsConfirmation = action === 'stop' || action === 'restart';
    if (needsConfirmation) {
      this.requireConfirmation(project.id, serviceName, action, confirmationToken);
    }
    if (!detected || !(await this.dockerAvailable(project))) {
      throw new DockerComposeError(
        'DOCKER_UNAVAILABLE',
        'Docker Compose não está disponível no PATH da API.',
      );
    }
    if (needsConfirmation) {
      this.consumeConfirmation(project.id, serviceName, action, confirmationToken);
    }
    const args = action === 'start'
      ? ['compose', '-f', detected.composeFile, 'up', '-d', serviceName]
      : ['compose', '-f', detected.composeFile, action, serviceName];
    try {
      await this.runCommand('docker', args, { cwd: project.path });
    } catch (error) {
      throw new DockerComposeError(
        isNotFoundError(error) ? 'DOCKER_UNAVAILABLE' : 'DOCKER_ACTION_FAILED',
        isNotFoundError(error)
          ? 'Docker Compose não está disponível no PATH da API.'
          : `Não foi possível ${action === 'start' ? 'iniciar' : action === 'stop' ? 'parar' : 'reiniciar'} o serviço.`,
      );
    }
    return { serviceName, action, succeeded: true };
  }

  public async logs(project: Project, serviceName: string): Promise<ComposeServiceLogs> {
    const detected = await this.detect(project);
    this.requireService(detected, serviceName);
    if (!detected || !(await this.dockerAvailable(project))) {
      throw new DockerComposeError(
        'DOCKER_UNAVAILABLE',
        'Docker Compose não está disponível no PATH da API.',
      );
    }
    let stdout: string;
    try {
      const result = await this.runCommand('docker', [
        'compose', '-f', detected.composeFile, 'logs', '--no-color', `--tail=${LOG_TAIL_LINES}`, serviceName,
      ], { cwd: project.path });
      stdout = result.stdout;
    } catch {
      throw new DockerComposeError(
        'DOCKER_ACTION_FAILED',
        'Não foi possível consultar os logs do serviço.',
      );
    }
    const limited = truncateLog(stdout);
    const masked = maskSensitiveLogContent(limited.content);
    return {
      serviceName,
      content: masked.content,
      sizeBytes: limited.sizeBytes,
      truncated: limited.truncated,
      masked: masked.masked,
      redactionCount: masked.redactionCount,
      readAt: new Date(this.now()).toISOString(),
    };
  }
}
