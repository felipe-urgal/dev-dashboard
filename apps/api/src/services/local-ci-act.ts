import path from 'node:path';

export type LocalCiAvailabilityState = 'available' | 'act-missing' | 'docker-unavailable';

export interface LocalCiAvailability {
  state: LocalCiAvailabilityState;
  actVersion?: string;
  dockerVersion?: string;
}

export interface LocalCiJobDescriptor {
  workflowFile: string;
  workflow: string;
  jobId: string;
  job: string;
  events: string[];
}

export interface LocalCiCatalog {
  provider: 'act';
  approximation: true;
  availability: LocalCiAvailability;
  jobs: LocalCiJobDescriptor[];
}

export interface LocalCiJobRequest {
  workflowFile: string;
  jobId: string;
  event: string;
}

export interface StructuredCommand {
  program: 'act';
  args: string[];
}

const SAFE_CATALOG_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;

function normalizeWorkflowPath(value: string): string | undefined {
  const normalized = value.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) return undefined;

  const safe = path.posix.normalize(normalized).replace(/^\.\//, '');
  if (safe.includes('\0') || safe === '..' || safe.startsWith('../')) return undefined;
  if (!safe.startsWith('.github/workflows/')) return undefined;
  if (!/\.(?:yml|yaml)$/u.test(safe)) return undefined;
  return safe;
}

function safeCatalogToken(value: string): string | undefined {
  const token = value.trim();
  return SAFE_CATALOG_TOKEN.test(token) ? token : undefined;
}

function sameJob(job: LocalCiJobDescriptor, request: LocalCiJobRequest): boolean {
  return (
    job.workflowFile === request.workflowFile &&
    job.jobId === request.jobId &&
    job.events.includes(request.event)
  );
}

export function createLocalCiCatalog(input: {
  availability: LocalCiAvailability;
  jobs: LocalCiJobDescriptor[];
}): LocalCiCatalog {
  const jobs = input.jobs.flatMap((job) => {
    const workflowFile = normalizeWorkflowPath(job.workflowFile);
    const jobId = safeCatalogToken(job.jobId);
    const events = [
      ...new Set(
        job.events.flatMap((event) => {
          const safeEvent = safeCatalogToken(event);
          return safeEvent ? [safeEvent] : [];
        }),
      ),
    ];

    if (!workflowFile || !jobId || !events.length) return [];

    return [
      {
        ...job,
        workflowFile,
        jobId,
        events,
      },
    ];
  });

  return {
    provider: 'act',
    approximation: true,
    availability: input.availability,
    jobs,
  };
}

export function buildActListCommand(workflowFile?: string): StructuredCommand {
  if (workflowFile === undefined) {
    return { program: 'act', args: ['--list'] };
  }

  const safe = normalizeWorkflowPath(workflowFile);
  if (!safe) throw new Error('Workflow fora do catálogo permitido.');
  return { program: 'act', args: ['--list', '--workflows', safe] };
}

export function buildActJobCommand(
  catalog: LocalCiCatalog,
  request: LocalCiJobRequest,
): StructuredCommand {
  if (catalog.availability.state !== 'available') {
    throw new Error('Local CI indisponível no ambiente atual.');
  }

  const safeFile = normalizeWorkflowPath(request.workflowFile);
  const safeJobId = safeCatalogToken(request.jobId);
  const safeEvent = safeCatalogToken(request.event);
  if (!safeFile) throw new Error('Workflow fora do catálogo permitido.');
  if (!safeJobId || !safeEvent) throw new Error('Job/evento inválido para execução local.');

  const normalizedRequest = {
    workflowFile: safeFile,
    jobId: safeJobId,
    event: safeEvent,
  };
  if (!catalog.jobs.some((job) => sameJob(job, normalizedRequest))) {
    throw new Error('Job/evento não pertence ao catálogo detectado.');
  }

  return {
    program: 'act',
    args: [safeEvent, '--job', safeJobId, '--workflows', safeFile],
  };
}
