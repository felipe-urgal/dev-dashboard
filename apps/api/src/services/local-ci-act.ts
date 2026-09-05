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

function normalizeWorkflowPath(value: string): string | undefined {
  const normalized = value.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized)) return undefined;

  const safe = path.posix.normalize(normalized).replace(/^\.\//, '');
  if (safe.includes('\0') || safe === '..' || safe.startsWith('../')) return undefined;
  if (!safe.startsWith('.github/workflows/')) return undefined;
  if (!/\.(?:yml|yaml)$/u.test(safe)) return undefined;
  return safe;
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
    if (!workflowFile || !job.jobId.trim() || !job.events.length) return [];

    return [
      {
        ...job,
        workflowFile,
        jobId: job.jobId.trim(),
        events: [...new Set(job.events.map((event) => event.trim()).filter(Boolean))],
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
  if (!safeFile) throw new Error('Workflow fora do catálogo permitido.');

  const normalizedRequest = { ...request, workflowFile: safeFile };
  if (!catalog.jobs.some((job) => sameJob(job, normalizedRequest))) {
    throw new Error('Job/evento não pertence ao catálogo detectado.');
  }

  return {
    program: 'act',
    args: [request.event, '--job', request.jobId, '--workflows', safeFile],
  };
}
