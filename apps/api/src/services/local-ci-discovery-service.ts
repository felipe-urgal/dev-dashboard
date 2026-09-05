import { execFile } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';
import { parse } from 'yaml';

import {
  createLocalCiCatalog,
  type LocalCiAvailability,
  type LocalCiCatalog,
  type LocalCiJobDescriptor,
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
  const fallbackName = path.posix.basename(workflowFile).replace(/\.(?:yml|yaml)$/u, '');
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

async function discoverWorkflows(projectPath: string): Promise<LocalCiJobDescriptor[]> {
  const root = await realpath(projectPath);
  const directory = path.join(root, '.github', 'workflows');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = entries
    .filter((entry) => entry.isFile() && /\.(?:yml|yaml)$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .slice(0, MAX_WORKFLOW_FILES);
  const jobs: LocalCiJobDescriptor[] = [];

  for (const file of files) {
    const absolute = path.join(directory, file);
    try {
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_WORKFLOW_BYTES) continue;
      const resolved = await realpath(absolute);
      if (!resolved.startsWith(`${root}${path.sep}`)) continue;
      const contents = await readFile(resolved, 'utf8');
      const payload = parse(contents) as unknown;
      jobs.push(...workflowJobs(payload, `.github/workflows/${file}`));
    } catch {
      // Workflow inválido/ilegível fica fora do catálogo; não derruba os demais.
    }
  }

  return jobs;
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
        { timeoutMs: COMMAND_TIMEOUT_MS, maxBufferBytes: COMMAND_MAX_BUFFER_BYTES },
      );
      actVersion = shortVersion(output, /^act version\s+([^\s]+)$/iu);
    } catch {
      return { state: 'act-missing' };
    }

    let dockerVersion: string | undefined;
    try {
      const output = await this.runCommand(
        { program: 'docker', args: ['info', '--format', '{{.ServerVersion}}'] },
        { timeoutMs: COMMAND_TIMEOUT_MS, maxBufferBytes: COMMAND_MAX_BUFFER_BYTES },
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
    const [availability, jobs] = await Promise.all([
      this.availability(),
      discoverWorkflows(project.path).catch(() => []),
    ]);
    return createLocalCiCatalog({ availability, jobs });
  }
}
