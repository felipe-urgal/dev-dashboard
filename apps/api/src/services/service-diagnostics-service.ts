import type {
  ManagedProcess,
  ServiceCatalogEntry,
  ServiceDiagnosticsSnapshot,
  ServiceDiagnosticsStatus,
} from '@dev-dashboard/contracts';
import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';
import type { ProcessManager } from '@dev-dashboard/process-manager';

import { primaryEnvironmentInstanceId } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { ProjectServiceBindingStore } from '../store/project-service-binding-store.js';
import type { ServiceCatalogService } from './service-catalog-service.js';
import type { DockerComposeLifecycleService } from './docker-compose-lifecycle-service.js';
import type { ActivitySnapshotService } from './activity-snapshot-service.js';
import type { SystemdJournalReader } from './systemd-journal-reader.js';

const MAX_LOG_BYTES = 65_536;
const MAX_EVENTS = 20;
const MAX_AGE_MS = 30_000;

export class ServiceDiagnosticsError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceDiagnosticsError';
  }
}

type Dependencies = {
  projects: Pick<ProjectStore, 'findProject'>;
  bindings: Pick<ProjectServiceBindingStore, 'byProject'>;
  catalog: Pick<ServiceCatalogService, 'inspect'>;
  compose: Pick<DockerComposeLifecycleService, 'logs'>;
  processes: Pick<
    ProcessManager,
    'listProcesses' | 'readServerLog' | 'readWorkerLog' | 'readTestLog'
  >;
  activity: Pick<ActivitySnapshotService, 'readProject'>;
  journal: Pick<SystemdJournalReader, 'read'>;
};

type ReadResult = {
  status: ServiceDiagnosticsStatus;
  source: ServiceDiagnosticsSnapshot['source'];
  content?: string;
  masked: boolean;
  truncated: boolean;
  diagnostic?: string;
  readAt?: string;
};

const unavailable = (
  source: ReadResult['source'],
  diagnostic: string,
): ReadResult => ({
  source,
  status: 'unavailable',
  masked: false,
  truncated: false,
  diagnostic,
});

function safeContent(content: string): {
  content: string;
  masked: boolean;
  truncated: boolean;
} {
  const bytes = Buffer.from(content, 'utf8');
  const truncated = bytes.length > MAX_LOG_BYTES;
  const limited = truncated
    ? bytes
        .subarray(bytes.length - MAX_LOG_BYTES)
        .toString('utf8')
        .replace(/^\uFFFD+/, '')
    : content;
  const masked = maskSensitiveLogContent(limited);
  return { content: masked.content, masked: masked.masked, truncated };
}

function matchesActivityRef(
  ref: string | undefined,
  entry: ServiceCatalogEntry,
): boolean {
  if (!ref) return false;
  return (
    ref === entry.id ||
    (entry.provider === 'managed-process' &&
      ref === entry.id.slice('process:'.length))
  );
}

/** One-shot observations. No polling, log storage, mutations or trust in caller-supplied unit names. */
export class ServiceDiagnosticsService {
  private readonly now: () => Date;

