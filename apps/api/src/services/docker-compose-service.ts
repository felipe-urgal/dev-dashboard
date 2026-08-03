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
  ComposeServiceBuildConfirmation,
  ComposeServiceLogs,
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
  ProjectComposeOverview,
} from '@dev-dashboard/contracts';
import {
  maskSensitiveLogContent,
  type ProcessManager,
  type ReadServerLogOptions,
} from '@dev-dashboard/process-manager';
import { parse as parseYaml } from 'yaml';

const COMPOSE_FILES = [
  'docker-compose.dev.yml',
  'docker-compose.dev.yaml',
  'compose.dev.yml',
  'compose.dev.yaml',
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
  | 'DOCKER_ACTION_FAILED'
  | 'DOCKER_PORT_CONFLICT'
  | 'DOCKER_SERVICE_EXITED'
  | 'DOCKER_BUILD_UNSUPPORTED';

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

type ConfirmableComposeAction = 'stop' | 'restart' | 'build';

interface ConfirmationRecord {
  projectId: string;
  serviceName: string;
  action: ConfirmableComposeAction;
  expiresAt: number;
}

export interface DockerComposeServiceOptions {
  runCommand?: CommandRunner;
  now?: () => number;
  processManager?: ProcessManager;
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

// O YAML do compose pode trazer interpolação de shell (`${MYSQL_PORT:-3306}`), que o
// parser YAML devolve como texto literal — não sabemos aqui se o ambiente real
// sobrescreve o valor padrão (ex.: MYSQL_PORT=3307 num .env), então exibimos a
// expressão como está em vez de arriscar mostrar um valor errado. `overview()`
// tenta substituir isso pela porta de fato resolvida via `docker compose config`
// quando o Docker está disponível.
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

function hasRunnableDefinition(service: Omit<ComposeService, 'running'>): boolean {
  return Boolean(service.image) || service.requiresBuild;
}

function isDevVariant(composeFileName: string): boolean {
  return /\.dev\.ya?ml$/.test(composeFileName);
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

const PORT_CONFLICT_PATTERN = /already in use|already allocated/i;
const PORT_NUMBER_PATTERN = /:(\d{2,5})(?:\/tcp|\/udp)?\b/;

// Erros de execFile trazem stdout/stderr do processo filho; usamos a última linha
// não vazia (onde o Compose/Docker normalmente coloca a causa) em vez do erro
// genérico "Command failed" do Node.
function commandErrorDetail(error: unknown): string | undefined {
  const stderr = error && typeof error === 'object' && 'stderr' in error
    ? (error as { stderr?: unknown }).stderr
    : undefined;
  const raw = typeof stderr === 'string' && stderr.trim()
    ? stderr
    : error instanceof Error ? error.message : undefined;
  if (!raw) return undefined;
  const lastLine = raw.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!lastLine) return undefined;
  return maskSensitiveLogContent(lastLine).content.slice(0, 300);
}

function portConflictFrom(detail: string): string | undefined {
  if (!PORT_CONFLICT_PATTERN.test(detail)) return undefined;
  return PORT_NUMBER_PATTERN.exec(detail)?.[1];
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
  private readonly processManager?: ProcessManager;
  private readonly confirmations = new Map<string, ConfirmationRecord>();

  public constructor(options: DockerComposeServiceOptions = {}) {
    this.runCommand = options.runCommand ?? defaultCommandRunner;
    this.now = options.now ?? Date.now;
    if (options.processManager) {
      this.processManager = options.processManager;
    }
  }

  private async parseComposeFile(composeFile: string, composeFileName: string): Promise<DetectedCompose> {
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

  private async detect(project: Project): Promise<DetectedCompose | null> {
    for (const candidate of COMPOSE_FILES) {
      const composeFile = path.join(project.path, candidate);
      try {
        await access(composeFile);
      } catch {
        continue; // Tenta o próximo nome conhecido.
      }
      const parsed = await this.parseComposeFile(composeFile, candidate);
      // Um `docker-compose.dev.yml` costuma ser um arquivo completo e standalone
      // (o caso comum: `-f docker-compose.dev.yml up` sozinho), mas também pode ser
      // só um override parcial pensado para rodar junto da base (`-f compose.yml -f
      // compose.dev.yml`) — nesse caso nenhum serviço declara `image`/`build` própria.
      // Tratá-lo como standalone quebraria a listagem/execução, então nesse caso
      // seguimos para o próximo candidato (normalmente o arquivo base).
      if (isDevVariant(candidate) && !parsed.services.some(hasRunnableDefinition)) {
        continue;
      }
      return parsed;
    }
    return null;
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
    let resolvedPorts: Map<string, string[]> | null = null;
    if (dockerAvailable) {
      try {
        const result = await this.runCommand('docker', [
          'compose', '-f', detected.composeFile, 'ps', '--status', 'running', '--services',
        ], { cwd: project.path });
        runningServices = new Set(result.stdout.split(/\r?\n/).filter(Boolean));
      } catch {
        // O arquivo continua configurado mesmo quando o daemon está indisponível.
      }
      // Só paga o custo de um `docker compose config` extra quando alguma porta
      // realmente usa interpolação de shell (ex.: `${MYSQL_PORT:-3306}`) — na maioria
      // dos projetos as portas já são literais e o `ps` acima basta.
      if (detected.services.some((service) => service.ports.some((port) => port.includes('${')))) {
        resolvedPorts = await this.resolveConfiguredPorts(project, detected);
      }
    }
    return {
      configured: true,
      dockerAvailable,
      composeFile: detected.composeFileName,
      services: detected.services.map((service) => ({
        ...service,
        ports: resolvedPorts?.get(service.name) ?? service.ports,
        running: runningServices.has(service.name),
      })),
    };
  }

  // `docker compose config` resolve interpolação de shell (${VAR:-default}) com a
  // mesma precedência que o próprio Compose usaria para subir os serviços (ambiente
  // do processo, .env do projeto). Preferível a tentar reimplementar essa resolução
  // aqui — se o comando falhar, mantemos as portas cruas já presentes em `detected`.
  private async resolveConfiguredPorts(
    project: Project,
    detected: DetectedCompose,
  ): Promise<Map<string, string[]> | null> {
    try {
      const result = await this.runCommand('docker', [
        'compose', '-f', detected.composeFile, 'config', '--format', 'json',
      ], { cwd: project.path });
      const parsed = asRecord(JSON.parse(result.stdout));
      const services = asRecord(parsed?.services);
      if (!services) return null;
      const map = new Map<string, string[]>();
      for (const [name, value] of Object.entries(services)) {
        const service = asRecord(value);
        map.set(name, portList(service?.ports));
      }
      return map;
    } catch {
      return null;
    }
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
    action: ConfirmableComposeAction,
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
    action: ConfirmableComposeAction,
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
    if (action === 'start' && service.requiresBuild && !(await this.hasSuccessfulBuild(project.id, serviceName))) {
      throw new DockerComposeError(
        'DOCKER_SERVICE_REQUIRES_BUILD',
        'Este serviço exige build antes de poder ser iniciado pelo dashboard.',
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
      throw this.buildActionError(action, error);
    }
    if (action === 'start') {
      await this.verifyServiceStayedUp(project, detected, serviceName);
    }
    return { serviceName, action, succeeded: true };
  }

  private buildActionError(action: ComposeServiceAction, error: unknown): DockerComposeError {
    if (isNotFoundError(error)) {
      return new DockerComposeError(
        'DOCKER_UNAVAILABLE',
        'Docker Compose não está disponível no PATH da API.',
      );
    }
    const verb = action === 'start' ? 'iniciar' : action === 'stop' ? 'parar' : 'reiniciar';
    const detail = commandErrorDetail(error);
    const port = detail ? portConflictFrom(detail) : undefined;
    if (port) {
      return new DockerComposeError(
        'DOCKER_PORT_CONFLICT',
        `Não foi possível ${verb} o serviço: a porta ${port} já está em uso por outro processo.`,
      );
    }
    return new DockerComposeError(
      'DOCKER_ACTION_FAILED',
      detail ? `Não foi possível ${verb} o serviço: ${detail}` : `Não foi possível ${verb} o serviço.`,
    );
  }

  // O `docker compose up -d` retorna sucesso assim que o container é criado e
  // colocado para rodar, mesmo que ele morra logo em seguida (ex.: dependência
  // nativa faltando, gem ausente). Sem essa checagem, a ação é reportada como
  // sucesso e o usuário só descobre a falha real ao consultar os logs manualmente.
  private async verifyServiceStayedUp(
    project: Project,
    detected: DetectedCompose,
    serviceName: string,
  ): Promise<void> {
    let running = false;
    try {
      const result = await this.runCommand('docker', [
        'compose', '-f', detected.composeFile, 'ps', '--status', 'running', '--services',
      ], { cwd: project.path });
      running = result.stdout.split(/\r?\n/).filter(Boolean).includes(serviceName);
    } catch {
      return;
    }
    if (running) return;
    const excerpt = await this.quickLogExcerpt(project, detected, serviceName);
    throw new DockerComposeError(
      'DOCKER_SERVICE_EXITED',
      `O serviço "${serviceName}" iniciou mas saiu logo em seguida.${excerpt ? ` Últimas linhas: ${excerpt}` : ''}`,
    );
  }

  private async quickLogExcerpt(
    project: Project,
    detected: DetectedCompose,
    serviceName: string,
  ): Promise<string | undefined> {
    try {
      const result = await this.runCommand('docker', [
        'compose', '-f', detected.composeFile, 'logs', '--no-color', '--tail=5', serviceName,
      ], { cwd: project.path });
      const trimmed = result.stdout.trim();
      if (!trimmed) return undefined;
      return maskSensitiveLogContent(trimmed).content.slice(-400);
    } catch {
      return undefined;
    }
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
    } catch (error) {
      const detail = commandErrorDetail(error);
      throw new DockerComposeError(
        'DOCKER_ACTION_FAILED',
        detail ? `Não foi possível consultar os logs do serviço: ${detail}` : 'Não foi possível consultar os logs do serviço.',
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

  private requireProcessManager(): ProcessManager {
    if (!this.processManager) {
      throw new DockerComposeError(
        'DOCKER_BUILD_UNSUPPORTED',
        'O build de serviços Docker não está disponível nesta instância da API.',
      );
    }
    return this.processManager;
  }

  private async hasSuccessfulBuild(projectId: string, serviceName: string): Promise<boolean> {
    if (!this.processManager) return false;
    const build = await this.processManager.getComposeBuildProcess(projectId, serviceName);
    return build?.status === 'stopped' && build.exitCode === 0;
  }

  public async prepareBuildConfirmation(
    project: Project,
    serviceName: string,
  ): Promise<ComposeServiceBuildConfirmation> {
    this.requireService(await this.detect(project), serviceName);
    this.pruneExpiredConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, { projectId: project.id, serviceName, action: 'build', expiresAt });
    return { token, serviceName, expiresAt: new Date(expiresAt).toISOString() };
  }

  public async startBuild(
    project: Project,
    serviceName: string,
    confirmationToken?: string,
  ): Promise<ManagedProcess> {
    const detected = await this.detect(project);
    this.requireService(detected, serviceName);
    this.requireConfirmation(project.id, serviceName, 'build', confirmationToken);
    if (!detected || !(await this.dockerAvailable(project))) {
      throw new DockerComposeError(
        'DOCKER_UNAVAILABLE',
        'Docker Compose não está disponível no PATH da API.',
      );
    }
    this.consumeConfirmation(project.id, serviceName, 'build', confirmationToken);
    return this.requireProcessManager().startComposeBuild(project, serviceName, {
      command: 'docker',
      args: ['compose', '-f', detected.composeFile, 'build', serviceName],
    });
  }

  public async stopBuild(project: Project, serviceName: string): Promise<ManagedProcess> {
    this.requireService(await this.detect(project), serviceName);
    return this.requireProcessManager().stopComposeBuild(project.id, serviceName);
  }

  public async getBuildStatus(project: Project, serviceName: string): Promise<ManagedProcess | null> {
    this.requireService(await this.detect(project), serviceName);
    return this.requireProcessManager().getComposeBuildProcess(project.id, serviceName);
  }

  public async readBuildLog(
    project: Project,
    serviceName: string,
    options: ReadServerLogOptions = {},
  ): Promise<ProcessLogSnapshot> {
    this.requireService(await this.detect(project), serviceName);
    return this.requireProcessManager().readComposeBuildLog(project.id, serviceName, options);
  }

  public async clearBuildLog(project: Project, serviceName: string): Promise<ProcessLogSnapshot> {
    this.requireService(await this.detect(project), serviceName);
    return this.requireProcessManager().clearComposeBuildLog(project.id, serviceName);
  }
}
