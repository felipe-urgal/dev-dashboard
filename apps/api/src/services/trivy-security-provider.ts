import { execFile } from 'node:child_process';

import type { Project } from '@dev-dashboard/contracts';

import type {
  SecurityScanExecution,
  SecurityScannerAvailability,
  SecurityScannerProvider,
} from './security-scanner-provider.js';
import {
  parseTrivySecurityReport,
  type SecurityScanResult,
} from './trivy-security-scanner.js';

const COMMAND_TIMEOUT_MS = 60_000;
const COMMAND_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const VERSION_MAX_LENGTH = 64;

interface TrivyCommand {
  program: 'trivy';
  args: string[];
}

interface TrivyCommandOptions {
  cwd?: string;
  timeoutMs: number;
  maxBufferBytes: number;
}

export type TrivyCommandRunner = (
  command: TrivyCommand,
  options: TrivyCommandOptions,
) => Promise<string>;

function defaultCommandRunner(
  command: TrivyCommand,
  options: TrivyCommandOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command.program,
      command.args,
      {
        ...(options.cwd ? { cwd: options.cwd } : {}),
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

function commandMissing(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT',
  );
}

function parseVersion(stdout: string): string | undefined {
  const firstLine = stdout.split(/\r?\n/u)[0]?.trim() ?? '';
  const match = firstLine.match(/^Version:\s*([^\s]{1,64})$/u);
  return match?.[1]?.slice(0, VERSION_MAX_LENGTH);
}

function scanCommand(): TrivyCommand {
  return {
    program: 'trivy',
    args: [
      'fs',
      '--format',
      'json',
      '--scanners',
      'secret,misconfig',
      '--no-progress',
      '--skip-dirs',
      'node_modules',
      '--skip-dirs',
      'dist',
      '--skip-dirs',
      'build',
      '--skip-dirs',
      'coverage',
      '.',
    ],
  };
}

export class TrivySecurityProvider
  implements SecurityScannerProvider<SecurityScanResult>
{
  public readonly id = 'trivy';

  public constructor(
    private readonly runCommand: TrivyCommandRunner = defaultCommandRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async availability(): Promise<SecurityScannerAvailability> {
    const observedAt = this.now().toISOString();
    try {
      const stdout = await this.runCommand(
        { program: 'trivy', args: ['--version'] },
        {
          timeoutMs: 5_000,
          maxBufferBytes: 64 * 1024,
        },
      );
      const version = parseVersion(stdout);
      return {
        state: 'available',
        observedAt,
        ...(version ? { version } : {}),
      };
    } catch (error) {
      return {
        state: commandMissing(error) ? 'missing' : 'unavailable',
        observedAt,
        diagnostic: commandMissing(error)
          ? 'Trivy não está instalado ou não está disponível no PATH da API.'
          : 'Não foi possível verificar a disponibilidade do Trivy.',
      };
    }
  }

  public async scan(project: Project): Promise<SecurityScanExecution<SecurityScanResult>> {
    const observedAt = this.now().toISOString();
    let stdout: string;
    try {
      stdout = await this.runCommand(scanCommand(), {
        cwd: project.path,
        timeoutMs: COMMAND_TIMEOUT_MS,
        maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
      });
    } catch (error) {
      return {
        state: 'failed',
        observedAt,
        diagnostic: commandMissing(error)
          ? 'Trivy não está instalado ou não está disponível no PATH da API.'
          : 'O scan de segurança não pôde ser concluído.',
      };
    }

    if (Buffer.byteLength(stdout, 'utf8') > COMMAND_MAX_BUFFER_BYTES) {
      return {
        state: 'invalid-output',
        observedAt,
        diagnostic: 'A saída estruturada do Trivy excedeu o limite permitido.',
      };
    }

    try {
      const payload = JSON.parse(stdout) as unknown;
      return {
        state: 'completed',
        observedAt,
        result: parseTrivySecurityReport(payload, observedAt),
      };
    } catch {
      return {
        state: 'invalid-output',
        observedAt,
        diagnostic: 'Trivy retornou um relatório estruturado inválido.',
      };
    }
  }
}