  public constructor(
    private readonly deps: Dependencies,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async read(
    projectId: string,
    serviceRef: string,
    environmentInstanceId?: string,
  ): Promise<ServiceDiagnosticsSnapshot> {
    const project = this.deps.projects.findProject(projectId);
    const environment =
      environmentInstanceId ?? primaryEnvironmentInstanceId(projectId);
    if (
      !project ||
      !this.deps.bindings
        .byProject(projectId)
        .some(
          (binding) =>
            binding.enabled &&
            binding.environmentInstanceId === environment &&
            binding.serviceRef === serviceRef,
        )
    ) {
      throw new ServiceDiagnosticsError(
        'NOT_FOUND',
        'Service binding not found for this project/environment.',
      );
    }

    const readAt = this.now().toISOString();
    let entry: ServiceCatalogEntry | undefined;
    let partial = false;
    try {
      const catalog = await this.deps.catalog.inspect();
      const matches = catalog.entries.filter(
        (candidate) => candidate.id === serviceRef,
      );
      entry = matches.length === 1 ? matches[0] : undefined;
      partial =
        catalog.truncated || catalog.status !== 'ready' || matches.length !== 1;
    } catch {
      partial = true;
    }

    const fallbackProvider = serviceRef.startsWith('systemd:')
      ? 'systemd'
      : serviceRef.startsWith('compose:')
        ? 'compose'
        : serviceRef.startsWith('process:')
          ? 'managed-process'
          : 'docker';
    const provider = entry?.provider ?? fallbackProvider;
    let result: ReadResult = unavailable(
      'none',
      'Service was not resolved in the current catalog; refresh inventory and binding.',
    );

    if (entry) {
      if (
        entry.provider === 'systemd' &&
        (entry.scope === 'system' || entry.scope === 'user')
      ) {
        try {
          const journal = await this.deps.journal.read(entry.scope, entry.name);
          result = { source: 'journal', ...journal };
        } catch {
          // A broken journal provider must not discard other diagnostics,
          // Activity/Jobs or leak command errors into the API response.
          result = unavailable(
            'journal',
            'Journal reader failed; service evidence is unavailable.',
          );
        }
      } else if (entry.provider === 'compose') {
        const owned =
          entry.ownership === 'confirmed' &&
          entry.projectId === projectId &&
          (entry.environmentInstanceId ??
            primaryEnvironmentInstanceId(projectId)) === environment;
        if (!owned) {
          result = unavailable(
            'compose',
            'Compose ownership for this environment is not verified.',
          );
        } else {
          try {
            const log = await this.deps.compose.logs(project, {
              service: entry.name,
              tail: 200,
            });
            result = {
              source: 'compose',
              status: log.content ? 'available' : 'empty',
              content: log.content,
              masked: log.masked,
              truncated: log.truncated,
              readAt: log.readAt,
            };
          } catch {
            result = unavailable(
              'compose',
              'Compose log reader is unavailable or ownership changed.',
            );
          }
        }
      } else if (entry.provider === 'managed-process') {
        const owned =
          entry.ownership === 'confirmed' &&
          entry.projectId === projectId &&
          (entry.environmentInstanceId ??
            primaryEnvironmentInstanceId(projectId)) === environment;
        if (!owned) {
          result = unavailable(
            'process',
            'Process ownership for this environment is not verified.',
          );
        } else {
          result = await this.readProcess(entry, projectId, environment);
        }
      } else {
        result = {
          source: 'none',
          status: 'unsupported',
          masked: false,
          truncated: false,
          diagnostic:
            'Unmanaged Docker containers do not expose logs through this provider.',
        };
      }
    }

    // Reuse Activity/Jobs once: failures are explicitly partial rather than empty history.
    let events: ServiceDiagnosticsSnapshot['events'] = [];
    let jobs: ServiceDiagnosticsSnapshot['jobs'] = [];
    try {
      const activity = await this.deps.activity.readProject(projectId, 100);
      partial ||= activity.partial;
      if (entry) {
        events = activity.events
          .filter(
            (event) =>
              matchesActivityRef(event.resourceRef?.id, entry) &&
              (!event.environmentInstanceId ||
                event.environmentInstanceId === environment),
          )
          .slice(0, MAX_EVENTS)
          .map(({ id, type, status, occurredAt, resourceRef, jobId }) => ({
            id,
            type,
            occurredAt,
            ...(status ? { status } : {}),
            ...(resourceRef ? { resourceRef } : {}),
            ...(jobId ? { jobId } : {}),
          }));
        jobs = activity.jobs
          .filter(
            (job) =>
              matchesActivityRef(job.resourceRef?.id, entry) &&
              (!job.environmentInstanceId ||
                job.environmentInstanceId === environment),
          )
          .slice(0, MAX_EVENTS)
          .map(
            ({ id, action, status, startedAt, finishedAt, resourceRef }) => ({
              id,
              action,
              status,
              ...(startedAt ? { startedAt } : {}),
              ...(finishedAt ? { finishedAt } : {}),
              ...(resourceRef ? { resourceRef } : {}),
            }),
          );
      }
    } catch {
      partial = true;
    }
    const observed = entry?.observedAt;
    const observedMs = observed ? Date.parse(observed) : NaN;
    const stale =
      !Number.isFinite(observedMs) ||
      Math.abs(this.now().getTime() - observedMs) > MAX_AGE_MS;
    const safe =
      result.content !== undefined ? safeContent(result.content) : undefined;

    return {
      serviceRef,
      projectId,
      environmentInstanceId: environment,
      provider,
      source: result.source,
      status: result.status,
      state: entry?.state ?? 'unknown',
      readiness: entry?.readiness ?? 'unknown',
      ...(observed ? { observedAt: observed } : {}),
      readAt: result.readAt ?? readAt,
      stale,
      partial: partial || result.status === 'unavailable',
      masked: (result.masked || safe?.masked) ?? false,
      truncated: (result.truncated || safe?.truncated) ?? false,
      ...(safe ? { content: safe.content } : {}),
      ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
      events,
      jobs,
    };
  }

  private async readProcess(
    entry: ServiceCatalogEntry,
    projectId: string,
    environment: string,
  ): Promise<ReadResult> {
    try {
      const processes = await this.deps.processes.listProcesses();
      const process = processes.find(
        (item) =>
          'process:' + item.id === entry.id &&
          item.projectId === projectId &&
          (item.environmentInstanceId ??
            primaryEnvironmentInstanceId(projectId)) === environment,
      );
      if (!process)
        return unavailable(
          'process',
          'Managed process identity was removed or changed.',
        );
      if (process.kind === 'script')
        return {
          status: 'unsupported',
          source: 'process',
          masked: false,
          truncated: false,
          diagnostic: 'Script logs are owned by Script Execution.',
        };
      const log = await this.processLog(process);
      if (log.processId !== process.id)
        return unavailable('process', 'Process log identity changed.');
      return {
        source: 'process',
        status: log.content ? 'available' : 'empty',
        content: log.content,
        masked: log.masked,
        truncated: log.truncated,
        readAt: log.readAt,
      };
    } catch {
      return unavailable(
        'process',
        'Managed process log reader is unavailable.',
      );
    }
  }

  private processLog(process: ManagedProcess) {
    const options = { maxBytes: MAX_LOG_BYTES };
    switch (process.kind) {
      case 'server':
        return this.deps.processes.readServerLog(
          process.projectId,
          options,
          process.environmentInstanceId,
        );
      case 'worker':
      case 'webpack':
        return this.deps.processes.readWorkerLog(
          process.projectId,
          process.kind,
          options,
          process.environmentInstanceId,
        );
      case 'test':
        return this.deps.processes.readTestLog(
          process.projectId,
          options,
          process.environmentInstanceId,
        );
      case 'script':
        throw new Error('Script logs are not owned by Process Manager.');
    }
  }
}
