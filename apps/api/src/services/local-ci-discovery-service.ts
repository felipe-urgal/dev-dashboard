import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';
import { parse } from 'yaml';

import {
  createLocalCiCatalog,
  type LocalCiAvailability,
  type LocalCiCatalog,
  type LocalCiJobDescriptor,
  type LocalCiDiscoveryDiagnostics,
} from './local-ci-act.js';

const MAX_WORKFLOW_FILES = 64;
const MAX_WORKFLOW_BYTES = 256 * 1024;
const COMMAND_TIMEOUT_MS = 5_000;
const COMMAND_MAX_BUFFER_BYTES = 64 * 1024;
const VERSION_MAX_LENGTH = 64;

type UnknownRecord = Record<string, unknown>;

interface DiscoveryCommand {
  program: 'act' | 'docker';
  args: string[];
}

export type LocalCiDiscoveryCommandRunner = (
  command: DiscoveryCommand,
  options: { timeoutMs: number; maxBufferBytes: number },
) => Promise<string>;

function defaultCommandRunner(
  command: DiscoveryCommand,
  options: { timeoutMs: number; maxBufferBytes: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command.program,
      command.args,
      {
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shortVersion(value: string, pattern: RegExp): string | undefined {
  const firstLine = value.split(/\r?\n/u)[0]?.trim() ?? '';
  const match = firstLine.match(pattern);
  const version = match?.[1]?.trim();
  return version && version.length <= VERSION_MAX_LENGTH ? version : undefined;
}

function workflowEvents(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((event): event is string => typeof event === 'string');
  }
  if (isRecord(value)) return Object.keys(value);
  return [];
}

function workflowName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function workflowJobs(
  payload: unknown,
  workflowFile: string,
): LocalCiJobDescriptor[] {
  if (!isRecord(payload) || !isRecord(payload.jobs)) return [];
  const events = workflowEvents(payload.on);
  const fallbackName = path.posix
    .basename(workflowFile)
    .replace(/\.(?:yml|yaml)$/u, '');
  const workflow = workflowName(payload.name, fallbackName);
  const jobs: LocalCiJobDescriptor[] = [];

  for (const [jobId, rawJob] of Object.entries(payload.jobs)) {
    if (!isRecord(rawJob)) continue;
    jobs.push({
      workflowFile,
      workflow,
      jobId,
      job: workflowName(rawJob.name, jobId),
      events: [...events],
    });
  }

  return jobs;
}

interface WorkflowDiscovery {
  jobs: LocalCiJobDescriptor[];
  diagnostics: LocalCiDiscoveryDiagnostics;
}

function emptyDiscovery(): WorkflowDiscovery {
  return {
    jobs: [],
    diagnostics: {
      workflowsExamined: 0,
      workflowsAccepted: 0,
      workflowsSkipped: 0,
      truncated: false,
      reasons: [],
    },
  };
}

async function discoverWorkflows(projectPath: string): Promise<WorkflowDiscovery> {
  const result = emptyDiscovery();
  let root: string;
  try {
    root = await realpath(projectPath);
  } catch {
    result.diagnostics.truncated = true;
    result.diagnostics.reasons.push('Não foi possível acessar o projeto.');
    return result;
  }
  const directory = path.join(root, '.github', 'workflows');
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      result.diagnostics.truncated = true;
      result.diagnostics.reasons.push('Não foi possível examinar os workflows.');
    }
    return result;
  }

  const files = entries
    .filter((entry) => /\\.(?:yml|yaml)$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const selectedFiles = files.slice(0, MAX_WORKFLOW_FILES);
  result.diagnostics.workflowsSkipped = files.length - selectedFiles.length;
  if (result.diagnostics.workflowsSkipped > 0) {
    result.diagnostics.truncated = true;
    result.diagnostics.reasons.push('Limite de arquivos de workflow atingido.');
  }

  for (const file of selectedFiles) {
    result.diagnostics.workflowsExamined += 1;
    const absolute = path.join(directory, file);
    try {
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        result.diagnostics.workflowsSkipped += 1;
        result.diagnostics.reasons.push('Workflow não regular ou link simbólico ignorado.');
        continue;
      }
      if (stat.size > MAX_WORKFLOW_BYTES) {
        result.diagnostics.workflowsSkipped += 1;
        result.diagnostics.reasons.push('Workflow acima do tamanho permitido.');
        continue;
      }
      const resolved = await realpath(absolute);
      if (!resolved.startsWith(`${root}${path.sep}`)) {
        result.diagnostics.workflowsSkipped += 1;
        result.diagnostics.reasons.push('Workflow fora da raiz do projeto ignorado.');
        continue;
      }
      const payload = parse(await readFile(resolved, 'utf8')) as unknown;
      const jobs = workflowJobs(payload, `.github/workflows/${file}`);
      if (jobs.length === 0) {
        result.diagnostics.workflowsSkipped += 1;
        result.diagnostics.reasons.push('Workflow sem jobs válidos ignorado.');
        continue;
      }
      result.jobs.push(...jobs);
      result.diagnostics.workflowsAccepted += 1;
    } catch {
      result.diagnostics.workflowsSkipped += 1;
      result.diagnostics.reasons.push('Workflow inválido ou ilegível ignorado.');
    }
  }
  result.diagnostics.reasons = [...new Set(result.diagnostics.reasons)].slice(0, 8);
  return result;
}

export class LocalCiDiscoveryService {
  public constructor(
    private readonly runCommand: LocalCiDiscoveryCommandRunner = defaultCommandRunner,
  ) {}

  private async availability(): Promise<LocalCiAvailability> {
    let actVersion: string | undefined;
    try {
      const output = await this.runCommand(
        { program: 'act', args: ['--version'] },
        {
          timeoutMs: COMMAND_TIMEOUT_MS,
          maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
        },
      );
      actVersion = shortVersion(output, /^act version\s+([^\s]+)$/iu);
    } catch {
      return { state: 'act-missing' };
    }

    let dockerVersion: string | undefined;
    try {
      const output = await this.runCommand(
        { program: 'docker', args: ['info', '--format', '{{.ServerVersion}}'] },
        {
          timeoutMs: COMMAND_TIMEOUT_MS,
          maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
        },
      );
      dockerVersion = shortVersion(output, /^([^\s]+)$/u);
    } catch {
      return {
        state: 'docker-unavailable',
        ...(actVersion ? { actVersion } : {}),
      };
    }

    return {
      state: 'available',
      ...(actVersion ? { actVersion } : {}),
      ...(dockerVersion ? { dockerVersion } : {}),
    };
  }

  public async discover(project: Project): Promise<LocalCiCatalog> {
    const [availability, discovery] = await Promise.all([
      this.availability(),
      discoverWorkflows(project.path),
    ]);
    return createLocalCiCatalog({
      availability,
      jobs: discovery.jobs,
      diagnostics: discovery.diagnostics,
    });
  }
}
