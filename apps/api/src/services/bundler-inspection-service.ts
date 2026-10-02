import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';
import type {
  BundlerOutdatedGem,
  BundlerOverview,
  ExecutionContext,
  Project,
} from '@dev-dashboard/contracts';

import {
  buildDevContainerWorkspaceCommand,
  isValidDevContainerRuntimeId,
} from './dev-container-exec-adapter.js';

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr?: string }>;

const execFileAsync = promisify(execFile);
const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    timeout: 45_000,
    windowsHide: true,
  });
  return { stdout, stderr };
};

const OUTPUT_LIMIT = 262_144;

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function hasGemfile(project: Project): Promise<boolean> {
  return (
    project.type === 'rails' &&
    (await pathExists(path.join(project.path, 'Gemfile')))
  );
}

const OUTDATED_LINE = /^\s*\*\s*(\S+)\s*\(([^)]*)\)/;

function parseOutdated(output: string): BundlerOutdatedGem[] {
  const gems: BundlerOutdatedGem[] = [];

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(OUTDATED_LINE);
    if (!match) continue;
    const [, name, details] = match;
    const newest = details?.match(/newest\s+([^,]+)/i)?.[1]?.trim();
    const installed = details?.match(/installed\s+([^,]+)/i)?.[1]?.trim();
    const requested = details?.match(/requested\s+([^,]+)/i)?.[1]?.trim();
    if (!name || !newest || !installed) continue;
    gems.push({ name, newest, installed, ...(requested ? { requested } : {}) });
  }

  return gems;
}

function maskAndTrim(raw: string): string {
  const trimmed = raw.length > OUTPUT_LIMIT ? raw.slice(0, OUTPUT_LIMIT) : raw;
  return maskSensitiveLogContent(trimmed).content.trim();
}

async function runCapture(
  runner: CommandRunner,
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; failed: boolean }> {
  try {
    const { stdout, stderr } = await runner(command, args, { cwd });
    return { stdout, stderr: stderr ?? '', failed: false };
  } catch (error) {
    const failure = error as {
      stdout?: unknown;
      stderr?: unknown;
      message?: unknown;
    };
    return {
      stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
      stderr:
        typeof failure.stderr === 'string'
          ? failure.stderr
          : typeof failure.message === 'string'
            ? failure.message
            : '',
      failed: true,
    };
  }
}

export class BundlerInspectionService {
  public constructor(
    private readonly runCommand: CommandRunner = defaultCommandRunner,
  ) {}

  public async getOverview(
    project: Project,
    executionContext?: ExecutionContext,
  ): Promise<BundlerOverview> {
    const scopedProject = executionContext
      ? { ...project, path: executionContext.cwd }
      : project;
    if (!(await hasGemfile(scopedProject))) {
      return { supported: false, outdated: [] };
    }

    let command = 'bundle';
    const commandArgs = (args: string[]): string[] => args;
    let wrapArgs = commandArgs;

    if (executionContext?.runtime === 'devcontainer') {
      if (!isValidDevContainerRuntimeId(executionContext.runtimeId)) {
        return {
          supported: true,
          check: {
            satisfied: false,
            message:
              'O Dev Container selecionado não possui identidade executável válida.',
          },
          outdated: [],
        };
      }
      const runtimeId = executionContext.runtimeId;
      command = 'devcontainer';
      wrapArgs = (args) => [
        ...buildDevContainerWorkspaceCommand({
          runtimeId,
          workspaceFolder: executionContext.cwd,
          command: 'bundle',
          args,
        }).args,
      ];
    }

    const check = await runCapture(
      this.runCommand,
      command,
      wrapArgs(['check']),
      scopedProject.path,
    );
    const outdated = await runCapture(
      this.runCommand,
      command,
      wrapArgs(['outdated']),
      scopedProject.path,
    );

    return {
      supported: true,
      check: {
        satisfied: !check.failed,
        message: maskAndTrim(
          [check.stdout, check.stderr].filter(Boolean).join('\n'),
        ),
      },
      outdated: parseOutdated(outdated.stdout),
    };
  }
}
