import { execFile } from 'node:child_process';

import type {
  PortAllocationLeaseRequest,
  Project,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

import type { ComposeStructuredCommand } from './docker-compose-model.js';
import type {
  DockerComposeOwnershipRecord,
  DockerComposeOwnershipStore,
} from './docker-compose-ownership-store.js';
import type {
  DockerComposeInspection,
  DockerComposeProvider,
} from './docker-compose-provider.js';
import type {
  PortAllocationLeaseBatchResult,
  PortAllocationLeaseRegistry,
} from './port-registry-service.js';
import type {
  DockerComposePortPreflight,
  DockerComposePortPreflightInput,
  DockerComposePreflightService,
} from './docker-compose-preflight-service.js';

const MUTATION_TIMEOUT_MS = 2 * 60_000;
const MUTATION_MAX_BUFFER_BYTES = 128 * 1024;
const LOG_TIMEOUT_MS = 15_000;
const LOG_MAX_BUFFER_BYTES = 256 * 1024;
const LOG_MAX_CONTENT_BYTES = 128 * 1024;
const DEFAULT_LOG_TAIL = 200;
const MAX_LOG_TAIL = 500;

export type DockerComposeStartState = 'started' | 'started-unverified';

export interface DockerComposeStartResult {
  state: DockerComposeStartState;
  preflight: DockerComposePortPreflight;
  inspection?: DockerComposeInspection;
  diagnostic?: string;
}

export type DockerComposeLifecycleErrorCode =
  | 'COMPOSE_UNAVAILABLE'
  | 'COMPOSE_PREFLIGHT_BLOCKED'
  | 'COMPOSE_PREFLIGHT_UNAVAILABLE'
  | 'COMPOSE_START_FAILED'
  | 'COMPOSE_STOP_FAILED'
  | 'COMPOSE_RESTART_FAILED'
  | 'COMPOSE_LOGS_FAILED'
  | 'COMPOSE_OWNERSHIP_REQUIRED'
  | 'COMPOSE_OWNERSHIP_MISMATCH'
  | 'COMPOSE_OWNERSHIP_PERSIST_FAILED'
  | 'COMPOSE_SERVICE_INVALID';

export class DockerComposeLifecycleError extends Error {
  public constructor(
    public readonly code: DockerComposeLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DockerComposeLifecycleError';
  }
}

interface LifecycleCommandOptions {
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
}

export type DockerComposeLifecycleCommandRunner = (
  command: ComposeStructuredCommand,
  options: LifecycleCommandOptions,
) => Promise<string | void>;

export type DockerComposeStartCommandRunner =
  DockerComposeLifecycleCommandRunner;

function defaultLifecycleCommandRunner(
  command: ComposeStructuredCommand,
  options: LifecycleCommandOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command.program,
      command.args,
      {
        cwd: options.cwd,
        encoding: 'utf8',
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function composeCommand(
  composeProjectName: string | undefined,
  args: string[],
): ComposeStructuredCommand {
  return {
    program: 'docker',
    args: [
      'compose',
      ...(composeProjectName ? ['--project-name', composeProjectName] : []),
      ...args,
    ],
  };
}

function startCommand(
  composeProjectName: string | undefined,
  wait: boolean,
): ComposeStructuredCommand {
  return composeCommand(composeProjectName, [
    'up',
    '--detach',
    ...(wait ? ['--wait'] : []),
  ]);
}

function stopCommand(
  composeProjectName: string,
  service?: string,
): ComposeStructuredCommand {
  return composeCommand(composeProjectName, [
    'stop',
    ...(service ? [service] : []),
  ]);
}

function restartCommand(
  composeProjectName: string,
  service?: string,
): ComposeStructuredCommand {
  return composeCommand(composeProjectName, [
    'restart',
    ...(service ? [service] : []),
  ]);
}

function logsCommand(
  composeProjectName: string,
  tail: number,
  service?: string,
): ComposeStructuredCommand {
  return composeCommand(composeProjectName, [
    'logs',
    '--no-color',
    '--tail',
    String(tail),
    ...(service ? [service] : []),
  ]);
}

export type DockerComposeMutationState =
  'stopped' | 'stopped-unverified' | 'restarted' | 'restarted-unverified';

export interface DockerComposeMutationResult {
  state: DockerComposeMutationState;
  inspection?: DockerComposeInspection;
  diagnostic?: string;
}

export interface DockerComposeLogSnapshot {
  content: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
  readAt: string;
}

export type DockerComposeReconciliationState =
  'unchanged' | 'released' | 'unavailable';

export interface DockerComposeReconciliationResult {
  state: DockerComposeReconciliationState;
  diagnostic?: string;
}

export interface DockerComposeLifecycleServiceOptions {
  supportsWait?: () => Promise<boolean>;
  ownershipStore?: Pick<
    DockerComposeOwnershipStore,
    'get' | 'claim' | 'release'
  >;
  portLeaseRegistry?: Pick<
    PortAllocationLeaseRegistry,
    'reserveBatch' | 'release' | 'releaseProject'
  >;
  now?: () => Date;
}

export class DockerComposeLifecycleService {
  private readonly supportsWait: () => Promise<boolean>;
  private readonly ownershipStore: DockerComposeLifecycleServiceOptions['ownershipStore'];
  private readonly portLeaseRegistry: DockerComposeLifecycleServiceOptions['portLeaseRegistry'];
  private readonly now: () => Date;

  public constructor(
    private readonly provider: Pick<DockerComposeProvider, 'inspect'>,
    private readonly preflight: Pick<DockerComposePreflightService, 'inspect'>,
    private readonly runCommand: DockerComposeLifecycleCommandRunner = defaultLifecycleCommandRunner,
    options: DockerComposeLifecycleServiceOptions = {},
  ) {
    this.supportsWait = options.supportsWait ?? (async () => false);
    this.ownershipStore = options.ownershipStore;
    this.portLeaseRegistry = options.portLeaseRegistry;
    this.now = options.now ?? (() => new Date());
  }

  public async start(
    project: Project,
    preflightInput: DockerComposePortPreflightInput = {},
  ): Promise<DockerComposeStartResult> {
    const before = await this.provider.inspect(project);
    if (before.state !== 'available' || !before.config) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_UNAVAILABLE',
        before.diagnostic ??
          'Docker Compose não está disponível para iniciar este projeto.',
      );
    }

    const checked = await this.preflight.inspect(
      project,
      before.config,
      before.runtime,
      preflightInput,
    );
    if (checked.state === 'blocked') {
      throw new DockerComposeLifecycleError(
        'COMPOSE_PREFLIGHT_BLOCKED',
        checked.diagnostic ??
          'Docker Compose não pode iniciar enquanto houver conflito de portas.',
      );
    }
    if (checked.state !== 'ready') {
      throw new DockerComposeLifecycleError(
        'COMPOSE_PREFLIGHT_UNAVAILABLE',
        checked.diagnostic ??
          'Docker Compose não pode comprovar a segurança das portas publicadas.',
      );
    }

    // `--wait` is opt-in only after capability detection; unknown support stays compatible.
    let wait = false;
    try {
      wait = await this.supportsWait();
    } catch {
      wait = false;
    }

    const composeProjectName = before.config.projectName;
    let claimedOwnership = false;
    if (this.ownershipStore) {
      if (!composeProjectName) {
        throw new DockerComposeLifecycleError(
          'COMPOSE_OWNERSHIP_MISMATCH',
          'O projeto Compose resolvido não possui nome estável para ownership.',
        );
      }
      const existing = await this.ownershipStore.get(project);
      if (existing && existing.composeProjectName !== composeProjectName) {
        throw new DockerComposeLifecycleError(
          'COMPOSE_OWNERSHIP_MISMATCH',
          'O ownership persistido pertence a outro projeto Compose.',
        );
      }
      if (!existing) {
        try {
          await this.ownershipStore.claim(project, composeProjectName);
          claimedOwnership = true;
        } catch {
          throw new DockerComposeLifecycleError(
            'COMPOSE_OWNERSHIP_PERSIST_FAILED',
            'Não foi possível persistir o ownership antes de iniciar o Compose.',
          );
        }
      }
    }

    let portLeases: PortAllocationLeaseBatchResult | undefined;
    try {
      portLeases = this.reservePublishedPortLeases(project, before.config);
    } catch (error) {
      if (claimedOwnership) {
        await this.ownershipStore?.release(project).catch(() => false);
      }
      throw error;
    }

    try {
      await this.runCommand(
        startCommand(
          this.ownershipStore ? composeProjectName : undefined,
          wait,
        ),
        {
          cwd: project.path,
          timeoutMs: MUTATION_TIMEOUT_MS,
          maxBufferBytes: MUTATION_MAX_BUFFER_BYTES,
        },
      );
    } catch {
      this.releaseCreatedPortLeases(portLeases);
      if (claimedOwnership) {
        await this.ownershipStore?.release(project).catch(() => false);
      }
      throw new DockerComposeLifecycleError(
        'COMPOSE_START_FAILED',
        'Docker Compose não conseguiu iniciar a stack conhecida deste projeto.',
      );
    }

    const after = await this.provider.inspect(project).catch(() => undefined);
    if (
      !after ||
      after.state !== 'available' ||
      !after.runtime ||
      after.runtime.services.length === 0
    ) {
      return {
        state: 'started-unverified',
        preflight: checked,
        ...(after ? { inspection: after } : {}),
        diagnostic:
          'A operação de start terminou, mas o runtime não pôde ser comprovado na inspeção seguinte.',
      };
    }

    return { state: 'started', preflight: checked, inspection: after };
  }

  public async stop(
    project: Project,
    service?: string,
  ): Promise<DockerComposeMutationResult> {
    const target = await this.requireOwnedTarget(project, service);
    try {
      await this.runCommand(
        stopCommand(target.ownership.composeProjectName, service),
        {
          cwd: project.path,
          timeoutMs: MUTATION_TIMEOUT_MS,
          maxBufferBytes: MUTATION_MAX_BUFFER_BYTES,
        },
      );
      if (!service) this.portLeaseRegistry?.releaseProject(project.id);
    } catch {
      throw new DockerComposeLifecycleError(
        'COMPOSE_STOP_FAILED',
        'Docker Compose não conseguiu parar o alvo owned deste projeto.',
      );
    }

    const after = await this.provider.inspect(project).catch(() => undefined);
    const observedServices = after ? this.targetServices(after, service) : [];
    const verified =
      Boolean(after?.runtime) &&
      observedServices.length > 0 &&
      observedServices.every(
        (item) =>
          item.state !== 'running' &&
          item.state !== 'restarting' &&
          item.state !== 'paused',
      );
    return verified
      ? {
          state: 'stopped',
          ...(after ? { inspection: after } : {}),
        }
      : {
          state: 'stopped-unverified',
          ...(after ? { inspection: after } : {}),
          diagnostic:
            'A operação de stop terminou, mas o estado parado não pôde ser comprovado.',
        };
  }

  public async restart(
    project: Project,
    service?: string,
    preflightInput: DockerComposePortPreflightInput = {},
  ): Promise<DockerComposeMutationResult> {
    const target = await this.requireOwnedTarget(project, service);
    const checked = await this.preflight.inspect(
      project,
      target.inspection.config!,
      target.inspection.runtime,
      preflightInput,
    );
    if (checked.state === 'blocked') {
      throw new DockerComposeLifecycleError(
        'COMPOSE_PREFLIGHT_BLOCKED',
        checked.diagnostic ??
          'Docker Compose não pode reiniciar enquanto houver conflito de portas.',
      );
    }
    if (checked.state !== 'ready') {
      throw new DockerComposeLifecycleError(
        'COMPOSE_PREFLIGHT_UNAVAILABLE',
        checked.diagnostic ??
          'Docker Compose não pode comprovar a segurança das portas antes do restart.',
      );
    }

    const portLeases = this.reservePublishedPortLeases(
      project,
      target.inspection.config!,
    );

    try {
      await this.runCommand(
        restartCommand(target.ownership.composeProjectName, service),
        {
          cwd: project.path,
          timeoutMs: MUTATION_TIMEOUT_MS,
          maxBufferBytes: MUTATION_MAX_BUFFER_BYTES,
        },
      );
    } catch {
      this.releaseCreatedPortLeases(portLeases);
      throw new DockerComposeLifecycleError(
        'COMPOSE_RESTART_FAILED',
        'Docker Compose não conseguiu reiniciar o alvo owned deste projeto.',
      );
    }

    const after = await this.provider.inspect(project).catch(() => undefined);
    const observedServices = after ? this.targetServices(after, service) : [];
    const verified =
      Boolean(after?.runtime) &&
      observedServices.length > 0 &&
      observedServices.every(
        (item) => item.state === 'running' || item.state === 'restarting',
      );
    return verified
      ? {
          state: 'restarted',
          ...(after ? { inspection: after } : {}),
        }
      : {
          state: 'restarted-unverified',
          ...(after ? { inspection: after } : {}),
          diagnostic:
            'A operação de restart terminou, mas o runtime ativo não pôde ser comprovado.',
        };
  }

  public async reconcile(
    project: Project,
    inspection: DockerComposeInspection,
  ): Promise<DockerComposeReconciliationResult> {
    if (!this.ownershipStore) {
      return {
        state: 'unavailable',
        diagnostic:
          'Reconciliation do Compose exige ownership persistido configurado.',
      };
    }

    let ownership: DockerComposeOwnershipRecord | undefined;
    try {
      ownership = await this.ownershipStore.get(project);
    } catch {
      return {
        state: 'unavailable',
        diagnostic:
          'O ownership persistido do Compose não pôde ser lido para reconciliation.',
      };
    }

    if (!ownership) {
      const released = this.portLeaseRegistry?.releaseProject(project.id) ?? 0;
      return { state: released > 0 ? 'released' : 'unchanged' };
    }

    if (
      inspection.state !== 'available' ||
      !inspection.config ||
      !inspection.runtime
    ) {
      return {
        state: 'unavailable',
        diagnostic:
          'O runtime Compose não pôde ser comprovado; ownership foi preservado.',
      };
    }

    if (inspection.config.projectName !== ownership.composeProjectName) {
      return {
        state: 'unavailable',
        diagnostic:
          'O nome Compose observado diverge do ownership; estado foi preservado por segurança.',
      };
    }

    if (inspection.runtime.services.length > 0) {
      return { state: 'unchanged' };
    }

    try {
      const releasedOwnership = await this.ownershipStore.release(project);
      if (!releasedOwnership) {
        return {
          state: 'unavailable',
          diagnostic:
            'A stack não possui containers, mas o ownership não pôde ser liberado.',
        };
      }
      this.portLeaseRegistry?.releaseProject(project.id);
      return { state: 'released' };
    } catch {
      return {
        state: 'unavailable',
        diagnostic:
          'A stack não possui containers, mas a persistência do cleanup falhou.',
      };
    }
  }

  public async logs(
    project: Project,
    options: { service?: string; tail?: number } = {},
  ): Promise<DockerComposeLogSnapshot> {
    const tail = options.tail ?? DEFAULT_LOG_TAIL;
    if (!Number.isInteger(tail) || tail < 1 || tail > MAX_LOG_TAIL) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_LOGS_FAILED',
        `O tail dos logs deve ficar entre 1 e ${MAX_LOG_TAIL}.`,
      );
    }

    const target = await this.requireOwnedTarget(project, options.service);
    let output: string | void;
    try {
      output = await this.runCommand(
        logsCommand(target.ownership.composeProjectName, tail, options.service),
        {
          cwd: project.path,
          timeoutMs: LOG_TIMEOUT_MS,
          maxBufferBytes: LOG_MAX_BUFFER_BYTES,
        },
      );
    } catch {
      throw new DockerComposeLifecycleError(
        'COMPOSE_LOGS_FAILED',
        'Docker Compose não conseguiu ler os logs do alvo owned.',
      );
    }

    const raw = typeof output === 'string' ? output : '';
    const bounded = this.boundLogContent(raw);
    const masked = maskSensitiveLogContent(bounded.content);
    return {
      content: masked.content,
      truncated: bounded.truncated,
      masked: masked.masked,
      redactionCount: masked.redactionCount,
      readAt: this.now().toISOString(),
    };
  }

  private reservePublishedPortLeases(
    project: Project,
    config: NonNullable<DockerComposeInspection['config']>,
  ): PortAllocationLeaseBatchResult | undefined {
    if (!this.portLeaseRegistry) return undefined;

    const requests: PortAllocationLeaseRequest[] = [];
    const seenPorts = new Set<number>();
    for (const service of config.services) {
      for (const binding of service.ports) {
        const port = binding.publishedPort;
        if (port === undefined || seenPorts.has(port)) continue;
        seenPorts.add(port);
        requests.push({
          leaseId: `compose:${project.id}:${service.name}:${port}`,
          projectId: project.id,
          role: service.name,
          preferredPort: port,
          maxPort: port,
          ...(project.id.startsWith('environment:')
            ? { environmentInstanceId: project.id }
            : {}),
        });
      }
    }
    requests.sort(
      (left, right) =>
        left.preferredPort - right.preferredPort ||
        left.role.localeCompare(right.role),
    );
    if (requests.length === 0) {
      return { leases: [], createdLeaseIds: [] };
    }

    const batch = this.portLeaseRegistry.reserveBatch({}, requests);
    if (
      !batch ||
      batch.leases.some(
        (lease, index) => lease.port !== requests[index]?.preferredPort,
      )
    ) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_PREFLIGHT_BLOCKED',
        'Uma porta publicada pelo Compose já foi reservada por outro ambiente local.',
      );
    }
    return batch;
  }

  private releaseCreatedPortLeases(
    batch: PortAllocationLeaseBatchResult | undefined,
  ): void {
    if (!batch || !this.portLeaseRegistry) return;
    for (const leaseId of batch.createdLeaseIds) {
      this.portLeaseRegistry.release(leaseId);
    }
  }

  private async requireOwnedTarget(
    project: Project,
    service?: string,
  ): Promise<{
    ownership: DockerComposeOwnershipRecord;
    inspection: DockerComposeInspection;
  }> {
    if (!this.ownershipStore) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_OWNERSHIP_REQUIRED',
        'Lifecycle mutável do Compose exige ownership persistido.',
      );
    }
    const ownership = await this.ownershipStore.get(project);
    if (!ownership) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_OWNERSHIP_REQUIRED',
        'Este projeto não possui ownership Compose comprovado.',
      );
    }

    const inspection = await this.provider.inspect(project);
    const composeProjectName = inspection.config?.projectName;
    if (
      !inspection.config ||
      !composeProjectName ||
      composeProjectName !== ownership.composeProjectName
    ) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_OWNERSHIP_MISMATCH',
        'A configuração Compose atual não corresponde ao ownership persistido.',
      );
    }

    if (
      service &&
      !inspection.config.services.some((item) => item.name === service)
    ) {
      throw new DockerComposeLifecycleError(
        'COMPOSE_SERVICE_INVALID',
        'O serviço solicitado não pertence ao catálogo Compose resolvido.',
      );
    }

    return { ownership, inspection };
  }

  private targetServices(
    inspection: DockerComposeInspection,
    service?: string,
  ) {
    const services = inspection.runtime?.services ?? [];
    return service
      ? services.filter((item) => item.service === service)
      : services;
  }

  private boundLogContent(content: string): {
    content: string;
    truncated: boolean;
  } {
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.byteLength <= LOG_MAX_CONTENT_BYTES) {
      return { content, truncated: false };
    }
    const tail = bytes
      .subarray(bytes.byteLength - LOG_MAX_CONTENT_BYTES)
      .toString('utf8')
      .replace(/^\uFFFD/u, '');
    return { content: tail, truncated: true };
  }
}
