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

const MAX_WORKFLOW_PATH_LENGTH = 1_024;
const MAX_LABEL_LENGTH = 240;
const MAX_JOBS = 512;
const MAX_EVENTS_PER_JOB = 64;
const SAFE_CATALOG_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;

function boundedLabel(value: string): string | undefined {
  const label = value.trim();
  if (!label || label.length > MAX_LABEL_LENGTH) return undefined;
  return label;
}

function normalizeWorkflowPath(value: string): string | undefined {
  if (value.length > MAX_WORKFLOW_PATH_LENGTH) return undefined;
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

function boundedAvailability(input: LocalCiAvailability): LocalCiAvailability {
  const actVersion = input.actVersion ? boundedLabel(input.actVersion) : undefined;
  const dockerVersion = input.dockerVersion ? boundedLabel(input.dockerVersion) : undefined;
  return {
    state: input.state,
    ...(actVersion ? { actVersion } : {}),
    ...(dockerVersion ? { dockerVersion } : {}),
  };
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
  const jobs: LocalCiJobDescriptor[] = [];

  for (const candidate of input.jobs) {
    if (jobs.length >= MAX_JOBS) break;
    const workflowFile = normalizeWorkflowPath(candidate.workflowFile);
    const jobId = safeCatalogToken(candidate.jobId);
    const workflow = boundedLabel(candidate.workflow);
    const job = boundedLabel(candidate.job);
    if (!workflowFile || !jobId || !workflow || !job) continue;

    const events: string[] = [];
    const seenEvents = new Set<string>();
    for (const event of candidate.events) {
      if (events.length >= MAX_EVENTS_PER_JOB) break;
      const safeEvent = safeCatalogToken(event);
      if (!safeEvent || seenEvents.has(safeEvent)) continue;
      seenEvents.add(safeEvent);
      events.push(safeEvent);
    }
    if (!events.length) continue;

    jobs.push({ workflowFile, workflow, jobId, job, events });
  }

  return {
    provider: 'act',
    approximation: true,
    availability: boundedAvailability(input.availability),
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
